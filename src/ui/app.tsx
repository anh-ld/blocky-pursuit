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
import { IconPlay } from "./icons";

export function App() {
  const state = gameState.value;
  const sc = screen.value;
  const showHowToPlay = state === "start" && sc === "howToPlay";

  const showGameOver =
    state === "gameover" && sc !== "leaderboard" && sc !== "recordings" && sc !== "feedback" && sc !== "preGame";

  const showPaused = state === "paused";
  const darken = state !== "playing";

  return (
    <>
      <TopBar />
      <div id="game-area" class="relative flex-1 overflow-hidden">
        <div
          class={`absolute inset-0 bg-black/60 z-[5] pointer-events-none transition-opacity duration-300 ${
            darken ? "" : "opacity-0"
          }`}
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
            <div class="bg-[var(--bg-1)] border-2 border-[var(--line-2)] p-5 flex flex-col gap-2.5 items-stretch min-w-64">
              <h3
                class="font-pixel text-[var(--amber)] text-xs leading-none mb-1"
                style={{ textShadow: "2px 2px 0 #000" }}
              >
                PAUSED
              </h3>
              <button onClick={() => actions.togglePause()} class="arcade-btn w-full">
                <IconPlay size={12} />
                Resume
              </button>
              <button onClick={() => actions.beginRun()} class="arcade-btn arcade-btn-ghost w-full">
                Restart
              </button>
              <button
                onClick={() => {
                  gameState.value = "start";
                  screen.value = "howToPlay";
                }}
                class="arcade-btn arcade-btn-ghost w-full"
              >
                Quit to menu
              </button>
              <span class="font-mono-ui text-[9px] text-[var(--text-mute)] text-center tracking-widest uppercase hidden md:block">
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
