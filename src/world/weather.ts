import * as THREE from "three";

export type IWeatherId = "sunny" | "fog" | "rain" | "sunset" | "snowy";

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
    id: "snowy",
    label: "Snowy",
    icon: "❄",
    sky: ["#3f4a5c", "#6c7a8c", "#a8b3c0"],
    fogColor: 0xa8b3c0,
    fogNear: 70,
    fogFar: 200,
    ambientColor: 0xe6ecf2,
    ambientIntensity: 0.8,
    dirColor: 0xe0e6ee,
    dirIntensity: 0.7,
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

// --- Rain particle system ---------------------------------------------------
// Vertical streaks rendered as LineSegments above the player. Each streak is
// two vertices (top + bottom) packed into a single BufferGeometry. Streaks
// fall, then recycle to a fresh random position above the camera follow area.

const RAIN_COUNT = 600;
const RAIN_AREA = 90; // half-extent of the box around the player
const RAIN_HEIGHT = 60;
const RAIN_FALL_SPEED = 70;
const RAIN_STREAK_LEN = 1.4;

export type IRain = {
  group: THREE.LineSegments;
  positions: Float32Array;
  enabled: boolean;
};

export function createRain(scene: THREE.Scene): IRain {
  const positions = new Float32Array(RAIN_COUNT * 2 * 3);
  for (let i = 0; i < RAIN_COUNT; i++) {
    const x = (Math.random() - 0.5) * 2 * RAIN_AREA;
    const z = (Math.random() - 0.5) * 2 * RAIN_AREA;
    const y = Math.random() * RAIN_HEIGHT;
    const o = i * 6;
    positions[o + 0] = x;
    positions[o + 1] = y + RAIN_STREAK_LEN;
    positions[o + 2] = z;
    positions[o + 3] = x;
    positions[o + 4] = y;
    positions[o + 5] = z;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const mat = new THREE.LineBasicMaterial({
    color: 0xc8d8ec,
    transparent: true,
    opacity: 0.55,
    fog: true,
  });
  const lines = new THREE.LineSegments(geom, mat);
  lines.frustumCulled = false;
  lines.visible = false;
  scene.add(lines);
  return { group: lines, positions, enabled: false };
}

export function updateRain(rain: IRain, dt: number, centerX: number, centerZ: number) {
  if (!rain.enabled) return;
  // Streak positions are stored in local space relative to the group, which
  // we anchor on the player so the rain field always surrounds them.
  rain.group.position.x = centerX;
  rain.group.position.z = centerZ;
  const pos = rain.positions;
  const fall = RAIN_FALL_SPEED * dt;
  for (let i = 0; i < RAIN_COUNT; i++) {
    const o = i * 6;
    pos[o + 1] -= fall;
    pos[o + 4] -= fall;
    if (pos[o + 4] < 0) {
      const x = (Math.random() - 0.5) * 2 * RAIN_AREA;
      const z = (Math.random() - 0.5) * 2 * RAIN_AREA;
      const y = RAIN_HEIGHT * (0.5 + Math.random() * 0.5);
      pos[o + 0] = x;
      pos[o + 1] = y + RAIN_STREAK_LEN;
      pos[o + 2] = z;
      pos[o + 3] = x;
      pos[o + 4] = y;
      pos[o + 5] = z;
    }
  }
  (rain.group.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

export function setRainEnabled(rain: IRain, enabled: boolean) {
  rain.enabled = enabled;
  rain.group.visible = enabled;
}

// --- Snow particle system ---------------------------------------------------
// Drifting flakes rendered as Points. Slower fall than rain, with a sideways
// sin-wave drift so the field feels alive instead of marching straight down.

const SNOW_COUNT = 700;
const SNOW_AREA = 90;
const SNOW_HEIGHT = 60;
const SNOW_FALL_SPEED = 8;
const SNOW_DRIFT_AMP = 4;

export type ISnow = {
  group: THREE.Points;
  positions: Float32Array;
  phases: Float32Array;
  enabled: boolean;
  time: number;
};

function makeSnowflakeTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext("2d")!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export function createSnow(scene: THREE.Scene): ISnow {
  const positions = new Float32Array(SNOW_COUNT * 3);
  const phases = new Float32Array(SNOW_COUNT);
  for (let i = 0; i < SNOW_COUNT; i++) {
    positions[i * 3 + 0] = (Math.random() - 0.5) * 2 * SNOW_AREA;
    positions[i * 3 + 1] = Math.random() * SNOW_HEIGHT;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 2 * SNOW_AREA;
    phases[i] = Math.random() * Math.PI * 2;
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  // sizeAttenuation:false → pixel-sized points, which matters under our
  // orthographic camera where world-scaled points become unreadably tiny.
  // fog:false → snowy weather uses near-white fog, so fog-tinted flakes would
  // disappear into the background.
  const mat = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 6,
    map: makeSnowflakeTexture(),
    transparent: true,
    opacity: 1,
    depthWrite: false,
    sizeAttenuation: false,
    fog: false,
  });
  const points = new THREE.Points(geom, mat);
  points.frustumCulled = false;
  points.visible = false;
  scene.add(points);
  return { group: points, positions, phases, enabled: false, time: 0 };
}

export function updateSnow(snow: ISnow, dt: number, centerX: number, centerZ: number) {
  if (!snow.enabled) return;
  snow.time += dt;
  snow.group.position.x = centerX;
  snow.group.position.z = centerZ;
  const pos = snow.positions;
  const fall = SNOW_FALL_SPEED * dt;
  for (let i = 0; i < SNOW_COUNT; i++) {
    const o = i * 3;
    pos[o + 1] -= fall;
    // Sideways drift wobble
    pos[o + 0] += Math.sin(snow.time * 0.8 + snow.phases[i]) * SNOW_DRIFT_AMP * dt;
    if (pos[o + 1] < 0) {
      pos[o + 0] = (Math.random() - 0.5) * 2 * SNOW_AREA;
      pos[o + 1] = SNOW_HEIGHT * (0.6 + Math.random() * 0.4);
      pos[o + 2] = (Math.random() - 0.5) * 2 * SNOW_AREA;
    }
  }
  (snow.group.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
}

export function setSnowEnabled(snow: ISnow, enabled: boolean) {
  snow.enabled = enabled;
  snow.group.visible = enabled;
}

// --- Weather → driving modifiers --------------------------------------------
// Multiplicative knobs that car-physics applies each tick. Defaults are 1.0
// (no change). Lower grip = car retains more lateral velocity (slippery).

export type IWeatherModifiers = {
  topSpeedMul: number;
  accelMul: number;
  // Added to gripFactor (which is 0.72..0.95). Positive = looser/slipperier.
  gripAdd: number;
};

const WEATHER_MODIFIERS: Record<IWeatherId, IWeatherModifiers> = {
  sunny:  { topSpeedMul: 1.05, accelMul: 1.05, gripAdd: 0.00 },
  fog:    { topSpeedMul: 0.95, accelMul: 1.00, gripAdd: 0.00 },
  rain:   { topSpeedMul: 0.92, accelMul: 0.90, gripAdd: 0.04 },
  sunset: { topSpeedMul: 1.00, accelMul: 1.00, gripAdd: 0.00 },
  snowy:  { topSpeedMul: 0.80, accelMul: 0.75, gripAdd: 0.07 },
};

export function getWeatherModifiers(id: IWeatherId): IWeatherModifiers {
  return WEATHER_MODIFIERS[id] ?? WEATHER_MODIFIERS.sunny;
}

/**
 * Human-readable summary of a weather's driving modifiers, for the
 * pre-game preview line. Renders ~30 chars max so it fits the panel.
 */
export function getWeatherSummary(id: IWeatherId): string {
  const m = getWeatherModifiers(id);
  const parts: string[] = [];
  if (m.topSpeedMul !== 1) {
    const pct = Math.round((m.topSpeedMul - 1) * 100);
    parts.push(`${pct > 0 ? "+" : ""}${pct}% speed`);
  }
  if (m.accelMul !== 1) {
    const pct = Math.round((m.accelMul - 1) * 100);
    parts.push(`${pct > 0 ? "+" : ""}${pct}% accel`);
  }
  if (m.gripAdd >= 0.06) parts.push("very slippery");
  else if (m.gripAdd > 0) parts.push("slippery");
  return parts.length === 0 ? "Neutral handling" : parts.join(" · ");
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
