import "virtual:uno.css";
import { render, h } from "preact";
import * as CANNON from "cannon-es";
import { updateCopLights } from "./entities/cop";
import { isRoad } from "./world/city-generator";
import { isWater, TILE_SIZE } from "./world/terrain";
import { bootstrap, BASE_CAMERA_D, WRECK_CAMERA_D } from "./bootstrap";
import { RunState, COMBO_DECAY } from "./systems/run-state";
import { CopSystem } from "./systems/cop-system";
import { CivilianSystem } from "./systems/civilian-system";
import { PickupSystem } from "./systems/pickup-system";
import {
  initAudio,
  resumeAudio,
  startEngine,
  stopEngine,
  setEngineSpeed,
  startSiren,
  stopSiren,
  setSirenVolume,
  startRadioHiss,
  stopRadioHiss,
  playSplash,
  playLevelUp,
  playGameOver,
  toggleMute,
  isMuted,
  startBgm,
  stopBgm,
  setBgmDuck,
  playComboTick,
  playComboLost,
  playMilestone,
  playEscape,
  playHeartbeat,
} from "./audio/sound";
import { haptics } from "./audio/haptics";
import {
  applyShake,
  spawnSplash,
  spawnSparks,
  spawnConfetti,
  spawnSpeedLine,
  clearParticles,
  clearEffects,
  updateEffects,
  updateTimeSlow,
  getTimeSlowFactor,
  triggerScreenFlash,
  triggerShake,
} from "./world/effects";
import { spawnPopup, updatePopups, clearPopups } from "./world/popups";
import { pushChatter, clearChatter } from "./world/radio";
import { preloadRadioVoices, stopRadioVoice } from "./world/radio-voice";
import { spawnSkid, updateSkids, clearSkids } from "./world/skids";
import {
  captureGhost,
  updateGhostTrail,
  clearGhostTrail,
} from "./world/ghost-trail";
import { updateRain, updateSnow } from "./world/weather";
import { App } from "./ui/app";
import {
  gameState,
  gameOverReason,
  screen,
  playerName,
  canInstallPwa,
  setActions,
  saveBest,
  isNewBest,
  runDrowned,
  runTopSpeed,
  runBiggestCombo,
  runDistance,
  runTileScore,
  runComboScore,
  runCopScore,
  wreckScreenshot,
  selectedSkin,
  setSelectedSkin,
  incrementRuns,
  addDrownedCops,
  audioMuted,
  weather,
  leaderboardEntries,
  type IGameStateValue,
} from "./state";
import {
  fetchLeaderboard,
  submitScore,
  getPlayerName,
  uploadRecording,
} from "./api";
import { attempt, attemptAsync } from "es-toolkit";
import {
  startRecording,
  stopRecording,
  getSessionId,
  discardRecording,
} from "./systems/screen-recorder";
import {
  MAX_HP,
  HP_REGEN_PER_SEC,
  HP_REGEN_SAFE_DIST,
  HP_HEAL_ON_LEVEL_UP,
  HP_HEAL_SPEED_STREAK,
  BUSTED_TIME_THRESHOLD,
  BUSTED_COP_COUNT,
  BUSTED_STOPPED_SPEED,
  SPEED_STREAK_THRESHOLD,
  SPEED_STREAK_MIN_RATIO,
  SIREN_MAX_RANGE,
  DEATH_MOMENT_MS,
  SCORE_MILESTONES,
  ESCAPE_DIST,
  ESCAPE_TIME,
  ESCAPE_REWARD,
  ESCAPE_HEAL,
  LOW_HP_THRESHOLD,
} from "./constants";

// --- Mount Preact UI first so #game-area exists for the canvas ---
const appRoot = document.getElementById("app") as HTMLElement;
render(h(App, null), appRoot);

// --- Player name ---
// Vibe Jam continuity: a portal arrival can carry `?username=` from the
// previous game. Honor it so the player keeps their identity across the
// webring instead of being silently renamed to whatever we had stored.
const _incomingPortalName = new URLSearchParams(window.location.search).get("username");
playerName.value = _incomingPortalName?.trim() || getPlayerName();

// --- PWA Install Prompt (mobile only) ---
type IBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
let deferredPrompt: IBeforeInstallPromptEvent | null = null;

