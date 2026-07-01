import * as THREE from "three";
import type { Rickshaw } from "./Rickshaw";

type Puff = {
  mesh: THREE.Mesh;
  life: number; // remaining seconds
  maxLife: number;
  vel: THREE.Vector3;
};

/**
 * A small recycled pool of dust puffs kicked up behind the rickshaw when it
 * moves at speed. Pure visual juice.
 */
export class Dust {
  readonly group = new THREE.Group();
  private pool: Puff[] = [];
  private emitTimer = 0;

  constructor(size = 36) {
    const geo = new THREE.SphereGeometry(0.22, 6, 6);
    for (let i = 0; i < size; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xb7a98f,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.pool.push({ mesh, life: 0, maxLife: 0.6, vel: new THREE.Vector3() });
    }
  }

  private spawn(rickshaw: Rickshaw) {
    const puff = this.pool.find((p) => p.life <= 0);
    if (!puff) return;
    const h = rickshaw.heading;
    const pos = rickshaw.position;
    // Behind the rickshaw, near the ground.
    const back = 1.2;
    puff.mesh.position.set(
      pos.x - Math.sin(h) * back + (Math.random() - 0.5) * 0.5,
      0.3,
      pos.z - Math.cos(h) * back + (Math.random() - 0.5) * 0.5,
    );
    puff.vel.set((Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6);
    puff.maxLife = 0.5 + Math.random() * 0.3;
    puff.life = puff.maxLife;
    puff.mesh.scale.setScalar(0.5);
    puff.mesh.visible = true;
  }

  update(dt: number, rickshaw: Rickshaw) {
    // Emit while moving with some speed.
    if (Math.abs(rickshaw.speed) > 6) {
      this.emitTimer -= dt;
      if (this.emitTimer <= 0) {
        this.spawn(rickshaw);
        this.emitTimer = 0.04;
      }
    }

    for (const p of this.pool) {
      if (p.life <= 0) continue;
      p.life -= dt;
      const t = Math.max(p.life / p.maxLife, 0);
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.scale.setScalar(0.5 + (1 - t) * 1.2);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = t * 0.5;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}
