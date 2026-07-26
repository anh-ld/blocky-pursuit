/* Cop tiers are the difficulty curve — a slower-than-player cop or a skipped capability throws nothing. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Cop, type ICopLevelConfig } from "../src/entities/cop.ts";

/* Player car tops out at 40 with mass 100 — every cop is tuned relative to that. */
const PLAYER_SPEED = 40;
const PLAYER_MASS = 100;
const TIERS = [1, 2, 3, 4, 5, 6];

const scene = new THREE.Scene();
const world = new CANNON.World();
const configFor = (level: number): ICopLevelConfig =>
  new Cop(scene, world, new THREE.Vector3(0, 1, 0), level).config;

test("every tier resolves to a config", () => {
  for (const t of TIERS) assert.ok(configFor(t), `tier ${t} is missing`);
});

test("out-of-range levels clamp to the ends of the table", () => {
  assert.deepEqual(configFor(0), configFor(1));
  assert.deepEqual(configFor(-3), configFor(1));
  assert.deepEqual(configFor(99), configFor(6), "a high level fell off the table");
});

test("every cop can out-run the player, and its ram burst is faster still", () => {
  for (const t of TIERS) {
    const c = configFor(t);
    assert.ok(c.speed > PLAYER_SPEED, `tier ${t} can never catch the player: ${c.speed}`);
    assert.ok(c.ramSpeed > c.speed, `tier ${t} ram burst is not a burst`);
  }
});

test("no cop is so fast the player cannot break away", () => {
  for (const t of TIERS) {
    assert.ok(configFor(t).speed < PLAYER_SPEED * 2, `tier ${t} is unescapable`);
  }
});

test("the tier curve only escalates", () => {
  for (let i = 1; i < TIERS.length; i++) {
    const prev = configFor(TIERS[i - 1]);
    const cur = configFor(TIERS[i]);
    for (const k of ["mass", "speed", "ramSpeed", "turnSpeed", "forwardForce", "predictAhead"] as const) {
      assert.ok(cur[k] >= prev[k], `${k} regressed at tier ${TIERS[i]}: ${prev[k]} -> ${cur[k]}`);
    }
  }
});

test("capabilities unlock once and stay unlocked", () => {
  for (const k of ["flank", "canPit", "avoidWater"] as const) {
    const unlocked = TIERS.map((t) => configFor(t)[k]);
    assert.ok(!unlocked[0], `tier 1 already has ${k} — nothing is left to escalate`);
    assert.ok(unlocked.at(-1), `${k} never unlocks at any tier`);
    const firstOn = unlocked.indexOf(true);
    assert.ok(unlocked.slice(firstOn).every(Boolean), `${k} was re-locked after tier ${TIERS[firstOn]}`);
  }
});

test("heavier cops push harder, so a ram still moves them", () => {
  for (const t of TIERS) {
    const c = configFor(t);
    assert.ok(c.mass >= PLAYER_MASS, `tier ${t} is lighter than the player`);
    /* Force must scale with mass or the heavy tiers accelerate worse than the light ones. */
    assert.ok(c.forwardForce / c.mass > 1000, `tier ${t} is too heavy for its engine`);
  }
});

test("a cop clamps its own level, so an over-leveled spawn is still a real cop", () => {
  const overLeveled = new Cop(scene, world, new THREE.Vector3(0, 1, 0), 50);
  assert.equal(overLeveled.level, 6);
  assert.ok(overLeveled.config.speed > PLAYER_SPEED);
});

test("the SWAT and bounty flags default off and are carried through", () => {
  const plain = new Cop(scene, world, new THREE.Vector3(0, 1, 0), 3);
  assert.equal(plain.isSwat, false);
  assert.equal(plain.isBounty, false);
  const swat = new Cop(scene, world, new THREE.Vector3(0, 1, 0), 3, true, true);
  assert.equal(swat.isSwat, true);
  assert.equal(swat.isBounty, true);
});
