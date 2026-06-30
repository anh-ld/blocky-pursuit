/* Vibration API wrapper. No-op on unsupported devices & when muted (mute = "I want quiet"). */

import { attempt } from "es-toolkit";
import { isMuted } from "./sound";

type IVibratePattern = number | number[];

const supported = typeof navigator !== "undefined" && typeof navigator.vibrate === "function";

function safeVibrate(pattern: IVibratePattern) {
  if (!supported || isMuted()) return;
  /* Some browsers throw when called outside a user gesture — swallow. */
  attempt(() => navigator.vibrate(pattern));
}

/* Semantic helpers — call sites read like intent ("collision") not raw ("vibrate 30ms"). */
export const haptics = {
  pickup: () => safeVibrate(12),
  hit: () => safeVibrate(40),
  levelUp: () => safeVibrate([15, 40, 25]),
  comboMilestone: () => safeVibrate([10, 20, 25]),
  death: () => safeVibrate([60, 40, 120]),
};
