import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { Cop } from "./entities/cop";
import { CityGenerator, isRoad } from "./world/city-generator";

// --- Scene Setup ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // Vibrant Sky Blue

// --- Isometric Camera Setup ---
const aspect = window.innerWidth / window.innerHeight;
const d = 50; // Zoomed out to show much more of the city and roads
// Orthographic camera for a true isometric look
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);
// Positioned at an equal distance along x, y, z for isometric projection
camera.position.set(50, 50, 50);
camera.lookAt(scene.position);

// --- Renderer Setup ---
// Turn off antialias for a sharper, more pixelated/retro feel
const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
// Limit pixel ratio to 1 for blockier look if desired, or keep device ratio
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
// Enable shadows
renderer.shadowMap.enabled = true;
// Hard shadows for pixelated look
renderer.shadowMap.type = THREE.BasicShadowMap;
document.body.appendChild(renderer.domElement);

// --- Lighting Setup ---
const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
directionalLight.position.set(50, 100, 50);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
// Ensure shadow camera covers the game area
directionalLight.shadow.camera.left = -50;
directionalLight.shadow.camera.right = 50;
directionalLight.shadow.camera.top = 50;
directionalLight.shadow.camera.bottom = -50;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 200;
scene.add(directionalLight);

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

// --- Player Car ---
const car = new Car(scene, world);

// Handle Window Resize
window.addEventListener("resize", () => {
  const aspect = window.innerWidth / window.innerHeight;
  camera.left = -d * aspect;
  camera.right = d * aspect;
  camera.top = d;
  camera.bottom = -d;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// --- Cops Setup ---
const cops: Cop[] = [];
const MAX_COPS = 5;
const COP_SPAWN_INTERVAL = 5; // seconds
let lastCopSpawnTime = 0;
let bustedTimer = 0;
const BUSTED_TIME_THRESHOLD = 2; // seconds

// --- Game State & UI ---
const GAME_STATE = {
  START: 0,
  PLAYING: 1,
  GAMEOVER: 2,
};
let currentState = GAME_STATE.START;
let survivalTime = 0;

const uiStartScreen = document.getElementById("start-screen") as HTMLElement;
const uiGameOverScreen = document.getElementById("game-over-screen") as HTMLElement;
const uiScoreDisplay = document.getElementById("score-display") as HTMLElement;
const uiFinalScore = document.getElementById("final-score") as HTMLElement;
const btnStart = document.getElementById("start-btn") as HTMLElement;
const btnRestart = document.getElementById("restart-btn") as HTMLElement;

function formatTime(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}.${ms.toString().padStart(2, "0")}`;
}

function startGame() {
  currentState = GAME_STATE.PLAYING;
  survivalTime = 0;
  bustedTimer = 0;

  uiStartScreen.classList.remove("visible");
  uiGameOverScreen.classList.remove("visible");

  // Small delay to allow CSS transition to play before hiding
  setTimeout(() => {
    uiStartScreen.style.display = "none";
    uiGameOverScreen.style.display = "none";
    uiScoreDisplay.style.display = "block";
    uiScoreDisplay.innerText = `00:00.00`;
  }, 300);

  // Reset Player
  car.body.position.set(0, 5, 0);
  car.body.velocity.set(0, 0, 0);
  car.body.angularVelocity.set(0, 0, 0);
  car.body.quaternion.set(0, 0, 0, 1);

  // Clear Cops
  cops.forEach((cop) => cop.destroy());
  cops.length = 0;

  lastCallTime = performance.now() / 1000;
  lastCopSpawnTime = lastCallTime;
}

function gameOver() {
  currentState = GAME_STATE.GAMEOVER;
  uiScoreDisplay.style.display = "none";
  uiGameOverScreen.style.display = "block";

  // Force reflow to ensure transition works
  void uiGameOverScreen.offsetWidth;

  uiGameOverScreen.classList.add("visible");
  uiFinalScore.innerText = formatTime(survivalTime);
}

btnStart.addEventListener("click", startGame);
btnRestart.addEventListener("click", startGame);

function spawnCop(playerPosition: THREE.Vector3) {
  if (cops.length >= MAX_COPS) return;

  // Spawn out of camera view (distance ~40-60)
  const distance = 40 + Math.random() * 20;
  const angle = Math.random() * Math.PI * 2;

  let x = playerPosition.x + Math.cos(angle) * distance;
  let z = playerPosition.z + Math.sin(angle) * distance;

  // Snap to nearest road
  const TILE_SIZE = 10;
  let tileX = Math.round(x / TILE_SIZE);
  let tileZ = Math.round(z / TILE_SIZE);

  let foundRoad = false;
  for (let r = 0; r < 5; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (isRoad(tileX + dx, tileZ + dz)) {
          tileX += dx;
          tileZ += dz;
          foundRoad = true;
          break;
        }
      }
      if (foundRoad) break;
    }
    if (foundRoad) break;
  }

  const pos = new THREE.Vector3(tileX * TILE_SIZE, 5, tileZ * TILE_SIZE);
  const cop = new Cop(scene, world, pos);
  cops.push(cop);
}

// --- Game Loop ---
const timeStep = 1 / 60;
let lastCallTime: number | null = null;

function animate(time: number) {
  requestAnimationFrame(animate);

  const timeInSeconds = time / 1000;
  let dt = timeStep;
  if (lastCallTime) {
    dt = timeInSeconds - lastCallTime;
  }
  lastCallTime = timeInSeconds;

  // Run physics and update game world even on start screen so player can test controls
  if (currentState === GAME_STATE.START) {
    world.step(timeStep, dt, 10);
  }
  car.update(dt);
  cityGenerator.update(car.mesh.position);

  if (currentState === GAME_STATE.PLAYING) {
    // Step physics world
    world.step(timeStep, dt, 10);

    // Update survival time
    survivalTime += dt;
    uiScoreDisplay.innerText = formatTime(survivalTime);

    // Cop Spawning Logic
    if (timeInSeconds - lastCopSpawnTime > COP_SPAWN_INTERVAL) {
      spawnCop(car.mesh.position);
      lastCopSpawnTime = timeInSeconds;
    }

    // Update Cops and Check Trapping Logic
    let isCopNearby = false;
    for (let i = cops.length - 1; i >= 0; i--) {
      const cop = cops[i];
      if (!cop) continue;
      cop.update(dt, car.mesh.position);

      // Despawn cops that are too far
      const distToPlayer = cop.body.position.distanceTo(car.body.position);
      if (distToPlayer > 100) {
        cop.destroy();
        cops.splice(i, 1);
        continue;
      }

      // Check if close enough for bust
      if (distToPlayer < 8) {
        isCopNearby = true;
      }
    }

    // Busted Logic
    if (isCopNearby && car.body.velocity.length() < 2) {
      bustedTimer += dt;
      if (bustedTimer > BUSTED_TIME_THRESHOLD) {
        gameOver();
      }
    } else {
      bustedTimer = Math.max(0, bustedTimer - dt);
    }
  }

  // Camera follow car smoothly
  const targetPosition = new THREE.Vector3(
    car.mesh.position.x + 50,
    car.mesh.position.y + 50,
    car.mesh.position.z + 50,
  );
  camera.position.lerp(targetPosition, 0.1);

  // Render
  renderer.render(scene, camera);
}

// Start the loop
requestAnimationFrame(animate);
