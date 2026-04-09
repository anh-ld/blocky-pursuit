import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

type IScoreEntry = {
  name: string;
  score: number;
  ts: number;
};

export default async function handler(_req: Request, _context: Context) {
  const store = getStore("leaderboard");
  const raw = await store.get("top-scores", { type: "json" }) as IScoreEntry[] | null;
  const entries: IScoreEntry[] = raw ?? [];

  // Return up to 50 — the UI displays the top 10 but the client uses
  // entry #50 as the "would my recording qualify for upload" threshold.
  return Response.json(entries.slice(0, 50));
}
