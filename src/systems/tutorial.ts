// Tracks one-time onboarding flags persisted to localStorage. Currently
// drives the first-combo tutorial popup; add more flags here as new
// mechanics get a "did the player ever discover this?" hint.

import { attempt } from "es-toolkit";

const KEY = "bp:tutorial";

type ITutorialState = {
  seenComboTip: boolean;
  seenNitroTip: boolean;
  seenShieldTip: boolean;
  seenEmpTip: boolean;
};

const DEFAULTS: ITutorialState = {
  seenComboTip: false,
  seenNitroTip: false,
  seenShieldTip: false,
  seenEmpTip: false,
};

let state: ITutorialState = load();

function load(): ITutorialState {
  const [, parsed] = attempt(() => {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<ITutorialState>) : null;
  });
  if (!parsed) return { ...DEFAULTS };
  return { ...DEFAULTS, ...parsed };
}

function save() {
  attempt(() => localStorage.setItem(KEY, JSON.stringify(state)));
}

export function shouldShowComboTip(): boolean {
  return !state.seenComboTip;
}

export function markComboTipSeen() {
  if (state.seenComboTip) return;
  state.seenComboTip = true;
  save();
}

// Pickup discovery hints — fired the first time the player ever collects
// each pickup type so they learn the mechanic on first encounter instead of
// reverse-engineering it from the side effect.
export function shouldShowPickupTip(kind: "nitro" | "shield" | "emp"): boolean {
  if (kind === "nitro") return !state.seenNitroTip;
  if (kind === "shield") return !state.seenShieldTip;
  return !state.seenEmpTip;
}

export function markPickupTipSeen(kind: "nitro" | "shield" | "emp") {
  if (kind === "nitro") {
    if (state.seenNitroTip) return;
    state.seenNitroTip = true;
  } else if (kind === "shield") {
    if (state.seenShieldTip) return;
    state.seenShieldTip = true;
  } else {
    if (state.seenEmpTip) return;
    state.seenEmpTip = true;
  }
  save();
}
