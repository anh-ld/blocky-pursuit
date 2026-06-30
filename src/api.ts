import { attemptAsync } from "es-toolkit";
import { leaderboardEntries, leaderboardLoading, type ILeaderboardEntry } from "./state";
import { StorageKey, storageGet, storageSet } from "./storage";

const DEV = import.meta.env.DEV;

export async function fetchLeaderboard() {
  leaderboardLoading.value = true;
  if (DEV) {
    leaderboardEntries.value = [];
    leaderboardLoading.value = false;
    return;
  }
  const [, entries] = await attemptAsync(async () => {
    const res = await fetch("/.netlify/functions/leaderboard");
    if (!res.ok) return [] as ILeaderboardEntry[];
    return (await res.json()) as ILeaderboardEntry[];
  });
  leaderboardEntries.value = entries ?? [];
  leaderboardLoading.value = false;
}

export async function submitScore(
  name: string,
  finalScore: number,
  recordingUrl?: string,
  sessionId?: string,
): Promise<boolean> {
  if (finalScore <= 0) return false;
  if (DEV) return true;
  const [, res] = await attemptAsync(() =>
    fetch("/.netlify/functions/submit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        score: Math.floor(finalScore),
        recordingUrl,
        sessionId,
      }),
    }),
  );
  return !!res?.ok;
}

/** Upload a finished recording for a top-50 score. Single-shot POST at gameOver, gated on cached top-50. */
export async function uploadRecording(
  recording: Blob,
  sessionId: string,
  playerName: string,
  score: number,
): Promise<string | null> {
  if (DEV) return null;

  /* Raw body + metadata in query string. EDGE (not sync) — sync caps bodies at ~4.5 MB, multipart 500'd. */
  const params = new URLSearchParams({
    sessionId,
    playerName,
    score: String(Math.floor(score)),
  });
  const url = `/api/upload-recording?${params.toString()}`;

  const [, res] = await attemptAsync(() =>
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": recording.type || "application/octet-stream" },
      body: recording,
    }),
  );
  if (!res) {
    console.warn("[recorder] Upload network error");
    return null;
  }
  if (!res.ok) {
    const [, text] = await attemptAsync(() => res.text());
    console.warn(`[recorder] Upload rejected ${res.status}: ${text ?? ""}`);
    return null;
  }

  const [, data] = await attemptAsync(() => res.json() as Promise<{ url?: string }>);
  return data?.url ?? null;
}

const ADJECTIVES = [
  "Swift",
  "Sneaky",
  "Turbo",
  "Crazy",
  "Wild",
  "Rapid",
  "Slick",
  "Bold",
  "Lucky",
  "Blazing",
  "Nitro",
  "Shadow",
  "Ghost",
  "Rogue",
  "Neon",
];
const NOUNS = [
  "Racer",
  "Driver",
  "Rider",
  "Drifter",
  "Runner",
  "Chaser",
  "Outlaw",
  "Bandit",
  "Cruiser",
  "Phantom",
  "Maverick",
  "Bullet",
  "Viper",
  "Falcon",
  "Wolf",
];

function generateAnonName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 10000);
  return `${adj}${noun}${num}`;
}

export function getPlayerName(): string {
  let name = storageGet(StorageKey.PlayerName);
  if (!name) {
    name = generateAnonName();
    storageSet(StorageKey.PlayerName, name);
  }
  return name;
}

/* Names < this are collision-prone on shared leaderboard — append random 4-digit tag. */
const MIN_UNIQUE_NAME_LEN = 6;

/**
 * Sanitize and persist a user-edited name. Mirrors the server-side rules in
 * netlify/functions/submit-score.mts so what the player types is exactly what
 * the leaderboard will accept (no surprise rejections at submit time).
 *
 * - Strips disallowed characters, caps at 20 chars, trims whitespace
 * - Empty → fresh anonymous name
 * - Too short (< 6 chars) → append a 4-digit tag so "Al" becomes "Al4821"
 */
export function setPlayerName(raw: string): string {
  const cleaned = raw
    .slice(0, 20)
    .replace(/[^a-zA-Z0-9 _-]/g, "")
    .trim();
  let final: string;
  if (!cleaned) {
    final = generateAnonName();
  } else if (cleaned.length < MIN_UNIQUE_NAME_LEN) {
    const tag = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    final = `${cleaned}${tag}`.slice(0, 20);
  } else {
    final = cleaned;
  }
  storageSet(StorageKey.PlayerName, final);
  return final;
}
