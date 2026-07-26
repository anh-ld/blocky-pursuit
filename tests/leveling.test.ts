/* The difficulty curve — a bad clamp here either stalls the ramp or spikes it off a cliff. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEVEL_DEFS,
  getLevelDef,
  getHeat,
  getLevelProgress,
  HEAT_INTERVAL_SHAVE,
  HEAT_INTERVAL_FLOOR,
} from "../src/systems/leveling.ts";

const MAX_LEVEL = LEVEL_DEFS.length;
const TOP_SCORE = LEVEL_DEFS[MAX_LEVEL - 1].scoreThreshold;

test("the curve only ever gets harder", () => {
  for (let i = 1; i < MAX_LEVEL; i++) {
    const prev = LEVEL_DEFS[i - 1];
    const cur = LEVEL_DEFS[i];
    assert.ok(cur.scoreThreshold > prev.scoreThreshold, `threshold stalled at level ${i + 1}`);
    assert.ok(cur.maxCops >= prev.maxCops, `cop cap dropped at level ${i + 1}`);
    assert.ok(cur.spawnInterval <= prev.spawnInterval, `spawns slowed at level ${i + 1}`);
  }
});

test("level 1 starts at zero score so a fresh run has a definition", () => {
  assert.equal(LEVEL_DEFS[0].scoreThreshold, 0);
});

test("getLevelDef clamps instead of returning undefined", () => {
  assert.equal(getLevelDef(1), LEVEL_DEFS[0]);
  assert.equal(getLevelDef(MAX_LEVEL), LEVEL_DEFS[MAX_LEVEL - 1]);
  /* Levels below 1 and past the table both hold at an end of the curve. */
  assert.equal(getLevelDef(0), LEVEL_DEFS[0]);
  assert.equal(getLevelDef(-5), LEVEL_DEFS[0]);
  assert.equal(getLevelDef(MAX_LEVEL + 40), LEVEL_DEFS[MAX_LEVEL - 1]);
});

test("SWAT stays locked until the endgame, then stays unlocked", () => {
  const unlockAt = LEVEL_DEFS.findIndex((d) => d.swatEnabled);
  assert.ok(unlockAt > 0, "SWAT must not be available at level 1");
  for (let i = unlockAt; i < MAX_LEVEL; i++) assert.ok(LEVEL_DEFS[i].swatEnabled, `SWAT re-locked at level ${i + 1}`);
});

test("heat stays at zero before the level cap", () => {
  assert.equal(getHeat(0, 1), 0);
  assert.equal(getHeat(999999, MAX_LEVEL - 1), 0, "heat leaked in before the cap");
  assert.equal(getHeat(TOP_SCORE, MAX_LEVEL), 0, "heat started on the threshold itself");
});

test("heat rises a tier at a time past the cap", () => {
  assert.equal(getHeat(TOP_SCORE + 1, MAX_LEVEL), 1);
  assert.equal(getHeat(TOP_SCORE + 1500, MAX_LEVEL), 2);
  assert.equal(getHeat(TOP_SCORE + 3000, MAX_LEVEL), 3);
  /* Monotonic — the HUD chip must never count down. */
  let prev = 0;
  for (let s = TOP_SCORE; s < TOP_SCORE + 20000; s += 250) {
    const h = getHeat(s, MAX_LEVEL);
    assert.ok(h >= prev, `heat dropped at score ${s}`);
    prev = h;
  }
});

test("the heat shave can never drive the spawn interval to zero", () => {
  const base = LEVEL_DEFS[MAX_LEVEL - 1].spawnInterval;
  const shaved = Math.max(HEAT_INTERVAL_FLOOR, base - getHeat(TOP_SCORE + 1e6, MAX_LEVEL) * HEAT_INTERVAL_SHAVE);
  assert.equal(shaved, HEAT_INTERVAL_FLOOR);
  assert.ok(HEAT_INTERVAL_FLOOR > 0);
});

test("level progress runs 0 to 1 across a level", () => {
  assert.equal(getLevelProgress(LEVEL_DEFS[0].scoreThreshold, 1), 0);
  assert.equal(getLevelProgress(LEVEL_DEFS[1].scoreThreshold, 1), 1);
  assert.equal(getLevelProgress(50, 1), 0.5);
});

test("level progress is clamped and fills at max level", () => {
  /* Score can sit past the next threshold for a frame before advanceLevel runs. */
  assert.equal(getLevelProgress(99999, 1), 1);
  assert.equal(getLevelProgress(-500, 1), 0);
  assert.equal(getLevelProgress(0, MAX_LEVEL), 1, "the bar must not tease at max level");
  assert.equal(getLevelProgress(0, MAX_LEVEL + 3), 1);
});
