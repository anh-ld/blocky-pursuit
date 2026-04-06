import "virtual:uno.css";
import { render, h } from "preact";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { Cop } from "./entities/cop";
import { Civilian } from "./entities/civilian";
import { Pickup, type IPickupKind } from "./entities/pickup";
import { CityGenerator, isRoad } from "./world/city-generator";
import { isWater, TILE_SIZE } from "./world/terrain";
import { LEVEL_DEFS, getLevelDef } from "./systems/leveling";
import { spawnCop, spawnCivilian } from "./systems/spawning";
import {
  initAudio,
  resumeAudio,
  startEngine,
  stopEngine,
  setEngineSpeed,
  startSiren,
  stopSiren,
  setSirenVolume,
  playCrash,
  playSplash,
  playPickup,
  playLevelUp,
  playGameOver,
} from "./audio/sound";
import {
  initEffects,
  triggerShake,
  applyShake,
  spawnSparks,
  spawnSplash,
  spawnConfetti,
  updateEffects,
} from "./world/effects";
import { App } from "./ui/app";
import {
  gameState,
  hp,
  score,
  level,
  survivalTime,
  gameOverReason,
  screen,
  playerName,
  canInstallPwa,
  actions,
  saveBest,
  isNewBest,
  nitroRemaining,
  shieldUp,
  selectedSkin,
  setSelectedSkin,
  incrementRuns,
  addDrownedCops,
} from "./state";
import { fetchLeaderboard, submitScore, getPlayerName } from "./api";

// --- Mount Preact UI first so #game-area exists for the canvas ---
const appRoot = document.getElementById("app") as HTMLElement;
render(h(App, null), appRoot);

// --- Player name ---
playerName.value = getPlayerName();

// --- PWA Install Prompt (mobile only) ---
let deferredPrompt: any = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
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
scene.background = new THREE.Color(0x87ceeb); // Vibrant Sky Blue

// --- Isometric Camera Setup ---
const aspect = 1; // will be set properly after gameArea is measured
const d = 50; // Zoomed out to show much more of the city and roads
// Orthographic camera for a true isometric look
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
// Positioned at an equal distance along x, y, z for isometric projection
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

// --- Cannon-es World Setup ---
const world = new CANNON.World({
  gravity: new CANNON.Vec3(0, -30, 0), // Increased gravity to keep cars planted
  allowSleep: false, // Disable sleeping entirely for the whole world
});

// Create a ground plane (Physics)
const groundShape = new CANNON.Plane();
const groundBody = new CANNON.Body({ mass: 0 }); // mass 0 makes it static
groundBody.addShape(groundShape);
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0); // Rotate to be horizontal
world.addBody(groundBody);

// --- Effects (particles, screen shake) ---
initEffects(scene);

// --- City Generation ---
const cityGenerator = new CityGenerator(scene, world);
// Generate initial chunks around origin for start screen background
cityGenerator.update(new THREE.Vector3(0, 0, 0));

// --- Player Car ---
const car = new Car(scene, world, selectedSkin.value);

actions.selectSkin = (skinId: string) => {
  setSelectedSkin(skinId);
  car.applySkin(skinId);
};

// Handle Window Resize
function resizeRenderer() {
  const w = gameArea.clientWidth;
  const h = gameArea.clientHeight;
  const aspect = w / h;
  camera.left = -d * aspect;
  camera.right = d * aspect;
  camera.top = d;
  camera.bottom = -d;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}
resizeRenderer();
window.addEventListener("resize", resizeRenderer);
window.addEventListener("orientationchange", () => setTimeout(resizeRenderer, 100));

// --- Civilians Setup ---
const civilians: Civilian[] = [];
const MAX_CIVILIANS = 8;
const CIVILIAN_SPAWN_INTERVAL = 2; // seconds
let lastCivilianSpawnTime = 0;

// --- Cops Setup ---
const cops: Cop[] = [];
let bustedTimer = 0;
const BUSTED_TIME_THRESHOLD = 3; // seconds stopped
const BUSTED_COP_COUNT = 2; // 2 cops nearby is enough

