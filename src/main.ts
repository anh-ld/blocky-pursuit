import "virtual:uno.css";
import { render, h } from "preact";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { Cop } from "./entities/cop";
import { Civilian } from "./entities/civilian";
import { CityGenerator, isRoad } from "./world/city-generator";
import { isWater, TILE_SIZE } from "./world/terrain";
import { LEVEL_DEFS, getLevelDef } from "./systems/leveling";
import { spawnCop, spawnCivilian } from "./systems/spawning";
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

// --- City Generation ---
const cityGenerator = new CityGenerator(scene, world);
// Generate initial chunks around origin for start screen background
cityGenerator.update(new THREE.Vector3(0, 0, 0));

// --- Player Car ---
const car = new Car(scene, world);

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

function syncHud() {
  hp.value = Math.max(0, carHP);
  score.value = scoreLocal;
  level.value = currentLevel;
  survivalTime.value = survivalTimeLocal;
}

function startGame() {
  currentState = "playing";
  gameState.value = "playing";
  screen.value = "none";
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

  syncHud();
  lastCallTime = performance.now() / 1000;
  lastCopSpawnTime = lastCallTime;
  lastCivilianSpawnTime = lastCallTime;
}

function gameOver(reason: string = "BUSTED") {
  currentState = "gameover";
  gameState.value = "gameover";
  gameOverReason.value = reason;

  // Submit score then refresh leaderboard
  submitScore(playerName.value, scoreLocal).then(() => fetchLeaderboard());
}

actions.startGame = startGame;

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

  if (currentState === "playing") {
    car.update(dt);
    cityGenerator.update(car.mesh.position);
    // Step physics world
    world.step(timeStep, dt, 10);

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
    }

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
          // damage = base + (copMass / playerMass) * impactSpeed * multiplier
          const massRatio = cop.config.mass / 100; // player mass is 100
          const damage = 2 + massRatio * impactSpeed * 0.3;
          carHP -= damage;
          cop.damageCooldown = 1.0; // 1 second cooldown per cop
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
    if (nearbyCoCount === 0 && carHP < 100) {
      let anyCopClose = false;
      for (const cop of cops) {
        if (cop.body.position.distanceTo(car.body.position) < 30) {
          anyCopClose = true;
          break;
        }
      }
      if (!anyCopClose) {
        carHP = Math.min(100, carHP + 1 * dt);
      }
    }

    syncHud();
  }

  // Camera follow car
  camera.position.set(
    car.mesh.position.x + 50,
    car.mesh.position.y + 50,
    car.mesh.position.z + 50,
  );

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
