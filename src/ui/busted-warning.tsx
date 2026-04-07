import { bustedProgress, gameState } from "../state";

/**
 * Pulsing red vignette + countdown shown when the busted timer is filling
 * (player is stopped + surrounded by cops). Gives the player a clear cue
 * to break free instead of dying silently.
 */
export function BustedWarning() {
  if (gameState.value !== "playing") return null;
  const p = bustedProgress.value;
  if (p <= 0) return null;
  // Vignette opacity ramps with progress; pulse via CSS animation
  const opacity = 0.25 + p * 0.55;
  return (
    <div class="absolute inset-0 z-15 pointer-events-none flex items-start justify-center">
      <div
        class="absolute inset-0 animate-busted-pulse"
        style={{
          background:
            "radial-gradient(ellipse at center, transparent 35%, rgba(220,38,38,0.85) 100%)",
          opacity,
        }}
      />
      <div class="relative mt-4 px-3 py-1 bg-red-600/90 text-white text-xs font-extrabold uppercase tracking-widest animate-busted-pulse">
        Busted in {(1 - p).toFixed(1)}s — move!
      </div>
    </div>
  );
}
