/* Pure chase-aim math. No THREE/CANNON — testable without renderer or physics. */

/* Below: straight, perpendicular corner-cut. At or above: arc projection. */
export const TURN_THRESHOLD = 0.05;
/* Perpendicular corner-cut scale for a straight-running target. Higher = harder to escape. */
export const STRAIGHT_LEAD_K = 0.3;
/* Constant-ω only holds ~1s; a weaving player reverses. Linear lead needs no cap. */
export const ARC_HORIZON = 1.0;

export type IAimInput = {
  playerX: number;
  playerZ: number;
  playerVx: number;
  playerVz: number;
  copX: number;
  copZ: number;
  copSpeed: number /* bounds how far ahead it can usefully aim */;
  omega: number /* player angular velocity, rad/s */;
  predictAhead: number;
  interceptPower: number /* lead-role multiplier on the ceiling */;
  flankDist: number /* 0 = no flank */;
  flankSide: number /* +1 / -1 */;
};

export type IAimOut = { x: number; z: number };

/** Solves |D + V·t| = copSpeed·t. Null when the target outruns and opens the gap. */
export function interceptTime(dx: number, dz: number, vx: number, vz: number, copSpeed: number): number | null {
  const a = vx * vx + vz * vz - copSpeed * copSpeed;
  const b = 2 * (dx * vx + dz * vz);
  const c = dx * dx + dz * dz;

  /* Equal speeds — quadratic degenerates to linear. */
  if (Math.abs(a) < 1e-6) return b < 0 ? -c / b : null;

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const root = Math.sqrt(disc);
  const t1 = (-b - root) / (2 * a);
  const t2 = (-b + root) / (2 * a);
  /* Earliest future intercept. */
  const t = Math.min(t1 <= 0 ? Infinity : t1, t2 <= 0 ? Infinity : t2);
  return Number.isFinite(t) ? t : null;
}

/** Aim point for this step. Writes into `out` — per-cop per physics step, no alloc. */
export function computeAim(i: IAimInput, out: IAimOut): IAimOut {
  const dx = i.playerX - i.copX;
  const dz = i.playerZ - i.copZ;
  const dist = Math.hypot(dx, dz);
  const v = Math.hypot(i.playerVx, i.playerVz);

  /* Unbounded, a lead cop aims hundreds of units downrange and runs parallel. */
  const solved = interceptTime(dx, dz, i.playerVx, i.playerVz, Math.max(i.copSpeed, 1));
  const leadTime = Math.min(solved ?? i.predictAhead, i.predictAhead * i.interceptPower);

  out.x = i.playerX;
  out.z = i.playerZ;

  if (leadTime > 0 && v > 0.5) {
    if (Math.abs(i.omega) >= TURN_THRESHOLD) {
      /* Integrate velocity rotating at ω. Degenerates to linear tangent as ω → 0. */
      const phi = i.omega * Math.min(leadTime, ARC_HORIZON);
      const s = Math.sin(phi);
      const c = 1 - Math.cos(phi);
      out.x += (i.playerVx * s + i.playerVz * c) / i.omega;
      out.z += (i.playerVz * s - i.playerVx * c) / i.omega;
    } else {
      /* Linear lead plus perpendicular bias to the cop's side, so it cuts the corner. */
      out.x += i.playerVx * leadTime;
      out.z += i.playerVz * leadTime;
      const perpX = -i.playerVz / v;
      const perpZ = i.playerVx / v;
      const side = Math.sign(perpX * -dx + perpZ * -dz) || 1;
      const scale = dist * STRAIGHT_LEAD_K * side;
      out.x += perpX * scale;
      out.z += perpZ * scale;
    }
  }

  /* Offset off the player's heading so the swarm splits. */
  if (i.flankDist > 0 && v > 1) {
    out.x += (-i.playerVz / v) * i.flankDist * i.flankSide;
    out.z += (i.playerVx / v) * i.flankDist * i.flankSide;
  }

  return out;
}
