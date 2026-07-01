import * as THREE from "three";

/**
 * Slow-drifting low-poly clouds high above the city. Pure backdrop: a handful of
 * puffy groups that scroll across the sky and wrap around. Cheap (flat-shaded
 * spheres, no shadows).
 */
export class Clouds {
  readonly group = new THREE.Group();
  private puffs: { mesh: THREE.Group; speed: number }[] = [];

  constructor(span: number, count = 14) {
    const reach = span * 0.8;
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 1,
      emissive: 0x222933,
      emissiveIntensity: 0.15,
    });
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const lobes = 3 + Math.floor(Math.random() * 4);
      for (let l = 0; l < lobes; l++) {
        const r = 3 + Math.random() * 4;
        const blob = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), mat);
        blob.position.set((Math.random() - 0.5) * 12, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 8);
        blob.scale.y = 0.5;
        cloud.add(blob);
      }
      cloud.position.set(
        (Math.random() - 0.5) * reach * 2,
        38 + Math.random() * 22,
        (Math.random() - 0.5) * reach * 2,
      );
      this.group.add(cloud);
      this.puffs.push({ mesh: cloud, speed: 1.2 + Math.random() * 1.8 });
    }
    this.reach = reach;
  }

  private reach: number;

  update(dt: number) {
    for (const p of this.puffs) {
      p.mesh.position.x += p.speed * dt;
      if (p.mesh.position.x > this.reach) p.mesh.position.x = -this.reach;
    }
  }
}
