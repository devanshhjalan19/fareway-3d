import * as THREE from "three";

type Cow = {
  group: THREE.Group;
  legs: THREE.Mesh[];
  horizontal: boolean; // moves along X (true) or Z (false)
  dir: 1 | -1;
  speed: number; // base wander speed
  idle: number; // seconds left standing still
  walkPhase: number;
};

const COW_RADIUS = 0.9;

/**
 * A handful of cows ambling through the streets — Mumbai flavor and gentle
 * moving obstacles. They wander slowly along the roads, pause now and then, and
 * animate a simple walk. Unlike static props they're resolved dynamically via
 * `collide`, so the rickshaw bumps them rather than hitting an invisible box.
 */
export class Cows {
  readonly group = new THREE.Group();
  private cows: Cow[] = [];

  constructor(
    roadLines: number[],
    private readonly span: number,
    count = 8,
  ) {
    const used: THREE.Vector3[] = [];
    let attempts = 0;
    while (this.cows.length < count && attempts < count * 20) {
      attempts++;
      const horizontal = Math.random() < 0.5;
      const line = roadLines[Math.floor(Math.random() * roadLines.length)];
      const along = (Math.random() - 0.5) * (span - 12);
      const off = (Math.random() - 0.5) * 4;
      const pos = horizontal
        ? new THREE.Vector3(along, 0, line + off)
        : new THREE.Vector3(line + off, 0, along);
      if (used.some((u) => u.distanceTo(pos) < 10)) continue;
      used.push(pos);

      const legs: THREE.Mesh[] = [];
      const g = this.buildCow(legs);
      g.position.copy(pos);
      const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1;
      this.orient(g, horizontal, dir);
      this.group.add(g);
      this.cows.push({
        group: g,
        legs,
        horizontal,
        dir,
        speed: 0.7 + Math.random() * 0.9,
        idle: Math.random() * 3,
        walkPhase: Math.random() * Math.PI * 2,
      });
    }
  }

  private orient(g: THREE.Object3D, horizontal: boolean, dir: 1 | -1) {
    if (horizontal) g.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
    else g.rotation.y = dir > 0 ? 0 : Math.PI;
  }

  update(dt: number) {
    const limit = this.span / 2 - 4;
    for (const c of this.cows) {
      // Pause/resume wandering at random.
      if (c.idle > 0) {
        c.idle -= dt;
        continue;
      }
      if (Math.random() < 0.004) {
        c.idle = 1.5 + Math.random() * 3;
        continue;
      }

      const step = c.speed * c.dir * dt;
      const p = c.group.position;
      if (c.horizontal) {
        p.x += step;
        if (p.x > limit || p.x < -limit) {
          c.dir = (c.dir * -1) as 1 | -1;
          this.orient(c.group, c.horizontal, c.dir);
        }
      } else {
        p.z += step;
        if (p.z > limit || p.z < -limit) {
          c.dir = (c.dir * -1) as 1 | -1;
          this.orient(c.group, c.horizontal, c.dir);
        }
      }

      // Walk animation: swing legs, bob the body gently.
      c.walkPhase += dt * 7 * c.speed;
      const swing = Math.sin(c.walkPhase) * 0.5;
      c.legs[0].rotation.x = swing;
      c.legs[3].rotation.x = swing;
      c.legs[1].rotation.x = -swing;
      c.legs[2].rotation.x = -swing;
      c.group.position.y = Math.abs(Math.sin(c.walkPhase)) * 0.05;
    }
  }

  /** Push a circle (the rickshaw) out of any cow it overlaps. Returns true on contact. */
  collide(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    const min = radius + COW_RADIUS;
    for (const c of this.cows) {
      const dx = pos.x - c.group.position.x;
      const dz = pos.z - c.group.position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < min * min && distSq > 1e-6) {
        const dist = Math.sqrt(distSq);
        const push = min - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
        hit = true;
      }
    }
    return hit;
  }

  private buildCow(legs: THREE.Mesh[]): THREE.Group {
    const g = new THREE.Group();
    const hide = new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.9 });
    const brown = new THREE.MeshStandardMaterial({ color: 0x8a6240, roughness: 0.9 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x3a2c20 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.8, 1.7), hide);
    body.position.y = 1.0;
    body.castShadow = true;
    g.add(body);

    // Brown patch.
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.4, 0.7), brown);
    patch.position.set(0, 1.1, 0.2);
    g.add(patch);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.5, 0.55), hide);
    head.position.set(0, 1.15, 1.05);
    head.castShadow = true;
    g.add(head);

    // Horns.
    const hornGeo = new THREE.ConeGeometry(0.07, 0.3, 6);
    for (const sx of [-1, 1]) {
      const horn = new THREE.Mesh(hornGeo, dark);
      horn.position.set(sx * 0.18, 1.45, 1.05);
      g.add(horn);
    }

    // Legs (pivoted at the hip so they can swing). Order: FL, FR, BL, BR.
    const legGeo = new THREE.BoxGeometry(0.16, 0.7, 0.16);
    legGeo.translate(0, -0.35, 0); // pivot at top
    for (const sz of [1, -1]) {
      for (const sx of [-1, 1]) {
        const leg = new THREE.Mesh(legGeo, hide);
        leg.position.set(sx * 0.3, 0.7, sz * 0.6);
        leg.castShadow = true;
        g.add(leg);
        legs.push(leg);
      }
    }

    // Tail.
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.6, 0.08), hide);
    tail.position.set(0, 0.8, -0.85);
    g.add(tail);

    return g;
  }
}
