import * as THREE from "three";

export type IWeatherId = "sunny" | "fog" | "rain" | "sunset";

export type IWeatherPreset = {
  id: IWeatherId;
  label: string;
  icon: string;
  sky: [string, string, string]; // top, mid, bottom
  fogColor: number;
  fogNear: number;
  fogFar: number;
  ambientColor: number;
  ambientIntensity: number;
  dirColor: number;
  dirIntensity: number;
};

export const WEATHERS: IWeatherPreset[] = [
  {
    id: "sunny",
    label: "Sunny",
    icon: "☀",
    sky: ["#3a8fd1", "#87ceeb", "#e8f4fb"],
    fogColor: 0xe8f4fb,
    fogNear: 160,
    fogFar: 360,
    ambientColor: 0xffffff,
    ambientIntensity: 0.85,
    dirColor: 0xfff4d6,
    dirIntensity: 1.0,
  },
  {
    id: "fog",
    label: "Foggy",
    icon: "☁",
    sky: ["#3a8fd1", "#87ceeb", "#cfe9f5"],
    fogColor: 0xcfe9f5,
    fogNear: 90,
    fogFar: 240,
    ambientColor: 0xffffff,
    ambientIntensity: 0.7,
    dirColor: 0xffffff,
    dirIntensity: 0.9,
  },
  {
    id: "rain",
    label: "Rainy",
    icon: "🌧",
    sky: ["#4a5568", "#6b7280", "#9ca3af"],
    fogColor: 0x8a93a0,
    fogNear: 60,
    fogFar: 180,
    ambientColor: 0xb8c1cc,
    ambientIntensity: 0.6,
    dirColor: 0xc8d0d8,
    dirIntensity: 0.55,
  },
  {
    id: "sunset",
    label: "Sunset",
    icon: "🌅",
    sky: ["#7a3d8f", "#e85a4f", "#ffb37a"],
    fogColor: 0xf4a673,
    fogNear: 100,
    fogFar: 280,
    ambientColor: 0xffd1a8,
    ambientIntensity: 0.75,
    dirColor: 0xffb070,
    dirIntensity: 1.05,
  },
];

function makeSkyTexture(top: string, mid: string, bottom: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 16;
  c.height = 256;
  const cctx = c.getContext("2d")!;
  const grad = cctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, top);
  grad.addColorStop(0.55, mid);
  grad.addColorStop(1, bottom);
  cctx.fillStyle = grad;
  cctx.fillRect(0, 0, 16, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

export function applyWeather(
  scene: THREE.Scene,
  ambient: THREE.AmbientLight,
  directional: THREE.DirectionalLight,
  id: IWeatherId,
) {
  const w = WEATHERS.find((x) => x.id === id) ?? WEATHERS[0];
  // Dispose old sky texture to avoid GPU leaks on switch
  const prev = scene.background;
  if (prev && (prev as THREE.CanvasTexture).isTexture) {
    (prev as THREE.CanvasTexture).dispose();
  }
  scene.background = makeSkyTexture(w.sky[0], w.sky[1], w.sky[2]);
  if (!scene.fog || !(scene.fog as THREE.Fog).isFog) {
    scene.fog = new THREE.Fog(w.fogColor, w.fogNear, w.fogFar);
  } else {
    const fog = scene.fog as THREE.Fog;
    fog.color.setHex(w.fogColor);
    fog.near = w.fogNear;
    fog.far = w.fogFar;
  }
  ambient.color.setHex(w.ambientColor);
  ambient.intensity = w.ambientIntensity;
  directional.color.setHex(w.dirColor);
  directional.intensity = w.dirIntensity;
}
