import * as THREE from "three";
import * as CANNON from "cannon-es";

const CHUNK_SIZE = 60;
const TILE_SIZE = 10;
const TILES_PER_CHUNK = CHUNK_SIZE / TILE_SIZE; // 6x6

// --- Zone system ---
// Zones repeat in a large-scale pattern based on tile coordinates.
// Uses low-frequency noise to create organic regions.
const enum Zone {
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

// Low-frequency noise for zone blending (sample at large scale)
function zoneNoise(x: number, z: number): number {
  // Sample at 1/12 tile frequency for large organic zones
  const scale = 12;
  const sx = Math.floor(x / scale);
  const sz = Math.floor(z / scale);
  // Bilinear-ish blend between corners
  const fx = (x / scale - sx);
  const fz = (z / scale - sz);
  const a = pseudoRandom(sx, sz, 200);
  const b = pseudoRandom(sx + 1, sz, 200);
  const c = pseudoRandom(sx, sz + 1, 200);
  const d = pseudoRandom(sx + 1, sz + 1, 200);
  const top = a + (b - a) * fx;
  const bot = c + (d - c) * fx;
  return top + (bot - top) * fz;
}

function getZone(globalTileX: number, globalTileZ: number): Zone {
  const n = zoneNoise(globalTileX, globalTileZ);
  if (n < 0.35) return Zone.DOWNTOWN;
  if (n < 0.65) return Zone.SUBURBS;
  return Zone.NATURE;
}

// --- Water detection ---
function isWater(globalTileX: number, globalTileZ: number): boolean {
  // Rivers flow along certain rows/columns in nature zones
  const zone = getZone(globalTileX, globalTileZ);
  if (zone !== Zone.NATURE) return false;
  // Use a separate noise channel for rivers
  const r = pseudoRandom(globalTileX, globalTileZ, 300);
  const riverX = pseudoRandom(Math.floor(globalTileX / 8), 0, 301);
  const riverZ = pseudoRandom(0, Math.floor(globalTileZ / 8), 302);
  // Thin river channels
  if (riverX > 0.85 && r > 0.3) return true;
  if (riverZ > 0.85 && r > 0.3) return true;
  return false;
}

export function isRoad(globalTileX: number, globalTileZ: number): boolean {
  if (globalTileX === 0 || globalTileZ === 0) return true;

  const zone = getZone(globalTileX, globalTileZ);

  // Road density varies by zone
  const rRoadX = pseudoRandom(globalTileX, 0, 10);
  const rRoadZ = pseudoRandom(0, globalTileZ, 11);

  switch (zone) {
    case Zone.DOWNTOWN:
      // Dense grid — more roads
      return rRoadX > 0.55 || rRoadZ > 0.55;
    case Zone.SUBURBS:
      // Medium density
      return rRoadX > 0.75 || rRoadZ > 0.75;
    case Zone.NATURE:
      // Sparse — only main roads
      return rRoadX > 0.9 || rRoadZ > 0.9;
  }
}

export class CityGenerator {
  scene: THREE.Scene;
  world: CANNON.World;
  chunks: Map<string, { group: THREE.Group; bodies: CANNON.Body[] }>;
  materials: {
    grass: THREE.MeshStandardMaterial;
    grassDark: THREE.MeshStandardMaterial;
    road: THREE.MeshStandardMaterial;
    roadMark: THREE.MeshStandardMaterial;
    water: THREE.MeshStandardMaterial;
    // Downtown: tall buildings, glass/steel colors
    downtownColors: THREE.MeshStandardMaterial[];
    // Suburbs: warm residential colors
    suburbColors: THREE.MeshStandardMaterial[];
    tree: THREE.MeshStandardMaterial;
    treeDark: THREE.MeshStandardMaterial;
    trunk: THREE.MeshStandardMaterial;
    rock: THREE.MeshStandardMaterial;
    flower: THREE.MeshStandardMaterial[];
  };
  geometries: {
    tile: THREE.PlaneGeometry;
    building: THREE.BoxGeometry;
  };

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    this.chunks = new Map();

    const flat = { flatShading: true } as const;

    this.materials = {
      grass: new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 1.0, ...flat }),
      grassDark: new THREE.MeshStandardMaterial({ color: 0x66bb6a, roughness: 1.0, ...flat }),
      road: new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.9, ...flat }),
      roadMark: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, ...flat }),
      water: new THREE.MeshStandardMaterial({
        color: 0x4fc3f7,
        roughness: 0.2,
        metalness: 0.3,
        ...flat,
      }),
      downtownColors: [
        0x78909c, 0x90a4ae, 0xb0bec5, // steel/concrete
        0x80cbc4, 0x4db6ac, // teal glass
        0xfff176, 0xffb74d, // accent panels
      ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.2, ...flat })),
      suburbColors: [
        0xef9a9a, 0xf48fb1, // pinks
        0xce93d8, 0x9fa8da, // purples/blues
        0x80cbc4, 0xa5d6a7, // greens
        0xffe082, 0xffcc80, // warm yellows
        0xbcaaa4, // brown
      ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.05, ...flat })),
      tree: new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.9, ...flat }),
      treeDark: new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.9, ...flat }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, ...flat }),
      rock: new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 1.0, ...flat }),
      flower: [0xe91e63, 0xffeb3b, 0x9c27b0, 0xff5722].map(
        (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...flat }),
      ),
    };

    this.geometries = {
      tile: new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
      building: new THREE.BoxGeometry(1, 1, 1),
    };
  }

  update(playerPosition: THREE.Vector3) {
    const currentChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const currentChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    const renderDistance = 2;
    const chunksToKeep = new Set<string>();

    for (let x = -renderDistance; x <= renderDistance; x++) {
      for (let z = -renderDistance; z <= renderDistance; z++) {
        const chunkX = currentChunkX + x;
        const chunkZ = currentChunkZ + z;
        const chunkKey = `${chunkX},${chunkZ}`;
        chunksToKeep.add(chunkKey);

        if (!this.chunks.has(chunkKey)) {
          this.generateChunk(chunkX, chunkZ);
        }
      }
    }

    for (const [key, chunk] of this.chunks.entries()) {
      if (!chunksToKeep.has(key)) {
        this.unloadChunk(key, chunk);
      }
    }
  }

  generateChunk(chunkX: number, chunkZ: number) {
    const chunk = {
      group: new THREE.Group(),
      bodies: [] as CANNON.Body[],
    };

    this.scene.add(chunk.group);

    const startX = chunkX * CHUNK_SIZE;
    const startZ = chunkZ * CHUNK_SIZE;

    for (let i = 0; i < TILES_PER_CHUNK; i++) {
      for (let j = 0; j < TILES_PER_CHUNK; j++) {
        const worldX = startX + i * TILE_SIZE + TILE_SIZE / 2;
        const worldZ = startZ + j * TILE_SIZE + TILE_SIZE / 2;

        const globalTileX = Math.floor(worldX / TILE_SIZE);
        const globalTileZ = Math.floor(worldZ / TILE_SIZE);

        const zone = getZone(globalTileX, globalTileZ);
        const isRoadTile = isRoad(globalTileX, globalTileZ);
        const isWaterTile = !isRoadTile && isWater(globalTileX, globalTileZ);

        // --- Ground tile ---
        let groundMat = this.materials.grass;
        if (isRoadTile) {
          groundMat = this.materials.road;
        } else if (isWaterTile) {
          groundMat = this.materials.water;
        } else if (zone === Zone.NATURE) {
          // Alternate grass tones
          groundMat = pseudoRandom(globalTileX, globalTileZ, 50) > 0.5
            ? this.materials.grass
            : this.materials.grassDark;
        }

        const tileMesh = new THREE.Mesh(this.geometries.tile, groundMat);
        tileMesh.position.set(worldX, 0.01, worldZ);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.receiveShadow = true;
        chunk.group.add(tileMesh);

        // --- Water: add physics wall (cars can't drive through) ---
        if (isWaterTile) {
          // Invisible wall to block cars
          const waterShape = new CANNON.Box(new CANNON.Vec3(TILE_SIZE / 2, 2, TILE_SIZE / 2));
          const waterBody = new CANNON.Body({ mass: 0 });
          waterBody.addShape(waterShape);
          waterBody.position.set(worldX, 2, worldZ);
          this.world.addBody(waterBody);
          chunk.bodies.push(waterBody);
          continue;
        }

        // --- Road markings ---
        if (isRoadTile) {
          this.addRoadMarkings(chunk, globalTileX, globalTileZ, worldX, worldZ);
          continue;
        }

        // --- Non-road, non-water: place objects based on zone ---
        const r1 = pseudoRandom(globalTileX, globalTileZ, 1);
        const r2 = pseudoRandom(globalTileX, globalTileZ, 2);
        const r3 = pseudoRandom(globalTileX, globalTileZ, 3);
        const r4 = pseudoRandom(globalTileX, globalTileZ, 4);
        const r5 = pseudoRandom(globalTileX, globalTileZ, 5);

        const offsetX = (r2 - 0.5) * 5;
        const offsetZ = (r5 - 0.5) * 5;
        const finalX = worldX + offsetX;
        const finalZ = worldZ + offsetZ;

        switch (zone) {
          case Zone.DOWNTOWN:
            this.placeDowntown(chunk, r1, r2, r3, r4, finalX, finalZ);
            break;
          case Zone.SUBURBS:
            this.placeSuburbs(chunk, r1, r2, r3, r4, finalX, finalZ);
            break;
          case Zone.NATURE:
            this.placeNature(chunk, r1, r2, r3, finalX, finalZ);
            break;
        }
      }
    }

    this.chunks.set(`${chunkX},${chunkZ}`, chunk);
  }

  // --- Road markings: center dashes and edge lines ---
  addRoadMarkings(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    tileX: number,
    tileZ: number,
    worldX: number,
    worldZ: number,
  ) {
    // Determine road direction by checking neighbors
    const roadN = isRoad(tileX, tileZ - 1);
    const roadS = isRoad(tileX, tileZ + 1);
    const roadE = isRoad(tileX + 1, tileZ);
    const roadW = isRoad(tileX - 1, tileZ);

    const isNS = roadN || roadS; // runs north-south
    const isEW = roadE || roadW; // runs east-west
    const isIntersection = isNS && isEW;

    // Skip markings at intersections
    if (isIntersection) return;

    // Dashed center line
    const dashR = pseudoRandom(tileX, tileZ, 100);
    if (dashR > 0.3) {
      // 70% of non-intersection road tiles get a dash
      const dashMesh = new THREE.Mesh(this.geometries.building, this.materials.roadMark);
      if (isNS) {
        dashMesh.scale.set(0.3, 0.02, 4);
      } else {
        dashMesh.scale.set(4, 0.02, 0.3);
      }
      dashMesh.position.set(worldX, 0.03, worldZ);
      chunk.group.add(dashMesh);
    }
  }


  // --- Downtown: tall buildings, dense, some gaps for car movement ---
  placeDowntown(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    r1: number,
    r2: number,
    r3: number,
    r4: number,
    x: number,
    z: number,
  ) {
    // 40% tall building
    if (r1 > 0.6) {
      const height = 6 + r2 * 14; // 6-20 tall
      const width = 4 + r3 * 4; // 4-8 wide
      const depth = 4 + r4 * 4;

      const colorIndex = Math.floor(r3 * this.materials.downtownColors.length);
      const mat = this.materials.downtownColors[colorIndex];
      const mesh = new THREE.Mesh(this.geometries.building, mat);
      mesh.scale.set(width, height, depth);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chunk.group.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(shape);
      body.position.set(x, height / 2, z);
      this.world.addBody(body);
      chunk.bodies.push(body);
    }
    // 15% small tree/planter
    else if (r1 > 0.45) {
      this.addTree(chunk, x, z, r2, r3, true);
    }
  }

  // --- Suburbs: houses, yards with trees, flowers ---
  placeSuburbs(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    r1: number,
    r2: number,
    r3: number,
    r4: number,
    x: number,
    z: number,
  ) {
    // 20% house
    if (r1 > 0.8) {
      const height = 2 + r2 * 3; // 2-5 tall
      const width = 3 + r3 * 4; // 3-7 wide
      const depth = 3 + r4 * 4;

      const colorIndex = Math.floor(r3 * this.materials.suburbColors.length);
      const mat = this.materials.suburbColors[colorIndex];
      const mesh = new THREE.Mesh(this.geometries.building, mat);
      mesh.scale.set(width, height, depth);
      mesh.position.set(x, height / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      chunk.group.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(shape);
      body.position.set(x, height / 2, z);
      this.world.addBody(body);
      chunk.bodies.push(body);
    }
    // 30% tree
    else if (r1 > 0.5) {
      this.addTree(chunk, x, z, r2, r3, false);
    }
    // 10% flowers
    else if (r1 > 0.4) {
      this.addFlowers(chunk, x, z, r2, r3);
    }
  }

  // --- Nature: dense trees, rocks, flowers, no buildings ---
  placeNature(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    r1: number,
    r2: number,
    r3: number,
    x: number,
    z: number,
  ) {
    // 45% tree
    if (r1 > 0.55) {
      this.addTree(chunk, x, z, r2, r3, false);
    }
    // 15% rock
    else if (r1 > 0.4) {
      const size = 1 + r2 * 2;
      const mesh = new THREE.Mesh(this.geometries.building, this.materials.rock);
      mesh.scale.set(size * 1.2, size * 0.7, size);
      mesh.position.set(x, (size * 0.7) / 2, z);
      mesh.castShadow = true;
      chunk.group.add(mesh);

      const shape = new CANNON.Box(new CANNON.Vec3((size * 1.2) / 2, (size * 0.7) / 2, size / 2));
      const body = new CANNON.Body({ mass: 0 });
      body.addShape(shape);
      body.position.set(x, (size * 0.7) / 2, z);
      this.world.addBody(body);
      chunk.bodies.push(body);
    }
    // 15% flowers
    else if (r1 > 0.25) {
      this.addFlowers(chunk, x, z, r2, r3);
    }
  }

  // --- Shared: tree placement ---
  addTree(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    x: number,
    z: number,
    r2: number,
    r3: number,
    small: boolean,
  ) {
    const treeHeight = small ? 1 + r2 * 1.5 : 1.5 + r2 * 2.5;
    const leafMat = r3 > 0.5 ? this.materials.tree : this.materials.treeDark;

    const trunkMesh = new THREE.Mesh(this.geometries.building, this.materials.trunk);
    trunkMesh.scale.set(0.6, treeHeight, 0.6);
    trunkMesh.position.set(x, treeHeight / 2, z);
    trunkMesh.castShadow = true;
    chunk.group.add(trunkMesh);

    const leavesSize = small ? 1.5 + r3 : 2 + r3 * 2;
    const leavesMesh = new THREE.Mesh(this.geometries.building, leafMat);
    leavesMesh.scale.set(leavesSize, leavesSize, leavesSize);
    leavesMesh.position.set(x, treeHeight + leavesSize / 2 - 0.5, z);
    leavesMesh.castShadow = true;
    chunk.group.add(leavesMesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.6, treeHeight / 2, 0.6));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(x, treeHeight / 2, z);
    this.world.addBody(body);
    chunk.bodies.push(body);
  }

  // --- Shared: flower clusters (decorative, no collision) ---
  addFlowers(
    chunk: { group: THREE.Group; bodies: CANNON.Body[] },
    x: number,
    z: number,
    r2: number,
    r3: number,
  ) {
    const count = 2 + Math.floor(r2 * 3);
    for (let f = 0; f < count; f++) {
      const fr = pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 60 + f);
      const fx = x + (fr - 0.5) * 4;
      const fz = z + (pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 70 + f) - 0.5) * 4;
      const colorIdx = Math.floor(r3 * this.materials.flower.length);
      const flower = new THREE.Mesh(this.geometries.building, this.materials.flower[colorIdx]);
      flower.scale.set(0.4, 0.6, 0.4);
      flower.position.set(fx, 0.3, fz);
      chunk.group.add(flower);
    }
  }

  unloadChunk(key: string, chunk: { group: THREE.Group; bodies: CANNON.Body[] }) {
    this.scene.remove(chunk.group);
    for (const body of chunk.bodies) {
      this.world.removeBody(body);
    }
    this.chunks.delete(key);
  }
}
