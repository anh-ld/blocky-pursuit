import { useEffect, useState } from "preact/hooks";
import { damageDirAngle, damageDirSeq } from "../state";

/* Brief red glow at the screen edge where the latest damaging cop sits — player learns evade direction. */

export function DamageIndicator() {
  const seq = damageDirSeq.value;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (seq === 0) return;
    setVisible(true);
    const t = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(t);
  }, [seq]);

  if (!visible) return null;

  /* World XZ angle → isometric screen angle. Camera at (50,50,50) → origin. */
  /* Basis vectors: right = (1,0,-1)/√2, projected up = (-1,2,-1)/√6. */
  /* Horizontal delta (dx, 0, dz) → screen = (dx-dz) right + (dx+dz) down. */
  /* Up basis foreshortened 1/√3 vs right — divide y by √3 for correct aspect. */
  const w = damageDirAngle.value;
  const dx = Math.cos(w);
  const dz = Math.sin(w);
  const sx = dx - dz;
  const sy = (dx + dz) / Math.sqrt(3);
  const screenAngle = Math.atan2(sy, sx);
  const cx = 50 + Math.cos(screenAngle) * 50;
  const cy = 50 + Math.sin(screenAngle) * 50;

  return (
    <div
      key={seq}
      class="absolute inset-0 z-[15] pointer-events-none animate-damage-flash"
      style={{
        background: `radial-gradient(circle at ${cx}% ${cy}%, rgba(239,68,68,0.7) 0%, transparent 45%)`,
      }}
    />
  );
}
