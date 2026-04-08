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
};

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const [parseErr, body] = await attemptAsync(
    () => req.json() as Promise<{ name: string; score: number }>,
  );
  if (parseErr || !body) return new Response("Bad request", { status: 400 });

  const { name, score } = body;
  if (!name || !Number.isFinite(score) || score <= 0 || score > MAX_SCORE) {
    return new Response("Invalid payload", { status: 400 });
  }

  const newEntry: IScoreEntry = {
    name: String(name).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, ""),
    score: Math.floor(score),
    ts: Date.now(),
  };

  const store = getStore("leaderboard");

  // Compare-and-swap loop: re-read and retry if another invocation wrote first.
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const result = await store.getWithMetadata("top-scores", { type: "json" });
    const entries: IScoreEntry[] = (result?.data as IScoreEntry[] | undefined) ?? [];
    const etag = result?.etag;

    entries.push(newEntry);
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
