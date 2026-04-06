export type ILevelDef = {
  maxCops: number;
  spawnInterval: number;
  scoreThreshold: number;
};

export const LEVEL_DEFS: ILevelDef[] = [
  { maxCops: 3, spawnInterval: 4, scoreThreshold: 0 },     // Level 1 — medium start
  { maxCops: 5, spawnInterval: 3, scoreThreshold: 100 },    // Level 2 — ~10s in
  { maxCops: 6, spawnInterval: 2.5, scoreThreshold: 300 },  // Level 3 — ~30s
  { maxCops: 7, spawnInterval: 2, scoreThreshold: 600 },    // Level 4 — ~55s
  { maxCops: 8, spawnInterval: 1.5, scoreThreshold: 1000 }, // Level 5 — ~80s
];

export function getLevelDef(level: number): ILevelDef {
  return LEVEL_DEFS[level - 1];
}
