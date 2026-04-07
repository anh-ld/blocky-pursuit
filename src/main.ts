import "virtual:uno.css";
import { render, h } from "preact";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { updateCopLights } from "./entities/cop";
import { CityGenerator, isRoad } from "./world/city-generator";
import { isWater, TILE_SIZE } from "./world/terrain";
import { RunState } from "./systems/run-state";
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
  playSplash,
  playLevelUp,
  playGameOver,
  toggleMute,
  isMuted,
  startBgm,
  stopBgm,
  setBgmDuck,
} from "./audio/sound";
import { haptics } from "./audio/haptics";
import {
  initEffects,
  initScreenFlash,
  applyShake,
  spawnSplash,
  spawnSparks,
  spawnConfetti,
  spawnSpeedLine,
  clearParticles,
  updateEffects,
  updateTimeSlow,
  getTimeSlowFactor,
  triggerScreenFlash,
  triggerShake,
} from "./world/effects";
import { initPopups, spawnPopup, updatePopups, clearPopups } from "./world/popups";
import { initSkids, spawnSkid, updateSkids, clearSkids } from "./world/skids";
import {
  applyWeather,
  createRain,
  updateRain,
  setRainEnabled,
  createSnow,
  updateSnow,
  setSnowEnabled,
  getWeatherModifiers,
} from "./world/weather";
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
  selectedSkin,
  setSelectedSkin,
  incrementRuns,
  addDrownedCops,
  audioMuted,
  weather,
  type IGameStateValue,
} from "./state";
import { fetchLeaderboard, submitScore, getPlayerName } from "./api";
import { attempt, attemptAsync } from "es-toolkit";
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
} from "./constants";

// --- Mount Preact UI first so #game-area exists for the canvas ---
const appRoot = document.getElementById("app") as HTMLElement;
render(h(App, null), appRoot);

// --- Player name ---
playerName.value = getPlayerName();

// --- PWA Install Prompt (mobile only) ---
type IBeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};
let deferredPrompt: IBeforeInstallPromptEvent | null = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e as IBeforeInstallPromptEvent;
  canInstallPwa.value = true;
});
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

// --- Scene Setup ---
const scene = new THREE.Scene();


// --- Isometric Camera Setup ---
const aspect = 1;
const d = 50;
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
camera.position.set(50, 50, 50);
camera.lookAt(scene.position);

// --- Renderer Setup ---
const gameArea = document.getElementById("game-area") as HTMLElement;
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(gameArea.clientWidth, gameArea.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false;
renderer.domElement.style.display = "block";
renderer.domElement.style.touchAction = "none";
gameArea.appendChild(renderer.domElement);

// --- Lighting Setup ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
directionalLight.position.set(50, 100, 50);
scene.add(directionalLight);
scene.add(directionalLight.target);

// --- Weather (sky + fog + light tint + rain/snow particles + car modifiers) ---
const rain = createRain(scene);
const snow = createSnow(scene);
applyWeather(scene, ambientLight, directionalLight, weather.value);
setRainEnabled(rain, weather.value === "rain");
setSnowEnabled(snow, weather.value === "snowy");
// `actions.setWeather` is wired later (after `car` exists) so the closure can
// safely push driving modifiers into the player car. The initial car-side
// application also happens after construction.

// --- Cannon-es World Setup ---
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -30, 0),
  allowSleep: false,
});
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 });
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// --- Effects (particles, screen shake, popups, skids, screen flash) ---
initEffects(scene);
initPopups(scene);
initSkids(scene);
initScreenFlash(gameArea);

// --- City Generation ---
const cityGenerator = new CityGenerator(scene, world);
cityGenerator.update(new THREE.Vector3(0, 0, 0));

// --- Player Car ---
const car = new Car(scene, world, selectedSkin.value);

function selectSkin(skinId: string) {
  setSelectedSkin(skinId);
  car.applySkin(skinId);
}

// Apply the current weather's driving modifiers to the freshly built car, then
// wire the setWeather action so future weather changes update sky, particles
// AND car physics in one place.
{
  const m = getWeatherModifiers(weather.value);
  car.setWeatherModifiers(m.topSpeedMul, m.accelMul, m.gripAdd);
}
function setWeather(w: typeof weather.value) {
  weather.value = w;
  applyWeather(scene, ambientLight, directionalLight, w);
  setRainEnabled(rain, w === "rain");
  setSnowEnabled(snow, w === "snowy");
  const m = getWeatherModifiers(w);
  car.setWeatherModifiers(m.topSpeedMul, m.accelMul, m.gripAdd);
}

// --- Systems + run state ---
const ctx = { scene, world };
const run = new RunState();
const cops = new CopSystem(ctx);
const civilians = new CivilianSystem(ctx);
const pickups = new PickupSystem(ctx);

// --- Game state machine (just the enum — everything else lives in `run`) ---
let currentState: IGameStateValue = "start";

// Per-frame scratch for the skid emitter — hoisted to avoid two Vec3
// allocations every frame the player is drifting or boosting.
const _rearLocal = new CANNON.Vec3(0, 0, 1.25);
const _rearWorld = new CANNON.Vec3();

function pauseGame() {
  if (currentState !== "playing") return;
  currentState = "paused";
  gameState.value = "paused";
  stopEngine();
  stopSiren();
  stopBgm();
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
});

