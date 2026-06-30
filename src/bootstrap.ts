/* Bootstrap: one-shot infra (scene, world, car, portals, effects). Once/load; per-run lifecycle in main.startGame. */

import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Car } from "./entities/car";
import { CityGenerator } from "./world/city-generator";
import { initEffects, initScreenFlash } from "./world/effects";
import { initPopups } from "./world/popups";
import { initSkids } from "./world/skids";
import { initGhostTrail, setGhostTrailColor } from "./world/ghost-trail";
import {
  applyWeather,
  createRain,
  setRainEnabled,
  createSnow,
  setSnowEnabled,
  getWeatherModifiers,
} from "./world/weather";
import { initPortals } from "./world/portals";
import { getSkin } from "./entities/car-skins";
import type { IWeather } from "./state";

/* Camera zoom constants — exported so main.ts (wreck-zoom lerp) shares values with internal resize/apply. */
export const BASE_CAMERA_D = 50;
export const WRECK_CAMERA_D = 15;

export type IBootstrapOpts = {
  /** Skin id of the car the player picked in the garage at boot. */
  selectedSkinId: string;
  /** Initial weather. */
  initialWeather: IWeather;
  /** Live read of the player name — used by portals for the webring exit. */
  getPlayerName: () => string;
  /** Live read of the *current* selected skin id — survives mid-run skin swaps. */
  getSelectedSkinId: () => string;
};

export type IBootstrap = {
  /* Three.js / cannon graph */
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  renderer: THREE.WebGLRenderer;
  gameArea: HTMLElement;
  world: CANNON.World;
  ambientLight: THREE.AmbientLight;
  directionalLight: THREE.DirectionalLight;

  /* Per-system handles */
  rain: ReturnType<typeof createRain>;
  snow: ReturnType<typeof createSnow>;
  cityGenerator: CityGenerator;
  car: Car;
  portals: ReturnType<typeof initPortals>;

  /* Camera + viewport */
  /** Read the current orthographic half-extent (1 = unit world). */
  getCameraD(): number;
  /** Set the orthographic half-extent and re-apply the projection. */
  setCameraD(d: number): void;
  /** Re-apply the current cameraD to the camera (used by resize). */
  resizeRenderer(): void;

  /* Scene operations that need closure access to scene+lights+car */
  /** Switch the active car skin (rebuilds mesh, updates ghost-trail color). */
  selectSkin(skinId: string): void;
  /** Switch weather (sky, fog, lights, rain/snow particles, car physics). */
  setWeather(w: IWeather): void;
};

export function bootstrap(opts: IBootstrapOpts): IBootstrap {
  /* Scene */
  const scene = new THREE.Scene();

  /* Isometric camera: `cameraD` = half-extent of orthographic frustum. Dying-phase wreck zoom lerps to WRECK_CAMERA_D. */
  let cameraD = BASE_CAMERA_D;
  const aspect = 1;
  const camera = new THREE.OrthographicCamera(-cameraD * aspect, cameraD * aspect, cameraD, -cameraD, 1, 1000);
  camera.position.set(50, 50, 50);
  camera.lookAt(scene.position);

  /* Renderer */
  const gameArea = document.getElementById("game-area") as HTMLElement;
  /* `preserveDrawingBuffer` enables toDataURL() for share-card wreck screenshot. Cost = 1 backbuffer copy/frame. */
  const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true });
  renderer.setSize(gameArea.clientWidth, gameArea.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = false;
  renderer.domElement.style.display = "block";
  renderer.domElement.style.touchAction = "none";
  gameArea.appendChild(renderer.domElement);

  /* Lighting */
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(50, 100, 50);
  scene.add(directionalLight);
  scene.add(directionalLight.target);

  /* Weather (sky + fog + light tint + rain/snow particles) */
  const rain = createRain(scene);
  const snow = createSnow(scene);
  applyWeather(scene, ambientLight, directionalLight, opts.initialWeather);
  setRainEnabled(rain, opts.initialWeather === "rain");
  setSnowEnabled(snow, opts.initialWeather === "snowy");

  /* Cannon-es physics world */
  const world = new CANNON.World({
    gravity: new CANNON.Vec3(0, -30, 0),
    allowSleep: false,
  });
  const groundShape = new CANNON.Plane();
  const groundBody = new CANNON.Body({ mass: 0 });
  groundBody.addShape(groundShape);
  groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  world.addBody(groundBody);

  /* Effect modules (particles, popups, skids, ghost trail, flash overlay) */
  initEffects(scene);
  initPopups(scene);
  initSkids(scene);
  initGhostTrail(scene);
  initScreenFlash(gameArea);

  /* City generation */
  const cityGenerator = new CityGenerator(scene, world);
  cityGenerator.update(new THREE.Vector3(0, 0, 0));

  /* Player car */
  const car = new Car(scene, world, opts.selectedSkinId);

  /* Vibe Jam 2026 portals. Closures read opts.* → portal reflects current identity when webring exit fires. */
  const portals = initPortals({
    scene,
    getPlayerName: () => opts.getPlayerName() || "player",
    getPlayerColorHex: () => "#" + getSkin(opts.getSelectedSkinId()).bodyColor.toString(16).padStart(6, "0"),
    getPlayerSpeedMs: () => car.body.velocity.length(),
  });

  /* Init ghost-trail color for starting skin → first nitro burst paints the right color (no first-frame flash). */
  setGhostTrailColor(getSkin(opts.selectedSkinId).bodyColor);

  /* Apply the current weather's driving modifiers to the freshly built car. */
  {
    const m = getWeatherModifiers(opts.initialWeather);
    car.setWeatherModifiers(m.topSpeedMul, m.accelMul, m.gripAdd);
  }

  /* Camera viewport helpers */
  function applyCameraZoom() {
    const w = gameArea.clientWidth;
    const h = gameArea.clientHeight;
    const a = w / h;
    camera.left = -cameraD * a;
    camera.right = cameraD * a;
    camera.top = cameraD;
    camera.bottom = -cameraD;
    camera.updateProjectionMatrix();
  }
  function resizeRenderer() {
    const w = gameArea.clientWidth;
    const h = gameArea.clientHeight;
    renderer.setSize(w, h);
    applyCameraZoom();
  }
  resizeRenderer();

  /* Scene operations */
  function selectSkin(skinId: string) {
    car.applySkin(skinId);
    /* Keep nitro ghost trail in sync with active car color → silhouettes match the driven body paint. */
    setGhostTrailColor(getSkin(skinId).bodyColor);
  }
  function setWeather(w: IWeather) {
    applyWeather(scene, ambientLight, directionalLight, w);
    setRainEnabled(rain, w === "rain");
    setSnowEnabled(snow, w === "snowy");
    const m = getWeatherModifiers(w);
    car.setWeatherModifiers(m.topSpeedMul, m.accelMul, m.gripAdd);
  }

  return {
    scene,
    camera,
    renderer,
    gameArea,
    world,
    ambientLight,
    directionalLight,
    rain,
    snow,
    cityGenerator,
    car,
    portals,
    getCameraD: () => cameraD,
    setCameraD: (d: number) => {
      cameraD = d;
      applyCameraZoom();
    },
    resizeRenderer,
    selectSkin,
    setWeather,
  };
}
