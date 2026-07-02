import type { JSX } from "preact";

/* Hand-drawn chunky SVG icons. Blocky/voxel aesthetic, no library defaults, no Lucide thin strokes. */

type IconProps = JSX.SVGAttributes<SVGSVGElement> & { size?: number };

function svg(props: IconProps, children: JSX.Element): JSX.Element {
  const { size = 16, ...rest } = props;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="square"
      stroke-linejoin="miter"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconSteer = (p: IconProps) =>
  svg(
    p,
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3" />
    </>,
  );

export const IconCar = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M2 11h12v2H2z" />
      <path d="M3.5 11l1.2-3.5h6.6L12.5 11" />
      <path d="M5.5 7.5h5" />
      <circle cx="4.5" cy="13" r="1" fill="currentColor" />
      <circle cx="11.5" cy="13" r="1" fill="currentColor" />
    </>,
  );

export const IconCop = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M2 11h12v2H2z" />
      <path d="M3.5 11l1.2-3.5h6.6L12.5 11" />
      <path d="M6 6.5h4v1.5H6z" fill="currentColor" />
      <circle cx="6.5" cy="7.5" r="0.6" fill="#000" stroke="none" />
      <circle cx="9.5" cy="7.5" r="0.6" fill="#000" stroke="none" />
      <circle cx="4.5" cy="13" r="1" fill="currentColor" />
      <circle cx="11.5" cy="13" r="1" fill="currentColor" />
    </>,
  );

export const IconWater = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M2 11c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
      <path d="M2 13.5c1.5 0 1.5-1.5 3-1.5s1.5 1.5 3 1.5 1.5-1.5 3-1.5 1.5 1.5 3 1.5" />
    </>,
  );

export const IconBolt = (p: IconProps) => svg(p, <path d="M9 1L3 9h4l-1 6 6-8H8z" fill="currentColor" />);

export const IconHeart = (p: IconProps) =>
  svg(
    { ...p, fill: p.fill ?? "currentColor" },
    <path d="M8 14L2.5 8.5C1 7 1.5 4 4 3.5c1.5-.3 3 .5 4 2 1-1.5 2.5-2.3 4-2 2.5.5 3 3.5 1.5 5z" />,
  );

export const IconShield = (p: IconProps) =>
  svg({ ...p, fill: "currentColor" }, <path d="M8 1.5L2.5 4v5c0 3 2.5 5 5.5 5.5 3-.5 5.5-2.5 5.5-5.5V4z" />);

export const IconSkull = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <path d="M3 6c0-3 2-5 5-5s5 2 5 5v3H3z" />
      <rect x="4.5" y="6" width="2.5" height="3" fill="#000" stroke="none" />
      <rect x="9" y="6" width="2.5" height="3" fill="#000" stroke="none" />
      <path d="M7 11h2v3H7z" />
    </>,
  );

export const IconFlame = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <path d="M8 1c0 2-2 3-2 6 0 1 .5 2 1 2.5C6 8 7 7 7 6c0 2 1 3 2 4s2 1.5 2 3-1.5 2-3 2-3-1-3-3c0-1 .5-1.5 1-2 0 .5 .5 1 1 1 0-2 1-3 1-5s0-3 0-5z" />,
  );

export const IconCoin = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <circle cx="8" cy="8" r="6" fill="none" />
      <path d="M6 5h3.5l-3 6h3.5" stroke="#000" stroke-width="1.5" fill="none" />
    </>,
  );

export const IconClock = (p: IconProps) =>
  svg(
    p,
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 4v4l3 2" />
    </>,
  );

export const IconMagnet = (p: IconProps) =>
  svg({ ...p, fill: "currentColor" }, <path d="M3 2h3v6c0 1.5 1 2 2 2s2-.5 2-2V2h3v6c0 3-2 5-5 5s-5-2-5-5z" />);

export const IconGhost = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <path d="M3 8c0-3.5 2-6 5-6s5 2.5 5 6v6l-1.5-1.5L10 14l-1.5-1.5L7 14l-1.5-1.5L4 14l-1-1z" />,
  );

export const IconTank = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <rect x="2" y="6" width="9" height="3" />
      <rect x="4" y="3" width="6" height="3" />
      <path d="M11 7h3v2h-3" />
      <rect x="2" y="9" width="12" height="2" fill="#000" />
      <circle cx="4" cy="12" r="1.5" fill="#000" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="#000" stroke="none" />
    </>,
  );

export const IconArrowLeft = (p: IconProps) => svg(p, <path d="M11 3L5 8l6 5z" fill="currentColor" />);
export const IconArrowRight = (p: IconProps) => svg(p, <path d="M5 3l6 5-6 5z" fill="currentColor" />);

export const IconPlay = (p: IconProps) => svg(p, <path d="M4 2l8 6-8 6z" fill="currentColor" />);
export const IconPause = (p: IconProps) =>
  svg(
    p,
    <>
      <rect x="4" y="2" width="3" height="12" fill="currentColor" />
      <rect x="9" y="2" width="3" height="12" fill="currentColor" />
    </>,
  );

export const IconClose = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M3 3l10 10" />
      <path d="M13 3L3 13" />
    </>,
  );

export const IconStar = (p: IconProps) =>
  svg({ ...p, fill: "currentColor" }, <path d="M8 1l2 5h5l-4 3 1.5 5L8 11l-4.5 3L5 9 1 6h5z" />);

export const IconTrophy = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <path d="M4 2h8v3c0 2-1.5 4-4 4s-4-2-4-4z" />
      <path d="M4 3H2v1c0 1.5 1 2 2 2" fill="none" />
      <path d="M12 3h2v1c0 1.5-1 2-2 2" fill="none" />
      <rect x="6" y="9" width="4" height="3" />
      <rect x="4" y="12" width="8" height="2" />
    </>,
  );

export const IconLock = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <rect x="3" y="7" width="10" height="7" />
      <path d="M5 7V4c0-1.5 1.5-3 3-3s3 1.5 3 3v3" fill="none" />
    </>,
  );

export const IconDownload = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M8 2v9" />
      <path d="M4 8l4 4 4-4" fill="currentColor" />
      <path d="M2 14h12" />
    </>,
  );

export const IconCopy = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <rect x="5" y="5" width="9" height="9" />
      <rect x="2" y="2" width="9" height="9" fill="#000" stroke="currentColor" />
    </>,
  );

export const IconShare = (p: IconProps) =>
  svg(
    p,
    <>
      <circle cx="4" cy="8" r="2" fill="currentColor" />
      <circle cx="12" cy="3" r="2" fill="currentColor" />
      <circle cx="12" cy="13" r="2" fill="currentColor" />
      <path d="M5.5 7l5-3" />
      <path d="M5.5 9l5 3" />
    </>,
  );

export const IconSound = (p: IconProps) =>
  svg(
    { ...p, fill: "currentColor" },
    <>
      <path d="M2 6h3l4-3v10L5 10H2z" />
      <path d="M11 5c1 1 1 5 0 6" fill="none" />
      <path d="M13 3c2 2 2 8 0 10" fill="none" />
    </>,
  );

export const IconSoundOff = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M2 6h3l4-3v10L5 10H2z" fill="currentColor" />
      <path d="M11 5c1 1 1 5 0 6" fill="currentColor" />
      <path d="M2 2l12 12" />
    </>,
  );

export const IconBust = (p: IconProps) =>
  svg(
    p,
    <>
      <path d="M3 4l5 5 5-5 2 2-5 5 5 5-2 2-5-5-5 5-2-2 5-5-5-5z" fill="currentColor" />
    </>,
  );
