export type ILevelDef = {
  maxCops: number;
  spawnInterval: number;
  scoreThreshold: number;
};

// Levels 1-5 are the "ramp" — each one introduces noticeably more cops or
// noticeably faster spawns. Levels 6-10 are the "endgame" where the player
// is already a strong driver and we keep the pressure rising. Past level 10
// the run plateaus at peak intensity (clamped in getLevelDef).
//
// Cop AI itself caps at level 5 in COP_LEVEL_CONFIGS — past that, the
// challenge comes purely from cop *count* and spawn cadence, not smarter AI.
export const LEVEL_DEFS: ILevelDef[] = [
  { maxCops: 3, spawnInterval: 4, scoreThreshold: 0 },     // Level 1 — medium start
  { maxCops: 5, spawnInterval: 3, scoreThreshold: 100 },    // Level 2 — ~10s in
  { maxCops: 6, spawnInterval: 2.5, scoreThreshold: 300 },  // Level 3 — ~30s
  { maxCops: 7, spawnInterval: 2, scoreThreshold: 600 },    // Level 4 — ~55s
  { maxCops: 8, spawnInterval: 1.5, scoreThreshold: 1000 }, // Level 5 — ~80s
  { maxCops: 9, spawnInterval: 1.3, scoreThreshold: 1500 }, // Level 6
  { maxCops: 10, spawnInterval: 1.1, scoreThreshold: 2200 }, // Level 7
  { maxCops: 11, spawnInterval: 1.0, scoreThreshold: 3000 }, // Level 8
  { maxCops: 12, spawnInterval: 0.9, scoreThreshold: 4000 }, // Level 9
  { maxCops: 13, spawnInterval: 0.8, scoreThreshold: 5500 }, // Level 10 — peak intensity
];

export function getLevelDef(level: number): ILevelDef {
  // Past the highest defined level, hold at peak — combo + skill is the
  // only progression beyond this point.
  const idx = Math.max(0, Math.min(level - 1, LEVEL_DEFS.length - 1));
  return LEVEL_DEFS[idx];
}
