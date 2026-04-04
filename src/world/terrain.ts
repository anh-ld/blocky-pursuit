export const CHUNK_SIZE = 60;
export const TILE_SIZE = 10;
export const TILES_PER_CHUNK = CHUNK_SIZE / TILE_SIZE; // 6x6

export const enum Zone {
  DOWNTOWN,
  SUBURBS,
  NATURE,
}

export function pseudoRandom(x: number, z: number, index: number = 0): number {
  let t = x * 1337 + z * 31337 + index * 101;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function zoneNoise(x: number, z: number): number {
  const scale = 12;
  const sx = Math.floor(x / scale);
  const sz = Math.floor(z / scale);
  const fx = x / scale - sx;
  const fz = z / scale - sz;
  const a = pseudoRandom(sx, sz, 200);
  const b = pseudoRandom(sx + 1, sz, 200);
  const c = pseudoRandom(sx, sz + 1, 200);
  const d = pseudoRandom(sx + 1, sz + 1, 200);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fz;
}

export function getZone(globalTileX: number, globalTileZ: number): Zone {
  const n = zoneNoise(globalTileX, globalTileZ);
  if (n < 0.35) return Zone.DOWNTOWN;
  if (n < 0.65) return Zone.SUBURBS;
  return Zone.NATURE;
}

export function isWater(globalTileX: number, globalTileZ: number): boolean {
  const zone = getZone(globalTileX, globalTileZ);
  if (zone !== Zone.NATURE) return false;
  const r = pseudoRandom(globalTileX, globalTileZ, 300);
  const riverX = pseudoRandom(Math.floor(globalTileX / 8), 0, 301);
  const riverZ = pseudoRandom(0, Math.floor(globalTileZ / 8), 302);
  if (riverX > 0.85 && r > 0.3) return true;
  if (riverZ > 0.85 && r > 0.3) return true;
  return false;
}

export function isRoad(globalTileX: number, globalTileZ: number): boolean {
  if (globalTileX === 0 || globalTileZ === 0) return true;

  const zone = getZone(globalTileX, globalTileZ);
  const rRoadX = pseudoRandom(globalTileX, 0, 10);
  const rRoadZ = pseudoRandom(0, globalTileZ, 11);

  switch (zone) {
    case Zone.DOWNTOWN:
      return rRoadX > 0.55 || rRoadZ > 0.55;
    case Zone.SUBURBS:
      return rRoadX > 0.75 || rRoadZ > 0.75;
    case Zone.NATURE:
      return rRoadX > 0.9 || rRoadZ > 0.9;
  }
}
