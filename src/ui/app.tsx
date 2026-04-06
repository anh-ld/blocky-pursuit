import { gameState, screen } from "../state";
import { TopBar } from "./top-bar";
import { HowToPlay } from "./how-to-play";
import { Leaderboard } from "./leaderboard";
import { Feedback } from "./feedback";
import { MobileCta } from "./mobile-cta";
import { MobileControls } from "./mobile-controls";
import { ControlsGuide } from "./controls-guide";

export function App() {
  const state = gameState.value;
  const sc = screen.value;
  const showHowToPlay = state === "start" && sc === "howToPlay";
  const darken = state !== "playing";

  return (
    <>
      <TopBar />
      <div id="game-area" class="relative flex-1 overflow-hidden">
        <div
          class={`absolute top-0 left-0 w-full h-full bg-black/60 z-5 pointer-events-none transition-opacity duration-300 ${darken ? "" : "opacity-0"}`}
        />
        {showHowToPlay && <HowToPlay />}
        {sc === "leaderboard" && <Leaderboard />}
        {sc === "feedback" && <Feedback />}
        <div class="absolute top-0 left-0 w-full h-full pointer-events-none z-10 flex flex-col justify-end">
          <ControlsGuide />
          <MobileCta />
          <MobileControls />
        </div>
      </div>
    </>
  );
}
