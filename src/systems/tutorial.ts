// Tracks one-time onboarding flags persisted to localStorage. Currently
// drives the first-combo tutorial popup and a "what is this?" hint the
// first time the player ever collects each pickup kind.

import { StorageKey, storageGetJson, storageSetJson } from "../storage";
import type { IPickupKind } from "../entities/pickup";

type ITutorialState = {
  seenComboTip: boolean;
  // Per-pickup discovery hints. Stored individually so removing a kind in
  // the future is a clean delete instead of a migration of an array index.
  seenNitroTip: boolean;
  seenShieldTip: boolean;
  seenEmpTip: boolean;
  seenRepairTip: boolean;
  seenDoubleScoreTip: boolean;
  seenTimeWarpTip: boolean;
  seenMagnetTip: boolean;
  seenGhostTip: boolean;
  seenTankTip: boolean;
};

const DEFAULTS: ITutorialState = {
  seenComboTip: false,
  seenNitroTip: false,
  seenShieldTip: false,
  seenEmpTip: false,
  seenRepairTip: false,
  seenDoubleScoreTip: false,
  seenTimeWarpTip: false,
  seenMagnetTip: false,
  seenGhostTip: false,
  seenTankTip: false,
};

// Map IPickupKind → the matching state key. Centralizes the naming
// convention so adding a new pickup is "two new keys, no extra branches".
const PICKUP_TIP_KEY: Record<IPickupKind, keyof ITutorialState> = {
  nitro: "seenNitroTip",
  shield: "seenShieldTip",
  emp: "seenEmpTip",
  repair: "seenRepairTip",
  doubleScore: "seenDoubleScoreTip",
  timeWarp: "seenTimeWarpTip",
  magnet: "seenMagnetTip",
  ghost: "seenGhostTip",
  tank: "seenTankTip",
};

let state: ITutorialState = load();

function load(): ITutorialState {
  const parsed = storageGetJson<Partial<ITutorialState>>(StorageKey.Tutorial);
  if (!parsed) return { ...DEFAULTS };
  return { ...DEFAULTS, ...parsed };
}

function save() {
  storageSetJson(StorageKey.Tutorial, state);
}

export function shouldShowComboTip(): boolean {
  return !state.seenComboTip;
}

export function markComboTipSeen() {
  if (state.seenComboTip) return;
  state.seenComboTip = true;
  save();
}

export function shouldShowPickupTip(kind: IPickupKind): boolean {
  return !state[PICKUP_TIP_KEY[kind]];
}

export function markPickupTipSeen(kind: IPickupKind) {
  const key = PICKUP_TIP_KEY[kind];
  if (state[key]) return;
  state[key] = true;
  save();
}
