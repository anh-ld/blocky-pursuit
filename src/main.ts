import "virtual:uno.css";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { Cop } from "./entities/cop";
import { Civilian } from "./entities/civilian";
import { CityGenerator, isRoad } from "./world/city-generator";
import { isWater, TILE_SIZE } from "./world/terrain";

// --- PWA Install Prompt (mobile only) ---
let deferredPrompt: Event | null = null;
const installBtn = document.getElementById("install-pwa-btn") as HTMLButtonElement | null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.classList.replace("hidden", "flex");
});
installBtn?.addEventListener("click", async () => {
  if (deferredPrompt) {
    (deferredPrompt as any).prompt();
    const { outcome } = await (deferredPrompt as any).userChoice;
    if (outcome === "accepted" && installBtn) installBtn.classList.replace("flex", "hidden");
    deferredPrompt = null;
  } else {
    installBtn!.textContent = "Use browser menu → Add to Home Screen";
    setTimeout(() => { installBtn!.textContent = "📲 Install App"; }, 3000);
  }
});
// Hide if already installed as PWA
if (window.matchMedia("(display-mode: standalone)").matches && installBtn) {
  installBtn.classList.replace("flex", "hidden");
}

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
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.domElement.style.display = "block";
renderer.domElement.style.touchAction = "none";
gameArea.appendChild(renderer.domElement);

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
interface LevelDef {
  maxCops: number;
  spawnInterval: number;
  scoreThreshold: number;
}
const LEVEL_DEFS: LevelDef[] = [
  { maxCops: 3, spawnInterval: 4, scoreThreshold: 0 },     // Level 1 — medium start
  { maxCops: 5, spawnInterval: 3, scoreThreshold: 100 },    // Level 2 — ~10s in
  { maxCops: 6, spawnInterval: 2.5, scoreThreshold: 300 },  // Level 3 — ~30s
  { maxCops: 7, spawnInterval: 2, scoreThreshold: 600 },    // Level 4 — ~55s
  { maxCops: 8, spawnInterval: 1.5, scoreThreshold: 1000 }, // Level 5 — ~80s
];

let currentLevel = 1;
let lastCopSpawnTime = 0;

function getLevelDef(): LevelDef {
  return LEVEL_DEFS[currentLevel - 1];
}

// --- Anonymous Player Name ---
const ADJECTIVES = ["Swift","Sneaky","Turbo","Crazy","Wild","Rapid","Slick","Bold","Lucky","Blazing","Nitro","Shadow","Ghost","Rogue","Neon"];
const NOUNS = ["Racer","Driver","Rider","Drifter","Runner","Chaser","Outlaw","Bandit","Cruiser","Phantom","Maverick","Bullet","Viper","Falcon","Wolf"];

function generateAnonName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
}

function getPlayerName(): string {
  let name = localStorage.getItem("blocky-pursuit-name");
  if (!name) {
    name = generateAnonName();
    localStorage.setItem("blocky-pursuit-name", name);
  }
  return name;
}

const playerName = getPlayerName();

// --- Leaderboard ---
const leaderboardPanel = document.getElementById("leaderboard-panel") as HTMLElement;
const leaderboardList = document.getElementById("leaderboard-list") as HTMLElement;
const leaderboardBtn = document.getElementById("leaderboard-btn") as HTMLElement;
const leaderboardBackBtn = document.getElementById("leaderboard-back-btn") as HTMLElement;
const playerNameDisplay = document.getElementById("player-name") as HTMLElement;
playerNameDisplay.textContent = playerName;

function renderLeaderboard(entries: { name: string; score: number }[]) {
  if (!entries.length) {
    leaderboardList.innerHTML = `<div class="text-gray-500 text-center text-xs py-6">No scores yet. Be the first!</div>`;
    return;
  }
  const medalColors = ["text-amber-400", "text-gray-300", "text-amber-600"];
  leaderboardList.innerHTML = entries
    .slice(0, 10)
    .map((e, i) => {
      const rank = i + 1;
      const medal = medalColors[i] ?? "text-gray-500";
      const isMe = e.name === playerName;
      const displayName = e.name.length > 12 ? e.name.slice(0, 12) + "\u2026" : e.name;
      return `<div class="flex justify-between ${isMe ? "text-amber-300" : "text-gray-400"}">
        <span><span class="${medal}">${rank}.</span> ${displayName}</span>
        <span class="tabular-nums">${e.score.toLocaleString()}</span>
      </div>`;
    })
    .join("");
}

