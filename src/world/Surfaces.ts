import * as THREE from "three";

type Patch = {
  x: number;
  z: number;
  r: number;
  grip: number; // <1 = slippery
  drag: number; // extra deceleration (m/s²)
};

/** Deterministic RNG (matches City's approach) so patches are stable. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Scattered road-surface hazards: slick **puddles** (low grip → the tail slides)
 * and loose **gravel** (extra drag → scrubs speed). The rickshaw samples the
 * field each frame; patches are drawn as flat decals on the asphalt.
 */
export class Surfaces {
  readonly group = new THREE.Group();
  private patches: Patch[] = [];
  private rand = mulberry32(99);

  constructor(roadLines: number[], span: number, count = 14) {
    const limit = span / 2 - 4;
    for (let i = 0; i < count; i++) {
      // Sit the patch on a random road, offset along it.
      const line = roadLines[Math.floor(this.rand() * roadLines.length)];
      const along = (this.rand() - 0.5) * 2 * limit;
      const horizontal = this.rand() < 0.5;
      const x = horizontal ? along : line;
      const z = horizontal ? line : along;

      const puddle = this.rand() < 0.6;
      const r = 2.2 + this.rand() * 1.8;
      const patch: Patch = puddle
        ? { x, z, r, grip: 0.42, drag: 0 }
        : { x, z, r, grip: 0.85, drag: 7 };
      this.patches.push(patch);
      this.group.add(this.buildDecal(patch, puddle));
    }
  }

  private buildDecal(p: Patch, puddle: boolean): THREE.Mesh {
    const mat = new THREE.MeshStandardMaterial({
      color: puddle ? 0x2c4458 : 0x9c8a6a,
      roughness: puddle ? 0.15 : 1,
      metalness: puddle ? 0.5 : 0,
      transparent: true,
      opacity: puddle ? 0.7 : 0.85,
    });
    const decal = new THREE.Mesh(new THREE.CircleGeometry(p.r, 24), mat);
    decal.rotation.x = -Math.PI / 2;
    decal.position.set(p.x, 0.03, p.z);
    decal.receiveShadow = true;
    return decal;
  }

  /** Grip + extra drag at a world position. Worst overlapping patch wins. */
  sample(pos: THREE.Vector3): { grip: number; drag: number } {
    let grip = 1;
    let drag = 0;
    for (const p of this.patches) {
      const dx = pos.x - p.x;
      const dz = pos.z - p.z;
      if (dx * dx + dz * dz <= p.r * p.r) {
        grip = Math.min(grip, p.grip);
        drag = Math.max(drag, p.drag);
      }
    }
    return { grip, drag };
  }
}
