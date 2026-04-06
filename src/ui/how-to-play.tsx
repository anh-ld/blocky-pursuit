import { screen, canInstallPwa, actions } from "../state";
import { fetchLeaderboard } from "../api";

export function HowToPlay() {
  const openLeaderboard = () => {
    fetchLeaderboard();
    screen.value = "leaderboard";
  };
  const openFeedback = () => {
    screen.value = "feedback";
  };

  return (
    <div class="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div class="bg-black/50 text-gray-300 px-4 py-3 flex flex-col gap-3 text-xs font-normal tracking-wide">
        <span class="text-amber-400 font-extrabold uppercase tracking-widest text-center">
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

        <button
          onClick={openLeaderboard}
          class="w-full mt-1 py-1.5 bg-cyan-500/20 text-cyan-400 text-xs font-bold uppercase tracking-wider border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30 transition-colors pointer-events-auto"
        >
          Leaderboard
        </button>
        <button
          onClick={openFeedback}
          class="w-full mt-1 py-1.5 bg-violet-500/20 text-violet-400 text-xs font-bold uppercase tracking-wider border border-violet-500/30 cursor-pointer hover:bg-violet-500/30 transition-colors pointer-events-auto"
        >
          Feedback
        </button>
        {canInstallPwa.value && (
          <button
            onClick={() => actions.installPwa()}
            class="flex md:!hidden items-center justify-center gap-1.5 w-full mt-1 py-1.5 bg-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider border border-amber-500/30 cursor-pointer hover:bg-amber-500/30 transition-colors pointer-events-auto"
          >
            📲 Install App
          </button>
        )}
        <a
          href="https://github.com/anh-ld/blocky-pursuit"
          target="_blank"
          rel="noopener"
          class="text-center text-gray-500 text-[10px] mt-1 hover:text-amber-400 transition-colors pointer-events-auto"
        >
          ⭐ Enjoy it? Star on GitHub!
        </a>
      </div>
    </div>
  );
}
