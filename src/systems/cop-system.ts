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
import { playCrash, playSplash, playPickup, playComboTier } from "../audio/sound";
import { haptics } from "../audio/haptics";
import { COMBO_DECAY, type RunState, type IGameContext } from "./run-state";
import { shouldShowComboTip, markComboTipSeen } from "./tutorial";
import {
  MAX_HP,
  HP_HEAL_DROWNED_COP,
  HP_HEAL_EMP_KILL,
  COP_DESPAWN_DIST,
  COP_COLLISION_RADIUS,
  COP_DAMAGE_COOLDOWN,
  COP_MIN_IMPACT_SPEED,
  COP_HIT_PAUSE,
  BUSTED_NEARBY_RADIUS,
  COMBO_ARM_DIST,
  COMBO_ENTER_DIST,
  COMBO_MIN_DIST,
  COMBO_MILESTONE,
  COMBO_BIG_MILESTONE,
  COMBO_INSTANT_REWARD_PER_COUNT,
  SCORE_DROWNED_COP,
  SCORE_EMP_KILL,
  EMP_KILL_RADIUS,
} from "../constants";

// Reused per-frame scratch — avoids allocating a fresh Vec3 inside the
// cop loop's hot collision branch. Safe because update() is single-threaded
// and never re-enters itself.
const _relVel = new CANNON.Vec3();

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
      if (c.body.position.distanceTo(car.body.position) < EMP_KILL_RADIUS) {
        spawnConfetti(c.body.position.x, c.body.position.y + 2, c.body.position.z);
        run.score += SCORE_EMP_KILL;
        run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_EMP_KILL);
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
      if (distToPlayer > COP_DESPAWN_DIST) {
        cop.destroy();
        this.cops.splice(i, 1);
        continue;
      }

      // --- Combo: arm at distance, count near-miss when re-entering range ---
      if (distToPlayer > COMBO_ARM_DIST) {
        cop.nearMissArmed = true;
      } else if (distToPlayer < COMBO_ENTER_DIST && distToPlayer >= COMBO_MIN_DIST && cop.nearMissArmed) {
        cop.nearMissArmed = false;
        run.comboCount += 1;
        run.comboTimer = COMBO_DECAY;
        if (run.comboCount > run.biggestCombo) run.biggestCombo = run.comboCount;
        // Tiny instant reward so the combo feels alive
        run.score += run.comboCount * COMBO_INSTANT_REWARD_PER_COUNT;
        // First-ever combo: explain the mechanic so new players discover the
        // game's main score lever instead of stumbling into it by accident.
        if (run.comboCount === 1 && shouldShowComboTip()) {
          markComboTipSeen();
          spawnPopup(
            car.body.position.x,
            car.body.position.y + 4,
            car.body.position.z,
            "COMBO!",
            "#ff66cc",
            2.4,
            10,
          );
          spawnPopup(
            car.body.position.x,
            car.body.position.y + 2.5,
            car.body.position.z,
            "Skim past cops — don't touch!",
            "#ffffff",
            2.4,
            14,
          );
        }
        if (run.comboCount % COMBO_MILESTONE === 0) {
          spawnPopup(
            car.body.position.x,
            car.body.position.y + 3,
            car.body.position.z,
            `x${run.comboCount}`,
            "#ff66cc",
          );
          // Combo ladder: rising pitch every milestone so the player hears
          // their multiplier climb in addition to seeing it.
          playComboTier(run.comboCount / COMBO_MILESTONE);
          haptics.comboMilestone();
        }
        // Big-combo juice: time slow + flash + extra shake at the big milestone
        if (run.comboCount > 0 && run.comboCount % COMBO_BIG_MILESTONE === 0) {
          triggerTimeSlow();
          triggerScreenFlash(0.55);
          triggerShake(0.5);
        }
      }

      // --- Collision damage ---
      if (distToPlayer < COP_COLLISION_RADIUS && cop.damageCooldown <= 0) {
        car.body.velocity.vsub(cop.body.velocity, _relVel);
        const impactSpeed = _relVel.length();

        if (impactSpeed > COP_MIN_IMPACT_SPEED) {
          if (run.shieldActive) {
            run.shieldActive = false;
            spawnConfetti(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            playPickup();
            cop.damageCooldown = COP_DAMAGE_COOLDOWN;
          } else {
            const massRatio = cop.config.mass / 100;
            const damage = (2 + massRatio * impactSpeed * 0.3) * car.damageMul;
            run.hp -= damage;
            cop.damageCooldown = COP_DAMAGE_COOLDOWN;
            playCrash();
            haptics.hit();
            triggerShake(0.4 + Math.min(impactSpeed / 30, 0.6));
            spawnSparks(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            run.hitPauseTimer = COP_HIT_PAUSE;
            // Combo reset on a real hit
            run.comboCount = 0;
            run.comboTimer = 0;
          }
        }
      }

      // Count cops close enough for busted check
      if (distToPlayer < BUSTED_NEARBY_RADIUS) nearbyCount++;

      // Cops die in water — bonus score + heal
      const tx = Math.floor(cop.body.position.x / TILE_SIZE);
      const tz = Math.floor(cop.body.position.z / TILE_SIZE);
      if (!isRoad(tx, tz) && isWater(tx, tz)) {
        run.score += SCORE_DROWNED_COP;
        run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_DROWNED_COP);
        run.drownedThisRun++;
        playSplash();
        spawnSplash(cop.body.position.x, cop.body.position.y, cop.body.position.z);
        spawnConfetti(cop.body.position.x, cop.body.position.y + 2, cop.body.position.z);
        spawnPopup(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z, `+${SCORE_DROWNED_COP}`, "#ffcc22");
        cop.destroy();
        this.cops.splice(i, 1);
      }
    }

    return { nearestCopDist, nearbyCount };
  }
}
