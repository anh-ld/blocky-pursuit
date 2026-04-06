// Tiny wrapper around the Vibration API. No-ops on unsupported devices and
// when the user has muted audio (mute = "I want quiet" — vibration would
// violate that intent).
//
// Patterns can be a single duration in ms or an alternating
// vibrate/pause array per the Vibration API spec.

import { attempt } from "es-toolkit";
import { isMuted } from "./sound";

type IVibratePattern = number | number[];

const supported =
  typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function safeVibrate(pattern: IVibratePattern) {
  if (!supported || isMuted()) return;
  // Some browsers throw when called outside a user gesture — swallow it.
  attempt(() => navigator.vibrate(pattern));
}

// Semantic helpers — call sites read like intent ("collision happened")
// not like raw API calls ("vibrate 30ms"). Easier to retune later.
export const haptics = {
  pickup: () => safeVibrate(12),
  hit: () => safeVibrate(40),
  levelUp: () => safeVibrate([15, 40, 25]),
  comboMilestone: () => safeVibrate([10, 20, 25]),
  death: () => safeVibrate([60, 40, 120]),
};
