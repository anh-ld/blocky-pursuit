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
import { CAR_SKINS, isUnlocked, specPercent, type ISpecKey } from "../entities/car-skins";
import { WEATHERS, getWeatherSummary } from "../world/weather";
import { CarPreview } from "./car-preview";
import { setPlayerName } from "../api";
import { IconSound, IconSoundOff } from "./icons";

const SPECS: Array<[string, ISpecKey]> = [
  ["SPD", "topSpeed"],
  ["ACC", "acceleration"],
  ["HDL", "handling"],
  ["END", "endurance"],
];

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
  const currentSkin = CAR_SKINS.find((s) => s.id === selectedSkin.value) ?? CAR_SKINS[0];

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[720px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col">
        <div class="px-5 pt-5 pb-3 border-b-2 border-[var(--line)] flex items-baseline justify-between">
          <h2 class="font-pixel text-[var(--amber)] text-xs leading-none" style={{ textShadow: "2px 2px 0 #000" }}>
            CHOOSE RIDE
          </h2>
          <span class="font-mono-ui text-[10px] text-[var(--text-mute)] uppercase tracking-widest">
            Tap a car to switch
          </span>
        </div>

        {/* Featured current car */}
        <div class="px-5 pt-4 pb-3 border-b-2 border-[var(--line)] flex gap-4 items-stretch">
          <div class="w-24 h-20 shrink-0">
            <CarPreview skin={currentSkin} />
          </div>
          <div class="flex-1 flex flex-col gap-1.5 min-w-0">
            <span class="font-pixel text-[var(--text)] text-[10px] leading-none truncate">{currentSkin.name}</span>
            <span class="font-mono-ui text-[10px] text-[var(--text-dim)] uppercase tracking-wider">
              {currentSkin.brand}
            </span>
            <div class="flex flex-col gap-[2px] mt-1">
              {SPECS.map(([label, key]) => (
                <div key={label} class="flex items-center gap-1.5">
                  <span class="font-mono-ui text-[8px] text-[var(--text-mute)] w-5">{label}</span>
                  <div class="flex-1 h-[3px] bg-[var(--bg-3)]">
                    <div
                      class="h-full bg-[var(--amber)]"
                      style={{ width: `${specPercent(key, currentSkin.specs)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Car carousel — horizontal scroll, tile is just the CarPreview (brand visible inside). */}
        <div class="px-5 py-3 border-b-2 border-[var(--line)]">
          <div class="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 snap-x">
            {CAR_SKINS.map((s) => {
              const unlocked = isUnlocked(s, progress);
              const isSelected = selectedSkin.value === s.id;
              return (
                <button
                  key={s.id}
                  disabled={!unlocked}
                  onClick={() => unlocked && actions.selectSkin(s.id)}
                  class={`shrink-0 w-24 h-14 snap-start cursor-pointer overflow-hidden ${
                    isSelected
                      ? "border-2 border-[var(--amber)]"
                      : unlocked
                        ? "border-2 border-[var(--line)] hover:border-[var(--line-2)]"
                        : "border-2 border-[var(--line)] opacity-50 cursor-not-allowed"
                  }`}
                >
                  <CarPreview skin={s} className="opacity-100" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Settings — flat rows, no boxes. Mono labels left, action right. */}
        <div class="px-5 py-3 flex flex-col gap-2.5">
          <Row label="Weather">
            <div class="flex items-stretch h-7">
              {WEATHERS.map((w, i) => {
                const active = currentWeather === w.id;
                return (
                  <button
                    key={w.id}
                    aria-label={w.label}
                    title={`${w.label} — ${getWeatherSummary(w.id)}`}
                    onClick={() => actions.setWeather(w.id)}
                    class={`w-7 h-7 flex items-center justify-center text-sm cursor-pointer border-y-2 border-r-2 ${
                      i === 0 ? "border-l-2" : ""
                    } ${
                      active
                        ? "bg-[var(--amber)] text-[#000] border-[var(--amber)]"
                        : "bg-[var(--bg-2)] text-[var(--text-dim)] border-[var(--line)] hover:text-[var(--amber)] hover:border-[var(--line-2)]"
                    }`}
                  >
                    {w.icon}
                  </button>
                );
              })}
            </div>
          </Row>
          <Row label="Sound">
            <button
              aria-label={muted ? "Unmute sound" : "Mute sound"}
              onClick={() => actions.toggleSound()}
              class="font-mono-ui text-[10px] font-bold uppercase tracking-wider text-[var(--text-dim)] hover:text-[var(--amber)] transition-colors flex items-center gap-1.5"
            >
              {muted ? <IconSoundOff size={14} /> : <IconSound size={14} />}
              <span style={{ color: muted ? "var(--text-dim)" : "var(--amber)" }}>{muted ? "Off" : "On"}</span>
            </button>
          </Row>
          <Row label="Player">
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
              class="bg-transparent text-right font-mono-ui text-[10px] font-bold text-[var(--text)] outline-none border-b-2 border-[var(--line)] focus:border-[var(--amber)] w-40 px-1"
            />
          </Row>
        </div>

        <div class="border-t-2 border-[var(--line)] p-4 flex flex-col gap-2 mt-auto">
          <button onClick={() => actions.beginRun()} class="arcade-btn w-full">
            Play
          </button>
          <button onClick={back} class="arcade-btn arcade-btn-ghost w-full">
            Back
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="flex items-center justify-between min-h-7">
      <span class="font-mono-ui text-[10px] text-[var(--text-mute)] uppercase tracking-widest">{label}</span>
      {children}
    </div>
  );
}
