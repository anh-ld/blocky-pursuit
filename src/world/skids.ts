import * as THREE from "three";

// Tire skid marks: small dark quads laid flat on the ground at the
// car's rear-wheel positions when the car is drifting (high lateral
// velocity) or boosting on nitro. Capped to keep draw count bounded.

type ISkid = {
  mesh: THREE.Mesh;
  age: number;
  life: number;
};

let skidScene: THREE.Scene | null = null;
const skids: ISkid[] = [];
const MAX_SKIDS = 200;

const SKID_GEO = new THREE.PlaneGeometry(0.45, 0.9);
const SKID_MAT = new THREE.MeshBasicMaterial({
  color: 0x111111,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
});

export function initSkids(scene: THREE.Scene) {
  skidScene = scene;
}

export function spawnSkid(x: number, z: number, headingY: number) {
  if (!skidScene) return;
  if (skids.length >= MAX_SKIDS) {
    const oldest = skids.shift()!;
    skidScene.remove(oldest.mesh);
  }
  // Material is shared, so per-skid opacity fade is handled by life timer
  // (we leave the shared material at full opacity and just remove on expiry).
  const mesh = new THREE.Mesh(SKID_GEO, SKID_MAT);
  mesh.position.set(x, 0.04, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.rotation.z = headingY;
  skidScene.add(mesh);
  skids.push({ mesh, age: 0, life: 3.0 });
}

export function updateSkids(dt: number) {
  if (!skidScene) return;
  for (let i = skids.length - 1; i >= 0; i--) {
    const s = skids[i];
    s.age += dt;
    if (s.age >= s.life) {
      skidScene.remove(s.mesh);
      skids.splice(i, 1);
    }
  }
}

export function clearSkids() {
  if (!skidScene) return;
  for (const s of skids) skidScene.remove(s.mesh);
  skids.length = 0;
}
