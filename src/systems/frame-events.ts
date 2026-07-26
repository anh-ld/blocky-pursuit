/* FrameEvent — typed channel between gameplay logic and the WorldFx facade. */

export type Vec3Like = { x: number; y: number; z: number };

/** A cop was killed — by tank ram, by EMP, or by drowning. */
export type CopKilledEvent = {
  kind: "copKilled";
  position: Vec3Like;
  /** True for SWAT mini-boss; payout + screen flash scale up. */
  isSwat: boolean;
  /** True for the bounty variant; reward multiplier applies. */
  isBounty: boolean;
  /** "tank" | "emp" | "drowned" — which fan-out path WorldFx takes. */
  cause: "tank" | "emp" | "drowned";
  /** Score awarded by this kill, including any multipliers. */
  score: number;
};

/** A cop drove into water (separate from "killed" because the FX is different). */
export type CopDrownedEvent = {
  kind: "copDrowned";
  position: Vec3Like;
  isSwat: boolean;
  isBounty: boolean;
  /** Current chain count (1 = first in chain, 2+ = chain link). */
  chain: number;
};

/** The player crossed into a new level. */
export type PlayerLeveledUpEvent = {
  kind: "playerLeveledUp";
  position: Vec3Like;
  level: number;
  /** HP heal applied by the level-up. */
  hpHeal: number;
};

/** The player died: wreck, drown, or busted. */
export type PlayerDiedEvent = {
  kind: "playerDied";
  position: Vec3Like;
  reason: "WRECKED" | "DROWNED" | "BUSTED";
  /** Score at death time — used for new-best confetti. */
  isNewBest: boolean;
};

export type PickupCollectedEvent = {
  kind: "pickupCollected";
  position: Vec3Like;
  pickup: "nitro" | "shield" | "repair" | "doubleScore" | "magnet" | "timeWarp" | "emp" | "ghost" | "tank";
};

/** Score crossed a milestone (1000, 2500, 5000, 10000, ...). */
export type ScoreMilestoneEvent = {
  kind: "scoreMilestone";
  position: Vec3Like;
  value: number;
};

/** Player escaped — no cop in range for the threshold duration. */
export type EscapedEvent = {
  kind: "escaped";
  position: Vec3Like;
  /** Reward amount paid out. */
  reward: number;
};

/** A combo hit 10+ and was lost. */
export type ComboLostEvent = {
  kind: "comboLost";
};

/** A combo crossed a N-combo milestone (5, 10, 15, …). tier = comboCount / milestone. */
export type ComboMilestoneEvent = {
  kind: "comboMilestone";
  tier: number;
};

/** Warning tick while a combo is in danger of timing out. */
export type ComboTickEvent = {
  kind: "comboTick";
  /** 0..1 closeness to losing the combo; smaller = more urgent. */
  urgency: number;
};

/** Player took a collision hit from a cop (not a kill — the cop is undamaged). */
export type PlayerHitEvent = {
  kind: "playerHit";
  position: Vec3Like;
  /** Pre-`damageMul` impact magnitude, used by the shake to scale. */
  impactSpeed: number;
  damageMul: number;
};

export type LowHpHeartbeatEvent = {
  kind: "lowHpHeartbeat";
  /** 0..1 closeness to dying. */
  danger: number;
};

export type SirenEvent = {
  kind: "siren";
  /** 0 = off, >0 = on with intensity for BGM duck. */
  intensity: number;
};

export type FrameEvent =
  | CopKilledEvent
  | CopDrownedEvent
  | PlayerLeveledUpEvent
  | PlayerDiedEvent
  | PickupCollectedEvent
  | ScoreMilestoneEvent
  | EscapedEvent
  | ComboLostEvent
  | ComboMilestoneEvent
  | ComboTickEvent
  | PlayerHitEvent
  | LowHpHeartbeatEvent
  | SirenEvent;

/* Drain helper — reuse the same buffer across calls within a single frame; conductor drains after the tick. */
export class FrameEventBuffer {
  private buf: FrameEvent[] = [];
  push(ev: FrameEvent) {
    this.buf.push(ev);
  }
  drain(): FrameEvent[] {
    const out = this.buf;
    this.buf = [];
    return out;
  }
  get length() {
    return this.buf.length;
  }
}
