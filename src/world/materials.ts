import * as THREE from "three";
import { TILE_SIZE } from "./terrain";

const flat = { flatShading: true } as const;

export function createMaterials() {
  return {
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
  };
}

export type Materials = ReturnType<typeof createMaterials>;

export function createGeometries() {
  return {
    tile: new THREE.PlaneGeometry(TILE_SIZE, TILE_SIZE),
    building: new THREE.BoxGeometry(1, 1, 1),
  };
}

export type Geometries = ReturnType<typeof createGeometries>;
