import { useEffect, useState } from "preact/hooks";
import { damageDirAngle, damageDirSeq } from "../state";

/**
 * Brief red glow at the screen edge where the latest damaging cop sits, so
 * the player learns which way to evade. Triggered on every increment of
 * `damageDirSeq` and self-clears after 400ms via a CSS keyframe + a
 * setTimeout cleanup that hides the node when the animation ends.
 *
 * The world→screen angle conversion below assumes the same isometric camera
 * setup as `main.ts` (camera at +X +Y +Z looking at origin). World +X
 * projects to (right, down), world +Z projects to (left, down) — the linear
 * combination falls out of the cross-product of camera basis vectors.
 */
export function DamageIndicator() {
  const seq = damageDirSeq.value; // subscribe to new-hit pulses
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (seq === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(t);
  }, [seq]);

  if (!visible) return null;

  // World XZ angle → isometric screen angle.
  // Camera at (50,50,50) looking at origin gives basis vectors:
  //   right (world)  = ( 1, 0, -1) / √2
  //   up    (world)  = (-1, 2, -1) / √6  (the projected world-up)
  // For a horizontal world delta (dx, 0, dz), the unnormalized screen
  // components are (dx - dz) on the right axis and (dx + dz) on the down
  // axis — but the up basis is foreshortened by √2/√6 = 1/√3 relative to
  // the right basis, so the y component must be divided by √3 to give the
  // correct on-screen aspect ratio.
  const w = damageDirAngle.value;
  const dx = Math.cos(w);
  const dz = Math.sin(w);
  const sx = dx - dz;
  const sy = (dx + dz) / Math.sqrt(3);
  const screenAngle = Math.atan2(sy, sx);
  // Push the gradient hot-spot all the way to the screen edge in the threat
  // direction so the warning reads as "coming from that side".
  const cx = 50 + Math.cos(screenAngle) * 50;
  const cy = 50 + Math.sin(screenAngle) * 50;

  return (
    <div
      key={seq}
      class="absolute inset-0 z-15 pointer-events-none animate-damage-flash"
      style={{
        background: `radial-gradient(circle at ${cx}% ${cy}%, rgba(220,38,38,0.7) 0%, transparent 45%)`,
      }}
    />
  );
}
