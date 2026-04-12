import * as THREE from "three";
import * as CANNON from "cannon-es";
import { isRoad, isWater, TILE_SIZE } from "../world/terrain";

// --- Shared materials (one set for all cop instances) ---
const UNIT = 0.5;
const matProps = { roughness: 0.8, flatShading: true } as const;
const cabinProps = { roughness: 0.3, flatShading: true, metalness: 0.5 } as const;

// Cop tiers — visual escalation as level rises so high-level threats read at a glance.
// Tier 0: standard patrol (lvl 1-2). Tier 1: charcoal urban (lvl 3). Tier 2: SWAT red (lvl 4-5).
// Tier 3: Master (lvl 6+).
type ICopTier = {
  bodyMat: THREE.MeshStandardMaterial;
  cabinMat: THREE.MeshStandardMaterial;
};
const COP_TIERS: ICopTier[] = [
  {
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x1c1c1c, ...matProps }),
    cabinMat: new THREE.MeshStandardMaterial({ color: 0xffffff, ...cabinProps }),
  },
  {
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x2a2a2a, ...matProps }),
    cabinMat: new THREE.MeshStandardMaterial({ color: 0x9aa0a6, ...cabinProps }),
  },
  {
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x080808, ...matProps }),
    cabinMat: new THREE.MeshStandardMaterial({ color: 0xb71c1c, ...cabinProps }),
  },
  {
    bodyMat: new THREE.MeshStandardMaterial({ color: 0x050505, ...matProps }),
    cabinMat: new THREE.MeshStandardMaterial({ color: 0xdaa520, ...cabinProps }), // Goldenrod
  },
];
function tierForLevel(level: number): ICopTier {
  if (level >= 6) return COP_TIERS[3];
  if (level >= 4) return COP_TIERS[2];
  if (level === 3) return COP_TIERS[1];
  return COP_TIERS[0];
}

// SWAT mini-boss tier — its own materials so the silhouette reads as
// "different threat" instantly, even at distance through fog.
const SWAT_BODY_MAT = new THREE.MeshStandardMaterial({
  color: 0x111111,
  emissive: 0x550000,
  emissiveIntensity: 0.3,
  ...matProps,
});
const SWAT_CABIN_MAT = new THREE.MeshStandardMaterial({
  color: 0xff2222,
  emissive: 0xaa0000,
  emissiveIntensity: 0.4,
  ...cabinProps,
});
const SWAT_TIER: ICopTier = { bodyMat: SWAT_BODY_MAT, cabinMat: SWAT_CABIN_MAT };
const COP_RED_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xff1111,
  emissive: 0xff1111,
  emissiveIntensity: 1.0,
  flatShading: true,
});
const COP_BLUE_LIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0x1111ff,
  emissive: 0x1111ff,
  emissiveIntensity: 1.0,
  flatShading: true,
});
const COP_GRILLE_MAT = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
const COP_HEADLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xffee88,
  emissive: 0xffee88,
  emissiveIntensity: 0.8,
  flatShading: true,
});
const COP_TAILLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xff2222,
  emissive: 0xff2222,
  emissiveIntensity: 0.6,
  flatShading: true,
});
const COP_WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, ...matProps });
const BOUNTY_MARKER_MAT = new THREE.MeshStandardMaterial({
  color: 0xffd54a,
  emissive: 0xb7791f,
  emissiveIntensity: 0.9,
  flatShading: true,
});
const DAMAGE_MARKER_MAT = new THREE.MeshStandardMaterial({
  color: 0x7f1d1d,
  emissive: 0x2b0a0a,
  emissiveIntensity: 0.35,
  flatShading: true,
});

