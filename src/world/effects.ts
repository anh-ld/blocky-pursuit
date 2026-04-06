import * as THREE from "three";

// --- Time slow (combo milestone juice) ---
// Brief gameplay slowdown when triggered. Game-loop scales physics + entity
// dt by getTimeSlowFactor() while particles/popups stay at real time.
let timeSlowTimer = 0;
const TIME_SLOW_DURATION = 0.4;
const TIME_SLOW_MIN_FACTOR = 0.35;

export function triggerTimeSlow() {
  timeSlowTimer = TIME_SLOW_DURATION;
}

/** 0..1 — multiply real dt by this for gameplay-affecting updates. */
export function getTimeSlowFactor(): number {
  if (timeSlowTimer <= 0) return 1;
  // Ease back toward 1 over the duration so the resume is smooth
  const t = 1 - timeSlowTimer / TIME_SLOW_DURATION;
  return TIME_SLOW_MIN_FACTOR + (1 - TIME_SLOW_MIN_FACTOR) * t;
}

export function updateTimeSlow(dt: number) {
  if (timeSlowTimer > 0) timeSlowTimer = Math.max(0, timeSlowTimer - dt);
}

// --- Screen flash (DOM overlay) ---
// Initialized lazily with a target element. Triggers a brief white flash via
// CSS opacity transition — independent of the WebGL canvas.
let flashEl: HTMLDivElement | null = null;

export function initScreenFlash(parent: HTMLElement) {
  if (flashEl) return;
  flashEl = document.createElement("div");
  flashEl.style.cssText =
    "position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:20;transition:opacity 90ms ease-out;mix-blend-mode:screen";
  parent.appendChild(flashEl);
}

export function triggerScreenFlash(strength: number = 0.5) {
  if (!flashEl) return;
  flashEl.style.opacity = String(strength);
  setTimeout(() => {
    if (flashEl) flashEl.style.opacity = "0";
  }, 90);
}

// --- Camera shake ---
let shakeIntensity = 0;
let shakeTime = 0;

export function triggerShake(intensity: number) {
  shakeIntensity = Math.max(shakeIntensity, intensity);
  shakeTime = 0.25;
}

export function applyShake(camera: THREE.Camera, dt: number) {
  if (shakeTime <= 0) return;
  shakeTime -= dt;
  const fade = Math.max(0, shakeTime / 0.25);
  const amt = shakeIntensity * fade;
  camera.position.x += (Math.random() - 0.5) * amt * 2;
  camera.position.y += (Math.random() - 0.5) * amt * 2;
  camera.position.z += (Math.random() - 0.5) * amt * 2;
  if (shakeTime <= 0) shakeIntensity = 0;
}

// --- Particles (mesh-pooled) ---
// Pre-allocate a fixed pool of THREE.Mesh particles. Emit() finds an
// inactive mesh, reassigns its material/position/velocity and flips
// visibility. Death just hides — no scene add/remove churn, no GC pressure.
// At peak intensity (EMP + multi-confetti) we need ~150 simultaneous
// particles; 256 gives headroom.
const POOL_SIZE = 256;

type IParticle = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  active: boolean;
};

let particleScene: THREE.Scene | null = null;
let particles: IParticle[] = [];

const PARTICLE_GEO = new THREE.BoxGeometry(0.3, 0.3, 0.3);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const SPLASH_MAT = new THREE.MeshBasicMaterial({ color: 0x66ccff });
const CONFETTI_MATS = [
  new THREE.MeshBasicMaterial({ color: 0xff4466 }),
  new THREE.MeshBasicMaterial({ color: 0xffcc22 }),
  new THREE.MeshBasicMaterial({ color: 0x66ff88 }),
  new THREE.MeshBasicMaterial({ color: 0x44aaff }),
];

export function initEffects(scene: THREE.Scene) {
  particleScene = scene;
  // Build the pool once. Meshes start hidden and parented to the scene so
  // future emits never touch the scene graph.
  if (particles.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(PARTICLE_GEO, SPARK_MAT);
      mesh.visible = false;
      scene.add(mesh);
      particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, active: false });
    }
  }
}

