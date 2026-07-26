/* EMP payout. Real Cop bodies, headless scene — only the blast is exercised, not the render loop. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CopSystem } from "../src/systems/cop-system.ts";
import { Cop } from "../src/entities/cop.ts";
import { RunState } from "../src/systems/run-state.ts";
import { FrameEventBuffer } from "../src/systems/frame-events.ts";
import type { Car } from "../src/entities/car.ts";
import { EMP_KILL_RADIUS, SCORE_EMP_KILL, HP_HEAL_EMP_KILL, MAX_HP, SCORE_MULT_VALUE } from "../src/constants.ts";

/** empBlast only reads the car's body position. */
const fakeCar = () => ({ body: { position: new CANNON.Vec3(0, 1, 0) } }) as unknown as Car;

function system() {
  const scene = new THREE.Scene();
  const world = new CANNON.World();
  const cops = new CopSystem({ scene, world });
  const add = (z: number, opts: { swat?: boolean; bounty?: boolean } = {}) => {
    const cop = new Cop(scene, world, new THREE.Vector3(0, 1, z), 1, opts.swat, opts.bounty);
    cop.body.position.set(0, 1, z);
    cops.cops.push(cop);
    return cop;
  };
  return { cops, add };
}

test("the blast kills everything inside its radius and nothing outside", () => {
  const { cops, add } = system();
  add(EMP_KILL_RADIUS - 1);
  add(-(EMP_KILL_RADIUS - 1));
  const survivor = add(EMP_KILL_RADIUS + 5);

  const kills = cops.empBlast(fakeCar(), new RunState(), new FrameEventBuffer());

  assert.equal(kills, 2);
  assert.deepEqual(cops.cops, [survivor], "the blast reached past its radius or left a corpse in the list");
});

test("a blast with nobody in range is a no-op", () => {
  const { cops, add } = system();
  add(EMP_KILL_RADIUS + 20);
  const run = new RunState();
  run.hp = 40;
  const events = new FrameEventBuffer();

  assert.equal(cops.empBlast(fakeCar(), run, events), 0);
  assert.equal(run.score, 0);
  assert.equal(run.hp, 40, "an empty blast healed the player");
  assert.equal(events.length, 0);
  assert.equal(cops.cops.length, 1);
});

test("SWAT shrugs off the EMP", () => {
  const { cops, add } = system();
  const swat = add(1, { swat: true });
  add(2);

  const kills = cops.empBlast(fakeCar(), new RunState(), new FrameEventBuffer());

  assert.equal(kills, 1);
  assert.deepEqual(cops.cops, [swat], "SWAT died to an EMP standing right on top of the player");
});

test("each kill pays score and heals", () => {
  const { cops, add } = system();
  add(1);
  add(2);
  const run = new RunState();
  run.hp = 10;

  cops.empBlast(fakeCar(), run, new FrameEventBuffer());

  assert.equal(run.score, 2 * SCORE_EMP_KILL);
  assert.equal(run.copScore, run.score, "the game-over breakdown missed the EMP kills");
  assert.equal(run.hp, 10 + 2 * HP_HEAL_EMP_KILL);
});

test("the heal never overshoots max HP", () => {
  const { cops, add } = system();
  for (let i = 0; i < 6; i++) add(i);
  const run = new RunState();
  run.hp = MAX_HP - 1;

  cops.empBlast(fakeCar(), run, new FrameEventBuffer());

  assert.equal(run.hp, MAX_HP);
});

test("the double-score buff applies to EMP kills", () => {
  const { cops, add } = system();
  add(1);
  const run = new RunState();
  run.scoreMultTimer = 5;

  cops.empBlast(fakeCar(), run, new FrameEventBuffer());

  assert.equal(run.score, SCORE_EMP_KILL * SCORE_MULT_VALUE);
});

test("every kill emits one FX event carrying its own payout", () => {
  const { cops, add } = system();
  add(1);
  add(2, { bounty: true });
  const events = new FrameEventBuffer();

  cops.empBlast(fakeCar(), new RunState(), events);

  const drained = events.drain();
  assert.equal(drained.length, 2);
  for (const ev of drained) {
    assert.equal(ev.kind, "copKilled");
    assert.equal(ev.cause, "emp");
    assert.equal(ev.isSwat, false);
    assert.equal(ev.score, SCORE_EMP_KILL);
  }
  assert.equal(drained.filter((e) => e.kind === "copKilled" && e.isBounty).length, 1, "the bounty flag was lost");
});

test("reset clears the cop list", () => {
  const { cops, add } = system();
  add(1);
  add(2);
  cops.reset();
  assert.equal(cops.cops.length, 0);
});
