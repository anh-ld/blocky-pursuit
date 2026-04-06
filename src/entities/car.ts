import * as THREE from "three";
import * as CANNON from "cannon-es";
import { getSkin } from "./car-skins";
import { buildCarMesh, CAR_UNIT } from "./car-mesh";
import { installCarPhysics } from "./car-physics";

export class Car {
  scene: THREE.Scene;
  world: CANNON.World;
  mesh: THREE.Group;
  body: CANNON.Body;
  keys: { left: boolean; right: boolean };
  forwardForce: number;
  maxSpeed: number;
  baseMaxSpeed: number;
  turnSpeed: number;
  bounceBackTimer: number;
  bounceBackDuration: number;
  recoveryTimer: number;
  recoveryDuration: number;
  bodyMat: THREE.MeshStandardMaterial;
  cabinMat: THREE.MeshStandardMaterial;
  lateralSpeed: number;
  bodyBaseEmissive: THREE.Color;

  constructor(scene: THREE.Scene, world: CANNON.World, skinId: string = "redstar") {
    this.scene = scene;
    this.world = world;

    // --- Visuals (Three.js) ---
    const meshHandles = buildCarMesh(skinId);
    this.mesh = meshHandles.group;
    this.bodyMat = meshHandles.bodyMat;
    this.cabinMat = meshHandles.cabinMat;
    scene.add(this.mesh);

    // --- Physics (Cannon-es) ---
    const unit = CAR_UNIT;
    const shape = new CANNON.Box(new CANNON.Vec3(unit * 2, unit * 1.5, unit * 4));
    this.body = new CANNON.Body({
      mass: 100,
      position: new CANNON.Vec3(0, 1, 0),
      linearDamping: 0.1,
      angularDamping: 0.9,
      sleepSpeedLimit: 0.1,
      sleepTimeLimit: 1,
      allowSleep: false,
    });
    // Add shape with offset so center of mass is lower
    this.body.addShape(shape, new CANNON.Vec3(0, unit, 0));
    // Disable rotation on X and Z axes — only Y rotation, prevents flipping
    this.body.angularFactor.set(0, 1, 0);
    this.body.wakeUp();
    world.addBody(this.body);

    // --- Controls ---
    this.keys = { left: false, right: false };

    // --- Tuning (with skin bonuses) ---
    const skin = getSkin(skinId);
    this.forwardForce = 150000 + skin.forceBonus;
    this.baseMaxSpeed = 40 + skin.speedBonus;
    this.maxSpeed = this.baseMaxSpeed;
    this.turnSpeed = 2.5;

    // Drift / bounce-flash state
    this.lateralSpeed = 0;
    this.bodyBaseEmissive = this.bodyMat.emissive.clone();

    // Collision bounce-back state
    this.bounceBackTimer = 0;
    this.bounceBackDuration = 1.25;
    this.recoveryTimer = 0;
    this.recoveryDuration = 1.0;

    // Install the preStep auto-drive + steering callback
    installCarPhysics(this);

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

    // Track which touch IDs are active on each button so multi-touch and
    // finger-slide-off behave correctly.
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

  /** Apply a new skin without rebuilding the mesh. */
  applySkin(skinId: string) {
    const skin = getSkin(skinId);
    this.bodyMat.color.setHex(skin.bodyColor);
    this.cabinMat.color.setHex(skin.cabinColor);
    this.forwardForce = 150000 + skin.forceBonus;
    this.baseMaxSpeed = 40 + skin.speedBonus;
    this.maxSpeed = this.baseMaxSpeed;
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

    // Bounce-back rim flash: red emissive while reversing from collision so
    // the player understands why control was taken away.
    if (this.bounceBackTimer > 0) {
      const intensity = Math.min(this.bounceBackTimer / this.bounceBackDuration, 1) * 0.6;
      this.bodyMat.emissive.setRGB(intensity, 0, 0);
    } else {
      this.bodyMat.emissive.copy(this.bodyBaseEmissive);
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
