/* WorldFx — the single facade between gameplay events and the effects modules.
 *
 * Why this exists: the conductor (main.ts) currently calls into
 * effects/popups/sound/haptics/radio imperatively at every gameplay event.
 * Adding a cue means editing the conductor and 5+ call sites. With WorldFx
 * as the sole consumer of FrameEvents, the "what happens at X" knowledge
 * lives here, in one place, behind one interface.
 *
 * Phase 1: interface + empty stub implementations. No call site invokes
 * these yet. Phase 2 fills the bodies (one method per FrameEvent variant)
 * and rewires the conductor + systems to drain through here.
 *
 * The interface is the test surface — a test can construct a `WorldFx` with
 * a recording sink and assert the full FX sequence for any event without
 * booting the game.
 */

import type { FrameEvent } from "../systems/frame-events";
import { spawnConfetti, spawnSparks, spawnSplash, spawnSpeedLine, triggerScreenFlash, triggerShake } from "./effects";
import { spawnPopup } from "./popups";
import { spawnSkid } from "./skids";
import { pushChatter } from "./radio";
import { haptics } from "../audio/haptics";
import {
  playComboLost,
  playComboTick,
  playComboTier,
  playCrash,
  playEscape,
  playGameOver,
  playHeartbeat,
  playLevelUp,
  playMilestone,
  playPickup,
  playPickupHeal,
  playPickupOffense,
  playPickupScore,
  playPickupShield,
  playSplash,
  playNitroWhoosh,
  setBgmDuck,
  setSirenVolume,
  startSiren,
  stopSiren,
} from "../audio/sound";
import { HP_HEAL_DROWNED_COP } from "../constants";

/* Per-kind pickup SFX — preserved verbatim from pickup-system.ts so the
 * sonic palette (5 buckets across 9 kinds) is identical to pre-refactor. */
function playPickupSfx(kind: Extract<FrameEvent, { kind: "pickupCollected" }>["pickup"]) {
  switch (kind) {
    case "repair":
      playPickupHeal();
      return;
    case "shield":
      playPickupShield();
      return;
    case "emp":
    case "tank":
      playPickupOffense();
      return;
    case "nitro":
      playPickupScore();
      playNitroWhoosh();
      return;
    case "doubleScore":
    case "magnet":
    case "timeWarp":
    case "ghost":
      playPickupScore();
      return;
    default:
      playPickup();
  }
}

/* Car state needed for display-side effects. Provided by the conductor via
 * setCarSample() each frame; kept off Car itself so the seam stays clean. */
export type ICarDisplaySample = {
  position: { x: number; y: number; z: number };
  /** Yaw in radians, derived from the cannon quaternion. */
  heading: number;
  /** World-space rear-left and rear-right wheel anchor positions for skids. */
  rearLeft: { x: number; z: number };
  rearRight: { x: number; z: number };
  /** Magnitude of lateral slip — used to gate skid emission. */
  lateralSpeed: number;
  /** Current scalar speed, used for speed-line gating. */
  speed: number;
  baseMaxSpeed: number;
  maxSpeed: number;
};

export class WorldFx {
  private car: ICarDisplaySample | null = null;

  /** Conductor calls this once per frame before draining events.
   *  Optional for events that don't need car state; required for siren
   *  and any future event that wants to read car state. */
  setCarSample(sample: ICarDisplaySample) {
    this.car = sample;
  }

  copKilled(ev: Extract<FrameEvent, { kind: "copKilled" }>) {
    const { position, isSwat, cause, score } = ev;
    if (cause === "tank") {
      spawnSparks(position.x, position.y + 1, position.z);
      spawnConfetti(position.x, position.y + 2, position.z);
      if (isSwat) {
        spawnConfetti(position.x, position.y + 3, position.z);
        triggerScreenFlash(0.45);
      }
      spawnPopup(position.x, position.y + 3, position.z, `+${Math.round(score)}`, "#ff6666");
      playCrash();
      haptics.hit();
      triggerShake(isSwat ? 0.7 : 0.5);
      pushChatter("tank_kill");
    } else if (cause === "emp") {
      spawnSparks(position.x, position.y + 1, position.z);
      spawnConfetti(position.x, position.y + 2, position.z);
      spawnPopup(position.x, position.y + 3, position.z, `+${Math.round(score)}`, "#ffcc22");
      playCrash();
      haptics.hit();
      triggerShake(0.4);
      pushChatter("emp_kill");
    }
  }

