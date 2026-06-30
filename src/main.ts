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
import { captureGhost, updateGhostTrail, clearGhostTrail } from "./world/ghost-trail";
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
import { fetchLeaderboard, submitScore, getPlayerName, uploadRecording } from "./api";
import { attempt, attemptAsync } from "es-toolkit";
import {
  startRecording,
  stopRecording,
  getSessionId,
  discardRecording,
  MAX_UPLOAD_SIZE,
} from "./systems/screen-recorder";
/* `getSessionId` is still used inside `gameOver` to capture the dying session. */
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

/* Mount Preact UI first so #game-area exists for the canvas */
const appRoot = document.getElementById("app") as HTMLElement;
render(h(App, null), appRoot);

/* Player name (Vibe Jam continuity): portal arrival can carry `?username=` from prev game → keep identity across webring. */
const _incomingPortalName = new URLSearchParams(window.location.search).get("username");
playerName.value = _incomingPortalName?.trim() || getPlayerName();

/* PWA Install Prompt (mobile only) */
type IBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
let deferredPrompt: IBeforeInstallPromptEvent | null = null;

/* Single controller so all global listeners can be torn down together. */
const listenerController = new AbortController();
const { signal: listenerSignal } = listenerController;

window.addEventListener(
  "beforeinstallprompt",
  (e) => {
    e.preventDefault();
    deferredPrompt = e as IBeforeInstallPromptEvent;
    canInstallPwa.value = true;
  },
  { signal: listenerSignal },
);
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

  if (err) {
    console.error("[installPwa]", err);
    return;
  }
  if (result!.outcome === "accepted") canInstallPwa.value = false;
}

/* Bootstrap builds all infra. State behind `ctx` → main focuses on flow. Zoom via `ctx.setCameraD`. */
const ctx = bootstrap({
  selectedSkinId: selectedSkin.value,
  initialWeather: weather.value,
  getPlayerName: () => playerName.value || "player",
  getSelectedSkinId: () => selectedSkin.value,
});
const { scene, camera, renderer, world, cityGenerator, car, portals } = ctx;

/* selectSkin/setWeather: bootstrap handles scene mutations; main writes the signal so persisted state stays in sync. */
function selectSkin(skinId: string) {
  setSelectedSkin(skinId);
  ctx.selectSkin(skinId);
}
function setWeather(w: typeof weather.value) {
  weather.value = w;
  ctx.setWeather(w);
}

/* Systems + run state */
const systemsCtx = { scene, world };
const run = new RunState();
const cops = new CopSystem(systemsCtx);
const civilians = new CivilianSystem(systemsCtx);
const pickups = new PickupSystem(systemsCtx);

/* `currentState` = loop's internal state. Superset of IGameStateValue with "dying" for slow-mo. */
type ICurrentState = IGameStateValue | "dying";
let currentState: ICurrentState = "start";

/* Per-frame scratch for skid emitter — hoisted to avoid 2 Vec3 allocations/frame. */
const _rearLocal = new CANNON.Vec3(0, 0, 1.25);
const _rearWorld = new CANNON.Vec3();

/* Combo lifeline tracking — drives warning tick cadence + "lost it" sting on edge transitions. */
let _prevComboCount = 0;
let _comboTickAccum = 0;
const COMBO_TICK_INTERVAL = 0.18; /* seconds between warning ticks while in danger */

/* Low-HP heartbeat scheduler. Interval scales 1.1s @ threshold → 0.45s @ HP=1 (danger ramps up). */
let _heartbeatAccum = 0;

/* Death slow-mo: cinematic at ~12% real time. Physics+cops+car keep simulating. On expiry → screenshot, explosion, panel. */
const DYING_DURATION_SEC = 1.0;
const DYING_TIMESCALE = 0.12;
let dyingTimer = 0;
let dyingReason: string | null = null;
/* True on the slow-mo expiry frame; consumed AFTER the next render → captures the actual frame the player saw. */
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
  /* Avoid stale dt on resume */
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

window.addEventListener(
  "keydown",
  (e) => {
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
  },
  { signal: listenerSignal },
);