let cachedEntries: { name: string; score: number }[] = [];

async function fetchLeaderboard() {
  try {
    const res = await fetch("/.netlify/functions/leaderboard");
    if (!res.ok) return;
    cachedEntries = await res.json() as { name: string; score: number }[];
    renderLeaderboard(cachedEntries);
  } catch {
    renderLeaderboard([]);
  }
}

async function submitScore(finalScore: number) {
  if (finalScore <= 0) return;
  try {
    await fetch("/.netlify/functions/submit-score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: playerName, score: Math.floor(finalScore) }),
    });
  } catch { /* offline — ignore */ }
}

function showLeaderboard() {
  fetchLeaderboard();
  howToPlay.classList.add("hidden");
  leaderboardPanel.classList.remove("hidden");
}

function hideLeaderboard() {
  leaderboardPanel.classList.add("hidden");
  // Restore how-to-play only if on start screen
  if (currentState === GAME_STATE.START) {
    howToPlay.classList.remove("hidden");
  }
}

leaderboardBtn.addEventListener("click", showLeaderboard);
leaderboardBackBtn.addEventListener("click", hideLeaderboard);

// --- Game State & UI ---
const GAME_STATE = {
  START: 0,
  PLAYING: 1,
  GAMEOVER: 2,
};
let currentState = GAME_STATE.START;
let survivalTime = 0;
let carHP = 100;
let score = 0;
let lastScoreTileX = -9999;
let lastScoreTileZ = -9999;
let speedStreakTimer = 0;
const SPEED_STREAK_THRESHOLD = 5; // seconds at high speed to trigger heal
const SPEED_STREAK_MIN_RATIO = 0.9; // 90% of max speed — requires near-perfect driving

const uiGameTitle = document.getElementById("game-title") as HTMLElement;
const uiTimerDisplay = document.getElementById("timer-display") as HTMLElement;
const uiGameOverReason = document.getElementById("game-over-reason") as HTMLElement;

const uiHPBar = document.getElementById("hp-bar-fill") as HTMLElement;
const uiScoreDisplay = document.getElementById("score-display") as HTMLElement;
const uiLevelDisplay = document.getElementById("level-display") as HTMLElement;
const uiHUD = document.getElementById("hud") as HTMLElement;

const btnStart = document.getElementById("start-btn") as HTMLElement;
const btnRestart = document.getElementById("restart-btn") as HTMLElement;
const mobileBtnStart = document.getElementById("mobile-start-btn") as HTMLElement;
const mobileBtnRestart = document.getElementById("mobile-restart-btn") as HTMLElement;
const mobileCta = document.getElementById("mobile-cta") as HTMLElement;
const mobileControls = document.getElementById("mobile-controls") as HTMLElement;
const darkenOverlay = document.getElementById("darken-overlay") as HTMLElement;
const howToPlay = document.getElementById("how-to-play") as HTMLElement;

function formatTime(seconds: number) {
  const secs = Math.floor(seconds);
  const ms = Math.floor((seconds % 1) * 100);
  return `${secs}:${ms.toString().padStart(2, "0")}`;
}

const HP_COLOR_CLASSES = ['bg-green-400', 'bg-yellow-400', 'bg-red-400'];
let lastHPColorClass = HP_COLOR_CLASSES[0];

function updateHUD() {
  uiHPBar.style.width = `${Math.max(0, carHP)}%`;

  // Color shifts via class swap: green > yellow > red
  const newClass = carHP > 60 ? HP_COLOR_CLASSES[0] : carHP > 30 ? HP_COLOR_CLASSES[1] : HP_COLOR_CLASSES[2];
  if (newClass !== lastHPColorClass) {
    uiHPBar.classList.remove(lastHPColorClass);
    uiHPBar.classList.add(newClass);
    lastHPColorClass = newClass;
  }

  uiScoreDisplay.innerText = `${Math.floor(score)}`;
  uiLevelDisplay.innerText = `LV ${currentLevel}`;
  uiTimerDisplay.innerText = formatTime(survivalTime);
}

