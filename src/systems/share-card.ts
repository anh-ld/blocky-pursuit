// Game-over share card. Renders a 1200x630 PNG (Twitter / OG image ratio)
// summarizing a finished run, then exposes Download / Copy / Share helpers
// the game-over panel can wire to plain buttons.
//
// Pure 2D Canvas — no game scene access — so it's fully testable in
// isolation and works headlessly. The card is drawn once on demand and
// returned as a Blob; callers decide what to do with it.

import { getSkin } from "../entities/car-skins";

export type IShareCardData = {
  score: number;
  best: number;
  isNewBest: boolean;
  reason: string;
  survivalSec: number;
  drowned: number;
  biggestCombo: number;
  topSpeed: number;
  distance: number;
  level: number;
  playerName: string;
  skinId: string;
  /** Optional wreck-moment screenshot data URL captured from the game canvas. */
  screenshot?: string | null;
};

const W = 1200;
const H = 630;

// Palette — pulled from the in-game amber/cyan scheme so the card reads as
// an extension of the HUD, not a generic export. Avoids the dark blue
// (#023047) the user has banned for this project.
const COLORS = {
  bgTop: "#0b0d12",
  bgBottom: "#1a1f2e",
  panel: "rgba(0,0,0,0.55)",
  border: "#3a3f4e",
  amber: "#fbbf24",
  amberDim: "#fcd34d",
  cyan: "#22d3ee",
  pink: "#f472b6",
  white: "#f3f4f6",
  gray: "#9ca3af",
  grayDim: "#6b7280",
  red: "#f87171",
  green: "#86efac",
  goldGlow: "rgba(251,191,36,0.15)",
};

function fmtTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const r = s % 60;
  if (m > 0) return `${m}:${r.toString().padStart(2, "0")}`;
  return `${s}.${Math.floor((seconds % 1) * 10)}s`;
}

function fmtNumber(n: number): string {
  return Math.floor(n).toLocaleString();
}

function drawProceduralBackground(ctx: CanvasRenderingContext2D) {
  // Fallback when no screenshot was captured. Subtle gradient + voxel grid
  // so the card never ships looking like a flat color block.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, COLORS.bgTop);
  grad.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  ctx.strokeStyle = "rgba(255,255,255,0.025)";
  ctx.lineWidth = 1;
  const tile = 30;
  for (let x = 0; x <= W; x += tile) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  for (let y = 0; y <= H; y += tile) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
}

/**
 * Draw the captured wreck screenshot as a full-bleed background, then
 * apply a multi-stop gradient overlay so the text panels remain readable.
 * The screenshot is "cover" cropped (preserve aspect, fill the entire
 * card) so the wreck stays centered regardless of the source aspect ratio.
 */
async function drawScreenshotBackground(
  ctx: CanvasRenderingContext2D,
  dataUrl: string,
): Promise<void> {
  const img = await loadImage(dataUrl);
  // Cover-fit: scale up to whichever axis fills the card, center the rest.
  const scale = Math.max(W / img.width, H / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = (W - dw) / 2;
  const dy = (H - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);

  // Vignette: dark gradient from edges toward the center keeps the text
  // legible even on bright snowy/sunset weather screenshots.
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0.0)");
  vg.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Header darken band — top 130px is where the title + cause-of-death sit.
  const topGrad = ctx.createLinearGradient(0, 0, 0, 160);
  topGrad.addColorStop(0, "rgba(0,0,0,0.78)");
  topGrad.addColorStop(1, "rgba(0,0,0,0.0)");
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, W, 160);

  // Footer darken band — bottom 200px holds the score, stats and CTA.
  const botGrad = ctx.createLinearGradient(0, H - 280, 0, H);
  botGrad.addColorStop(0, "rgba(0,0,0,0.0)");
  botGrad.addColorStop(0.4, "rgba(0,0,0,0.55)");
  botGrad.addColorStop(1, "rgba(0,0,0,0.88)");
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, H - 280, W, 280);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