// --- Shared geometries (one set for all cop instances). All cops share the
// same proportions, so the GPU buffers only need to live once. Disposing
// per-instance would be wrong — these stay alive for the whole session.
const COP_BODY_GEO = new THREE.BoxGeometry(UNIT * 4, UNIT, UNIT * 8);
const COP_CABIN_GEO = new THREE.BoxGeometry(UNIT * 3, UNIT * 1.5, UNIT * 3);
const COP_LIGHT_GEO = new THREE.BoxGeometry(UNIT, UNIT * 0.5, UNIT);
const COP_GRILLE_GEO = new THREE.BoxGeometry(UNIT * 3.2, UNIT * 0.6, UNIT * 0.2);
const COP_HEADLIGHT_GEO = new THREE.BoxGeometry(UNIT * 0.6, UNIT * 0.4, UNIT * 0.3);
const COP_TAILLIGHT_GEO = new THREE.BoxGeometry(UNIT * 0.6, UNIT * 0.4, UNIT * 0.3);
const COP_WHEEL_GEO = new THREE.BoxGeometry(UNIT, UNIT, UNIT);
const BOUNTY_MARKER_GEO = new THREE.BoxGeometry(UNIT * 1.1, UNIT * 0.45, UNIT * 1.1);
const DAMAGE_MARKER_GEO = new THREE.BoxGeometry(UNIT * 2.2, UNIT * 0.3, UNIT * 1.5);
const DAMAGE_THRESHOLD_SPEED = 8;
const DAMAGE_TIER1_THRESHOLD = 20;
const DAMAGE_TIER2_THRESHOLD = 40;

// Per-step scratch — reused across every cop's preStep callback. Safe
// because physics steps process cops sequentially within a single thread,
// and none of these values need to outlive a single preStep call.
const _localVel = new CANNON.Vec3();
const _force = new CANNON.Vec3();
const _targetDir = new CANNON.Vec3();
const _worldForward = new CANNON.Vec3();
const _cross = new CANNON.Vec3();
const _q = new CANNON.Quaternion();
// Constants — never mutated, so a single shared instance is fine.
const COP_FORWARD = new CANNON.Vec3(0, 0, -1);
const COP_FORCE_OFFSET = new CANNON.Vec3(0, 0, 0);

// Drive both shared siren-light materials from a single time source so all
// cops on screen stay in phase. Called once per frame from main.ts.
export function updateCopLights(time: number) {
  // ~6 Hz alternating: while one is at 1.4, the other is at 0.15
  const phase = Math.sin(time * Math.PI * 6);
  COP_RED_LIGHT_MAT.emissiveIntensity = phase > 0 ? 1.4 : 0.15;
  COP_BLUE_LIGHT_MAT.emissiveIntensity = phase > 0 ? 0.15 : 1.4;
}

export type ICopLevelConfig = {
  mass: number;
  speed: number;
  ramSpeed: number; // burst speed when close to player
  turnSpeed: number;
  forwardForce: number;
  predictAhead: number; // seconds to predict player position (0 = no prediction)
  flank: boolean; // whether this cop tries to flank
  interceptPower: number; // multiplier for prediction (Lead role)
  canPit: boolean; // whether this cop tries sideways PIT maneuvers
  avoidWater: boolean; // whether this cop brakes/steers away from water
};

// Player: maxSpeed=40, mass=100
export const COP_LEVEL_CONFIGS: Record<number, ICopLevelConfig> = {
  1: { mass: 100, speed: 44, ramSpeed: 52, turnSpeed: 2.2, forwardForce: 160000, predictAhead: 0.5, flank: false, interceptPower: 1, canPit: false, avoidWater: false },
  2: { mass: 115, speed: 46, ramSpeed: 55, turnSpeed: 2.5, forwardForce: 175000, predictAhead: 0.8, flank: false, interceptPower: 1, canPit: false, avoidWater: false },
  3: { mass: 130, speed: 48, ramSpeed: 58, turnSpeed: 2.8, forwardForce: 190000, predictAhead: 1.2, flank: true, interceptPower: 1, canPit: false, avoidWater: false },
  4: { mass: 150, speed: 50, ramSpeed: 60, turnSpeed: 3.0, forwardForce: 200000, predictAhead: 1.5, flank: true, interceptPower: 3.5, canPit: false, avoidWater: false },
  5: { mass: 175, speed: 52, ramSpeed: 63, turnSpeed: 3.2, forwardForce: 220000, predictAhead: 1.8, flank: true, interceptPower: 3.5, canPit: true, avoidWater: false },
  6: { mass: 210, speed: 54, ramSpeed: 66, turnSpeed: 3.4, forwardForce: 240000, predictAhead: 2.0, flank: true, interceptPower: 4.0, canPit: true, avoidWater: true },
};

