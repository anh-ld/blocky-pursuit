import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

// Keep replay uploads bounded to reduce storage abuse impact.
const MAX_RECORDING_SIZE = 25 * 1024 * 1024;
const MAX_SCORE = 500_000;
const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;
const SCORE_RE = /^\d{1,7}$/;
const MAX_RETRIES = 5;
const TOP_BOARD_SIZE = 10;

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

  // Validate recording size
  if (recording.size > MAX_RECORDING_SIZE) {
    return new Response("Recording too large", { status: 413 });
  }

  const store = getStore("leaderboard");
  const safeName = String(playerName).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");
  const flooredScore = Math.floor(numericScore);

  // Server-side gate: allow upload only for an existing top-board score entry
  // of the same session/name/score and only once per session.
  const firstRead = await store.getWithMetadata("top-scores", { type: "json" });
  const firstEntries: IScoreEntry[] = (firstRead?.data as IScoreEntry[] | undefined) ?? [];
  const candidateIndex = firstEntries.findIndex((e) =>
    e.sessionId === sessionId &&
    e.name === safeName &&
    e.score === flooredScore
  );
  if (candidateIndex < 0) {
    return new Response("Score entry not found for session", { status: 409 });
  }
  if (candidateIndex >= TOP_BOARD_SIZE) {
    return new Response("Score did not qualify for replay upload", { status: 403 });
  }
  if (firstEntries[candidateIndex]?.recordingUrl) {
    return new Response("Replay already uploaded for this session", { status: 409 });
  }

  const arrayBuffer = await recording.arrayBuffer();
  const videoBlob = new Blob([arrayBuffer], { type: "video/webm" });
  // Never trust client-provided IDs for storage keys; generate server-side.
  const blobKey = `recordings/${Date.now()}-${crypto.randomUUID()}.webm`;
  const recordingUrl = `/.netlify/functions/play-recording?key=${encodeURIComponent(blobKey)}`;

  // Upload blob first.
  await store.set(blobKey, videoBlob, {
    metadata: {
      playerName: safeName,
      score: String(flooredScore),
      sessionId,
      uploadedAt: Date.now().toString(),
      size: recording.size.toString(),
    },
  });

  // Attach replay URL to the existing score entry via CAS retries.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await store.getWithMetadata("top-scores", { type: "json" });
    const entries: IScoreEntry[] = (result?.data as IScoreEntry[] | undefined) ?? [];
    const etag = result?.etag;

    const idx = entries.findIndex((e) =>
      e.sessionId === sessionId &&
      e.name === safeName &&
      e.score === flooredScore
    );
    if (idx < 0) {
      break;
    }
    if (idx >= TOP_BOARD_SIZE) {
      break;
    }
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

  // Could not safely attach URL to score entry — remove blob to avoid orphan.
  await store.delete(blobKey);
  return new Response("Failed to attach replay to score", { status: 409 });
}
