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

export class Civilian {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  maxSpeed: number;
  forwardForce: number;
  stunTimer: number;
  preStepCallback: () => void;

  constructor(scene: THREE.Scene, world: CANNON.World, position: THREE.Vector3) {
    this.scene = scene;
    this.world = world;
    this.stunTimer = 0;

    const unit = 0.5;
    this.mesh = new THREE.Group();

    const bodyColor = CIVILIAN_COLORS[Math.floor(Math.random() * CIVILIAN_COLORS.length)];

    // Darker shade for trim/stripe
    const trimColor = new THREE.Color(bodyColor).multiplyScalar(0.7).getHex();

    // Van body — tall, boxy
    const bodyGeo = new THREE.BoxGeometry(unit * 4, unit * 1.2, unit * 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, ...matProps });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = unit * 1;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh.add(bodyMesh);

    // Van cabin — tall box spanning most of the length
    const cabinGeo = new THREE.BoxGeometry(unit * 3.6, unit * 2, unit * 5.5);
    const cabinMat = new THREE.MeshStandardMaterial({ color: bodyColor, ...matProps });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.y = unit * 2.6;
    cabinMesh.position.z = unit * 0.5;
    cabinMesh.castShadow = true;
    this.mesh.add(cabinMesh);

    // Side stripe — runs along both sides
    const stripeMat = new THREE.MeshStandardMaterial({ color: trimColor, ...matProps });
    const stripeGeo = new THREE.BoxGeometry(unit * 0.15, unit * 0.4, unit * 5);
    const stripeL = new THREE.Mesh(stripeGeo, stripeMat);
    stripeL.position.set(-unit * 1.85, unit * 2.2, unit * 0.5);
    this.mesh.add(stripeL);
    const stripeR = new THREE.Mesh(stripeGeo, stripeMat);
    stripeR.position.set(unit * 1.85, unit * 2.2, unit * 0.5);
    this.mesh.add(stripeR);

    // Bottom trim line
    const bottomStripeGeo = new THREE.BoxGeometry(unit * 4.1, unit * 0.2, unit * 8.1);
    const bottomStripe = new THREE.Mesh(bottomStripeGeo, stripeMat);
    bottomStripe.position.y = unit * 0.45;
    this.mesh.add(bottomStripe);

    // Windshield (front window)
    const windshieldGeo = new THREE.BoxGeometry(unit * 3, unit * 1.4, unit * 0.2);
    const windshield = new THREE.Mesh(windshieldGeo, CIV_GLASS_MAT);
    windshield.position.set(0, unit * 2.8, -unit * 2.3);
    this.mesh.add(windshield);

    // Side windows
    const sideWinGeo = new THREE.BoxGeometry(unit * 0.15, unit * 1, unit * 1.2);
    const sideWinL = new THREE.Mesh(sideWinGeo, CIV_GLASS_MAT);
    sideWinL.position.set(-unit * 1.85, unit * 2.8, -unit * 1.2);
    this.mesh.add(sideWinL);
    const sideWinR = new THREE.Mesh(sideWinGeo, CIV_GLASS_MAT);
    sideWinR.position.set(unit * 1.85, unit * 2.8, -unit * 1.2);
    this.mesh.add(sideWinR);

    // Rear window
    const rearWinGeo = new THREE.BoxGeometry(unit * 2.4, unit * 1, unit * 0.15);
    const rearWin = new THREE.Mesh(rearWinGeo, CIV_GLASS_MAT);
    rearWin.position.set(0, unit * 2.8, unit * 3.3);
    this.mesh.add(rearWin);

    // Headlights
    const headlightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
    const hlLeft = new THREE.Mesh(headlightGeo, CIV_HEADLIGHT_MAT);
    hlLeft.position.set(-unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlLeft);
    const hlRight = new THREE.Mesh(headlightGeo, CIV_HEADLIGHT_MAT);
    hlRight.position.set(unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlRight);

    // Taillights
    const taillightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
    const tlLeft = new THREE.Mesh(taillightGeo, CIV_TAILLIGHT_MAT);
    tlLeft.position.set(-unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlLeft);
    const tlRight = new THREE.Mesh(taillightGeo, CIV_TAILLIGHT_MAT);
    tlRight.position.set(unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlRight);

    // Wheels
    const wheelGeo = new THREE.BoxGeometry(unit, unit, unit);
    const wheelPositions: [number, number, number][] = [
      [-unit * 2.5, unit * 0.5, unit * 2.5],
      [unit * 2.5, unit * 0.5, unit * 2.5],
      [-unit * 2.5, unit * 0.5, -unit * 2.5],
      [unit * 2.5, unit * 0.5, -unit * 2.5],
    ];
    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, CIV_WHEEL_MAT);
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

    // Physics pre-step: drive forward, follow roads
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
      const forward = new CANNON.Vec3(0, 0, -1);
      const worldForward = new CANNON.Vec3();
      this.body.quaternion.vmult(forward, worldForward);

      // Determine primary movement axis from facing direction
      const movingX = Math.abs(worldForward.x) > Math.abs(worldForward.z);

      // Snap toward tile center on the perpendicular axis to stay centered on road
      if (movingX) {
        // Moving along X, snap Z toward tile center
        this.body.position.z += (tileCenterZ - this.body.position.z) * 0.1;
      } else {
        // Moving along Z, snap X toward tile center
        this.body.position.x += (tileCenterX - this.body.position.x) * 0.1;
      }

      // Check tile 1 ahead in the direction we're moving
      const aheadTileX = tileX + Math.round(worldForward.x);
      const aheadTileZ = tileZ + Math.round(worldForward.z);

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
              const dot = worldForward.x * n.dx + worldForward.z * n.dz;
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
          const q = new CANNON.Quaternion();
          q.setFromEuler(0, Math.PI, 0);
          this.body.quaternion = this.body.quaternion.mult(q);
        }
      }

      // Drive forward
      const localVel = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVel);
      const forwardSpeed = -localVel.z;
      const speedRatio = Math.min(forwardSpeed / this.maxSpeed, 1);
      const forceScale = 1.0 - speedRatio * 0.7;
      const force = new CANNON.Vec3(0, 0, -this.forwardForce * forceScale);
      this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));

      // Arcade friction — very strong lateral grip to stay on road
      const localVelocity = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVelocity);
      localVelocity.x *= 0.7;
      localVelocity.z *= 0.98;
      this.body.vectorToWorldFrame(localVelocity, this.body.velocity);

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
  }
}
