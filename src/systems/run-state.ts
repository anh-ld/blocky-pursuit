import type * as THREE from "three";
import type * as CANNON from "cannon-es";
import type { Car } from "../entities/car";
import { isRoad, TILE_SIZE } from "../world/terrain";
import { LEVEL_DEFS } from "./leveling";
import { MAX_HP, SCORE_BASE_TILE, COMBO_MULT_PER_COUNT, COMBO_MULT_MAX } from "../constants";

// Bootstrap context shared by every system constructor. Held for the
// lifetime of the app — these references never change after init.
export type IGameContext = {
  scene: THREE.Scene;
  world: CANNON.World;
};
import {
  hp,
  score,
  level,
  survivalTime,
  nitroRemaining,
  shieldUp,
  combo,
  comboTimerRatio,
  comboMultiplier,
} from "../state";

export const COMBO_DECAY = 3.0;

// Mutable per-run state. One instance lives on the orchestrator and is
// reset on each startGame(). Systems read/write its fields directly.
export class RunState {
  // Status
  hp = MAX_HP;
  score = 0;
  level = 1;
  survivalTime = 0;

  // Buffs
  nitroTimer = 0;
  shieldActive = false;

  // Score/road tracking
  lastScoreTileX = -9999;
  lastScoreTileZ = -9999;

  // Heal streaks
  speedStreakTimer = 0;

  // Hit pause / busted
  hitPauseTimer = 0;
  bustedTimer = 0;

  // Combo
  comboCount = 0;
  comboTimer = 0;

  // Run summary
  drownedThisRun = 0;
  biggestCombo = 0;
  topSpeed = 0;
  distance = 0;
  lastCarX = 0;
  lastCarZ = 0;
  // Score breakdown — accumulated alongside `score` so game-over can show
  // tile vs combo vs cop contributions.
  tileScore = 0;
  comboScore = 0;
  copScore = 0;

  /**
   * Advance current level if score crosses the next threshold.
   * Returns the previous level so the caller can detect a level-up
   * and play its own popup/audio cue.
   */
  advanceLevel(): number {
    const prev = this.level;
    for (let lv = LEVEL_DEFS.length; lv >= 1; lv--) {
      if (this.score >= LEVEL_DEFS[lv - 1].scoreThreshold) {
        if (lv > this.level) this.level = lv;
        break;
      }
    }
    return prev;
  }

  /** Award road-tile score with speed + combo multipliers. No-op if same tile. */
  scoreRoadTile(car: Car) {
    const tx = Math.floor(car.body.position.x / TILE_SIZE);
    const tz = Math.floor(car.body.position.z / TILE_SIZE);
    if (tx === this.lastScoreTileX && tz === this.lastScoreTileZ) return;
    if (isRoad(tx, tz)) {
      const speedRatio = Math.min(car.body.velocity.length() / car.maxSpeed, 1);
      const speedMult = 1 + speedRatio;
      const comboMult = Math.min(1 + this.comboCount * COMBO_MULT_PER_COUNT, COMBO_MULT_MAX);
      const earned = SCORE_BASE_TILE * speedMult * comboMult;
      this.score += earned;
      this.tileScore += earned;
    }
    this.lastScoreTileX = tx;
    this.lastScoreTileZ = tz;
  }

  /** Decay the combo timer; reset combo to 0 when it expires. */
  decayCombo(dt: number) {
    if (this.comboTimer <= 0) return;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) this.comboCount = 0;
  }

  /** Track top speed and total distance traveled this run. */
  recordMovement(car: Car) {
    const v = car.body.velocity.length();
    if (v > this.topSpeed) this.topSpeed = v;
    const dx = car.body.position.x - this.lastCarX;
    const dz = car.body.position.z - this.lastCarZ;
    this.distance += Math.sqrt(dx * dx + dz * dz);
    this.lastCarX = car.body.position.x;
    this.lastCarZ = car.body.position.z;
  }

  reset(car: Car) {
    this.hp = MAX_HP;
    this.score = 0;
    this.level = 1;
    this.survivalTime = 0;
    this.nitroTimer = 0;
    this.shieldActive = false;
    this.lastScoreTileX = -9999;
    this.lastScoreTileZ = -9999;
    this.speedStreakTimer = 0;
    this.hitPauseTimer = 0;
    this.bustedTimer = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.drownedThisRun = 0;
    this.biggestCombo = 0;
    this.topSpeed = 0;
    this.distance = 0;
    this.lastCarX = car.body.position.x;
    this.lastCarZ = car.body.position.z;
    this.tileScore = 0;
    this.comboScore = 0;
    this.copScore = 0;
  }

  /** Push hot-loop values into the Preact signals so the UI updates. */
  syncHud() {
    hp.value = Math.max(0, this.hp);
    score.value = this.score;
    level.value = this.level;
    survivalTime.value = this.survivalTime;
    nitroRemaining.value = this.nitroTimer;
    shieldUp.value = this.shieldActive;
    combo.value = this.comboCount;
    comboTimerRatio.value = Math.max(0, this.comboTimer / COMBO_DECAY);
    comboMultiplier.value = Math.min(1 + this.comboCount * COMBO_MULT_PER_COUNT, COMBO_MULT_MAX);
  }
}
