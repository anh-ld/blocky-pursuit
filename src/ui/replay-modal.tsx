import { signal } from "@preact/signals";
import { REPLAY_PLAYBACK_RATE } from "../systems/screen-recorder";

/** URL of the recording currently being replayed */
export const replayUrl = signal<string | null>(null);

/**
 * ReplayModal — overlays a video player on top of the game when the user
 * clicks the play button on a leaderboard entry.
 */
export function ReplayModal() {
  const url = replayUrl.value;
  if (!url) return null;

  const close = () => {
    replayUrl.value = null;
  };

  return (
    <div class="absolute inset-0 z-50 flex items-center justify-center bg-black/80">
      <div class="relative w-full max-w-[90vw] max-h-[80vh] md:w-[640px]">
        {/* Close button */}
        <button
          onClick={close}
          class="absolute -top-8 right-0 text-gray-300 hover:text-white text-sm font-bold"
        >
          ✕ CLOSE
        </button>

        {/* Video player — recordings are captured at a low FPS and played
            back at REPLAY_PLAYBACK_RATE× so each frame carries more bits
            (sharper) while the visual still reads as smooth motion. */}
        <video
          src={url}
          controls
          autoplay
          class="w-full rounded-lg border-2 border-gray-600"
          style={{ maxHeight: "80vh" }}
          onLoadedMetadata={(e) => {
            (e.currentTarget as HTMLVideoElement).playbackRate = REPLAY_PLAYBACK_RATE;
          }}
        />
      </div>
    </div>
  );
}
