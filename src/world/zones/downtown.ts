import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { Materials, Geometries } from "../materials";
import type { ChunkData } from "../city-generator";
import { addTree, addWindows, addRooftopDetail } from "../decorators";

export function placeDowntown(
  chunk: ChunkData,
  materials: Materials,
  geometries: Geometries,
  r1: number,
  r2: number,
  r3: number,
  r4: number,
  x: number,
  z: number,
) {
  // 30% tall building
  if (r1 > 0.7) {
    const height = 6 + r2 * 14;
    const width = 4 + r3 * 4;
    const depth = 4 + r4 * 4;

    const colorIndex = Math.floor(r3 * materials.downtownColors.length);
    const mat = materials.downtownColors[colorIndex];
    const mesh = new THREE.Mesh(geometries.building, mat);
    mesh.scale.set(width, height, depth);
    mesh.position.set(x, height / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    chunk.group.add(mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(width / 2, height / 2, depth / 2));
    const body = new CANNON.Body({ mass: 0 });
    body.addShape(shape);
    body.position.set(x, height / 2, z);
    chunk.world.addBody(body);
    chunk.bodies.push(body);

    addWindows(chunk, geometries, materials, x, z, width, height, depth);
    addRooftopDetail(chunk, geometries, materials, x, z, height, width, depth, r4);
  }
  // 10% small tree/planter
  else if (r1 > 0.6) {
    addTree(chunk, materials, geometries, x, z, r2, r3, true);
  }
}
