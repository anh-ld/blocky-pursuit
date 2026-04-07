import * as THREE from "three";

// World-space text floaters: rendered as billboarded sprites with a
// per-popup canvas texture. Cap is small (12) so allocating a fresh
// texture per popup is fine — they tear down quickly.

type IPopup = {
  sprite: THREE.Sprite;
  texture: THREE.CanvasTexture;
  vy: number;
  age: number;
  life: number;
};

let popupScene: THREE.Scene | null = null;
const popups: IPopup[] = [];
const MAX_POPUPS = 12;

export function initPopups(scene: THREE.Scene) {
  popupScene = scene;
}

const POPUP_FONT = "bold 44px system-ui, -apple-system, sans-serif";
const POPUP_HEIGHT = 64;
const POPUP_PAD_X = 16;

function makeTexture(text: string, color: string): { texture: THREE.CanvasTexture; aspect: number } {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  ctx.font = POPUP_FONT;
  const textWidth = Math.ceil(ctx.measureText(text).width);
  canvas.width = Math.max(64, textWidth + POPUP_PAD_X * 2);
  canvas.height = POPUP_HEIGHT;
  // Setting canvas dimensions resets the context, so reapply font/styles.
  ctx.font = POPUP_FONT;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  ctx.strokeText(text, cx, cy);
  ctx.fillStyle = color;
  ctx.fillText(text, cx, cy);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return { texture: tex, aspect: canvas.width / canvas.height };
}

export function spawnPopup(
  x: number,
  y: number,
  z: number,
  text: string,
  color: string = "#ffcc22",
  life: number = 1.0,
  scaleX: number = 8,
) {
  if (!popupScene) return;
  // Drop the oldest popup if at cap so a flurry of pickups doesn't queue up
  if (popups.length >= MAX_POPUPS) {
    const oldest = popups.shift()!;
    popupScene.remove(oldest.sprite);
    oldest.texture.dispose();
    (oldest.sprite.material as THREE.SpriteMaterial).dispose();
  }
  const { texture, aspect } = makeTexture(text, color);
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(x, y + 2, z);
  // Height is driven by scaleX so callers keep their existing sizing intent;
  // width follows the measured text aspect so long messages aren't squished.
  const height = scaleX * 0.25;
  sprite.scale.set(height * aspect, height, 1);
  popupScene.add(sprite);
  // Long-lived tip popups drift more slowly so they stay readable.
  const vy = life > 1.5 ? 2.5 : 6;
  popups.push({ sprite, texture, vy, age: 0, life });
}

/**
 * Tear down every active popup. Called from startGame() so a rage-restart
 * mid-combo doesn't carry stale "x5" / pickup labels into the next run.
 */
export function clearPopups() {
  if (!popupScene) return;
  for (const p of popups) {
    popupScene.remove(p.sprite);
    p.texture.dispose();
    (p.sprite.material as THREE.SpriteMaterial).dispose();
  }
  popups.length = 0;
}

export function updatePopups(dt: number) {
  if (!popupScene) return;
  for (let i = popups.length - 1; i >= 0; i--) {
    const p = popups[i];
    p.age += dt;
    if (p.age >= p.life) {
      popupScene.remove(p.sprite);
      p.texture.dispose();
      (p.sprite.material as THREE.SpriteMaterial).dispose();
      popups.splice(i, 1);
      continue;
    }
    p.sprite.position.y += p.vy * dt;
    p.vy *= 0.94;
    const t = p.age / p.life;
    (p.sprite.material as THREE.SpriteMaterial).opacity = 1 - t * t;
  }
}
