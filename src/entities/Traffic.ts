import * as THREE from "three";

type Vehicle = {
  group: THREE.Group;
  horizontal: boolean; // true: drives along X (z fixed), false: along Z (x fixed)
  line: number; // fixed coordinate (the road centerline)
  laneOffset: number; // offset from centerline so cars keep to one side
  dir: 1 | -1;
  speed: number;
  halfX: number;
  halfZ: number;
  nearCooldown: number; // debounce near-miss scoring per vehicle
};

const CAR_COLORS = [0x2a6fb0, 0xb02a2a, 0xe0e0e0, 0x2f8f4e, 0xe0a93f, 0x444444];

/**
 * Simple ambient traffic: boxy cars/buses that cruise along road centerlines and
 * wrap around at the city edge. They're obstacles — the rickshaw collides with
 * them (handled via `collide`).
 */
export class Traffic {
  readonly group = new THREE.Group();
  private vehicles: Vehicle[] = [];

  constructor(
    private readonly roadLines: number[],
    private readonly span: number,
    count = 10,
  ) {
    for (let i = 0; i < count; i++) this.spawn();
  }

  private spawn() {
    const horizontal = Math.random() < 0.5;
    const line = this.roadLines[Math.floor(Math.random() * this.roadLines.length)];
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
    const isBus = Math.random() < 0.25;

    const w = isBus ? 1.8 : 1.5;
    const len = isBus ? 5.5 : 3.2;
    const h = isBus ? 2.2 : 1.4;

    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, len),
      new THREE.MeshStandardMaterial({
        color: isBus ? 0xc1121f : CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)],
        roughness: 0.6,
      }),
    );
    body.position.y = h / 2 + 0.34;
    body.castShadow = true;

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.9, h * 0.5, len * (isBus ? 0.8 : 0.5)),
      new THREE.MeshStandardMaterial({ color: 0x223044, roughness: 0.3 }),
    );
    cabin.position.y = h + 0.34;
    cabin.position.z = isBus ? 0 : -len * 0.1;

    const group = new THREE.Group();
    group.add(body, cabin);

    // Wheels.
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.24, 12);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set((sx * w) / 2, 0.34, (sz * len) / 2.6);
        group.add(wheel);
      }
    }

    // Cars travel built facing +Z; orient toward travel direction.
    const laneOffset = (Math.random() < 0.5 ? 1 : -1) * 2.0;
    const v: Vehicle = {
      group,
      horizontal,
      line,
      laneOffset,
      dir,
      speed: 6 + Math.random() * 6,
      halfX: horizontal ? len / 2 : w / 2,
      halfZ: horizontal ? w / 2 : len / 2,
      nearCooldown: 0,
    };

    if (horizontal) {
      group.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.position.set((Math.random() - 0.5) * this.span, 0, line + laneOffset);
    } else {
      group.rotation.y = dir > 0 ? 0 : Math.PI;
      group.position.set(line + laneOffset, 0, (Math.random() - 0.5) * this.span);
    }

    this.group.add(group);
    this.vehicles.push(v);
  }

  update(dt: number) {
    const limit = this.span / 2 + 6;
    for (const v of this.vehicles) {
      if (v.nearCooldown > 0) v.nearCooldown -= dt;
      const d = v.speed * v.dir * dt;
      if (v.horizontal) {
        v.group.position.x += d;
        if (v.group.position.x > limit) v.group.position.x = -limit;
        else if (v.group.position.x < -limit) v.group.position.x = limit;
      } else {
        v.group.position.z += d;
        if (v.group.position.z > limit) v.group.position.z = -limit;
        else if (v.group.position.z < -limit) v.group.position.z = limit;
      }
    }
  }

  /**
   * Push a circle (the rickshaw) out of any vehicle it overlaps. Mutates `pos`.
   * Returns true on contact.
   */
  collide(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    for (const v of this.vehicles) {
      const minX = v.group.position.x - v.halfX;
      const maxX = v.group.position.x + v.halfX;
      const minZ = v.group.position.z - v.halfZ;
      const maxZ = v.group.position.z + v.halfZ;
      const cx = Math.max(minX, Math.min(pos.x, maxX));
      const cz = Math.max(minZ, Math.min(pos.z, maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;
      if (distSq < radius * radius && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
        hit = true;
      }
    }
    return hit;
  }

  /**
   * Count vehicles the rickshaw squeezed *past* this frame: inside the near-miss
   * band (just outside the collision radius) but not actually touching. Each
   * counts at most once until its cooldown expires, so a slow crawl alongside a
   * bus doesn't farm points. Returns how many fresh near-misses occurred.
   */
  nearMiss(pos: THREE.Vector3, radius: number, band = 1.5): number {
    let count = 0;
    const outer = radius + band;
    for (const v of this.vehicles) {
      if (v.nearCooldown > 0) continue;
      const minX = v.group.position.x - v.halfX;
      const maxX = v.group.position.x + v.halfX;
      const minZ = v.group.position.z - v.halfZ;
      const maxZ = v.group.position.z + v.halfZ;
      const cx = Math.max(minX, Math.min(pos.x, maxX));
      const cz = Math.max(minZ, Math.min(pos.z, maxZ));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist >= radius && dist <= outer) {
        v.nearCooldown = 2.5;
        count += 1;
      }
    }
    return count;
  }
}
