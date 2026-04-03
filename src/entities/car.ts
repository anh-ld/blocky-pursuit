import * as THREE from "three";
import * as CANNON from "cannon-es";

export class Car {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  keys: { forward: boolean; backward: boolean; left: boolean; right: boolean };
  forwardForce: number;
  maxSpeed: number;
  turnSpeed: number;

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

    // Cabin
    const cabinGeo = new THREE.BoxGeometry(unit * 3, unit * 1.5, unit * 4);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: cabinColor,
      roughness: 0.3,
      flatShading: true,
      metalness: 0.5,
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.y = unit * 2.25;
    cabinMesh.position.z = -unit * 0.5;
    cabinMesh.castShadow = true;
    cabinMesh.receiveShadow = true;
    this.mesh.add(cabinMesh);

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
      position: new CANNON.Vec3(0, 5, 0),
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
      forward: false,
      backward: false,
      left: false,
      right: false,
    };

    // Tuning parameters
    this.forwardForce = 150000; // Drastically increased force to make it fast
    this.maxSpeed = 40; // Cap the speed so it doesn't accelerate infinitely
    this.turnSpeed = 2.5; // Adjusted turn speed

    this.world.addEventListener("preStep", () => {
      // Always wake the body up
      this.body.wakeUp();

      // 1. Acceleration
      if (this.keys.forward) {
        const force = new CANNON.Vec3(0, 0, -this.forwardForce);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
      }
      if (this.keys.backward) {
        const force = new CANNON.Vec3(0, 0, this.forwardForce);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
      }

      // 2. Custom Arcade Friction (Drift Mechanics)
      const localVelocity = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVelocity);

      // Dampen lateral velocity (X) for grip, and forward velocity (Z) for drag
      localVelocity.x *= 0.85; // 0.85 allows a little drifting but snaps back (grip)
      localVelocity.z *= 0.98; // Light forward drag

      // Convert back to world velocity and apply
      this.body.vectorToWorldFrame(localVelocity, this.body.velocity);

      // Cap max speed
      const speed = this.body.velocity.length();
      if (speed > this.maxSpeed) {
        this.body.velocity.scale(this.maxSpeed / speed, this.body.velocity);
      }

      // 3. Steering
      if (speed > 1.0) {
        // Only steer if moving
        // Direction multiplier: 1 if moving forward (local Z is negative), -1 if backward
        const dir = localVelocity.z < 0 ? 1 : -1;

        // Turn sharpness scales slightly with speed
        const turnMultiplier = Math.min(speed / 10, 1.0);

        let targetTurn = 0;
        if (this.keys.left) {
          targetTurn = this.turnSpeed * turnMultiplier * dir;
        } else if (this.keys.right) {
          targetTurn = -this.turnSpeed * dir;
        }

        // Lerp angular velocity for smooth, natural steering
        this.body.angularVelocity.y += (targetTurn - this.body.angularVelocity.y) * 0.3;
      } else {
        this.body.angularVelocity.y *= 0.8; // Dampen rotation when nearly stopped
      }
    });

    this.initControls();
  }

  initControls() {
    window.addEventListener("keydown", (e) => this.handleKeyDown(e));
    window.addEventListener("keyup", (e) => this.handleKeyUp(e));
  }

  handleKeyDown(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    // Prevent default scrolling for arrow keys and space
    if (["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
      e.preventDefault();
    }
    if (key === "w" || key === "arrowup") this.keys.forward = true;
    if (key === "s" || key === "arrowdown") this.keys.backward = true;
    if (key === "a" || key === "arrowleft") this.keys.left = true;
    if (key === "d" || key === "arrowright") this.keys.right = true;
  }

  handleKeyUp(e: KeyboardEvent) {
    const key = e.key.toLowerCase();
    if (key === "w" || key === "arrowup") this.keys.forward = false;
    if (key === "s" || key === "arrowdown") this.keys.backward = false;
    if (key === "a" || key === "arrowleft") this.keys.left = false;
    if (key === "d" || key === "arrowright") this.keys.right = false;
  }

  update(_dt: number) {
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
