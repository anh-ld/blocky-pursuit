/* Weather is a balance lever the player picks before a run — the preview text must match what it does. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { WEATHERS, getWeatherModifiers, getWeatherSummary, type IWeatherId } from "../src/world/weather.ts";

const IDS = WEATHERS.map((w) => w.id);

test("every listed weather has modifiers and a preview line", () => {
  for (const id of IDS) {
    const m = getWeatherModifiers(id);
    assert.ok(m.topSpeedMul > 0 && m.accelMul > 0, `${id} would stall the car`);
    assert.ok(getWeatherSummary(id).length > 0, `${id} has no preview text`);
  }
});

test("an unknown weather id falls back instead of crashing the pre-game screen", () => {
  assert.deepEqual(getWeatherModifiers("hurricane" as IWeatherId), getWeatherModifiers("sunny"));
});

test("grip is only ever loosened, never tightened past the skin's value", () => {
  /* gripAdd is added to gripFactor (0.72..0.95); a negative would push grip out of range. */
  for (const id of IDS) assert.ok(getWeatherModifiers(id).gripAdd >= 0, `${id} tightens grip`);
});

test("bad weather is a real penalty and clear weather a real reward", () => {
  const snow = getWeatherModifiers("snowy");
  const sun = getWeatherModifiers("sunny");
  assert.ok(snow.topSpeedMul < sun.topSpeedMul, "snow is not slower than sun");
  assert.ok(snow.accelMul < sun.accelMul);
  assert.ok(snow.gripAdd > sun.gripAdd, "snow is not slipperier than sun");
});

test("a neutral weather says so rather than showing an empty chip", () => {
  assert.equal(getWeatherSummary("sunset"), "Neutral handling");
});

test("the summary reports the sign and size of each modifier it mentions", () => {
  const rain = getWeatherSummary("rain");
  assert.match(rain, /-8% speed/);
  assert.match(rain, /-10% accel/);
  assert.match(rain, /slippery/);
  assert.match(getWeatherSummary("sunny"), /\+5% speed/);
});

test("the summary never claims a change the modifiers do not make", () => {
  for (const id of IDS) {
    const m = getWeatherModifiers(id);
    const s = getWeatherSummary(id);
    if (m.topSpeedMul === 1) assert.ok(!s.includes("speed"), `${id} claims a speed change it does not have`);
    if (m.gripAdd === 0) assert.ok(!s.includes("slippery"), `${id} claims to be slippery`);
  }
});
