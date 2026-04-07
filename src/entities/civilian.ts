import * as THREE from "three";
import * as CANNON from "cannon-es";
import { TILE_SIZE, isRoad } from "../world/terrain";

const CIVILIAN_COLORS = [0x4caf50, 0x2196f3, 0xffeb3b, 0xffffff, 0x9c27b0, 0xff9800];

// --- Shared materials (color-independent ones; body/cabin/stripe stay per-instance) ---
const matProps = { roughness: 0.8, flatShading: true } as const;
const CIV_GLASS_MAT = new THREE.MeshStandardMaterial({
  color: 0xaaddee,
  roughness: 0.2,
  flatShading: true,
  metalness: 0.6,
});
const CIV_HEADLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xffee88,
  emissive: 0xffee88,
  emissiveIntensity: 0.8,
  flatShading: true,
});
const CIV_TAILLIGHT_MAT = new THREE.MeshStandardMaterial({
  color: 0xff2222,
  emissive: 0xff2222,
  emissiveIntensity: 0.6,
  flatShading: true,
});
const CIV_WHEEL_MAT = new THREE.MeshStandardMaterial({ color: 0x111111, ...matProps });

// --- Shared geometries (one set for all civilian instances). All civilians
// have identical proportions, so the GPU buffers only need to live once.
const CIV_UNIT = 0.5;
const CIV_BODY_GEO = new THREE.BoxGeometry(CIV_UNIT * 4, CIV_UNIT * 1.2, CIV_UNIT * 8);
const CIV_CABIN_GEO = new THREE.BoxGeometry(CIV_UNIT * 3.6, CIV_UNIT * 2, CIV_UNIT * 5.5);
const CIV_STRIPE_GEO = new THREE.BoxGeometry(CIV_UNIT * 0.15, CIV_UNIT * 0.4, CIV_UNIT * 5);
const CIV_BOTTOM_STRIPE_GEO = new THREE.BoxGeometry(CIV_UNIT * 4.1, CIV_UNIT * 0.2, CIV_UNIT * 8.1);
const CIV_WINDSHIELD_GEO = new THREE.BoxGeometry(CIV_UNIT * 3, CIV_UNIT * 1.4, CIV_UNIT * 0.2);
const CIV_SIDEWIN_GEO = new THREE.BoxGeometry(CIV_UNIT * 0.15, CIV_UNIT * 1, CIV_UNIT * 1.2);
const CIV_REARWIN_GEO = new THREE.BoxGeometry(CIV_UNIT * 2.4, CIV_UNIT * 1, CIV_UNIT * 0.15);
const CIV_HEADLIGHT_GEO = new THREE.BoxGeometry(CIV_UNIT * 0.6, CIV_UNIT * 0.4, CIV_UNIT * 0.3);
const CIV_TAILLIGHT_GEO = new THREE.BoxGeometry(CIV_UNIT * 0.6, CIV_UNIT * 0.4, CIV_UNIT * 0.3);
const CIV_WHEEL_GEO = new THREE.BoxGeometry(CIV_UNIT, CIV_UNIT, CIV_UNIT);

// --- Per-step scratch Vec3s — reused across every civilian's preStep
// callback. Safe because physics steps process bodies sequentially within
// a single thread, and none of these values need to outlive a single call.
const _civForward = new CANNON.Vec3(0, 0, -1);
const _civWorldForward = new CANNON.Vec3();
const _civLocalVel = new CANNON.Vec3();
const _civForce = new CANNON.Vec3();
const _civForceOffset = new CANNON.Vec3(0, 0, 0);
const _civQ = new CANNON.Quaternion();

export class Civilian {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  maxSpeed: number;
  forwardForce: number;
  stunTimer: number;
  hasPanicked: boolean;
  preStepCallback: () => void;
  // Per-instance materials (random body color → darker trim). Stored so
  // `destroy()` can dispose them when the civilian despawns.
  private bodyMat: THREE.MeshStandardMaterial;
  private stripeMat: THREE.MeshStandardMaterial;