export class Cop {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  baseForwardForce: number;
  forwardForce: number;
  baseMaxSpeed: number;
  maxSpeed: number;
  baseTurnSpeed: number;
  turnSpeed: number;
  bounceBackTimer: number;
  baseBounceBackDuration: number;
  bounceBackDuration: number;
  recoveryTimer: number;
  baseRecoveryDuration: number;
  recoveryDuration: number;
  targetPosition: THREE.Vector3 | null = null;
  targetVelocity: CANNON.Vec3 | null = null;
  level: number;
  config: ICopLevelConfig;
  flankSide: number; // +1 or -1
  damageCooldown: number; // seconds until this cop can deal damage again
  nearMissArmed: boolean; // becomes true when far from player; consumed on next near-miss
  // Mini-boss flag — set by spawning. SWAT cops are bigger, hit harder, and
  // are immune to EMP. Cop-system reads this on collision + drown for bonus
  // payout, and skips them in empBlast().
  isSwat: boolean;
  isBounty: boolean;
  bountyMarker: THREE.Mesh;
  damageMarker: THREE.Mesh;
  damageTier: number;
  damagePoints: number;
  // AI Roles
  role: "chaser" | "lead" = "chaser";
  pitCooldown = 0;
  preStepCallback: () => void;

  constructor(
    scene: THREE.Scene,
    world: CANNON.World,
    position: THREE.Vector3,
    level: number = 1,
    isSwat: boolean = false,
    isBounty: boolean = false,
  ) {
    this.scene = scene;
    this.world = world;
    this.level = Math.max(1, Math.min(6, level));
    this.config = COP_LEVEL_CONFIGS[this.level];
    this.flankSide = Math.random() < 0.5 ? 1 : -1;
    this.damageCooldown = 0;
    this.nearMissArmed = false;
    this.isSwat = isSwat;
    this.isBounty = isBounty;
    this.damageTier = 0;
    this.damagePoints = 0;

    // Voxel dimensions
    const unit = UNIT;

    // --- Visuals (Three.js) ---
    this.mesh = new THREE.Group();

    const tier = isSwat ? SWAT_TIER : tierForLevel(this.level);

    // Chassis (Body)
    const bodyMesh = new THREE.Mesh(COP_BODY_GEO, tier.bodyMat);
    bodyMesh.position.y = unit;
    this.mesh.add(bodyMesh);

    // Cabin (shifted toward rear so front hood is visible)
    const cabinMesh = new THREE.Mesh(COP_CABIN_GEO, tier.cabinMat);
    cabinMesh.position.y = unit * 2.25;
    cabinMesh.position.z = unit * 1.5; // rear half
    this.mesh.add(cabinMesh);

    // Siren lights (on top of cabin)
    const redLight = new THREE.Mesh(COP_LIGHT_GEO, COP_RED_LIGHT_MAT);
    redLight.position.set(-unit, unit * 3.25, unit * 1.5);
    this.mesh.add(redLight);

    const blueLight = new THREE.Mesh(COP_LIGHT_GEO, COP_BLUE_LIGHT_MAT);
    blueLight.position.set(unit, unit * 3.25, unit * 1.5);
    this.mesh.add(blueLight);

    this.bountyMarker = new THREE.Mesh(BOUNTY_MARKER_GEO, BOUNTY_MARKER_MAT);
    this.bountyMarker.position.set(0, unit * 4.1, unit * 1.5);
    this.bountyMarker.visible = this.isBounty;
    this.mesh.add(this.bountyMarker);

    // Front grille
    const grille = new THREE.Mesh(COP_GRILLE_GEO, COP_GRILLE_MAT);
    grille.position.set(0, unit * 0.9, -unit * 4.1);
    this.mesh.add(grille);

    // Headlights (front = -Z)
    const hlLeft = new THREE.Mesh(COP_HEADLIGHT_GEO, COP_HEADLIGHT_MAT);
    hlLeft.position.set(-unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlLeft);
    const hlRight = new THREE.Mesh(COP_HEADLIGHT_GEO, COP_HEADLIGHT_MAT);
    hlRight.position.set(unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlRight);

    // Taillights (rear = +Z, red)
    const tlLeft = new THREE.Mesh(COP_TAILLIGHT_GEO, COP_TAILLIGHT_MAT);
    tlLeft.position.set(-unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlLeft);
    const tlRight = new THREE.Mesh(COP_TAILLIGHT_GEO, COP_TAILLIGHT_MAT);
    tlRight.position.set(unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlRight);

    // Wheels
    const wheelPositions: [number, number, number][] = [
      [-unit * 2.5, unit * 0.5, unit * 2.5], // Front Left
      [unit * 2.5, unit * 0.5, unit * 2.5], // Front Right
      [-unit * 2.5, unit * 0.5, -unit * 2.5], // Rear Left
      [unit * 2.5, unit * 0.5, -unit * 2.5], // Rear Right
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(COP_WHEEL_GEO, COP_WHEEL_MAT);
      wheel.position.set(pos[0], pos[1], pos[2]);
      this.mesh.add(wheel);
    });

