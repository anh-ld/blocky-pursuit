import {
  hp,
  score,
  level,
  levelProgress,
  heat,
  nitroRemaining,
  shieldUp,
  combo,
  comboTimerRatio,
  comboMultiplier,
  comboInDanger,
  scoreMultRemaining,
  timeWarpRemaining,
  magnetRemaining,
  ghostRemaining,
  tankRemaining,
} from "../state";
import { COMBO_MILESTONE } from "../constants";

export function Hud() {
  const v = hp.value;
  const color = v > 60 ? "bg-green-400" : v > 30 ? "bg-yellow-400" : "bg-red-400";
  const nitro = nitroRemaining.value;
  const shield = shieldUp.value;
  const c = combo.value;
  const cRatio = comboTimerRatio.value;
  const cMult = comboMultiplier.value;
  const scoreMult = scoreMultRemaining.value;
  const timeWarp = timeWarpRemaining.value;
  const magnet = magnetRemaining.value;
  const ghost = ghostRemaining.value;
  const tank = tankRemaining.value;
  // Tier changes only at milestones (every COMBO_MILESTONE). Using it as a
  // key forces a remount of the combo node, retriggering the pop animation
  // at the same instant the milestone sound + popup fire.
  const comboTier = Math.floor(c / COMBO_MILESTONE);
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
      <div class="flex flex-col items-start gap-0.5">
        <span class="text-orange-500 text-xs font-extrabold tracking-widest leading-none">
          LV {level.value}
        </span>
        <div class="w-10 h-0.5 bg-orange-900/60 overflow-hidden">
          <div
            class="h-full bg-orange-400"
            style={{ width: `${levelProgress.value * 100}%` }}
          />
        </div>
      </div>
      {heat.value > 0 && (
        <span class="text-red-400 text-xs font-extrabold tracking-widest">
          🔥{heat.value}
        </span>
      )}
      {c > 0 && (
        <div class={`flex flex-col items-start gap-0.5 ${comboInDanger.value ? "animate-busted-pulse" : ""}`}>
          <div class="flex items-baseline gap-1">
            <span
              key={`combo-tier-${comboTier}`}
              class={`text-xs font-extrabold tracking-widest inline-block animate-combo-pop origin-left ${
                comboInDanger.value ? "text-red-400" : "text-pink-400"
              }`}
            >
              x{c}
            </span>
            <span class={`text-[9px] font-bold tabular-nums ${
              comboInDanger.value ? "text-red-300/80" : "text-pink-300/70"
            }`}>
              {cMult.toFixed(1)}x
            </span>
          </div>
          <div class={`w-10 h-0.5 overflow-hidden ${comboInDanger.value ? "bg-red-900/60" : "bg-pink-900/60"}`}>
            <div
              class={`h-full ${comboInDanger.value ? "bg-red-400" : "bg-pink-400"}`}
              style={{ width: `${cRatio * 100}%` }}
            />
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
      {scoreMult > 0 && (
        <span class="text-yellow-300 text-xs font-extrabold tracking-widest">
          💰{scoreMult.toFixed(1)}
        </span>
      )}
      {timeWarp > 0 && (
        <span class="text-sky-300 text-xs font-extrabold tracking-widest">
          ⏳{timeWarp.toFixed(1)}
        </span>
      )}
      {magnet > 0 && (
        <span class="text-red-300 text-xs font-extrabold tracking-widest">
          🧲{magnet.toFixed(1)}
        </span>
      )}
      {ghost > 0 && (
        <span class="text-violet-200 text-xs font-extrabold tracking-widest">
          👻{ghost.toFixed(1)}
        </span>
      )}
      {tank > 0 && (
        <span class="text-rose-400 text-xs font-extrabold tracking-widest">
          💢{tank.toFixed(1)}
        </span>
      )}
    </div>
  );
}
