import { attemptAsync } from "es-toolkit";
import { useEffect, useState } from "preact/hooks";
import {
  score,
  bestScore,
  isNewBest,
  survivalTime,
  level,
  gameOverReason,
  actions,
  playerName,
  runDrowned,
  runTopSpeed,
  runBiggestCombo,
  runDistance,
  runTileScore,
  runComboScore,
  runCopScore,
  selectedSkin,
  gameState,
  screen,
} from "../state";
import { haptics } from "../audio/haptics";
import {
  downloadShareCard,
  copyShareCardToClipboard,
  buildShareCardDataUrl,
  type IShareCardData,
} from "../systems/share-card";
import { wreckScreenshot } from "../state";
import { IconStar, IconCopy, IconDownload, IconShare, IconSkull, IconWater, IconBust } from "./icons";

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}.${ms.toString().padStart(2, "0")}s`;
}

function useCountUp(target: number, duration: number): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - k, 3);
      setValue(target * eased);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function buildShareData(): IShareCardData {
  return {
    score: Math.floor(score.value),
    best: bestScore.value,
    isNewBest: isNewBest.value,
    reason: gameOverReason.value,
    survivalSec: survivalTime.value,
    drowned: runDrowned.value,
    biggestCombo: runBiggestCombo.value,
    topSpeed: runTopSpeed.value,
    distance: runDistance.value,
    level: level.value,
    playerName: playerName.value,
    skinId: selectedSkin.value,
    screenshot: wreckScreenshot.value,
  };
}

async function shareRun() {
  const text = `I scored ${Math.floor(score.value)} in Blocky Pursuit — survived ${formatTime(survivalTime.value)} with a x${runBiggestCombo.value} combo as ${playerName.value}. Can you beat me?`;
  const url = window.location.href;
  await attemptAsync(async () => {
    if (navigator.share) {
      await navigator.share({ title: "Blocky Pursuit", text, url });
    } else {
      await navigator.clipboard.writeText(`${text} ${url}`);
    }
  });
}

const REASON_TEXT: Record<string, { label: string; icon: preact.ComponentChildren; tint: string }> = {
  BUSTED: { label: "BUSTED", icon: <IconBust size={18} />, tint: "var(--red)" },
  WRECKED: { label: "WRECKED", icon: <IconSkull size={18} />, tint: "var(--red)" },
  DROWNED: { label: "DROWNED", icon: <IconWater size={18} />, tint: "var(--cyan)" },
};

export function GameOver() {
  const reason = gameOverReason.value;
  const reasonInfo = REASON_TEXT[reason] ?? REASON_TEXT.BUSTED;
  const tile = Math.floor(runTileScore.value);
  const cmb = Math.floor(runComboScore.value);
  const cop = Math.floor(runCopScore.value);
  const animatedScore = useCountUp(score.value, 800);
  const [cardBusy, setCardBusy] = useState(false);
  const [cardStatus, setCardStatus] = useState<"" | "copied" | "saved" | "error">("");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    buildShareCardDataUrl(buildShareData())
      .then((url) => {
        if (!cancelled) setPreviewUrl(url);
      })
      .catch((err) => {
        console.warn("[game-over] preview build failed", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  const handleRetry = () => {
    haptics.pickup();
    actions.startGame();
  };
  const handleBack = () => {
    gameState.value = "start";
    screen.value = "howToPlay";
  };
  const flashStatus = (s: typeof cardStatus) => {
    setCardStatus(s);
    setTimeout(() => setCardStatus(""), 1600);
  };
  const handleDownloadCard = async () => {
    if (cardBusy) return;
    setCardBusy(true);
    const [err] = await attemptAsync(() => downloadShareCard(buildShareData()));
    setCardBusy(false);
    flashStatus(err ? "error" : "saved");
  };
  const handleCopyCard = async () => {
    if (cardBusy) return;
    setCardBusy(true);
    const [err, ok] = await attemptAsync(() => copyShareCardToClipboard(buildShareData()));
    setCardBusy(false);
    if (err || !ok) {
      await attemptAsync(() => downloadShareCard(buildShareData()));
      flashStatus("saved");
    } else {
      flashStatus("copied");
    }
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="w-full h-full md:h-auto md:max-h-[90vh] md:w-[640px] md:max-w-[92vw] bg-[var(--bg-1)] pointer-events-auto flex flex-col animate-game-over-in overflow-y-auto">
        {/* Hero — reason + score */}
        <div class="px-6 pt-6 pb-5 border-b-2 border-[var(--line)] flex flex-col items-center gap-2">
          <div
            class="inline-flex items-center gap-2 px-3 py-1.5 font-pixel text-[10px] leading-none"
            style={{ background: reasonInfo.tint, color: "#000" }}
          >
            {reasonInfo.icon}
            <span>{reasonInfo.label}</span>
          </div>
          {isNewBest.value && (
            <div class="font-pixel text-[var(--amber)] text-[9px] tracking-wider animate-pulse flex items-center gap-1">
              <IconStar size={10} />
              NEW BEST
              <IconStar size={10} />
            </div>
          )}
          <div
            class="font-pixel text-[var(--amber)] text-4xl sm:text-5xl tabular-nums leading-none"
            style={{ textShadow: "4px 4px 0 #000" }}
          >
            {Math.floor(animatedScore).toLocaleString()}
          </div>
          <div class="font-mono-ui text-[10px] text-[var(--text-mute)] uppercase tracking-widest">
            {playerName.value} · {formatTime(survivalTime.value)} · LV {level.value}
          </div>
        </div>

        {/* Share card preview */}
        {previewUrl && (
          <div class="px-5 py-4 border-b-2 border-[var(--line)] flex flex-col gap-2">
            <span class="font-mono-ui text-[9px] text-[var(--text-mute)] uppercase tracking-widest">
              Share card
            </span>
            <div class="border-2 border-[var(--line-2)]">
              <img
                src={previewUrl}
                alt="Run summary card"
                class="block w-full h-auto"
                style={{ aspectRatio: "1200 / 630" }}
              />
            </div>
            <div class="flex gap-2">
              <button
                onClick={handleCopyCard}
                disabled={cardBusy}
                class="arcade-btn arcade-btn-sm flex-1"
              >
                <IconCopy size={12} />
                {cardStatus === "copied" ? "Copied" : "Copy"}
              </button>
              <button
                onClick={handleDownloadCard}
                disabled={cardBusy}
                class="arcade-btn arcade-btn-sm flex-1"
              >
                <IconDownload size={12} />
                {cardStatus === "saved" ? "Saved" : "Save"}
              </button>
            </div>
          </div>
        )}

        {/* Run stats — 3 column row */}
        <div class="px-5 py-3 border-b-2 border-[var(--line)] grid grid-cols-4 gap-1 text-center">
          <Stat label="Best" value={bestScore.value.toLocaleString()} tint="var(--amber)" />
          <Stat label="Drowned" value={String(runDrowned.value)} tint="var(--cyan)" />
          <Stat label="Combo" value={`x${runBiggestCombo.value}`} tint="var(--pink)" />
          <Stat label="Distance" value={`${Math.round(runDistance.value)}m`} />
        </div>

        {/* Score breakdown — how the total was earned */}
        <div class="px-5 py-3 flex flex-col gap-1">
          <span class="font-mono-ui text-[9px] text-[var(--text-mute)] uppercase tracking-widest mb-1">
            Score breakdown
          </span>
          <Bar label="Tile" value={tile} total={Math.max(1, tile + cmb + cop)} tint="var(--amber)" />
          <Bar label="Combo" value={cmb} total={Math.max(1, tile + cmb + cop)} tint="var(--pink)" />
          <Bar label="Cops" value={cop} total={Math.max(1, tile + cmb + cop)} tint="var(--cyan)" />
        </div>

        {/* CTAs */}
        <div class="px-5 py-4 mt-auto flex flex-col gap-2 border-t-2 border-[var(--line)]">
          <button onClick={handleRetry} class="arcade-btn w-full">
            Retry
          </button>
          <div class="flex gap-2">
            <button onClick={shareRun} class="arcade-btn arcade-btn-cyan flex-1">
              <IconShare size={12} />
              Share text
            </button>
            <button onClick={handleBack} class="arcade-btn arcade-btn-ghost flex-1">
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: string }) {
  return (
    <div class="flex flex-col items-center gap-1">
      <span class="font-mono-ui text-[8px] text-[var(--text-mute)] uppercase tracking-widest">{label}</span>
      <span
        class={`font-pixel text-xs tabular-nums leading-none ${tint ? "" : "text-[var(--text)]"}`}
        style={tint ? { color: tint } : undefined}
      >
        {value}
      </span>
    </div>
  );
}

function Bar({ label, value, total, tint }: { label: string; value: number; total: number; tint: string }) {
  const pct = Math.round((value / total) * 100);
  return (
    <div class="flex items-center gap-2">
      <span class="font-mono-ui text-[9px] text-[var(--text-dim)] uppercase tracking-wider w-12 shrink-0">
        {label}
      </span>
      <div class="flex-1 h-2 bg-[var(--bg-3)]">
        <div class="h-full" style={{ width: `${pct}%`, background: tint }} />
      </div>
      <span class="font-mono-ui text-[9px] text-[var(--text)] font-bold tabular-nums w-12 text-right">
        {value.toLocaleString()}
      </span>
    </div>
  );
}
