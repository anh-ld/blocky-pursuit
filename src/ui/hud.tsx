import { hp, score, level, nitroRemaining, shieldUp, combo, comboTimerRatio, comboMultiplier } from "../state";

export function Hud() {
  const v = hp.value;
  const color = v > 60 ? "bg-green-400" : v > 30 ? "bg-yellow-400" : "bg-red-400";
  const nitro = nitroRemaining.value;
  const shield = shieldUp.value;
  const c = combo.value;
  const cRatio = comboTimerRatio.value;
  const cMult = comboMultiplier.value;
  return (
    <div class="flex items-center gap-2">
      <div class="w-25 h-3.5 bg-gray-700 relative overflow-hidden">
        <div
          class={`h-full ${color} transition-all duration-200`}
          style={{ width: `${Math.max(0, v)}%` }}
        />
      </div>
      <div class="flex items-center gap-1">
        <span class="text-gray-400 text-xs font-semibold">SCORE</span>
        <span class="text-amber-400 text-sm font-extrabold tracking-wider">
          {Math.floor(score.value)}
        </span>
      </div>
      <span class="text-orange-500 text-xs font-extrabold tracking-widest">
        LV {level.value}
      </span>
      {c > 0 && (
        <div class="flex flex-col items-start gap-0.5">
          <div class="flex items-baseline gap-1">
            <span class="text-pink-400 text-xs font-extrabold tracking-widest">x{c}</span>
            <span class="text-pink-300/70 text-[9px] font-bold tabular-nums">
              {cMult.toFixed(1)}x
            </span>
          </div>
          <div class="w-10 h-0.5 bg-pink-900/60 overflow-hidden">
            <div class="h-full bg-pink-400" style={{ width: `${cRatio * 100}%` }} />
          </div>
        </div>
      )}
      {nitro > 0 && (
        <span class="text-amber-300 text-xs font-extrabold tracking-widest">
          ⚡{nitro.toFixed(1)}
        </span>
      )}
      {shield && (
        <span class="text-cyan-300 text-xs font-extrabold tracking-widest">🛡</span>
      )}
    </div>
  );
}
