import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

/**
 * Upload a finished recording for a top-50 score.
 *
 * Synchronous function (60 s Netlify timeout, 6 MB request body
 * limit). Client caps uploads at 5 MB so we stay under the edge
 * limit with 1 MB of headroom for HTTP overhead.
 *
 * Wire format: the recording is sent as the **raw request body**,
 * with `sessionId`, `playerName`, and `score` in the query string.
 * We deliberately avoid `multipart/form-data` because Netlify's sync
 * function runtime has been unreliable parsing binary multipart
 * bodies — it returned "Internal Error" 500s on a 2 MB blob without
 * even invoking our handler, so the try/catch couldn't surface the
 * real reason. Raw body + query params bypasses the multipart parser
 * entirely and matches the simpler Netlify Blobs upload pattern.
 *
 * Gate: the score entry must already exist in the stored top-50 array
 * (submit-score runs first). Matched by sessionId only — the name +
 * score match was causing 409s from tiny drift in either value, and
 * `submit-score` itself already uses sessionId as the sole idempotency
 * key, so we stay consistent.
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
  try {
    return await handleUpload(req);
  } catch (err) {
    // Surface the real reason for any 500 to the client log so we don't
    // have to tail Netlify function logs to debug upload crashes.
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[upload-recording] crashed:", err);
    return new Response(`Server error — ${msg}`, { status: 500 });
  }
}

async function handleUpload(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Metadata comes from the query string (small, easy to parse).
  const url = new URL(req.url);
  const sessionId = url.searchParams.get("sessionId");
  const playerName = url.searchParams.get("playerName");
  const score = url.searchParams.get("score");

  if (!sessionId || !playerName || !score) {
    return new Response("Missing required query params", { status: 400 });
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

  // The body IS the recording — no multipart wrapping.
  const recording = await req.blob();
  if (recording.size === 0) {
    return new Response("Empty recording body", { status: 400 });
  }
  if (recording.size > MAX_RECORDING_SIZE) {
    return new Response("Recording too large", { status: 413 });
  }

  // Strong consistency is REQUIRED here. By default Netlify Blobs is
  // eventually consistent — updates can take up to 60 seconds to
  // propagate across function instances. Since `submit-score` writes
  // the entry milliseconds before this function reads it (and the two
  // run on different Lambda instances), an eventually-consistent read
  // returns a stale snapshot WITHOUT the just-written entry, and the
  // sessionId lookup fails with 409 every time. `consistency: "strong"`
  // forces a single-region read that always sees the latest write.
  // See: https://docs.netlify.com/build/data-and-storage/netlify-blobs/#consistency
  const store = getStore({ name: "leaderboard", consistency: "strong" });
  const safeName = String(playerName).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");
  const flooredScore = Math.floor(numericScore);

  // Server-side gate: match the score entry BY SESSION ID ONLY.
  //
  // Previously we also required name+score to match, but that created a
  // foot-gun: if the player's name got regenerated or their score drifted
  // by even a single point between `submitScore` and `uploadRecording`,
  // the findIndex returned -1 and the upload failed with a 409. Since
  // `submit-score` itself already uses sessionId as the sole key for
  // idempotent updates, matching on sessionId here keeps both endpoints
  // consistent and makes the upload robust against any client-side
  // drift of the name/score fields.
  //
  // Abuse concern: sessionId is client-generated but unique per run
  // (timestamp + random). A malicious client can't forge another player's
  // sessionId without reading the blob directly (not exposed), and even
  // if they did, all they can do is overwrite their own future recording
  // uploads — no data escalation.
  const firstRead = await store.getWithMetadata("top-scores", { type: "json" });
  const firstEntries: IScoreEntry[] = (firstRead?.data as IScoreEntry[] | undefined) ?? [];
  const candidateIndex = firstEntries.findIndex((e) => e.sessionId === sessionId);
  if (candidateIndex < 0) {
    return new Response("Score entry not found for session", { status: 409 });
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

  // Never trust client-provided IDs for storage keys; generate server-side.
  // The .webm extension is just an internal storage convention — playback
  // uses the Content-Type from metadata, not the URL extension.
  const blobKey = `recordings/${Date.now()}-${crypto.randomUUID()}.webm`;
  const recordingUrl = `/.netlify/functions/play-recording?key=${encodeURIComponent(blobKey)}`;

  // Pass the Blob directly — skipping the arrayBuffer() + new Blob()
  // roundtrip halves the memory footprint and avoids a full copy of
  // several-MB payloads through the function heap.
  await store.set(blobKey, recording, {
    metadata: {
      playerName: safeName,
      score: String(flooredScore),
      sessionId,
      uploadedAt: Date.now().toString(),
      size: recording.size.toString(),
      mimeType,
    },
  });

  // Attach replay URL to the score entry via CAS retries. Match by
  // sessionId only — see the gate above for the rationale.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await store.getWithMetadata("top-scores", { type: "json" });
    const entries: IScoreEntry[] = (result?.data as IScoreEntry[] | undefined) ?? [];
    const etag = result?.etag;

    const idx = entries.findIndex((e) => e.sessionId === sessionId);
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
