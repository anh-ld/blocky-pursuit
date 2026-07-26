import * as CANNON from "cannon-es";
import type { Car } from "./car";

/* Per-step scratch reused across preStep. Safe — physics runs single-threaded, values don't outlive one call. */
const _localVel = new CANNON.Vec3();
const _force = new CANNON.Vec3();
const _forceOffset = new CANNON.Vec3(0, 0, 0);
const _q = new CANNON.Quaternion();

/** Install player car physics: arcade auto-drive, lateral grip, speed cap, direct-rotation steering. */
/* Reads car.keys/maxSpeed each tick; writes car.lateralSpeed for skid emitter. */
export function installCarPhysics(car: Car) {
  const { world, body } = car;

  /* Listen for collisions with static objects (buildings, walls) */
  body.addEventListener("collide", (event: { body: CANNON.Body }) => {
    const other = event.body;

    if (other.mass === 0 && other.shapes[0] instanceof CANNON.Box) {
      car.bounceBackTimer = car.bounceBackDuration;
    }
  });

  world.addEventListener("preStep", () => {
    body.wakeUp();

    /* Don't allow control while airborne (e.g. initial drop) */
    if (body.position.y > 1.5) return;

    /* 1. Auto-drive with acceleration curve (both directions start from 0) */
    body.vectorToLocalFrame(body.velocity, _localVel);
    const forwardSpeed = -_localVel.z; /* positive = moving forward */
    const maxReverseSpeed = car.maxSpeed * 0.25;

    if (car.bounceBackTimer > 0) {
      /* Reverse: strong torque at standstill, tapering as it approaches max reverse */
      const reverseSpeed = Math.max(0, -forwardSpeed);
      const reverseRatio = Math.min(reverseSpeed / maxReverseSpeed, 1);
      const reverseScale = 0.2 * (1 - reverseRatio * 0.8);
      _force.set(0, 0, car.forwardForce * reverseScale);
      body.applyLocalForce(_force, _forceOffset);

      if (reverseSpeed > maxReverseSpeed) {
        _localVel.z = maxReverseSpeed;
        body.vectorToWorldFrame(_localVel, body.velocity);
      }
    } else {
      /* Forward: peak torque at low speed, tapering toward top speed */
      let forceScale: number;

      if (forwardSpeed < 0) {
        forceScale = 0.8;
      } else {
        const speedRatio = Math.min(forwardSpeed / car.maxSpeed, 1);
        forceScale = 1.0 - speedRatio * 0.7;
      }

      /* Recovery phase: gentle ramp after bounce-back so steering has time to work */
      if (car.recoveryTimer > 0) {
        const recoveryProgress = 1 - car.recoveryTimer / car.recoveryDuration;
        forceScale *= 0.15 + 0.85 * recoveryProgress;
      }

      _force.set(0, 0, -car.forwardForce * forceScale);
      body.applyLocalForce(_force, _forceOffset);
    }

    /* 2. Custom Arcade Friction (Drift Mechanics). Re-read into the same scratch — applyLocalForce can mutate body.velocity. */
    body.vectorToLocalFrame(body.velocity, _localVel);

    /* Capture lateral speed BEFORE friction kills it — used by skid emitter */
    car.lateralSpeed = Math.abs(_localVel.x);

    /* Lateral grip is per-skin (gripFactor). Recovery loosens it so steering can redirect the car after a bounce-back. */
    const isRecovering = car.bounceBackTimer > 0 || car.recoveryTimer > 0;
    _localVel.x *= isRecovering ? 0.95 : car.gripFactor;
    _localVel.z *= 0.98;

    body.vectorToWorldFrame(_localVel, body.velocity);

    const speed = body.velocity.length();

    if (speed > car.maxSpeed) {
      body.velocity.scale(car.maxSpeed / speed, body.velocity);
    }

    /* Steering — direct heading rotation. Authority drops with speed; high stabilityFactor retains more at top. */
    body.angularVelocity.y = 0;

    if (speed > 0.5) {
      const dir = _localVel.z < 0 ? 1 : -1;
      const speedRatio = Math.min(speed / car.maxSpeed, 1);
      /* 1 at 0 speed → stabilityFactor at top speed */
      const steerScale = 1 - speedRatio * (1 - car.stabilityFactor);
      const effectiveTurn = car.turnSpeed * steerScale;
      let steerAngle = 0;
      if (car.keys.left) steerAngle = effectiveTurn * dir;
      if (car.keys.right) steerAngle = -effectiveTurn * dir;

      _q.setFromEuler(0, steerAngle * (1 / 60), 0);
      body.quaternion = body.quaternion.mult(_q);
    }
  });
}
