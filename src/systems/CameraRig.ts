import * as THREE from "three";
import type { Rickshaw } from "../entities/Rickshaw";

/**
 * Third-person chase camera. Sits behind and above the rickshaw, smoothly
 * following its position and heading.
 */
export class CameraRig {
  private readonly distance = 8;
  private readonly height = 4.5;
  private readonly lookAhead = 2;
  private readonly smooth = 6; // higher = snappier

  private readonly baseFov: number;
  private readonly maxRefSpeed = 18;
  private desired = new THREE.Vector3();
  private target = new THREE.Vector3();

  constructor(private readonly camera: THREE.PerspectiveCamera) {
    this.baseFov = camera.fov;
  }

  update(dt: number, rickshaw: Rickshaw) {
    const h = rickshaw.heading;
    const pos = rickshaw.position;

    // Desired camera position: behind the rickshaw (opposite its facing dir).
    this.desired.set(
      pos.x - Math.sin(h) * this.distance,
      pos.y + this.height,
      pos.z - Math.cos(h) * this.distance,
    );

    const t = 1 - Math.exp(-this.smooth * dt); // frame-rate independent lerp
    this.camera.position.lerp(this.desired, t);

    // Speed/drift feel: widen FOV and add a touch of shake when fast.
    const speedN = Math.min(Math.abs(rickshaw.speed) / this.maxRefSpeed, 1);
    const targetFov = this.baseFov + speedN * 8 + (rickshaw.drifting ? 4 : 0);
    this.camera.fov += (targetFov - this.camera.fov) * t;
    this.camera.updateProjectionMatrix();

    const shake = speedN * 0.05 + (rickshaw.drifting ? 0.08 : 0);
    if (shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * shake;
      this.camera.position.y += (Math.random() - 0.5) * shake;
    }

    // Look slightly ahead of the rickshaw.
    this.target.set(
      pos.x + Math.sin(h) * this.lookAhead,
      pos.y + 1,
      pos.z + Math.cos(h) * this.lookAhead,
    );
    this.camera.lookAt(this.target);
  }
}
