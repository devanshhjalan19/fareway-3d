import * as THREE from "three";

type Coin = {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  spin: number;
  life: number;
};

const GRAVITY = 22;

/**
 * A pooled burst of golden coins that pops at a drop-off, arcs up and falls back
 * down. Pure visual juice; spawns nothing when idle.
 */
export class CoinBurst {
  readonly group = new THREE.Group();
  private coins: Coin[] = [];
  private geo = new THREE.CylinderGeometry(0.18, 0.18, 0.05, 12);
  private mat = new THREE.MeshStandardMaterial({
    color: 0xffd23f,
    metalness: 0.7,
    roughness: 0.3,
    emissive: 0x4a3a00,
    emissiveIntensity: 0.4,
  });

  /** Pop `count` coins out of a point. */
  burst(pos: THREE.Vector3, count = 16) {
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.position.set(pos.x, 0.6, pos.z);
      mesh.rotation.x = Math.PI / 2;
      this.group.add(mesh);
      const a = Math.random() * Math.PI * 2;
      const out = 2 + Math.random() * 3;
      this.coins.push({
        mesh,
        vx: Math.cos(a) * out,
        vy: 6 + Math.random() * 4,
        vz: Math.sin(a) * out,
        spin: (Math.random() - 0.5) * 20,
        life: 1.1 + Math.random() * 0.4,
      });
    }
  }

  update(dt: number) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.vy -= GRAVITY * dt;
      c.mesh.position.x += c.vx * dt;
      c.mesh.position.y += c.vy * dt;
      c.mesh.position.z += c.vz * dt;
      c.mesh.rotation.z += c.spin * dt;
      if (c.mesh.position.y < 0.2) {
        c.mesh.position.y = 0.2;
        c.vy *= -0.4; // small bounce
        c.vx *= 0.6;
        c.vz *= 0.6;
      }
      c.life -= dt;
      if (c.life <= 0) {
        this.group.remove(c.mesh);
        this.coins.splice(i, 1);
      }
    }
  }
}
