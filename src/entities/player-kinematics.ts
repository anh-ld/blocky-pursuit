/* Short-window heading history for the cop chase. Stores a few recent player
 * yaws so the chase loop can estimate angular velocity without the noise of
 * a single-frame derivative. Sample at the same tick as cop-system.update. */
const SAMPLE_INTERVAL = 0.2;
const HISTORY_SIZE = 4;

type Sample = { t: number; yaw: number };

export class PlayerKinematics {
  private samples: Sample[] = [];
  private lastSampleTime = -Infinity;

  /** Read the player's current yaw (radians, atan2 form, matches car.sampleDisplay). */
  private yawFromQuat(q: { w: number; x: number; y: number; z: number }): number {
    return Math.atan2(2 * (q.w * q.y), 1 - 2 * q.y * q.y);
  }

  /** Shortest signed delta a→b, wrapped to (-π, π]. */
  private wrap(a: number, b: number): number {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }

  /** Push a sample if enough time has passed since the last one. */
  update(time: number, quat: { w: number; x: number; y: number; z: number }): void {
    if (time - this.lastSampleTime < SAMPLE_INTERVAL) return;
    this.samples.push({ t: time, yaw: this.yawFromQuat(quat) });
    if (this.samples.length > HISTORY_SIZE) this.samples.shift();
    this.lastSampleTime = time;
  }

  /** Smoothed angular velocity (rad/s). Returns 0 with fewer than 2 samples. */
  angularVelocity(): number {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    const dt = last.t - first.t;
    if (dt <= 0) return 0;
    return this.wrap(first.yaw, last.yaw) / dt;
  }

  reset(): void {
    this.samples = [];
    this.lastSampleTime = -Infinity;
  }
}