// Single controller so all global listeners can be torn down together.
const listenerController = new AbortController();
const { signal: listenerSignal } = listenerController;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as IBeforeInstallPromptEvent;
  canInstallPwa.value = true;
}, { signal: listenerSignal });
if (window.matchMedia("(display-mode: standalone)").matches) {
  canInstallPwa.value = false;
}
async function installPwa() {
  if (!deferredPrompt) return;

  const p = deferredPrompt;
  deferredPrompt = null;

  const [err, result] = await attemptAsync(() => {
    p.prompt();
    return p.userChoice;
  });

  if (err) { console.error("[installPwa]", err); return; }
  if (result!.outcome === "accepted") canInstallPwa.value = false;
}

// --- Bootstrap: build the entire infrastructure (scene, camera, renderer,
// lighting, world, weather particles, city, car, portals) in one shot.
// All scene-level state lives behind `ctx` so main.ts can stay focused on
// game flow + the animate loop. Camera zoom mutations go through
// `ctx.setCameraD` instead of a top-level `let`.
const ctx = bootstrap({
  selectedSkinId: selectedSkin.value,
  initialWeather: weather.value,
  getPlayerName: () => playerName.value || "player",
  getSelectedSkinId: () => selectedSkin.value,
});
const {
  scene, camera, renderer, world,
  cityGenerator, car, portals,
} = ctx;

// `selectSkin` and `setWeather` actions: bootstrap handles the scene-side
// mutations; main writes the corresponding signal so persisted state stays
// in sync.
function selectSkin(skinId: string) {
  setSelectedSkin(skinId);
  ctx.selectSkin(skinId);
}
function setWeather(w: typeof weather.value) {
  weather.value = w;
  ctx.setWeather(w);
}

// --- Systems + run state ---
const systemsCtx = { scene, world };
const run = new RunState();
const cops = new CopSystem(systemsCtx);
const civilians = new CivilianSystem(systemsCtx);
const pickups = new PickupSystem(systemsCtx);

// --- Game state machine ---
//
// `currentState` is the loop's internal state. It's a strict superset of
// the public `IGameStateValue` — it adds `"dying"` for the cinematic
// slow-mo phase between a fail trigger and the panel reveal. The UI keeps
// reading the public `gameState.value` (which stays "playing" through
// dying so the HUD remains visible), but the game loop branches on this
// internal value so every gating decision is type-checked.
type ICurrentState = IGameStateValue | "dying";
let currentState: ICurrentState = "start";

// Per-frame scratch for the skid emitter — hoisted to avoid two Vec3
// allocations every frame the player is drifting or boosting.
const _rearLocal = new CANNON.Vec3(0, 0, 1.25);
const _rearWorld = new CANNON.Vec3();

// Combo lifeline tracking — set in tickPlaying, drives the warning tick
// audio cadence and the "you just lost it" sting on edge transitions.
let _prevComboCount = 0;
let _comboTickAccum = 0;
const COMBO_TICK_INTERVAL = 0.18; // seconds between warning ticks while in danger

// Low-HP heartbeat scheduler. Interval scales from 1.1s at HP=threshold
// down to 0.45s at HP=1 so the player feels the danger ramping up.
let _heartbeatAccum = 0;

// --- Death slow-mo ("dying" state) ---
// When the player triggers a fail condition, the run enters a brief
// cinematic slow-motion phase where physics + cops + the player car keep
// simulating but at ~12% real time. After the timer expires we capture a
// screenshot of the wreck moment, fire the explosion juice, and reveal the
// panel. The dying state is internal — `gameState.value` stays "playing"
// throughout so the HUD remains visible during the slow-mo sequence.
const DYING_DURATION_SEC = 1.0;
const DYING_TIMESCALE = 0.12;
let dyingTimer = 0;
let dyingReason: string | null = null;
// Set true on the frame the slow-mo expires; consumed AFTER the next render
// so we capture the actual frame the player saw before the explosion fires.
let pendingScreenshot = false;

function pauseGame() {
  if (currentState !== "playing") return;
  currentState = "paused";
  gameState.value = "paused";
  stopEngine();
  stopSiren();
  stopBgm();
  stopRadioHiss();
}

function resumeGame() {
  if (currentState !== "paused") return;
  currentState = "playing";
  gameState.value = "playing";
  // Avoid stale dt on resume
  lastCallTime = null;
  spawnTimersRebased = false;
  initAudio();
  resumeAudio();
  startEngine();
  startBgm();
  startRadioHiss();
}

function togglePause() {
  if (currentState === "playing") pauseGame();
  else if (currentState === "paused") resumeGame();
}

