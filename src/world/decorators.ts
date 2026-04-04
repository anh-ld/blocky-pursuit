import * as THREE from "three";
import * as CANNON from "cannon-es";
import { pseudoRandom } from "./terrain";
import type { Materials, Geometries } from "./materials";
import type { ChunkData } from "./city-generator";

export function addTree(
  chunk: ChunkData,
  materials: Materials,
  geometries: Geometries,
  x: number,
  z: number,
  r2: number,
  r3: number,
  small: boolean,
) {
  const treeHeight = small ? 1 + r2 * 1.5 : 1.5 + r2 * 2.5;
  const leafMat = r3 > 0.5 ? materials.tree : materials.treeDark;

  const trunkMesh = new THREE.Mesh(geometries.building, materials.trunk);
  trunkMesh.scale.set(0.6, treeHeight, 0.6);
  trunkMesh.position.set(x, treeHeight / 2, z);
  trunkMesh.castShadow = true;
  chunk.group.add(trunkMesh);

  const leavesSize = small ? 1.5 + r3 : 2 + r3 * 2;
  const leavesMesh = new THREE.Mesh(geometries.building, leafMat);
  leavesMesh.scale.set(leavesSize, leavesSize, leavesSize);
  leavesMesh.position.set(x, treeHeight + leavesSize / 2 - 0.5, z);
  leavesMesh.castShadow = true;
  chunk.group.add(leavesMesh);

  const shape = new CANNON.Box(new CANNON.Vec3(0.6, treeHeight / 2, 0.6));
  const body = new CANNON.Body({ mass: 0 });
  body.addShape(shape);
  body.position.set(x, treeHeight / 2, z);
  chunk.world.addBody(body);
  chunk.bodies.push(body);
}

export function addFlowers(
  chunk: ChunkData,
  materials: Materials,
  geometries: Geometries,
  x: number,
  z: number,
  r2: number,
  r3: number,
) {
  const count = 2 + Math.floor(r2 * 3);
  for (let f = 0; f < count; f++) {
    const fr = pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 60 + f);
    const fx = x + (fr - 0.5) * 4;
    const fz = z + (pseudoRandom(Math.floor(x * 100), Math.floor(z * 100), 70 + f) - 0.5) * 4;
    const colorIdx = Math.floor(r3 * materials.flower.length);
    const flower = new THREE.Mesh(geometries.building, materials.flower[colorIdx]);
    flower.scale.set(0.4, 0.6, 0.4);
    flower.position.set(fx, 0.3, fz);
    chunk.group.add(flower);
  }
}

export function addWindows(
  chunk: ChunkData,
  geometries: Geometries,
  materials: Materials,
  x: number,
  z: number,
  width: number,
  height: number,
  depth: number,
) {
  const winSize = 0.6;
  const winDepth = 0.1;
  const spacingY = 2.5;
  const spacingH = 2.0;

  const faces: { axis: "x" | "z"; dir: number; faceW: number; faceD: number }[] = [
    { axis: "z", dir: 1, faceW: width, faceD: depth },
    { axis: "z", dir: -1, faceW: width, faceD: depth },
    { axis: "x", dir: 1, faceW: depth, faceD: width },
    { axis: "x", dir: -1, faceW: depth, faceD: width },
  ];

  for (const face of faces) {
    const cols = Math.floor((face.faceW - 1) / spacingH);
    const rows = Math.floor((height - 1) / spacingY);
    if (cols < 1 || rows < 1) continue;

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wr = pseudoRandom(
          Math.floor(x * 10) + col,
          Math.floor(z * 10) + row,
          400 + (face.axis === "x" ? face.dir * 50 : face.dir * 100),
        );
        if (wr < 0.35) continue;

        const wy = 1.5 + row * spacingY;
        const wOffset = -((cols - 1) * spacingH) / 2 + col * spacingH;

        const win = new THREE.Mesh(geometries.building, materials.window);
        if (face.axis === "z") {
          win.scale.set(winSize, winSize, winDepth);
          win.position.set(x + wOffset, wy, z + (face.dir * depth) / 2 + face.dir * 0.05);
        } else {
          win.scale.set(winDepth, winSize, winSize);
          win.position.set(x + (face.dir * face.faceD) / 2 + face.dir * 0.05, wy, z + wOffset);
        }
        chunk.group.add(win);
      }
    }
  }
}

export function addRooftopDetail(
  chunk: ChunkData,
  geometries: Geometries,
  materials: Materials,
  x: number,
  z: number,
  height: number,
  width: number,
  depth: number,
  r: number,
) {
  const roofY = height;

  if (r > 0.5) {
    const acW = 0.8 + r * 0.8;
    const acH = 0.5 + r * 0.4;
    const ac = new THREE.Mesh(geometries.building, materials.rooftopAC);
    ac.scale.set(acW, acH, acW);
    const offsetX = (r - 0.5) * (width * 0.4);
    const offsetZ = (pseudoRandom(Math.floor(x), Math.floor(z), 500) - 0.5) * (depth * 0.4);
    ac.position.set(x + offsetX, roofY + acH / 2, z + offsetZ);
    chunk.group.add(ac);
  } else if (r > 0.25) {
    const poleH = 1.5 + r * 3;
    const pole = new THREE.Mesh(geometries.building, materials.rooftopAC);
    pole.scale.set(0.15, poleH, 0.15);
    pole.position.set(x, roofY + poleH / 2, z);
    chunk.group.add(pole);
  }
}
