import {
  screen,
  bestScore,
  totalRuns,
  copsDrowned,
  selectedSkin,
  actions,
  gameState,
} from "../state";
import { CAR_SKINS, isUnlocked } from "../entities/car-skins";

export function Garage() {
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };
  const progress = {
    best: bestScore.value,
    totalRuns: totalRuns.value,
    copsDrowned: copsDrowned.value,
    selectedSkin: selectedSkin.value,
  };
  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="bg-black/85 border border-amber-500/40 p-4 w-72 pointer-events-auto">
        <div class="text-amber-400 text-xs font-extrabold uppercase tracking-widest mb-3 text-center">
          Garage
        </div>
        <div class="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
          {CAR_SKINS.map((s) => {
            const unlocked = isUnlocked(s, progress);
            const isSelected = selectedSkin.value === s.id;
            return (
              <button
                disabled={!unlocked}
                onClick={() => unlocked && actions.selectSkin(s.id)}
                class={`p-2 border text-[10px] font-bold uppercase tracking-wider cursor-pointer flex flex-col items-center gap-1 ${
                  isSelected
                    ? "border-amber-400 bg-amber-500/20"
                    : unlocked
                    ? "border-gray-600 bg-gray-800/40 hover:bg-gray-700/60"
                    : "border-gray-800 bg-gray-900/40 opacity-50 cursor-not-allowed"
                }`}
              >
                <div
                  class="w-10 h-6"
                  style={{
                    background: `#${s.bodyColor.toString(16).padStart(6, "0")}`,
                    borderTop: `3px solid #${s.cabinColor.toString(16).padStart(6, "0")}`,
                  }}
                />
                <span class={isSelected ? "text-amber-300" : "text-gray-300"}>{s.name}</span>
                {!unlocked && (
                  <span class="text-gray-500 text-[9px] normal-case">🔒 {s.unlockHint}</span>
                )}
                {unlocked && (s.speedBonus > 0 || s.forceBonus > 0) && (
                  <span class="text-green-400 text-[9px]">
                    {s.speedBonus > 0 && `+${s.speedBonus}spd`} {s.forceBonus > 0 && `+pwr`}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={back}
          class="w-full mt-3 py-2 bg-gray-700 text-gray-300 text-xs font-extrabold uppercase tracking-wider hover:bg-gray-600 cursor-pointer"
        >
          BACK
        </button>
      </div>
    </div>
  );
}
