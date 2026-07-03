import { gameState, audioMuted, actions, weather, selectedSkin, playerName } from "../state";
import { WEATHERS } from "../world/weather";
import { getSkin } from "../entities/car-skins";
import { IconSound, IconSoundOff } from "./icons";

/* HUD bottom-right: player name, car, weather, sound, controls. Flat chips stacked horizontally, no boxes. */
export function ControlsGuide() {
  const state = gameState.value;
  if (state !== "playing" && state !== "paused") return null;
  const muted = audioMuted.value;
  const currentWeather = weather.value;
  const skin = getSkin(selectedSkin.value);
  const name = playerName.value;
  const bodyHex = `#${skin.bodyColor.toString(16).padStart(6, "0")}`;

  return (
    <div class={`self-end mb-3 mr-3 gap-1.5 flex-wrap justify-end ${state === "paused" ? "flex" : "hidden md:flex"}`}>
      <Chip>
        <span class="font-mono-ui text-[10px] text-[var(--text)] truncate max-w-24">{name}</span>
      </Chip>
      <Chip>
        <span class="inline-block w-2.5 h-2.5" style={{ background: bodyHex }} aria-hidden />
        <span class="font-mono-ui text-[10px] text-[var(--text)] truncate max-w-24">{skin.name}</span>
      </Chip>
      <div class="flex items-stretch h-7">
        {WEATHERS.map((w) => {
          const active = currentWeather === w.id;

          return (
            <button
              key={w.id}
              aria-label={w.label}
              title={w.label}
              onClick={() => actions.setWeather(w.id)}
              class={`w-7 h-7 flex items-center justify-center text-sm cursor-pointer border-2 border-[var(--line)] -ml-px first:ml-0 ${
                active
                  ? "bg-[var(--amber)] text-[#000] border-[var(--amber)] z-10 relative"
                  : "bg-[var(--bg-1)] text-[var(--text-dim)] hover:text-[var(--text)] hover:border-[var(--line-2)]"
              }`}
            >
              {w.icon}
            </button>
          );
        })}
      </div>
      <button
        aria-label={muted ? "Unmute sound" : "Mute sound"}
        onClick={() => actions.toggleSound()}
        class={`h-7 px-2 flex items-center justify-center cursor-pointer border-2 border-[var(--line)] ${
          muted
            ? "bg-[var(--bg-1)] text-[var(--text-mute)]"
            : "bg-[var(--bg-1)] text-[var(--amber)] hover:border-[var(--line-2)]"
        }`}
      >
        {muted ? <IconSoundOff size={12} /> : <IconSound size={12} />}
      </button>
      <Chip>
        <div class="flex gap-0.5 items-center">
          <Key>A</Key>
          <Key>D</Key>
        </div>
        <span class="font-mono-ui text-[9px] text-[var(--text-mute)] uppercase tracking-widest ml-1">steer</span>
      </Chip>
    </div>
  );
}

function Chip({ children }: { children: preact.ComponentChildren }) {
  return (
    <div class="h-7 px-2 bg-[var(--bg-1)] border-2 border-[var(--line)] flex items-center gap-1.5">{children}</div>
  );
}

function Key({ children }: { children: preact.ComponentChildren }) {
  return (
    <span class="font-pixel text-[8px] text-[var(--text)] bg-[var(--bg-3)] border border-[var(--line-2)] w-4 h-4 flex items-center justify-center leading-none">
      {children}
    </span>
  );
}
