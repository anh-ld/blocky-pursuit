import { hp, gameState } from "../state";
import { LOW_HP_THRESHOLD } from "../constants";

/**
 * Pulsing red screen-edge vignette shown when HP drops below the danger
 * threshold. Mirrors `BustedWarning`'s pattern (radial gradient + pulse
 * animation) so the two warnings feel like the same visual language.
 *
 * Audio companion is in main.ts (`playHeartbeat`) — both react to the same
 * `hp` value, so they're inherently in sync.
 */
export function LowHpWarning() {
  if (gameState.value !== "playing") return null;
  const v = hp.value;
  if (v <= 0 || v >= LOW_HP_THRESHOLD) return null;
  // Danger 0..1 — full red at 1 HP, faint at threshold.
  const danger = 1 - v / LOW_HP_THRESHOLD;
  const opacity = 0.2 + danger * 0.45;
  return (
    <div class="absolute inset-0 z-15 pointer-events-none">
      <div
        class="absolute inset-0 animate-busted-pulse"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 40%, rgba(220,38,38,0.85) 100%)",
          opacity,
        }}
      />
    </div>
  );
}
