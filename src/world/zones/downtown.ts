import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { IMaterials, IGeometries } from "../materials";
import type { IChunkData } from "../city-generator";
import { getBuildingGeometry } from "../building-geo";
import { fitToTile } from "../terrain";
import { addTree, addWindows, addRooftopDetail } from "../decorators";

/* cx/cz tile centre, ox/oz jitter — footprints clamp their own jitter to stay off neighbouring roads. */
export function placeDowntown(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  r1: number,
  r2: number,
  r3: number,
  r4: number,
  cx: number,
  cz: number,
  ox: number,
  oz: number,
) {
  /* 30% tall building */
  if (r1 > 0.7) {
    const height = 6 + r2 * 14;
    const width = 4 + r3 * 4;
    const depth = 4 + r4 * 4;
    const x = fitToTile(cx, ox, width / 2);
    const z = fitToTile(cz, oz, depth / 2);

    const colorIndex = Math.floor(r3 * materials.downtownColors.length);
    const mat = materials.downtownColors[colorIndex];
    const mesh = new THREE.Mesh(getBuildingGeometry(width, height, depth), mat);
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
    addRooftopDetail(chunk, materials, x, z, height, width, depth, r4);
  } /* 10% small tree/planter */ else if (r1 > 0.6) {
    addTree(chunk, materials, geometries, cx + ox, cz + oz, r2, r3, true);
  }
}