// --- Level System ---
let currentLevel = 1;
let lastCopSpawnTime = 0;

// --- Game state (local mirrors of signals for hot loop) ---
let currentState: "start" | "playing" | "gameover" = "start";
let survivalTimeLocal = 0;
let carHP = 100;
let scoreLocal = 0;
let lastScoreTileX = -9999;
let lastScoreTileZ = -9999;
let speedStreakTimer = 0;
const SPEED_STREAK_THRESHOLD = 5; // seconds at high speed to trigger heal
const SPEED_STREAK_MIN_RATIO = 0.9; // 90% of max speed — requires near-perfect driving
let hitPauseTimer = 0; // freezes physics for a few frames on heavy impact
let drownedThisRun = 0; // tracked for progression / unlocks

// --- Power-ups ---
const pickups: Pickup[] = [];
const MAX_PICKUPS = 4;
const PICKUP_SPAWN_INTERVAL = 6;
let lastPickupSpawnTime = 0;
let nitroTimer = 0;
let shieldActive = false;
const NITRO_DURATION = 3;
const NITRO_SPEED_MULT = 1.55;
const PICKUP_KINDS: IPickupKind[] = ["nitro", "shield", "emp"];

function syncHud() {
  hp.value = Math.max(0, carHP);
  score.value = scoreLocal;
  level.value = currentLevel;
  survivalTime.value = survivalTimeLocal;
  nitroRemaining.value = nitroTimer;
  shieldUp.value = shieldActive;
}

function startGame() {
  currentState = "playing";
  gameState.value = "playing";
  screen.value = "none";
  isNewBest.value = false;
  survivalTimeLocal = 0;
  bustedTimer = 0;
  carHP = 100;
  scoreLocal = 0;
  currentLevel = 1;
  lastScoreTileX = -9999;
  lastScoreTileZ = -9999;
  speedStreakTimer = 0;

  // Reset Player
  car.body.position.set(0, 1, 0);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  car.bounceBackTimer = 0;
  car.recoveryTimer = 0;
  car.setRandomDirection();

  // Instantly teleport camera to player so it doesn't lerp across the map
  camera.position.set(50, 55, 50);

  // Clear Cops
  cops.forEach((cop) => cop.destroy());
  cops.length = 0;

  // Clear Civilians
  civilians.forEach((c) => c.destroy());
  civilians.length = 0;

  // Clear pickups + reset buffs
  pickups.forEach((p) => p.destroy());
  pickups.length = 0;
  nitroTimer = 0;
  shieldActive = false;
  car.maxSpeed = car.baseMaxSpeed;
  drownedThisRun = 0;

  syncHud();
  lastCallTime = performance.now() / 1000;
  lastCopSpawnTime = lastCallTime;
  lastCivilianSpawnTime = lastCallTime;
  lastPickupSpawnTime = lastCallTime;

  // Audio: kick everything on
  initAudio();
  resumeAudio();
  startEngine();
}

function gameOver(reason: string = "BUSTED") {
  if (currentState === "gameover") return; // idempotent — same frame may trigger multiple checks
  currentState = "gameover";
  gameState.value = "gameover";
  gameOverReason.value = reason;

  // Persist progression
  isNewBest.value = saveBest(Math.floor(scoreLocal));
  incrementRuns();
  addDrownedCops(drownedThisRun);

  // Audio: stop loops, play sting
  stopEngine();
  stopSiren();
  playGameOver();

  // Submit score then refresh leaderboard
  submitScore(playerName.value, scoreLocal).then(() => fetchLeaderboard());
}

actions.startGame = startGame;