function drawTitle(ctx: CanvasRenderingContext2D) {
  // Brand stripe down the left edge
  ctx.fillStyle = COLORS.amber;
  ctx.fillRect(0, 0, 8, H);

  ctx.fillStyle = COLORS.amber;
  ctx.font = "900 26px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  ctx.fillText("BLOCKY PURSUIT", 40, 38);

  ctx.fillStyle = COLORS.gray;
  ctx.font = "700 12px system-ui, -apple-system, sans-serif";
  ctx.fillText("RUN SUMMARY", 40, 70);
}

function drawReason(ctx: CanvasRenderingContext2D, reason: string) {
  // Cause of death — top-right red badge with a hairline frame so it
  // reads against any screenshot background.
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  const label = reason.toUpperCase();
  ctx.font = "900 22px system-ui, -apple-system, sans-serif";
  const tw = ctx.measureText(label).width;
  const padX = 14;
  const x = W - 40 - tw - padX * 2;
  const y = 36;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(x, y, tw + padX * 2, 38);
  ctx.strokeStyle = COLORS.red;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, tw + padX * 2 - 2, 36);
  ctx.fillStyle = COLORS.red;
  ctx.fillText(label, W - 40 - padX, y + 6);
  ctx.textAlign = "left";
}

function drawScore(ctx: CanvasRenderingContext2D, data: IShareCardData) {
  const cx = W / 2;

  ctx.fillStyle = COLORS.gray;
  ctx.font = "700 14px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "center";
  ctx.fillText("FINAL SCORE", cx, 366);

  // The score number — biggest single element on the card so it carries
  // the thumbnail. Outline + fill keeps it readable on any background.
  const scoreText = fmtNumber(data.score);
  ctx.font = "900 110px system-ui, -apple-system, sans-serif";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(0,0,0,0.8)";
  ctx.strokeText(scoreText, cx, 386);
  ctx.fillStyle = COLORS.amber;
  ctx.fillText(scoreText, cx, 386);

  if (data.isNewBest) {
    ctx.fillStyle = COLORS.amberDim;
    ctx.font = "900 18px system-ui, -apple-system, sans-serif";
    ctx.fillText("★  NEW PERSONAL BEST  ★", cx, 498);
  } else {
    ctx.fillStyle = COLORS.gray;
    ctx.font = "700 13px system-ui, -apple-system, sans-serif";
    ctx.fillText(`BEST  ${fmtNumber(data.best)}`, cx, 502);
  }

  ctx.textAlign = "left";
}

function drawStats(ctx: CanvasRenderingContext2D, data: IShareCardData) {
  // Single-line stats strip just under the score. Each stat is rendered
  // inline so the row stays compact and centered — fits within the dark
  // bottom band over the screenshot.
  const stats: { label: string; value: string; color: string }[] = [
    { label: "TIME", value: fmtTime(data.survivalSec), color: COLORS.white },
    { label: "DROWNED", value: String(data.drowned), color: COLORS.cyan },
    { label: "BEST COMBO", value: `x${data.biggestCombo}`, color: COLORS.pink },
    { label: "DISTANCE", value: `${Math.round(data.distance)}m`, color: COLORS.amberDim },
  ];

  ctx.textBaseline = "top";
  // Measure first so the row can be centered as a unit.
  const valueFont = "900 22px system-ui, -apple-system, sans-serif";
  const labelFont = "700 11px system-ui, -apple-system, sans-serif";
  const gap = 50;
  let totalW = 0;
  ctx.font = valueFont;
  const widths = stats.map((s) => {
    const vw = ctx.measureText(s.value).width;
    ctx.font = labelFont;
    const lw = ctx.measureText(s.label).width;
    ctx.font = valueFont;
    return Math.max(vw, lw);
  });
  totalW = widths.reduce((a, b) => a + b, 0) + gap * (stats.length - 1);

  let x = (W - totalW) / 2;
  const y = 530;
  for (let i = 0; i < stats.length; i++) {
    const s = stats[i];
    const w = widths[i];
    ctx.textAlign = "center";
    ctx.font = labelFont;
    ctx.fillStyle = COLORS.grayDim;
    ctx.fillText(s.label, x + w / 2, y);
    ctx.font = valueFont;
    ctx.fillStyle = s.color;
    ctx.fillText(s.value, x + w / 2, y + 16);
    x += w + gap;
  }
  ctx.textAlign = "left";
}