window.addEventListener("keydown", (e) => {
  attempt(() => {
    if (e.code !== "Space" && e.key !== " ") return;
    if (currentState === "playing") {
      e.preventDefault();
      pauseGame();
    } else if (currentState === "paused") {
      e.preventDefault();
      resumeGame();
    }
  });
}, { signal: listenerSignal });

// --- Window resize ---
// Bootstrap exposes `resizeRenderer` and `setCameraD` as the only ways to
// touch the camera frustum; main.ts registers the global listeners via
// the shared AbortController so they can be torn down with everything else.
const resizeRenderer = () => attempt(() => ctx.resizeRenderer());
window.addEventListener("resize", resizeRenderer, { signal: listenerSignal });
window.addEventListener("orientationchange", () => setTimeout(resizeRenderer, 100), { signal: listenerSignal });

function startGame() {
  currentState = "playing";
  gameState.value = "playing";
  screen.value = "none";
  isNewBest.value = false;

  // Discard any previous recording that didn't get uploaded.
  discardRecording();
  dyingSessionId = null;

  // Reset Player
  car.body.position.set(0, 1, 0);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  car.bounceBackTimer = 0;
  car.recoveryTimer = 0;
  car.setNitroMultiplier(1);
  car.setRandomDirection();

  // Reset all per-run state
  run.reset(car);

  // Camera teleport + reset wreck-zoom in case the previous run died.
  camera.position.set(50, 55, 50);
  ctx.setCameraD(BASE_CAMERA_D);

  // Reset systems
  cops.reset();
  civilians.reset();
  pickups.reset();

  run.syncHud();

  // First-frame after restart: avoid stale dt and rebase spawn timers
  lastCallTime = null;
  spawnTimersRebased = false;

  clearSkids();
  clearPopups();
  clearParticles();
  clearEffects();
  clearGhostTrail();
  clearChatter();
  // Reset death-sequence state so a fresh run starts cleanly even after
  // a previous run died mid slow-mo.
  dyingTimer = 0;
  dyingReason = null;
  pendingScreenshot = false;
  wreckScreenshot.value = null;
  _prevComboCount = 0;
  _comboTickAccum = 0;
  _heartbeatAccum = 0;
  // Opening radio call so the chatter feed has life from the first frame.
  pushChatter("start");

  // Audio: kick everything on
  initAudio();
  resumeAudio();
  startEngine();
  startBgm();
  startRadioHiss();

  // Start auto-recording the gameplay session.
  // 800 Kbps bitrate caps file size regardless of canvas resolution.
  // Recording is uploaded only if the score makes the leaderboard.
  startRecording(renderer.domElement).catch(() => {
    // Silently fail — recording is non-blocking
  });
  // Background-load all voice files so subsequent radio calls are
  // instantaneous. Idempotent — only fetches once across the app's life.
  void preloadRadioVoices();
}

// --- Recording helpers ---
// Session ID captured at gameOver time.
let dyingSessionId: string | null = null;

// Recordings are kept for any run that lands in the top 50 — bigger
// archive than the displayed top 10, but still small enough that the
// upload-on-gameover path stays cheap.
const QUALIFY_BOARD_SIZE = 50;

/**
 * Compute the upload qualification threshold from the cached
 * leaderboard signal. The leaderboard endpoint returns up to 50
 * entries; the 50th entry's score is the bar to beat. Returns 0
 * if fewer than 50 entries exist (room for anyone).
 */
function getQualificationThreshold(): number {
  const entries = leaderboardEntries.value;
  if (!entries || entries.length < QUALIFY_BOARD_SIZE) return 0;
  return entries[QUALIFY_BOARD_SIZE - 1]?.score ?? 0;
}

/**
 * Stop the current recording and upload it ONLY if the score qualifies
 * for the top-50 leaderboard. Client-side gate uses the cached
 * leaderboard so non-qualifying runs never even attempt the upload.
 */
async function handleRecordingUpload() {
  const sessionId = getSessionId(); // Capture BEFORE stopping (cleanup nulls it)
  const myScore = Math.floor(run.score);
  const threshold = getQualificationThreshold();

  console.log(
    `[recorder] gameOver score=${myScore} threshold=${threshold} sessionId=${sessionId ?? "(none)"}`,
  );

  if (!sessionId) {
    console.log("[recorder] No active session — recorder was never started (low-power skip?)");
    return null;
  }

  // Cheap client-side gate first — bail before paying the stop+blob cost.
  if (myScore <= threshold) {
    discardRecording();
    console.log(`[recorder] Score didn't qualify (bar: ${threshold}) — discarded`);
    return null;
  }

  const blob = await stopRecording();
  if (!blob) {
    console.log("[recorder] stopRecording returned null");
    return null;
  }
  console.log(`[recorder] Captured ${(blob.size / 1024).toFixed(0)} KB, uploading…`);

  const url = await uploadRecording(blob, sessionId, playerName.value, myScore);
  if (!url) {
    console.log("[recorder] Upload failed (see preceding log for reason)");
    return null;
  }
  console.log(`[recorder] Uploaded: ${url}`);
  return url;
}

