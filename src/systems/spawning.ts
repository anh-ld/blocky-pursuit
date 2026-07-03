import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Cop } from "../entities/cop";
import { Civilian } from "../entities/civilian";
import { isRoad } from "../world/city-generator";
import { TILE_SIZE } from "../world/terrain";
import { COP_SPAWN_DIST_MIN, COP_SPAWN_DIST_RANGE } from "../constants";

export type ISpawnCopArgs = {
  scene: THREE.Scene;
  world: CANNON.World;
  cops: Cop[];
  maxCops: number;
  level: number;
  playerPosition: THREE.Vector3;
  playerVelocity: CANNON.Vec3;
  /* SWAT mini-boss override. Bypasses maxCops check (lives outside the per-level cap) & sets the mini-boss flag. */
  isSwat?: boolean;
  isBounty?: boolean;
};

export function spawnCop(args: ISpawnCopArgs) {
  const { scene, world, cops, maxCops, level, playerPosition, playerVelocity, isSwat, isBounty } = args;
  if (!isSwat && cops.length >= maxCops) return;

  /* Spawn out of camera view */
  const distance = COP_SPAWN_DIST_MIN + Math.random() * COP_SPAWN_DIST_RANGE;

  /* 60% of the time, spawn AHEAD of the player's travel direction — prevents the "infinite straight road" exploit */
  let angle: number;
  const speed = playerVelocity.length();

  if (speed > 5 && Math.random() < 0.6) {
    const headingAngle = Math.atan2(playerVelocity.z, playerVelocity.x);
    angle = headingAngle + (Math.random() - 0.5) * (Math.PI / 2);
  } else {
    angle = Math.random() * Math.PI * 2;
  }

  const x = playerPosition.x + Math.cos(angle) * distance;
  const z = playerPosition.z + Math.sin(angle) * distance;

  let tileX = Math.round(x / TILE_SIZE);
  let tileZ = Math.round(z / TILE_SIZE);

  /* Snap to nearest road (preserves original behavior including in-place tile mutation) */
  let foundRoad = false;

  for (let r = 0; r < 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (isRoad(tileX + dx, tileZ + dz)) {
          tileX += dx;
          tileZ += dz;
          foundRoad = true;
          break;
        }
      }

      if (foundRoad) break;
    }

    if (foundRoad) break;
  }

  /* Bail if no road tile reachable — else cop spawns at the original tile, which may be water (free score) or in a building. */
  if (!foundRoad) return;

  const pos = new THREE.Vector3(tileX * TILE_SIZE, 1, tileZ * TILE_SIZE);
  const cop = new Cop(scene, world, pos, level, isSwat, isBounty);
  cops.push(cop);
}

export type ISpawnCivilianArgs = {
  scene: THREE.Scene;
  world: CANNON.World;
  civilians: Civilian[];
  maxCivilians: number;
  playerPosition: THREE.Vector3;
};

export function spawnCivilian(args: ISpawnCivilianArgs) {
  const { scene, world, civilians, maxCivilians, playerPosition } = args;
  if (civilians.length >= maxCivilians) return;

  const distance = 30 + Math.random() * 20;
  const angle = Math.random() * Math.PI * 2;

  const x = playerPosition.x + Math.cos(angle) * distance;
  const z = playerPosition.z + Math.sin(angle) * distance;

  let tileX = Math.floor(x / TILE_SIZE);
  let tileZ = Math.floor(z / TILE_SIZE);

  let foundRoad = false;

  for (let r = 0; r < 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (isRoad(tileX + dx, tileZ + dz)) {
          tileX += dx;
          tileZ += dz;
          foundRoad = true;
          break;
        }
      }

      if (foundRoad) break;
    }

    if (foundRoad) break;
  }

  if (!foundRoad) return;

  /* Spawn at tile center */
  const pos = new THREE.Vector3(tileX * TILE_SIZE + TILE_SIZE / 2, 1, tileZ * TILE_SIZE + TILE_SIZE / 2);
  civilians.push(new Civilian(scene, world, pos));
}
