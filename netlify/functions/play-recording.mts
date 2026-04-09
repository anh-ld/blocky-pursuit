import { getStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";

/**
 * Streams a recording back from blob storage for playback.
 */
export default async function handler(req: Request, _context: Context) {
  const url = new URL(req.url);
  const key = url.searchParams.get("key");

  if (!key || !key.startsWith("recordings/") || !key.endsWith(".webm")) {
    return new Response("Invalid recording key", { status: 400 });
  }

  const store = getStore("leaderboard");

  try {
    const data = await store.get(key, { type: "arrayBuffer" });

    if (!data) {
      return new Response("Recording not found", { status: 404 });
    }

    return new Response(data as ArrayBuffer, {
      headers: {
        "Content-Type": "video/webm",
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response("Recording not found", { status: 404 });
  }
}
