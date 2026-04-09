import { gameState, screen, actions } from "../state";
import { TopBar } from "./top-bar";
import { HowToPlay } from "./how-to-play";
import { Leaderboard } from "./leaderboard";
import { Recordings } from "./recordings";
import { Feedback } from "./feedback";
import { MobileCta } from "./mobile-cta";
import { MobileControls } from "./mobile-controls";
import { ControlsGuide } from "./controls-guide";
import { GameOver } from "./game-over";
import { Garage } from "./garage";
import { PreGame } from "./pre-game";
import { BustedWarning } from "./busted-warning";
import { LowHpWarning } from "./low-hp-warning";
import { DamageIndicator } from "./damage-indicator";
import { Radio } from "./radio";
import { ReplayModal } from "./replay-modal";

export function App() {
  const state = gameState.value;
  const sc = screen.value;
  const showHowToPlay = state === "start" && sc === "howToPlay";
  const showGameOver = state === "gameover" && sc !== "leaderboard" && sc !== "recordings" && sc !== "feedback" && sc !== "preGame";
  const showPaused = state === "paused";
  const darken = state !== "playing";

  return (
    <>
      <TopBar />
      <div id="game-area" class="relative flex-1 overflow-hidden">
        <div
          class={`absolute inset-0 bg-black/60 z-5 pointer-events-none transition-opacity duration-300 ${darken ? "" : "opacity-0"}`}
        />
        <LowHpWarning />
        <DamageIndicator />
        <BustedWarning />
        <Radio />
        <ReplayModal />
        {showHowToPlay && <HowToPlay />}
        {showGameOver && <GameOver />}
        {showPaused && (
          <div class="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto">
            <div class="bg-black/80 px-5 py-5 flex flex-col gap-3 items-center min-w-56">
              <span class="text-amber-400 font-extrabold uppercase tracking-widest text-sm">
                Paused
              </span>
              <button
                onClick={() => actions.togglePause()}
                class="w-full py-2 bg-amber-400 text-gray-900 text-xs font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
              >
                Resume
              </button>
              <button
                onClick={() => actions.beginRun()}
                class="w-full py-2 bg-gray-700 text-gray-200 text-xs font-extrabold uppercase tracking-wider cursor-pointer hover:bg-gray-600"
              >
                Restart Run
              </button>
              <button
                onClick={() => {
                  // Quit to the start screen — mirrors game-over "Back".
                  gameState.value = "start";
                  screen.value = "howToPlay";
                }}
                class="w-full py-2 bg-gray-800 text-gray-400 text-xs font-bold uppercase tracking-wider cursor-pointer hover:bg-gray-700"
              >
                Quit to Menu
              </button>
              <span class="text-gray-500 text-[10px] tracking-wide hidden md:inline">
                Press SPACE to resume
              </span>
            </div>
          </div>
        )}
        {sc === "leaderboard" && <Leaderboard />}
        {sc === "recordings" && <Recordings />}
        {sc === "feedback" && <Feedback />}
        {sc === "garage" && <Garage />}
        {sc === "preGame" && <PreGame />}
        <div class="absolute inset-0 pointer-events-none z-10 flex flex-col justify-end">
          <ControlsGuide />
          <MobileCta />
          <MobileControls />
        </div>
      </div>
    </>
  );
}
