import * as THREE from "three";
import { CAR_UNIT } from "../entities/car-mesh";

/* Fading car-shaped ghost trail behind player on nitro. Visual juice only — no physics, no gameplay impact. */
/* Single shared box per ghost (no wheels/cabin detail; silhouette enough at speed). */
/* Pool + interval tuned: 6 × 0.06s = 0.36s trail = GHOST_LIFE, fresh capture lands as oldest expires. */

const GHOST_POOL = 6;
const GHOST_INTERVAL = 0.06;
const GHOST_LIFE = 0.4;
const GHOST_PEAK_OPACITY = 0.45;

/* Match player car physics shape Box(unit*2, unit*1.5, unit*4) so silhouette lines up with the actual car. */
const GHOST_GEO = new THREE.BoxGeometry(CAR_UNIT * 4, CAR_UNIT * 3, CAR_UNIT * 8);
/* Car body shape added with (0, unit, 0) offset (see car.ts): visual chassis center sits CAR_UNIT above body.position. */
/* Ghost box centered at local origin — add this offset to position.y on capture or ghost half-sinks. */
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
  if (ghosts.length > 0) return; /* idempotent */

  for (let i = 0; i < GHOST_POOL; i++) {
    /* One material per slot — fade opacity independently. Color updated by setGhostTrailColor on skin swap. */
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

/** Frame hook. `active` → drop ghost copy of player transform every GHOST_INTERVAL s. False → reset accumulator. */
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

  /* Find an inactive slot. Pool is sized so one is always free; if not (huge dt spike), drop silently. */
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