function startGame() {
  // Hide start/game-over elements, show HUD
  uiGameTitle.classList.add("hidden");
  btnStart.classList.add("hidden");
  btnRestart.classList.add("hidden");
  uiGameOverReason.classList.add("hidden");
  mobileBtnStart.classList.add("hidden");
  mobileBtnRestart.classList.add("hidden");
  mobileCta.classList.add("hidden");
  howToPlay.classList.add("hidden");
  uiHUD.classList.remove("hidden");
  uiTimerDisplay.classList.remove("hidden");
  // Show mobile touch controls
  mobileControls.classList.remove("hidden");
  mobileControls.classList.add("flex");
  darkenOverlay.classList.add("opacity-0");
  currentState = GAME_STATE.PLAYING;
  hideLeaderboard();
  survivalTime = 0;
  bustedTimer = 0;
  carHP = 100;
  score = 0;
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

  updateHUD();
  lastCallTime = performance.now() / 1000;
  lastCopSpawnTime = lastCallTime;
  lastCivilianSpawnTime = lastCallTime;
}

function gameOver(reason: string = "BUSTED") {
  currentState = GAME_STATE.GAMEOVER;

  // Submit score then refresh leaderboard
  submitScore(score).then(() => fetchLeaderboard());

  // Show reason in top-right (both desktop & mobile)
  uiGameOverReason.innerText = reason;
  uiGameOverReason.classList.remove("hidden");

  // Desktop: show retry in top bar
  btnRestart.classList.remove("hidden");

  // Mobile: hide controls, show retry CTA at bottom center
  mobileControls.classList.add("hidden");
  mobileControls.classList.remove("flex");
  mobileBtnRestart.classList.remove("hidden");
  mobileCta.classList.remove("hidden");
  mobileCta.classList.add("flex");

  darkenOverlay.classList.remove("opacity-0");
}

btnStart.addEventListener("click", startGame);
btnRestart.addEventListener("click", startGame);
mobileBtnStart.addEventListener("click", startGame);
mobileBtnRestart.addEventListener("click", startGame);

function spawnCop(playerPosition: THREE.Vector3, playerVelocity: CANNON.Vec3) {
  const levelDef = getLevelDef();
  if (cops.length >= levelDef.maxCops) return;

  // Spawn out of camera view (distance ~40-60)
  const distance = 40 + Math.random() * 20;

  // 60% of the time, spawn AHEAD of the player's travel direction
  // This prevents the "infinite straight road" exploit
  let angle: number;
  const speed = playerVelocity.length();
  if (speed > 5 && Math.random() < 0.6) {
    // Player's heading angle
    const headingAngle = Math.atan2(playerVelocity.z, playerVelocity.x);
    // Spawn within a ±45° cone ahead
    angle = headingAngle + (Math.random() - 0.5) * (Math.PI / 2);
  } else {
    angle = Math.random() * Math.PI * 2;
  }

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

  const pos = new THREE.Vector3(tileX * TILE_SIZE, 1, tileZ * TILE_SIZE);
  const cop = new Cop(scene, world, pos, currentLevel);
  cops.push(cop);
}

function spawnCivilian(playerPosition: THREE.Vector3) {
  if (civilians.length >= MAX_CIVILIANS) return;

  const distance = 30 + Math.random() * 20;
  const angle = Math.random() * Math.PI * 2;

  let x = playerPosition.x + Math.cos(angle) * distance;
  let z = playerPosition.z + Math.sin(angle) * distance;

  const TS = 10;
  let tileX = Math.floor(x / TS);
  let tileZ = Math.floor(z / TS);

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

  if (!foundRoad) return;

  // Spawn at tile center
  const pos = new THREE.Vector3(tileX * TS + TS / 2, 1, tileZ * TS + TS / 2);
  civilians.push(new Civilian(scene, world, pos));
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

  if (currentState === GAME_STATE.PLAYING) {
    car.update(dt);
    cityGenerator.update(car.mesh.position);
    // Step physics world
    world.step(timeStep, dt, 10);

    // Update survival time
    survivalTime += dt;

    // --- Level Progression ---
    const prevLevel = currentLevel;
    for (let lv = LEVEL_DEFS.length; lv >= 1; lv--) {
      if (score >= LEVEL_DEFS[lv - 1].scoreThreshold) {
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
        score += 1.5 * speedMult;
      }
      lastScoreTileX = scoreTileX;
      lastScoreTileZ = scoreTileZ;
    }

    // --- Civilian Spawning ---
    if (timeInSeconds - lastCivilianSpawnTime > CIVILIAN_SPAWN_INTERVAL) {
      spawnCivilian(car.mesh.position);
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
    const levelDef = getLevelDef();
    if (timeInSeconds - lastCopSpawnTime > levelDef.spawnInterval) {
      spawnCop(car.mesh.position, car.body.velocity);
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
        score += 30; // bonus for cop falling in water
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

    updateHUD();
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
