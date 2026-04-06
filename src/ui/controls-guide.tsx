import { gameState, audioMuted, actions, weather, selectedSkin, playerName } from "../state";
import { WEATHERS } from "../world/weather";
import { getSkin } from "../entities/car-skins";

export function ControlsGuide() {
  const state = gameState.value;
  if (state !== "playing" && state !== "paused") return null;
  const muted = audioMuted.value;
  const currentWeather = weather.value;
  const skin = getSkin(selectedSkin.value);
  const name = playerName.value;

  return (
    <div class={`self-end mb-4 mr-4 items-stretch gap-2 flex-wrap justify-end ${state === "paused" ? "flex" : "hidden md:flex"}`}>
      <div class="h-9 px-3 bg-black/50 text-xs font-normal tracking-wide flex items-center">
        <span class="text-gray-300">{name}</span>
      </div>
      <div class="h-9 px-3 bg-black/50 text-xs font-normal tracking-wide flex items-center">
        <span style={{ color: `#${skin.bodyColor.toString(16).padStart(6, "0")}` }}>
          {skin.name}
        </span>
      </div>
      <div class="h-9 flex items-stretch bg-black/50 pointer-events-auto">
        {WEATHERS.map((w) => {
          const active = currentWeather === w.id;
          return (
            <button
              key={w.id}
              aria-label={w.label}
              title={w.label}
              onClick={() => actions.setWeather(w.id)}
              class={`px-3 text-sm leading-none cursor-pointer flex items-center justify-center ${active ? "bg-amber-500/30 text-amber-300" : "text-gray-400 hover:text-amber-400"}`}
            >
              {w.icon}
            </button>
          );
        })}
      </div>
      <button
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onClick={() => actions.toggleSound()}
        class={`h-9 px-4 bg-black/50 text-sm leading-none cursor-pointer pointer-events-auto hover:text-amber-400 flex items-center justify-center ${muted ? "text-gray-500 line-through" : "text-gray-300"}`}
      >
        ♪
      </button>
      <div class="h-9 px-4 bg-black/50 text-gray-300 text-xs font-normal tracking-wide hidden md:flex items-center gap-2">
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
