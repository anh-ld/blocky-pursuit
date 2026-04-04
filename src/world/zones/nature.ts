import * as THREE from "three";
import * as CANNON from "cannon-es";
import { pseudoRandom, TILE_SIZE } from "../terrain";
import type { Materials, Geometries } from "../materials";
import type { ChunkData } from "../city-generator";
import { addTree, addFlowers } from "../decorators";

export function placeNature(
  chunk: ChunkData,
  materials: Materials,
  geometries: Geometries,
  r1: number,
  r2: number,
  r3: number,
  x: number,
  z: number,
) {
  // 45% tree
  if (r1 > 0.55) {
    addTree(chunk, materials, geometries, x, z, r2, r3, false);
  }
  // 15% rock
  else if (r1 > 0.4) {
    const size = 1 + r2 * 2;
    const mesh = new THREE.Mesh(geometries.building, materials.rock);
    mesh.scale.set(size * 1.2, size * 0.7, size);
    mesh.position.set(x, (size * 0.7) / 2, z);
    mesh.castShadow = true;
    chunk.group.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3((size * 1.2) / 2, (size * 0.7) / 2, size / 2));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(x, (size * 0.7) / 2, z);
    chunk.world.addBody(body);
    chunk.bodies.push(body);
  }
  // 15% flowers
  else if (r1 > 0.25) {
    addFlowers(chunk, materials, geometries, x, z, r2, r3);
  }
}

export function placeWaterDecor(
  chunk: ChunkData,
  materials: Materials,
  geometries: Geometries,
  globalTileX: number,
  globalTileZ: number,
  worldX: number,
  worldZ: number,
) {
  // Physics wall
  const waterShape = new CANNON.Box(new CANNON.Vec3(TILE_SIZE / 2, 2, TILE_SIZE / 2));
  const waterBody = new CANNON.Body({ mass: 0 });
  waterBody.addShape(waterShape);
  waterBody.position.set(worldX, 2, worldZ);
  chunk.world.addBody(waterBody);
  chunk.bodies.push(waterBody);

  // Lily pads
  const lilyR = pseudoRandom(globalTileX, globalTileZ, 600);
  if (lilyR > 0.5) {
    const count = 1 + Math.floor(lilyR * 3);
    for (let lp = 0; lp < count; lp++) {
      const lx = worldX + (pseudoRandom(globalTileX, globalTileZ, 610 + lp) - 0.5) * 7;
      const lz = worldZ + (pseudoRandom(globalTileX, globalTileZ, 620 + lp) - 0.5) * 7;
      const size = 0.4 + pseudoRandom(globalTileX, globalTileZ, 630 + lp) * 0.5;
      const pad = new THREE.Mesh(geometries.building, materials.lilypad);
      pad.scale.set(size, 0.05, size);
      pad.position.set(lx, 0.03, lz);
      chunk.group.add(pad);

      // Occasional flower on lily pad
      if (pseudoRandom(globalTileX, globalTileZ, 640 + lp) > 0.6) {
        const flowerIdx = Math.floor(pseudoRandom(globalTileX, globalTileZ, 650 + lp) * materials.flower.length);
        const f = new THREE.Mesh(geometries.building, materials.flower[flowerIdx]);
        f.scale.set(0.2, 0.3, 0.2);
        f.position.set(lx, 0.15, lz);
        chunk.group.add(f);
      }
    }
  }
}
