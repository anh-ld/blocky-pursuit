/* Guards the chunk-collapse optimisation: it must be lossless. */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { collapseGroup } from "../src/world/collapse.ts";

const matA = new THREE.MeshStandardMaterial({ color: 0x112233 });
const matB = new THREE.MeshStandardMaterial({ color: 0x445566 });
const matC = new THREE.MeshStandardMaterial({ color: 0x778899 });

/* Total triangles and union bounding box across every mesh in a group. */
function census(group: THREE.Group) {
  let meshes = 0;
  let tris = 0;
  const box = new THREE.Box3();

  group.updateMatrixWorld(true);

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    meshes++;
    const g = m.geometry as THREE.BufferGeometry;
    const idx = g.getIndex();
    tris += (idx ? idx.count : g.getAttribute("position").count) / 3;
    box.union(new THREE.Box3().setFromObject(m));
  });

  return { meshes, tris, box };
}

/* Three boxes on matA, two on matB, one lone sphere. */
function buildGroup() {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(2, 2, 2);

  for (const [x, y, z] of [
    [0, 0, 0],
    [20, 0, 0],
    [0, 0, -35],
  ]) {
    const m = new THREE.Mesh(geo, matA);
    m.position.set(x, y, z);
    group.add(m);
  }

  for (const x of [5, 12]) {
    const m = new THREE.Mesh(geo, matB);
    m.position.set(x, 3, 8);
    m.castShadow = true;
    group.add(m);
  }

  /* Nested under a transformed sub-group, and sole member of its bucket. */
  const sub = new THREE.Group();
  sub.position.set(100, 0, 0);
  const lone = new THREE.Mesh(new THREE.SphereGeometry(1, 8, 6), matC);
  lone.position.set(0, 5, 0);
  sub.add(lone);
  group.add(sub);

  return group;
}

test("collapse preserves triangle count", () => {
  const group = buildGroup();
  const before = census(group);
  collapseGroup(group);
  const after = census(group);
  assert.equal(after.tris, before.tris);
});

test("collapse preserves world-space extent", () => {
  const group = buildGroup();
  const before = census(group);
  collapseGroup(group);
  const after = census(group);

  /* A dropped matrix pulls everything to the origin. */
  for (const axis of ["x", "y", "z"] as const) {
    assert.ok(
      Math.abs(after.box.min[axis] - before.box.min[axis]) < 1e-4,
      `min.${axis} moved: ${before.box.min[axis]} -> ${after.box.min[axis]}`,
    );

    assert.ok(
      Math.abs(after.box.max[axis] - before.box.max[axis]) < 1e-4,
      `max.${axis} moved: ${before.box.max[axis]} -> ${after.box.max[axis]}`,
    );
  }
});

test("collapse cuts the draw calls", () => {
  const group = buildGroup();
  const before = census(group);
  collapseGroup(group);
  const after = census(group);

  /* matA merges 3, matB merges 2, lone matC sphere kept. */
  assert.equal(before.meshes, 6);
  assert.equal(after.meshes, 3);
});

test("meshes are not merged across differing shadow flags", () => {
  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const a = new THREE.Mesh(geo, matA);
  const b = new THREE.Mesh(geo, matA);
  b.position.x = 4;
  b.castShadow = true;
  group.add(a, b);

  collapseGroup(group);
  assert.equal(census(group).meshes, 2);
});

test("returns exactly the geometries the caller must dispose", () => {
  const group = buildGroup();
  const created = collapseGroup(group);
  /* The lone sphere reuses its shared geometry and is not ours to free. */
  assert.equal(created.length, 2);
  for (const g of created) assert.ok(g instanceof THREE.BufferGeometry);
});
