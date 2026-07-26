import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
};

export default async function handler(_req: Request, _context: Context) {
  const store = getStore("leaderboard");
  const raw = (await store.get("top-scores", { type: "json" })) as IScoreEntry[] | null;
  const entries: IScoreEntry[] = raw ?? [];

  /* Return 50 — the UI shows 10, the client uses entry #50 as the replay-upload threshold. */
  return Response.json(entries.slice(0, 50));
}
