// Collectible cars. Each entry defines colors, body proportions, accents,
// and a small stat tweak. Unlock conditions are evaluated against persisted
// player progress.

import { attempt } from "es-toolkit";

export type ICarShape = {
  // All values are multipliers of CAR_UNIT (see car-mesh.ts).
  bodyW: number;
  bodyH: number;
  bodyL: number;
  cabinW: number;
  cabinH: number;
  cabinL: number;
  cabinZ: number; // forward(-) / rear(+) offset of cabin
  hasSpoiler: boolean;
  spoilerW: number;
  spoilerH: number;
  hasFlag: boolean; // Vietnam flag on roof (VinFast only)
  hasStripe: boolean; // racing stripe along the body length
};

export type ICarSpecs = {
  topSpeed: number;     // game units (~40..51)
  acceleration: number; // raw forward force (~150000..188000)
  handling: number;     // base turn rate (~2.4..3.1)
  grip: number;         // 0..100 — high = corners on rails, low = tail-happy / drifts
  stability: number;    // 0..100 — steering authority retained at high speed
  braking: number;      // 0..100 — how quickly the car bounces back from a crash
  weight: number;       // 0..100 — body mass; high = harder to push, hits harder
  endurance: number;    // 0..100 — collision damage reduction
};

export type ICarSkin = {
  id: string;
  name: string;
  brand: string;
  bodyColor: number;
  cabinColor: number;
  accentColor: number;
  wheelColor: number;
  shape: ICarShape;
  specs: ICarSpecs;
  unlock: {
    type: "default" | "best" | "totalRuns" | "copsDrowned";
    value: number;
  };
  unlockHint: string;
};

// Convert spec.weight (0..100) to a cannon body mass (kg-ish).
export function massForWeight(weight: number): number {
  return 80 + weight * 0.6;
}

// "Perceived" acceleration = raw force / mass. The display bar uses this so a
// heavy car with strong force still reads as moderate, matching how it feels.
export function perceivedAccel(specs: ICarSpecs): number {
  return specs.acceleration / massForWeight(specs.weight);
}

// Lineup-wide ranges used to render 0..100% stat bars in the garage.
const SPEC_RANGES = {
  topSpeed: [40, 51] as const,
  acceleration: [1430, 1740] as const, // perceived (force/mass)
  handling: [2.3, 3.2] as const,
  grip: [40, 92] as const,
  stability: [50, 92] as const,
  braking: [45, 90] as const,
  weight: [30, 90] as const,
  endurance: [35, 82] as const,
};

export type ISpecKey = keyof typeof SPEC_RANGES;

export function specPercent(key: ISpecKey, specs: ICarSpecs): number {
  const [lo, hi] = SPEC_RANGES[key];
  const value = key === "acceleration" ? perceivedAccel(specs) : specs[key];
  return Math.round(Math.max(0, Math.min(1, (value - lo) / (hi - lo))) * 100);
}

const BOXY_DEFAULT: ICarShape = {
  bodyW: 4.0,
  bodyH: 1.0,
  bodyL: 7.0,
  cabinW: 3.4,
  cabinH: 1.6,
  cabinL: 3.6,
  cabinZ: 0.6,
  hasSpoiler: false,
  spoilerW: 0,
  spoilerH: 0,
  hasFlag: true,
  hasStripe: false,
};

// Small compact runabout — short body, tall-ish cabin, no spoiler/flag.
// Used as the base shape for the free starter pool (Beetle, Mini, Fiat 500).
const SMALL_COMPACT: ICarShape = {
  bodyW: 3.6,
  bodyH: 1.0,
  bodyL: 5.6,
  cabinW: 3.0,
  cabinH: 1.5,
  cabinL: 3.0,
  cabinZ: 0.2,
  hasSpoiler: false,
  spoilerW: 0,
  spoilerH: 0,
  hasFlag: false,
  hasStripe: false,
};

const SPORT_LOW: ICarShape = {
  bodyW: 4.2,
  bodyH: 0.9,
  bodyL: 8.4,
  cabinW: 3.0,
  cabinH: 1.1,
  cabinL: 3.2,
  cabinZ: 0.4,
  hasSpoiler: true,
  spoilerW: 4.2,
  spoilerH: 0.4,
  hasFlag: false,
  hasStripe: false,
};

