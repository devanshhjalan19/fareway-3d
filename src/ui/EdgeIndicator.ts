import * as THREE from "three";

/**
 * A screen-edge arrow that appears only when the current objective is off
 * screen, pointing the player toward it. Complements the in-world 3D arrow.
 */
export class EdgeIndicator {
  private el = document.createElement("div");

  constructor() {
    this.el.textContent = "➤";
    Object.assign(this.el.style, {
      position: "fixed",
      zIndex: "20",
      fontSize: "32px",
      color: "#33ddff",
      textShadow: "0 0 6px rgba(0,0,0,0.6)",
      pointerEvents: "none",
      transform: "translate(-50%, -50%)",
      display: "none",
    } as Partial<CSSStyleDeclaration>);
    document.body.append(this.el);
  }

  update(camera: THREE.PerspectiveCamera, target: THREE.Vector3 | null) {
    if (!target) {
      this.el.style.display = "none";
      return;
    }
    const v = target.clone().project(camera); // NDC, +y up
    const onScreen = v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1;
    if (onScreen) {
      this.el.style.display = "none";
      return;
    }

    let sx = v.x;
    let sy = v.y;
    if (v.z > 1) {
      // Target is behind the camera: invert direction.
      sx = -sx;
      sy = -sy;
    }
    // Push to the screen edge (keep a margin).
    const margin = 0.86;
    const m = Math.max(Math.abs(sx), Math.abs(sy)) || 1;
    sx = (sx / m) * margin;
    sy = (sy / m) * margin;

    const W = window.innerWidth;
    const H = window.innerHeight;
    const px = (sx * 0.5 + 0.5) * W;
    const py = (-sy * 0.5 + 0.5) * H;
    const angle = Math.atan2(-sy, sx); // screen-space, +x right, +y down

    this.el.style.display = "block";
    this.el.style.left = `${px}px`;
    this.el.style.top = `${py}px`;
    this.el.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  }
}
