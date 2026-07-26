/* Unlock gating and the garage stat bars — both are player-visible, and both fail quietly. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAR_SKINS,
  getSkin,
  isUnlocked,
  specPercent,
  massForWeight,
  loadProgress,
  type IProgress,
  type ISpecKey,
} from "../src/entities/car-skins.ts";

const progress = (over: Partial<IProgress> = {}): IProgress => ({
  best: 0,
  totalRuns: 0,
  copsDrowned: 0,
  selectedSkin: "vf3",
  ...over,
});

test("skin ids are unique — a duplicate would shadow a car in the garage", () => {
  const ids = CAR_SKINS.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
});

test("every skin has an unlock hint so nothing shows as locked with no way in", () => {
  for (const s of CAR_SKINS) assert.ok(s.unlockHint.length > 0, `${s.id} has no hint`);
});

test("a fresh player has at least one car and not the whole lineup", () => {
  const fresh = CAR_SKINS.filter((s) => isUnlocked(s, progress()));
  assert.ok(fresh.length > 0, "a new player has nothing to drive");
  assert.ok(fresh.length < CAR_SKINS.length, "everything is unlocked — progression is dead");
});

test("the default selected skin is one a fresh player actually owns", () => {
  const def = getSkin(loadProgress().selectedSkin);
  assert.ok(isUnlocked(def, progress()), "the default car is locked to a new player");
});

test("score unlocks open exactly on their threshold, not one point late", () => {
  for (const s of CAR_SKINS.filter((s) => s.unlock.type === "best")) {
    const at = s.unlock.value;
    assert.ok(!isUnlocked(s, progress({ best: at - 1 })), `${s.id} unlocked early`);
    assert.ok(isUnlocked(s, progress({ best: at })), `${s.id} did not unlock on its threshold`);
  }
});

test("each unlock type reads its own counter and ignores the others", () => {
  const huge = 1e6;
  for (const s of CAR_SKINS) {
    if (s.unlock.type === "default") continue;
    const others: Record<string, IProgress> = {
      best: progress({ totalRuns: huge, copsDrowned: huge }),
      totalRuns: progress({ best: huge, copsDrowned: huge }),
      copsDrowned: progress({ best: huge, totalRuns: huge }),
    };
    assert.ok(!isUnlocked(s, others[s.unlock.type]), `${s.id} unlocked from the wrong counter`);
  }
});

test("unlocks never revoke — more progress only ever adds cars", () => {
  const owned = (p: IProgress) => CAR_SKINS.filter((s) => isUnlocked(s, p)).map((s) => s.id);
  let prev = owned(progress());
  for (const n of [500, 1500, 3000, 5000, 1e6]) {
    const next = owned(progress({ best: n, totalRuns: n, copsDrowned: n }));
    for (const id of prev) assert.ok(next.includes(id), `${id} was revoked at ${n}`);
    prev = next;
  }
  assert.equal(prev.length, CAR_SKINS.length, "some car is unreachable at max progress");
});

test("an unknown or stale skin id falls back to a real car", () => {
  assert.equal(getSkin("redstar-deleted-in-v40").id, CAR_SKINS[0].id);
  assert.equal(getSkin("").id, CAR_SKINS[0].id);
  assert.equal(getSkin(CAR_SKINS[2].id).id, CAR_SKINS[2].id);
});

test("mass rises with weight and never reaches zero", () => {
  assert.ok(massForWeight(90) > massForWeight(30));
  assert.ok(massForWeight(0) > 0, "a weightless car would fly off on any contact");
});

test("stat bars stay inside 0-100 for every car in the lineup", () => {
  const keys: ISpecKey[] = ["topSpeed", "acceleration", "handling", "grip", "stability", "braking", "weight", "endurance"];
  for (const s of CAR_SKINS) {
    for (const k of keys) {
      const p = specPercent(k, s.specs);
      assert.ok(p >= 0 && p <= 100, `${s.id}.${k} = ${p}`);
      assert.ok(Number.isInteger(p), `${s.id}.${k} is not a whole percent`);
    }
  }
});

test("the stat ranges are not so wide that every car reads the same", () => {
  /* If a bar never moves across the lineup, the range is stale and the garage shows nothing useful. */
  const keys: ISpecKey[] = ["topSpeed", "acceleration", "handling", "grip", "stability", "braking", "weight", "endurance"];
  for (const k of keys) {
    const values = CAR_SKINS.map((s) => specPercent(k, s.specs));
    assert.ok(Math.max(...values) - Math.min(...values) > 10, `the ${k} bar barely moves across the lineup`);
  }
});

test("loadProgress returns a usable default with no saved data", () => {
  const p = loadProgress();
  assert.equal(p.best, 0);
  assert.equal(p.totalRuns, 0);
  assert.equal(p.copsDrowned, 0);
  assert.ok(CAR_SKINS.some((s) => s.id === p.selectedSkin), "the default points at a car that does not exist");
});
