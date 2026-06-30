import { type ICarSkin } from "../entities/car-skins";

const hex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

/* Relative luminance — picks black or white text for AA contrast over the body paint. */
function isLight(color: number): boolean {
  const r = ((color >> 16) & 0xff) / 255;
  const g = ((color >> 8) & 0xff) / 255;
  const b = (color & 0xff) / 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 0.55;
}

export function CarPreview({ skin, className = "" }: { skin: ICarSkin; className?: string }) {
  const body = hex(skin.bodyColor);
  const cabin = hex(skin.cabinColor);
  const accent = hex(skin.accentColor);
  const textColor = isLight(skin.bodyColor) ? "#0a0a0a" : "#ffffff";
  const subColor = isLight(skin.bodyColor) ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";

  return (
    <div
      class={`relative w-full h-full min-h-12 flex flex-col items-center justify-center overflow-hidden ${className}`}
      style={{ background: body }}
    >
      <div class="absolute inset-y-0 left-0 w-2" style={{ background: accent }} />
      <div class="absolute inset-y-0 right-0 w-2" style={{ background: cabin }} />
      <span
        class="font-pixel text-[10px] leading-none truncate max-w-full px-3 text-center"
        style={{ color: textColor, textShadow: "1px 1px 0 rgba(0,0,0,0.35)" }}
      >
        {skin.brand}
      </span>
      <span
        class="font-mono-ui text-[8px] font-bold uppercase tracking-wider leading-none mt-1 truncate max-w-full px-3 text-center"
        style={{ color: subColor }}
      >
        {skin.name.replace(skin.brand, "").trim() || "—"}
      </span>
    </div>
  );
}
