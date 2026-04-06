import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Civilian } from "../entities/civilian";
import { Car } from "../entities/car";
import { spawnCivilian } from "./spawning";
import { isRoad, isWater, TILE_SIZE } from "../world/terrain";
import { spawnPopup } from "../world/popups";
import type { RunState, IGameContext } from "./run-state";

const _fleeForce = new CANNON.Vec3();

const MAX_CIVILIANS = 8;
const CIVILIAN_SPAWN_INTERVAL = 2;
const STUN_IMPACT_THRESHOLD = 6;
// Flee tuning: when the player blasts past at speed, civilians get a
// shove away so the city feels reactive instead of inert.
const FLEE_RADIUS = 8;
const FLEE_MIN_PLAYER_SPEED = 20;
const FLEE_FORCE = 1200;

export class CivilianSystem {
  scene: THREE.Scene;
  world: CANNON.World;
  civilians: Civilian[] = [];
  lastSpawnTime = 0;

  constructor(ctx: IGameContext) {
    this.scene = ctx.scene;
    this.world = ctx.world;
  }

  reset() {
    this.civilians.forEach((c) => c.destroy());
    this.civilians.length = 0;
  }

  rebaseTimers(timeInSeconds: number) {
    this.lastSpawnTime = timeInSeconds;
  }

  update(dt: number, timeInSeconds: number, car: Car, run: RunState) {
    if (timeInSeconds - this.lastSpawnTime > CIVILIAN_SPAWN_INTERVAL) {
      spawnCivilian({
        scene: this.scene,
        world: this.world,
        civilians: this.civilians,
        maxCivilians: MAX_CIVILIANS,
        playerPosition: car.mesh.position,
      });
      this.lastSpawnTime = timeInSeconds;
    }

    for (let i = this.civilians.length - 1; i >= 0; i--) {
      const civ = this.civilians[i];
      civ.update(dt);

      const distToPlayer = civ.body.position.distanceTo(car.body.position);

      // Despawn far civilians
      if (distToPlayer > 80) {
        civ.destroy();
        this.civilians.splice(i, 1);
        continue;
      }

      // Flee: when the player roars past at speed, push civilians away so
      // the city visibly reacts. Cheap distance check + a single applyForce
      // — civilians clear the road around the player without needing AI.
      const playerSpeed = car.body.velocity.length();
      if (
        distToPlayer < FLEE_RADIUS &&
        playerSpeed > FLEE_MIN_PLAYER_SPEED &&
        civ.stunTimer <= 0
      ) {
        const dx = civ.body.position.x - car.body.position.x;
        const dz = civ.body.position.z - car.body.position.z;
        const inv = 1 / Math.max(0.001, distToPlayer);
        _fleeForce.set(dx * inv * FLEE_FORCE, 0, dz * inv * FLEE_FORCE);
        civ.body.applyForce(_fleeForce, civ.body.position);
        if (!civ.hasPanicked) {
          civ.hasPanicked = true;
          spawnPopup(
            civ.body.position.x,
            civ.body.position.y + 2,
            civ.body.position.z,
            "!!",
            "#ffeb3b",
          );
        }
      }

      // Stun on collision with player — require actual impact velocity,
      // not just proximity, so brushing past at low speed doesn't stun.
      if (distToPlayer < 5 && civ.stunTimer <= 0) {
        const relVel = new CANNON.Vec3();
        car.body.velocity.vsub(civ.body.velocity, relVel);
        if (relVel.length() > STUN_IMPACT_THRESHOLD) {
          civ.stun();
          run.score += 5;
          spawnPopup(civ.body.position.x, civ.body.position.y + 2, civ.body.position.z, "+5", "#ffcc22");
        }
      }

      // Civilians die in water — silent removal
      const tx = Math.floor(civ.body.position.x / TILE_SIZE);
      const tz = Math.floor(civ.body.position.z / TILE_SIZE);
      if (!isRoad(tx, tz) && isWater(tx, tz)) {
        civ.destroy();
        this.civilians.splice(i, 1);
      }
    }
  }
}
