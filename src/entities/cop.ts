import * as THREE from "three";
import * as CANNON from "cannon-es";

export interface ICopLevelConfig {
  mass: number;
  speed: number;
  ramSpeed: number; // burst speed when close to player
  turnSpeed: number;
  forwardForce: number;
  predictAhead: number; // seconds to predict player position (0 = no prediction)
  flank: boolean; // whether this cop tries to flank
}

// Player: maxSpeed=40, mass=100
export const COP_LEVEL_CONFIGS: Record<number, ICopLevelConfig> = {
  1: { mass: 100, speed: 44, ramSpeed: 52, turnSpeed: 2.2, forwardForce: 160000, predictAhead: 0.5, flank: false },
  2: { mass: 115, speed: 46, ramSpeed: 55, turnSpeed: 2.5, forwardForce: 175000, predictAhead: 0.8, flank: false },
  3: { mass: 130, speed: 48, ramSpeed: 58, turnSpeed: 2.8, forwardForce: 190000, predictAhead: 1.2, flank: true },
  4: { mass: 160, speed: 50, ramSpeed: 62, turnSpeed: 3.0, forwardForce: 210000, predictAhead: 1.5, flank: true },
  5: { mass: 200, speed: 52, ramSpeed: 65, turnSpeed: 3.2, forwardForce: 230000, predictAhead: 1.8, flank: true },
};

export class Cop {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  forwardForce: number;
  maxSpeed: number;
  turnSpeed: number;
  bounceBackTimer: number;
  bounceBackDuration: number;
  recoveryTimer: number;
  recoveryDuration: number;
  targetPosition: THREE.Vector3 | null = null;
  targetVelocity: CANNON.Vec3 | null = null;
  level: number;
  config: ICopLevelConfig;
  flankSide: number; // +1 or -1
  damageCooldown: number; // seconds until this cop can deal damage again
  preStepCallback: () => void;

