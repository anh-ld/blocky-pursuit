import { signal } from "@preact/signals";
import { attempt } from "es-toolkit";
import { loadProgress, saveProgress } from "./entities/car-skins";

export type IScreen = "howToPlay" | "leaderboard" | "feedback" | "garage" | "none";
export type IGameStateValue = "start" | "playing" | "gameover";

export type ILeaderboardEntry = {
  name: string;
  score: number;
};

export type IActions = {
  startGame: () => void;
  installPwa: () => void;
  selectSkin: (skinId: string) => void;
  toggleSound: () => void;
};

// --- Game state signals (written by main.ts game loop, read by UI) ---
export const gameState = signal<IGameStateValue>("start");
export const hp = signal(100);
export const score = signal(0);
export const level = signal(1);
export const survivalTime = signal(0);
export const gameOverReason = signal("BUSTED");
export const nitroRemaining = signal(0);
export const shieldUp = signal(false);

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
const [, _storedMute] = attempt(() => localStorage.getItem("bp:muted"));
export const audioMuted = signal(_storedMute === "1");

// --- Actions wired by main.ts ---
export const actions: IActions = {
  startGame: () => {},
  installPwa: () => {},
  selectSkin: () => {},
  toggleSound: () => {},
};
