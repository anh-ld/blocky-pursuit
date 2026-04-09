import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
import { attemptAsync } from "es-toolkit";

// Generous ceiling — covers hours of perfect play; blocks obviously bogus submissions.
const MAX_SCORE = 500_000;
const MAX_RETRIES = 5;

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
  sessionId?: string;
  recordingUrl?: string;
};
const SESSION_ID_RE = /^[a-z0-9-]{8,64}$/;

function normalizeRecordingUrl(input: unknown): string | undefined {
  if (typeof input !== "string") return undefined;
  if (input.length === 0 || input.length > 500) return undefined;
  // Reject absolute/external URLs; only allow app-local function endpoint.
  if (!input.startsWith("/")) return undefined;

  const url = new URL(input, "http://local.test");
  if (url.pathname !== "/.netlify/functions/play-recording") return undefined;

  const key = url.searchParams.get("key");
  if (!key) return undefined;
  if (!/^recordings\/[a-zA-Z0-9._-]+\.webm$/.test(key)) return undefined;

  return `${url.pathname}?key=${encodeURIComponent(key)}`;
}

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const [parseErr, body] = await attemptAsync(
    () => req.json() as Promise<{ name: string; score: number; recordingUrl?: string; sessionId?: string }>,
  );
  if (parseErr || !body) return new Response("Bad request", { status: 400 });

  const { name, score, recordingUrl, sessionId } = body;
  if (!name || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE) {
    return new Response("Invalid payload", { status: 400 });
  }
  if (sessionId !== undefined && !SESSION_ID_RE.test(String(sessionId))) {
    return new Response("Invalid payload", { status: 400 });
  }

  const newEntry: IScoreEntry = {
    name: String(name).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, ""),
    score: Math.floor(score),
    ts: Date.now(),
  };
  if (sessionId) {
    newEntry.sessionId = sessionId;
  }

  // Attach recording URL only if it matches expected local replay endpoint.
  const normalizedRecordingUrl = normalizeRecordingUrl(recordingUrl);
  if (normalizedRecordingUrl) {
    newEntry.recordingUrl = normalizedRecordingUrl;
  }

  const store = getStore("leaderboard");

  // Compare-and-swap loop: re-read and retry if another invocation wrote first.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await store.getWithMetadata("top-scores", { type: "json" });
    const entries: IScoreEntry[] = (result?.data as IScoreEntry[] | undefined) ?? [];
    const etag = result?.etag;

    // Idempotent behavior for retries and two-step replay attachment:
    // if a session already exists, update it instead of creating duplicates.
    const existingIndex = sessionId
      ? entries.findIndex((e) => e.sessionId === sessionId)
      : -1;

    if (existingIndex >= 0) {
      const existing = entries[existingIndex]!;
      existing.name = newEntry.name;
      existing.score = newEntry.score;
      // Preserve existing timestamp so ranking order remains stable.
      if (normalizedRecordingUrl) {
        existing.recordingUrl = normalizedRecordingUrl;
      }
    } else {
      entries.push(newEntry);
    }

    // Keep top 50 (more than displayed, gives buffer)
    entries.sort((a, b) => b.score - a.score);
    entries.splice(50);

    // First-ever write has no etag — use onlyIfNew to avoid clobbering a racing creator.
    const { modified } = await store.setJSON(
      "top-scores",
      entries,
      etag ? { onlyIfMatch: etag } : { onlyIfNew: true },
    );

    if (modified) return Response.json({ ok: true });
    // Lost the race — re-read and retry.
  }

  return new Response("Conflict, please retry", { status: 409 });
}
