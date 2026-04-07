import { gameState, survivalTime, actions, playerName } from "../state";
import { Hud } from "./hud";
import { useState } from "preact/hooks";

function nameToGradient(name: string): string {
  let h1 = 0, h2 = 0;
  for (let i = 0; i < name.length; i++) {
    const c = name.charCodeAt(i);
    if (i % 2 === 0) h1 = (h1 + c * 37) % 360;
    else h2 = (h2 + c * 53) % 360;
  }
  h2 = (h1 + 120 + (h2 % 100)) % 360;
  return `linear-gradient(135deg, hsl(${h1},100%,65%), hsl(${h2},95%,55%))`;
}

function Avatar() {
  const name = playerName.value;
  const [open, setOpen] = useState(false);
  const initial = name ? name[0].toUpperCase() : "?";
  const gradient = nameToGradient(name || "?");

  return (
    <div class="relative flex items-center">
      <button
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onTouchStart={() => setOpen(true)}
        onTouchEnd={() => setOpen(false)}
        aria-label={`Player: ${name}`}
        class="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium cursor-pointer shrink-0 select-none"
        style={{ background: gradient }}
      >
        {initial}
      </button>
      {open && (
        <div class="absolute top-10 right-0 bg-gray-900 border border-gray-700 px-3 py-1.5 text-gray-200 text-xs font-semibold whitespace-nowrap z-50">
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

export function TopBar() {
  const state = gameState.value;
  const playing = state === "playing";
  const paused = state === "paused";
  const over = state === "gameover";
  const start = state === "start";

  return (
    <div class="flex flex-wrap gap-2 items-center justify-between px-5 h-13 bg-gray-900 shrink-0">
      <div class="flex items-center gap-2">
        {start && (
          <h1 class="text-orange-500 text-lg font-extrabold uppercase tracking-widest m-0 leading-none">
            blocky pursuit
          </h1>
        )}
        {(playing || paused || over) && <Hud />}
        {(playing || paused || over) && (
          <div class="text-gray-400 text-xs font-semibold tracking-widest">
            {formatTime(survivalTime.value)}
          </div>
        )}
      </div>
      <div class="flex items-center gap-2">
        {(playing || paused) && (
          <button
            aria-label={paused ? "Resume" : "Pause"}
            onClick={() => actions.togglePause()}
            class="w-8 h-8 text-amber-400 cursor-pointer flex items-center justify-center"
          >
            {paused ? (
              <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                <path d="M2 1 L10 6 L2 11 Z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 12 12" fill="currentColor">
                <rect x="2" y="1" width="3" height="10" />
                <rect x="7" y="1" width="3" height="10" />
              </svg>
            )}
          </button>
        )}
        <Avatar />
      </div>
    </div>
  );
}
