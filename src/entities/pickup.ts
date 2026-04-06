import * as THREE from "three";

export type IPickupKind = "nitro" | "shield" | "emp";

const NITRO_MAT = new THREE.MeshStandardMaterial({
  color: 0xffaa00,
  emissive: 0xffaa00,
  emissiveIntensity: 0.8,
  flatShading: true,
});
const SHIELD_MAT = new THREE.MeshStandardMaterial({
  color: 0x66ddff,
  emissive: 0x66ddff,
  emissiveIntensity: 0.7,
  flatShading: true,
});
const EMP_MAT = new THREE.MeshStandardMaterial({
  color: 0xcc66ff,
  emissive: 0xcc66ff,
  emissiveIntensity: 0.8,
  flatShading: true,
});
const PICKUP_GEO = new THREE.BoxGeometry(1, 1, 1);

export class Pickup {
  scene: THREE.Scene;
  mesh: THREE.Group;
  position: THREE.Vector3;
  kind: IPickupKind;
  age: number = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3, kind: IPickupKind) {
    this.scene = scene;
    this.kind = kind;
    this.position = position.clone();
    this.mesh = new THREE.Group();

    const mat = kind === "nitro" ? NITRO_MAT : kind === "shield" ? SHIELD_MAT : EMP_MAT;
    const cube = new THREE.Mesh(PICKUP_GEO, mat);
    cube.scale.set(1.2, 1.2, 1.2);
    this.mesh.add(cube);
    this.mesh.position.copy(position);
    this.mesh.position.y = 1.5;
    scene.add(this.mesh);
  }

  update(dt: number) {
    this.age += dt;
    this.mesh.rotation.y += dt * 2;
    this.mesh.position.y = 1.5 + Math.sin(this.age * 3) * 0.3;
  }

  destroy() {
    this.scene.remove(this.mesh);
  }
}
