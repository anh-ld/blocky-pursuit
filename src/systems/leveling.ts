export type ILevelDef = {
  maxCops: number;
  spawnInterval: number;
  scoreThreshold: number;
  /* HP granted on entering this level. Per-level so the heal can ramp with the danger curve. */
  hpHeal: number;
  /* Probability of a bounty variant replacing a normal spawn. 0 = no bounty. */
  bountyRate: number;
  /* True once SWAT mini-bosses may spawn; cadence is owned by cop-system. */
  swatEnabled: boolean;
};

/* LV1-5 = ramp. LV6-10 = endgame (still rising). Past 10 = plateau. AI caps at LV5 — beyond, challenge = count/cadence. */
export const LEVEL_DEFS: ILevelDef[] = [
  {
    maxCops: 3,
    spawnInterval: 4,
    scoreThreshold: 0,
    hpHeal: 15,
    bountyRate: 0,
    swatEnabled: false,
  } /* Level 1 — medium start */,
  {
    maxCops: 5,
    spawnInterval: 3,
    scoreThreshold: 100,
    hpHeal: 15,
    bountyRate: 0.16,
    swatEnabled: false,
  } /* Level 2 — ~10s in */,
  {
    maxCops: 6,
    spawnInterval: 2.5,
    scoreThreshold: 300,
    hpHeal: 15,
    bountyRate: 0.16,
    swatEnabled: false,
  } /* Level 3 — ~30s */,
  {
    maxCops: 7,
    spawnInterval: 2,
    scoreThreshold: 600,
    hpHeal: 15,
    bountyRate: 0.16,
    swatEnabled: false,
  } /* Level 4 — ~55s */,
  {
    maxCops: 8,
    spawnInterval: 1.5,
    scoreThreshold: 1000,
    hpHeal: 15,
    bountyRate: 0.16,
    swatEnabled: false,
  } /* Level 5 — ~80s */,
  {
    maxCops: 9,
    spawnInterval: 1.3,
    scoreThreshold: 1500,
    hpHeal: 15,
    bountyRate: 0.16,
    swatEnabled: false,
  } /* Level 6 */,
  {
    maxCops: 10,
    spawnInterval: 1.1,
    scoreThreshold: 2200,
    hpHeal: 20,
    bountyRate: 0.16,
    swatEnabled: true,
  } /* Level 7 — SWAT unlocks */,
  {
    maxCops: 11,
    spawnInterval: 1.0,
    scoreThreshold: 3000,
    hpHeal: 20,
    bountyRate: 0.16,
    swatEnabled: true,
  } /* Level 8 */,
  {
    maxCops: 12,
    spawnInterval: 0.9,
    scoreThreshold: 4000,
    hpHeal: 20,
    bountyRate: 0.16,
    swatEnabled: true,
  } /* Level 9 */,
  {
    maxCops: 13,
    spawnInterval: 0.8,
    scoreThreshold: 5500,
    hpHeal: 25,
    bountyRate: 0.16,
    swatEnabled: true,
  } /* Level 10 — peak intensity */,
];

export function getLevelDef(level: number): ILevelDef {
  /* Past the highest defined level, hold at peak — combo + skill is the only progression beyond this point. */
  const idx = Math.max(0, Math.min(level - 1, LEVEL_DEFS.length - 1));
  return LEVEL_DEFS[idx];
}

/* Endgame heat: every HEAT_STEP_SCORE past max level adds a tier; each tier shaves spawn interval. */
const HEAT_STEP_SCORE = 1500;
export const HEAT_INTERVAL_SHAVE = 0.05;
export const HEAT_INTERVAL_FLOOR = 0.4;

/** Current heat tier (0 = pre-cap, 1+ = past max). Caller uses it for spawn-rate & HUD chip. */
export function getHeat(score: number, level: number): number {
  if (level < LEVEL_DEFS.length) return 0;
  const top = LEVEL_DEFS[LEVEL_DEFS.length - 1].scoreThreshold;
  if (score <= top) return 0;
  return Math.floor((score - top) / HEAT_STEP_SCORE) + 1;
}

/** 0..1 fraction between current level threshold & next. At max level, bar fills 1.0 — no "almost there" tease. */
export function getLevelProgress(score: number, level: number): number {
  if (level >= LEVEL_DEFS.length) return 1;
  const cur = LEVEL_DEFS[Math.max(0, level - 1)].scoreThreshold;
  const next = LEVEL_DEFS[level].scoreThreshold;
  if (next <= cur) return 1;
  return Math.max(0, Math.min(1, (score - cur) / (next - cur)));
}