/* Resize: `resizeRenderer` + `setCameraD` are the only ways to touch camera frustum. Shared AbortController for teardown. */
const resizeRenderer = () => attempt(() => ctx.resizeRenderer());
window.addEventListener("resize", resizeRenderer, { signal: listenerSignal });
window.addEventListener("orientationchange", () => setTimeout(resizeRenderer, 100), { signal: listenerSignal });

function startGame() {
  currentState = "playing";
  gameState.value = "playing";
  screen.value = "none";
  isNewBest.value = false;

  /* Discard any previous recording that didn't get uploaded. */
  discardRecording();
  dyingSessionId = null;

  /* Reset Player */
  car.body.position.set(0, 1, 0);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  car.bounceBackTimer = 0;
  car.recoveryTimer = 0;
  car.setNitroMultiplier(1);
  car.setRandomDirection();

  /* Reset all per-run state */
  run.reset(car);

  /* Camera teleport + reset wreck-zoom in case the previous run died. */
  camera.position.set(50, 55, 50);
  ctx.setCameraD(BASE_CAMERA_D);

  /* Reset systems */
  cops.reset();
  civilians.reset();
  pickups.reset();

  run.syncHud();

  /* First-frame after restart: avoid stale dt and rebase spawn timers */
  lastCallTime = null;
  spawnTimersRebased = false;

  clearSkids();
  clearPopups();
  clearParticles();
  clearEffects();
  clearGhostTrail();
  clearChatter();
  /* Reset death-sequence state so a fresh run starts cleanly even after a previous run died mid slow-mo. */
  dyingTimer = 0;
  dyingReason = null;
  pendingScreenshot = false;
  wreckScreenshot.value = null;
  _prevComboCount = 0;
  _comboTickAccum = 0;
  _heartbeatAccum = 0;
  /* Opening radio call so the chatter feed has life from the first frame. */
  pushChatter("start");

  /* Audio: kick everything on */
  initAudio();
  resumeAudio();
  startEngine();
  startBgm();
  startRadioHiss();

  /* Start auto-recording the gameplay session. Recording is uploaded only if the score makes the leaderboard. */
  startRecording(renderer.domElement).catch(() => {
    /* Silently fail — recording is non-blocking */
  });
  /* Background-load all voice files so radio calls are instant. Idempotent — fetches once/app. */
  void preloadRadioVoices();
}

/* Recording helpers Session ID captured at gameOver time. */
let dyingSessionId: string | null = null;

/* Recordings kept for any run in top 50 — bigger archive than displayed top 10, upload stays cheap. */
const QUALIFY_BOARD_SIZE = 50;

/** Upload threshold from cached leaderboard: 50th entry's score is the bar. Returns 0 if <50 entries (open board). */
function getQualificationThreshold(): number {
  const entries = leaderboardEntries.value;
  if (!entries || entries.length < QUALIFY_BOARD_SIZE) return 0;
  return entries[QUALIFY_BOARD_SIZE - 1]?.score ?? 0;
}

/** Stop & upload if top-50. Caller MUST pass same sessionId/name/score as submitScore — live-state reads caused 409s. */
async function handleRecordingUpload(sessionId: string | undefined, myName: string, myScore: number) {
  if (!sessionId) {
    console.log("[recorder] no sessionId, skip");
    return null;
  }

  /* Cheap client-side gate first — bail before paying the stop+blob cost. */
  if (myScore <= getQualificationThreshold()) {
    console.log(`[recorder] score ${myScore} below threshold, skip`);
    discardRecording();
    return null;
  }

  const blob = await stopRecording();
  if (!blob) {
    console.log("[recorder] stopRecording returned null, skip");
    return null;
  }
  const sizeKB = (blob.size / 1024).toFixed(0);

  /* Hard size ceiling (MAX_UPLOAD_SIZE in screen-recorder.ts). HW H.264 overshoots bitrate hint sometimes → drop unreliable. */
  if (blob.size > MAX_UPLOAD_SIZE) {
    console.log(`[recorder] blob ${sizeKB} KB exceeds ${MAX_UPLOAD_SIZE / 1024} KB cap, skip`);
    return null;
  }

  console.log(`[recorder] Captured ${sizeKB} KB, uploading…`);
  return await uploadRecording(blob, sessionId, myName, myScore);
}

