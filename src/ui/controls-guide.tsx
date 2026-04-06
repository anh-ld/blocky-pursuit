import { gameState } from "../state";

export function ControlsGuide() {
  if (gameState.value !== "playing") return null;

  return (
    <div class="self-end px-4 py-2 mb-4 mr-4 bg-black/50 text-gray-300 text-xs font-normal tracking-wide hidden md:flex items-center gap-2">
      <div class="flex gap-1">
        <span class="kbd-sm">A</span>
        <span class="kbd-sm">D</span>
      </div>
      <span class="text-gray-500">or</span>
      <span class="text-gray-400">← →</span>
      <span class="text-gray-400">to steer</span>
    </div>
  );
}
