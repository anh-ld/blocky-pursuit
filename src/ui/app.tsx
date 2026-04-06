import { gameState, screen } from "../state";
import { TopBar } from "./top-bar";
import { HowToPlay } from "./how-to-play";
import { Leaderboard } from "./leaderboard";
import { Feedback } from "./feedback";
import { MobileCta } from "./mobile-cta";
import { MobileControls } from "./mobile-controls";
import { ControlsGuide } from "./controls-guide";
import { GameOver } from "./game-over";
import { Garage } from "./garage";

export function App() {
  const state = gameState.value;
  const sc = screen.value;
  const showHowToPlay = state === "start" && sc === "howToPlay";
  const showGameOver = state === "gameover" && sc !== "leaderboard" && sc !== "feedback";
  const darken = state !== "playing";

  return (
    <>
      <TopBar />
      <div id="game-area" class="relative flex-1 overflow-hidden">
        <div
          class={`absolute top-0 left-0 w-full h-full bg-black/60 z-5 pointer-events-none transition-opacity duration-300 ${darken ? "" : "opacity-0"}`}
        />
        {showHowToPlay && <HowToPlay />}
        {showGameOver && <GameOver />}
        {sc === "leaderboard" && <Leaderboard />}
        {sc === "feedback" && <Feedback />}
        {sc === "garage" && <Garage />}
        <div class="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-end">
          <ControlsGuide />
          <MobileCta />
          <MobileControls />
        </div>
      </div>
    </>
  );
}
