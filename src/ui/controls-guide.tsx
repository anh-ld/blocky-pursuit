import { gameState, audioMuted, actions } from "../state";

export function ControlsGuide() {
  if (gameState.value !== "playing") return null;
  const muted = audioMuted.value;

  return (
    <div class="self-end mb-4 mr-4 flex items-center gap-2 hidden md:flex">
      <button
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onClick={() => actions.toggleSound()}
        class={`px-3 py-2 bg-black/50 text-sm leading-none cursor-pointer pointer-events-auto hover:text-amber-400 ${muted ? "text-gray-500 line-through" : "text-gray-300"}`}
      >
        ♪
      </button>
      <div class="px-4 py-2 bg-black/50 text-gray-300 text-xs font-normal tracking-wide flex items-center gap-2">
        <div class="flex gap-1">
          <span class="kbd-sm">A</span>
          <span class="kbd-sm">D</span>
        </div>
        <span class="text-gray-500">or</span>
        <span class="text-gray-400">← →</span>
        <span class="text-gray-400">to steer</span>
      </div>
    </div>
  );
}
