import * as THREE from "three";

/**
 * A glowing vertical beam + rotating ground ring used to mark the active
 * drop-off destination in the world.
 */
export class Marker {
  readonly object = new THREE.Group();
  private ring: THREE.Mesh;

  constructor(color = 0xff4d4d) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 14, 16, 1, true),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.28,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    beam.position.y = 7;
    this.object.add(beam);

    this.ring = new THREE.Mesh(
      new THREE.TorusGeometry(1.4, 0.18, 8, 24),
      new THREE.MeshBasicMaterial({ color }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.3;
    this.object.add(this.ring);

    this.object.visible = false;
  }

  setPosition(p: THREE.Vector3) {
    this.object.position.set(p.x, 0, p.z);
  }

  show(p: THREE.Vector3) {
    this.setPosition(p);
    this.object.visible = true;
  }

  hide() {
    this.object.visible = false;
  }

  update(dt: number) {
    if (this.object.visible) this.ring.rotation.z += dt * 1.5;
  }
}
