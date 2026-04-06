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
import {
  initEffects,
  initScreenFlash,
  applyShake,
  spawnSplash,
  updateEffects,
  updateTimeSlow,
  getTimeSlowFactor,
} from "./world/effects";
import { initPopups, spawnPopup, updatePopups } from "./world/popups";
import { initSkids, spawnSkid, updateSkids, clearSkids } from "./world/skids";
import { applyWeather } from "./world/weather";
import { App } from "./ui/app";
import {
  gameState,
  gameOverReason,
  screen,
  playerName,
  canInstallPwa,
  actions,
  saveBest,
  isNewBest,
  runDrowned,
  runTopSpeed,
  runBiggestCombo,
  runDistance,
  selectedSkin,
  setSelectedSkin,
  incrementRuns,
  addDrownedCops,
  audioMuted,
  weather,
} from "./state";
import { fetchLeaderboard, submitScore, getPlayerName } from "./api";

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
actions.installPwa = async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") canInstallPwa.value = false;
    deferredPrompt = null;
  }
};

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

// --- Weather (sky + fog + light tint) ---
applyWeather(scene, ambientLight, directionalLight, weather.value);
actions.setWeather = (w) => {
  weather.value = w;
  applyWeather(scene, ambientLight, directionalLight, w);
};

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

actions.selectSkin = (skinId: string) => {
  setSelectedSkin(skinId);
  car.applySkin(skinId);
};

// --- Systems + run state ---
const ctx = { scene, world };
const run = new RunState();
const cops = new CopSystem(ctx);
const civilians = new CivilianSystem(ctx);
const pickups = new PickupSystem(ctx);

// Tuning constants that stay in main (orchestration-level)
const BUSTED_TIME_THRESHOLD = 3;
const BUSTED_COP_COUNT = 2;
const SPEED_STREAK_THRESHOLD = 5;
const SPEED_STREAK_MIN_RATIO = 0.9;

// --- Game state machine (just the enum — everything else lives in `run`) ---
type IGameStateValue = "start" | "playing" | "paused" | "gameover";
let currentState: IGameStateValue = "start";

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

actions.togglePause = () => {
  if (currentState === "playing") pauseGame();
  else if (currentState === "paused") resumeGame();
};

window.addEventListener("keydown", (e) => {
  if (e.code !== "Space" && e.key !== " ") return;
  if (currentState === "playing") {
    e.preventDefault();
    pauseGame();
  } else if (currentState === "paused") {
    e.preventDefault();
    resumeGame();
  }
});

// --- Window resize ---
function resizeRenderer() {
  const w = gameArea.clientWidth;
  const h = gameArea.clientHeight;
  const a = w / h;
  camera.left = -d * a;
  camera.right = d * a;
  camera.top = d;
  camera.bottom = -d;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
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
  car.maxSpeed = car.baseMaxSpeed;
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

  // Audio: kick everything on
  initAudio();
  resumeAudio();
  startEngine();
  startBgm();
}

function gameOver(reason: string = "BUSTED") {
  if (currentState === "gameover") return;
  currentState = "gameover";
  gameState.value = "gameover";
  gameOverReason.value = reason;

  // Persist progression
  isNewBest.value = saveBest(Math.floor(run.score));
  incrementRuns();
  addDrownedCops(run.drownedThisRun);

  // Publish run summary stats
  runDrowned.value = run.drownedThisRun;
  runTopSpeed.value = run.topSpeed;
  runBiggestCombo.value = run.biggestCombo;
  runDistance.value = run.distance;

  // Audio: stop loops, play sting
  stopEngine();
  stopSiren();
  stopBgm();
  playGameOver();

  // Submit score then refresh leaderboard
  submitScore(playerName.value, run.score).then(() => fetchLeaderboard());
}

actions.startGame = startGame;
actions.toggleSound = () => {
  initAudio();
  resumeAudio();
  toggleMute();
  audioMuted.value = isMuted();
};

// --- Game Loop ---
const timeStep = 1 / 60;
let lastCallTime: number | null = null;
let spawnTimersRebased = true;

function tickPlaying(dt: number, timeInSeconds: number) {
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
    run.hp = Math.min(100, run.hp + 15);
    playLevelUp();
    spawnPopup(car.body.position.x, car.body.position.y + 1, car.body.position.z, `LV ${run.level}`, "#ffaa22");
    spawnPopup(car.body.position.x, car.body.position.y + 2, car.body.position.z, "+15 HP", "#66ff88");
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

  // --- Busted: 2+ cops nearby AND stopped for 3s ---
  if (nearbyCount >= BUSTED_COP_COUNT && car.body.velocity.length() < 2) {
    run.bustedTimer += dt;
    if (run.bustedTimer > BUSTED_TIME_THRESHOLD) gameOver("BUSTED");
  } else {
    run.bustedTimer = Math.max(0, run.bustedTimer - dt * 2);
  }

  // --- Speed streak heal: +5 HP after 5s at 90%+ max speed ---
  if (car.body.velocity.length() >= car.maxSpeed * SPEED_STREAK_MIN_RATIO) {
    run.speedStreakTimer += dt;
    if (run.speedStreakTimer >= SPEED_STREAK_THRESHOLD) {
      run.hp = Math.min(100, run.hp + 5);
      run.speedStreakTimer = 0;
      spawnPopup(car.body.position.x, car.body.position.y + 2, car.body.position.z, "+5 HP", "#66ff88");
    }
  } else {
    run.speedStreakTimer = 0;
  }

  // --- Passive HP regen: +1 HP/s when no cop within 30 units ---
  if (nearbyCount === 0 && run.hp < 100 && nearestCopDist >= 30) {
    run.hp = Math.min(100, run.hp + 1 * dt);
  }

  // --- Siren: on when any cop within 40, intensity scales with closeness ---
  let sirenIntensity = 0;
  if (currentState === "playing" && nearestCopDist < 40) {
    startSiren();
    sirenIntensity = 1 - nearestCopDist / 40;
    setSirenVolume(sirenIntensity);
  } else {
    stopSiren();
  }
  setBgmDuck(sirenIntensity);

  // --- Skid marks: emit at rear wheels when drifting hard or boosting ---
  const isDrifting = car.lateralSpeed > 4;
  const isBoosting = run.nitroTimer > 0 && car.body.velocity.length() > car.baseMaxSpeed * 0.6;
  if (isDrifting || isBoosting) {
    const rearLocal = new CANNON.Vec3(0, 0, 1.25);
    const rearWorld = new CANNON.Vec3();
    car.body.pointToWorldFrame(rearLocal, rearWorld);
    // Yaw extracted from quaternion. Safe because cannon angularFactor is
    // constrained to (0,1,0) so x/z components of the quaternion stay zero.
    const heading = Math.atan2(
      2 * (car.body.quaternion.w * car.body.quaternion.y),
      1 - 2 * car.body.quaternion.y * car.body.quaternion.y,
    );
    const offX = Math.cos(heading) * 1.25;
    const offZ = -Math.sin(heading) * 1.25;
    spawnSkid(rearWorld.x + offX, rearWorld.z + offZ, heading);
    spawnSkid(rearWorld.x - offX, rearWorld.z - offZ, heading);
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
  if (document.hidden) {
    if (currentState === "playing") {
      pauseGame();
    }
  } else {
    lastCallTime = null;
    spawnTimersRebased = false;
    if (currentState === "playing") {
      initAudio();
      resumeAudio();
      startEngine();
      startBgm();
    }
  }
});

// Start the loop
requestAnimationFrame(animate);