  copDrowned(ev: Extract<FrameEvent, { kind: "copDrowned" }>) {
    const { position, isSwat, isBounty, chain } = ev;
    playSplash();
    spawnSplash(position.x, position.y, position.z);
    spawnConfetti(position.x, position.y + 2, position.z);
    if (chain > 1) {
      const label = chain === 2 ? "DOUBLE DROWN!" : chain === 3 ? "TRIPLE DROWN!" : "MEGA DROWN!";
      const color = chain === 2 ? "#66ccff" : chain === 3 ? "#3399ff" : "#0066ff";
      const car = this.car;
      const popX = car ? car.position.x : position.x;
      const popY = car ? car.position.y + 4.5 : position.y + 4.5;
      const popZ = car ? car.position.z : position.z;
      spawnPopup(popX, popY, popZ, label, color, 1.8, 12);
      playComboTier(Math.min(5, chain));
    }
    if (isSwat) {
      spawnConfetti(position.x, position.y + 3, position.z);
      triggerScreenFlash(0.45);
      triggerShake(0.5);
    }
    spawnPopup(
      position.x,
      position.y + 3,
      position.z,
      `+${Math.round(HP_HEAL_DROWNED_COP * (isSwat ? 3 : 1) + (chain - 1) * 5)}`,
      isBounty ? "#ffd54a" : isSwat ? "#ff4444" : "#ffcc22",
    );
    if (isBounty) {
      spawnPopup(position.x, position.y + 4.4, position.z, "WANTED", "#ffd54a", 1.2, 11);
    }
    pushChatter(isSwat ? "swat_drown" : "cop_drown");
  }

  playerLeveledUp(ev: Extract<FrameEvent, { kind: "playerLeveledUp" }>) {
    const { position, level, hpHeal } = ev;
    playLevelUp();
    haptics.levelUp();
    spawnPopup(position.x, position.y + 1, position.z, `LV ${level}`, "#ffaa22");
    spawnPopup(position.x, position.y + 2, position.z, `+${hpHeal} HP`, "#66ff88");
    pushChatter("level_up");
  }

  playerDied(ev: Extract<FrameEvent, { kind: "playerDied" }>) {
    const { position, reason, isNewBest } = ev;
    triggerScreenFlash(0.95);
    triggerShake(1.1);
    for (let i = 0; i < 3; i++) {
      const ox = (Math.random() - 0.5) * 4;
      const oz = (Math.random() - 0.5) * 4;
      spawnConfetti(position.x + ox, position.y + 1.5, position.z + oz);
      spawnSparks(position.x + ox, position.y + 1, position.z + oz);
    }
    spawnSparks(position.x, position.y + 2, position.z);
    if (reason === "DROWNED") spawnSplash(position.x, position.y, position.z);
    playGameOver();
    haptics.death();
    if (isNewBest) {
      for (let i = 0; i < 5; i++) {
        const ox = (Math.random() - 0.5) * 6;
        const oz = (Math.random() - 0.5) * 6;
        spawnConfetti(position.x + ox, position.y + 1.5, position.z + oz);
      }
    }
    if (reason === "DROWNED") pushChatter("drowned_self");
    else if (reason === "BUSTED") pushChatter("busted");
    else pushChatter("wrecked");
  }

  pickupCollected(ev: Extract<FrameEvent, { kind: "pickupCollected" }>) {
    const { position, pickup } = ev;
    playPickupSfx(pickup);
    haptics.pickup();
    spawnConfetti(position.x, 2, position.z);
  }

  scoreMilestone(ev: Extract<FrameEvent, { kind: "scoreMilestone" }>) {
    const { position, value } = ev;
    spawnPopup(position.x, position.y + 4, position.z, `${value.toLocaleString()}!`, "#ffdd44", 1.6, 14);
    triggerScreenFlash(0.35);
    playMilestone();
    haptics.levelUp();
  }