function gameOver(reason: string = "BUSTED") {
  /* Already dying/gameover — ignore further fail triggers so a busted/wreck/drown during slow-mo can't restart it. */
  if (currentState === "gameover" || currentState === "dying") return;

  /* Capture the recording session ID at death time so the upload verifies the URL belongs to THIS session. */
  dyingSessionId = getSessionId();

  /* Enter cinematic dying. tickPlaying keeps running → cops+physics in slow-mo. */
  currentState = "dying";
  dyingReason = reason;
  dyingTimer = DYING_DURATION_SEC;

  /* Audio: duck loops for silence. "Wreck" sting fires AFTER, on explosion frame. */
  stopEngine();
  stopSiren();
  stopBgm();
  stopRadioHiss();
  stopRadioVoice();

  /* Radio sign-off — dispatch announces the end of the chase based on cause. */
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

  /* Explosion juice: bigger than crash (1s slow-mo just happened). Multiple confetti+sparks = real wreck. */
  triggerScreenFlash(0.95);
  triggerShake(1.1);
  for (let i = 0; i < 3; i++) {
    const ox = (Math.random() - 0.5) * 4;
    const oz = (Math.random() - 0.5) * 4;
    spawnConfetti(car.body.position.x + ox, car.body.position.y + 1.5, car.body.position.z + oz);
    spawnSparks(car.body.position.x + ox, car.body.position.y + 1, car.body.position.z + oz);
  }
  spawnSparks(car.body.position.x, car.body.position.y + 2, car.body.position.z);
  /* Drowned wrecks get an extra splash so the cause-of-death reads. */
  if (reason === "DROWNED") {
    spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
  }

  /* Sting + haptic — only here, after the replay (so it punctuates the wreck moment instead of competing with the slow-mo). */
  playGameOver();
  haptics.death();

  /* Persist progression now (panel reads right values) but defer panel-visible state. */
  isNewBest.value = saveBest(Math.floor(run.score));
  /* New-best celebration: extra confetti bursts during death moment so the achievement lands before the panel. */
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

  /* Submit score first, then upload replay for the same session ID — avoids orphaned recordings if submit fails. */
  void (async () => {
    const sid = dyingSessionId ?? undefined;
    dyingSessionId = null;

    /* Capture name+score at submit, thread same triple to upload — live-state reads caused 409s on drift. */
    const nameAtSubmit = playerName.value;
    const scoreAtSubmit = Math.floor(run.score);

    const submitted = await submitScore(nameAtSubmit, scoreAtSubmit, undefined, sid);
    if (!submitted) {
      await fetchLeaderboard();
      return;
    }

    await attemptAsync(() => handleRecordingUpload(sid, nameAtSubmit, scoreAtSubmit));
    /* Upload awaited above → by the time fetchLeaderboard runs, recordingUrl is already attached. One refresh is enough. */
    await fetchLeaderboard();
  })();

  /* After the death moment, reveal the panel. */
  setTimeout(() => {
    gameState.value = "gameover";
  }, DEATH_MOMENT_MS);
}

function goToPreGame() {
  /* Navigate to the pre-game screen so the player can pick a car & configs before the run actually begins. */
  screen.value = "preGame";
}

function toggleSound() {
  initAudio();
  resumeAudio();
  toggleMute();
  audioMuted.value = isMuted();
}

/* Typed registration: TS requires every IActions member. Per-field assignment was replaced — missing field = no-op stub. */
setActions({
  startGame: goToPreGame,
  beginRun: startGame,
  installPwa,
  selectSkin,
  toggleSound,
  setWeather,
  togglePause,
});