  constructor(scene: THREE.Scene, world: CANNON.World, position: THREE.Vector3) {
    this.scene = scene;
    this.world = world;
    this.stunTimer = 0;
    this.hasPanicked = false;

    const unit = CIV_UNIT;
    this.mesh = new THREE.Group();

    const bodyColor = CIVILIAN_COLORS[Math.floor(Math.random() * CIVILIAN_COLORS.length)];

    // Darker shade for trim/stripe
    const trimColor = new THREE.Color(bodyColor).multiplyScalar(0.7).getHex();

    // Per-instance materials — must be disposed in destroy()
    this.bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, ...matProps });
    this.stripeMat = new THREE.MeshStandardMaterial({ color: trimColor, ...matProps });

    // Van body — tall, boxy
    const bodyMesh = new THREE.Mesh(CIV_BODY_GEO, this.bodyMat);
    bodyMesh.position.y = unit * 1;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh.add(bodyMesh);

    // Van cabin — tall box spanning most of the length (shares bodyMat)
    const cabinMesh = new THREE.Mesh(CIV_CABIN_GEO, this.bodyMat);
    cabinMesh.position.y = unit * 2.6;
    cabinMesh.position.z = unit * 0.5;
    cabinMesh.castShadow = true;
    this.mesh.add(cabinMesh);

    // Side stripe — runs along both sides
    const stripeL = new THREE.Mesh(CIV_STRIPE_GEO, this.stripeMat);
    stripeL.position.set(-unit * 1.85, unit * 2.2, unit * 0.5);
    this.mesh.add(stripeL);
    const stripeR = new THREE.Mesh(CIV_STRIPE_GEO, this.stripeMat);
    stripeR.position.set(unit * 1.85, unit * 2.2, unit * 0.5);
    this.mesh.add(stripeR);

    // Bottom trim line
    const bottomStripe = new THREE.Mesh(CIV_BOTTOM_STRIPE_GEO, this.stripeMat);
    bottomStripe.position.y = unit * 0.45;
    this.mesh.add(bottomStripe);

    // Windshield (front window)
    const windshield = new THREE.Mesh(CIV_WINDSHIELD_GEO, CIV_GLASS_MAT);
    windshield.position.set(0, unit * 2.8, -unit * 2.3);
    this.mesh.add(windshield);

    // Side windows
    const sideWinL = new THREE.Mesh(CIV_SIDEWIN_GEO, CIV_GLASS_MAT);
    sideWinL.position.set(-unit * 1.85, unit * 2.8, -unit * 1.2);
    this.mesh.add(sideWinL);
    const sideWinR = new THREE.Mesh(CIV_SIDEWIN_GEO, CIV_GLASS_MAT);
    sideWinR.position.set(unit * 1.85, unit * 2.8, -unit * 1.2);
    this.mesh.add(sideWinR);

    // Rear window
    const rearWin = new THREE.Mesh(CIV_REARWIN_GEO, CIV_GLASS_MAT);
    rearWin.position.set(0, unit * 2.8, unit * 3.3);
    this.mesh.add(rearWin);

    // Headlights
    const hlLeft = new THREE.Mesh(CIV_HEADLIGHT_GEO, CIV_HEADLIGHT_MAT);
    hlLeft.position.set(-unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlLeft);
    const hlRight = new THREE.Mesh(CIV_HEADLIGHT_GEO, CIV_HEADLIGHT_MAT);
    hlRight.position.set(unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlRight);

    // Taillights
    const tlLeft = new THREE.Mesh(CIV_TAILLIGHT_GEO, CIV_TAILLIGHT_MAT);
    tlLeft.position.set(-unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlLeft);
    const tlRight = new THREE.Mesh(CIV_TAILLIGHT_GEO, CIV_TAILLIGHT_MAT);
    tlRight.position.set(unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlRight);

    // Wheels
    const wheelPositions: [number, number, number][] = [
      [-unit * 2.5, unit * 0.5, unit * 2.5],
      [unit * 2.5, unit * 0.5, unit * 2.5],
      [-unit * 2.5, unit * 0.5, -unit * 2.5],
      [unit * 2.5, unit * 0.5, -unit * 2.5],
    ];
    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(CIV_WHEEL_GEO, CIV_WHEEL_MAT);
      wheel.position.set(pos[0], pos[1], pos[2]);
      this.mesh.add(wheel);
    });

    scene.add(this.mesh);

    // Physics
    const shape = new CANNON.Box(new CANNON.Vec3(unit * 2, unit * 2, unit * 4));
    this.body = new CANNON.Body({
      mass: 80,
      position: new CANNON.Vec3(position.x, position.y, position.z),
      linearDamping: 0.1,
      angularDamping: 0.9,
      allowSleep: false,
    });
    this.body.addShape(shape, new CANNON.Vec3(0, unit, 0));
    this.body.angularFactor.set(0, 1, 0);
    world.addBody(this.body);

    // Tuning — very slow
    this.maxSpeed = 10 + Math.random() * 4; // 10-14
    this.forwardForce = 40000;

    // Pick an initial road-aligned direction (N/S/E/W)
    const directions = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
    const initAngle = directions[Math.floor(Math.random() * directions.length)];
    this.body.quaternion.setFromEuler(0, initAngle, 0);

    // Physics pre-step: drive forward, follow roads. Uses module-scope
    // scratch Vec3s instead of allocating fresh ones every step (8 civilians
    // × 60Hz × 6 allocations = ~3000 alloc/sec otherwise).
    this.preStepCallback = () => {
      this.body.wakeUp();

      // Don't drive while stunned
      if (this.stunTimer > 0) {
        this.body.velocity.scale(0.9, this.body.velocity);
        return;
      }

      // Current tile (Math.floor matches how city-generator checks tiles)
      const tileX = Math.floor(this.body.position.x / TILE_SIZE);
      const tileZ = Math.floor(this.body.position.z / TILE_SIZE);

      // Tile center in world coords
      const tileCenterX = tileX * TILE_SIZE + TILE_SIZE / 2;
      const tileCenterZ = tileZ * TILE_SIZE + TILE_SIZE / 2;

      // Get forward direction in world space
      this.body.quaternion.vmult(_civForward, _civWorldForward);

      // Determine primary movement axis from facing direction
      const movingX = Math.abs(_civWorldForward.x) > Math.abs(_civWorldForward.z);

      // Snap toward tile center on the perpendicular axis to stay centered on road
      if (movingX) {
        // Moving along X, snap Z toward tile center
        this.body.position.z += (tileCenterZ - this.body.position.z) * 0.1;
      } else {
        // Moving along Z, snap X toward tile center
        this.body.position.x += (tileCenterX - this.body.position.x) * 0.1;
      }

      // Check tile 1 ahead in the direction we're moving
      const aheadTileX = tileX + Math.round(_civWorldForward.x);
      const aheadTileZ = tileZ + Math.round(_civWorldForward.z);

      // If current tile isn't road, try to steer to nearest road
      const onRoad = isRoad(tileX, tileZ);

      if (!onRoad || !isRoad(aheadTileX, aheadTileZ)) {
        // Find adjacent road tiles to turn toward
        const roadDirs: { dx: number; dz: number }[] = [];
        const neighbors = [
          { dx: 1, dz: 0 },
          { dx: -1, dz: 0 },
          { dx: 0, dz: 1 },
          { dx: 0, dz: -1 },
        ];
        for (const n of neighbors) {
          if (isRoad(tileX + n.dx, tileZ + n.dz)) {
            // Skip the direction we came from (unless we're off-road)
            if (onRoad) {
              const dot = _civWorldForward.x * n.dx + _civWorldForward.z * n.dz;
              if (dot < -0.5) continue;
            }
            roadDirs.push(n);
          }
        }

        if (roadDirs.length > 0) {
          const pick = roadDirs[Math.floor(Math.random() * roadDirs.length)];
          const targetAngle = Math.atan2(pick.dx, -pick.dz);
          this.body.quaternion.setFromEuler(0, targetAngle, 0);
        } else {
          // No road nearby, turn around
          _civQ.setFromEuler(0, Math.PI, 0);
          this.body.quaternion = this.body.quaternion.mult(_civQ);
        }
      }

      // Drive forward
      this.body.vectorToLocalFrame(this.body.velocity, _civLocalVel);
      const forwardSpeed = -_civLocalVel.z;
      const speedRatio = Math.min(forwardSpeed / this.maxSpeed, 1);
      const forceScale = 1.0 - speedRatio * 0.7;
      _civForce.set(0, 0, -this.forwardForce * forceScale);
      this.body.applyLocalForce(_civForce, _civForceOffset);

      // Arcade friction — very strong lateral grip to stay on road. Reuse
      // _civLocalVel; applyLocalForce may have mutated body.velocity so we
      // re-read into the same scratch.
      this.body.vectorToLocalFrame(this.body.velocity, _civLocalVel);
      _civLocalVel.x *= 0.7;
      _civLocalVel.z *= 0.98;
      this.body.vectorToWorldFrame(_civLocalVel, this.body.velocity);

      // Cap speed
      const speed = this.body.velocity.length();
      if (speed > this.maxSpeed) {
        this.body.velocity.scale(this.maxSpeed / speed, this.body.velocity);
      }
    };

    this.world.addEventListener("preStep", this.preStepCallback);
  }

  stun() {
    this.stunTimer = 3;
  }

  update(dt: number) {
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
    }

    // Sync visuals
    this.mesh.position.set(this.body.position.x, this.body.position.y, this.body.position.z);
    this.mesh.quaternion.set(
      this.body.quaternion.x,
      this.body.quaternion.y,
      this.body.quaternion.z,
      this.body.quaternion.w,
    );
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.world.removeBody(this.body);
    this.world.removeEventListener("preStep", this.preStepCallback);
    // Per-instance materials are uniquely colored, so they must be disposed
    // here. Geometries are module-shared and stay alive.
    this.bodyMat.dispose();
    this.stripeMat.dispose();
  }
}
