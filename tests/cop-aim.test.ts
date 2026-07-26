/* Deterministic fixtures for the chase decision surface. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeAim, interceptTime, TURN_THRESHOLD, type IAimInput } from "../src/entities/cop-aim.ts";

/* Player tops out at 40; cop tiers run 44-66. */
const PLAYER_SPEED = 40;
const COP_SPEED = 50;

function aim(over: Partial<IAimInput>) {
  const base: IAimInput = {
    playerX: 0,
    playerZ: 0,
    playerVx: 0,
    playerVz: -PLAYER_SPEED,
    copX: 0,
    copZ: 30 /* directly behind */,
    copSpeed: COP_SPEED,
    omega: 0,
    predictAhead: 1.5,
    interceptPower: 1,
    flankDist: 0,
    flankSide: 1,
  };

  return computeAim({ ...base, ...over }, { x: 0, z: 0 });
}

test("intercept solution actually intercepts", () => {
  const [dx, dz, vx, vz] = [0, 30, 0, -PLAYER_SPEED];
  const t = interceptTime(dx, dz, vx, vz, COP_SPEED);
  assert.ok(t !== null);
  /* Cop travel radius must equal the distance to the target's future position. */
  assert.ok(Math.abs(Math.hypot(dx + vx * t, dz + vz * t) - COP_SPEED * t) < 1e-6);
});

test("no intercept when the target outruns the cop and is opening the gap", () => {
  /* Cop slower than the player, player driving directly away. */
  assert.equal(interceptTime(0, -30, 0, -PLAYER_SPEED, 30), null);
});

test("a slower cop can never intercept a faster target holding its line", () => {
  /* Player crosses at 40, cop caps at 30 — the gap only grows. */
  assert.equal(interceptTime(0, 30, PLAYER_SPEED, 0, 30), null);
});

test("a crossing target is cut off ahead of where it currently is", () => {
  const a = aim({ copX: 0, copZ: 30, playerVx: PLAYER_SPEED, playerVz: 0 });
  /* Player runs +x, so the cut-off sits downstream in +x. */
  assert.ok(a.x > 5, `aimed behind the crossing player: ${a.x}`);
});

test("lead role aims at the intercept, not hundreds of units downrange", () => {
  /* An 8s ceiling, unbounded, aims 320 units ahead and the cop runs parallel. */
  const a = aim({ predictAhead: 2, interceptPower: 4 });
  const leadAhead = Math.abs(a.z);
  assert.ok(leadAhead < 200, `lead aim ran away downrange: ${leadAhead}`);
  /* The solved intercept for this geometry is 3s -> 120 units ahead. */
  assert.ok(Math.abs(leadAhead - 120) < 1, `expected the solved intercept, got ${leadAhead}`);
});

test("a plain chaser never leads past its own predictAhead", () => {
  const a = aim({ predictAhead: 0.5, interceptPower: 1 });
  assert.ok(Math.abs(a.z) <= 0.5 * PLAYER_SPEED + 1e-6);
});

test("aim converges on the player as the gap closes", () => {
  const far = aim({ copZ: 120, predictAhead: 2, interceptPower: 4 });
  const near = aim({ copZ: 6, predictAhead: 2, interceptPower: 4 });
  /* Less gap to close = less time to lead. */
  assert.ok(Math.abs(near.z) < Math.abs(far.z));
  /* 6 units of gap at 10 u/s closing = 0.6s, so the player is 24 units on. */
  assert.ok(Math.abs(Math.abs(near.z) - 24) < 0.5, `expected a 24-unit lead, got ${Math.abs(near.z)}`);
});

test("a stopped player is aimed at directly", () => {
  const a = aim({ playerVx: 0, playerVz: 0, flankDist: 12 });
  assert.equal(a.x, 0);
  assert.equal(a.z, 0);
});

