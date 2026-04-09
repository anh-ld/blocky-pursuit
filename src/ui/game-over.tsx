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

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}.${ms.toString().padStart(2, "0")}s`;
}

/**
 * Animate a numeric value from 0 → target over `duration` ms with an
 * ease-out cubic curve. Used for the game-over score reveal so the panel
 * lands like a payoff instead of a static dump of numbers.
 */
function useCountUp(target: number, duration: number): number {
  // Initial state is 0 (not target) so the very first render of the panel
  // shows the count starting from zero — otherwise there's a 1-frame flash
  // of the final score before the effect resets it.
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

export function GameOver() {
  const reason = gameOverReason.value;
  const reasonText: Record<string, string> = {
    BUSTED: "BUSTED",
    WRECKED: "WRECKED",
    DROWNED: "DROWNED",
  };
  const tile = Math.floor(runTileScore.value);
  const cmb = Math.floor(runComboScore.value);
  const cop = Math.floor(runCopScore.value);
  // Animated score reveal — counts from 0 to the final score over ~800ms.
  // The hook reads `score.value` once at mount; signal changes after the
  // panel appears would re-trigger the effect, but the run is over so the
  // value stays stable.
  const animatedScore = useCountUp(score.value, 800);
  // Card-action transient state. `cardStatus` flips to "copied" or "saved"
  // for ~1.6s after a successful card action so the button shows a brief
  // confirmation instead of silently completing.
  const [cardBusy, setCardBusy] = useState(false);
  const [cardStatus, setCardStatus] = useState<"" | "copied" | "saved" | "error">("");
  // Preview data URL of the rendered share card. Built once on mount so
  // the player sees exactly what will be copied/downloaded before they
  // click. Uses the same screenshot capture as the export path.
  const [previewUrl, setPreviewUrl] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    buildShareCardDataUrl(buildShareData()).then((url) => {
      if (!cancelled) setPreviewUrl(url);
    }).catch((err) => {
      console.warn("[game-over] preview build failed", err);
    });
    return () => { cancelled = true; };
    // Mount-only build — the underlying signals are stable for the panel's
    // lifetime so a fresh effect on every render would just thrash.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // Fallback: trigger a download so the player still walks away with
      // the card. Browsers without ClipboardItem (older Firefox/Safari)
      // hit this path silently.
      await attemptAsync(() => downloadShareCard(buildShareData()));
      flashStatus("saved");
    } else {
      flashStatus("copied");
    }
  };

  return (
    <div class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div class="bg-black/60 md:bg-black px-4 py-5 w-full h-full md:w-160 md:h-auto md:max-h-[90vh] overflow-y-auto pointer-events-auto flex flex-col items-center gap-3 animate-game-over-in">
        <div class="text-red-400 text-xs font-extrabold uppercase tracking-[0.3em]">
          {reasonText[reason] || reason}
        </div>
        {isNewBest.value && (
          <div class="text-amber-300 text-[11px] font-extrabold uppercase tracking-widest animate-pulse">
            ★ NEW BEST ★
          </div>
        )}
        <div class="text-amber-400 text-5xl font-extrabold tabular-nums leading-none">
          {Math.floor(animatedScore).toLocaleString()}
        </div>
        {/* Share card preview — exactly what gets copied/downloaded. The
            wreck-moment screenshot is rendered as the hero so the player
            sees the cinematic frame from their own death. Aspect ratio
            matches the underlying canvas (1200x630 ≈ 1.9:1). The Copy /
            Download buttons sit immediately under the preview so the
            "see this image → save it" relationship is visually obvious. */}
        {previewUrl && (
          <div class="w-full mt-1 flex flex-col gap-2">
            <div class="border border-gray-700/60">
              <img
                src={previewUrl}
                alt="Run summary card"
                class="block w-full h-auto"
                style={{ aspectRatio: "1200 / 630" }}
              />
            </div>
            <div class="flex gap-2 w-full">
              <button
                onClick={handleCopyCard}
                disabled={cardBusy}
                class="flex-1 py-2 bg-amber-500/15 text-amber-300 text-[11px] font-extrabold uppercase tracking-wider border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 disabled:opacity-60 disabled:cursor-wait"
              >
                {cardStatus === "copied" ? "✓ Copied" : "Copy Card"}
              </button>
              <button
                onClick={handleDownloadCard}
                disabled={cardBusy}
                class="flex-1 py-2 bg-amber-500/15 text-amber-300 text-[11px] font-extrabold uppercase tracking-wider border border-amber-500/30 cursor-pointer hover:bg-amber-500/25 disabled:opacity-60 disabled:cursor-wait"
              >
                {cardStatus === "saved" ? "✓ Saved" : "Download"}
              </button>
            </div>
          </div>
        )}
        <div class="flex items-center gap-4 text-[10px] uppercase tracking-widest text-gray-400">
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Best</span>
            <span class="text-amber-300 font-extrabold tabular-nums">
              {bestScore.value.toLocaleString()}
            </span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Time</span>
            <span class="text-gray-200 font-extrabold tabular-nums">
              {formatTime(survivalTime.value)}
            </span>
          </div>
          <div class="flex flex-col items-center">
            <span class="text-gray-500">Level</span>
            <span class="text-orange-400 font-extrabold tabular-nums">{level.value}</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px] uppercase tracking-widest text-gray-400 w-full mt-1 pt-2 border-t border-gray-700/60">
          <div class="flex justify-between">
            <span class="text-gray-500">Drowned</span>
            <span class="text-cyan-300 font-extrabold tabular-nums">{runDrowned.value}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Best Combo</span>
            <span class="text-pink-400 font-extrabold tabular-nums">x{runBiggestCombo.value}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Top Speed</span>
            <span class="text-amber-300 font-extrabold tabular-nums">{Math.round(runTopSpeed.value)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Distance</span>
            <span class="text-gray-200 font-extrabold tabular-nums">{Math.round(runDistance.value)}m</span>
          </div>
        </div>
        {/* Score breakdown — shows the player *how* they earned the total */}
        <div class="w-full pt-2 border-t border-gray-700/60 flex flex-col gap-0.5 text-[10px] uppercase tracking-widest">
          <div class="flex justify-between">
            <span class="text-gray-500">Tile</span>
            <span class="text-amber-300 font-extrabold tabular-nums">{tile.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Combo</span>
            <span class="text-pink-400 font-extrabold tabular-nums">{cmb.toLocaleString()}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-500">Cops</span>
            <span class="text-cyan-300 font-extrabold tabular-nums">{cop.toLocaleString()}</span>
          </div>
        </div>
        <div class="mt-auto md:mt-2 flex flex-col gap-2 w-full">
          <button
            onClick={handleRetry}
            class="w-full py-2 bg-amber-400 text-gray-900 text-xs font-extrabold uppercase tracking-widest cursor-pointer hover:bg-amber-300 active:translate-y-0.5"
          >
            RETRY
          </button>
          <button
            onClick={shareRun}
            class="w-full py-2 bg-cyan-500/20 text-cyan-300 text-xs font-bold uppercase tracking-wider border border-cyan-500/30 cursor-pointer hover:bg-cyan-500/30"
          >
            Share Text
          </button>
          <button
            onClick={handleBack}
            class="w-full py-2 bg-gray-700 text-gray-300 text-xs font-extrabold uppercase tracking-wider hover:bg-gray-600 cursor-pointer"
          >
            Back
          </button>
        </div>
      </div>
    </div>
  );
}
