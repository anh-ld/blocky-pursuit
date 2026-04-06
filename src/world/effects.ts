import * as THREE from "three";

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

// --- Particles (sprite-based, pooled per emit) ---
type IParticle = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
};

let particleScene: THREE.Scene | null = null;
const particles: IParticle[] = [];

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
}

function emit(x: number, y: number, z: number, mat: THREE.Material, count: number, spread: number, life: number) {
  if (!particleScene) return;
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(PARTICLE_GEO, mat);
    mesh.position.set(x, y, z);
    particleScene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random() - 0.5) * spread,
      vy: Math.random() * spread * 0.8 + spread * 0.2,
      vz: (Math.random() - 0.5) * spread,
      life,
      maxLife: life,
    });
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
    const mesh = new THREE.Mesh(PARTICLE_GEO, mat);
    mesh.position.set(x, y, z);
    particleScene.add(mesh);
    particles.push({
      mesh,
      vx: (Math.random() - 0.5) * 6,
      vy: Math.random() * 6 + 2,
      vz: (Math.random() - 0.5) * 6,
      life: 0.8,
      maxLife: 0.8,
    });
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
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) {
      particleScene.remove(p.mesh);
      particles.splice(i, 1);
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
