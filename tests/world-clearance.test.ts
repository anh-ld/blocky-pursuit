/* Corridor clearance: an overhanging collider is an untelegraphed wall in the chase route. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import * as CANNON from "cannon-es";
import { CityGenerator } from "../src/world/city-generator.ts";
import { TILE_SIZE, isRoad } from "../src/world/terrain.ts";

/* Half a chamfer of slack — RoundedBoxGeometry insets its corners. */
const TOLERANCE = 0.1;

const world = new CANNON.World();
const city = new CityGenerator(new THREE.Scene(), world);

for (let cx = -3; cx <= 3; cx++) {
  for (let cz = -3; cz <= 3; cz++) {
    city.generateChunk(cx, cz);
  }
}

test("the fixture world is populated", () => {
  assert.ok(world.bodies.length > 100, `expected a populated world, got ${world.bodies.length} bodies`);
});

test("no static collider overhangs its own tile", () => {
  for (const body of world.bodies) {
    for (const shape of body.shapes) {
      const half = (shape as CANNON.Box).halfExtents;

      for (const axis of ["x", "z"] as const) {
        const centre = body.position[axis];
        const tile = Math.floor(centre / TILE_SIZE);
        const lo = tile * TILE_SIZE;
        const hi = lo + TILE_SIZE;

        assert.ok(
          centre - half[axis] >= lo - TOLERANCE && centre + half[axis] <= hi + TOLERANCE,
          `collider at ${axis}=${centre.toFixed(2)} (half ${half[axis].toFixed(2)}) escapes tile [${lo}, ${hi}]`,
        );
      }
    }
  }
});

test("no static collider stands on a road tile", () => {
  for (const body of world.bodies) {
    const tileX = Math.floor(body.position.x / TILE_SIZE);
    const tileZ = Math.floor(body.position.z / TILE_SIZE);
    assert.ok(!isRoad(tileX, tileZ), `collider blocking road tile ${tileX},${tileZ}`);
  }
});