// --- Pickup spawn helper (snap to a road tile near player) ---
function spawnPickup(playerPosition: THREE.Vector3) {
  if (pickups.length >= MAX_PICKUPS) return;
  const distance = 25 + Math.random() * 20;
  const angle = Math.random() * Math.PI * 2;
  const x = playerPosition.x + Math.cos(angle) * distance;
  const z = playerPosition.z + Math.sin(angle) * distance;
  let tileX = Math.floor(x / TILE_SIZE);
  let tileZ = Math.floor(z / TILE_SIZE);
  let found = false;
  for (let r = 0; r < 4 && !found; r++) {
    for (let dx = -r; dx <= r && !found; dx++) {
      for (let dz = -r; dz <= r && !found; dz++) {
        if (isRoad(tileX + dx, tileZ + dz)) {
          tileX += dx;
          tileZ += dz;
          found = true;
        }
      }
    }
  }
  if (!found) return;
  const kind = PICKUP_KINDS[Math.floor(Math.random() * PICKUP_KINDS.length)];
  const pos = new THREE.Vector3(tileX * TILE_SIZE + TILE_SIZE / 2, 1, tileZ * TILE_SIZE + TILE_SIZE / 2);
  pickups.push(new Pickup(scene, pos, kind));
}

// --- Game Loop ---
const timeStep = 1 / 60;
let lastCallTime: number | null = null;

