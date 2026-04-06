import { gameState } from "../state";

export function MobileControls() {
  const playing = gameState.value === "playing";
  return (
    <div
      class={`${playing ? "flex" : "hidden"} md:hidden w-full justify-between px-4 pb-4 pointer-events-auto`}
    >
      <button
        id="touch-left"
        class="w-18 h-18 bg-amber-400/80 active:bg-amber-300 flex items-center justify-center text-gray-900 text-3xl font-extrabold select-none"
        style={{ touchAction: "manipulation" }}
      >
        ←
      </button>
      <button
        id="touch-right"
        class="w-18 h-18 bg-amber-400/80 active:bg-amber-300 flex items-center justify-center text-gray-900 text-3xl font-extrabold select-none"
        style={{ touchAction: "manipulation" }}
      >
        →
      </button>
    </div>
  );
}