function gameOver(reason: string = "BUSTED") {
  // Already dying or game over — ignore further fail triggers so a
  // busted/wreck/drown that fires during the slow-mo can't restart it.
  if (currentState === "gameover" || currentState === "dying") return;

  // Capture the recording session ID at death time so submitScoreWithRecording
  // can verify the pending URL belongs to THIS session (not a stale one).
  dyingSessionId = getSessionId();

  // Enter the cinematic dying phase. tickPlaying keeps running (animate
  // routes through it during "dying" too) so cops + physics simulate in
  // slow motion, but the death-trigger blocks inside tickPlaying short-
  // circuit on `currentState !== "playing"` so they don't spam effects.
  currentState = "dying";
  dyingReason = reason;
  dyingTimer = DYING_DURATION_SEC;

  // Audio: duck loops immediately so the slow-mo silence reads as cinematic.
  // The "wreck" sting will fire AFTER slow-mo, on the explosion frame.
  stopEngine();
  stopSiren();
  stopBgm();
  stopRadioHiss();
  stopRadioVoice();

  // Radio sign-off — dispatch announces the end of the chase based on cause.
  if (reason === "DROWNED") pushChatter("drowned_self");
  else if (reason === "BUSTED") pushChatter("busted");
  else pushChatter("wrecked");
}

/**
 * Second half of the death sequence — runs once the slow-mo dying phase
 * finishes. Triggers the explosion juice, persists progression, then
 * schedules the panel reveal. Always called from the animate loop, never
 * directly from a fail trigger.
 */
function finishGameOver(reason: string) {
  currentState = "gameover";
  gameOverReason.value = reason;

  // --- Explosion juice — bigger than a regular crash because this is the
  // end of the run and the player just sat through 1 second of cinematic
  // slow-mo. Multiple confetti + sparks bursts read as a real wreck.
  triggerScreenFlash(0.95);
  triggerShake(1.1);
  for (let i = 0; i < 3; i++) {
    const ox = (Math.random() - 0.5) * 4;
    const oz = (Math.random() - 0.5) * 4;
    spawnConfetti(car.body.position.x + ox, car.body.position.y + 1.5, car.body.position.z + oz);
    spawnSparks(car.body.position.x + ox, car.body.position.y + 1, car.body.position.z + oz);
  }
  spawnSparks(car.body.position.x, car.body.position.y + 2, car.body.position.z);
  // Drowned wrecks get an extra splash so the cause-of-death reads.
  if (reason === "DROWNED") {
    spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
  }

  // Sting + haptic — only here, after the replay (so it punctuates the
  // wreck moment instead of competing with the slow-mo).
  playGameOver();
  haptics.death();

  // Persist progression now (so the panel reads the right values when it
  // appears) but defer publishing the panel-visible state.
  isNewBest.value = saveBest(Math.floor(run.score));
  // New-best celebration: extra confetti bursts during the death moment so
  // the player feels the achievement before the panel even appears.
  if (isNewBest.value) {
    for (let i = 0; i < 5; i++) {
      const ox = (Math.random() - 0.5) * 6;
      const oz = (Math.random() - 0.5) * 6;
      spawnConfetti(car.body.position.x + ox, car.body.position.y + 1.5, car.body.position.z + oz);
    }
  }
  incrementRuns();
  addDrownedCops(run.drownedThisRun);
  runDrowned.value = run.drownedThisRun;
  runTopSpeed.value = run.topSpeed;
  runBiggestCombo.value = run.biggestCombo;
  runDistance.value = run.distance;
  runTileScore.value = run.tileScore;
  runComboScore.value = run.comboScore;
  runCopScore.value = run.copScore;

  // Submit score first, then upload/attach replay for the same session ID.
  // This avoids creating orphaned recordings when initial score submit fails.
  void (async () => {
    const sid = dyingSessionId ?? undefined;
    dyingSessionId = null;

    const submitted = await submitScore(playerName.value, run.score, undefined, sid);
    if (!submitted) {
      await fetchLeaderboard();
      return;
    }

    const [uploadErr, uploadedUrl] = await attemptAsync(() => handleRecordingUpload());
    if (uploadErr) {
      console.warn("[recorder] Upload failed:", uploadErr);
    } else if (uploadedUrl) {
      // upload-recording attaches the replay URL server-side to avoid
      // upload-then-submit orphaned blobs.
      console.log("[recorder] Replay attached to score entry");
    }

    await fetchLeaderboard();
  })();

  // After the death moment, reveal the panel.
  setTimeout(() => {
    gameState.value = "gameover";
  }, DEATH_MOMENT_MS);
}