/* Game Loop */
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

  /* Step physics world (skip during hit pause for impact emphasis) */
  if (run.hitPauseTimer <= 0) {
    world.step(timeStep, dt, 10);
  }

  run.survivalTime += dt;

  /* Level progression */
  const prevLevel = run.advanceLevel();
  if (run.level > prevLevel) {
    run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_ON_LEVEL_UP);
    playLevelUp();
    haptics.levelUp();
    spawnPopup(car.body.position.x, car.body.position.y + 1, car.body.position.z, `LV ${run.level}`, "#ffaa22");
    spawnPopup(
      car.body.position.x,
      car.body.position.y + 2,
      car.body.position.z,
      `+${HP_HEAL_ON_LEVEL_UP} HP`,
      "#66ff88",
    );
    pushChatter("level_up");
  }

  /* Engine pitch follows speed */
  setEngineSpeed(Math.min(car.body.velocity.length() / car.maxSpeed, 1));

  /* Pure-state phases (scoring, combo decay, run stats) */
  run.scoreRoadTile(car);
  run.decayCombo(dt);
  run.decayDrownChain(dt);
  run.recordMovement(car);

  /* Combo lifeline: warning tick + "lost it" sting. Window = `comboInDanger` (ratio < 0.25). */
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

  /* Entity systems */
  civilians.update(dt, timeInSeconds, car, run);
  pickups.update(dt, timeInSeconds, car, run, cops);
  const { nearestCopDist, nearbyCount } = cops.update(dt, timeInSeconds, car, run);

  /* Death triggers gated on `state "playing"` — tickPlaying runs during dying. Without gate, water-car re-calls gameOver. */
  if (currentState === "playing") {
    if (run.hp <= 0) {
      run.hp = 0;
      gameOver("WRECKED");
    }

    /* Water check (player drowning) */
    const carTileX = Math.floor(car.body.position.x / TILE_SIZE);
    const carTileZ = Math.floor(car.body.position.z / TILE_SIZE);
    if (!isRoad(carTileX, carTileZ) && isWater(carTileX, carTileZ)) {
      playSplash();
      spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
      gameOver("DROWNED");
    }

    /* Busted: enough cops nearby AND stopped for the threshold */
    if (nearbyCount >= BUSTED_COP_COUNT && car.body.velocity.length() < BUSTED_STOPPED_SPEED) {
      run.bustedTimer += dt;
      if (run.bustedTimer > BUSTED_TIME_THRESHOLD) gameOver("BUSTED");
    } else {
      run.bustedTimer = Math.max(0, run.bustedTimer - dt * 2);
    }
  }

  /* Speed streak heal: reward sustained top-speed driving */
  if (car.body.velocity.length() >= car.maxSpeed * SPEED_STREAK_MIN_RATIO) {
    run.speedStreakTimer += dt;
    if (run.speedStreakTimer >= SPEED_STREAK_THRESHOLD) {
      run.hp = Math.min(MAX_HP, run.hp + HP_HEAL_SPEED_STREAK);
      run.speedStreakTimer = 0;
      spawnPopup(
        car.body.position.x,
        car.body.position.y + 2,
        car.body.position.z,
        `+${HP_HEAL_SPEED_STREAK} HP`,
        "#66ff88",
      );
    }
  } else {
    run.speedStreakTimer = 0;
  }

  /* Passive HP regen when no cop is in the safe radius */
  if (nearbyCount === 0 && run.hp < MAX_HP && nearestCopDist >= HP_REGEN_SAFE_DIST) {
    run.hp = Math.min(MAX_HP, run.hp + HP_REGEN_PER_SEC * dt);
  }

  /* Score milestones: fire on the first frame the score crosses each round-number. Index walks forward → each fires once. */
  while (run.nextMilestoneIdx < SCORE_MILESTONES.length && run.score >= SCORE_MILESTONES[run.nextMilestoneIdx]) {
    const value = SCORE_MILESTONES[run.nextMilestoneIdx];
    run.nextMilestoneIdx++;
    spawnPopup(
      car.body.position.x,
      car.body.position.y + 4,
      car.body.position.z,
      `${value.toLocaleString()}!`,
      "#ffdd44",
      1.6,
      14,
    );
    triggerScreenFlash(0.35);
    playMilestone();
    haptics.levelUp();
  }

  /* Escape reward: disengage pays off so player has a reason to use cover/distance instead of orbiting cops. */
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
    /* Cop came back into range — re-arm and reset the timer so the next disengage takes a fresh 1.5s. */
    run.escapeTimer = 0;
    run.escapeArmed = true;
  }

  /* Low-HP heartbeat: interval scales with closeness to dying. Audio only (vignette = UI). Suppressed during dying. */
  if (currentState === "playing" && run.hp > 0 && run.hp < LOW_HP_THRESHOLD) {
    _heartbeatAccum += dt;
    const danger = 1 - run.hp / LOW_HP_THRESHOLD; /* 0..1 */
    const interval = 1.1 - danger * 0.65; /* 1.1s → 0.45s */
    if (_heartbeatAccum >= interval) {
      _heartbeatAccum = 0;
      playHeartbeat(danger);
    }
  } else {
    _heartbeatAccum = 0;
  }

  /* Siren on when any cop in range; intensity scales with closeness. Suppressed during dying. */
  let sirenIntensity = 0;
  if (currentState === "playing" && nearestCopDist < SIREN_MAX_RANGE) {
    startSiren();
    sirenIntensity = 1 - nearestCopDist / SIREN_MAX_RANGE;
    setSirenVolume(sirenIntensity);
  } else {
    stopSiren();
  }
  setBgmDuck(sirenIntensity);

  /* Skid marks: emit at rear wheels when drifting hard or boosting */
  const isDrifting = car.lateralSpeed > 4;
  const isBoosting = run.nitroTimer > 0 && car.body.velocity.length() > car.baseMaxSpeed * 0.6;
  if (isDrifting || isBoosting) {
    car.body.pointToWorldFrame(_rearLocal, _rearWorld);
    /* Yaw from quaternion. Safe: cannon angularFactor constrained to (0,1,0) so x/z quaternion components stay zero. */
    const heading = Math.atan2(
      2 * (car.body.quaternion.w * car.body.quaternion.y),
      1 - 2 * car.body.quaternion.y * car.body.quaternion.y,
    );
    const offX = Math.cos(heading) * 1.25;
    const offZ = -Math.sin(heading) * 1.25;
    spawnSkid(_rearWorld.x + offX, _rearWorld.z + offZ, heading);
    spawnSkid(_rearWorld.x - offX, _rearWorld.z - offZ, heading);
  }

  /* Speed lines: peak-speed nitro flourish. Both nitro active AND car at 80%+ boosted top. 2 streaks/frame = enough to read. */
  if (run.nitroTimer > 0 && car.body.velocity.length() > car.maxSpeed * 0.8) {
    const heading = Math.atan2(
      2 * (car.body.quaternion.w * car.body.quaternion.y),
      1 - 2 * car.body.quaternion.y * car.body.quaternion.y,
    );
    /* Yaw = XZ-plane facing. Forward in cannon-local-space = -Z → heading→world = (sin h, _, -cos h). */
    const fx = -Math.cos(heading);
    const fz = Math.sin(heading);
    spawnSpeedLine(car.body.position.x, car.body.position.y, car.body.position.z, fx, fz);
    spawnSpeedLine(car.body.position.x, car.body.position.y, car.body.position.z, fx, fz);
  }

  /* Vibe Jam portal check: redirect if the car drove through one */
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

  /* Particles + skids keep running (death animation plays out); popups freeze on game-over (no stale text). */
  updateEffects(dt);
  updateSkids(dt);
  updateGhostTrail(dt);
  /* Capture fresh ghost slot when nitro active. Real-time dt (not slow-mo) → trail spacing stays even regardless of slow-mo. */
  captureGhost(dt, currentState === "playing" && run.nitroTimer > 0, car.body.position, car.body.quaternion);
  updateTimeSlow(dt);
  cityGenerator.tick(timeInSeconds);
  updateRain(ctx.rain, dt, car.mesh.position.x, car.mesh.position.z);
  updateSnow(ctx.snow, dt, car.mesh.position.x, car.mesh.position.z);
  /* Popups freeze when not actively in gameplay or dying — keeps the game-over panel uncluttered by stale floaters. */
  if (currentState === "playing" || currentState === "dying") updatePopups(dt);
  updateCopLights(timeInSeconds);

  if (run.hitPauseTimer > 0) run.hitPauseTimer = Math.max(0, run.hitPauseTimer - dt);

  if (currentState === "playing" || currentState === "dying") {
    /* Scale gameplay dt by active time-slow (combo juice). Particles/popups/skids/camera stay real-time. Stack dying slow-mo. */
    const slowFactor = getTimeSlowFactor();
    const deathScale = currentState === "dying" ? DYING_TIMESCALE : 1;
    tickPlaying(dt * slowFactor * deathScale, timeInSeconds);

    /* Real-dt dying-phase countdown. On expiry mark for screenshot (consumed AFTER render). */
    if (currentState === "dying") {
      dyingTimer -= dt;
      if (dyingTimer <= 0) {
        dyingTimer = 0;
        pendingScreenshot = true;
      }
    }
  }

  /* Wreck zoom: ease cameraD BASE→WRECK over dying phase → end screenshot captures car+collision close-up. */
  if (currentState === "dying") {
    const progress = 1 - dyingTimer / DYING_DURATION_SEC;
    /* ease-in-out cubic so the zoom feels intentional, not mechanical */
    const eased = progress < 0.5 ? 4 * progress * progress * progress : 1 - Math.pow(-2 * progress + 2, 3) / 2;
    ctx.setCameraD(BASE_CAMERA_D + (WRECK_CAMERA_D - BASE_CAMERA_D) * eased);
  } else if (currentState === "gameover" && ctx.getCameraD() !== WRECK_CAMERA_D) {
    /* Hold the wreck zoom while the explosion + panel play out. */
    ctx.setCameraD(WRECK_CAMERA_D);
  }

  /* Camera follow car. Follow offset shrinks with cameraD → camera physically pulls in as it zooms. */
  const followScale = ctx.getCameraD() / BASE_CAMERA_D;
  const followOffset = 50 * followScale;
  camera.position.set(
    car.mesh.position.x + followOffset,
    car.mesh.position.y + followOffset,
    car.mesh.position.z + followOffset,
  );
  applyShake(camera, dt);

  /* Move directional light to follow the player */
  ctx.directionalLight.position.set(car.mesh.position.x + 50, 100, car.mesh.position.z + 50);
  ctx.directionalLight.target.position.copy(car.mesh.position);

  renderer.render(scene, camera);

  /* End-of-frame screenshot for share card. Same frame as final slow-mo render — BEFORE explosion flash. */
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

