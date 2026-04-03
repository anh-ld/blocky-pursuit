import * as THREE from "three";
import * as CANNON from "cannon-es";

const CHUNK_SIZE = 60; // 60x60 units
const TILE_SIZE = 10;
const TILES_PER_CHUNK = CHUNK_SIZE / TILE_SIZE; // 6x6

export function pseudoRandom(x: number, z: number, index: number = 0): number {
  let t = x * 1337 + z * 31337 + index * 101;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function isRoad(globalTileX: number, globalTileZ: number): boolean {
  if (globalTileX === 0 || globalTileZ === 0) return true;
  const rRoadX = pseudoRandom(globalTileX, 0, 10);
  const rRoadZ = pseudoRandom(0, globalTileZ, 11);
  return rRoadX > 0.75 || rRoadZ > 0.75;
}

export class CityGenerator {
  scene: THREE.Scene;
  world: CANNON.World;
  chunks: Map<string, { group: THREE.Group; bodies: CANNON.Body[] }>;
  materials: {
    grass: THREE.MeshStandardMaterial;
    road: THREE.MeshStandardMaterial;
    buildingColors: THREE.MeshStandardMaterial[];
    tree: THREE.MeshStandardMaterial;
    trunk: THREE.MeshStandardMaterial;
  };
  geometries: {
    tile: THREE.PlaneGeometry;
    building: THREE.BoxGeometry;
  };

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    this.chunks = new Map();

    // Materials
    this.materials = {
      grass: new THREE.MeshStandardMaterial({
        color: 0x81c784, // Soft pastel green
        roughness: 1.0,
        flatShading: true,
      }),
      road: new THREE.MeshStandardMaterial({
        color: 0x343a40, // Dark slate grey
        roughness: 0.9,
        flatShading: true,
      }),
      buildingColors: [
        0x8ecae6, 0x219ebc, 0x023047, 0xffb703, 0xfb8500, 0x2a9d8f, 0xe9c46a, 0xf4a261, 0xe76f51,
      ].map(
        (color) =>
          new THREE.MeshStandardMaterial({
            color,
            roughness: 0.5,
            metalness: 0.1,
            flatShading: true,
          }),
      ),
      tree: new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.9, flatShading: true }),
      trunk: new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, flatShading: true }),
    };

    // Geometries
    this.geometries = {
      tile: new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
      // We use a unit box and scale it for buildings
      building: new THREE.BoxGeometry(1, 1, 1),
    };
  }

  update(playerPosition: THREE.Vector3) {
    const currentChunkX = Math.floor(playerPosition.x / CHUNK_SIZE);
    const currentChunkZ = Math.floor(playerPosition.z / CHUNK_SIZE);

    const renderDistance = 2; // load 5x5 chunks around player
    const chunksToKeep = new Set();

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

    // Unload chunks out of range
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
        // Calculate center of the tile
        const worldX = startX + i * TILE_SIZE + TILE_SIZE / 2;
        const worldZ = startZ + j * TILE_SIZE + TILE_SIZE / 2;

        // Use global tile coordinates to determine road or block
        const globalTileX = Math.floor(worldX / TILE_SIZE);
        const globalTileZ = Math.floor(worldZ / TILE_SIZE);

        const isRoadTile = isRoad(globalTileX, globalTileZ);

        // Ground tile
        const tileMesh = new THREE.Mesh(
          this.geometries.tile,
          isRoadTile ? this.materials.road : this.materials.grass,
        );
        tileMesh.position.set(worldX, 0.01, worldZ); // slightly above 0 to avoid z-fighting with main ground
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.receiveShadow = true;
        chunk.group.add(tileMesh);

        if (!isRoadTile) {
          // Seeded random for building generation
          const r1 = pseudoRandom(globalTileX, globalTileZ, 1);
          const r2 = pseudoRandom(globalTileX, globalTileZ, 2);
          const r3 = pseudoRandom(globalTileX, globalTileZ, 3);
          const r4 = pseudoRandom(globalTileX, globalTileZ, 4);
          const r5 = pseudoRandom(globalTileX, globalTileZ, 5);

          // Random offset so they aren't perfectly centered on the grid
          const offsetX = (r2 - 0.5) * 6; // -3 to +3
          const offsetZ = (r5 - 0.5) * 6; // -3 to +3
          const finalX = worldX + offsetX;
          const finalZ = worldZ + offsetZ;

          // 15% chance of a small house/building
          if (r1 > 0.85) {
            // Much smaller elements to give plenty of space
            const height = 2 + r2 * 3; // 2 to 5 units tall
            const width = 3 + r3 * 3; // 3 to 6 units wide
            const depth = 3 + r4 * 3; // 3 to 6 units deep

            const colorIndex = Math.floor(r3 * this.materials.buildingColors.length);
            const buildingMat = this.materials.buildingColors[colorIndex];
            const buildingMesh = new THREE.Mesh(this.geometries.building, buildingMat);

            buildingMesh.scale.set(width, height, depth);
            buildingMesh.position.set(finalX, height / 2, finalZ);
            buildingMesh.castShadow = true;
            buildingMesh.receiveShadow = true;
            chunk.group.add(buildingMesh);

            // Physics
            const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
            const body = new CANNON.Body({ mass: 0 }); // Static body
            body.addShape(shape);
            body.position.set(finalX, height / 2, finalZ);
            this.world.addBody(body);
            chunk.bodies.push(body);
          }
          // 35% chance of a tree
          else if (r1 > 0.5) {
            const treeHeight = 1.5 + r2 * 2;

            // Trunk
            const trunkMesh = new THREE.Mesh(this.geometries.building, this.materials.trunk);
            trunkMesh.scale.set(0.6, treeHeight, 0.6);
            trunkMesh.position.set(finalX, treeHeight / 2, finalZ);
            trunkMesh.castShadow = true;
            chunk.group.add(trunkMesh);

            // Leaves (boxy)
            const leavesSize = 2 + r3 * 1.5;
            const leavesMesh = new THREE.Mesh(this.geometries.building, this.materials.tree);
            leavesMesh.scale.set(leavesSize, leavesSize, leavesSize);
            leavesMesh.position.set(finalX, treeHeight + leavesSize / 2 - 0.5, finalZ);
            leavesMesh.castShadow = true;
            chunk.group.add(leavesMesh);

            // Physics (just the trunk to allow driving under edges of leaves)
            // Make the trunk physics box thicker (1.2 units wide) so fast cars don't tunnel through it
            const shape = new CANNON.Box(new CANNON.Vec3(0.6, treeHeight / 2, 0.6));
            const body = new CANNON.Body({ mass: 0 });
            body.addShape(shape);
            body.position.set(finalX, treeHeight / 2, finalZ);
            this.world.addBody(body);
            chunk.bodies.push(body);
          }
        }
      }
    }

    this.chunks.set(`${chunkX},${chunkZ}`, chunk);
  }

  unloadChunk(key: string, chunk: { group: THREE.Group; bodies: CANNON.Body[] }) {
    // Remove visuals
    this.scene.remove(chunk.group);
    // Clean up geometries/materials if they are unique, but here we reuse them.

    // Remove physics
    for (const body of chunk.bodies) {
      this.world.removeBody(body);
    }

    this.chunks.delete(key);
  }
}
