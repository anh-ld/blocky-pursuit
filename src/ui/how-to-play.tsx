import { screen, canInstallPwa, actions, bestScore, totalRuns, copsDrowned } from "../state";
import { CAR_SKINS, isUnlocked } from "../entities/car-skins";
import { fetchLeaderboard } from "../api";

export function HowToPlay() {
  const openLeaderboard = () => {
    fetchLeaderboard();
    screen.value = "leaderboard";
  };
  const openFeedback = () => {
    screen.value = "feedback";
  };
  const openGarage = () => {
    screen.value = "garage";
  };

  // Compute career stats from persisted progress so the start screen shows
  // visible long-term progression instead of starting cold every visit.
  const progress = {
    best: bestScore.value,
    totalRuns: totalRuns.value,
    copsDrowned: copsDrowned.value,
    selectedSkin: "",
  };
  const unlockedCount = CAR_SKINS.filter((s) => isUnlocked(s, progress)).length;
  const showCareer = totalRuns.value > 0;

  return (
    <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div class="bg-black/60 md:bg-black text-gray-300 px-4 py-5 md:py-3 flex flex-col gap-3 text-xs font-normal tracking-wide w-full h-full md:w-auto md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto">
        <span class="text-amber-400 font-extrabold uppercase tracking-widest md:text-center">
          How to Play
        </span>
        <div class="flex items-center gap-2">
          <div class="gap-1 shrink-0 hidden md:flex">
            <span class="kbd-sm">A</span>
            <span class="kbd-sm">D</span>
          </div>
          <span class="shrink-0 md:hidden text-sm">👆</span>
          <span class="text-gray-400 hidden md:inline">Steer left / right</span>
          <span class="text-gray-400 md:hidden">Tap buttons to steer</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm leading-none shrink-0">🚗</span>
          <span class="text-gray-400">Car drives automatically</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm leading-none shrink-0">🚔</span>
          <span class="text-gray-400">Evade cops — don't get busted!</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm leading-none shrink-0">🌊</span>
          <span class="text-gray-400">Avoid water, lure cops in for bonus</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm leading-none shrink-0">⚡</span>
          <span class="text-gray-400">Drive fast on roads to score</span>
        </div>
        <div class="flex items-center gap-2">
          <span class="text-sm leading-none shrink-0">💥</span>
          <span class="text-gray-400">Skim past cops for combo x3 score</span>
        </div>

        {showCareer && (
          <div class="grid grid-cols-4 gap-1 pt-2 mt-1 border-t border-gray-700/60">
            <div class="flex flex-col items-center">
              <span class="text-gray-500 text-[8px] uppercase tracking-wider">Best</span>
              <span class="text-amber-300 text-[11px] font-extrabold tabular-nums">
                {bestScore.value.toLocaleString()}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-gray-500 text-[8px] uppercase tracking-wider">Runs</span>
              <span class="text-gray-200 text-[11px] font-extrabold tabular-nums">
                {totalRuns.value}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-gray-500 text-[8px] uppercase tracking-wider">Drowned</span>
              <span class="text-cyan-300 text-[11px] font-extrabold tabular-nums">
                {copsDrowned.value}
              </span>
            </div>
            <div class="flex flex-col items-center">
              <span class="text-gray-500 text-[8px] uppercase tracking-wider">Cars</span>
              <span class="text-pink-300 text-[11px] font-extrabold tabular-nums">
                {unlockedCount}/{CAR_SKINS.length}
              </span>
            </div>
          </div>
        )}

        <div class="mt-auto md:mt-0 flex flex-col gap-2 sticky md:static bottom-0 -mx-4 md:mx-0 px-4 md:px-0">
          <button
            onClick={openGarage}
            class="w-full py-2 bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-colors"
          >
            Garage
          </button>
          <button
            onClick={openLeaderboard}
            class="w-full py-2 bg-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30 transition-colors"
          >
            Leaderboard
          </button>
          <button
            onClick={openFeedback}
            class="w-full py-2 bg-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-wider border border-violet-500/30 cursor-pointer hover:bg-violet-500/30 transition-colors"
          >
            Feedback
          </button>
          {canInstallPwa.value && (
            <button
              onClick={() => actions.installPwa()}
              class="flex md:!hidden items-center justify-center gap-1.5 w-full py-2 bg-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-colors"
            >
              📲 Install App
            </button>
          )}
          <button
            onClick={() => actions.startGame()}
            class="w-full py-2 bg-amber-400 text-gray-900 text-xs font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
          >
            START
          </button>
          <a
            href="https://github.com/anh-ld/blocky-pursuit"
            target="_blank"
            rel="noopener"
            class="text-center text-gray-500 text-[10px] mt-1 hover:text-amber-400 transition-colors"
          >
            ⭐ Enjoy it? Star on GitHub!
          </a>
        </div>
      </div>
    </div>
  );
}
