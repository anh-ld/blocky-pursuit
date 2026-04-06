// Unlockable car skins. Color + small stat tweak.
// Unlock conditions are evaluated against persisted player progress.

export type ICarSkin = {
  id: string;
  name: string;
  bodyColor: number;
  cabinColor: number;
  speedBonus: number; // additive to base maxSpeed
  forceBonus: number; // additive to baseForwardForce
  unlock: {
    type: "default" | "best" | "totalRuns" | "copsDrowned";
    value: number;
  };
  unlockHint: string;
};

export const CAR_SKINS: ICarSkin[] = [
  {
    id: "redstar",
    name: "Red Star",
    bodyColor: 0xd32f2f,
    cabinColor: 0xffffff,
    speedBonus: 0,
    forceBonus: 0,
    unlock: { type: "default", value: 0 },
    unlockHint: "Default",
  },
  {
    id: "midnight",
    name: "Midnight",
    bodyColor: 0x1c1c1c,
    cabinColor: 0xeeeeee,
    speedBonus: 2,
    forceBonus: 0,
    unlock: { type: "best", value: 200 },
    unlockHint: "Score 200",
  },
  {
    id: "sunburst",
    name: "Sunburst",
    bodyColor: 0xffb300,
    cabinColor: 0x222222,
    speedBonus: 0,
    forceBonus: 15000,
    unlock: { type: "best", value: 500 },
    unlockHint: "Score 500",
  },
  {
    id: "jade",
    name: "Jade",
    bodyColor: 0x2e7d32,
    cabinColor: 0xffffff,
    speedBonus: 3,
    forceBonus: 0,
    unlock: { type: "best", value: 1000 },
    unlockHint: "Score 1k",
  },
  {
    id: "cottoncandy",
    name: "Cotton Candy",
    bodyColor: 0xec407a,
    cabinColor: 0xfff59d,
    speedBonus: 0,
    forceBonus: 25000,
    unlock: { type: "totalRuns", value: 5 },
    unlockHint: "Play 5 runs",
  },
  {
    id: "lava",
    name: "Lava",
    bodyColor: 0xbf360c,
    cabinColor: 0xffd180,
    speedBonus: 4,
    forceBonus: 10000,
    unlock: { type: "best", value: 2000 },
    unlockHint: "Score 2k",
  },
  {
    id: "phantom",
    name: "Phantom",
    bodyColor: 0x6a1b9a,
    cabinColor: 0xe1bee7,
    speedBonus: 5,
    forceBonus: 20000,
    unlock: { type: "copsDrowned", value: 10 },
    unlockHint: "Drown 10 cops",
  },
  {
    id: "platinum",
    name: "Platinum",
    bodyColor: 0xb0bec5,
    cabinColor: 0xffffff,
    speedBonus: 6,
    forceBonus: 30000,
    unlock: { type: "best", value: 3500 },
    unlockHint: "Score 3.5k",
  },
];

export function getSkin(id: string): ICarSkin {
  return CAR_SKINS.find((s) => s.id === id) || CAR_SKINS[0];
}

export type IProgress = {
  best: number;
  totalRuns: number;
  copsDrowned: number;
  selectedSkin: string;
};

const KEY = "bp:progress";

export function loadProgress(): IProgress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        best: p.best || 0,
        totalRuns: p.totalRuns || 0,
        copsDrowned: p.copsDrowned || 0,
        selectedSkin: p.selectedSkin || "redstar",
      };
    }
  } catch {}
  return { best: 0, totalRuns: 0, copsDrowned: 0, selectedSkin: "redstar" };
}

export function saveProgress(p: IProgress) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export function isUnlocked(skin: ICarSkin, p: IProgress): boolean {
  switch (skin.unlock.type) {
    case "default": return true;
    case "best": return p.best >= skin.unlock.value;
    case "totalRuns": return p.totalRuns >= skin.unlock.value;
    case "copsDrowned": return p.copsDrowned >= skin.unlock.value;
  }
}
