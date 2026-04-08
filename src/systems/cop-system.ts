import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Cop } from "../entities/cop";
import { Car } from "../entities/car";
import { spawnCop } from "./spawning";
import { getLevelDef, getHeat, HEAT_INTERVAL_SHAVE, HEAT_INTERVAL_FLOOR } from "./leveling";
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
import { damageDirAngle, damageDirSeq } from "../state";
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
  TIME_WARP_FACTOR,
  TANK_KILL_SCORE,
} from "../constants";

// Reused per-frame scratch — avoids allocating a fresh Vec3 inside the
// cop loop's hot collision branch. Safe because update() is single-threaded
// and never re-enters itself.
const _relVel = new CANNON.Vec3();

export type ICopUpdateResult = {
  nearestCopDist: number;
  nearbyCount: number; // cops within busted-check radius
};

// SWAT mini-boss tuning. Lives outside `constants.ts` because it's an
// emergent escalation feature, not a designer-tunable balance lever.
const SWAT_MIN_LEVEL = 5;
const SWAT_RESPAWN_DELAY = 25; // seconds between SWAT spawns
const SWAT_KILL_SCORE = 80;
const SWAT_KILL_HEAL = 25;

export class CopSystem {
  scene: THREE.Scene;
  world: CANNON.World;
  cops: Cop[] = [];
  lastSpawnTime = 0;
  // Last time a SWAT mini-boss was spawned. Tracked separately so SWAT
  // cadence is independent of the regular spawn timer.
  lastSwatSpawn = -SWAT_RESPAWN_DELAY;

  constructor(ctx: IGameContext) {
    this.scene = ctx.scene;
    this.world = ctx.world;
  }

  reset() {
    this.cops.forEach((c) => c.destroy());
    this.cops.length = 0;
    this.lastSwatSpawn = -SWAT_RESPAWN_DELAY;
  }

  rebaseTimers(timeInSeconds: number) {
    this.lastSpawnTime = timeInSeconds;
    this.lastSwatSpawn = timeInSeconds - SWAT_RESPAWN_DELAY;
  }

