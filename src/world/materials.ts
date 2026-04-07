import * as THREE from "three";
import { TILE_SIZE } from "./terrain";

const flat = { flatShading: true } as const;

export function createMaterials() {
  return {
    grass: new THREE.MeshStandardMaterial({ color: 0x81c784, roughness: 1.0, ...flat }),
    grassDark: new THREE.MeshStandardMaterial({ color: 0x66bb6a, roughness: 1.0, ...flat }),
    grassLight: new THREE.MeshStandardMaterial({ color: 0x9ccc65, roughness: 1.0, ...flat }),
    sand: new THREE.MeshStandardMaterial({ color: 0xf4e1a1, roughness: 1.0, ...flat }),
    dirt: new THREE.MeshStandardMaterial({ color: 0x8d6e63, roughness: 1.0, ...flat }),
    road: new THREE.MeshStandardMaterial({ color: 0x424242, roughness: 0.9, ...flat }),
    roadMark: new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5, ...flat }),
    water: new THREE.MeshStandardMaterial({
      color: 0x29b6f6,
      emissive: 0x0277bd,
      emissiveIntensity: 0.25,
      roughness: 0.15,
      metalness: 0.45,
      ...flat,
    }),
    waterDeep: new THREE.MeshStandardMaterial({
      color: 0x0d47a1,
      emissive: 0x01579b,
      emissiveIntensity: 0.18,
      roughness: 0.2,
      metalness: 0.5,
      ...flat,
    }),
    downtownColors: [
      0x78909c, 0x90a4ae, 0xb0bec5,
      0x80cbc4, 0x4db6ac,
      0xfff176, 0xffb74d,
    ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.3, metalness: 0.2, ...flat })),
    suburbColors: [
      0xef9a9a, 0xf48fb1,
      0xce93d8, 0x9fa8da,
      0x80cbc4, 0xa5d6a7,
      0xffe082, 0xffcc80,
      0xbcaaa4,
    ].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, metalness: 0.05, ...flat })),
    window: new THREE.MeshStandardMaterial({
      color: 0xbbdefb,
      emissive: 0x90caf9,
      emissiveIntensity: 0.3,
      roughness: 0.1,
      metalness: 0.4,
      ...flat,
    }),
    rooftopAC: new THREE.MeshStandardMaterial({ color: 0x757575, roughness: 0.9, ...flat }),
    tree: new THREE.MeshStandardMaterial({ color: 0x2d6a4f, roughness: 0.9, ...flat }),
    treeDark: new THREE.MeshStandardMaterial({ color: 0x1b5e20, roughness: 0.9, ...flat }),
    trunk: new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, ...flat }),
    rock: new THREE.MeshStandardMaterial({ color: 0x9e9e9e, roughness: 1.0, ...flat }),
    driveway: new THREE.MeshStandardMaterial({ color: 0xbdbdbd, roughness: 0.9, ...flat }),
    lilypad: new THREE.MeshStandardMaterial({ color: 0x4caf50, roughness: 0.8, ...flat }),
    flower: [0xe91e63, 0xffeb3b, 0x9c27b0, 0xff5722].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, ...flat }),
    ),
    log: new THREE.MeshStandardMaterial({ color: 0x6d4c41, roughness: 0.95, ...flat }),
    bush: [0x388e3c, 0x2e7d32, 0x558b2f, 0x33691e].map(
      (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, ...flat }),
    ),
    mushroomCap: new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.7, ...flat }),
    mushroomStem: new THREE.MeshStandardMaterial({ color: 0xfafafa, roughness: 0.9, ...flat }),
    reed: new THREE.MeshStandardMaterial({ color: 0x9e9d24, roughness: 0.95, ...flat }),
    cattail: new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.9, ...flat }),
  };
}

/**
 * Animate the shared water material so every water tile shimmers in unison.
 * Cheap — one material mutation per frame, regardless of how many water tiles
 * are visible. Wave is a slow sin sweep on emissive intensity + a subtle hue
 * push so the surface reads as a living body of water rather than a flat plane.
 */
export function tickWaterMaterial(materials: IMaterials, t: number) {
  const wave = Math.sin(t * 1.6) * 0.5 + 0.5; // 0..1
  materials.water.emissiveIntensity = 0.18 + wave * 0.22;
  materials.waterDeep.emissiveIntensity = 0.12 + wave * 0.18;
  // Subtle metalness shimmer so highlights drift across the surface.
  materials.water.metalness = 0.4 + wave * 0.2;
}

export type IMaterials = ReturnType<typeof createMaterials>;

export function createGeometries() {
  return {
    tile: new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
    building: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    sphere: new THREE.SphereGeometry(0.5, 8, 6),
  };
}

export type IGeometries = ReturnType<typeof createGeometries>;
