import * as THREE from "three";
import type { Rickshaw } from "../entities/Rickshaw";

/** Anything that can feed the mini-map its markers (solo Ride or MP session). */
export interface MapSource {
  waitingPositions: THREE.Vector3[];
  dropoff: THREE.Vector3 | null;
}

/**
 * Top-down 2D mini-map drawn on a canvas: city bounds, the player (heading
 * arrow), waiting customers (green), and the active drop-off (red).
 */
export class MiniMap {
  private canvas = document.createElement("canvas");
  private ctx: CanvasRenderingContext2D;
  private readonly size = 180;

  constructor(private readonly worldSpan: number) {
    this.canvas.id = "minimap";
    this.canvas.width = this.size;
    this.canvas.height = this.size;
    this.ctx = this.canvas.getContext("2d")!;
    document.body.append(this.canvas);
  }

  /** World (x,z) -> canvas (px,py). */
  private toMap(x: number, z: number): [number, number] {
    const half = this.worldSpan / 2 + 6;
    const px = ((x + half) / (half * 2)) * this.size;
    const py = ((z + half) / (half * 2)) * this.size;
    return [px, py];
  }

  private dot(p: THREE.Vector3, color: string, r: number) {
    const [px, py] = this.toMap(p.x, p.z);
    this.ctx.fillStyle = color;
    this.ctx.beginPath();
    this.ctx.arc(px, py, r, 0, Math.PI * 2);
    this.ctx.fill();
  }

  update(rickshaw: Rickshaw, ride: MapSource, others?: THREE.Vector3[]) {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.size, this.size);
    ctx.fillStyle = "rgba(40,40,55,0.6)";
    ctx.fillRect(0, 0, this.size, this.size);

    // Waiting customers.
    for (const p of ride.waitingPositions) this.dot(p, "#33dd66", 3);

    // Active drop-off.
    const drop = ride.dropoff;
    if (drop) this.dot(drop, "#ff4d4d", 4);

    // Other players (multiplayer).
    if (others) for (const p of others) this.dot(p, "#4db8ff", 3.5);

    // Player as a heading triangle.
    const [px, py] = this.toMap(rickshaw.position.x, rickshaw.position.z);
    const h = rickshaw.heading;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-h); // canvas y is +z; rotate so triangle points along heading
    ctx.fillStyle = "#ffd23f";
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4, 5);
    ctx.lineTo(-4, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  setVisible(v: boolean) {
    this.canvas.style.display = v ? "block" : "none";
  }
}
