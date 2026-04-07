import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CHUNK_SIZE, TILE_SIZE, TILES_PER_CHUNK, Zone, pseudoRandom, getZone, isRoad, isWater, isShore, isDeepWater } from "./terrain";
import { createMaterials, createGeometries, tickWaterMaterial, type IMaterials, type IGeometries } from "./materials";
import { placeDowntown } from "./zones/downtown";
import { placeSuburbs } from "./zones/suburbs";
import { placeNature, placeWaterDecor, placeShoreDecor } from "./zones/nature";

export { isRoad } from "./terrain";

export type IChunkData = {
  group: THREE.Group;
  bodies: CANNON.Body[];
  world: CANNON.World;
};

export class CityGenerator {
  scene: THREE.Scene;
  world: CANNON.World;
  chunks: Map<string, IChunkData>;
  materials: IMaterials;
  geometries: IGeometries;

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;
    this.chunks = new Map();
    this.materials = createMaterials();
    this.geometries = createGeometries();
  }

  /** Animate shared materials (water shimmer). Called every frame from main. */
  tick(timeSec: number) {
    tickWaterMaterial(this.materials, timeSec);
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
    const chunk: IChunkData = {
      group: new THREE.Group(),
      bodies: [],
      world: this.world,
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
        const isDeep = isWaterTile && isDeepWater(globalTileX, globalTileZ);
        const isShoreTile = !isRoadTile && !isWaterTile && isShore(globalTileX, globalTileZ);

        // Ground tile — pick material based on zone + role
        let groundMat = this.materials.grass;
        let tileY = 0.01;
        if (isRoadTile) {
          groundMat = this.materials.road;
        } else if (isWaterTile) {
          // Sunken so water reads as below the land surface — visible depth.
          groundMat = isDeep ? this.materials.waterDeep : this.materials.water;
          tileY = -0.18;
        } else if (isShoreTile) {
          groundMat = this.materials.sand;
        } else if (zone === Zone.NATURE) {
          // Ground variation: grass shades + occasional sand/dirt patches.
          const v = pseudoRandom(globalTileX, globalTileZ, 50);
          if (v < 0.08) groundMat = this.materials.dirt;
          else if (v < 0.16) groundMat = this.materials.sand;
          else if (v < 0.42) groundMat = this.materials.grassDark;
          else if (v < 0.72) groundMat = this.materials.grass;
          else groundMat = this.materials.grassLight;
        }

        const tileMesh = new THREE.Mesh(this.geometries.tile, groundMat);
        tileMesh.position.set(worldX, tileY, worldZ);
        tileMesh.rotation.x = -Math.PI / 2;
        tileMesh.receiveShadow = true;
        chunk.group.add(tileMesh);

        // Water
        if (isWaterTile) {
          placeWaterDecor(chunk, this.materials, this.geometries, globalTileX, globalTileZ, worldX, worldZ);
          continue;
        }

        // Shore: sand tile + reeds/cattails along the water edge
        if (isShoreTile) {
          placeShoreDecor(chunk, this.materials, this.geometries, globalTileX, globalTileZ, worldX, worldZ);
          continue;
        }

        // Road markings
        if (isRoadTile) {
          this.addRoadMarkings(chunk, globalTileX, globalTileZ, worldX, worldZ);
          continue;
        }

        // Zone objects
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
            placeDowntown(chunk, this.materials, this.geometries, r1, r2, r3, r4, finalX, finalZ);
            break;
          case Zone.SUBURBS:
            placeSuburbs(chunk, this.materials, this.geometries, r1, r2, r3, r4, finalX, finalZ);
            break;
          case Zone.NATURE:
            placeNature(chunk, this.materials, this.geometries, r1, r2, r3, finalX, finalZ);
            break;
        }
      }
    }

    this.chunks.set(`${chunkX},${chunkZ}`, chunk);
  }

  addRoadMarkings(chunk: IChunkData, tileX: number, tileZ: number, worldX: number, worldZ: number) {
    const roadN = isRoad(tileX, tileZ - 1);
    const roadS = isRoad(tileX, tileZ + 1);
    const roadE = isRoad(tileX + 1, tileZ);
    const roadW = isRoad(tileX - 1, tileZ);

    const isNS = roadN || roadS;
    const isEW = roadE || roadW;
    if (isNS && isEW) return;

    const dashR = pseudoRandom(tileX, tileZ, 100);
    if (dashR > 0.3) {
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

  unloadChunk(key: string, chunk: IChunkData) {
    this.scene.remove(chunk.group);
    for (const body of chunk.bodies) {
      this.world.removeBody(body);
    }
    this.chunks.delete(key);
  }
}
