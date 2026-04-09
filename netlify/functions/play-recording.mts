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
    const result = await store.getWithMetadata(key, { type: "arrayBuffer" });
    if (!result?.data) {
      return new Response("Recording not found", { status: 404 });
    }
    // Newer recordings are MP4/H.264 (HW encoded). Older ones are webm.
    // The actual container is stored in metadata; default to webm so
    // legacy uploads keep working.
    const stored = result.metadata?.mimeType;
    const mimeType =
      stored === "video/mp4" || stored === "video/webm" ? stored : "video/webm";

    return new Response(result.data as ArrayBuffer, {
      headers: {
        "Content-Type": mimeType,
        "Cache-Control": "public, max-age=31536000, immutable",
        "Accept-Ranges": "bytes",
      },
    });
  } catch {
    return new Response("Recording not found", { status: 404 });
  }
}