export const CAR_SKINS: ICarSkin[] = [
  {
    id: "vf3",
    name: "VinFast VF3",
    brand: "VinFast",
    bodyColor: 0xf2f2f2,
    cabinColor: 0x1a1a1a,
    accentColor: 0xda251d,
    wheelColor: 0x111111,
    shape: BOXY_DEFAULT,
    specs: {
      topSpeed: 40,
      acceleration: 150000,
      handling: 2.6,
      grip: 70,
      stability: 78,
      braking: 60,
      weight: 35,
      endurance: 70,
    },
    unlock: { type: "default", value: 0 },
    unlockHint: "Default",
  },
  {
    id: "vw_beetle",
    name: "VW Beetle",
    brand: "Volkswagen",
    bodyColor: 0x60a5fa,
    cabinColor: 0xe5e7eb,
    accentColor: 0x1e3a8a,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SMALL_COMPACT,
      // Beetle: rounder, slightly wider than other compacts.
      bodyW: 3.8,
      bodyH: 1.05,
      bodyL: 5.4,
      cabinW: 3.2,
      cabinH: 1.55,
      cabinL: 3.2,
      cabinZ: 0.0,
    },
    specs: {
      topSpeed: 41,
      acceleration: 152000,
      handling: 2.8,
      grip: 72,
      stability: 74,
      braking: 62,
      weight: 38,
      endurance: 68,
    },
    unlock: { type: "default", value: 0 },
    unlockHint: "Default",
  },
  {
    id: "mini_cooper",
    name: "Mini Cooper",
    brand: "Mini",
    bodyColor: 0xdc2626,
    cabinColor: 0xf5f5f5,
    accentColor: 0x111111,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SMALL_COMPACT,
      // Mini: tightest wheelbase in the lineup → twitchy handling.
      bodyW: 3.6,
      bodyH: 0.95,
      bodyL: 5.2,
      cabinW: 3.0,
      cabinH: 1.45,
      cabinL: 2.9,
      cabinZ: 0.3,
      hasStripe: true,
    },
    specs: {
      topSpeed: 42,
      acceleration: 158000,
      handling: 3.0,
      grip: 78,
      stability: 70,
      braking: 68,
      weight: 32,
      endurance: 55,
    },
    unlock: { type: "default", value: 0 },
    unlockHint: "Default",
  },
  {
    id: "fiat_500",
    name: "Fiat 500",
    brand: "Fiat",
    bodyColor: 0xfde047,
    cabinColor: 0x111111,
    accentColor: 0x166534,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SMALL_COMPACT,
      // Tiniest car in the lineup — short, narrow, tall cabin.
      bodyW: 3.4,
      bodyH: 1.0,
      bodyL: 5.0,
      cabinW: 2.9,
      cabinH: 1.6,
      cabinL: 2.8,
      cabinZ: 0.1,
    },
    specs: {
      topSpeed: 40,
      acceleration: 154000,
      handling: 2.9,
      grip: 74,
      stability: 68,
      braking: 65,
      weight: 30,
      endurance: 50,
    },
    unlock: { type: "default", value: 0 },
    unlockHint: "Default",
  },
  {
    id: "porsche_911",
    name: "Porsche 911",
    brand: "Porsche",
    bodyColor: 0xf5d000,
    cabinColor: 0x0a0a0a,
    accentColor: 0x1a1a1a,
    wheelColor: 0x222222,
    shape: {
      ...SPORT_LOW,
      bodyL: 8.4,
      bodyH: 0.95,
      cabinH: 1.2,
      cabinZ: 0.6,
      spoilerW: 3.6,
      spoilerH: 0.3,
    },
    specs: {
      topSpeed: 47,
      acceleration: 175000,
      handling: 3.0,
      grip: 85,
      stability: 80,
      braking: 75,
      weight: 40,
      endurance: 50,
    },
    unlock: { type: "best", value: 500 },
    unlockHint: "Score 500",
  },
  {
    id: "ferrari_f430",
    name: "Ferrari F430",
    brand: "Ferrari",
    bodyColor: 0xff1e1e,
    cabinColor: 0x111111,
    accentColor: 0xffd700,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SPORT_LOW,
      bodyW: 4.4,
      bodyH: 0.85,
      bodyL: 8.8,
      cabinW: 2.8,
      cabinH: 1.05,
      cabinL: 3.0,
      cabinZ: 0.9,
      spoilerW: 3.8,
      spoilerH: 0.35,
    },
    specs: {
      topSpeed: 48,
      acceleration: 178000,
      handling: 3.1,
      grip: 80,
      stability: 70,
      braking: 80,
      weight: 38,
      endurance: 45,
    },
    unlock: { type: "best", value: 1500 },
    unlockHint: "Score 1.5k",
  },
  {
    id: "lambo_aventador",
    name: "Lamborghini Aventador",
    brand: "Lamborghini",
    bodyColor: 0x4ade80,
    cabinColor: 0x050505,
    accentColor: 0x000000,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SPORT_LOW,
      bodyW: 4.6,
      bodyH: 0.75,
      bodyL: 9.0,
      cabinW: 2.6,
      cabinH: 0.95,
      cabinL: 2.8,
      cabinZ: 1.2,
      spoilerW: 4.4,
      spoilerH: 0.5,
    },
    specs: {
      topSpeed: 51,
      acceleration: 185000,
      handling: 2.7,
      grip: 65,
      stability: 55,
      braking: 70,
      weight: 70,
      endurance: 38,
    },
    unlock: { type: "best", value: 3000 },
    unlockHint: "Score 3k",
  },
  {
    id: "mustang_gt",
    name: "Ford Mustang GT",
    brand: "Ford",
    bodyColor: 0x141414,
    cabinColor: 0x222222,
    accentColor: 0xf5f5f5,
    wheelColor: 0x222222,
    shape: {
      bodyW: 4.4,
      bodyH: 1.1,
      bodyL: 8.6,
      cabinW: 3.2,
      cabinH: 1.35,
      cabinL: 3.4,
      cabinZ: 0.8,
      hasSpoiler: true,
      spoilerW: 3.6,
      spoilerH: 0.3,
      hasFlag: false,
      hasStripe: true,
    },
    specs: {
      topSpeed: 45,
      acceleration: 188000,
      handling: 2.4,
      grip: 45,
      stability: 65,
      braking: 50,
      weight: 85,
      endurance: 80,
    },
    unlock: { type: "totalRuns", value: 10 },
    unlockHint: "Play 10 runs",
  },
  {
    id: "corvette_c8",
    name: "Chevrolet Corvette C8",
    brand: "Chevrolet",
    bodyColor: 0xff6600,
    cabinColor: 0x0a0a0a,
    accentColor: 0x1a1a1a,
    wheelColor: 0x1a1a1a,
    shape: {
      ...SPORT_LOW,
      bodyW: 4.4,
      bodyH: 0.9,
      bodyL: 8.8,
      cabinW: 2.8,
      cabinH: 1.15,
      cabinL: 3.0,
      cabinZ: -0.4, // mid-engine: cabin sits forward of center
      spoilerW: 3.8,
      spoilerH: 0.35,
    },
    specs: {
      topSpeed: 47,
      acceleration: 180000,
      handling: 2.9,
      grip: 75,
      stability: 75,
      braking: 70,
      weight: 60,
      endurance: 55,
    },
    unlock: { type: "copsDrowned", value: 15 },
    unlockHint: "Drown 15 cops",
  },
  {
    id: "nissan_gtr",
    name: "Nissan GT-R R35",
    brand: "Nissan",
    bodyColor: 0x6b7280,
    cabinColor: 0x0a0a0a,
    accentColor: 0xef4444,
    wheelColor: 0x1a1a1a,
    shape: {
      bodyW: 4.4,
      bodyH: 1.0,
      bodyL: 8.6,
      cabinW: 3.0,
      cabinH: 1.3,
      cabinL: 3.4,
      cabinZ: 0.6,
      hasSpoiler: true,
      spoilerW: 4.4,
      spoilerH: 0.55,
      hasFlag: false,
      hasStripe: false,
    },
    specs: {
      topSpeed: 49,
      acceleration: 182000,
      handling: 3.1,
      grip: 90,
      stability: 90,
      braking: 85,
      weight: 75,
      endurance: 65,
    },
    unlock: { type: "best", value: 5000 },
    unlockHint: "Score 5k",
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
const DEFAULT_SKIN_ID = "vf3";

const DEFAULT_PROGRESS: IProgress = {
  best: 0,
  totalRuns: 0,
  copsDrowned: 0,
  selectedSkin: DEFAULT_SKIN_ID,
};

export function loadProgress(): IProgress {
  const [, parsed] = attempt(() => {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<IProgress>) : null;
  });
  if (!parsed) return { ...DEFAULT_PROGRESS };
  // Migrate any obsolete skin id (e.g. old "redstar" cars) back to default.
  const savedId = parsed.selectedSkin || DEFAULT_SKIN_ID;
  const skinExists = CAR_SKINS.some((s) => s.id === savedId);
  return {
    best: parsed.best || 0,
    totalRuns: parsed.totalRuns || 0,
    copsDrowned: parsed.copsDrowned || 0,
    selectedSkin: skinExists ? savedId : DEFAULT_SKIN_ID,
  };
}

export function saveProgress(p: IProgress) {
  attempt(() => localStorage.setItem(KEY, JSON.stringify(p)));
}

export function isUnlocked(skin: ICarSkin, p: IProgress): boolean {
  switch (skin.unlock.type) {
    case "default": return true;
    case "best": return p.best >= skin.unlock.value;
    case "totalRuns": return p.totalRuns >= skin.unlock.value;
    case "copsDrowned": return p.copsDrowned >= skin.unlock.value;
  }
}
