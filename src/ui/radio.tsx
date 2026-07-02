/* Cop-radio HUD overlay — rolling chatter from world/radio. Lines fade in via CSS, removed by emitter setTimeout. */

import { radioLines, type IRadioLine } from "../world/radio";
import { gameState } from "../state";

const VOICE_COLORS: Record<IRadioLine["voice"], string> = {
  dispatch: "var(--amber)",
  unit: "var(--cyan)",
  swat: "var(--red)",
};

const VOICE_LABELS: Record<IRadioLine["voice"], string> = {
  dispatch: "DISPATCH",
  unit: "UNIT",
  swat: "SWAT",
};

export function Radio() {
  const state = gameState.value;
  if (state !== "playing" && state !== "paused") return null;
  const lines = radioLines.value;
  if (lines.length === 0) return null;

  return (
    <div class="absolute left-1/2 -translate-x-1/2 bottom-24 sm:bottom-20 z-10 pointer-events-none flex flex-col items-center gap-1.5 w-[min(92vw,520px)]">
      {lines.map((l) => (
        <div
          key={l.id}
          class="flex items-center gap-2 bg-black/85 px-3 py-1.5 border-2 animate-radio-in max-w-full"
          style={{ borderColor: `${VOICE_COLORS[l.voice]}66` }}
        >
          <span
            class="font-pixel text-[8px] tracking-wider uppercase shrink-0"
            style={{ color: VOICE_COLORS[l.voice] }}
          >
            {VOICE_LABELS[l.voice]}
          </span>
          <span class="font-mono-ui text-[11px] sm:text-xs text-[var(--text)] leading-tight truncate">{l.text}</span>
        </div>
      ))}
    </div>
  );
}
