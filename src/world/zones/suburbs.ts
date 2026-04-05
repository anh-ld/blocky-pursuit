import * as THREE from "three";
import * as CANNON from "cannon-es";
import type { IMaterials, IGeometries } from "../materials";
import type { IChunkData } from "../city-generator";
import { addTree, addFlowers, addWindows } from "../decorators";

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
  // 15% house
  if (r1 > 0.85) {
    const height = 2 + r2 * 3;
    const width = 3 + r3 * 4;
    const depth = 3 + r4 * 4;

    const colorIndex = Math.floor(r3 * materials.suburbColors.length);
    const mat = materials.suburbColors[colorIndex];
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

    // Pitched roof
    const roofOverhang = 0.3;
    const roofW = width / 2 + roofOverhang;
    const roofH = 0.8 + r2 * 0.6;
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-roofW, 0);
    roofShape.lineTo(0, roofH);
    roofShape.lineTo(roofW, 0);
    roofShape.closePath();
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, {
      depth: depth + roofOverhang * 2,
      bevelEnabled: false,
    });
    const roofColors = [0x8d6e63, 0x795548, 0xa1887f, 0xc62828, 0xd84315, 0x37474f, 0x4e342e, 0x1b5e20];
    const roofColorIdx = Math.floor(r4 * roofColors.length);
    const roofMat = new THREE.MeshStandardMaterial({
      color: roofColors[roofColorIdx],
      roughness: 0.8,
      flatShading: true,
    });
    const roofMesh = new THREE.Mesh(roofGeo, roofMat);
    roofMesh.position.set(x, height, z - depth / 2 - roofOverhang);
    roofMesh.castShadow = true;
    chunk.group.add(roofMesh);

    // Door
    const door = new THREE.Mesh(geometries.building, materials.trunk);
    door.scale.set(0.8, 1.4, 0.15);
    door.position.set(x, 0.7, z - depth / 2 - 0.08);
    chunk.group.add(door);

    // Driveway
    const dw = new THREE.Mesh(geometries.building, materials.driveway);
    dw.scale.set(1.5, 0.04, 3);
    dw.position.set(x, 0.02, z - depth / 2 - 1.5);
    chunk.group.add(dw);
  }
  // 22% tree
  else if (r1 > 0.63) {
    addTree(chunk, materials, geometries, x, z, r2, r3, false);
  }
  // 8% flowers
  else if (r1 > 0.55) {
    addFlowers(chunk, materials, geometries, x, z, r2, r3);
  }
}