function goToPreGame() {
  // Navigate to the pre-game screen so the player can pick a car & configs
  // before the run actually begins.
  screen.value = "preGame";
}

function toggleSound() {
  initAudio();
  resumeAudio();
  toggleMute();
  audioMuted.value = isMuted();
}

// Single typed registration: forces TypeScript to require every IActions
// member, replacing the previous "assign each field individually" pattern
// where forgetting one would silently leave a no-op stub in production.
setActions({
  startGame: goToPreGame,
  beginRun: startGame,
  installPwa,
  selectSkin,
  toggleSound,
  setWeather,
  togglePause,
});

// --- Game Loop ---
const timeStep = 1 / 60;
let lastCallTime: number | null = null;
let spawnTimersRebased = true;

function tickPlaying(dt: number, timeInSeconds: number) {
  const [err] = attempt(() => _tickPlayingInner(dt, timeInSeconds));
  if (err) {
    console.error("[tickPlaying] fatal loop error", err);
    attempt(() => gameOver("WRECKED"));
  }
}

function _tickPlayingInner(dt: number, timeInSeconds: number) {
  if (!spawnTimersRebased) {
    cops.rebaseTimers(timeInSeconds);
    civilians.rebaseTimers(timeInSeconds);
    pickups.rebaseTimers(timeInSeconds);
    spawnTimersRebased = true;
  }

  car.update(dt);
  cityGenerator.update(car.mesh.position);

  // Step physics world (skip during hit pause for impact emphasis)
  if (run.hitPauseTimer <= 0) {
    world.step(timeStep, dt, 10);
  }

  run.survivalTime += dt;

  // --- Level progression ---
  const prevLevel = run.advanceLevel();
  if (run.level > prevLevel) {
    run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_ON_LEVEL_UP);
    playLevelUp();
    haptics.levelUp();
    spawnPopup(car.body.position.x, car.body.position.y + 1, car.body.position.z, `LV ${run.level}`, "#ffaa22");
    spawnPopup(car.body.position.x, car.body.position.y + 2, car.body.position.z, `+${HP_HEAL_ON_LEVEL_UP} HP`, "#66ff88");
    pushChatter("level_up");
  }

  // Engine pitch follows speed
  setEngineSpeed(Math.min(car.body.velocity.length() / car.maxSpeed, 1));

  // --- Pure-state phases (scoring, combo decay, run stats) ---
  run.scoreRoadTile(car);
  run.decayCombo(dt);
  run.recordMovement(car);

  // --- Combo lifeline: warning tick + "lost it" sting ---
  // Tick window matches `comboInDanger` in run-state.syncHud (ratio < 0.25
  // on a chain of 5+). The sting fires on the falling edge of a chain >= 10
  // so casual breaks don't get punished with extra audio.
  const comboRatio = run.comboTimer / COMBO_DECAY;
  if (run.comboCount >= 5 && comboRatio > 0 && comboRatio < 0.25) {
    _comboTickAccum += dt;
    if (_comboTickAccum >= COMBO_TICK_INTERVAL) {
      _comboTickAccum = 0;
      playComboTick();
    }
  } else {
    _comboTickAccum = 0;
  }
  if (_prevComboCount >= 10 && run.comboCount === 0) {
    playComboLost();
  }
  _prevComboCount = run.comboCount;

  // --- Entity systems ---
  civilians.update(dt, timeInSeconds, car, run);
  pickups.update(dt, timeInSeconds, car, run, cops);
  const { nearestCopDist, nearbyCount } = cops.update(dt, timeInSeconds, car, run);

  // --- Death triggers ---
  // Gated on `currentState === "playing"` because tickPlaying also runs
  // during the dying slow-mo. Without the gate, a car coasting through
  // water during the death sequence would re-call gameOver every frame
  // (no-op due to its early-return) AND spam playSplash/spawnSplash side
  // effects. The gate keeps the dying phase visually + audibly clean.
  if (currentState === "playing") {
    if (run.hp <= 0) {
      run.hp = 0;
      gameOver("WRECKED");
    }

    // Water check (player drowning)
    const carTileX = Math.floor(car.body.position.x / TILE_SIZE);
    const carTileZ = Math.floor(car.body.position.z / TILE_SIZE);
    if (!isRoad(carTileX, carTileZ) && isWater(carTileX, carTileZ)) {
      playSplash();
      spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
      gameOver("DROWNED");
    }

    // Busted: enough cops nearby AND stopped for the threshold
    if (nearbyCount >= BUSTED_COP_COUNT && car.body.velocity.length() < BUSTED_STOPPED_SPEED) {
      run.bustedTimer += dt;
      if (run.bustedTimer > BUSTED_TIME_THRESHOLD) gameOver("BUSTED");
    } else {
      run.bustedTimer = Math.max(0, run.bustedTimer - dt * 2);
    }
  }

  // --- Speed streak heal: reward sustained top-speed driving ---
  if (car.body.velocity.length() >= car.maxSpeed * SPEED_STREAK_MIN_RATIO) {
    run.speedStreakTimer += dt;
    if (run.speedStreakTimer >= SPEED_STREAK_THRESHOLD) {
      run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_SPEED_STREAK);
      run.speedStreakTimer = 0;
      spawnPopup(car.body.position.x, car.body.position.y + 2, car.body.position.z, `+${HP_HEAL_SPEED_STREAK} HP`, "#66ff88");
    }
  } else {
    run.speedStreakTimer = 0;
  }

  // --- Passive HP regen when no cop is in the safe radius ---
  if (nearbyCount === 0 && run.hp < MAX_HP && nearestCopDist >= HP_REGEN_SAFE_DIST) {
    run.hp = Math.min(MAX_HP, run.hp + HP_REGEN_PER_SEC * dt);
  }

  // --- Score milestones — fire on the first frame the score crosses each
  // round-number threshold. Walks the index forward so each milestone fires
  // exactly once per run.
  while (
    run.nextMilestoneIdx < SCORE_MILESTONES.length &&
    run.score >= SCORE_MILESTONES[run.nextMilestoneIdx]
  ) {
    const value = SCORE_MILESTONES[run.nextMilestoneIdx];
    run.nextMilestoneIdx++;
    spawnPopup(car.body.position.x, car.body.position.y + 4, car.body.position.z, `${value.toLocaleString()}!`, "#ffdd44", 1.6, 14);
    triggerScreenFlash(0.35);
    playMilestone();
    haptics.levelUp();
  }

  // --- Escape reward — disengage from the chase pays off so the player
  // has a reason to use cover/distance instead of just orbiting cops.
  if (nearestCopDist >= ESCAPE_DIST) {
    if (run.escapeArmed) {
      run.escapeTimer += dt;
      if (run.escapeTimer >= ESCAPE_TIME) {
        run.escapeArmed = false;
        run.escapeTimer = 0;
        run.score += ESCAPE_REWARD;
        run.copScore += ESCAPE_REWARD;
        run.hp = Math.min(MAX_HP, run.hp + ESCAPE_HEAL);
        spawnPopup(car.body.position.x, car.body.position.y + 4, car.body.position.z, "ESCAPED!", "#66ff88", 1.6, 14);
        spawnPopup(car.body.position.x, car.body.position.y + 2.5, car.body.position.z, `+${ESCAPE_REWARD}`, "#ffcc22");
        triggerScreenFlash(0.25);
        playEscape();
        pushChatter("escape");
      }
    }
  } else {
    // Cop came back into range — re-arm and reset the timer so the next
    // disengage takes a fresh 1.5s.
    run.escapeTimer = 0;
    run.escapeArmed = true;
  }

  // --- Low-HP heartbeat — interval scales with how close to dying the
  // player is. Audio only; the visual vignette is a UI component reacting
  // to the same hp signal. Suppressed during dying so the slow-mo wreck
  // moment plays out in cinematic silence.
  if (currentState === "playing" && run.hp > 0 && run.hp < LOW_HP_THRESHOLD) {
    _heartbeatAccum += dt;
    const danger = 1 - run.hp / LOW_HP_THRESHOLD; // 0..1
    const interval = 1.1 - danger * 0.65; // 1.1s → 0.45s
    if (_heartbeatAccum >= interval) {
      _heartbeatAccum = 0;
      playHeartbeat(danger);
    }
  } else {
    _heartbeatAccum = 0;
  }

  // --- Siren: on when any cop within range, intensity scales with closeness.
  // Naturally suppressed during dying because `currentState === "dying"`
  // here, not "playing".
  let sirenIntensity = 0;
  if (currentState === "playing" && nearestCopDist < SIREN_MAX_RANGE) {
    startSiren();
    sirenIntensity = 1 - nearestCopDist / SIREN_MAX_RANGE;
    setSirenVolume(sirenIntensity);
  } else {
    stopSiren();
  }
  setBgmDuck(sirenIntensity);

  // --- Skid marks: emit at rear wheels when drifting hard or boosting ---
  const isDrifting = car.lateralSpeed > 4;
  const isBoosting = run.nitroTimer > 0 && car.body.velocity.length() > car.baseMaxSpeed * 0.6;
  if (isDrifting || isBoosting) {
    car.body.pointToWorldFrame(_rearLocal, _rearWorld);
    // Yaw extracted from quaternion. Safe because cannon angularFactor is
    // constrained to (0,1,0) so x/z components of the quaternion stay zero.
    const heading = Math.atan2(
      2 * (car.body.quaternion.w * car.body.quaternion.y),
      1 - 2 * car.body.quaternion.y * car.body.quaternion.y,
    );
    const offX = Math.cos(heading) * 1.25;
    const offZ = -Math.sin(heading) * 1.25;
    spawnSkid(_rearWorld.x + offX, _rearWorld.z + offZ, heading);
    spawnSkid(_rearWorld.x - offX, _rearWorld.z - offZ, heading);
  }

  // --- Speed lines: peak-speed nitro flourish ---
  // Only when both nitro is active AND the car is at 80%+ of its boosted
  // top speed. Two streaks per frame is enough to read without saturating
  // the particle pool during long boosts.
  if (run.nitroTimer > 0 && car.body.velocity.length() > car.maxSpeed * 0.8) {
    const heading = Math.atan2(
      2 * (car.body.quaternion.w * car.body.quaternion.y),
      1 - 2 * car.body.quaternion.y * car.body.quaternion.y,
    );
    // Note: yaw extraction above gives the direction the car faces in the
    // XZ plane. Forward in cannon-local-space is -Z, so heading→world is
    // (sin h, _, -cos h) — but this car uses (cos h, _, -sin h) elsewhere
    // for skids, so reuse the same convention for visual consistency.
    const fx = -Math.cos(heading);
    const fz = Math.sin(heading);
    spawnSpeedLine(car.body.position.x, car.body.position.y, car.body.position.z, fx, fz);
    spawnSpeedLine(car.body.position.x, car.body.position.y, car.body.position.z, fx, fz);
  }

  // --- Vibe Jam portal check: redirect if the car drove through one ---
  const portalDest = portals.update(car.mesh.position);
  if (portalDest) {
    stopEngine();
    stopSiren();
    stopBgm();
    window.location.href = portalDest;
    return;
  }

  run.syncHud();
}