  escaped(ev: Extract<FrameEvent, { kind: "escaped" }>) {
    const { position, reward } = ev;
    spawnPopup(position.x, position.y + 4, position.z, "ESCAPED!", "#66ff88", 1.6, 14);
    spawnPopup(position.x, position.y + 2.5, position.z, `+${reward}`, "#ffcc22");
    triggerScreenFlash(0.25);
    playEscape();
    pushChatter("escape");
  }

  comboLost(_ev: Extract<FrameEvent, { kind: "comboLost" }>) {
    playComboLost();
  }

  comboMilestone(ev: Extract<FrameEvent, { kind: "comboMilestone" }>) {
    playComboTier(ev.tier);
    haptics.comboMilestone();
  }

  comboTick(_ev: Extract<FrameEvent, { kind: "comboTick" }>) {
    playComboTick();
  }

  playerHit(ev: Extract<FrameEvent, { kind: "playerHit" }>) {
    playCrash();
    haptics.hit();
    triggerShake(0.4 + Math.min(ev.impactSpeed / 30, 0.6));
    spawnSparks(ev.position.x, ev.position.y + 1, ev.position.z);
  }

  lowHpHeartbeat(ev: Extract<FrameEvent, { kind: "lowHpHeartbeat" }>) {
    playHeartbeat(ev.danger);
  }

  siren(ev: Extract<FrameEvent, { kind: "siren" }>) {
    if (ev.intensity > 0) {
      startSiren();
      setSirenVolume(ev.intensity);
    } else {
      stopSiren();
    }
    setBgmDuck(ev.intensity);
  }

  /** Skid + speed-line emission — driven from car sample, not from a single
   *  per-frame event. The conductor reads car state and calls this directly
   *  because emission is per-frame (not per-event) and the gate depends on
   *  multiple per-frame conditions (drift, nitro, speed). */
  emitDrivenFx(nitroActive: boolean) {
    const c = this.car;
    if (!c) return;
    const isDrifting = c.lateralSpeed > 4;
    const isBoosting = nitroActive && c.speed > c.baseMaxSpeed * 0.6;
    if (isDrifting || isBoosting) {
      const offX = Math.cos(c.heading) * 1.25;
      const offZ = -Math.sin(c.heading) * 1.25;
      spawnSkid(c.rearLeft.x + offX, c.rearLeft.z + offZ, c.heading);
      spawnSkid(c.rearRight.x - offX, c.rearRight.z - offZ, c.heading);
    }
    if (nitroActive && c.speed > c.maxSpeed * 0.8) {
      const fx = -Math.cos(c.heading);
      const fz = Math.sin(c.heading);
      spawnSpeedLine(c.position.x, c.position.y, c.position.z, fx, fz);
      spawnSpeedLine(c.position.x, c.position.y, c.position.z, fx, fz);
    }
  }

  /** Dispatch one event to the matching method. Exhaustive over the union. */
  dispatch(ev: FrameEvent) {
    switch (ev.kind) {
      case "copKilled":
        this.copKilled(ev);
        return;
      case "copDrowned":
        this.copDrowned(ev);
        return;
      case "playerLeveledUp":
        this.playerLeveledUp(ev);
        return;
      case "playerDied":
        this.playerDied(ev);
        return;
      case "pickupCollected":
        this.pickupCollected(ev);
        return;
      case "scoreMilestone":
        this.scoreMilestone(ev);
        return;
      case "escaped":
        this.escaped(ev);
        return;
      case "comboLost":
        this.comboLost(ev);
        return;
      case "comboMilestone":
        this.comboMilestone(ev);
        return;
      case "comboTick":
        this.comboTick(ev);
        return;
      case "playerHit":
        this.playerHit(ev);
        return;
      case "lowHpHeartbeat":
        this.lowHpHeartbeat(ev);
        return;
      case "siren":
        this.siren(ev);
        return;
    }
  }

  /** Drain an array of events through dispatch. The conductor calls this
   *  once per frame after the gameplay tick. */
  drain(events: readonly FrameEvent[]) {
    for (let i = 0; i < events.length; i++) this.dispatch(events[i]);
  }
}
