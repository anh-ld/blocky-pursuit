/* Cached rounded-box building geometry, bucketed (w, h, d) to 0.5u → ~30-50 entries. */

import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

const _buildingGeoCache = new Map<string, THREE.BufferGeometry>();
/* Soft chamfer radius. 0.18 reads as "rounded building" at gameplay distance without eating the silhouette. */
const BUILDING_RADIUS = 0.18;
const BUILDING_SEGMENTS = 2;

export function getBuildingGeometry(width: number, height: number, depth: number): THREE.BufferGeometry {
  const key = `${Math.round(width * 2) / 2}_${Math.round(height * 2) / 2}_${Math.round(depth * 2) / 2}`;
  let geo = _buildingGeoCache.get(key);

  if (!geo) {
    geo = new RoundedBoxGeometry(width, height, depth, BUILDING_SEGMENTS, BUILDING_RADIUS);
    _buildingGeoCache.set(key, geo);
  }

  return geo;
}

/** Release every cached geometry. Called from CityGenerator.dispose() so a hot-reload / chunk clear doesn't leak GPU memory. */
export function disposeBuildingGeometries() {
  for (const g of _buildingGeoCache.values()) g.dispose();
  _buildingGeoCache.clear();
}
