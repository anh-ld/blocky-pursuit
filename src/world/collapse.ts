import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/* Safe only where children never move relative to each other; shared-material animation is fine. */
/* Mark animated children `userData.noCollapse`. Returned geometries are caller-owned — dispose them. */
/** Bake static meshes to one per material. Mutates `group`, returns the geometries it created. */
export function collapseGroup(group: THREE.Group): THREE.BufferGeometry[] {
  group.updateMatrixWorld(true);

  /* Re-parenting onto `group` drops the old chain — rebase or nested meshes snap to origin. */
  const toLocal = group.matrixWorld.clone().invert();
  const _m = new THREE.Matrix4();

  const rebase = (m: THREE.Mesh) => {
    _m.multiplyMatrices(toLocal, m.matrixWorld);
    _m.decompose(m.position, m.quaternion, m.scale);
    group.add(m);
  };

  /* Material + shadow flags: the only per-mesh render state a static group carries. */
  const buckets = new Map<string, { mat: THREE.Material; meshes: THREE.Mesh[] }>();
  const keep: THREE.Mesh[] = [];

  group.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || Array.isArray(m.material)) return;

    if (m.userData.noCollapse) {
      keep.push(m);
      return;
    }

    const mat = m.material as THREE.Material;
    const key = `${mat.id}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.meshes.push(m);
    else buckets.set(key, { mat, meshes: [m] });
  });

  group.clear();
  const created: THREE.BufferGeometry[] = [];

  for (const m of keep) rebase(m);

  for (const { mat, meshes } of buckets.values()) {
    /* Already one draw call — cheaper than cloning its geometry. */
    if (meshes.length === 1) {
      rebase(meshes[0]);
      continue;
    }

    const parts = meshes.map((m) => m.geometry.clone().applyMatrix4(_m.multiplyMatrices(toLocal, m.matrixWorld)));

    /* mergeGeometries needs a uniform index; ExtrudeGeometry roofs are non-indexed. */
    const src =
      parts.some((p) => p.index) && !parts.every((p) => p.index)
        ? parts.map((p) => (p.index ? p.toNonIndexed() : p))
        : parts;

    const merged = mergeGeometries(src, false);

    src.forEach((s, i) => {
      if (s !== parts[i]) s.dispose();
    });

    for (const p of parts) p.dispose();

    /* Null on attribute mismatch — keep originals rather than drop the decor. */
    if (!merged) {
      for (const m of meshes) rebase(m);
      continue;
    }

    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = meshes[0].castShadow;
    mesh.receiveShadow = meshes[0].receiveShadow;
    group.add(mesh);
    created.push(merged);
  }

  return created;
}
