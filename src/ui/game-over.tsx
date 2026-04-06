import {
  score,
  bestScore,
  isNewBest,
  survivalTime,
  level,
  gameOverReason,
  actions,
  playerName,
} from "../state";

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}.${ms.toString().padStart(2, "0")}s`;
}

async function shareRun() {
  const text = `I scored ${Math.floor(score.value)} in Blocky Pursuit — survived ${formatTime(survivalTime.value)} as ${playerName.value}. Can you beat me?`;
  const url = window.location.href;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Blocky Pursuit", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  } catch {}
}

export function GameOver() {
  const reason = gameOverReason.value;
  const reasonText: Record<string, string> = {
    BUSTED: "BUSTED",
    WRECKED: "WRECKED",
    DROWNED: "DROWNED",
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="bg-black/85 border-2 border-red-500/60 px-6 py-5 w-72 pointer-events-auto flex flex-col items-center gap-3">
        <div class="text-red-400 text-xs font-extrabold uppercase tracking-[0.3em]">
          {reasonText[reason] || reason}
        </div>
        {isNewBest.value && (
          <div class="text-amber-300 text-[11px] font-extrabold uppercase tracking-widest animate-pulse">
            ★ NEW BEST ★
          </div>
        )}
        <div class="text-amber-400 text-5xl font-extrabold tabular-nums leading-none">
          {Math.floor(score.value).toLocaleString()}
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
        <button
          onClick={() => actions.startGame()}
          class="w-full mt-2 py-2 bg-amber-400 text-gray-900 text-sm font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
        >
          RETRY
        </button>
        <button
          onClick={shareRun}
          class="w-full py-1.5 bg-cyan-500/20 text-cyan-300 text-[11px] font-bold uppercase tracking-wider border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30"
        >
          Share Score
        </button>
      </div>
    </div>
  );
}
