/* Angular velocity feeds the cop lead. Angle wrap-around here is the classic silent bug: the chase just aims wrong. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PlayerKinematics } from "../src/entities/player-kinematics.ts";

/** Quaternion for a yaw rotation, matching the y-axis-only form the car body uses. */
const yawQuat = (yaw: number) => ({ w: Math.cos(yaw / 2), x: 0, y: Math.sin(yaw / 2), z: 0 });

/* Comfortably above the 0.2 s sample interval — exactly 0.2 lands on float drift and drops samples. */
const STEP = 0.25;

/** Feed samples one sample interval apart and read back the estimate. */
function drive(yaws: number[]) {
  const k = new PlayerKinematics();
  yaws.forEach((yaw, i) => k.update(i * STEP, yawQuat(yaw)));
  return k;
}

test("a single sample reports no rotation", () => {
  assert.equal(new PlayerKinematics().angularVelocity(), 0);
  assert.equal(drive([0]).angularVelocity(), 0);
});

test("a car holding its line reports zero angular velocity", () => {
  assert.equal(drive([1, 1, 1, 1]).angularVelocity(), 0);
});

test("a steady turn is measured at its true rate", () => {
  /* 0.1 rad per step over three steps. */
  assert.ok(Math.abs(drive([0, 0.1, 0.2, 0.3]).angularVelocity() - 0.1 / STEP) < 1e-9);
});

test("turn direction is signed", () => {
  assert.ok(drive([0, 0.1, 0.2]).angularVelocity() > 0);
  assert.ok(drive([0, -0.1, -0.2]).angularVelocity() < 0);
});

test("crossing the ±π seam does not invert the turn", () => {
  /* Nudging past π wraps yaw to -π; a naive subtraction reads this as a violent turn the other way. */
  const k = drive([Math.PI - 0.05, Math.PI + 0.05]);
  const w = k.angularVelocity();
  assert.ok(w > 0, `the seam flipped the turn direction: ${w}`);
  assert.ok(Math.abs(w - 0.1 / STEP) < 1e-6, `the seam inflated the rate: ${w}`);
});

test("the estimate stays bounded for any heading pair", () => {
  /* The wrapped delta can never exceed π, so one sample interval caps the rate. */
  for (let a = -Math.PI; a <= Math.PI; a += 0.3) {
    for (let b = -Math.PI; b <= Math.PI; b += 0.3) {
      const w = drive([a, b]).angularVelocity();
      assert.ok(Number.isFinite(w), `non-finite at ${a}->${b}`);
      assert.ok(Math.abs(w) <= Math.PI / STEP + 1e-9, `rate blew up at ${a}->${b}: ${w}`);
    }
  }
});

test("samples faster than the interval are dropped", () => {
  const k = new PlayerKinematics();
  k.update(0, yawQuat(0));
  k.update(0.05, yawQuat(1));
  k.update(0.1, yawQuat(2));
  /* Only the first sample was taken, so there is nothing to differentiate yet. */
  assert.equal(k.angularVelocity(), 0);
});

test("the window slides — an old turn is forgotten once the car straightens", () => {
  const k = new PlayerKinematics();
  const yaws = [0, 0.5, 1.0, 1.5];
  yaws.forEach((y, i) => k.update(i * STEP, yawQuat(y)));
  assert.ok(k.angularVelocity() > 0);
  /* History holds 4 samples; four straight ones push the turn out entirely. */
  for (let i = 0; i < 4; i++) k.update((yaws.length + i) * STEP, yawQuat(1.5));
  assert.equal(k.angularVelocity(), 0, "the chase kept leading on a turn that ended");
});

test("reset clears the history and the sample clock", () => {
  const k = drive([0, 0.2, 0.4]);
  assert.ok(k.angularVelocity() !== 0);
  k.reset();
  assert.equal(k.angularVelocity(), 0);
  /* The clock must reset too, or the first post-reset sample is rejected as too soon. */
  k.update(0, yawQuat(0));
  k.update(STEP, yawQuat(0.1));
  assert.ok(Math.abs(k.angularVelocity() - 0.1 / STEP) < 1e-9, "sampling stalled after a reset");
});
