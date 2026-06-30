import { screen, bestScore, totalRuns, copsDrowned, selectedSkin, actions, gameState } from "../state";
import { CAR_SKINS, isUnlocked, specPercent, type ISpecKey } from "../entities/car-skins";
import { CarPreview } from "./car-preview";
import { IconLock } from "./icons";

const SPECS: Array<[string, ISpecKey]> = [
  ["SPD", "topSpeed"],
  ["ACC", "acceleration"],
  ["HDL", "handling"],
  ["GRP", "grip"],
  ["STB", "stability"],
  ["BRK", "braking"],
  ["WGT", "weight"],
  ["END", "endurance"],
];

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
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[720px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col">
        <div class="px-5 pt-5 pb-3 flex items-baseline justify-between border-b-2 border-[var(--line)]">
          <h2
            class="font-pixel text-[var(--amber)] text-xs leading-none"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            GARAGE
          </h2>
          <span class="font-mono-ui text-[10px] text-[var(--text-mute)] uppercase tracking-widest">
            {CAR_SKINS.filter((s) => isUnlocked(s, progress)).length}/{CAR_SKINS.length} unlocked
          </span>
        </div>

        <div class="flex-1 overflow-y-auto p-4 grid grid-cols-2 md:grid-cols-3 gap-2">
          {CAR_SKINS.map((s) => {
            const unlocked = isUnlocked(s, progress);
            const isSelected = selectedSkin.value === s.id;
            return (
              <button
                disabled={!unlocked}
                onClick={() => unlocked && actions.selectSkin(s.id)}
                class={`p-2 text-left cursor-pointer flex flex-col gap-1.5 transition-colors ${
                  isSelected
                    ? "bg-[var(--bg-3)] border-2 border-[var(--amber)]"
                    : unlocked
                      ? "bg-[var(--bg-2)] border-2 border-[var(--line)] hover:border-[var(--line-2)]"
                      : "bg-[var(--bg-1)] border-2 border-[var(--line)] opacity-50 cursor-not-allowed"
                }`}
              >
                <div class="w-full h-16">
                  <CarPreview skin={s} />
                </div>
                <div class="flex flex-col gap-0.5">
                  <span
                    class={`font-mono-ui text-[10px] font-bold uppercase tracking-wider leading-tight ${
                      isSelected ? "text-[var(--amber)]" : "text-[var(--text)]"
                    }`}
                  >
                    {s.name}
                  </span>
                  {!unlocked ? (
                    <span class="font-mono-ui text-[8px] text-[var(--text-mute)] normal-case flex items-center gap-1">
                      <IconLock size={9} />
                      {s.unlockHint}
                    </span>
                  ) : (
                    <div class="flex flex-col gap-[2px] mt-0.5">
                      {SPECS.map(([label, key]) => (
                        <div key={label} class="flex items-center gap-1">
                          <span class="font-mono-ui text-[8px] text-[var(--text-mute)] w-5">{label}</span>
                          <div class="flex-1 h-[3px] bg-[var(--bg-3)]">
                            <div
                              class="h-full"
                              style={{
                                width: `${specPercent(key, s.specs)}%`,
                                background: isSelected ? "var(--amber)" : "var(--text-dim)",
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div class="border-t-2 border-[var(--line)] p-4">
          <button onClick={back} class="arcade-btn arcade-btn-ghost w-full">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
