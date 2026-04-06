import type { Car } from "../entities/car";
import {
  hp,
  score,
  level,
  survivalTime,
  nitroRemaining,
  shieldUp,
  combo,
} from "../state";

// Mutable per-run state. One instance lives on the orchestrator and is
// reset on each startGame(). Systems read/write its fields directly.
export class RunState {
  // Status
  hp = 100;
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

  reset(car: Car) {
    this.hp = 100;
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
  }
}
