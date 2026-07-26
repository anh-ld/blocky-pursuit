import * as THREE from "three";

/* Time slow (combo juice) — brief slowdown. Loop scales physics + entity dt via getTimeSlowFactor(); UI stays real-time. */
let timeSlowTimer = 0;
const TIME_SLOW_DURATION = 0.4;
const TIME_SLOW_MIN_FACTOR = 0.35;

export function triggerTimeSlow() {
  timeSlowTimer = TIME_SLOW_DURATION;
}

/** 0..1 — multiply real dt by this for gameplay-affecting updates. */
export function getTimeSlowFactor(): number {
  if (timeSlowTimer <= 0) return 1;
  /* Ease back toward 1 over the duration so the resume is smooth */
  const t = 1 - timeSlowTimer / TIME_SLOW_DURATION;
  return TIME_SLOW_MIN_FACTOR + (1 - TIME_SLOW_MIN_FACTOR) * t;
}

export function updateTimeSlow(dt: number) {
  if (timeSlowTimer > 0) timeSlowTimer = Math.max(0, timeSlowTimer - dt);
}

/** Reset effect timers (shake, time-slow) + flash. startGame() calls this so a fresh run never inherits shake/slow-mo. */
/* Particle pool NOT reset here — see clearParticles(). */
export function clearEffects() {
  shakeIntensity = 0;
  shakeTime = 0;
  timeSlowTimer = 0;
  if (flashEl) flashEl.style.opacity = "0";
}

/* Screen flash (DOM overlay) — initialized lazily. Brief white flash via CSS opacity, independent of WebGL canvas. */
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

/* Particles (mesh-pooled) — pre-allocate fixed pool of THREE.Mesh. Emit() reassigns material/pos/vel, flips visibility. */
/* Death just hides — no churn, no GC. Peak ~150; 256 headroom. */
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

/* Shared particle geometry. 20 faces reads as a smooth ball at gameplay distance. */
const PARTICLE_GEO = new THREE.IcosahedronGeometry(0.16, 0);
const SPARK_MAT = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
const SPLASH_MAT = new THREE.MeshBasicMaterial({ color: 0x66ccff });
const SPEED_LINE_MAT = new THREE.MeshBasicMaterial({ color: 0xffffff });

const CONFETTI_MATS = [
  new THREE.MeshBasicMaterial({ color: 0xff4466 }),
  new THREE.MeshBasicMaterial({ color: 0xffcc22 }),
  new THREE.MeshBasicMaterial({ color: 0x66ff88 }),
  new THREE.MeshBasicMaterial({ color: 0x44aaff }),
];

export function initEffects(scene: THREE.Scene) {
  particleScene = scene;

  /* Build pools once. Meshes start hidden and parented to the scene so future emits never touch the scene graph. */
  if (particles.length === 0) {
    for (let i = 0; i < POOL_SIZE; i++) {
      const mesh = new THREE.Mesh(PARTICLE_GEO, SPARK_MAT);
      mesh.visible = false;
      scene.add(mesh);
      particles.push({ mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 0, active: false });
    }

    for (let i = 0; i < RING_POOL_SIZE; i++) {
      const mat = RING_BASE_MAT.clone();
      const mesh = new THREE.Mesh(RING_GEO, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      scene.add(mesh);
      ringPool.push({ mesh, mat, age: 0, life: 0, maxRadius: 0, active: false });
    }
  }
}

/** Find an inactive particle slot and configure it. Returns false if pool is saturated — caller treats that as a drop. */
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

/** Streaky white particles trailing behind car at peak speed. Cheap "I'm flying" cue — existing pool. */
/* Caller passes heading; streaks launch backward along it. */
export function spawnSpeedLine(x: number, y: number, z: number, headingX: number, headingZ: number) {
  if (!particleScene) return;
  /* Start slightly behind the car, kick backward fast so it shoots past the camera. Tiny vertical jitter prevents stacking. */
  const back = -8;

  const ok = acquire(
    x + headingX * 0.5,
    y + 0.5 + (Math.random() - 0.5) * 0.6,
    z + headingZ * 0.5,
    SPEED_LINE_MAT,
    headingX * back,
    0,
    headingZ * back,
    0.25,
  );

  if (!ok) return;
}

export function spawnConfetti(x: number, y: number, z: number) {
  if (!particleScene) return;

  for (let i = 0; i < 20; i++) {
    const mat = CONFETTI_MATS[i % CONFETTI_MATS.length];
    const ok = acquire(x, y, z, mat, (Math.random() - 0.5) * 6, Math.random() * 6 + 2, (Math.random() - 0.5) * 6, 0.8);
    if (!ok) return;
  }
}

/* Expanding rings (EMP, etc.) Pre-allocated pool: EMP is rare so 4 simultaneous rings is plenty. */
type IRingSlot = {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  age: number;
  life: number;
  maxRadius: number;
  active: boolean;
};

const RING_GEO = new THREE.RingGeometry(0.95, 1.0, 48);

/* Template for the shared color/flags; per-slot materials clone this so concurrent rings fade independently. */
const RING_BASE_MAT = new THREE.MeshBasicMaterial({
  color: 0x66ddff,
  transparent: true,
  side: THREE.DoubleSide,
});

const RING_POOL_SIZE = 4;
const ringPool: IRingSlot[] = [];

export function spawnRing(x: number, y: number, z: number, maxRadius: number, life: number = 0.45) {
  const slot = ringPool.find((r) => !r.active);
  if (!slot) return; /* pool empty (not yet init) or saturated — acceptable drop */
  slot.mesh.position.set(x, y + 0.1, z);
  slot.mesh.scale.set(0.1, 0.1, 0.1);
  slot.mesh.visible = true;
  slot.mat.opacity = 1;
  slot.age = 0;
  slot.life = life;
  slot.maxRadius = maxRadius;
  slot.active = true;
}

function updateRings(dt: number) {
  for (const r of ringPool) {
    if (!r.active) continue;
    r.age += dt;
    const t = r.age / r.life;

    if (t >= 1) {
      r.mesh.visible = false;
      r.active = false;
      continue;
    }

    const scale = r.maxRadius * t;
    r.mesh.scale.set(scale, scale, scale);
    r.mat.opacity = 1 - t;
  }
}

/** Hide every active particle, release its slot. Called from startGame() so prior run's death debris doesn't bleed in. */
/* Rings cleared too. */
export function clearParticles() {
  for (const p of particles) {
    if (!p.active) continue;
    p.mesh.visible = false;
    p.active = false;
  }

  for (const r of ringPool) {
    r.mesh.visible = false;
    r.active = false;
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
      /* Release back to the pool: hide, mark inactive. Mesh stays parented. */
      p.mesh.visible = false;
      p.active = false;
      continue;
    }

    p.vy -= 18 * dt; /* gravity */
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += dt * 8;
    p.mesh.rotation.y += dt * 6;
    const s = Math.max(0.1, p.life / p.maxLife);
    p.mesh.scale.set(s, s, s);
  }
}
