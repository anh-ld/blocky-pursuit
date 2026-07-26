/* World generation must be pure and stable — every client derives the same map from coordinates alone. */
import { test } from "node:test";
import assert from "node:assert/strict";
import { pseudoRandom, getZone, isWater, isDeepWater, isShore, isRoad, Zone } from "../src/world/terrain.ts";

/* A spread of coordinates including negatives, which is where floor/modulo bugs hide. */
const COORDS: [number, number][] = [];
for (let x = -50; x <= 50; x += 7) for (let z = -50; z <= 50; z += 7) COORDS.push([x, z]);

test("pseudoRandom is deterministic and stays in [0,1)", () => {
  for (const [x, z] of COORDS) {
    const r = pseudoRandom(x, z);
    assert.equal(r, pseudoRandom(x, z));
    assert.ok(r >= 0 && r < 1, `out of range at ${x},${z}: ${r}`);
  }
});

test("pseudoRandom decorrelates neighbours and index streams", () => {
  assert.notEqual(pseudoRandom(3, 4), pseudoRandom(4, 3));
  assert.notEqual(pseudoRandom(3, 4, 0), pseudoRandom(3, 4, 1));
});

test("the origin is road — the spawn always has somewhere to drive", () => {
  assert.ok(isRoad(0, 0));
});

test("water only exists in nature", () => {
  for (const [x, z] of COORDS) {
    if (isWater(x, z)) assert.equal(getZone(x, z), Zone.NATURE, `water outside nature at ${x},${z}`);
  }
});

test("a tile is never both water and shore", () => {
  for (const [x, z] of COORDS) assert.ok(!(isWater(x, z) && isShore(x, z)), `${x},${z}`);
});

test("deep water is water, and shore is not", () => {
  for (const [x, z] of COORDS) {
    if (isDeepWater(x, z)) assert.ok(isWater(x, z), `deep but dry at ${x},${z}`);
    if (isShore(x, z)) assert.ok(!isWater(x, z), `shore in the water at ${x},${z}`);
  }
});

test("deep water is surrounded by water on all four sides", () => {
  for (const [x, z] of COORDS) {
    if (!isDeepWater(x, z)) continue;
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      assert.ok(isWater(x + dx, z + dz), `deep water with a dry neighbour at ${x},${z}`);
    }
  }
});

test("the map is stable across repeated queries", () => {
  for (const [x, z] of COORDS) {
    assert.equal(isRoad(x, z), isRoad(x, z));
    assert.equal(isWater(x, z), isWater(x, z));
    assert.equal(getZone(x, z), getZone(x, z));
  }
});

test("roadblocks interrupt the axis roads without walling them off", () => {
  /* Roadblocks break the infinite-straight exploit; a run of them would instead be an impassable wall. */
  for (const along of [(i: number) => isRoad(i, 0), (i: number) => isRoad(0, i)]) {
    let blocked = 0;
    let gap = 0;
    let worstGap = 0;
    for (let i = -500; i <= 500; i++) {
      if (along(i)) gap = 0;
      else {
        blocked++;
        gap++;
        worstGap = Math.max(worstGap, gap);
      }
    }
    assert.ok(blocked > 0, "the axis road was never interrupted — the straight-road exploit is back");
    assert.ok(blocked < 100, `the axis road is more gap than road: ${blocked}/1001`);
    assert.equal(worstGap, 1, "consecutive roadblocks formed a wall across the axis");
  }
});
