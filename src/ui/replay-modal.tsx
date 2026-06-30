import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";

/** URL of the recording currently being replayed */
export const replayUrl = signal<string | null>(null);

const SPEEDS = [1, 2, 3] as const;
type ISpeed = (typeof SPEEDS)[number];

/** ReplayModal — video overlay on play-click from leaderboard. Default 2× — 2-min run at 1× is boring. */
export function ReplayModal() {
  const url = replayUrl.value;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<ISpeed>(2);

  /* playbackRate is a DOM property, not an attribute — set on element directly when speed or clip changes. */
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, url]);

  /* ESC closes modal. Listener only mounted while clip is open — never interferes with gameplay keys. */
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
        <button onClick={close} class="absolute -top-8 right-0 text-gray-300 hover:text-white text-sm font-bold">
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
                s === speed ? "bg-cyan-500 text-black" : "bg-gray-700 text-gray-300 hover:bg-gray-600"
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
