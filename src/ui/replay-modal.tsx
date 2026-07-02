import { signal } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { IconClose } from "./icons";

export const replayUrl = signal<string | null>(null);

const SPEEDS = [1, 2, 3] as const;
type ISpeed = (typeof SPEEDS)[number];

export function ReplayModal() {
  const url = replayUrl.value;
  const videoRef = useRef<HTMLVideoElement>(null);
  const [speed, setSpeed] = useState<ISpeed>(2);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed, url]);

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
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/85">
      <div class="w-full max-w-[92vw] md:w-[768px] flex flex-col items-end gap-2">
        <button onClick={close} class="arcade-btn arcade-btn-sm arcade-btn-ghost" aria-label="Close replay">
          <IconClose size={12} />
          Close
        </button>
        <video
          ref={videoRef}
          src={url}
          controls
          autoplay
          playsinline
          class="w-full block border-2 border-[var(--line-2)]"
          style={{ maxHeight: "75vh" }}
        />
        <div class="flex items-center gap-1 self-center">
          <span class="font-mono-ui text-[9px] text-[var(--text-mute)] uppercase tracking-widest mr-1">Speed</span>
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              class={`arcade-btn arcade-btn-sm ${s === speed ? "" : "arcade-btn-ghost"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
