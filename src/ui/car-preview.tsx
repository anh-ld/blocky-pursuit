import { type ICarSkin } from "../entities/car-skins";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

// Relative luminance — used to pick readable text color over the body paint.
function isLight(color: number): boolean {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55;
}

/**
 * Color-tone "paint chip" preview for a car skin.
 *
 * The previous SVG silhouette read as a generic blob — without real brand
 * assets we can't make a Ferrari actually look like a Ferrari. Instead we
 * show each car as its livery: dominant body paint, accent + cabin stripes,
 * and the brand name prominent so players identify by brand + color.
 *
 * Shared by Pre-Game and Garage so we don't maintain two thumbnail renderers.
 */
export function CarPreview({ skin }: { skin: ICarSkin }) {
  const body = hex(skin.bodyColor);
  const cabin = hex(skin.cabinColor);
  const accent = hex(skin.accentColor);
  const textColor = isLight(skin.bodyColor) ? "#0a0a0a" : "#ffffff";
  const subColor = isLight(skin.bodyColor) ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";

  return (
    <div
      class="relative w-full h-16 flex flex-col items-center justify-center overflow-hidden border border-whitef"
      style={{ background: body }}
    >
      {/* Diagonal accent stripe */}
      <div
        class="absolute inset-y-0 left-0 w-3"
        style={{ background: accent }}
      />
      {/* Cabin tone stripe on the right */}
      <div
        class="absolute inset-y-0 right-0 w-3"
        style={{ background: cabin }}
      />
      <div
        class="text-[10px] font-extrabold uppercase tracking-widest leading-none"
        style={{ color: textColor }}
      >
        {skin.brand}
      </div>
      <div
        class="text-[8px] font-bold uppercase tracking-wider mt-1 leading-none"
        style={{ color: subColor }}
      >
        {skin.name.replace(skin.brand, "").trim() || "—"}
      </div>
    </div>
  );
}
