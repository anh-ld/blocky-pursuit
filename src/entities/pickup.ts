import * as THREE from "three";

export type IPickupKind =
  | "nitro"
  | "shield"
  | "emp"
  | "repair"
  | "doubleScore"
  | "timeWarp"
  | "magnet"
  | "ghost"
  | "tank";

// Rarity drives both spawn weight (in pickup-system) and visual glow.
// Common = no ring, rare = cyan ring, epic = gold ring + extra confetti.
export type IPickupRarity = "common" | "rare" | "epic";

export const PICKUP_RARITY: Record<IPickupKind, IPickupRarity> = {
  nitro: "common",
  shield: "common",
  repair: "common",
  doubleScore: "rare",
  magnet: "rare",
  timeWarp: "rare",
  emp: "epic",
  ghost: "epic",
  tank: "epic",
};

// --- Materials (one per kind, shared across instances) ---
function emissiveMat(color: number, intensity: number = 0.8): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    flatShading: true,
  });
}

const NITRO_MAT = emissiveMat(0xffaa00, 0.8);
const SHIELD_MAT = emissiveMat(0x66ddff, 0.7);
const EMP_MAT = emissiveMat(0xcc66ff, 0.8);
const REPAIR_MAT = emissiveMat(0x66ff77, 0.85);
const SCORE_MAT = emissiveMat(0xffdd44, 0.9);
const TIME_MAT = emissiveMat(0x66aaff, 0.75);
const MAGNET_MAT = emissiveMat(0xff5555, 0.8);
// Ghost gets translucent treatment to read as "intangible".
const GHOST_MAT = new THREE.MeshStandardMaterial({
  color: 0xeeeeff,
  emissive: 0xaabbff,
  emissiveIntensity: 0.7,
  flatShading: true,
  transparent: true,
  opacity: 0.55,
});
const TANK_MAT = emissiveMat(0xcc2222, 0.85);

// --- Geometries (one per kind, shared) ---
const NITRO_GEO = new THREE.ConeGeometry(0.65, 1.4, 6);
const SHIELD_GEO = new THREE.IcosahedronGeometry(0.8, 0);
const EMP_GEO = new THREE.TorusGeometry(0.65, 0.22, 8, 16);
// Repair: a Greek cross built from two perpendicular bars.
const REPAIR_BAR_GEO = new THREE.BoxGeometry(0.4, 1.4, 0.4);
// DoubleScore: small cube reused twice (stacked).
const SCORE_CUBE_GEO = new THREE.BoxGeometry(0.75, 0.75, 0.75);
// TimeWarp: octahedron reads as an hourglass tipped on its side.
const TIME_GEO = new THREE.OctahedronGeometry(0.85, 0);
// Magnet: 3/4 torus arc looks like a horseshoe magnet.
const MAGNET_GEO = new THREE.TorusGeometry(0.65, 0.2, 8, 16, Math.PI * 1.5);
// Ghost: tall tapered cylinder with translucent material.
const GHOST_GEO = new THREE.CylinderGeometry(0.55, 0.7, 1.4, 8);
// Tank: tetrahedron — flat-shaded, blocky.
const TANK_GEO = new THREE.TetrahedronGeometry(0.9, 0);

// --- Rarity glow rings (shared) -------------------------------------------
// Flat ring beneath the pickup mesh. Two materials so rare/epic read at a
// glance from across the map. Both share a single geometry.
const RARITY_RING_GEO = new THREE.RingGeometry(1.05, 1.35, 24);
const RARE_RING_MAT = new THREE.MeshBasicMaterial({
  color: 0x66ddff,
  transparent: true,
  opacity: 0.7,
  side: THREE.DoubleSide,
  depthWrite: false,
});
const EPIC_RING_MAT = new THREE.MeshBasicMaterial({
  color: 0xffcc22,
  transparent: true,
  opacity: 0.85,
  side: THREE.DoubleSide,
  depthWrite: false,
});

/**
 * Build the visual mesh/group for a given pickup kind. Each kind has a
 * distinct silhouette so the player can read "what is this?" at a glance
 * without decoding only the color.
 */
