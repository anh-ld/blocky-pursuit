import { signal } from "@preact/signals";
import { loadProgress, saveProgress } from "./entities/car-skins";
import { StorageKey, storageGet } from "./storage";

export type IScreen = "howToPlay" | "leaderboard" | "feedback" | "garage" | "preGame" | "none";
export type IGameStateValue = "start" | "playing" | "paused" | "gameover";

export type ILeaderboardEntry = {
  name: string;
  score: number;
};

export type IWeather = "sunny" | "fog" | "rain" | "sunset" | "snowy";

export type IActions = {
  startGame: () => void;
  beginRun: () => void;
  installPwa: () => void;
  selectSkin: (skinId: string) => void;
  toggleSound: () => void;
  setWeather: (w: IWeather) => void;
  togglePause: () => void;
};

// --- Game state signals (written by main.ts game loop, read by UI) ---
export const gameState = signal<IGameStateValue>("start");
export const hp = signal(100);
export const score = signal(0);
export const level = signal(1);
export const survivalTime = signal(0);
// 0..1 fraction toward the next level threshold; powers the thin progress
// bar under the HUD level chip so long runs always have a visible carrot.
export const levelProgress = signal(0);
// Endgame heat tier — non-zero past max level. HUD shows a 🔥 chip and the
// cop spawn rate gets shaved by this much per tier. Pure-progression knob.
export const heat = signal(0);
// Damage-direction indicator state. `damageDirAngle` is the world-space
// angle (radians) from the player to the cop that just dealt damage. The
// `damageDirSeq` counter increments on every new hit so the UI can use it
// as a `useEffect` dep to re-trigger its fade animation.
export const damageDirAngle = signal(0);
export const damageDirSeq = signal(0);
export const gameOverReason = signal("BUSTED");
export const nitroRemaining = signal(0);
export const shieldUp = signal(false);
// New buff timers — non-zero values display a HUD chip while active.
export const scoreMultRemaining = signal(0);
export const timeWarpRemaining = signal(0);
export const magnetRemaining = signal(0);
export const ghostRemaining = signal(0);
export const tankRemaining = signal(0);
export const combo = signal(0);
export const comboTimerRatio = signal(0); // 0..1, fraction of decay window remaining
export const comboMultiplier = signal(1); // road-tile score multiplier from current combo
// True when the combo timer is about to expire on a non-trivial chain. Drives
// the HUD red pulse + audio tick warning so the player can rescue it.
export const comboInDanger = signal(false);
// 0..1, fraction of BUSTED_TIME_THRESHOLD elapsed — drives the warning vignette
// so the player can see the busted countdown and break free before game over.
export const bustedProgress = signal(0);

// Wreck screenshot — data URL of the canvas captured at the end of the
// dying slow-mo, used as the share-card hero background. Cleared on each
// new run; written by main.ts during the death-sequence frame.
export const wreckScreenshot = signal<string | null>(null);

// --- Per-run summary stats (shown on game-over) ---
export const runDrowned = signal(0);
export const runTopSpeed = signal(0);
export const runBiggestCombo = signal(0);
export const runDistance = signal(0);
// Score breakdown so the game-over panel can show players *how* they earned
// the final number — drives the strategy lever for the next run.
export const runTileScore = signal(0);
export const runComboScore = signal(0);
export const runCopScore = signal(0);

// --- Persistent progress (best, runs, drowned cops, selected skin) ---
const _initialProgress = loadProgress();
export const bestScore = signal(_initialProgress.best);
export const totalRuns = signal(_initialProgress.totalRuns);
export const copsDrowned = signal(_initialProgress.copsDrowned);
export const selectedSkin = signal(_initialProgress.selectedSkin);
export const isNewBest = signal(false);

function persist() {
  saveProgress({
    best: bestScore.value,
    totalRuns: totalRuns.value,
    copsDrowned: copsDrowned.value,
    selectedSkin: selectedSkin.value,
  });
}

export function saveBest(s: number): boolean {
  if (s > bestScore.value) {
    bestScore.value = s;
    persist();
    return true;
  }
  return false;
}

export function incrementRuns() {
  totalRuns.value += 1;
  persist();
}

export function addDrownedCops(n: number) {
  if (n <= 0) return;
  copsDrowned.value += n;
  persist();
}

export function setSelectedSkin(id: string) {
  selectedSkin.value = id;
  persist();
}

// --- UI state signals ---
export const screen = signal<IScreen>("howToPlay");
export const playerName = signal("");
export const leaderboardEntries = signal<ILeaderboardEntry[]>([]);
export const leaderboardLoading = signal(true);
export const canInstallPwa = signal(false);

// Mute state — initialized from localStorage so the button reflects the
// persisted preference even before the AudioContext is created.
export const audioMuted = signal(storageGet(StorageKey.Muted) === "1");

export const weather = signal<IWeather>("fog");

// --- Actions wired by main.ts ---
// Stub object so UI imports get a stable reference. main.ts must call
// `setActions()` exactly once at startup to register real handlers. Passing
// an `IActions` literal to setActions forces TypeScript to require every
// method *at the call site* — so partial registration is a compile error.
// Note: forgetting setActions entirely is still a silent no-op; the safety
// net is "you'll notice on first manual playtest", not the type system.
export const actions: IActions = {
  startGame: () => {},
  beginRun: () => {},
  installPwa: () => {},
  selectSkin: () => {},
  toggleSound: () => {},
  setWeather: () => {},
  togglePause: () => {},
};

export function setActions(impl: IActions) {
  Object.assign(actions, impl);
}
