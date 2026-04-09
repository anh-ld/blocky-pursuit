import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

/**
 * Upload a finished recording for a top-50 score. Single-shot POST
 * called from `gameOver` once. The submitted (sessionId, name, score)
 * must already exist in the stored top-50 leaderboard array — that's
 * how we gate uploads. Anything that didn't make the cut returns 403
 * and the client never even tries.
 */

const MAX_RECORDING_SIZE = 25 * 1024 * 1024;
const MAX_SCORE = 500_000;
const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;
const SCORE_RE = /^\d{1,7}$/;
const MAX_RETRIES = 5;
// Recordings are stored for any run that lands in the top 50, not
// just the displayed top 10 — gives a deeper replay archive without
// the overhead of streaming uploads.
const QUALIFY_BOARD_SIZE = 50;

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
  sessionId?: string;
  recordingUrl?: string;
};

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const formData = await req.formData();
  const recording = formData.get("recording") as Blob | null;
  const sessionId = formData.get("sessionId") as string | null;
  const playerName = formData.get("playerName") as string | null;
  const score = formData.get("score") as string | null;

  if (!recording || !sessionId || !playerName || !score) {
    return new Response("Missing required fields", { status: 400 });
  }
  if (!SESSION_ID_RE.test(sessionId)) {
    return new Response("Invalid sessionId", { status: 400 });
  }
  if (!SCORE_RE.test(score)) {
    return new Response("Invalid score", { status: 400 });
  }
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore) || numericScore <= 0 || numericScore > MAX_SCORE) {
    return new Response("Invalid score", { status: 400 });
  }
  if (recording.size > MAX_RECORDING_SIZE) {
    return new Response("Recording too large", { status: 413 });
  }

  const store = getStore("leaderboard");
  const safeName = String(playerName).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");
  const flooredScore = Math.floor(numericScore);

  // Server-side gate: the score entry must already exist in the top-50
  // array (submit-score runs first) and must not already have a replay.
  const firstRead = await store.getWithMetadata("top-scores", { type: "json" });
  const firstEntries: IScoreEntry[] = (firstRead?.data as IScoreEntry[] | undefined) ?? [];
  const candidateIndex = firstEntries.findIndex(
    (e) => e.sessionId === sessionId && e.name === safeName && e.score === flooredScore,
  );
  if (candidateIndex < 0) {
    // Dump what we expected vs what we found so the client log is actionable.
    const sessionMatch = firstEntries.find((e) => e.sessionId === sessionId);
    const debug = {
      expected: { sessionId, name: safeName, score: flooredScore },
      totalEntries: firstEntries.length,
      entryForSession: sessionMatch
        ? { name: sessionMatch.name, score: sessionMatch.score }
        : null,
      topScores: firstEntries.slice(0, 3).map((e) => ({
        name: e.name,
        score: e.score,
        sid: e.sessionId,
      })),
    };
    return new Response(
      `Score entry not found for session ${JSON.stringify(debug)}`,
      { status: 409 },
    );
  }
  if (candidateIndex >= QUALIFY_BOARD_SIZE) {
    return new Response("Score did not qualify for replay upload", { status: 403 });
  }
  if (firstEntries[candidateIndex]?.recordingUrl) {
    return new Response("Replay already uploaded for this session", { status: 409 });
  }

  // Allowlist MIME types to keep play-recording's Content-Type header safe.
  // Anything outside this set falls back to webm (the legacy default).
  const ALLOWED_MIMES = new Set([
    "video/mp4",
    "video/webm",
  ]);
  // recording.type is the full codec string (e.g. "video/mp4;codecs=avc1.42E01F").
  // We only need the container part for the response Content-Type.
  const containerType = (recording.type || "video/webm").split(";")[0]!.trim();
  const mimeType = ALLOWED_MIMES.has(containerType) ? containerType : "video/webm";

  const arrayBuffer = await recording.arrayBuffer();
  const videoBlob = new Blob([arrayBuffer], { type: mimeType });
  // Never trust client-provided IDs for storage keys; generate server-side.
  // The .webm extension is just an internal storage convention — playback
  // uses the Content-Type from metadata, not the URL extension.
  const blobKey = `recordings/${Date.now()}-${crypto.randomUUID()}.webm`;
  const recordingUrl = `/.netlify/functions/play-recording?key=${encodeURIComponent(blobKey)}`;

  await store.set(blobKey, videoBlob, {
    metadata: {
      playerName: safeName,
      score: String(flooredScore),
      sessionId,
      uploadedAt: Date.now().toString(),
      size: recording.size.toString(),
      mimeType,
    },
  });

  // Attach replay URL to the score entry via CAS retries.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await store.getWithMetadata("top-scores", { type: "json" });
    const entries: IScoreEntry[] = (result?.data as IScoreEntry[] | undefined) ?? [];
    const etag = result?.etag;

    const idx = entries.findIndex(
      (e) => e.sessionId === sessionId && e.name === safeName && e.score === flooredScore,
    );
    if (idx < 0) break;
    if (idx >= QUALIFY_BOARD_SIZE) break;
    if (entries[idx]?.recordingUrl) {
      return Response.json({ ok: true, key: blobKey, url: entries[idx]!.recordingUrl });
    }

    entries[idx] = { ...entries[idx]!, recordingUrl };
    const { modified } = await store.setJSON(
      "top-scores",
      entries,
      etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
    );
    if (modified) {
      return Response.json({ ok: true, key: blobKey, url: recordingUrl });
    }
  }

  // Could not safely attach URL — clean up the orphan blob.
  await store.delete(blobKey);
  return new Response("Failed to attach replay to score", { status: 409 });
}
