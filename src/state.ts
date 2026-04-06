import { signal } from "@preact/signals";

export type IScreen = "howToPlay" | "leaderboard" | "feedback" | "none";
export type IGameStateValue = "start" | "playing" | "gameover";

export type ILeaderboardEntry = {
  name: string;
  score: number;
};

export type IActions = {
  startGame: () => void;
  installPwa: () => void;
};

// --- Game state signals (written by main.ts game loop, read by UI) ---
export const gameState = signal<IGameStateValue>("start");
export const hp = signal(100);
export const score = signal(0);
export const level = signal(1);
export const survivalTime = signal(0);
export const gameOverReason = signal("BUSTED");

// --- UI state signals ---
export const screen = signal<IScreen>("howToPlay");
export const playerName = signal("");
export const leaderboardEntries = signal<ILeaderboardEntry[]>([]);
export const leaderboardLoading = signal(true);
export const canInstallPwa = signal(false);

// --- Actions wired by main.ts ---
export const actions: IActions = {
  startGame: () => {},
  installPwa: () => {},
};
