import * as THREE from "three";

/**
 * Axis-aligned collision in the XZ plane. Buildings register as boxes; the
 * rickshaw is resolved as a circle pushed out of any box it overlaps.
 */
export class CollisionWorld {
  private boxes: { minX: number; maxX: number; minZ: number; maxZ: number }[] = [];

  /** Register a building footprint. `center`/`size` are in world units (XZ). */
  addBox(centerX: number, centerZ: number, sizeX: number, sizeZ: number) {
    this.boxes.push({
      minX: centerX - sizeX / 2,
      maxX: centerX + sizeX / 2,
      minZ: centerZ - sizeZ / 2,
      maxZ: centerZ + sizeZ / 2,
    });
  }

  /**
   * Push a circle (the rickshaw) out of any overlapping box. Mutates `pos`.
   * Returns true if a collision was resolved.
   */
  resolveCircle(pos: THREE.Vector3, radius: number): boolean {
    let hit = false;
    for (const b of this.boxes) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const distSq = dx * dx + dz * dz;

      if (distSq < radius * radius) {
        hit = true;
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const push = radius - dist;
          pos.x += (dx / dist) * push;
          pos.z += (dz / dist) * push;
        } else {
          // Center is inside the box: eject along the smallest-penetration axis.
          const toLeft = pos.x - b.minX;
          const toRight = b.maxX - pos.x;
          const toBack = pos.z - b.minZ;
          const toFront = b.maxZ - pos.z;
          const min = Math.min(toLeft, toRight, toBack, toFront);
          if (min === toLeft) pos.x = b.minX - radius;
          else if (min === toRight) pos.x = b.maxX + radius;
          else if (min === toBack) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
      }
    }
    return hit;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
