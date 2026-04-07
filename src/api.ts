import { attemptAsync } from "es-toolkit";
import { leaderboardEntries, leaderboardLoading, type ILeaderboardEntry } from "./state";

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

export async function submitScore(name: string, finalScore: number) {
  if (finalScore <= 0) return;
  if (DEV) return;
  await attemptAsync(() =>
    fetch("/.netlify/functions/submit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, score: Math.floor(finalScore) }),
    })
  );
}

const ADJECTIVES = ["Swift","Sneaky","Turbo","Crazy","Wild","Rapid","Slick","Bold","Lucky","Blazing","Nitro","Shadow","Ghost","Rogue","Neon"];
const NOUNS = ["Racer","Driver","Rider","Drifter","Runner","Chaser","Outlaw","Bandit","Cruiser","Phantom","Maverick","Bullet","Viper","Falcon","Wolf"];

function generateAnonName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 10000);
  return `${adj}${noun}${num}`;
}

export function getPlayerName(): string {
  let name = localStorage.getItem("blocky-pursuit-name");
  if (!name) {
    name = generateAnonName();
    localStorage.setItem("blocky-pursuit-name", name);
  }
  return name;
}
