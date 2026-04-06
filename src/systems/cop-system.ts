import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Cop } from "../entities/cop";
import { Car } from "../entities/car";
import { spawnCop } from "./spawning";
import { getLevelDef } from "./leveling";
import { isRoad, isWater, TILE_SIZE } from "../world/terrain";
import {
  triggerShake,
  triggerTimeSlow,
  triggerScreenFlash,
  spawnSparks,
  spawnSplash,
  spawnConfetti,
} from "../world/effects";
import { spawnPopup } from "../world/popups";
import { playCrash, playSplash, playPickup } from "../audio/sound";
import { COMBO_DECAY, type RunState, type IGameContext } from "./run-state";

export type ICopUpdateResult = {
  nearestCopDist: number;
  nearbyCount: number; // cops within busted-check radius
};

export class CopSystem {
  scene: THREE.Scene;
  world: CANNON.World;
  cops: Cop[] = [];
  lastSpawnTime = 0;

  constructor(ctx: IGameContext) {
    this.scene = ctx.scene;
    this.world = ctx.world;
  }

  reset() {
    this.cops.forEach((c) => c.destroy());
    this.cops.length = 0;
  }

  rebaseTimers(timeInSeconds: number) {
    this.lastSpawnTime = timeInSeconds;
  }

  /** EMP-style AOE — used by PickupSystem when an EMP is collected. */
  empBlast(car: Car, run: RunState): number {
    let kills = 0;
    for (let ci = this.cops.length - 1; ci >= 0; ci--) {
      const c = this.cops[ci];
      if (c.body.position.distanceTo(car.body.position) < 30) {
        spawnConfetti(c.body.position.x, c.body.position.y + 2, c.body.position.z);
        run.score += 30;
        run.hp = Math.min(100, run.hp + 10);
        run.drownedThisRun++;
        kills++;
        c.destroy();
        this.cops.splice(ci, 1);
      }
    }
    return kills;
  }

  update(dt: number, timeInSeconds: number, car: Car, run: RunState): ICopUpdateResult {
    // Spawning is level-dependent
    const levelDef = getLevelDef(run.level);
    if (timeInSeconds - this.lastSpawnTime > levelDef.spawnInterval) {
      spawnCop({
        scene: this.scene,
        world: this.world,
        cops: this.cops,
        maxCops: levelDef.maxCops,
        level: run.level,
        playerPosition: car.mesh.position,
        playerVelocity: car.body.velocity,
      });
      this.lastSpawnTime = timeInSeconds;
    }

    let nearbyCount = 0;
    let nearestCopDist = Infinity;

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      cop.update(dt, car.mesh.position, car.body.velocity);

      const distToPlayer = cop.body.position.distanceTo(car.body.position);
      if (distToPlayer < nearestCopDist) nearestCopDist = distToPlayer;

      // Despawn cops that are too far
      if (distToPlayer > 100) {
        cop.destroy();
        this.cops.splice(i, 1);
        continue;
      }

      // --- Combo: arm at distance, count near-miss when re-entering range ---
      if (distToPlayer > 18) {
        cop.nearMissArmed = true;
      } else if (distToPlayer < 12 && distToPlayer >= 6 && cop.nearMissArmed) {
        cop.nearMissArmed = false;
        run.comboCount += 1;
        run.comboTimer = COMBO_DECAY;
        if (run.comboCount > run.biggestCombo) run.biggestCombo = run.comboCount;
        // Tiny instant reward so the combo feels alive
        run.score += run.comboCount * 2;
        if (run.comboCount % 5 === 0) {
          spawnPopup(
            car.body.position.x,
            car.body.position.y + 3,
            car.body.position.z,
            `x${run.comboCount}`,
            "#ff66cc",
          );
        }
        // Big-combo juice: time slow + flash + extra shake every 10
        if (run.comboCount > 0 && run.comboCount % 10 === 0) {
          triggerTimeSlow();
          triggerScreenFlash(0.55);
          triggerShake(0.5);
        }
      }

      // --- Collision damage ---
      if (distToPlayer < 5 && cop.damageCooldown <= 0) {
        const relVel = new CANNON.Vec3();
        car.body.velocity.vsub(cop.body.velocity, relVel);
        const impactSpeed = relVel.length();

        if (impactSpeed > 3) {
          if (run.shieldActive) {
            run.shieldActive = false;
            spawnConfetti(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            playPickup();
            cop.damageCooldown = 1.0;
          } else {
            const massRatio = cop.config.mass / 100;
            const damage = 2 + massRatio * impactSpeed * 0.3;
            run.hp -= damage;
            cop.damageCooldown = 1.0;
            playCrash();
            triggerShake(0.4 + Math.min(impactSpeed / 30, 0.6));
            spawnSparks(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            run.hitPauseTimer = 0.05;
            // Combo reset on a real hit
            run.comboCount = 0;
            run.comboTimer = 0;
          }
        }
      }

      // Count cops close enough for busted check
      if (distToPlayer < 8) nearbyCount++;

      // Cops die in water — bonus score + heal
      const tx = Math.floor(cop.body.position.x / TILE_SIZE);
      const tz = Math.floor(cop.body.position.z / TILE_SIZE);
      if (!isRoad(tx, tz) && isWater(tx, tz)) {
        run.score += 30;
        run.hp = Math.min(100, run.hp + 10);
        run.drownedThisRun++;
        playSplash();
        spawnSplash(cop.body.position.x, cop.body.position.y, cop.body.position.z);
        spawnConfetti(cop.body.position.x, cop.body.position.y + 2, cop.body.position.z);
        spawnPopup(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z, "+30", "#ffcc22");
        cop.destroy();
        this.cops.splice(i, 1);
      }
    }

    return { nearestCopDist, nearbyCount };
  }
}
