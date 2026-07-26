/* First-time hints. The failure mode is a tip that keeps firing forever, or one kind's flag clearing another's. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shouldShowComboTip,
  markComboTipSeen,
  shouldShowPickupTip,
  markPickupTipSeen,
} from "../src/systems/tutorial.ts";
import { PICKUP_RARITY } from "../src/entities/pickup.ts";
import type { IPickupKind } from "../src/entities/pickup.ts";

const KINDS = Object.keys(PICKUP_RARITY) as IPickupKind[];

test("every pickup kind starts undiscovered", () => {
  for (const k of KINDS) assert.ok(shouldShowPickupTip(k), `${k} was already marked seen`);
});

test("a pickup tip fires once and never again", () => {
  markPickupTipSeen("nitro");
  assert.equal(shouldShowPickupTip("nitro"), false);
  markPickupTipSeen("nitro");
  assert.equal(shouldShowPickupTip("nitro"), false);
});

test("marking one kind does not mark the others", () => {
  /* A shared or mistyped storage key would collapse all nine hints into one. */
  for (const k of KINDS) {
    if (k === "nitro") continue;
    assert.ok(shouldShowPickupTip(k), `${k} was cleared by the nitro tip`);
  }
});

test("each kind is independently markable", () => {
  for (const k of KINDS) {
    markPickupTipSeen(k);
    assert.equal(shouldShowPickupTip(k), false, `${k} stayed unseen after being marked`);
  }
});

test("the combo tip is separate from the pickup tips and also fires once", () => {
  assert.ok(shouldShowComboTip(), "the combo tip was cleared by the pickup tips");
  markComboTipSeen();
  assert.equal(shouldShowComboTip(), false);
  markComboTipSeen();
  assert.equal(shouldShowComboTip(), false);
});