function animate(time: number) {
  requestAnimationFrame(animate);

  const timeInSeconds = time / 1000;
  let dt = timeStep;
  if (lastCallTime) {
    dt = Math.min(timeInSeconds - lastCallTime, 1 / 30);
  }
  lastCallTime = timeInSeconds;

  // Particles + skids keep running so the death animation can play out;
  // popups freeze on game-over so the run summary isn't crowded by stale text.
  updateEffects(dt);
  updateSkids(dt);
  updateGhostTrail(dt);
  // Capture a fresh ghost slot when nitro is active. Real-time dt — not the
  // slow-mo dt — so the trail spacing stays even regardless of time slow.
  captureGhost(
    dt,
    currentState === "playing" && run.nitroTimer > 0,
    car.body.position,
    car.body.quaternion,
  );
  updateTimeSlow(dt);
  cityGenerator.tick(timeInSeconds);
  updateRain(ctx.rain, dt, car.mesh.position.x, car.mesh.position.z);
  updateSnow(ctx.snow, dt, car.mesh.position.x, car.mesh.position.z);
  // Popups freeze when not actively in gameplay or dying — keeps the
  // game-over panel uncluttered by stale floaters.
  if (currentState === "playing" || currentState === "dying") updatePopups(dt);
  updateCopLights(timeInSeconds);

  if (run.hitPauseTimer > 0) run.hitPauseTimer = Math.max(0, run.hitPauseTimer - dt);

  if (currentState === "playing" || currentState === "dying") {
    // Scale gameplay dt by the active time-slow factor (combo milestone juice).
    // Particles, popups, skids and the camera follow stay at real-time above.
    // Stack the dying-phase slow-mo on top so the wreck moment plays out
    // cinematically while cops + physics keep simulating.
    const slowFactor = getTimeSlowFactor();
    const deathScale = currentState === "dying" ? DYING_TIMESCALE : 1;
    tickPlaying(dt * slowFactor * deathScale, timeInSeconds);

    // Real-dt countdown of the dying phase. When it expires we mark the
    // frame for screenshot capture (consumed AFTER renderer.render below)
    // so the saved image shows the slow-mo wreck moment, NOT the explosion
    // flash that fires inside finishGameOver().
    if (currentState === "dying") {
      dyingTimer -= dt;
      if (dyingTimer <= 0) {
        dyingTimer = 0;
        pendingScreenshot = true;
      }
    }
  }

  // Wreck zoom: ease cameraD from BASE down to WRECK over the dying phase
  // so the screenshot at the end captures the car + collision close-up.
  // `progress` is 0 at the start of dying, 1 the moment slow-mo expires.
  if (currentState === "dying") {
    const progress = 1 - dyingTimer / DYING_DURATION_SEC;
    // ease-in-out cubic so the zoom feels intentional, not mechanical
    const eased = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    ctx.setCameraD(BASE_CAMERA_D + (WRECK_CAMERA_D - BASE_CAMERA_D) * eased);
  } else if (currentState === "gameover" && ctx.getCameraD() !== WRECK_CAMERA_D) {
    // Hold the wreck zoom while the explosion + panel play out.
    ctx.setCameraD(WRECK_CAMERA_D);
  }

  // Camera follow car. The follow offset shrinks alongside cameraD so the
  // camera physically pulls in toward the car as it zooms — without this
  // the orthographic frame would just shrink in place.
  const followScale = ctx.getCameraD() / BASE_CAMERA_D;
  const followOffset = 50 * followScale;
  camera.position.set(
    car.mesh.position.x + followOffset,
    car.mesh.position.y + followOffset,
    car.mesh.position.z + followOffset,
  );
  applyShake(camera, dt);

  // Move directional light to follow the player
  ctx.directionalLight.position.set(
    car.mesh.position.x + 50,
    100,
    car.mesh.position.z + 50,
  );
  ctx.directionalLight.target.position.copy(car.mesh.position);

  renderer.render(scene, camera);

  // End-of-frame screenshot capture for the share card. Runs in the same
  // frame as the final slow-mo render so the saved image shows the wreck
  // moment cleanly, BEFORE finishGameOver() schedules the explosion flash.
  if (pendingScreenshot) {
    pendingScreenshot = false;
    const [err, url] = attempt(() => renderer.domElement.toDataURL("image/png"));
    if (!err && url) wreckScreenshot.value = url;
    if (dyingReason) {
      const reason = dyingReason;
      dyingReason = null;
      finishGameOver(reason);
    }
  }
}