function buildPickupMesh(kind: IPickupKind): THREE.Object3D {
  switch (kind) {
    case "nitro":
      return new THREE.Mesh(NITRO_GEO, NITRO_MAT);
    case "shield":
      return new THREE.Mesh(SHIELD_GEO, SHIELD_MAT);
    case "emp": {
      const m = new THREE.Mesh(EMP_GEO, EMP_MAT);
      m.rotation.x = Math.PI / 2; // lay ring flat
      return m;
    }
    case "repair": {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(REPAIR_BAR_GEO, REPAIR_MAT));
      const horiz = new THREE.Mesh(REPAIR_BAR_GEO, REPAIR_MAT);
      horiz.rotation.z = Math.PI / 2;
      g.add(horiz);
      return g;
    }
    case "doubleScore": {
      const g = new THREE.Group();
      const top = new THREE.Mesh(SCORE_CUBE_GEO, SCORE_MAT);
      const bot = new THREE.Mesh(SCORE_CUBE_GEO, SCORE_MAT);
      top.position.y = 0.42;
      bot.position.y = -0.42;
      g.add(top);
      g.add(bot);
      return g;
    }
    case "timeWarp":
      return new THREE.Mesh(TIME_GEO, TIME_MAT);
    case "magnet": {
      const m = new THREE.Mesh(MAGNET_GEO, MAGNET_MAT);
      m.rotation.x = Math.PI / 2; // open horseshoe faces up
      return m;
    }
    case "ghost":
      return new THREE.Mesh(GHOST_GEO, GHOST_MAT);
    case "tank":
      return new THREE.Mesh(TANK_GEO, TANK_MAT);
  }
}

export class Pickup {
  scene: THREE.Scene;
  mesh: THREE.Group;
  position: THREE.Vector3;
  kind: IPickupKind;
  rarity: IPickupRarity;
  age: number = 0;
  // Held separately so the ring can pulse independently of the floating mesh.
  // null for common rarity (no ring rendered).
  private ringMesh: THREE.Mesh | null = null;

  constructor(scene: THREE.Scene, position: THREE.Vector3, kind: IPickupKind) {
    this.scene = scene;
    this.kind = kind;
    this.rarity = PICKUP_RARITY[kind];
    this.position = position.clone();
    this.mesh = new THREE.Group();
    this.mesh.add(buildPickupMesh(kind));

    // Rare/epic pickups get a flat glow ring on the ground beneath them so
    // the player can spot them from a distance instead of guessing by color.
    if (this.rarity !== "common") {
      const mat = this.rarity === "epic" ? EPIC_RING_MAT : RARE_RING_MAT;
      const ring = new THREE.Mesh(RARITY_RING_GEO, mat);
      ring.rotation.x = -Math.PI / 2;
      // Sit just above the ground tile so it doesn't z-fight with the road.
      ring.position.y = -1.45;
      this.mesh.add(ring);
      this.ringMesh = ring;
    }

    this.mesh.position.copy(position);
    this.mesh.position.y = 1.5;
    scene.add(this.mesh);
  }

  update(dt: number) {
    this.age += dt;
    this.mesh.rotation.y += dt * 2;
    this.mesh.position.y = 1.5 + Math.sin(this.age * 3) * 0.3;
    if (this.ringMesh) {
      // Counter the parent's bob so the ring stays anchored to the ground
      // (world y ≈ 0.05) while the pickup mesh floats above it. The ring
      // also breathes its scale slightly so the glow has a heartbeat.
      // (No rotation: the ring is laid flat, so any spin around its own
      // axis is invisible on a smooth circle.)
      this.ringMesh.position.y = 0.05 - this.mesh.position.y;
      const s = 1 + Math.sin(this.age * 4) * 0.08;
      this.ringMesh.scale.set(s, s, 1);
    }

    // Despawn warning: blink for the last 2 seconds before age 25
    if (this.age > 23) {
      this.mesh.visible = Math.floor(this.age * 8) % 2 === 0;
    } else if (!this.mesh.visible) {
      this.mesh.visible = true;
    }
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