function drawFooter(ctx: CanvasRenderingContext2D, data: IShareCardData) {
  // Player avatar swatch (colored square — keeps the card asset-free)
  const skin = getSkin(data.skinId);
  const swatch = "#" + skin.bodyColor.toString(16).padStart(6, "0");
  ctx.fillStyle = swatch;
  ctx.fillRect(40, 588, 26, 26);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 2;
  ctx.strokeRect(41, 589, 24, 24);

  ctx.fillStyle = COLORS.white;
  ctx.font = "900 14px system-ui, -apple-system, sans-serif";
  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  const name = data.playerName || "Anonymous";
  ctx.fillText(name, 76, 590);

  ctx.fillStyle = COLORS.grayDim;
  ctx.font = "700 11px system-ui, -apple-system, sans-serif";
  ctx.fillText(`${skin.name}  ·  LV ${data.level}`, 76, 606);

  // Right-side CTA + URL.
  ctx.textAlign = "right";
  ctx.fillStyle = COLORS.amber;
  ctx.font = "900 14px system-ui, -apple-system, sans-serif";
  ctx.fillText("CAN YOU BEAT THIS?", W - 40, 590);
  ctx.fillStyle = COLORS.grayDim;
  ctx.font = "700 11px system-ui, -apple-system, sans-serif";
  let host = "blockypursuit.com";
  if (typeof window !== "undefined") {
    host = window.location.host || host;
  }
  ctx.fillText(host, W - 40, 606);
  ctx.textAlign = "left";
}

/**
 * Render the share card to a fresh `<canvas>` and return it. Caller can
 * then either grab a data URL for a preview <img> or convert to a Blob.
 * Splitting render-to-canvas from canvas-to-blob keeps preview rendering
 * synchronous from the caller's perspective.
 */
export async function renderShareCardToCanvas(data: IShareCardData): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("share-card: 2d context unavailable");

  // Background — screenshot if we have one, fallback gradient otherwise.
  if (data.screenshot) {
    try {
      await drawScreenshotBackground(ctx, data.screenshot);
    } catch (err) {
      console.warn("[share-card] screenshot draw failed, using procedural", err);
      drawProceduralBackground(ctx);
    }
  } else {
    drawProceduralBackground(ctx);
  }

  drawTitle(ctx);
  drawReason(ctx, data.reason);
  drawScore(ctx, data);
  drawStats(ctx, data);
  drawFooter(ctx, data);
  return canvas;
}

/**
 * Build the share card and resolve to a PNG Blob. Allocates a fresh canvas
 * each call so it's GC'd as soon as the Blob is consumed.
 */
export async function buildShareCard(data: IShareCardData): Promise<Blob> {
  const canvas = await renderShareCardToCanvas(data);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("share-card: toBlob returned null"));
    }, "image/png");
  });
}

/** Render the share card and return a data URL — used for in-modal preview. */
export async function buildShareCardDataUrl(data: IShareCardData): Promise<string> {
  const canvas = await renderShareCardToCanvas(data);
  return canvas.toDataURL("image/png");
}

/** Trigger a browser download of the rendered share card. */
export async function downloadShareCard(data: IShareCardData): Promise<void> {
  const blob = await buildShareCard(data);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `blocky-pursuit-${Math.floor(data.score)}.png`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Defer revoke so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Copy the share card image to the clipboard. Falls back gracefully if the
 * Clipboard API doesn't support image MIME types — caller can chain a
 * download as a backup.
 */
export async function copyShareCardToClipboard(data: IShareCardData): Promise<boolean> {
  if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) {
    return false;
  }
  try {
    const blob = await buildShareCard(data);
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    return true;
  } catch (err) {
    console.error("[share-card] copy failed", err);
    return false;
  }
}
