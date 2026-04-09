// Cop-radio HUD overlay. Renders the rolling chatter feed pushed by
// `world/radio.ts`. Lines fade in via CSS animation and are removed by the
// emitter's setTimeout, so this component stays purely declarative.

import { radioLines, type IRadioLine } from "../world/radio";
import { gameState } from "../state";

const VOICE_COLORS: Record<IRadioLine["voice"], string> = {
  dispatch: "text-amber-300",
  unit: "text-cyan-300",
  swat: "text-red-400",
};

const VOICE_LABELS: Record<IRadioLine["voice"], string> = {
  dispatch: "DISPATCH",
  unit: "UNIT",
  swat: "SWAT",
};

export function Radio() {
  // Hide entirely when not in a run — keeps the menu screens clean and
  // prevents leftover lines from a previous run flashing on the start panel.
  const state = gameState.value;
  if (state !== "playing" && state !== "paused") return null;
  const lines = radioLines.value;
  if (lines.length === 0) return null;

  return (
    // Bottom-center placement — sits above the mobile control buttons but
    // well clear of the HUD chips at the top of the screen. Centered so
    // the eye doesn't have to skim a corner to read the dispatcher.
    <div class="absolute left-1/2 -translate-x-1/2 bottom-24 sm:bottom-20 z-10 pointer-events-none flex flex-col items-center gap-1 w-[min(92vw,520px)]">
      {lines.map((l) => (
        <div
          key={l.id}
          class="flex items-center gap-2 bg-black/75 px-3 py-1.5 border border-amber-500/40 animate-radio-in max-w-full"
        >
          <span class={`text-[9px] font-extrabold tracking-widest uppercase shrink-0 ${VOICE_COLORS[l.voice]}`}>
            ▸ {VOICE_LABELS[l.voice]}
          </span>
          <span class="text-[11px] sm:text-xs text-gray-100 font-semibold leading-tight truncate">
            {l.text}
          </span>
        </div>
      ))}
    </div>
  );
}
