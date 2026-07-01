import * as THREE from "three";
import type { Rickshaw } from "../entities/Rickshaw";

/**
 * A floating 3D arrow hovering above the rickshaw that always points toward the
 * current objective (pickup or drop-off), so the player knows which way to go.
 */
export class Arrow {
  readonly object = new THREE.Group();
  private bobT = 0;

  constructor() {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x33ddff,
      emissive: 0x1188aa,
      emissiveIntensity: 0.7,
    });

    // Built pointing along +Z so rotation.y aims it horizontally.
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.9, 4), mat);
    head.rotation.x = Math.PI / 2;
    head.position.z = 0.85;
    this.object.add(head);

    const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 1.1), mat);
    this.object.add(shaft);

    this.object.visible = false;
  }

  update(dt: number, rickshaw: Rickshaw, target: THREE.Vector3 | null) {
    if (!target) {
      this.object.visible = false;
      return;
    }
    this.object.visible = true;
    this.bobT += dt * 3;

    const pos = rickshaw.position;
    this.object.position.set(pos.x, pos.y + 3 + Math.sin(this.bobT) * 0.15, pos.z);

    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    this.object.rotation.y = Math.atan2(dx, dz);
  }
}
