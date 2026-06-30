/* Vibe Jam 2026 portal webring — minimum spec implementation. */
/* Always shows EXIT → jam.pieter.com with name/color/speed + ref back here. */
/* `?portal=true` → caller skips menus (see `cameFromPortal`) for seamless handoff. */
/* `?portal=true&ref=...` → also shows RETURN portal that sends player back to ref with original params. */

import * as THREE from "three";

const VIBE_JAM_URL = "https://jam.pieter.com/portal/2026";
const PORTAL_RADIUS = 4;
const TRIGGER_DIST = 4.2;

type IPortal = {
  position: THREE.Vector3;
  destination: () => string;
  triggered: boolean;
};

export type IPortalsApi = {
  update: (carPos: THREE.Vector3) => string | null;
  cameFromPortal: boolean;
  /* Position of RETURN portal if one exists — caller spawns player "coming out of" it on arrival. */
  /* Null when no return portal (no ?ref or not arriving via portal). */
  returnSpawnPos: THREE.Vector3 | null;
};

export type IPortalContext = {
  scene: THREE.Scene;
  getPlayerName: () => string;
  getPlayerColorHex: () => string;
  getPlayerSpeedMs: () => number;
};

function addPortalMesh(scene: THREE.Scene, position: THREE.Vector3, ringColor: number, labelText: string) {
  const group = new THREE.Group();
  group.position.copy(position);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(PORTAL_RADIUS, 0.45, 16, 48),
    new THREE.MeshBasicMaterial({ color: ringColor }),
  );
  ring.rotation.y = Math.PI / 2;
  group.add(ring);

  /* Label sprite (canvas-textured) above the ring. */
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.font = "bold 64px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "#000";
  ctx.fillStyle = "#" + ringColor.toString(16).padStart(6, "0");
  ctx.strokeText(labelText, 256, 64);
  ctx.fillText(labelText, 256, 64);
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
  );
  sprite.scale.set(12, 3, 1);
  sprite.position.set(0, PORTAL_RADIUS + 2, 0);
  group.add(sprite);

  scene.add(group);
}

export function initPortals(ctx: IPortalContext): IPortalsApi {
  const incoming = new URLSearchParams(window.location.search);
  const cameFromPortal = incoming.get("portal") === "true";
  const ref = incoming.get("ref");

  const portals: IPortal[] = [];

  /* Exit portal: always present */
  const exitPos = new THREE.Vector3(80, 2.5, 0);
  addPortalMesh(ctx.scene, exitPos, 0x22ee88, "VIBE JAM 2026");
  portals.push({
    position: exitPos,
    triggered: false,
    destination: () => {
      const url = new URL(VIBE_JAM_URL);
      /* Re-emit incoming params (so chains preserve continuity), then overwrite with our live values. */
      incoming.forEach((v, k) => {
        if (k !== "portal") url.searchParams.set(k, v);
      });
      url.searchParams.set("username", ctx.getPlayerName());
      url.searchParams.set("color", ctx.getPlayerColorHex());
      url.searchParams.set("speed", ctx.getPlayerSpeedMs().toFixed(2));
      url.searchParams.set("ref", window.location.host);
      return url.toString();
    },
  });

  /* Return portal: only when arriving from another vibe jam game */
  let returnSpawnPos: THREE.Vector3 | null = null;
  if (cameFromPortal && ref) {
    const refUrl = /^https?:\/\//.test(ref) ? ref : `https://${ref}`;
    const returnPos = new THREE.Vector3(-80, 2.5, 0);
    addPortalMesh(ctx.scene, returnPos, 0xff66aa, "RETURN");
    portals.push({
      position: returnPos,
      /* Start triggered — player spawns inside the radius; don't fire the return redirect on frame 0 (infinite loop). */
      /* Flag clears the moment they drive out of range. */
      triggered: true,
      destination: () => {
        const url = new URL(refUrl);
        /* Spec: send all original query parameters back. */
        incoming.forEach((v, k) => {
          if (k !== "portal") url.searchParams.set(k, v);
        });
        return url.toString();
      },
    });
    returnSpawnPos = returnPos;
  }

  function update(carPos: THREE.Vector3): string | null {
    for (const p of portals) {
      const dx = carPos.x - p.position.x;
      const dz = carPos.z - p.position.z;
      if (Math.hypot(dx, dz) > TRIGGER_DIST) {
        p.triggered = false;
        continue;
      }
      if (p.triggered) continue;
      p.triggered = true;
      return p.destination();
    }
    return null;
  }

  return { update, cameFromPortal, returnSpawnPos };
}
