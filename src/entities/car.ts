import * as THREE from "three";
import * as CANNON from "cannon-es";

export class Car {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  keys: { left: boolean; right: boolean };
  forwardForce: number;
  maxSpeed: number;
  turnSpeed: number;
  bounceBackTimer: number;
  bounceBackDuration: number;
  recoveryTimer: number;
  recoveryDuration: number;

  constructor(scene: THREE.Scene, world: CANNON.World) {
    this.scene = scene;
    this.world = world;

    // Voxel dimensions
    const unit = 0.5;

    // --- Visuals (Three.js) ---
    this.mesh = new THREE.Group();

    // Colors
    const bodyColor = 0xd32f2f; // Red
    const cabinColor = 0xffffff; // White roof
    const wheelColor = 0x111111;

    // Materials setup with flatShading for pixelated/low-poly look
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

    // Vietnam flag on roof
    // Vietnam flag painted on roof (flat on cabin top, y = unit * 3.01)
    const roofY = unit * 3.01;

    // Red background (lies flat on roof)
    const flagGeo = new THREE.PlaneGeometry(unit * 2.6, unit * 2.6);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xda251d,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.rotation.x = -Math.PI / 2;
    flag.position.set(0, roofY, unit * 1.5);
    this.mesh.add(flag);

    // Yellow star on top of flag
    const starShape = new THREE.Shape();
    const starPoints = 5;
    const outerR = unit * 0.85;
    const innerR = unit * 0.34;
    for (let i = 0; i < starPoints * 2; i++) {
      const r = i % 2 === 0 ? outerR : innerR;
      const angle = (i * Math.PI) / starPoints - Math.PI / 2;
      const x = Math.cos(angle) * r;
      const y = Math.sin(angle) * r;
      if (i === 0) starShape.moveTo(x, y);
      else starShape.lineTo(x, y);
    }
    starShape.closePath();
    const starGeo = new THREE.ShapeGeometry(starShape);
    const starMat = new THREE.MeshStandardMaterial({
      color: 0xffcd00,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const star = new THREE.Mesh(starGeo, starMat);
    star.rotation.x = -Math.PI / 2;
    star.position.set(0, roofY + 0.01, unit * 1.5);
    this.mesh.add(star);

    // Front grille (dark strip across the front face)
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
    // Single rigid body
    const shape = new CANNON.Box(new CANNON.Vec3(unit * 2, unit * 1.5, unit * 4));
    this.body = new CANNON.Body({
      mass: 100, // Reduced mass for better acceleration
      position: new CANNON.Vec3(0, 1, 0),
      linearDamping: 0.1, // Reduced damping so it coasts faster
      angularDamping: 0.9,
      sleepSpeedLimit: 0.1, // Don't sleep unless completely stopped
      sleepTimeLimit: 1,
      allowSleep: false,
    });

    // Add shape with slight offset so center of mass is lower
    this.body.addShape(shape, new CANNON.Vec3(0, unit, 0));

    // Disable rotation on X and Z axes, only allow Y rotation to prevent flipping
    this.body.angularFactor.set(0, 1, 0);
    // Force the body to wake up
    this.body.wakeUp();

    world.addBody(this.body);

    // --- Controls ---
    this.keys = {
      left: false,
      right: false,
    };

    // Tuning parameters
    this.forwardForce = 150000;
    this.maxSpeed = 40;
    this.turnSpeed = 2.5;

    // Collision bounce-back state
    this.bounceBackTimer = 0;
    this.bounceBackDuration = 1.25; // seconds to reverse after collision
    this.recoveryTimer = 0;
    this.recoveryDuration = 1.0; // seconds of gentle acceleration after bounce-back

    // Listen for collisions with static objects (buildings, walls, etc.)
    this.body.addEventListener("collide", (event: { body: CANNON.Body }) => {
      const other = event.body;
      // Static bodies (mass 0) that aren't the ground plane (ground has no bounding box shape)
      if (other.mass === 0 && other.shapes[0] instanceof CANNON.Box) {
        this.bounceBackTimer = this.bounceBackDuration;
      }
    });

    this.world.addEventListener("preStep", () => {
      this.body.wakeUp();

      // Don't allow control while airborne (e.g. initial drop)
      if (this.body.position.y > 1.5) return;

      // 1. Auto-drive with acceleration curve (both directions start from 0)
      const localVel = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVel);
      const forwardSpeed = -localVel.z; // positive = moving forward
      const maxReverseSpeed = this.maxSpeed * 0.25; // 15% of forward top speed (~6 units)

      if (this.bounceBackTimer > 0) {
        // Reverse: strong torque at standstill, tapering as it approaches max reverse
        const reverseSpeed = Math.max(0, -forwardSpeed);
        const reverseRatio = Math.min(reverseSpeed / maxReverseSpeed, 1);
        const reverseScale = 0.2 * (1 - reverseRatio * 0.8);
        const force = new CANNON.Vec3(0, 0, this.forwardForce * reverseScale);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));

        // Cap reverse speed
        if (reverseSpeed > maxReverseSpeed) {
          localVel.z = maxReverseSpeed;
          this.body.vectorToWorldFrame(localVel, this.body.velocity);
        }
      } else {
        // Forward: peak torque at low speed, tapering toward top speed
        let forceScale: number;
        if (forwardSpeed < 0) {
          forceScale = 0.8;
        } else {
          const speedRatio = Math.min(forwardSpeed / this.maxSpeed, 1);
          forceScale = 1.0 - speedRatio * 0.7;
        }

        // Recovery phase: gentle ramp after bounce-back so steering has time to work
        if (this.recoveryTimer > 0) {
          const recoveryProgress = 1 - this.recoveryTimer / this.recoveryDuration; // 0→1
          // Ramp from 15% to 100% over recovery duration
          forceScale *= 0.15 + 0.85 * recoveryProgress;
        }

        const force = new CANNON.Vec3(0, 0, -this.forwardForce * forceScale);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
      }

      // 2. Custom Arcade Friction (Drift Mechanics)
      const localVelocity = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVelocity);

      // Relax lateral grip during bounce-back/recovery so steering can redirect the car
      const isRecovering = this.bounceBackTimer > 0 || this.recoveryTimer > 0;
      localVelocity.x *= isRecovering ? 0.95 : 0.85;
      localVelocity.z *= 0.98;

      this.body.vectorToWorldFrame(localVelocity, this.body.velocity);

      // Cap max speed
      const speed = this.body.velocity.length();
      if (speed > this.maxSpeed) {
        this.body.velocity.scale(this.maxSpeed / speed, this.body.velocity);
      }

      // 3. Steering — direct heading rotation (like real steering wheel)
      //    Fixed rotation rate regardless of speed. Low speed = tight arc, high speed = wide arc.
      this.body.angularVelocity.y = 0; // disable physics-driven rotation
      if (speed > 0.5) {
        const dir = localVelocity.z < 0 ? 1 : -1;
        let steerAngle = 0;
        if (this.keys.left) steerAngle = this.turnSpeed * dir;
        if (this.keys.right) steerAngle = -this.turnSpeed * dir;

        // Directly rotate the body's quaternion
        const q = new CANNON.Quaternion();
        q.setFromEuler(0, steerAngle * (1 / 60), 0); // per physics step
        this.body.quaternion = this.body.quaternion.mult(q);
      }
    });

    this.initControls();
  }

  initControls() {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
    this.initTouchControls();
  }

  initTouchControls() {
    const btnLeft = document.getElementById("touch-left");
    const btnRight = document.getElementById("touch-right");
    if (!btnLeft || !btnRight) return;

    // Track which touch IDs are active on each button
    const activeTouches = { left: new Set<number>(), right: new Set<number>() };

    const bind = (btn: HTMLElement, key: "left" | "right") => {
      btn.addEventListener("touchstart", (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          activeTouches[key].add(e.changedTouches[i].identifier);
        }
        this.keys[key] = true;
      }, { passive: false });

      const release = (e: TouchEvent) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          activeTouches[key].delete(e.changedTouches[i].identifier);
        }
        if (activeTouches[key].size === 0) {
          this.keys[key] = false;
        }
      };

      btn.addEventListener("touchend", release, { passive: false });
      btn.addEventListener("touchcancel", release, { passive: false });
    };

    bind(btnLeft, "left");
    bind(btnRight, "right");

    // Safety: release all keys if all touches end globally (finger slides off button)
    window.addEventListener("touchend", (e: TouchEvent) => {
      if (e.touches.length === 0) {
        activeTouches.left.clear();
        activeTouches.right.clear();
        this.keys.left = false;
        this.keys.right = false;
      }
    });
  }

  handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (["arrowleft", "arrowright", "a", "d", " "].includes(key)) {
      e.preventDefault();
    }
    if (key === "a" || key === "arrowleft") this.keys.left = true;
    if (key === "d" || key === "arrowright") this.keys.right = true;
  }

  handleKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (key === "a" || key === "arrowleft") this.keys.left = false;
    if (key === "d" || key === "arrowright") this.keys.right = false;
  }

  /** Set a random facing direction (Y-axis rotation) */
  setRandomDirection() {
    const angle = Math.random() * Math.PI * 2;
    this.body.quaternion.setFromEuler(0, angle, 0);
  }

  update(dt: number) {
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
}