// Pause loop + audio when tab is hidden
document.addEventListener("visibilitychange", () => {
  attempt(() => {
    if (document.hidden) {
      if (currentState === "playing") pauseGame();
    } else if (currentState === "playing") {
      // Guard: only rebase timers and restart audio when actually playing.
      // Avoids stale-dt resets on gameover/start state tab returns.
      lastCallTime = null;
      spawnTimersRebased = false;
      initAudio();
      resumeAudio();
      startEngine();
      startBgm();
      startRadioHiss();
    }
  });
}, { signal: listenerSignal });

// Start the loop
requestAnimationFrame(animate);

// Vibe Jam continuity: when the player arrives via ?portal=true, skip every
// menu/screen and drop them straight into a run so the webring handoff feels
// seamless. If a return portal exists, spawn the player AT it ("coming out
// of" the portal) facing toward the city so they drive away naturally.
if (portals.cameFromPortal) {
  startGame();
  const spawn = portals.returnSpawnPos;
  if (spawn) {
    car.body.position.set(spawn.x, 1, spawn.z);
    car.body.velocity.set(0, 0, 0);
    car.body.angularVelocity.set(0, 0, 0);
    // Face +X (toward origin / the rest of the city) — return portal sits
    // at -80 on the X axis. Yaw of -π/2 turns cannon-local forward (-Z)
    // into world +X.
    car.body.quaternion.setFromEuler(0, -Math.PI / 2, 0);
  }
}
