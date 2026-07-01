import * as THREE from "three";

/** Distinct paint colours for up to four players (local player keeps its livery). */
export const PLAYER_COLORS = [0xffcf2f, 0x2fae7a, 0xff6a3c, 0x2f8fd8];

/**
 * A lightweight visual stand-in for another player's rickshaw. It runs no
 * physics — it just interpolates toward the latest networked position/heading so
 * remote motion looks smooth despite the ~10 Hz state updates. Carries a floating
 * name label.
 */
export class RemoteRickshaw {
  readonly object = new THREE.Group();
  private targetPos = new THREE.Vector3();
  private targetHeading = 0;
  private hasTarget = false;

  constructor(name: string, color: number) {
    this.buildModel(color);
    this.object.add(this.buildLabel(name));
  }

  private buildModel(color: number) {
    const body = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 });

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 2.2), body);
    cabin.position.y = 0.75;
    cabin.castShadow = true;
    this.object.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 2.0), black);
    roof.position.set(0, 1.32, -0.1);
    this.object.add(roof);

    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), body);
    nose.position.set(0, 0.7, 1.35);
    this.object.add(nose);

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 12);
    for (const [x, z] of [
      [0, 1.45],
      [-0.72, -0.85],
      [0.72, -0.85],
    ] as const) {
      const w = new THREE.Mesh(wheelGeo, black);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.34, z);
      this.object.add(w);
    }
  }

  private buildLabel(name: string): THREE.Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(20,20,28,0.72)";
    roundRect(ctx, 8, 8, 240, 48, 12);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 30px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(name.slice(0, 12), 128, 34);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }),
    );
    sprite.scale.set(2.4, 0.6, 1);
    sprite.position.set(0, 2.5, 0);
    return sprite;
  }

  /** Feed the latest networked transform. */
  setTarget(x: number, z: number, h: number) {
    this.targetPos.set(x, 0, z);
    this.targetHeading = h;
    if (!this.hasTarget) {
      // Snap on the first update so we don't slide in from the origin.
      this.object.position.copy(this.targetPos);
      this.object.rotation.y = h;
      this.hasTarget = true;
    }
  }

  update(dt: number) {
    if (!this.hasTarget) return;
    const k = Math.min(1, dt * 12); // smoothing toward the target
    this.object.position.lerp(this.targetPos, k);
    let diff = this.targetHeading - this.object.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.object.rotation.y += diff * k;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