  constructor(scene: THREE.Scene, world: CANNON.World, position: THREE.Vector3, level: number = 1) {
    this.scene = scene;
    this.world = world;
    this.level = Math.max(1, Math.min(5, level));
    this.config = COP_LEVEL_CONFIGS[this.level];
    this.flankSide = Math.random() < 0.5 ? 1 : -1;
    this.damageCooldown = 0;

    // Voxel dimensions
    const unit = 0.5;

    // --- Visuals (Three.js) ---
    this.mesh = new THREE.Group();

    // Colors
    const bodyColor = 0x1a237e; // Dark blue
    const cabinColor = 0xffffff; // White roof
    const lightRed = 0xff1111;
    const lightBlue = 0x1111ff;
    const wheelColor = 0x111111;

    const matProps = { roughness: 0.8, flatShading: true };

    // Chassis (Body)
    const bodyGeo = new THREE.BoxGeometry(unit * 4, unit, unit * 8);
    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, ...matProps });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = unit;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    this.mesh.add(bodyMesh);

    // Cabin (shifted toward rear so front hood is visible)
    const cabinGeo = new THREE.BoxGeometry(unit * 3, unit * 1.5, unit * 3);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: cabinColor,
      roughness: 0.3,
      flatShading: true,
      metalness: 0.5,
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.y = unit * 2.25;
    cabinMesh.position.z = unit * 1.5; // rear half
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;
    this.mesh.add(cabinMesh);

    // Siren lights (on top of cabin)
    const lightGeo = new THREE.BoxGeometry(unit, unit * 0.5, unit);
    const redLightMat = new THREE.MeshStandardMaterial({
      color: lightRed,
      emissive: lightRed,
      emissiveIntensity: 1.0,
      flatShading: true,
    });
    const blueLightMat = new THREE.MeshStandardMaterial({
      color: lightBlue,
      emissive: lightBlue,
      emissiveIntensity: 1.0,
      flatShading: true,
    });

    const redLight = new THREE.Mesh(lightGeo, redLightMat);
    redLight.position.set(-unit, unit * 3.25, unit * 1.5);
    this.mesh.add(redLight);

    const blueLight = new THREE.Mesh(lightGeo, blueLightMat);
    blueLight.position.set(unit, unit * 3.25, unit * 1.5);
    this.mesh.add(blueLight);

    // Front grille
    const grilleGeo = new THREE.BoxGeometry(unit * 3.2, unit * 0.6, unit * 0.2);
    const grilleMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
    const grille = new THREE.Mesh(grilleGeo, grilleMat);
    grille.position.set(0, unit * 0.9, -unit * 4.1);
    this.mesh.add(grille);

    // Headlights (front = -Z)
    const headlightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
    const headlightMat = new THREE.MeshStandardMaterial({
      color: 0xffee88,
      emissive: 0xffee88,
      emissiveIntensity: 0.8,
      flatShading: true,
    });
    const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
    hlLeft.position.set(-unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlLeft);
    const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
    hlRight.position.set(unit * 1.5, unit * 1.1, -unit * 4.1);
    this.mesh.add(hlRight);

    // Taillights (rear = +Z, red)
    const taillightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
    const taillightMat = new THREE.MeshStandardMaterial({
      color: 0xff2222,
      emissive: 0xff2222,
      emissiveIntensity: 0.6,
      flatShading: true,
    });
    const tlLeft = new THREE.Mesh(taillightGeo, taillightMat);
    tlLeft.position.set(-unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlLeft);
    const tlRight = new THREE.Mesh(taillightGeo, taillightMat);
    tlRight.position.set(unit * 1.5, unit * 1.1, unit * 4.1);
    this.mesh.add(tlRight);

    // Wheels
    const wheelGeo = new THREE.BoxGeometry(unit, unit, unit);
    const wheelMat = new THREE.MeshStandardMaterial({ color: wheelColor, ...matProps });

    const wheelPositions: [number, number, number][] = [
      [-unit * 2.5, unit * 0.5, unit * 2.5], // Front Left
      [unit * 2.5, unit * 0.5, unit * 2.5], // Front Right
      [-unit * 2.5, unit * 0.5, -unit * 2.5], // Rear Left
      [unit * 2.5, unit * 0.5, -unit * 2.5], // Rear Right
    ];

    wheelPositions.forEach((pos) => {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.position.set(pos[0], pos[1], pos[2]);
      wheel.castShadow = true;
      this.mesh.add(wheel);
    });

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
    this.forwardForce = this.config.forwardForce;
    this.turnSpeed = this.config.turnSpeed;
    this.maxSpeed = this.config.speed;

    // Collision bounce-back state (same as player car)
    this.bounceBackTimer = 0;
    this.bounceBackDuration = 1.25;
    this.recoveryTimer = 0;
    this.recoveryDuration = 1.0;

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
      // Ram mode: boost speed when within 25 units
      const isRamming = distToPlayer < 25;
      const activeMaxSpeed = isRamming ? this.config.ramSpeed : this.maxSpeed;
      const activeForce = isRamming ? this.forwardForce * 1.4 : this.forwardForce;

      // 1. Auto-drive with acceleration curve
      const localVel = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVel);
      const forwardSpeed = -localVel.z;
      const maxReverseSpeed = activeMaxSpeed * 0.25;

      if (this.bounceBackTimer > 0) {
        const reverseSpeed = Math.max(0, -forwardSpeed);
        const reverseRatio = Math.min(reverseSpeed / maxReverseSpeed, 1);
        const reverseScale = 0.3 * (1 - reverseRatio * 0.8);
        const force = new CANNON.Vec3(0, 0, activeForce * reverseScale);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));

        if (reverseSpeed > maxReverseSpeed) {
          localVel.z = maxReverseSpeed;
          this.body.vectorToWorldFrame(localVel, this.body.velocity);
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

        const force = new CANNON.Vec3(0, 0, -activeForce * forceScale);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
      }

      // 2. Arcade friction — tighter grip so cops corner better
      const localVelocity = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVelocity);

      const isRecovering = this.bounceBackTimer > 0 || this.recoveryTimer > 0;
      localVelocity.x *= isRecovering ? 0.92 : 0.8; // tighter lateral grip
      localVelocity.z *= 0.98;

      this.body.vectorToWorldFrame(localVelocity, this.body.velocity);

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
        if (this.config.predictAhead > 0 && this.targetVelocity) {
          aimX += this.targetVelocity.x * this.config.predictAhead;
          aimZ += this.targetVelocity.z * this.config.predictAhead;
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

        const targetDir = new CANNON.Vec3(
          aimX - this.body.position.x,
          0,
          aimZ - this.body.position.z,
        );
        targetDir.normalize();

        const forward = new CANNON.Vec3(0, 0, -1);
        const worldForward = new CANNON.Vec3();
        this.body.quaternion.vmult(forward, worldForward);
        worldForward.y = 0;
        worldForward.normalize();

        const cross = new CANNON.Vec3();
        worldForward.cross(targetDir, cross);
        const dot = worldForward.dot(targetDir);

        if (dot < 0.98) {
          let steerAngle = 0;
          if (cross.y > 0) {
            steerAngle = this.turnSpeed;
          } else {
            steerAngle = -this.turnSpeed;
          }

          const q = new CANNON.Quaternion();
          q.setFromEuler(0, steerAngle * (1 / 60), 0);
          this.body.quaternion = this.body.quaternion.mult(q);
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
  }

  destroy() {
    this.scene.remove(this.mesh);
    this.world.removeBody(this.body);
    this.world.removeEventListener("preStep", this.preStepCallback);
  }
}
