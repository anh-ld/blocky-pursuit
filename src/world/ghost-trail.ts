import * as THREE from "three";
import { CAR_UNIT } from "../entities/car-mesh";

// Fading car-shaped ghost trail rendered behind the player while nitro is
// active. Pure visual juice — no physics, no gameplay impact, just sells
// the speed boost. Each ghost is a single shared box (no wheels/cabin
// detail; the silhouette is enough at the speeds we're moving).
//
// Pool size + capture interval are tuned together: 6 ghosts × 0.06s = 0.36s
// of trail length, which matches GHOST_LIFE so a fresh capture lands as the
// oldest one expires. Capacity never overflows.

const GHOST_POOL = 6;
const GHOST_INTERVAL = 0.06;
const GHOST_LIFE = 0.4;
const GHOST_PEAK_OPACITY = 0.45;

// Player car physics shape uses Box(unit*2, unit*1.5, unit*4) — match it
// here so the silhouette lines up with where the actual car is.
const GHOST_GEO = new THREE.BoxGeometry(CAR_UNIT * 4, CAR_UNIT * 3, CAR_UNIT * 8);
// The car body's shape is added with a (0, unit, 0) offset (see car.ts) so
// the visual chassis center sits CAR_UNIT above body.position. The ghost
// box is centered at its local origin, so we add this offset to position.y
// when capturing — otherwise the ghost half-sinks into the road.
const GHOST_Y_OFFSET = CAR_UNIT;

type IGhostSlot = {
  mesh: THREE.Mesh;
  material: THREE.MeshBasicMaterial;
  life: number;
  active: boolean;
};

const ghosts: IGhostSlot[] = [];
let captureAccum = 0;

export function initGhostTrail(scene: THREE.Scene) {
  if (ghosts.length > 0) return; // idempotent
  for (let i = 0; i < GHOST_POOL; i++) {
    // One material per slot so we can fade opacity independently. Color is
    // updated by `setGhostTrailColor` whenever the player swaps skins.
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(GHOST_GEO, material);
    mesh.visible = false;
    scene.add(mesh);
    ghosts.push({ mesh, material, life: 0, active: false });
  }
}

/** Recolor all ghost slots — call this whenever the player picks a new skin. */
export function setGhostTrailColor(hex: number) {
  for (const g of ghosts) g.material.color.setHex(hex);
}

/**
 * Frame hook. When `active` is true, drops a ghost copy of the player's
 * current transform every GHOST_INTERVAL seconds. When false, resets the
 * capture accumulator so the next nitro burst starts fresh.
 */
export function captureGhost(
  dt: number,
  active: boolean,
  position: { x: number; y: number; z: number },
  quaternion: { x: number; y: number; z: number; w: number },
) {
  if (!active) {
    captureAccum = 0;
    return;
  }
  captureAccum += dt;
  if (captureAccum < GHOST_INTERVAL) return;
  captureAccum = 0;
  // Find an inactive slot. Pool is sized such that we should always have
  // one free, but if not (huge dt spike), the capture is silently dropped.
  for (let i = 0; i < ghosts.length; i++) {
    const slot = ghosts[i];
    if (slot.active) continue;
    slot.mesh.position.set(position.x, position.y + GHOST_Y_OFFSET, position.z);
    slot.mesh.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    slot.material.opacity = GHOST_PEAK_OPACITY;
    slot.mesh.visible = true;
    slot.life = GHOST_LIFE;
    slot.active = true;
    return;
  }
}

export function updateGhostTrail(dt: number) {
  for (let i = 0; i < ghosts.length; i++) {
    const g = ghosts[i];
    if (!g.active) continue;
    g.life -= dt;
    if (g.life <= 0) {
      g.mesh.visible = false;
      g.material.opacity = 0;
      g.active = false;
      continue;
    }
    g.material.opacity = (g.life / GHOST_LIFE) * GHOST_PEAK_OPACITY;
  }
}

/** Hide every active ghost — called from startGame() so a restart is clean. */
export function clearGhostTrail() {
  captureAccum = 0;
  for (const g of ghosts) {
    g.mesh.visible = false;
    g.material.opacity = 0;
    g.active = false;
    g.life = 0;
  }
}
