import { hp, gameState } from "../state";
import { LOW_HP_THRESHOLD } from "../constants";

export function LowHpWarning() {
  if (gameState.value !== "playing") return null;
  const v = hp.value;
  if (v <= 0 || v >= LOW_HP_THRESHOLD) return null;
  const danger = 1 - v / LOW_HP_THRESHOLD;
  const opacity = 0.2 + danger * 0.45;

  return (
    <div class="absolute inset-0 z-[15] pointer-events-none">
      <div
        class="absolute inset-0 animate-busted-pulse"
        style={{
          background: "radial-gradient(ellipse at center, transparent 40%, rgba(239,68,68,0.85) 100%)",
          opacity,
        }}
      />
    </div>
  );
}
