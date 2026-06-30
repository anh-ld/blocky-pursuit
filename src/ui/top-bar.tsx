import { gameState, survivalTime, actions, playerName } from "../state";
import { Hud } from "./hud";
import { useState } from "preact/hooks";
import { computed } from "@preact/signals";
import { IconPlay, IconPause } from "./icons";

/* Hard-edged square avatar — readable, no gradient, no rounded shape. Color = brand chip. */
function Avatar() {
  const name = playerName.value;
  const [open, setOpen] = useState(false);
  const initial = name ? name[0].toUpperCase() : "?";

  return (
    <div class="relative flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onTouchStart={() => setOpen(true)}
        onTouchEnd={() => setOpen(false)}
        aria-label={`Player: ${name}`}
        class="w-7 h-7 flex items-center justify-center text-black font-mono-ui text-[11px] font-bold select-none cursor-pointer"
        style={{ background: "var(--amber)" }}
      >
        {initial}
      </button>
      {open && (
        <div class="absolute top-9 right-0 pixel-panel px-3 py-1.5 text-[var(--text)] font-mono-ui text-xs whitespace-nowrap z-50">
          {name || "Anonymous"}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}:${ms.toString().padStart(2, "0")}`;
}

/* computed text-binding, NOT .value in body — else 60fps TopBar re-render dupes the bar into #app on hit */
const survivalDisplay = computed(() => formatTime(survivalTime.value));

export function TopBar() {
  const state = gameState.value;
  const playing = state === "playing";
  const paused = state === "paused";
  const over = state === "gameover";
  const start = state === "start";

  return (
    <div class="flex flex-nowrap items-center justify-between gap-2 px-2.5 sm:px-3 h-9 min-h-9 bg-[var(--bg-1)] border-b-2 border-[var(--line)] shrink-0">
      <div class="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 overflow-hidden">
        {start ? (
          <h1
            class="font-pixel text-[var(--amber)] text-[10px] sm:text-xs leading-none whitespace-nowrap"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            BLOCKY PURSUIT
          </h1>
        ) : (
          <>
            <Hud />
            {(playing || paused || over) && (
              <div class="font-mono-ui text-[var(--text-dim)] text-[11px] font-medium tabular-nums hidden sm:block shrink-0">
                {survivalDisplay}
              </div>
            )}
          </>
        )}
      </div>
      <div class="flex items-center gap-1.5 shrink-0">
        {(playing || paused) && (
          <button
            aria-label={paused ? "Resume" : "Pause"}
            onClick={() => actions.togglePause()}
            class="w-7 h-7 flex items-center justify-center text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors cursor-pointer"
          >
            {paused ? <IconPlay size={12} /> : <IconPause size={12} />}
          </button>
        )}
        <Avatar />
      </div>
    </div>
  );
}
