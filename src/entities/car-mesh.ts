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
 * Build the player car visual hierarchy. Geometry is parameterized by the
 * skin's `shape` field so each car has distinct proportions, optional
 * spoiler, racing stripe, or VinFast Vietnam flag on the roof.
 */
export function buildCarMesh(skinId: string): ICarMeshHandles {
  const unit = CAR_UNIT;
  const group = new THREE.Group();

  const skin: ICarSkin = getSkin(skinId);
  const s = skin.shape;
  const matProps = { roughness: 0.8, flatShading: true };

  // Chassis
  const bodyGeo = new THREE.BoxGeometry(unit * s.bodyW, unit * s.bodyH, unit * s.bodyL);
  const bodyMat = new THREE.MeshStandardMaterial({ color: skin.bodyColor, ...matProps });
  const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
  bodyMesh.position.y = unit * (0.5 + s.bodyH / 2);
  group.add(bodyMesh);

  // Cabin
  const cabinGeo = new THREE.BoxGeometry(unit * s.cabinW, unit * s.cabinH, unit * s.cabinL);
  const cabinMat = new THREE.MeshStandardMaterial({
    color: skin.cabinColor,
    roughness: 0.3,
    flatShading: true,
    metalness: 0.5,
  });
  const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
  const bodyTopY = unit * (0.5 + s.bodyH);
  cabinMesh.position.set(0, bodyTopY + (unit * s.cabinH) / 2, unit * s.cabinZ);
  group.add(cabinMesh);

  const roofY = bodyTopY + unit * s.cabinH + 0.01;

  // Vietnam flag (VinFast only)
  if (s.hasFlag) {
    const flagSize = Math.min(s.cabinW, s.cabinL) * unit * 0.85;
    const flagGeo = new THREE.PlaneGeometry(flagSize, flagSize);
    const flagMat = new THREE.MeshStandardMaterial({
      color: 0xda251d,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const flag = new THREE.Mesh(flagGeo, flagMat);
    flag.rotation.x = -Math.PI / 2;
    flag.position.set(0, roofY, unit * s.cabinZ);
    group.add(flag);

    // Yellow star on top of flag
    const starShape = new THREE.Shape();
    const starPoints = 5;
    const outerR = flagSize * 0.34;
    const innerR = flagSize * 0.14;
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
    star.position.set(0, roofY + 0.01, unit * s.cabinZ);
    group.add(star);
  }

  // Racing stripe along the body length (Mustang)
  if (s.hasStripe) {
    const stripeGeo = new THREE.PlaneGeometry(unit * 0.8, unit * s.bodyL * 0.95);
    const stripeMat = new THREE.MeshStandardMaterial({
      color: skin.accentColor,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.rotation.x = -Math.PI / 2;
    stripe.position.set(0, unit * (0.5 + s.bodyH) + 0.005, 0);
    group.add(stripe);
  }

  // Rear spoiler
  if (s.hasSpoiler) {
    // Two short uprights + one wide blade
    const uprightGeo = new THREE.BoxGeometry(unit * 0.25, unit * s.spoilerH, unit * 0.25);
    const spoilerMat = new THREE.MeshStandardMaterial({ color: skin.accentColor, ...matProps });
    const uprightL = new THREE.Mesh(uprightGeo, spoilerMat);
    const uprightR = new THREE.Mesh(uprightGeo, spoilerMat);
    const upY = unit * (0.5 + s.bodyH) + (unit * s.spoilerH) / 2;
    const upZ = unit * (s.bodyL / 2 - 0.6);
    uprightL.position.set(-unit * (s.spoilerW / 2 - 0.4), upY, upZ);
    uprightR.position.set(unit * (s.spoilerW / 2 - 0.4), upY, upZ);
    group.add(uprightL, uprightR);

    const bladeGeo = new THREE.BoxGeometry(unit * s.spoilerW, unit * 0.18, unit * 0.7);
    const blade = new THREE.Mesh(bladeGeo, spoilerMat);
    blade.position.set(0, upY + (unit * s.spoilerH) / 2, upZ);
    group.add(blade);
  }

  // Front grille
  const grilleGeo = new THREE.BoxGeometry(unit * (s.bodyW * 0.8), unit * 0.6, unit * 0.2);
  const grilleMat = new THREE.MeshStandardMaterial({ color: 0x222222, flatShading: true });
  const grille = new THREE.Mesh(grilleGeo, grilleMat);
  grille.position.set(0, unit * (0.5 + s.bodyH * 0.4), -unit * (s.bodyL / 2 + 0.1));
  group.add(grille);

  // Headlights (front = -Z)
  const headlightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
  const headlightMat = new THREE.MeshStandardMaterial({
    color: 0xffee88,
    emissive: 0xffee88,
    emissiveIntensity: 0.8,
    flatShading: true,
  });
  const hlY = unit * (0.5 + s.bodyH * 0.6);
  const hlX = unit * (s.bodyW / 2 - 0.5);
  const hlZ = -unit * (s.bodyL / 2 + 0.1);
  const hlLeft = new THREE.Mesh(headlightGeo, headlightMat);
  hlLeft.position.set(-hlX, hlY, hlZ);
  group.add(hlLeft);
  const hlRight = new THREE.Mesh(headlightGeo, headlightMat);
  hlRight.position.set(hlX, hlY, hlZ);
  group.add(hlRight);

  // Taillights (rear = +Z, red)
  const taillightGeo = new THREE.BoxGeometry(unit * 0.6, unit * 0.4, unit * 0.3);
  const taillightMat = new THREE.MeshStandardMaterial({
    color: 0xff2222,
    emissive: 0xff2222,
    emissiveIntensity: 0.6,
    flatShading: true,
  });
  const tlZ = unit * (s.bodyL / 2 + 0.1);
  const tlLeft = new THREE.Mesh(taillightGeo, taillightMat);
  tlLeft.position.set(-hlX, hlY, tlZ);
  group.add(tlLeft);
  const tlRight = new THREE.Mesh(taillightGeo, taillightMat);
  tlRight.position.set(hlX, hlY, tlZ);
  group.add(tlRight);

  // Wheels (4 corners, scaled to body size)
  const wheelGeo = new THREE.BoxGeometry(unit, unit, unit);
  const wheelMat = new THREE.MeshStandardMaterial({ color: skin.wheelColor, ...matProps });
  const wx = unit * (s.bodyW / 2 + 0.05);
  const wz = unit * (s.bodyL / 2 - 1.2);
  const wheelPositions: [number, number, number][] = [
    [-wx, unit * 0.5, wz],
    [wx, unit * 0.5, wz],
    [-wx, unit * 0.5, -wz],
    [wx, unit * 0.5, -wz],
  ];
  for (const pos of wheelPositions) {
    const wheel = new THREE.Mesh(wheelGeo, wheelMat);
    wheel.position.set(pos[0], pos[1], pos[2]);
    group.add(wheel);
  }

  return { group, bodyMat, cabinMat };
}
