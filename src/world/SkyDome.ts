import * as THREE from "three";

/**
 * A large gradient sky dome that gives the horizon depth instead of a flat
 * background colour. The two colours are driven by the current Weather preset;
 * the dome recentres on the camera each frame so it never clips.
 */
export class SkyDome {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;

  constructor(radius = 480) {
    this.mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        topColor: { value: new THREE.Color(0x3f6ea8) },
        bottomColor: { value: new THREE.Color(0xf3c98a) },
        offset: { value: 0.05 },
        exponent: { value: 0.7 },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vDir;
        void main() {
          float h = clamp((vDir.y + offset) / (1.0 + offset), 0.0, 1.0);
          float t = pow(h, exponent);
          gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), this.mat);
    this.mesh.frustumCulled = false;
  }

  setColors(top: number, bottom: number) {
    (this.mat.uniforms.topColor.value as THREE.Color).setHex(top);
    (this.mat.uniforms.bottomColor.value as THREE.Color).setHex(bottom);
  }

  /** Keep the dome centred on the camera so it always surrounds the view. */
  follow(camera: THREE.Camera) {
    this.mesh.position.copy(camera.position);
  }
}
