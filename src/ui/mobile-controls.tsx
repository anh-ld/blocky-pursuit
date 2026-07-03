import { gameState } from "../state";
import { IconArrowLeft, IconArrowRight } from "./icons";

export function MobileControls() {
  const playing = gameState.value === "playing";

  return (
    <div class={`${playing ? "flex" : "hidden"} md:hidden w-full justify-between px-4 pb-5 pt-2 pointer-events-auto`}>
      <button
        id="touch-left"
        aria-label="Steer left"
        class="w-20 h-20 flex items-center justify-center text-[#000] cursor-pointer active:translate-y-0.5"
        style={{
          touchAction: "manipulation",
          background: "var(--amber)",
          border: "2px solid #000",
          borderBottomWidth: "5px",
        }}
      >
        <IconArrowLeft size={28} class="text-[#000]" />
      </button>
      <button
        id="touch-right"
        aria-label="Steer right"
        class="w-20 h-20 flex items-center justify-center text-[#000] cursor-pointer active:translate-y-0.5"
        style={{
          touchAction: "manipulation",
          background: "var(--amber)",
          border: "2px solid #000",
          borderBottomWidth: "5px",
        }}
      >
        <IconArrowRight size={28} class="text-[#000]" />
      </button>
    </div>
  );
}