/* Pause loop + audio when tab is hidden */
document.addEventListener(
  "visibilitychange",
  () => {
    attempt(() => {
      if (document.hidden) {
        if (currentState === "playing") pauseGame();
      } else if (currentState === "playing") {
        /* Guard: only rebase timers + restart audio when actually playing. Avoids stale-dt resets on gameover/start tab returns. */
        lastCallTime = null;
        spawnTimersRebased = false;
        initAudio();
        resumeAudio();
        startEngine();
        startBgm();
        startRadioHiss();
      }
    });
  },
  { signal: listenerSignal },
);

/* Start the loop */
requestAnimationFrame(animate);

/* Vibe Jam: ?portal=true arrival skips every menu, drops straight into run. Return portal → spawn AT it facing city. */
if (portals.cameFromPortal) {
  startGame();
  const spawn = portals.returnSpawnPos;
  if (spawn) {
    car.body.position.set(spawn.x, 1, spawn.z);
    car.body.velocity.set(0, 0, 0);
    car.body.angularVelocity.set(0, 0, 0);
    /* Face +X (toward city). Return portal at -80 on X. Yaw -π/2 turns cannon-local forward (-Z) into world +X. */
    car.body.quaternion.setFromEuler(0, -Math.PI / 2, 0);
  }
}
