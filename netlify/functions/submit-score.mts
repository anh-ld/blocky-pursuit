import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
};

export default async function handler(req: Request, _context: Context) {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const { name, score } = (await req.json()) as { name: string; score: number };

    if (!name || typeof score !== "number" || score <= 0) {
      return new Response("Invalid payload", { status: 400 });
    }

    const sanitizedName = String(name).slice(0, 20).replace(/[^a-zA-Z0-9 _-]/g, "");

    const store = getStore("leaderboard");
    const raw = await store.get("top-scores", { type: "json" }) as IScoreEntry[] | null;
    const entries: IScoreEntry[] = raw ?? [];

    entries.push({ name: sanitizedName, score: Math.floor(score), ts: Date.now() });

    // Keep top 50 (more than displayed, gives buffer)
    entries.sort((a, b) => b.score - a.score);
    entries.splice(50);

    await store.setJSON("top-scores", entries);

    return Response.json({ ok: true });
  } catch {
    return new Response("Bad request", { status: 400 });
  }
}
