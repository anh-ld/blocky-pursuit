/* Per-run scoring and timers. Everything here is read by the HUD every frame, so drift is silent. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { RunState } from "../src/systems/run-state.ts";
import type { Car } from "../src/entities/car.ts";
import { TILE_SIZE } from "../src/world/terrain.ts";
import { MAX_HP, SCORE_BASE_TILE, COMBO_MULT_PER_COUNT, COMBO_MULT_MAX } from "../src/constants.ts";

const MAX_SPEED = 40;

/* Minimal stand-in for the physics car — RunState only reads position, velocity and maxSpeed. */
function fakeCar(x = 0, z = 0, speed = MAX_SPEED) {
  return {
    maxSpeed: MAX_SPEED,
    body: {
      position: { x, y: 1, z },
      velocity: { length: () => speed },
    },
  } as unknown as Car;
}

/* z tile 0 is always road (the origin axis), so scoring is deterministic along it. */
const onRoad = (tileX: number, speed = MAX_SPEED) => fakeCar(tileX * TILE_SIZE + TILE_SIZE / 2, 0, speed);

test("a road tile scores once, not once per frame", () => {
  const run = new RunState();
  run.scoreRoadTile(onRoad(1));
  const first = run.score;
  assert.ok(first > 0);
  run.scoreRoadTile(onRoad(1));
  assert.equal(run.score, first, "the same tile paid out twice");
  run.scoreRoadTile(onRoad(2));
  assert.ok(run.score > first, "a new tile paid nothing");
});

test("tile score scales with speed", () => {
  const fast = new RunState();
  fast.scoreRoadTile(onRoad(1, MAX_SPEED));
  const slow = new RunState();
  slow.scoreRoadTile(onRoad(1, 0));
  /* Speed multiplier runs 1x at rest to 2x at top speed. */
  assert.equal(slow.score, SCORE_BASE_TILE);
  assert.equal(fast.score, SCORE_BASE_TILE * 2);
});

test("the combo multiplier is capped", () => {
  const run = new RunState();
  run.comboCount = 1000;
  run.scoreRoadTile(onRoad(1, 0));
  assert.equal(run.score, SCORE_BASE_TILE * COMBO_MULT_MAX);

  const modest = new RunState();
  modest.comboCount = 3;
  modest.scoreRoadTile(onRoad(1, 0));
  assert.equal(modest.score, SCORE_BASE_TILE * (1 + 3 * COMBO_MULT_PER_COUNT));
});

test("tile score is mirrored into the breakdown shown at game over", () => {
  const run = new RunState();
  run.scoreRoadTile(onRoad(1));
  run.scoreRoadTile(onRoad(2));
  assert.equal(run.tileScore, run.score, "the breakdown drifted from the total");
});

test("the double-score buff applies only while its timer runs", () => {
  const run = new RunState();
  assert.equal(run.activeScoreMult, 1);
  run.scoreMultTimer = 5;
  assert.ok(run.activeScoreMult > 1);
  const buffed = new RunState();
  buffed.scoreMultTimer = 5;
  buffed.scoreRoadTile(onRoad(1, 0));
  assert.equal(buffed.score, SCORE_BASE_TILE * buffed.activeScoreMult);
});

test("the combo resets only when its timer runs out", () => {
  const run = new RunState();
  run.comboCount = 7;
  run.comboTimer = 1;
  run.decayCombo(0.5);
  assert.equal(run.comboCount, 7, "the combo died early");
  run.decayCombo(0.6);
  assert.equal(run.comboCount, 0);
  /* An expired timer must not keep ticking negative. */
  run.comboCount = 4;
  run.decayCombo(1);
  assert.equal(run.comboCount, 4, "decay ran with no combo active");
});

test("drown chains extend on each drown and reset when the window lapses", () => {
  const run = new RunState();
  assert.equal(run.recordDrown(), 1);
  assert.equal(run.recordDrown(), 2);
  run.decayDrownChain(2);
  assert.equal(run.drownChainCount, 2, "the chain broke inside its window");
  run.decayDrownChain(3);
  assert.equal(run.drownChainCount, 0);
});

test("crossing a threshold levels up once and heals", () => {
  const run = new RunState();
  run.hp = 50;
  run.score = 100; /* level 2 threshold */
  const ev = run.advanceLevel({ x: 0, y: 0, z: 0 });
  assert.ok(ev);
  assert.equal(ev.kind, "playerLeveledUp");
  assert.equal(run.level, 2);
  assert.equal(run.hp, 50 + ev.hpHeal);
  /* No second payout without more score. */
  assert.equal(run.advanceLevel({ x: 0, y: 0, z: 0 }), null);
});

test("a level-up heal never overshoots max HP", () => {
  const run = new RunState();
  run.hp = MAX_HP;
  run.score = 100;
  run.advanceLevel({ x: 0, y: 0, z: 0 });
  assert.equal(run.hp, MAX_HP);
});

test("a big score jump skips straight to the right level", () => {
  const run = new RunState();
  run.score = 3000;
  run.advanceLevel({ x: 0, y: 0, z: 0 });
  assert.equal(run.level, 8);
});

test("the level never goes backwards when score is spent or drops", () => {
  const run = new RunState();
  run.score = 1000;
  run.advanceLevel({ x: 0, y: 0, z: 0 });
  const reached = run.level;
  run.score = 0;
  assert.equal(run.advanceLevel({ x: 0, y: 0, z: 0 }), null);
  assert.equal(run.level, reached);
});

test("movement tracks distance and the top speed of the run", () => {
  const run = new RunState();
  run.reset(fakeCar(0, 0));
  run.recordMovement(fakeCar(3, 4, 20));
  assert.equal(run.distance, 5);
  assert.equal(run.topSpeed, 20);
  run.recordMovement(fakeCar(3, 8, 10));
  assert.equal(run.distance, 9);
  assert.equal(run.topSpeed, 20, "top speed followed the current speed down");
});

test("reset clears the run and rebases tile scoring to the new car", () => {
  const run = new RunState();
  run.score = 5000;
  run.level = 9;
  run.hp = 5;
  run.comboCount = 12;
  run.biggestCombo = 12;
  run.drownedThisRun = 3;
  run.shieldActive = true;
  run.nextMilestoneIdx = 4;
  run.scoreRoadTile(onRoad(1));

  run.reset(fakeCar(70, 0));

  assert.equal(run.score, 0);
  assert.equal(run.level, 1);
  assert.equal(run.hp, MAX_HP);
  assert.equal(run.comboCount, 0);
  assert.equal(run.biggestCombo, 0);
  assert.equal(run.drownedThisRun, 0);
  assert.equal(run.shieldActive, false);
  assert.equal(run.nextMilestoneIdx, 0);
  assert.equal(run.tileScore, 0);
  assert.equal(run.distance, 0);
  /* Distance must not count the teleport back to spawn. */
  run.recordMovement(fakeCar(70, 0));
  assert.equal(run.distance, 0);
  /* The tile the car respawned on is still scorable. */
  run.scoreRoadTile(onRoad(7));
  assert.ok(run.score > 0, "the first tile after a reset paid nothing");
});
