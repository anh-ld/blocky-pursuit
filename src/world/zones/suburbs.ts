import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { IMaterials, IGeometries } from "../materials";
import type { IChunkData } from "../city-generator";
import { getBuildingGeometry } from "../building-geo";
import { addTree, addFlowers, addWindows } from "../decorators";

/* Roof geometry cache. Buckets (w, d, roofH) to 0.5u → at most 9*9*2 = 162 entries; materials live in IMaterials and dispose via CityGenerator.dispose(). Previous code allocated per house and never freed. */
const _roofGeoCache = new Map<string, THREE.ExtrudeGeometry>();

function getRoofGeometry(width: number, depth: number, roofH: number): THREE.ExtrudeGeometry {
  const key = `${Math.round(width * 2) / 2}_${Math.round(depth * 2) / 2}_${Math.round(roofH * 2) / 2}`;
  let geo = _roofGeoCache.get(key);
  if (!geo) {
    const roofW = width / 2 + 0.3;
    const shape = new THREE.Shape();
    shape.moveTo(-roofW, 0);
    shape.lineTo(0, roofH);
    shape.lineTo(roofW, 0);
    shape.closePath();
    geo = new THREE.ExtrudeGeometry(shape, { depth: depth + 0.6, bevelEnabled: false });
    _roofGeoCache.set(key, geo);
  }
  return geo;
}

export function placeSuburbs(
  chunk: IChunkData,
  materials: IMaterials,
  geometries: IGeometries,
  r1: number,
  r2: number,
  r3: number,
  r4: number,
  x: number,
  z: number,
) {
  /* 15% house */
  if (r1 > 0.85) {
    const height = 2 + r2 * 3;
    const width = 3 + r3 * 4;
    const depth = 3 + r4 * 4;

    const colorIndex = Math.floor(r3 * materials.suburbColors.length);
    const mat = materials.suburbColors[colorIndex];
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

    const roofOverhang = 0.3;
    const roofH = 0.8 + r2 * 0.6;
    const roofGeo = getRoofGeometry(width, depth, roofH);
    const roofMat = materials.roofColors[Math.floor(r4 * materials.roofColors.length)];
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(x, height, z - depth / 2 - roofOverhang);
    roofMesh.castShadow = true;
    chunk.group.add(roofMesh);

    /* Door */
    const door = new THREE.Mesh(geometries.building, materials.trunk);
    door.scale.set(0.8, 1.4, 0.15);
    door.position.set(x, 0.7, z - depth / 2 - 0.08);
    chunk.group.add(door);

    /* Driveway */
    const dw = new THREE.Mesh(geometries.building, materials.driveway);
    dw.scale.set(1.5, 0.04, 3);
    dw.position.set(x, 0.02, z - depth / 2 - 1.5);
    chunk.group.add(dw);
  } /* 22% tree */ else if (r1 > 0.63) {
    addTree(chunk, materials, geometries, x, z, r2, r3, false);
  } /* 8% flowers */ else if (r1 > 0.55) {
    addFlowers(chunk, materials, geometries, x, z, r2, r3);
  }
}
