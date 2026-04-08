import { attemptAsync } from "es-toolkit";
import { useEffect, useState } from "preact/hooks";
import {
  score,
  bestScore,
  isNewBest,
  survivalTime,
  level,
  gameOverReason,
  actions,
  playerName,
  runDrowned,
  runTopSpeed,
  runBiggestCombo,
  runDistance,
  runTileScore,
  runComboScore,
  runCopScore,
  gameState,
  screen,
} from "../state";
import { haptics } from "../audio/haptics";

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}.${ms.toString().padStart(2, "0")}s`;
}

/**
 * Animate a numeric value from 0 → target over `duration` ms with an
 * ease-out cubic curve. Used for the game-over score reveal so the panel
 * lands like a payoff instead of a static dump of numbers.
 */
function useCountUp(target: number, duration: number): number {
  // Initial state is 0 (not target) so the very first render of the panel
  // shows the count starting from zero — otherwise there's a 1-frame flash
  // of the final score before the effect resets it.
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(target * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

async function shareRun() {
  const text = `I scored ${Math.floor(score.value)} in Blocky Pursuit — survived ${formatTime(survivalTime.value)} with a x${runBiggestCombo.value} combo as ${playerName.value}. Can you beat me?`;
  const url = window.location.href;
  await attemptAsync(async () => {
    if (navigator.share) {
      await navigator.share({ title: "Blocky Pursuit", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  });
}

export function GameOver() {
  const reason = gameOverReason.value;
  const reasonText: Record<string, string> = {
    BUSTED: "BUSTED",
    WRECKED: "WRECKED",
    DROWNED: "DROWNED",
  };
  const tile = Math.floor(runTileScore.value);
  const cmb = Math.floor(runComboScore.value);
  const cop = Math.floor(runCopScore.value);
  // Animated score reveal — counts from 0 to the final score over ~800ms.
  // The hook reads `score.value` once at mount; signal changes after the
  // panel appears would re-trigger the effect, but the run is over so the
  // value stays stable.
  const animatedScore = useCountUp(score.value, 800);
  const handleRetry = () => {
    haptics.pickup();
    actions.startGame();
  };
  const handleBack = () => {
    gameState.value = "start";
    screen.value = "howToPlay";
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="bg-black/60 md:bg-black px-4 py-5 w-full h-full md:w-72 md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col items-center gap-3 animate-game-over-in">
        <div class="text-red-400 text-xs font-extrabold uppercase tracking-[0.3em]">
          {reasonText[reason] || reason}
        </div>
        {isNewBest.value && (
          <div class="text-amber-300 text-[11px] font-extrabold uppercase tracking-widest animate-pulse">
            ★ NEW BEST ★
          </div>
        )}
        <div class="text-amber-400 text-5xl font-extrabold tabular-nums leading-none">
          {Math.floor(animatedScore).toLocaleString()}
        </div>
        <div class="flex items-center gap-4 text-[10px] uppercase tracking-widest text-gray-400">
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Best</span>
            <span class="text-amber-300 font-extrabold tabular-nums">
              {bestScore.value.toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Time</span>
            <span class="text-gray-200 font-extrabold tabular-nums">
              {formatTime(survivalTime.value)}
            </span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Level</span>
            <span class="text-orange-400 font-extrabold tabular-nums">{level.value}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] uppercase tracking-widest text-gray-400 w-full mt-1 pt-2 border-t border-gray-700/60">
          <div class="flex justify-between">
            <span class="text-gray-500">Drowned</span>
            <span class="text-cyan-300 font-extrabold tabular-nums">{runDrowned.value}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Best Combo</span>
            <span class="text-pink-400 font-extrabold tabular-nums">x{runBiggestCombo.value}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Top Speed</span>
            <span class="text-amber-300 font-extrabold tabular-nums">{Math.round(runTopSpeed.value)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Distance</span>
            <span class="text-gray-200 font-extrabold tabular-nums">{Math.round(runDistance.value)}m</span>
          </div>
        </div>
        {/* Score breakdown — shows the player *how* they earned the total */}
        <div class="w-full pt-2 border-t border-gray-700/60 flex flex-col gap-0.5 text-[10px] uppercase tracking-widest">
          <div class="flex justify-between">
            <span class="text-gray-500">Tile</span>
            <span class="text-amber-300 font-extrabold tabular-nums">{tile.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Combo</span>
            <span class="text-pink-400 font-extrabold tabular-nums">{cmb.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Cops</span>
            <span class="text-cyan-300 font-extrabold tabular-nums">{cop.toLocaleString()}</span>
          </div>
        </div>
        <div class="mt-auto md:mt-2 flex flex-col gap-2 w-full">
          <button
            onClick={handleRetry}
            class="w-full py-2 bg-amber-400 text-gray-900 text-xs font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
          >
            RETRY
          </button>
          <button
            onClick={shareRun}
            class="w-full py-2 bg-cyan-500/20 text-cyan-300 text-xs font-bold uppercase tracking-wider border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30"
          >
            Share Score
          </button>
          <button
            onClick={handleBack}
            class="w-full py-2 bg-gray-700 text-gray-300 text-xs font-extrabold uppercase tracking-wider hover:bg-gray-600 cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
