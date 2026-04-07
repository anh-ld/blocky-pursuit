import {
  bestScore,
  totalRuns,
  copsDrowned,
  selectedSkin,
  audioMuted,
  weather,
  actions,
  gameState,
  screen,
  playerName,
} from "../state";
import { CAR_SKINS, isUnlocked, specPercent } from "../entities/car-skins";
import { WEATHERS, getWeatherSummary } from "../world/weather";
import { CarPreview } from "./car-preview";
import { setPlayerName } from "../api";

export function PreGame() {
  const progress = {
    best: bestScore.value,
    totalRuns: totalRuns.value,
    copsDrowned: copsDrowned.value,
    selectedSkin: selectedSkin.value,
  };
  const muted = audioMuted.value;
  const currentWeather = weather.value;
  const back = () => {
    screen.value = gameState.value === "start" ? "howToPlay" : "none";
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="bg-black/60 md:bg-black p-4 w-full h-full md:w-80 md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col gap-3">
        <div class="text-amber-400 text-xs font-extrabold uppercase tracking-widest text-center">
          Choose Your Ride
        </div>

        {/* Car grid */}
        <div class="grid grid-cols-2 gap-2 md:max-h-96 overflow-y-auto py-2">
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
                <div class="w-full">
                  <CarPreview skin={s} />
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

        {/* Weather row */}
        <div class="flex flex-col gap-1">
          <div class="flex items-center justify-between">
            <span class="text-gray-500 text-[10px] uppercase tracking-widest">Weather</span>
            <span class="text-gray-400 text-[9px] tracking-wide truncate ml-2">
              {getWeatherSummary(currentWeather)}
            </span>
          </div>
          <div class="flex items-stretch bg-black/60 h-9">
            {WEATHERS.map((w) => {
              const active = currentWeather === w.id;
              return (
                <button
                  key={w.id}
                  aria-label={w.label}
                  title={`${w.label} — ${getWeatherSummary(w.id)}`}
                  onClick={() => actions.setWeather(w.id)}
                  class={`flex-1 text-sm leading-none cursor-pointer flex items-center justify-center ${
                    active ? "bg-amber-500/30 text-amber-300" : "text-gray-400 hover:text-amber-400"
                  }`}
                >
                  {w.icon}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sound row */}
        <div class="flex items-center justify-between px-3 h-9">
          <span class="text-gray-500 text-[10px] uppercase tracking-widest">Sound</span>
          <button
            aria-label={muted ? "Unmute sound" : "Mute sound"}
            onClick={() => actions.toggleSound()}
            class={`text-xs font-bold uppercase tracking-wider cursor-pointer hover:text-amber-400 ${
              muted ? "text-gray-500" : "text-amber-300"
            }`}
          >
            {muted ? "Off" : "On"}
          </button>
        </div>

        {/* Player row — editable, syncs to localStorage on blur/Enter */}
        <div class="flex items-center justify-between px-3 h-9">
          <span class="text-gray-500 text-[10px] uppercase tracking-widest">Player</span>
          <input
            type="text"
            value={playerName.value}
            maxLength={20}
            spellcheck={false}
            aria-label="Player name"
            onBlur={(e) => {
              const next = setPlayerName((e.target as HTMLInputElement).value);
              playerName.value = next;
              (e.target as HTMLInputElement).value = next;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            }}
            class="ml-2 bg-transparent text-right text-gray-300 text-xs font-bold truncate outline-none border-b border-gray-700 focus:border-amber-400 w-40"
          />
        </div>

        <div class="mt-auto md:mt-0 flex flex-col gap-2 sticky md:static bottom-0 -mx-4 md:mx-0 px-4 md:px-0">
          {/* Play button */}
          <button
            onClick={() => actions.beginRun()}
            class="w-full py-2 bg-amber-400 text-gray-900 text-xs font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
          >
            PLAY
          </button>

          {/* Back button — matches garage / leaderboard / feedback */}
          <button
            onClick={back}
            class="w-full py-2 bg-gray-700 text-gray-300 text-xs font-extrabold uppercase tracking-wider hover:bg-gray-600 cursor-pointer"
          >
            BACK
          </button>
        </div>
      </div>
    </div>
  );
}
