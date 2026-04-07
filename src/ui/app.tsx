import { gameState, screen, actions } from "../state";
import { TopBar } from "./top-bar";
import { HowToPlay } from "./how-to-play";
import { Leaderboard } from "./leaderboard";
import { Feedback } from "./feedback";
import { MobileCta } from "./mobile-cta";
import { MobileControls } from "./mobile-controls";
import { ControlsGuide } from "./controls-guide";
import { GameOver } from "./game-over";
import { Garage } from "./garage";
import { PreGame } from "./pre-game";
import { BustedWarning } from "./busted-warning";

export function App() {
  const state = gameState.value;
  const sc = screen.value;
  const showHowToPlay = state === "start" && sc === "howToPlay";
  const showGameOver = state === "gameover" && sc !== "leaderboard" && sc !== "feedback" && sc !== "preGame";
  const showPaused = state === "paused";
  const darken = state !== "playing";

  return (
    <>
      <TopBar />
      <div id="game-area" class="relative flex-1 overflow-hidden">
        <div
          class={`absolute inset-0 bg-black/60 z-5 pointer-events-none transition-opacity duration-300 ${darken ? "" : "opacity-0"}`}
        />
        <BustedWarning />
        {showHowToPlay && <HowToPlay />}
        {showGameOver && <GameOver />}
        {showPaused && (
          <div
            class="absolute inset-0 z-20 flex items-center justify-center pointer-events-auto cursor-pointer"
            onClick={() => actions.togglePause()}
          >
            <div class="bg-black/60 text-gray-300 px-4 py-3 flex flex-col gap-2 text-xs font-normal tracking-wide text-center">
              <span class="text-amber-400 font-extrabold uppercase tracking-widest">
                Paused
              </span>
              <span class="text-gray-400 hidden md:inline">Press SPACE or tap to resume</span>
              <span class="text-gray-400 md:hidden">Tap anywhere to resume</span>
            </div>
          </div>
        )}
        {sc === "leaderboard" && <Leaderboard />}
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
