import * as CANNON from "cannon-es";
import type { Car } from "./car";

/**
 * Install the player car's physics behavior on the cannon-es world preStep:
 * arcade auto-drive with reverse-on-collision recovery, lateral grip,
 * speed cap, and direct-rotation steering. Returns nothing — the callback
 * is registered for the lifetime of the world.
 *
 * The function reads from `car` each tick (keys, maxSpeed, bounceBackTimer,
 * recoveryTimer) and writes back `lateralSpeed` for the skid emitter.
 */
export function installCarPhysics(car: Car) {
  const { world, body } = car;

  // Listen for collisions with static objects (buildings, walls)
  body.addEventListener("collide", (event: { body: CANNON.Body }) => {
    const other = event.body;
    if (other.mass === 0 && other.shapes[0] instanceof CANNON.Box) {
      car.bounceBackTimer = car.bounceBackDuration;
    }
  });

  world.addEventListener("preStep", () => {
    body.wakeUp();

    // Don't allow control while airborne (e.g. initial drop)
    if (body.position.y > 1.5) return;

    // 1. Auto-drive with acceleration curve (both directions start from 0)
    const localVel = new CANNON.Vec3();
    body.vectorToLocalFrame(body.velocity, localVel);
    const forwardSpeed = -localVel.z; // positive = moving forward
    const maxReverseSpeed = car.maxSpeed * 0.25;

    if (car.bounceBackTimer > 0) {
      // Reverse: strong torque at standstill, tapering as it approaches max reverse
      const reverseSpeed = Math.max(0, -forwardSpeed);
      const reverseRatio = Math.min(reverseSpeed / maxReverseSpeed, 1);
      const reverseScale = 0.2 * (1 - reverseRatio * 0.8);
      const force = new CANNON.Vec3(0, 0, car.forwardForce * reverseScale);
      body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));

      // Cap reverse speed
      if (reverseSpeed > maxReverseSpeed) {
        localVel.z = maxReverseSpeed;
        body.vectorToWorldFrame(localVel, body.velocity);
      }
    } else {
      // Forward: peak torque at low speed, tapering toward top speed
      let forceScale: number;
      if (forwardSpeed < 0) {
        forceScale = 0.8;
      } else {
        const speedRatio = Math.min(forwardSpeed / car.maxSpeed, 1);
        forceScale = 1.0 - speedRatio * 0.7;
      }

      // Recovery phase: gentle ramp after bounce-back so steering has time to work
      if (car.recoveryTimer > 0) {
        const recoveryProgress = 1 - car.recoveryTimer / car.recoveryDuration;
        forceScale *= 0.15 + 0.85 * recoveryProgress;
      }

      const force = new CANNON.Vec3(0, 0, -car.forwardForce * forceScale);
      body.applyLocalForce(force, new CANNON.Vec3(0, 0, 0));
    }

    // 2. Custom Arcade Friction (Drift Mechanics)
    const localVelocity = new CANNON.Vec3();
    body.vectorToLocalFrame(body.velocity, localVelocity);

    // Capture lateral speed BEFORE friction kills it — used by skid emitter
    car.lateralSpeed = Math.abs(localVelocity.x);

    // Lateral grip is per-skin (gripFactor). Recovery loosens it so steering
    // can redirect the car after a bounce-back.
    const isRecovering = car.bounceBackTimer > 0 || car.recoveryTimer > 0;
    localVelocity.x *= isRecovering ? 0.95 : car.gripFactor;
    localVelocity.z *= 0.98;

    body.vectorToWorldFrame(localVelocity, body.velocity);

    // Cap max speed
    const speed = body.velocity.length();
    if (speed > car.maxSpeed) {
      body.velocity.scale(car.maxSpeed / speed, body.velocity);
    }

    // 3. Steering — direct heading rotation (like a real steering wheel).
    // Steering authority drops with speed; cars with high stabilityFactor
    // retain more authority at top speed (less twitchy / easier to drive).
    body.angularVelocity.y = 0;
    if (speed > 0.5) {
      const dir = localVelocity.z < 0 ? 1 : -1;
      const speedRatio = Math.min(speed / car.maxSpeed, 1);
      // 1 at 0 speed → stabilityFactor at top speed
      const steerScale = 1 - speedRatio * (1 - car.stabilityFactor);
      const effectiveTurn = car.turnSpeed * steerScale;
      let steerAngle = 0;
      if (car.keys.left) steerAngle = effectiveTurn * dir;
      if (car.keys.right) steerAngle = -effectiveTurn * dir;

      const q = new CANNON.Quaternion();
      q.setFromEuler(0, steerAngle * (1 / 60), 0);
      body.quaternion = body.quaternion.mult(q);
    }
  });
}