// --- Window resize ---
function resizeRenderer() {
  const [err] = attempt(() => {
    const w = gameArea.clientWidth;
    const h = gameArea.clientHeight;
    const a = w / h;
    camera.left = -d * a;
    camera.right = d * a;
    camera.top = d;
    camera.bottom = -d;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  if (err) console.error("[resizeRenderer]", err);
}
resizeRenderer();
window.addEventListener("resize", resizeRenderer);
window.addEventListener("orientationchange", () => setTimeout(resizeRenderer, 100));

function startGame() {
  currentState = "playing";
  gameState.value = "playing";
  screen.value = "none";
  isNewBest.value = false;

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

  // Camera teleport
  camera.position.set(50, 55, 50);

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

  // Audio: kick everything on
  initAudio();
  resumeAudio();
  startEngine();
  startBgm();
}

function gameOver(reason: string = "BUSTED") {
  if (currentState === "gameover") return;
  // Stop gameplay immediately so cops/civilians/scoring freeze, but keep
  // the panel hidden until the death moment plays out.
  currentState = "gameover";
  gameOverReason.value = reason;

  // --- Death moment juice (plays on the playfield, no panel yet) ---
  triggerScreenFlash(0.85);
  triggerShake(0.9);
  // Debris burst at the wreck site — confetti + sparks for visible chunks.
  spawnConfetti(car.body.position.x, car.body.position.y + 1, car.body.position.z);
  spawnSparks(car.body.position.x, car.body.position.y + 1, car.body.position.z);
  spawnSparks(car.body.position.x, car.body.position.y + 1.5, car.body.position.z);
  // Drowned wrecks get an extra splash so the cause-of-death reads.
  if (reason === "DROWNED") {
    spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
  }

  // Audio: kill loops immediately, play sting once.
  stopEngine();
  stopSiren();
  stopBgm();
  playGameOver();
  haptics.death();

  // Persist progression now (so the panel reads the right values when it
  // appears) but defer publishing the panel-visible state.
  isNewBest.value = saveBest(Math.floor(run.score));
  incrementRuns();
  addDrownedCops(run.drownedThisRun);
  runDrowned.value = run.drownedThisRun;
  runTopSpeed.value = run.topSpeed;
  runBiggestCombo.value = run.biggestCombo;
  runDistance.value = run.distance;
  runTileScore.value = run.tileScore;
  runComboScore.value = run.comboScore;
  runCopScore.value = run.copScore;

  // Submit score in the background — doesn't block the panel.
  submitScore(playerName.value, run.score).then(() => fetchLeaderboard());

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
  }

  // Engine pitch follows speed
  setEngineSpeed(Math.min(car.body.velocity.length() / car.maxSpeed, 1));

  // --- Pure-state phases (scoring, combo decay, run stats) ---
  run.scoreRoadTile(car);
  run.decayCombo(dt);
  run.recordMovement(car);

  // --- Entity systems ---
  civilians.update(dt, timeInSeconds, car, run);
  pickups.update(dt, timeInSeconds, car, run, cops);
  const { nearestCopDist, nearbyCount } = cops.update(dt, timeInSeconds, car, run);

  // --- HP / death checks ---
  if (run.hp <= 0) {
    run.hp = 0;
    gameOver("WRECKED");
  }

  // --- Water check (player drowning) ---
  const carTileX = Math.floor(car.body.position.x / TILE_SIZE);
  const carTileZ = Math.floor(car.body.position.z / TILE_SIZE);
  if (!isRoad(carTileX, carTileZ) && isWater(carTileX, carTileZ)) {
    playSplash();
    spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
    gameOver("DROWNED");
  }

  // --- Busted: enough cops nearby AND stopped for the threshold ---
  if (nearbyCount >= BUSTED_COP_COUNT && car.body.velocity.length() < BUSTED_STOPPED_SPEED) {
    run.bustedTimer += dt;
    if (run.bustedTimer > BUSTED_TIME_THRESHOLD) gameOver("BUSTED");
  } else {
    run.bustedTimer = Math.max(0, run.bustedTimer - dt * 2);
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

  // --- Siren: on when any cop within range, intensity scales with closeness ---
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
  updateTimeSlow(dt);
  cityGenerator.tick(timeInSeconds);
  updateRain(rain, dt, car.mesh.position.x, car.mesh.position.z);
  updateSnow(snow, dt, car.mesh.position.x, car.mesh.position.z);
  if (currentState === "playing") updatePopups(dt);
  updateCopLights(timeInSeconds);

  if (run.hitPauseTimer > 0) run.hitPauseTimer = Math.max(0, run.hitPauseTimer - dt);

  if (currentState === "playing") {
    // Scale gameplay dt by the active time-slow factor (combo milestone juice).
    // Particles, popups, skids and the camera follow stay at real-time above.
    const slowFactor = getTimeSlowFactor();
    tickPlaying(dt * slowFactor, timeInSeconds);
  }

  // Camera follow car
  camera.position.set(
    car.mesh.position.x + 50,
    car.mesh.position.y + 50,
    car.mesh.position.z + 50,
  );
  applyShake(camera, dt);

  // Move directional light to follow the player
  directionalLight.position.set(
    car.mesh.position.x + 50,
    100,
    car.mesh.position.z + 50,
  );
  directionalLight.target.position.copy(car.mesh.position);

  renderer.render(scene, camera);
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
    }
  });
});

// Start the loop
requestAnimationFrame(animate);