function animate(time: number) {
  requestAnimationFrame(animate);

  const timeInSeconds = time / 1000;
  let dt = timeStep;
  if (lastCallTime) {
    // Cap dt so a tab refocus / long pause can't blow up physics
    dt = Math.min(timeInSeconds - lastCallTime, 1 / 30);
  }
  lastCallTime = timeInSeconds;

  // Always run particles even when paused so death animation can play
  updateEffects(dt);

  // Tick down hit pause and short-circuit physics step while active
  if (hitPauseTimer > 0) hitPauseTimer = Math.max(0, hitPauseTimer - dt);

  if (currentState === "playing") {
    car.update(dt);
    cityGenerator.update(car.mesh.position);
    // Step physics world (skip during hit pause for impact emphasis)
    if (hitPauseTimer <= 0) {
      world.step(timeStep, dt, 10);
    }

    // Update survival time
    survivalTimeLocal += dt;

    // --- Level Progression ---
    const prevLevel = currentLevel;
    for (let lv = LEVEL_DEFS.length; lv >= 1; lv--) {
      if (scoreLocal >= LEVEL_DEFS[lv - 1].scoreThreshold) {
        if (lv > currentLevel) {
          currentLevel = lv;
        }
        break;
      }
    }
    // Level-up heal: +15 HP per level gained
    if (currentLevel > prevLevel) {
      carHP = Math.min(100, carHP + 15);
      playLevelUp();
    }

    // Engine pitch follows speed
    setEngineSpeed(Math.min(car.body.velocity.length() / car.maxSpeed, 1));

    // --- Score: distance on road tiles ---
    const scoreTileX = Math.floor(car.body.position.x / TILE_SIZE);
    const scoreTileZ = Math.floor(car.body.position.z / TILE_SIZE);
    if (scoreTileX !== lastScoreTileX || scoreTileZ !== lastScoreTileZ) {
      if (isRoad(scoreTileX, scoreTileZ)) {
        // Speed multiplier: 1x at speed 0, up to 2x at maxSpeed
        const speedRatio = Math.min(car.body.velocity.length() / car.maxSpeed, 1);
        const speedMult = 1 + speedRatio;
        scoreLocal += 1.5 * speedMult;
      }
      lastScoreTileX = scoreTileX;
      lastScoreTileZ = scoreTileZ;
    }

    // --- Civilian Spawning ---
    if (timeInSeconds - lastCivilianSpawnTime > CIVILIAN_SPAWN_INTERVAL) {
      spawnCivilian({
        scene,
        world,
        civilians,
        maxCivilians: MAX_CIVILIANS,
        playerPosition: car.mesh.position,
      });
      lastCivilianSpawnTime = timeInSeconds;
    }

    // --- Update Civilians ---
    for (let i = civilians.length - 1; i >= 0; i--) {
      const civ = civilians[i];
      if (!civ) continue;
      civ.update(dt);

      const distToPlayer = civ.body.position.distanceTo(car.body.position);

      // Despawn far civilians
      if (distToPlayer > 80) {
        civ.destroy();
        civilians.splice(i, 1);
        continue;
      }

      // Stun on collision with player
      if (distToPlayer < 5 && civ.stunTimer <= 0) {
        civ.stun();
      }
    }

    // --- Pickup spawning + update + collection ---
    if (timeInSeconds - lastPickupSpawnTime > PICKUP_SPAWN_INTERVAL) {
      spawnPickup(car.mesh.position);
      lastPickupSpawnTime = timeInSeconds;
    }
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      p.update(dt);
      const dxp = p.position.x - car.body.position.x;
      const dzp = p.position.z - car.body.position.z;
      const dist = Math.sqrt(dxp * dxp + dzp * dzp);
      // Despawn far pickups
      if (dist > 80 || p.age > 25) {
        p.destroy();
        pickups.splice(i, 1);
        continue;
      }
      // Collect on touch
      if (dist < 3.5) {
        playPickup();
        spawnConfetti(p.position.x, 2, p.position.z);
        if (p.kind === "nitro") {
          nitroTimer = NITRO_DURATION;
          car.maxSpeed = car.baseMaxSpeed * NITRO_SPEED_MULT;
        } else if (p.kind === "shield") {
          shieldActive = true;
        } else if (p.kind === "emp") {
          // Stun-knock all cops within 30u (destroy them for big bonus)
          for (let ci = cops.length - 1; ci >= 0; ci--) {
            const c = cops[ci];
            if (c.body.position.distanceTo(car.body.position) < 30) {
              spawnConfetti(c.body.position.x, c.body.position.y + 2, c.body.position.z);
              scoreLocal += 20;
              c.destroy();
              cops.splice(ci, 1);
            }
          }
          triggerShake(0.6);
        }
        p.destroy();
        pickups.splice(i, 1);
      }
    }

    // --- Nitro tick ---
    if (nitroTimer > 0) {
      nitroTimer = Math.max(0, nitroTimer - dt);
      if (nitroTimer === 0) car.maxSpeed = car.baseMaxSpeed;
    }

    // --- Cop Spawning Logic ---
    const levelDef = getLevelDef(currentLevel);
    if (timeInSeconds - lastCopSpawnTime > levelDef.spawnInterval) {
      spawnCop({
        scene,
        world,
        cops,
        maxCops: levelDef.maxCops,
        level: currentLevel,
        playerPosition: car.mesh.position,
        playerVelocity: car.body.velocity,
      });
      lastCopSpawnTime = timeInSeconds;
    }

    // --- Update Cops, Check Collisions & Proximity ---
    let nearbyCoCount = 0;
    for (let i = cops.length - 1; i >= 0; i--) {
      const cop = cops[i];
      if (!cop) continue;
      cop.update(dt, car.mesh.position, car.body.velocity);

      const distToPlayer = cop.body.position.distanceTo(car.body.position);

      // Despawn cops that are too far
      if (distToPlayer > 100) {
        cop.destroy();
        cops.splice(i, 1);
        continue;
      }

      // --- Collision damage ---
      if (distToPlayer < 5 && cop.damageCooldown <= 0) {
        // Relative impact speed
        const relVel = new CANNON.Vec3();
        car.body.velocity.vsub(cop.body.velocity, relVel);
        const impactSpeed = relVel.length();

        if (impactSpeed > 3) {
          if (shieldActive) {
            // Shield absorbs the hit and dies
            shieldActive = false;
            spawnConfetti(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            playPickup();
            cop.damageCooldown = 1.0;
          } else {
            // damage = base + (copMass / playerMass) * impactSpeed * multiplier
            const massRatio = cop.config.mass / 100; // player mass is 100
            const damage = 2 + massRatio * impactSpeed * 0.3;
            carHP -= damage;
            cop.damageCooldown = 1.0; // 1 second cooldown per cop
            playCrash();
            triggerShake(0.4 + Math.min(impactSpeed / 30, 0.6));
            spawnSparks(car.body.position.x, car.body.position.y + 1, car.body.position.z);
            hitPauseTimer = 0.05;
          }
        }
      } else if (distToPlayer < 12) {
        // Near-miss bonus: cop close but no collision
        // (scored passively via speed multiplier on road tiles)
      }

      // Count cops close enough for busted check
      if (distToPlayer < 8) {
        nearbyCoCount++;
      }
    }

    // --- HP check ---
    if (carHP <= 0) {
      carHP = 0;
      gameOver("WRECKED");
    }

    // --- Water check ---
    const carTileX = Math.floor(car.body.position.x / TILE_SIZE);
    const carTileZ = Math.floor(car.body.position.z / TILE_SIZE);
    if (!isRoad(carTileX, carTileZ) && isWater(carTileX, carTileZ)) {
      playSplash();
      spawnSplash(car.body.position.x, car.body.position.y, car.body.position.z);
      gameOver("DROWNED");
    }

    // Civilians die in water — just remove
    for (let i = civilians.length - 1; i >= 0; i--) {
      const civ = civilians[i];
      if (!civ) continue;
      const civTileX = Math.floor(civ.body.position.x / TILE_SIZE);
      const civTileZ = Math.floor(civ.body.position.z / TILE_SIZE);
      if (!isRoad(civTileX, civTileZ) && isWater(civTileX, civTileZ)) {
        civ.destroy();
        civilians.splice(i, 1);
      }
    }

    // Cops die in water — bonus score
    for (let i = cops.length - 1; i >= 0; i--) {
      const cop = cops[i];
      if (!cop) continue;
      const copTileX = Math.floor(cop.body.position.x / TILE_SIZE);
      const copTileZ = Math.floor(cop.body.position.z / TILE_SIZE);
      if (!isRoad(copTileX, copTileZ) && isWater(copTileX, copTileZ)) {
        scoreLocal += 30; // bonus for cop falling in water
        carHP = Math.min(100, carHP + 10); // heal for luring cop into water
        drownedThisRun++;
        playSplash();
        spawnSplash(cop.body.position.x, cop.body.position.y, cop.body.position.z);
        spawnConfetti(cop.body.position.x, cop.body.position.y + 2, cop.body.position.z);
        cop.destroy();
        cops.splice(i, 1);
      }
    }

    // --- Busted Logic (need 2+ cops nearby AND stopped for 3s) ---
    if (nearbyCoCount >= BUSTED_COP_COUNT && car.body.velocity.length() < 2) {
      bustedTimer += dt;
      if (bustedTimer > BUSTED_TIME_THRESHOLD) {
        gameOver("BUSTED");
      }
    } else {
      bustedTimer = Math.max(0, bustedTimer - dt * 2); // decays faster
    }

    // --- Speed streak heal: +5 HP after 5s at 80%+ max speed ---
    if (car.body.velocity.length() >= car.maxSpeed * SPEED_STREAK_MIN_RATIO) {
      speedStreakTimer += dt;
      if (speedStreakTimer >= SPEED_STREAK_THRESHOLD) {
        carHP = Math.min(100, carHP + 5);
        speedStreakTimer = 0; // reset so it can trigger again
      }
    } else {
      speedStreakTimer = 0;
    }

    // --- Passive HP regen: +1 HP/s when no cop within 30 units ---
    let nearestCopDist = Infinity;
    for (const cop of cops) {
      const d = cop.body.position.distanceTo(car.body.position);
      if (d < nearestCopDist) nearestCopDist = d;
    }
    if (nearbyCoCount === 0 && carHP < 100 && nearestCopDist >= 30) {
      carHP = Math.min(100, carHP + 1 * dt);
    }

    // --- Siren: on when any cop within 40, intensity scales with closeness ---
    // Guarded on state because gameOver() may have flipped state mid-frame and
    // we don't want to restart the siren after the run ends.
    if (currentState === "playing" && nearestCopDist < 40) {
      startSiren();
      const intensity = 1 - nearestCopDist / 40;
      setSirenVolume(intensity);
    } else {
      stopSiren();
    }

    syncHud();
  }

  // Camera follow car
  camera.position.set(
    car.mesh.position.x + 50,
    car.mesh.position.y + 50,
    car.mesh.position.z + 50,
  );
  applyShake(camera, dt);

  // Move directional light + shadow camera to follow the player
  directionalLight.position.set(
    car.mesh.position.x + 50,
    100,
    car.mesh.position.z + 50,
  );
  directionalLight.target.position.copy(car.mesh.position);

  renderer.render(scene, camera);
}

// Start the loop
requestAnimationFrame(animate);