/**
 * Find an inactive particle slot and configure it. Returns false if the
 * pool is fully saturated — caller should treat that as an acceptable drop
 * (peak particle storms don't need every single sprite to land).
 */
function acquire(
  x: number,
  y: number,
  z: number,
  mat: THREE.Material,
  vx: number,
  vy: number,
  vz: number,
  life: number,
): boolean {
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (p.active) continue;
    p.mesh.material = mat;
    p.mesh.position.set(x, y, z);
    p.mesh.scale.set(1, 1, 1);
    p.mesh.rotation.set(0, 0, 0);
    p.mesh.visible = true;
    p.vx = vx;
    p.vy = vy;
    p.vz = vz;
    p.life = life;
    p.maxLife = life;
    p.active = true;
    return true;
  }
  return false;
}

function emit(x: number, y: number, z: number, mat: THREE.Material, count: number, spread: number, life: number) {
  if (!particleScene) return;
  for (let i = 0; i < count; i++) {
    const ok = acquire(
      x,
      y,
      z,
      mat,
      (Math.random() - 0.5) * spread,
      Math.random() * spread * 0.8 + spread * 0.2,
      (Math.random() - 0.5) * spread,
      life,
    );
    if (!ok) return;
  }
}

export function spawnSparks(x: number, y: number, z: number) {
  emit(x, y, z, SPARK_MAT, 12, 8, 0.5);
}

export function spawnSplash(x: number, y: number, z: number) {
  emit(x, y, z, SPLASH_MAT, 16, 6, 0.7);
}

export function spawnConfetti(x: number, y: number, z: number) {
  if (!particleScene) return;
  for (let i = 0; i < 20; i++) {
    const mat = CONFETTI_MATS[i % CONFETTI_MATS.length];
    const ok = acquire(
      x,
      y,
      z,
      mat,
      (Math.random() - 0.5) * 6,
      Math.random() * 6 + 2,
      (Math.random() - 0.5) * 6,
      0.8,
    );
    if (!ok) return;
  }
}

// --- Expanding rings (EMP, etc.) ---
type IRing = {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  maxRadius: number;
};
const rings: IRing[] = [];
const RING_GEO = new THREE.RingGeometry(0.95, 1.0, 48);
const EMP_RING_MAT = new THREE.MeshBasicMaterial({
  color: 0x66ddff,
  transparent: true,
  side: THREE.DoubleSide,
});

export function spawnRing(x: number, y: number, z: number, maxRadius: number, life: number = 0.45) {
  if (!particleScene) return;
  const mesh = new THREE.Mesh(RING_GEO, EMP_RING_MAT);
  mesh.position.set(x, y + 0.1, z);
  mesh.rotation.x = -Math.PI / 2;
  mesh.scale.set(0.1, 0.1, 0.1);
  particleScene.add(mesh);
  rings.push({ mesh, age: 0, life, maxRadius });
}

function updateRings(dt: number) {
  if (!particleScene) return;
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i];
    r.age += dt;
    const t = r.age / r.life;
    if (t >= 1) {
      particleScene.remove(r.mesh);
      rings.splice(i, 1);
      continue;
    }
    const scale = r.maxRadius * t;
    r.mesh.scale.set(scale, scale, scale);
    // Note: this mutates the shared material — fine because all rings
    // share opacity scaling and only briefly overlap.
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = 1 - t;
  }
}

export function updateEffects(dt: number) {
  if (!particleScene) return;
  updateRings(dt);
  for (let i = 0; i < particles.length; i++) {
    const p = particles[i];
    if (!p.active) continue;
    p.life -= dt;
    if (p.life <= 0) {
      // Release back to the pool: hide, mark inactive. Mesh stays parented.
      p.mesh.visible = false;
      p.active = false;
      continue;
    }
    p.vy -= 18 * dt; // gravity
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.y += dt * 6;
    const s = Math.max(0.1, p.life / p.maxLife);
    p.mesh.scale.set(s, s, s);
  }
}
