/* The buffer is drained once per frame. Aliasing the returned array would replay last frame's FX forever. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FrameEventBuffer } from "../src/systems/frame-events.ts";

test("drain returns events in the order they were pushed, then empties", () => {
  const buf = new FrameEventBuffer();
  buf.push({ kind: "comboLost" });
  buf.push({ kind: "comboTick", urgency: 0.2 });
  assert.equal(buf.length, 2);

  const drained = buf.drain();
  assert.deepEqual(drained.map((e) => e.kind), ["comboLost", "comboTick"]);
  assert.equal(buf.length, 0);
  assert.deepEqual(buf.drain(), [], "a second drain replayed the same frame");
});

test("the drained array is detached — the next frame does not append to it", () => {
  const buf = new FrameEventBuffer();
  buf.push({ kind: "comboLost" });
  const drained = buf.drain();
  buf.push({ kind: "comboTick", urgency: 0.5 });
  assert.equal(drained.length, 1, "last frame's events grew after the handler had them");
});
