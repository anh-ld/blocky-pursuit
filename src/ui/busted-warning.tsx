import { bustedProgress, gameState } from "../state";
import { IconBust } from "./icons";

export function BustedWarning() {
  if (gameState.value !== "playing") return null;
  const p = bustedProgress.value;
  if (p <= 0) return null;
  const opacity = 0.25 + p * 0.55;
  const secondsLeft = (1 - p).toFixed(1);
  return (
    <div class="absolute inset-0 z-[15] pointer-events-none flex items-start justify-center">
      <div
        class="absolute inset-0 animate-busted-pulse"
        style={{
          background: "radial-gradient(ellipse at center, transparent 35%, rgba(239,68,68,0.85) 100%)",
          opacity,
        }}
      />
      <div
        class="relative mt-3 px-3 py-1.5 bg-[var(--red)] text-[#000] font-pixel text-[10px] leading-none flex items-center gap-1.5 animate-busted-pulse border-2 border-[#000]"
        style={{ textShadow: "1px 1px 0 #00000022" }}
      >
        <IconBust size={12} class="text-[#000]" />
        BUSTED IN {secondsLeft}s · MOVE
      </div>
    </div>
  );
}
