import { gameState, actions } from "../state";

export function MobileCta() {
  const state = gameState.value;
  if (state === "playing") return null;
  const isStart = state === "start";
  return (
    <div class="flex w-full justify-center pb-6 pointer-events-auto">
      <button
        onClick={() => actions.startGame()}
        class={`${isStart ? "btn-cta" : "btn-danger"} text-sm py-2 px-6 w-auto`}
      >
        {isStart ? "START" : "RETRY"}
      </button>
    </div>
  );
}