    this.damageMarker = new THREE.Mesh(DAMAGE_MARKER_GEO, DAMAGE_MARKER_MAT);
    this.damageMarker.position.set(0, unit * 1.55, -unit * 0.9);
    this.damageMarker.visible = false;
    this.mesh.add(this.damageMarker);

    // SWAT: visible scale-up so the silhouette pops as a mini-boss. The
    // physics shape stays cop-sized — SWAT power comes from speed/mass, not
    // a hitbox grow that would feel unfair on grazes.
    if (isSwat) this.mesh.scale.set(1.4, 1.4, 1.4);

    scene.add(this.mesh);

    // --- Physics (Cannon-es) ---
    const shape = new CANNON.Box(new CANNON.Vec3(unit * 2, unit * 1.5, unit * 4));
    this.body = new CANNON.Body({
      mass: this.config.mass,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.1,
      angularDamping: 0.9,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 1,
      allowSleep: false,
    });

    this.body.addShape(shape, new CANNON.Vec3(0, unit, 0));

    // Only allow rotation around the Y-axis to prevent flipping
    this.body.angularFactor.set(0, 1, 0);

    world.addBody(this.body);

    // Tuning parameters from level config
    this.baseForwardForce = this.config.forwardForce;
    this.baseTurnSpeed = this.config.turnSpeed;
    this.baseMaxSpeed = this.config.speed;

    // SWAT mini-boss: heavier mass + extra accel so it feels like a tank
    // bearing down on you. Top speed only nudged so it can still be outrun
    // — the threat is "you can't take a hit", not "it catches you for free".
    if (isSwat) {
      this.body.mass = this.config.mass * 1.8;
      this.body.updateMassProperties();
      this.baseForwardForce *= 1.3;
      this.baseMaxSpeed += 3;
    }
    this.forwardForce = this.baseForwardForce;
    this.turnSpeed = this.baseTurnSpeed;
    this.maxSpeed = this.baseMaxSpeed;

    // Collision bounce-back state (same as player car)
    this.bounceBackTimer = 0;
    this.baseBounceBackDuration = 1.25;
    this.bounceBackDuration = this.baseBounceBackDuration;
    this.recoveryTimer = 0;
    this.baseRecoveryDuration = 1.0;
    this.recoveryDuration = this.baseRecoveryDuration;

    // Listen for collisions with static objects (buildings, walls, etc.)
    this.body.addEventListener("collide", (event: { body: CANNON.Body }) => {
      const other = event.body;
      if (other.mass === 0 && other.shapes[0] instanceof CANNON.Box) {
        this.bounceBackTimer = this.bounceBackDuration;
      }
    });

