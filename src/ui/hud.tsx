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
  scoreMultRemaining,
  timeWarpRemaining,
  magnetRemaining,
  ghostRemaining,
  tankRemaining,
} from "../state";
import { COMBO_MILESTONE } from "../constants";
import {
  IconBolt,
  IconShield,
  IconCoin,
  IconClock,
  IconMagnet,
  IconGhost,
  IconTank,
  IconFlame,
} from "./icons";

/* Compact power-up chip — square icon + mono number. Tinted by buff type, no extra padding. */
function PowerChip({
  tint,
  icon,
  value,
  danger,
}: {
  tint: string;
  icon: preact.ComponentChildren;
  value: string;
  danger?: boolean;
}) {
  return (
    <span
      class="inline-flex items-center gap-0.5 px-1 h-5 font-mono-ui text-[10px] font-bold tabular-nums leading-none"
      style={{ color: tint, background: danger ? "rgba(239,68,68,0.12)" : `${tint}1a` }}
    >
      <span class="shrink-0 w-3 h-3 flex items-center justify-center">{icon}</span>
      {value}
    </span>
  );
}

export function Hud() {
  const v = hp.value;
  const low = v <= 30;
  const mid = v <= 60 && v > 30;
  const hpColor = low ? "var(--red)" : mid ? "var(--amber)" : "var(--text)";
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
  const h = heat.value;
  /* Tier changes at milestones — `key` on combo number remounts → pop animation retriggers. */
  const comboTier = Math.floor(c / COMBO_MILESTONE);
  return (
    <div class="flex items-center gap-1.5 min-w-0">
      {/* HP — single thin bar, color carries health state */}
      <div class="w-12 sm:w-16 h-1.5 bg-[var(--bg-3)] overflow-hidden shrink-0">
        <div
          class="h-full transition-all duration-200"
          style={{ width: `${Math.max(0, v)}%`, background: hpColor }}
        />
      </div>

      {/* Score — pixel font, the hero number */}
      <span
        class="font-pixel text-[var(--amber)] text-[10px] sm:text-[11px] tabular-nums leading-none shrink-0"
        style={{ textShadow: "1px 1px 0 #000" }}
      >
        {Math.floor(score.value).toLocaleString()}
      </span>

      {/* Level + progress */}
      <span
        class="font-mono-ui text-[var(--amber)] text-[10px] font-bold tracking-wider uppercase leading-none shrink-0"
        style={{ textShadow: "1px 1px 0 #000" }}
      >
        LV{level.value}
      </span>
      <div class="w-6 sm:w-8 h-1 bg-[var(--bg-3)] overflow-hidden shrink-0">
        <div class="h-full bg-[var(--amber)]" style={{ width: `${levelProgress.value * 100}%` }} />
      </div>

      {/* Heat — flame icon + tier number */}
      {h > 0 && (
        <span
          class="inline-flex items-center gap-0.5 h-5 px-1 font-mono-ui text-[10px] font-bold text-[var(--red)] leading-none shrink-0"
          style={{ background: "rgba(239,68,68,0.12)" }}
        >
          <span class="w-3 h-3">
            <IconFlame size={12} />
          </span>
          {h}
        </span>
      )}

      {/* Combo — pop on tier change, color flips to red when in danger */}
      {c > 0 && (
        <div class={`flex items-center gap-1 shrink-0 ${comboInDanger.value ? "animate-busted-pulse" : ""}`}>
          <span
            key={`combo-tier-${comboTier}`}
            class={`inline-block animate-combo-pop origin-left font-pixel text-[10px] tabular-nums leading-none ${
              comboInDanger.value ? "text-[var(--red)]" : "text-[var(--pink)]"
            }`}
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            ×{c}
          </span>
          <div class="w-6 h-1 overflow-hidden bg-[var(--bg-3)]">
            <div
              class={`h-full ${comboInDanger.value ? "bg-[var(--red)]" : "bg-[var(--pink)]"}`}
              style={{ width: `${cRatio * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Power-ups — flat chips, color carries the type */}
      {nitro > 0 && <PowerChip tint="var(--amber)" icon={<IconBolt size={12} />} value={nitro.toFixed(1)} />}
      {shield && <PowerChip tint="var(--cyan)" icon={<IconShield size={12} />} value="" />}
      {scoreMult > 0 && (
        <PowerChip tint="var(--amber)" icon={<IconCoin size={12} />} value={scoreMult.toFixed(1)} />
      )}
      {timeWarp > 0 && (
        <PowerChip tint="var(--cyan)" icon={<IconClock size={12} />} value={timeWarp.toFixed(1)} />
      )}
      {magnet > 0 && (
        <PowerChip tint="var(--red)" icon={<IconMagnet size={12} />} value={magnet.toFixed(1)} danger />
      )}
      {ghost > 0 && (
        <PowerChip tint="var(--text-dim)" icon={<IconGhost size={12} />} value={ghost.toFixed(1)} />
      )}
      {tank > 0 && <PowerChip tint="var(--red)" icon={<IconTank size={12} />} value={tank.toFixed(1)} danger />}
    </div>
  );
}
