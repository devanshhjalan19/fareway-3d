import * as THREE from "three";
import { PostFX } from "./PostFX";

/**
 * Owns the renderer, scene, camera and lights. Handles window resizing and
 * routes rendering through the post-processing chain (PostFX).
 */
export class SceneManager {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly sun = new THREE.DirectionalLight(0xfff2cc, 1.4);
  readonly sunTarget = new THREE.Object3D(); // followed to keep shadows near the player
  readonly hemi = new THREE.HemisphereLight(0xffffff, 0x8b7355, 0.9);
  readonly postfx: PostFX;
  private readonly lowPower: boolean;

  constructor(container: HTMLElement) {
    this.lowPower = isMobileLike();
    // SMAA (in PostFX) handles anti-aliasing now, so the renderer doesn't need
    // its own MSAA. Pixel ratio is capped below 2x since that renders 4x the
    // pixels on high-DPI displays for a sharpness gain most people won't notice.
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(this.width(), this.height());
    this.renderer.shadowMap.enabled = !this.lowPower;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    // Filmic tone mapping + slight over-exposure for a richer, brighter look.
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.5;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87b5d6);
    this.scene.fog = new THREE.Fog(0x87b5d6, 60, 200);

    this.camera = new THREE.PerspectiveCamera(
      60,
      this.width() / this.height(),
      0.1,
      500,
    );
    this.camera.position.set(0, 8, 12);
    this.camera.lookAt(0, 0, 0);

    this.setupLights();

    this.postfx = new PostFX(this.renderer, this.scene, this.camera, !this.lowPower);

    window.addEventListener("resize", this.onResize);
    window.visualViewport?.addEventListener("resize", this.onResize);
  }

  private setupLights() {
    this.scene.add(this.hemi);

    const sun = this.sun;
    sun.position.set(40, 60, 25);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.lowPower ? 512 : 1024, this.lowPower ? 512 : 1024);
    // Tight frustum (the light follows the player) keeps shadows crisp on the
    // bigger map instead of being stretched across the whole city.
    const d = 55;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 260;
    sun.shadow.bias = -0.0004;
    sun.target = this.sunTarget;
    this.scene.add(sun);
    this.scene.add(this.sunTarget);
  }

  private onResize = () => {
    const w = this.width();
    const h = this.height();
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(this.pixelRatio());
    this.renderer.setSize(w, h);
    this.postfx.setSize(w, h);
  };

  private width() {
    return Math.max(1, Math.floor(window.visualViewport?.width ?? window.innerWidth));
  }

  private height() {
    return Math.max(1, Math.floor(window.visualViewport?.height ?? window.innerHeight));
  }

  private pixelRatio() {
    return Math.min(window.devicePixelRatio || 1, this.lowPower ? 1 : 1.5);
  }

  render() {
    this.postfx.render();
  }
}

function isMobileLike(): boolean {
  return (
    navigator.maxTouchPoints > 0 ||
    window.matchMedia?.("(pointer: coarse)").matches ||
    window.innerWidth <= 700
  );
}
