import { getStore } from "@netlify/blobs";
import { attemptAsync } from "es-toolkit";
import type { Config } from "@netlify/edge-functions";

/**
 * Upload a finished recording for a top-50 score.
 *
 * Runs as an EDGE function (Deno isolate), not a sync Lambda. Sync
 * functions cap request bodies at ~4.5 MB binary (AWS Lambda Invoke
 * envelope limit, can't be raised). Edge gets a real streaming
 * Request and accepts uploads up to the client ceiling.
 *
 * Wire format: recording is the raw POST body, metadata is in the
 * query string. Multipart was avoided because the sync runtime had
 * a parser quirk that 500'd on binary multipart before reaching
 * user code; raw body is also lighter on the wire.
 */

const MAX_RECORDING_SIZE = 12 * 1024 * 1024;
const MAX_SCORE = 500_000;
const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;
const SCORE_RE = /^\d{1,7}$/;
const MAX_RETRIES = 5;
const QUALIFY_BOARD_SIZE = 50;
const ALLOWED_MIMES = new Set(["video/mp4", "video/webm"]);

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
  sessionId?: string;
  recordingUrl?: string;
};

export default async function handler(req: Request) {
  const [err, response] = await attemptAsync(() => handleUpload(req));
  if (err) {
    const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error("[upload-recording] crashed:", err);
    return new Response(`Server error — ${msg}`, { status: 500 });
  }
  return response;
}

async function handleUpload(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

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

  // Reject oversized uploads on the header before buffering the body
  // into the isolate heap.
  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RECORDING_SIZE) {
    return new Response("Recording too large", { status: 413 });
  }

  // Strong consistency: submit-score writes the entry milliseconds
  // before this read on a different instance. Default eventual reads
  // can take up to 60 s to see the write, which would 409 every time.
  const store = getStore({ name: "leaderboard", consistency: "strong" });

  // Body buffering and the gate read are independent — overlap them
  // to hide one RTT behind the upload.
  const [recording, gateRead] = await Promise.all([
    req.blob(),
    store.getWithMetadata("top-scores", { type: "json" }),
  ]);

  if (recording.size === 0) {
    return new Response("Empty recording body", { status: 400 });
  }
  if (recording.size > MAX_RECORDING_SIZE) {
    return new Response("Recording too large", { status: 413 });
  }

  // Gate by sessionId only. Name+score matching previously caused 409s
  // from tiny client-side drift; submit-score uses sessionId as its
  // sole idempotency key, so this stays consistent.
  const gateEntries: IScoreEntry[] = (gateRead?.data as IScoreEntry[] | undefined) ?? [];
  const candidateIndex = gateEntries.findIndex((e) => e.sessionId === sessionId);
  if (candidateIndex < 0) {
    return new Response("Score entry not found for session", { status: 409 });
  }
  if (candidateIndex >= QUALIFY_BOARD_SIZE) {
    return new Response("Score did not qualify for replay upload", { status: 403 });
  }
  if (gateEntries[candidateIndex]?.recordingUrl) {
    return new Response("Replay already uploaded for this session", { status: 409 });
  }

  // recording.type is the full codec string (e.g. "video/mp4;codecs=avc1.42E01F").
  // Strip parameters before checking the allowlist used by play-recording's
  // Content-Type header.
  const containerType = (recording.type || "video/webm").split(";")[0]!.trim();
  const mimeType = ALLOWED_MIMES.has(containerType) ? containerType : "video/webm";

  // Server-generated key — never trust client IDs for storage paths.
  const safeName = String(playerName).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");
  const flooredScore = Math.floor(numericScore);
  const blobKey = `recordings/${Date.now()}-${crypto.randomUUID()}.webm`;
  const recordingUrl = `/.netlify/functions/play-recording?key=${encodeURIComponent(blobKey)}`;

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

  // Seed the CAS loop with the gate read — store.set above writes a
  // different key, so the top-scores etag from the gate is still
  // valid for the first attempt. Saves one strong-consistency RTT.
  let read = gateRead;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const entries: IScoreEntry[] = (read?.data as IScoreEntry[] | undefined) ?? [];
    const etag = read?.etag;

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

    read = await store.getWithMetadata("top-scores", { type: "json" });
  }

  await store.delete(blobKey);
  return new Response("Failed to attach replay to score", { status: 409 });
}

export const config: Config = {
  path: "/api/upload-recording",
};
