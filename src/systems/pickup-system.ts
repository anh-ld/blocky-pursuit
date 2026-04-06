import * as THREE from "three";
import { Pickup, type IPickupKind } from "../entities/pickup";
import { Car } from "../entities/car";
import { isRoad } from "../world/city-generator";
import { TILE_SIZE } from "../world/terrain";
import { spawnConfetti, spawnRing, triggerShake } from "../world/effects";
import { spawnPopup } from "../world/popups";
import { playPickup } from "../audio/sound";
import { haptics } from "../audio/haptics";
import type { RunState, IGameContext } from "./run-state";
import type { CopSystem } from "./cop-system";
import { shouldShowPickupTip, markPickupTipSeen } from "./tutorial";
import {
  PICKUP_MAX,
  PICKUP_SPAWN_INTERVAL,
  PICKUP_DESPAWN_DIST,
  PICKUP_MAX_AGE,
  PICKUP_COLLECT_DIST,
  PICKUP_MAGNET_RANGE,
  PICKUP_MAGNET_PULL,
  PICKUP_SPAWN_DIST_MIN,
  PICKUP_SPAWN_DIST_RANGE,
  NITRO_DURATION,
  NITRO_SPEED_MULT,
  EMP_RING_RADIUS,
  SCORE_EMP_KILL,
} from "../constants";

// Weighted spawn — EMP is the rarest because it's the strongest
const PICKUP_WEIGHTS: { kind: IPickupKind; weight: number }[] = [
  { kind: "nitro", weight: 50 },
  { kind: "shield", weight: 35 },
  { kind: "emp", weight: 15 },
];

function pickPickupKind(): IPickupKind {
  const total = PICKUP_WEIGHTS.reduce((s, p) => s + p.weight, 0);
  let roll = Math.random() * total;
  for (const p of PICKUP_WEIGHTS) {
    roll -= p.weight;
    if (roll <= 0) return p.kind;
  }
  return PICKUP_WEIGHTS[0].kind;
}

export class PickupSystem {
  scene: THREE.Scene;
  pickups: Pickup[] = [];
  lastSpawnTime = 0;

  constructor(ctx: IGameContext) {
    this.scene = ctx.scene;
  }

  reset() {
    this.pickups.forEach((p) => p.destroy());
    this.pickups.length = 0;
  }

  rebaseTimers(timeInSeconds: number) {
    this.lastSpawnTime = timeInSeconds;
  }

  /** Snap a fresh pickup to a road tile near the player. */
  private spawnNear(playerPosition: THREE.Vector3) {
    if (this.pickups.length >= PICKUP_MAX) return;
    const distance = PICKUP_SPAWN_DIST_MIN + Math.random() * PICKUP_SPAWN_DIST_RANGE;
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
    const kind = pickPickupKind();
    const pos = new THREE.Vector3(
      tileX * TILE_SIZE + TILE_SIZE / 2,
      1,
      tileZ * TILE_SIZE + TILE_SIZE / 2,
    );
    this.pickups.push(new Pickup(this.scene, pos, kind));
  }

  update(dt: number, timeInSeconds: number, car: Car, run: RunState, cops: CopSystem) {
    if (timeInSeconds - this.lastSpawnTime > PICKUP_SPAWN_INTERVAL) {
      this.spawnNear(car.mesh.position);
      this.lastSpawnTime = timeInSeconds;
    }

    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.update(dt);
      const dxp = p.position.x - car.body.position.x;
      const dzp = p.position.z - car.body.position.z;
      const dist = Math.sqrt(dxp * dxp + dzp * dzp);

      // Despawn far / aged-out pickups
      if (dist > PICKUP_DESPAWN_DIST || p.age > PICKUP_MAX_AGE) {
        p.destroy();
        this.pickups.splice(i, 1);
        continue;
      }

      // Magnetism: when close (but not yet collected), pull the pickup
      // toward the car so tight roads don't feel frustrating.
      if (dist < PICKUP_MAGNET_RANGE && dist > PICKUP_COLLECT_DIST) {
        const pull = PICKUP_MAGNET_PULL * dt; // units/sec toward player, scaled by dt
        p.position.x -= (dxp / dist) * pull;
        p.position.z -= (dzp / dist) * pull;
        p.mesh.position.x = p.position.x;
        p.mesh.position.z = p.position.z;
      }

      // Collect on touch
      if (dist < PICKUP_COLLECT_DIST) {
        playPickup();
        haptics.pickup();
        spawnConfetti(p.position.x, 2, p.position.z);
        if (p.kind === "nitro") {
          run.nitroTimer = NITRO_DURATION;
          car.setNitroMultiplier(NITRO_SPEED_MULT);
          spawnPopup(p.position.x, 2, p.position.z, "⚡ NITRO", "#ffdd44");
          if (shouldShowPickupTip("nitro")) {
            markPickupTipSeen("nitro");
            spawnPopup(p.position.x, 3.5, p.position.z, "Speed boost for 3s!", "#ffffff", 2.4, 12);
          }
        } else if (p.kind === "shield") {
          run.shieldActive = true;
          spawnPopup(p.position.x, 2, p.position.z, "🛡 SHIELD", "#66ddff");
          if (shouldShowPickupTip("shield")) {
            markPickupTipSeen("shield");
            spawnPopup(p.position.x, 3.5, p.position.z, "Blocks one cop hit", "#ffffff", 2.4, 12);
          }
        } else if (p.kind === "emp") {
          spawnRing(car.body.position.x, car.body.position.y, car.body.position.z, EMP_RING_RADIUS);
          spawnPopup(car.body.position.x, 3, car.body.position.z, "💥 EMP", "#66ddff");
          const kills = cops.empBlast(car, run);
          if (kills > 0) {
            spawnPopup(car.body.position.x, 5, car.body.position.z, `+${kills * SCORE_EMP_KILL}`, "#ffcc22");
          }
          if (shouldShowPickupTip("emp")) {
            markPickupTipSeen("emp");
            spawnPopup(car.body.position.x, 6.5, car.body.position.z, "Wipes nearby cops", "#ffffff", 2.4, 12);
          }
          triggerShake(0.6);
        }
        p.destroy();
        this.pickups.splice(i, 1);
      }
    }

    // Tick down nitro
    if (run.nitroTimer > 0) {
      run.nitroTimer = Math.max(0, run.nitroTimer - dt);
      if (run.nitroTimer === 0) car.setNitroMultiplier(1);
    }
  }
}
