import { gameState, gameOverReason, survivalTime, actions } from "../state";
import { Hud } from "./hud";

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}:${ms.toString().padStart(2, "0")}`;
}

export function TopBar() {
  const state = gameState.value;
  const playing = state === "playing";
  const over = state === "gameover";
  const start = state === "start";

  return (
    <div class="flex flex-wrap gap-2 items-center justify-between px-5 h-13 bg-gray-900 shrink-0">
      <div class="flex items-center gap-2">
        {start && (
          <h1 class="text-orange-500 text-lg font-extrabold uppercase tracking-widest m-0 leading-none">
            blocky pursuit
          </h1>
        )}
        {(playing || over) && <Hud />}
        {(playing || over) && (
          <div class="text-gray-400 text-xs font-semibold tracking-widest">
            {formatTime(survivalTime.value)}
          </div>
        )}
      </div>

      <div class="flex items-center gap-2">
        {over && (
          <span class="text-red-400 text-sm font-extrabold uppercase tracking-wider">
            {gameOverReason.value}
          </span>
        )}
        <div class="hidden md:flex items-center gap-2">
          {start && (
            <button class="btn-cta text-sm py-2 px-5 w-auto" onClick={() => actions.startGame()}>
              START
            </button>
          )}
          {over && (
            <button class="btn-danger text-sm py-2 px-5 w-auto" onClick={() => actions.startGame()}>
              RETRY
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
