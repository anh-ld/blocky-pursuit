// Tracks one-time onboarding flags persisted to localStorage. Currently
// drives the first-combo tutorial popup; add more flags here as new
// mechanics get a "did the player ever discover this?" hint.

import { attempt } from "es-toolkit";

const KEY = "bp:tutorial";

type ITutorialState = {
  seenComboTip: boolean;
};

const DEFAULTS: ITutorialState = {
  seenComboTip: false,
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
