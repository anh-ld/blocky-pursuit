import {
  screen,
  bestScore,
  totalRuns,
  copsDrowned,
  selectedSkin,
  actions,
  gameState,
} from "../state";
import { CAR_SKINS, isUnlocked, specPercent } from "../entities/car-skins";

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
      <div class="bg-black/85 border border-amber-500/40 p-4 w-80 pointer-events-auto">
        <div class="text-amber-400 text-xs font-extrabold uppercase tracking-widest mb-3 text-center">
          Garage
        </div>
        <div class="grid grid-cols-2 gap-2 max-h-96 overflow-y-auto">
          {CAR_SKINS.map((s) => {
            const unlocked = isUnlocked(s, progress);
            const isSelected = selectedSkin.value === s.id;
            const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
            // Map shape proportions to a small swatch silhouette
            const w = Math.round(s.shape.bodyW * 6);
            const h = Math.round((s.shape.bodyH + s.shape.cabinH) * 4 + 4);
            const cabinW = Math.round(s.shape.cabinW * 4);
            const cabinH = Math.round(s.shape.cabinH * 4);
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
                <div class="relative flex items-end justify-center" style={{ width: `${w + 8}px`, height: `${h + 4}px` }}>
                  <div
                    style={{
                      width: `${w}px`,
                      height: `${Math.max(4, Math.round(s.shape.bodyH * 6))}px`,
                      background: hex(s.bodyColor),
                    }}
                  />
                  <div
                    class="absolute"
                    style={{
                      bottom: `${Math.max(4, Math.round(s.shape.bodyH * 6))}px`,
                      width: `${cabinW}px`,
                      height: `${cabinH}px`,
                      background: hex(s.cabinColor),
                    }}
                  />
                  {s.shape.hasSpoiler && (
                    <div
                      class="absolute"
                      style={{
                        right: `${Math.round((w + 8 - cabinW) / 2 - 4)}px`,
                        bottom: `${Math.max(4, Math.round(s.shape.bodyH * 6))}px`,
                        width: "4px",
                        height: "3px",
                        background: hex(s.accentColor),
                      }}
                    />
                  )}
                </div>
                <span class={`text-center leading-tight ${isSelected ? "text-amber-300" : "text-gray-300"}`}>{s.name}</span>
                {!unlocked ? (
                  <span class="text-gray-500 text-[9px] normal-case">🔒 {s.unlockHint}</span>
                ) : (
                  <div class="w-full flex flex-col gap-0.5 mt-1">
                    {([
                      ["SPD", specPercent("topSpeed", s.specs)],
                      ["ACC", specPercent("acceleration", s.specs)],
                      ["HDL", specPercent("handling", s.specs)],
                      ["GRP", specPercent("grip", s.specs)],
                      ["STB", specPercent("stability", s.specs)],
                      ["BRK", specPercent("braking", s.specs)],
                      ["WGT", specPercent("weight", s.specs)],
                      ["END", specPercent("endurance", s.specs)],
                    ] as const).map(([label, pct]) => (
                      <div class="flex items-center gap-1">
                        <span class="text-gray-500 text-[8px] w-6">{label}</span>
                        <div class="flex-1 h-1 bg-gray-800">
                          <div
                            class={isSelected ? "h-full bg-amber-400" : "h-full bg-gray-400"}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
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
