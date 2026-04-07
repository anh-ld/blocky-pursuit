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

/**
 * Deep-water variant — interior pixels of a body of water, away from the
 * shore. Used to draw a darker, more saturated tile so rivers/lakes read as
 * having depth instead of being a flat blue rectangle. Does not affect
 * gameplay (drown logic still uses isWater).
 */
export function isDeepWater(globalTileX: number, globalTileZ: number): boolean {
  if (!isWater(globalTileX, globalTileZ)) return false;
  return (
    isWater(globalTileX + 1, globalTileZ) &&
    isWater(globalTileX - 1, globalTileZ) &&
    isWater(globalTileX, globalTileZ + 1) &&
    isWater(globalTileX, globalTileZ - 1)
  );
}

/**
 * Shore = land tile in nature that touches a water tile. Drawn as sand and
 * decorated with reeds/cattails to soften the water-to-grass seam.
 */
export function isShore(globalTileX: number, globalTileZ: number): boolean {
  if (isWater(globalTileX, globalTileZ)) return false;
  if (getZone(globalTileX, globalTileZ) !== Zone.NATURE) return false;
  return (
    isWater(globalTileX + 1, globalTileZ) ||
    isWater(globalTileX - 1, globalTileZ) ||
    isWater(globalTileX, globalTileZ + 1) ||
    isWater(globalTileX, globalTileZ - 1)
  );
}

// Periodic roadblocks: break infinite straight roads every ~40 tiles
// Returns true if this tile is a blocked gap in an otherwise straight road
function isRoadBlocked(globalTileX: number, globalTileZ: number): boolean {
  // Check if this X-position is a blockage point for horizontal roads (roads that run along X)
  // Use a segment of ~20 tiles; each segment has one blockage position
  const segX = Math.floor(globalTileX / 40);
  const blockPosInSegX = Math.floor(pseudoRandom(segX, 0, 400) * 40);
  const isBlockedX = (((globalTileX % 40) + 40) % 40) === blockPosInSegX;

  // Same for vertical roads (roads that run along Z)
  const segZ = Math.floor(globalTileZ / 40);
  const blockPosInSegZ = Math.floor(pseudoRandom(0, segZ, 401) * 40);
  const isBlockedZ = (((globalTileZ % 40) + 40) % 40) === blockPosInSegZ;

  return isBlockedX || isBlockedZ;
}

export function isRoad(globalTileX: number, globalTileZ: number): boolean {
  const zone = getZone(globalTileX, globalTileZ);
  const rRoadX = pseudoRandom(globalTileX, 0, 10);
  const rRoadZ = pseudoRandom(0, globalTileZ, 11);

  let road = false;
  if (globalTileX === 0 || globalTileZ === 0) {
    road = true;
  } else {
    switch (zone) {
      case Zone.DOWNTOWN:
        road = rRoadX > 0.55 || rRoadZ > 0.55;
        break;
      case Zone.SUBURBS:
        road = rRoadX > 0.75 || rRoadZ > 0.75;
        break;
      case Zone.NATURE:
        road = rRoadX > 0.9 || rRoadZ > 0.9;
        break;
    }
  }

  if (!road) return false;

  // Don't block intersections (tiles where both an X-road and Z-road cross)
  // Only block straight stretches
  const isXRoad = globalTileX === 0 || rRoadX > (zone === Zone.DOWNTOWN ? 0.55 : zone === Zone.SUBURBS ? 0.75 : 0.9);
  const isZRoad = globalTileZ === 0 || rRoadZ > (zone === Zone.DOWNTOWN ? 0.55 : zone === Zone.SUBURBS ? 0.75 : 0.9);
  if (isXRoad && isZRoad) return true; // intersection — never block

  return !isRoadBlocked(globalTileX, globalTileZ);
}
