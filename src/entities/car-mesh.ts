import * as THREE from "three";
import { getSkin, type ICarSkin } from "./car-skins";

// Voxel unit shared by both player and cop meshes.
export const CAR_UNIT = 0.5;

export type ICarMeshHandles = {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  cabinMat: THREE.MeshStandardMaterial;
};

/**
 * Build the player car visual hierarchy: chassis, cabin, Vietnam flag,
 * grille, headlights/taillights, wheels. Returns the assembled group plus
 * mutable references to the body/cabin materials so a skin swap can recolor
 * them in place without rebuilding the mesh.
 */
export function buildCarMesh(skinId: string): ICarMeshHandles {
  const unit = CAR_UNIT;
  const group = new THREE.Group();

  const skin: ICarSkin = getSkin(skinId);
  const wheelColor = 0x111111;
  const matProps = { roughness: 0.8, flatShading: true };

  // Chassis
  const bodyGeo = new THREE.BoxGeometry(unit * 4, unit, unit * 8);
  const bodyMat = new THREE.MeshStandardMaterial({ color: skin.bodyColor, ...matProps });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = unit;
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  // Cabin (shifted toward rear so front hood is visible)
  const cabinGeo = new THREE.BoxGeometry(unit * 3, unit * 1.5, unit * 3);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: skin.cabinColor,
    roughness: 0.3,
    flatShading: true,
    metalness: 0.5,
  });
  const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
  cabinMesh.position.y = unit * 2.25;
  cabinMesh.position.z = unit * 1.5;
  cabinMesh.castShadow = true;
  cabinMesh.receiveShadow = true;
  group.add(cabinMesh);

  // Vietnam flag painted on roof (flat on cabin top)
  const roofY = unit * 3.01;
  const flagGeo = new THREE.PlaneGeometry(unit * 2.6, unit * 2.6);
  const flagMat = new THREE.MeshStandardMaterial({
    color: 0xda251d,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const flag = new THREE.Mesh(flagGeo, flagMat);
  flag.rotation.x = -Math.PI / 2;
  flag.position.set(0, roofY, unit * 1.5);
  group.add(flag);

  // Yellow star on top of flag
  const starShape = new THREE.Shape();
  const starPoints = 5;
  const outerR = unit * 0.85;
  const innerR = unit * 0.34;
  for (let i = 0; i < starPoints * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / starPoints - Math.PI / 2;
    const x = Math.cos(angle) * r;
    const y = Math.sin(angle) * r;
    if (i === 0) starShape.moveTo(x, y);
    else starShape.lineTo(x, y);
  }
  starShape.closePath();
  const starGeo = new THREE.ShapeGeometry(starShape);
  const starMat = new THREE.MeshStandardMaterial({
    color: 0xffcd00,
    flatShading: true,
    side: THREE.DoubleSide,
  });
  const star = new THREE.Mesh(starGeo, starMat);
  star.rotation.x = -Math.PI / 2;
  star.position.set(0, roofY + 0.01, unit * 1.5);
  group.add(star);

  // Front grille
  const grilleGeo = new THREE.BoxGeometry(unit * 3.2, unit * 0.6, unit * 0.2);
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
  const grille = new THREE.Mesh(grilleGeo, grilleMat);
  grille.position.set(0, unit * 0.9, -unit * 4.1);
  group.add(grille);

  // Headlights (front = -Z)
  const headlightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: 0xffee88,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-unit * 1.5, unit * 1.1, -unit * 4.1);
  group.add(hlLeft);
  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(unit * 1.5, unit * 1.1, -unit * 4.1);
  group.add(hlRight);

  // Taillights (rear = +Z, red)
  const taillightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff2222,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const tlLeft = new THREE.Mesh(taillightGeo, taillightMat);
  tlLeft.position.set(-unit * 1.5, unit * 1.1, unit * 4.1);
  group.add(tlLeft);
  const tlRight = new THREE.Mesh(taillightGeo, taillightMat);
  tlRight.position.set(unit * 1.5, unit * 1.1, unit * 4.1);
  group.add(tlRight);

  // Wheels
  const wheelGeo = new THREE.BoxGeometry(unit, unit, unit);
  const wheelMat = new THREE.MeshStandardMaterial({ color: wheelColor, ...matProps });
  const wheelPositions: [number, number, number][] = [
    [-unit * 2.5, unit * 0.5, unit * 2.5],
    [unit * 2.5, unit * 0.5, unit * 2.5],
    [-unit * 2.5, unit * 0.5, -unit * 2.5],
    [unit * 2.5, unit * 0.5, -unit * 2.5],
  ];
  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(pos[0], pos[1], pos[2]);
    wheel.castShadow = true;
    group.add(wheel);
  }

  return { group, bodyMat, cabinMat };
}
