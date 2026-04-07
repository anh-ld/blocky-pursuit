import * as THREE from "three";
import * as CANNON from "cannon-es";
import { pseudoRandom } from "../terrain";
import type { IMaterials, IGeometries } from "../materials";
import type { IChunkData } from "../city-generator";
import { addTree, addFlowers } from "../decorators";

export function placeNature(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  r1: number,
  r2: number,
  r3: number,
  x: number,
  z: number,
) {
  // 25% tree
  if (r1 > 0.75) {
    addTree(chunk, materials, geometries, x, z, r2, r3, false);
  }
  // 10% bush cluster
  else if (r1 > 0.65) {
    addBush(chunk, materials, geometries, x, z, r2, r3);
  }
  // 8% rock
  else if (r1 > 0.57) {
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
  // 5% fallen log
  else if (r1 > 0.52) {
    addLog(chunk, materials, geometries, x, z, r2, r3);
  }
  // 5% mushroom cluster
  else if (r1 > 0.47) {
    addMushrooms(chunk, materials, geometries, x, z, r2, r3);
  }
  // 7% flowers
  else if (r1 > 0.40) {
    addFlowers(chunk, materials, geometries, x, z, r2, r3);
  }
}

/**
 * Three-blob bush cluster — quick low-poly read of "shrub" without needing
 * a sphere material per instance. No physics body: cars roll right over.
 */
function addBush(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  x: number,
  z: number,
  r2: number,
  r3: number,
) {
  const colorIdx = Math.floor(r3 * materials.bush.length);
  const mat = materials.bush[colorIdx];
  const blobs = 2 + Math.floor(r2 * 3);
  for (let i = 0; i < blobs; i++) {
    const br = pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 700 + i);
    const bs = 0.7 + br * 0.7;
    const blob = new THREE.Mesh(geometries.sphere, mat);
    blob.scale.set(bs * 1.6, bs * 1.2, bs * 1.6);
    const ox = (pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 710 + i) - 0.5) * 1.4;
    const oz = (pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 720 + i) - 0.5) * 1.4;
    blob.position.set(x + ox, bs * 0.55, z + oz);
    blob.castShadow = true;
    chunk.group.add(blob);
  }
}

/**
 * Fallen log — cylinder rotated to horizontal. Has a physics body so cars
 * crashing through nature still feel solid contact, but the body is sized to
 * the visible mesh so it doesn't feel like an invisible wall.
 */
function addLog(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  x: number,
  z: number,
  r2: number,
  r3: number,
) {
  const length = 2.5 + r2 * 2;
  const radius = 0.35 + r3 * 0.25;
  const log = new THREE.Mesh(geometries.cylinder, materials.log);
  // Geometry is a unit cylinder along Y; scale length on Y, radius on X/Z,
  // then rotate Z=90° to lay it on its side along the world X axis.
  log.scale.set(radius * 2, length, radius * 2);
  log.rotation.z = Math.PI / 2;
  log.rotation.y = r2 * Math.PI; // random heading on the ground
  log.position.set(x, radius, z);
  log.castShadow = true;
  chunk.group.add(log);

  // Physics: AABB approximation oriented to the log's heading. Use a slightly
  // smaller half-extent so the visible log "embraces" the collider rather
  // than the collider sticking out.
  const halfX = (Math.abs(Math.cos(log.rotation.y)) * length + Math.abs(Math.sin(log.rotation.y)) * radius * 2) / 2;
  const halfZ = (Math.abs(Math.sin(log.rotation.y)) * length + Math.abs(Math.cos(log.rotation.y)) * radius * 2) / 2;
  const shape = new CANNON.Box(new CANNON.Vec3(halfX * 0.85, radius, halfZ * 0.85));
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(x, radius, z);
  chunk.world.addBody(body);
  chunk.bodies.push(body);
}

/**
 * 2-4 mushrooms with red caps. Pure decoration — no collider, no shadow on
 * the small ones. Cheap atmosphere fill for forest tiles.
 */
function addMushrooms(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  x: number,
  z: number,
  r2: number,
  r3: number,
) {
  const count = 2 + Math.floor(r2 * 3);
  for (let i = 0; i < count; i++) {
    const mr = pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 800 + i);
    const mx = x + (mr - 0.5) * 3;
    const mz = z + (pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 810 + i) - 0.5) * 3;
    const stemH = 0.3 + mr * 0.3;
    const stem = new THREE.Mesh(geometries.cylinder, materials.mushroomStem);
    stem.scale.set(0.18, stemH, 0.18);
    stem.position.set(mx, stemH / 2, mz);
    chunk.group.add(stem);

    const cap = new THREE.Mesh(geometries.sphere, materials.mushroomCap);
    const capR = 0.3 + r3 * 0.2;
    cap.scale.set(capR * 1.2, capR * 0.7, capR * 1.2);
    cap.position.set(mx, stemH + capR * 0.2, mz);
    chunk.group.add(cap);
  }
}

/**
 * Reeds + occasional cattail along the water's edge. Pure decoration. Called
 * from the city generator when a tile is land but borders water.
 */
export function placeShoreDecor(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  globalTileX: number,
  globalTileZ: number,
  worldX: number,
  worldZ: number,
) {
  const r = pseudoRandom(globalTileX, globalTileZ, 900);
  if (r < 0.4) return; // bare sand on some shore tiles for breathing room
  const count = 3 + Math.floor(r * 4);
  for (let i = 0; i < count; i++) {
    const rx = pseudoRandom(globalTileX, globalTileZ, 910 + i);
    const rz = pseudoRandom(globalTileX, globalTileZ, 920 + i);
    const lx = worldX + (rx - 0.5) * 7;
    const lz = worldZ + (rz - 0.5) * 7;
    const h = 0.6 + rx * 0.6;
    const reed = new THREE.Mesh(geometries.cylinder, materials.reed);
    reed.scale.set(0.08, h, 0.08);
    reed.position.set(lx, h / 2, lz);
    chunk.group.add(reed);
    // Occasional cattail head — dark brown sphere on a stalk.
    if (rz > 0.7) {
      const head = new THREE.Mesh(geometries.cylinder, materials.cattail);
      head.scale.set(0.13, 0.25, 0.13);
      head.position.set(lx, h + 0.1, lz);
      chunk.group.add(head);
    }
  }
}

export function placeWaterDecor(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  globalTileX: number,
  globalTileZ: number,
  worldX: number,
  worldZ: number,
) {
  // No physics wall — cars can drive into water (handled by game logic)

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
      // Sit on the new sunken water surface (-0.18) instead of ground level.
      pad.position.set(lx, -0.13, lz);
      chunk.group.add(pad);

      // Occasional flower on lily pad
      if (pseudoRandom(globalTileX, globalTileZ, 640 + lp) > 0.6) {
        const flowerIdx = Math.floor(pseudoRandom(globalTileX, globalTileZ, 650 + lp) * materials.flower.length);
        const f = new THREE.Mesh(geometries.building, materials.flower[flowerIdx]);
        f.scale.set(0.2, 0.3, 0.2);
        f.position.set(lx, 0.0, lz);
        chunk.group.add(f);
      }
    }
  }
}