  /** EMP-style AOE — used by PickupSystem when an EMP is collected. */
  empBlast(car: Car, run: RunState): number {
    let kills = 0;
    const mult = run.activeScoreMult;
    for (let ci = this.cops.length - 1; ci >= 0; ci--) {
      const c = this.cops[ci];
      // SWAT mini-bosses shrug off EMP — they have to be drowned, rammed
      // (tank), or out-driven. Keeps them threatening even with pickups up.
      if (c.isSwat) continue;
      if (c.body.position.distanceTo(car.body.position) < EMP_KILL_RADIUS) {
        spawnConfetti(c.body.position.x, c.body.position.y + 2, c.body.position.z);
        const reward = SCORE_EMP_KILL * mult;
        run.score += reward;
        run.copScore += reward;
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
    // Endgame heat shaves the spawn interval past max level so survivor runs
    // keep escalating instead of plateauing at LV10's cadence.
    const heatTier = getHeat(run.score, run.level);
    const effectiveInterval = Math.max(
      HEAT_INTERVAL_FLOOR,
      levelDef.spawnInterval - heatTier * HEAT_INTERVAL_SHAVE,
    );
    if (timeInSeconds - this.lastSpawnTime > effectiveInterval) {
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

    // SWAT mini-boss spawn — at most one alive at a time, level 5+. Lives
    // outside the maxCops cap so the regular swarm cadence is unaffected.
    if (
      run.level >= SWAT_MIN_LEVEL &&
      timeInSeconds - this.lastSwatSpawn > SWAT_RESPAWN_DELAY &&
      !this.cops.some((c) => c.isSwat)
    ) {
      spawnCop({
        scene: this.scene,
        world: this.world,
        cops: this.cops,
        maxCops: levelDef.maxCops,
        level: Math.max(run.level, SWAT_MIN_LEVEL),
        playerPosition: car.mesh.position,
        playerVelocity: car.body.velocity,
        isSwat: true,
      });
      this.lastSwatSpawn = timeInSeconds;
      // Telegraph the spawn so the player knows a heavier threat is on the
      // map. Popup floats above the player rather than the SWAT cop itself
      // so it's always visible regardless of where the cop is.
      spawnPopup(car.body.position.x, car.body.position.y + 5, car.body.position.z, "⚠ SWAT", "#ff4444", 1.6, 12);
    }

    let nearbyCount = 0;
    let nearestCopDist = Infinity;
    const mult = run.activeScoreMult;
    const timeWarp = run.timeWarpTimer > 0;
    const ghost = run.ghostTimer > 0;
    const tank = run.tankTimer > 0;

    for (let i = this.cops.length - 1; i >= 0; i--) {
      const cop = this.cops[i];
      cop.update(dt, car.mesh.position, car.body.velocity);

      // Time warp: clamp cop velocity to half its normal cap so the player
      // can weave through a swarm at full speed for a few seconds.
      if (timeWarp) {
        const maxV = cop.maxSpeed * TIME_WARP_FACTOR;
        const v = cop.body.velocity.length();
        if (v > maxV) cop.body.velocity.scale(maxV / v, cop.body.velocity);
      }

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
        const comboReward = run.comboCount * COMBO_INSTANT_REWARD_PER_COUNT * mult;
        run.score += comboReward;
        run.comboScore += comboReward;
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
          if (ghost) {
            // Phase: pretend the contact never happened. No damage, no
            // shield consumed, no combo break.
            cop.damageCooldown = COP_DAMAGE_COOLDOWN;
          } else if (tank) {
            // Tank mode: ramming wrecks the cop. Score + heal + flash, no
            // damage to player. SWAT pays out at the SWAT bonus tier.
            const baseScore = cop.isSwat ? SWAT_KILL_SCORE : TANK_KILL_SCORE;
            const baseHeal = cop.isSwat ? SWAT_KILL_HEAL : HP_HEAL_EMP_KILL;
            const reward = baseScore * mult;
            run.score += reward;
            run.copScore += reward;
            run.hp = Math.min(MAX_HP, run.hp + baseHeal);
            run.drownedThisRun++;
            spawnSparks(cop.body.position.x, cop.body.position.y + 1, cop.body.position.z);
            spawnConfetti(cop.body.position.x, cop.body.position.y + 2, cop.body.position.z);
            if (cop.isSwat) {
              spawnConfetti(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z);
              triggerScreenFlash(0.45);
            }
            spawnPopup(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z, `+${Math.round(reward)}`, "#ff6666");
            playCrash();
            haptics.hit();
            triggerShake(cop.isSwat ? 0.7 : 0.5);
            cop.destroy();
            this.cops.splice(i, 1);
            continue;
          } else if (run.shieldActive) {
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
            // Damage direction indicator: angle from player → cop in world
            // XZ. The UI uses this to render a brief red arc on the matching
            // screen edge so the player learns to evade the right way.
            damageDirAngle.value = Math.atan2(
              cop.body.position.z - car.body.position.z,
              cop.body.position.x - car.body.position.x,
            );
            damageDirSeq.value++;
          }
        }
      }

      // Count cops close enough for busted check (skipped while ghosting —
      // intangible cops can't actually hold the player in place).
      if (!ghost && distToPlayer < BUSTED_NEARBY_RADIUS) nearbyCount++;

      // Cops die in water — bonus score + heal
      const tx = Math.floor(cop.body.position.x / TILE_SIZE);
      const tz = Math.floor(cop.body.position.z / TILE_SIZE);
      if (!isRoad(tx, tz) && isWater(tx, tz)) {
        // SWAT kills get a bonus payout + heal so the player feels rewarded
        // for cornering the mini-boss into water (or tanking it head-on).
        const baseScore = cop.isSwat ? SWAT_KILL_SCORE : SCORE_DROWNED_COP;
        const baseHeal = cop.isSwat ? SWAT_KILL_HEAL : HP_HEAL_DROWNED_COP;
        const reward = baseScore * mult;
        run.score += reward;
        run.copScore += reward;
        run.hp = Math.min(MAX_HP, run.hp + baseHeal);
        run.drownedThisRun++;
        playSplash();
        spawnSplash(cop.body.position.x, cop.body.position.y, cop.body.position.z);
        spawnConfetti(cop.body.position.x, cop.body.position.y + 2, cop.body.position.z);
        if (cop.isSwat) {
          // Extra debris + flash so the SWAT kill reads as a bigger event.
          spawnConfetti(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z);
          triggerScreenFlash(0.45);
          triggerShake(0.5);
        }
        spawnPopup(cop.body.position.x, cop.body.position.y + 3, cop.body.position.z, `+${Math.round(reward)}`, cop.isSwat ? "#ff4444" : "#ffcc22");
        cop.destroy();
        this.cops.splice(i, 1);
      }
    }

    return { nearestCopDist, nearbyCount };
  }
}