    this.preStepCallback = () => {
      if (!this.targetPosition) return;

      this.body.wakeUp();

      // Determine distance to player for ram boost
      const dxToPlayer = this.targetPosition.x - this.body.position.x;
      const dzToPlayer = this.targetPosition.z - this.body.position.z;
      const distToPlayer = Math.sqrt(dxToPlayer * dxToPlayer + dzToPlayer * dzToPlayer);

      // --- Water Fear (Level 5+) ---
      // If cop is about to hit water, force brake + steer away.
      let waterInFront = false;
      if (this.config.avoidWater) {
        // Look ahead based on speed
        const speed = this.body.velocity.length();
        const lookAhead = 2 + speed * 0.25;
        this.body.quaternion.vmult(COP_FORWARD, _worldForward);
        const checkX = this.body.position.x + _worldForward.x * lookAhead;
        const checkZ = this.body.position.z + _worldForward.z * lookAhead;
        const tx = Math.floor(checkX / TILE_SIZE);
        const tz = Math.floor(checkZ / TILE_SIZE);
        if (!isRoad(tx, tz) && isWater(tx, tz)) {
          waterInFront = true;
        }
      }

      // Ram mode: boost speed when within 25 units
      const isRamming = distToPlayer < 25 && !waterInFront;
      const activeMaxSpeed = isRamming ? this.config.ramSpeed : this.maxSpeed;
      const activeForce = isRamming ? this.forwardForce * 1.4 : this.forwardForce;

      // 1. Auto-drive with acceleration curve
      this.body.vectorToLocalFrame(this.body.velocity, _localVel);
      const forwardSpeed = -_localVel.z;
      const maxReverseSpeed = activeMaxSpeed * 0.25;

      if (this.bounceBackTimer > 0) {
        const reverseSpeed = Math.max(0, -forwardSpeed);
        const reverseRatio = Math.min(reverseSpeed / maxReverseSpeed, 1);
        const reverseScale = 0.3 * (1 - reverseRatio * 0.8);
        _force.set(0, 0, activeForce * reverseScale);
        this.body.applyLocalForce(_force, COP_FORCE_OFFSET);

        if (reverseSpeed > maxReverseSpeed) {
          _localVel.z = maxReverseSpeed;
          this.body.vectorToWorldFrame(_localVel, this.body.velocity);
        }
      } else {
        let forceScale: number;
        if (forwardSpeed < 0) {
          forceScale = 1.0; // stronger acceleration from standstill
        } else {
          const speedRatio = Math.min(forwardSpeed / activeMaxSpeed, 1);
          forceScale = 1.0 - speedRatio * 0.6;
        }

        if (this.recoveryTimer > 0) {
          const recoveryProgress = 1 - this.recoveryTimer / this.recoveryDuration;
          forceScale *= 0.3 + 0.7 * recoveryProgress;
        }

        // Brakes if water in front
        if (waterInFront) forceScale = -0.5;

        _force.set(0, 0, -activeForce * forceScale);
        this.body.applyLocalForce(_force, COP_FORCE_OFFSET);
      }

      // 2. Arcade friction — tighter grip so cops corner better.
      // Reuse _localVel — it was last written above but we want a fresh
      // read after applyLocalForce which can mutate body.velocity.
      this.body.vectorToLocalFrame(this.body.velocity, _localVel);

      const isRecovering = this.bounceBackTimer > 0 || this.recoveryTimer > 0;
      _localVel.x *= isRecovering ? 0.92 : 0.8; // tighter lateral grip
      _localVel.z *= 0.98;

      this.body.vectorToWorldFrame(_localVel, this.body.velocity);

      // Cap max speed
      const speed = this.body.velocity.length();
      if (speed > activeMaxSpeed) {
        this.body.velocity.scale(activeMaxSpeed / speed, this.body.velocity);
      }

      // 3. Steering toward player — with prediction and flanking
      this.body.angularVelocity.y = 0;
      if (speed > 0.5) {
        // Calculate target point: base position + velocity prediction
        let aimX = this.targetPosition.x;
        let aimZ = this.targetPosition.z;

        // Predict where player will be
        let pTime = this.config.predictAhead;
        if (this.role === "lead") pTime *= this.config.interceptPower;

        if (pTime > 0 && this.targetVelocity) {
          aimX += this.targetVelocity.x * pTime;
          aimZ += this.targetVelocity.z * pTime;
        }

        // Flanking: offset aim perpendicular to player's heading
        if (this.config.flank && this.targetVelocity) {
          const tvLen = Math.sqrt(this.targetVelocity.x ** 2 + this.targetVelocity.z ** 2);
          if (tvLen > 1) {
            const perpX = -this.targetVelocity.z / tvLen;
            const perpZ = this.targetVelocity.x / tvLen;
            const flankDist = 12;
            aimX += perpX * flankDist * this.flankSide;
            aimZ += perpZ * flankDist * this.flankSide;
          }
        }

        _targetDir.set(
          aimX - this.body.position.x,
          0,
          aimZ - this.body.position.z,
        );
        _targetDir.normalize();

        // --- PIT Maneuver (Level 4+) ---
        if (this.config.canPit && this.pitCooldown <= 0 && distToPlayer < 7 && this.targetVelocity) {
          // Check if roughly parallel (dot product of headings)
          this.body.quaternion.vmult(COP_FORWARD, _worldForward);
          this.body.vectorToLocalFrame(this.targetVelocity, _localVel);
          // If player is parallel and moving in same direction
          if (_localVel.z < -10) {
            // Apply sideways impulse toward player
            const toPlayerX = this.targetPosition.x - this.body.position.x;
            const toPlayerZ = this.targetPosition.z - this.body.position.z;
            const dirX = toPlayerX / distToPlayer;
            const dirZ = toPlayerZ / distToPlayer;
            const pitForce = 2500;
            this.body.applyImpulse(new CANNON.Vec3(dirX * pitForce, 0, dirZ * pitForce), new CANNON.Vec3(0, 0, 0));
            this.pitCooldown = 4.0; // Don't spam PIT
          }
        }

        this.body.quaternion.vmult(COP_FORWARD, _worldForward);
        _worldForward.y = 0;
        _worldForward.normalize();

        _worldForward.cross(_targetDir, _cross);
        const dot = _worldForward.dot(_targetDir);

        if (dot < 0.98) {
          let steerAngle = 0;
          if (_cross.y > 0) {
            steerAngle = this.turnSpeed;
          } else {
            steerAngle = -this.turnSpeed;
          }

          _q.setFromEuler(0, steerAngle * (1 / 60), 0);
          this.body.quaternion = this.body.quaternion.mult(_q);
        }
      }
    };