test("flank sides split to opposite sides of the player's heading", () => {
  const left = aim({ flankDist: 12, flankSide: 1 });
  const right = aim({ flankDist: 12, flankSide: -1 });
  assert.ok(Math.sign(left.x) === -Math.sign(right.x));
  assert.ok(Math.abs(left.x - right.x) > 1);
});

test("a turning player is led around the arc, not along the tangent", () => {
  const straight = aim({ omega: 0 });
  const turning = aim({ omega: 1.0 });
  /* The arc pulls the aim point off the straight-line path. */
  assert.ok(Math.abs(turning.x - straight.x) > 5);
});

/* Closed-loop chase mirroring cop.ts steering. Returns the closest the cop ever got. */
function simulateChase(opts: { predictAhead: number; interceptPower: number; playerOmega: number }): number {
  const DT = 1 / 60;
  const TURN_SPEED = 3.0;
  let px = 0;
  let pz = 0;
  let pHeading = Math.PI; /* heading -z */
  let cx = 0;
  let cz = 60;
  let cHeading = Math.PI;
  let closest = Infinity;

  for (let step = 0; step < 15 * 60; step++) {
    /* Serpentine: flip turn direction every 2s. */
    const omega = Math.floor(step / (2 * 60)) % 2 === 0 ? opts.playerOmega : -opts.playerOmega;
    pHeading += omega * DT;
    const pvx = Math.sin(pHeading) * PLAYER_SPEED;
    const pvz = -Math.cos(pHeading) * PLAYER_SPEED;
    px += pvx * DT;
    pz += pvz * DT;

    const a = computeAim(
      {
        playerX: px,
        playerZ: pz,
        playerVx: pvx,
        playerVz: pvz,
        copX: cx,
        copZ: cz,
        copSpeed: COP_SPEED,
        omega,
        predictAhead: opts.predictAhead,
        interceptPower: opts.interceptPower,
        flankDist: 0,
        flankSide: 1,
      },
      { x: 0, z: 0 },
    );

    /* Rate-limited exactly like the physics step. */
    const want = Math.atan2(a.x - cx, -(a.z - cz));
    let diff = want - cHeading;
    while (diff > Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    cHeading += Math.sign(diff) * Math.min(TURN_SPEED * DT, Math.abs(diff));
    cx += Math.sin(cHeading) * COP_SPEED * DT;
    cz += -Math.cos(cHeading) * COP_SPEED * DT;

    closest = Math.min(closest, Math.hypot(px - cx, pz - cz));
  }

  return closest;
}

test("a lead cop closes on a serpentining player within 15 s", () => {
  const closest = simulateChase({ predictAhead: 2, interceptPower: 4, playerOmega: 0.6 });
  assert.ok(closest < 5, `lead cop never closed the gap: best was ${closest.toFixed(1)} units`);
});

test("a lead cop closes on a player driving straight", () => {
  /* Unbounded, the lead cop tracks a phantom 320 units downrange and never converges. */
  const closest = simulateChase({ predictAhead: 2, interceptPower: 4, playerOmega: 0 });
  assert.ok(closest < 5, `lead cop never closed the gap: best was ${closest.toFixed(1)} units`);
});

test("a low-tier chaser closes on a player driving straight", () => {
  const closest = simulateChase({ predictAhead: 0.5, interceptPower: 1, playerOmega: 0 });
  assert.ok(closest < 5, `chaser never closed the gap: best was ${closest.toFixed(1)} units`);
});

test("arc lead stays bounded at the turn threshold", () => {
  /* ω is tiny here and 1/ω blows up if the horizon is unbounded. */
  const a = aim({ omega: TURN_THRESHOLD, predictAhead: 2, interceptPower: 4 });
  assert.ok(Number.isFinite(a.x) && Number.isFinite(a.z));
  assert.ok(Math.hypot(a.x, a.z) < 200, `arc lead blew up: ${Math.hypot(a.x, a.z)}`);
});
