import { type ICarSkin } from "../entities/car-skins";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/**
 * Side-view SVG silhouette of a car skin. Draws a clean, recognizably
 * car-shaped icon: rounded chassis, trapezoidal cabin with sloped windshield
 * + rear window, wheels poking out below, plus optional spoiler/stripe.
 *
 * Each skin's shape proportions (`bodyL`, `bodyH`, `cabinL`, `cabinH`,
 * `cabinZ`) drive the geometry so the lineup reads as visibly different
 * silhouettes — long and low for the Lambo, short and tall for the Beetle,
 * cabin-forward for the Corvette, etc.
 *
 * Shared by Pre-Game and Garage so we don't maintain two thumbnail renderers.
 */
export function CarPreview({ skin }: { skin: ICarSkin }) {
  const W = 140;
  const H = 80;
  const s = skin.shape;

  // Pixel scale for shape units (~3..9 → ~36..108 px).
  const SCALE = 12;
  const bodyL = Math.max(48, s.bodyL * SCALE);
  const cabinL = Math.max(22, Math.min(bodyL - 24, s.cabinL * SCALE));
  const cabinH = Math.max(12, s.cabinH * SCALE);
  const chassisH = Math.max(9, s.bodyH * SCALE);

  // Chunky cars get chunky wheels.
  const wheelR = Math.max(7, Math.min(11, s.bodyH * 8));
  const groundY = H - 5;
  const wheelCY = groundY - wheelR;

  // Chassis sits with its bottom roughly at the wheel axle so the wheels
  // stick out below it (the classic side-view car look).
  const chassisBottom = wheelCY + 1;
  const chassisTop = chassisBottom - chassisH;
  const cabinTopY = chassisTop - cabinH;

  // Center the body in the frame.
  const leftX = (W - bodyL) / 2;
  const rightX = leftX + bodyL;

  // Cabin rests on the chassis. cabinZ shifts it forward (-) / rear (+)
  // along the body length (matches the 3D car-mesh convention).
  const cabinCenterX = leftX + bodyL / 2 + s.cabinZ * 4;
  const cabinLeftX = Math.max(leftX + 6, cabinCenterX - cabinL / 2);
  const cabinRightX = Math.min(rightX - 6, cabinCenterX + cabinL / 2);

  // Trapezoid slopes — windshield (front) is a touch steeper than rear.
  // Sport cars have shallow cabins so the slopes look proportionally bigger,
  // hatchbacks/Beetles get a boxier cabin since cabinH is larger.
  const rearSlope = Math.min(cabinH * 0.55, (cabinRightX - cabinLeftX) * 0.35);
  const frontSlope = Math.min(cabinH * 0.7, (cabinRightX - cabinLeftX) * 0.4);

  // Cabin trapezoid — clockwise from rear-bottom.
  const cabinPoly = [
    [cabinLeftX, chassisTop],
    [cabinLeftX + rearSlope, cabinTopY],
    [cabinRightX - frontSlope, cabinTopY],
    [cabinRightX, chassisTop],
  ]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  // Window highlight = inset trapezoid inside the cabin.
  const winInset = 2;
  const winPoly = [
    [cabinLeftX + rearSlope * 0.5 + winInset, chassisTop - winInset - 1],
    [cabinLeftX + rearSlope + winInset, cabinTopY + winInset],
    [cabinRightX - frontSlope - winInset, cabinTopY + winInset],
    [cabinRightX - frontSlope * 0.5 - winInset, chassisTop - winInset - 1],
  ]
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(" ");

  const body = hex(skin.bodyColor);
  const cabin = hex(skin.cabinColor);
  const accent = hex(skin.accentColor);
  const wheel = hex(skin.wheelColor);

  // Wheel positions: tucked under the bumpers, not at the very edges, so the
  // car has visible overhangs front and rear like a real silhouette.
  const wheelXFront = rightX - Math.max(13, bodyL * 0.16);
  const wheelXRear = leftX + Math.max(13, bodyL * 0.16);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="68"
      style={{ display: "block" }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Ground shadow */}
      <ellipse
        cx={W / 2}
        cy={groundY + 3}
        rx={bodyL / 2 + 4}
        ry={2.2}
        fill="#000"
        opacity={0.4}
      />

      {/* Spoiler — drawn before the body so the upright tucks behind it */}
      {s.hasSpoiler && (
        <>
          <rect
            x={rightX - 12}
            y={chassisTop - Math.max(5, s.spoilerH * 12)}
            width={3}
            height={Math.max(5, s.spoilerH * 12)}
            fill={accent}
          />
          <rect
            x={rightX - 18}
            y={chassisTop - Math.max(5, s.spoilerH * 12) - 2}
            width={18}
            height={3}
            rx={1}
            fill={accent}
          />
        </>
      )}

      {/* Wheels: outer tire, rim, hub */}
      <circle cx={wheelXFront} cy={wheelCY} r={wheelR} fill="#0a0a0a" />
      <circle cx={wheelXRear} cy={wheelCY} r={wheelR} fill="#0a0a0a" />
      <circle cx={wheelXFront} cy={wheelCY} r={wheelR * 0.68} fill={wheel} />
      <circle cx={wheelXRear} cy={wheelCY} r={wheelR * 0.68} fill={wheel} />
      <circle cx={wheelXFront} cy={wheelCY} r={wheelR * 0.28} fill="#1f2937" />
      <circle cx={wheelXRear} cy={wheelCY} r={wheelR * 0.28} fill="#1f2937" />

      {/* Cabin (drawn before the chassis so the chassis covers the bottom seam) */}
      <polygon points={cabinPoly} fill={cabin} stroke="#000" stroke-width={1} stroke-opacity={0.45} stroke-linejoin="round" />
      {/* Window highlight */}
      <polygon points={winPoly} fill="#ffffff" opacity={0.25} />
      {/* Vertical pillar between front and rear windows */}
      <line
        x1={(cabinLeftX + cabinRightX) / 2 + s.cabinZ * 0.5}
        y1={cabinTopY + 2}
        x2={(cabinLeftX + cabinRightX) / 2 + s.cabinZ * 0.5}
        y2={chassisTop - 1}
        stroke={cabin}
        stroke-width={1.5}
      />

      {/* Chassis — rounded rect spanning bumper to bumper */}
      <rect
        x={leftX}
        y={chassisTop}
        width={bodyL}
        height={chassisH}
        rx={Math.min(5, chassisH * 0.5)}
        fill={body}
        stroke="#000"
        stroke-width={1}
        stroke-opacity={0.45}
      />

      {/* Optional racing stripe (Mustang / Mini) */}
      {s.hasStripe && (
        <rect
          x={leftX + 3}
          y={chassisTop + chassisH * 0.35}
          width={bodyL - 6}
          height={Math.max(2, chassisH * 0.22)}
          fill={accent}
        />
      )}

      {/* Door line (cosmetic detail so chassis doesn't read as a blank slab) */}
      <line
        x1={(cabinLeftX + cabinRightX) / 2 + s.cabinZ * 0.5}
        y1={chassisTop + 2}
        x2={(cabinLeftX + cabinRightX) / 2 + s.cabinZ * 0.5}
        y2={chassisBottom - 2}
        stroke="#000"
        stroke-width={0.8}
        stroke-opacity={0.35}
      />

      {/* Headlight (front = right) */}
      <rect
        x={rightX - 5}
        y={chassisTop + chassisH * 0.25}
        width={4}
        height={Math.max(3, chassisH * 0.45)}
        rx={1}
        fill="#ffee88"
      />
      {/* Taillight (rear = left) */}
      <rect
        x={leftX + 1}
        y={chassisTop + chassisH * 0.25}
        width={4}
        height={Math.max(3, chassisH * 0.45)}
        rx={1}
        fill="#ff3b3b"
      />
    </svg>
  );
}