    this.world.addEventListener("preStep", this.preStepCallback);
  }

  update(dt: number, targetPosition: THREE.Vector3, targetVelocity?: CANNON.Vec3) {
    this.targetPosition = targetPosition;
    this.targetVelocity = targetVelocity || null;

    // Tick down damage cooldown
    if (this.damageCooldown > 0) this.damageCooldown -= dt;
    if (this.pitCooldown > 0) this.pitCooldown -= dt;

    // Tick down bounce-back timer; start recovery when it expires
    if (this.bounceBackTimer > 0) {
      this.bounceBackTimer -= dt;
      if (this.bounceBackTimer <= 0) {
        this.recoveryTimer = this.recoveryDuration;
      }
    }

    // Tick down recovery timer
    if (this.recoveryTimer > 0) {
      this.recoveryTimer -= dt;
    }

    // Sync visuals
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
    this.mesh.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w,
    );
    if (this.isBounty) {
      this.bountyMarker.position.y = UNIT * 4.1 + Math.sin(performance.now() * 0.008) * 0.18;
    }
  }

  applyDamage(impactSpeed: number): number {
    if (this.isSwat) return this.damageTier;
    this.damagePoints += Math.max(0, impactSpeed - DAMAGE_THRESHOLD_SPEED);
    const nextTier = this.damagePoints >= DAMAGE_TIER2_THRESHOLD ? 2 : this.damagePoints >= DAMAGE_TIER1_THRESHOLD ? 1 : 0;
    if (nextTier === this.damageTier) return this.damageTier;
    this.damageTier = nextTier;
    const speedMul = this.damageTier === 1 ? 0.86 : 0.68;
    const forceMul = this.damageTier === 1 ? 0.82 : 0.6;
    const turnMul = this.damageTier === 1 ? 0.88 : 0.7;
    this.maxSpeed = this.baseMaxSpeed * speedMul;
    this.forwardForce = this.baseForwardForce * forceMul;
    this.turnSpeed = this.baseTurnSpeed * turnMul;
    this.bounceBackDuration = this.baseBounceBackDuration + this.damageTier * 0.2;
    this.recoveryDuration = this.baseRecoveryDuration + this.damageTier * 0.15;
    this.damageMarker.visible = true;
    this.damageMarker.scale.set(
      this.damageTier === 1 ? 0.8 : 1.15,
      1,
      this.damageTier === 1 ? 0.85 : 1.05,
    );
    return this.damageTier;
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.world.removeBody(this.body);
    this.world.removeEventListener("preStep", this.preStepCallback);
  }
}
