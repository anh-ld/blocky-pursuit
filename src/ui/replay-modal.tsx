import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";

/** URL of the recording currently being replayed */
export const replayUrl = signal<string | null>(null);

const SPEEDS = [1, 2, 3] as const;
type ISpeed = (typeof SPEEDS)[number];

/**
 * ReplayModal — overlays a video player on top of the game when the user
 * clicks the play button on a leaderboard entry. Defaults to 2× because
 * watching a full 2-minute run at real time is boring.
 */
export function ReplayModal() {
  const url = replayUrl.value;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<ISpeed>(2);

  // playbackRate is a DOM property, not an attribute — set it on the
  // element directly whenever the speed changes or a new clip loads.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, url]);

  // ESC closes the modal. Listener is only mounted while a clip is
  // open so it never interferes with normal gameplay key handling.
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        replayUrl.value = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [url]);

  if (!url) return null;

  const close = () => {
    replayUrl.value = null;
  };

  return (
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="relative w-full max-w-[90vw] max-h-[80vh] md:w-[768px]">
        <button
          onClick={close}
          class="absolute -top-8 right-0 text-gray-300 hover:text-white text-sm font-bold"
        >
          ✕ CLOSE
        </button>

        <video
          ref={videoRef}
          src={url}
          controls
          autoplay
          playsinline
          class="w-full rounded-lg border-2 border-gray-600"
          style={{ maxHeight: "80vh" }}
        />

        <div class="mt-2 flex items-center justify-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              class={`text-[11px] font-bold px-2 py-1 rounded tabular-nums ${
                s === speed
                  ? "bg-cyan-500 text-black"
                  : "bg-gray-700 text-gray-300 hover:bg-gray-600"
              }`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
