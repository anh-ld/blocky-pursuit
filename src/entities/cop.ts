import * as THREE from "three";
import * as CANNON from "cannon-es";

export class Cop {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  forwardForce: number;
  maxSpeed: number;
  turnSpeed: number;
  targetPosition: THREE.Vector3 | null = null;
  preStepCallback: () => void;

  constructor(scene: THREE.Scene, world: CANNON.World, position: THREE.Vector3) {
    this.scene = scene;
    this.world = world;

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
      mass: 100, // Reduced mass to match player
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

    // Tuning parameters
    this.forwardForce = 135000; // Scaled up to match player
    this.turnSpeed = 2.0;
    this.maxSpeed = 35; // Speed limit
    this.preStepCallback = () => {
      if (!this.targetPosition) return;

      // Ensure body is awake
      this.body.wakeUp();

      // Custom Arcade Friction (Drift Mechanics)
      const localVelocity = new CANNON.Vec3();
      this.body.vectorToLocalFrame(this.body.velocity, localVelocity);

      // Dampen lateral velocity (X) for grip, and forward velocity (Z) for drag
      localVelocity.x *= 0.85;
      localVelocity.z *= 0.98;

      // Convert back to world velocity and apply
      this.body.vectorToWorldFrame(localVelocity, this.body.velocity);

      // Cap max speed
      const speed = this.body.velocity.length();
      if (speed > this.maxSpeed) {
        this.body.velocity.scale(this.maxSpeed / speed, this.body.velocity);
      }

      // Direction vector to target
      const targetDir = new CANNON.Vec3(
        this.targetPosition.x - this.body.position.x,
        0,
        this.targetPosition.z - this.body.position.z,
      );
      targetDir.normalize();

      // Forward vector of the cop (local -Z)
      const forward = new CANNON.Vec3(0, 0, -1);
      const worldForward = new CANNON.Vec3();
      this.body.quaternion.vmult(forward, worldForward);
      worldForward.y = 0;
      worldForward.normalize();

      // Determine if target is to the left or right
      const cross = new CANNON.Vec3();
      worldForward.cross(targetDir, cross);
      const dot = worldForward.dot(targetDir);

      // Apply forward force if below max speed
      if (this.body.velocity.length() < this.maxSpeed) {
        const force = new CANNON.Vec3(0, 0, -this.forwardForce);
        this.body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
      }

      // Steering
      // If the target is somewhat in front (dot > -0.5), steer normally
      // If it's behind, still try to turn around
      if (dot < 0.98) {
        // Not pointing directly at target
        let targetTurn = 0;
        if (cross.y > 0) {
          targetTurn = this.turnSpeed; // Turn left
        } else {
          targetTurn = -this.turnSpeed; // Turn right
        }
        this.body.angularVelocity.y += (targetTurn - this.body.angularVelocity.y) * 0.3;
      } else {
        this.body.angularVelocity.y *= 0.8;
      }
    };

    this.world.addEventListener("preStep", this.preStepCallback);
  }

  update(_dt: number, targetPosition: THREE.Vector3) {
    this.targetPosition = targetPosition;

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
