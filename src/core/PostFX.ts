import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";

/**
 * Subtle cinematic colour grade applied on the LDR image after tone mapping:
 * a soft vignette plus a small contrast/saturation lift so the picture reads as
 * "graded" rather than flat. Cheap single-pass shader.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    vignette: { value: 0.9 },
    saturation: { value: 1.12 },
    contrast: { value: 1.06 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignette;
    uniform float saturation;
    uniform float contrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      // Saturation around luminance.
      float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
      c.rgb = mix(vec3(l), c.rgb, saturation);
      // Contrast around mid grey.
      c.rgb = (c.rgb - 0.5) * contrast + 0.5;
      // Vignette.
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.8, vignette * 0.35, dot(d, d) * 2.0);
      c.rgb *= mix(0.9, 1.0, v);
      gl_FragColor = c;
    }
  `,
};

/**
 * Wraps an EffectComposer so the scene renders through a post-processing chain:
 * scene → bloom (glow on the sun, headlights, beacons, coins) → tone-map/output
 * → colour grade → SMAA anti-aliasing. This is the single biggest lift to the
 * game's look and needs no external assets.
 */
export class PostFX {
  private composer: EffectComposer | null = null;
  readonly bloom: UnrealBloomPass | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    enabled = true,
  ) {
    if (!enabled) return;

    const size = renderer.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(renderer);
    this.composer.addPass(new RenderPass(scene, camera));

    // Bloom runs in HDR/linear space before tone mapping. A high threshold means
    // only genuinely bright things (emissive lights, the sun) bloom, not the
    // whole sunlit city.
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.x, size.y),
      0.65, // strength
      0.5, // radius
      0.85, // luminance threshold
    );
    this.bloom = bloom;
    this.composer.addPass(bloom);
    // Bloom is a soft blur, so it doesn't need to be computed at full
    // resolution — halving its internal working size again (on top of the
    // half-res "bright" pass Three.js already does) is a big perf win for a
    // barely-visible softness change.
    this.shrinkBloom(size.x, size.y);

    // Tone-map + convert to sRGB (uses renderer.toneMapping / exposure).
    this.composer.addPass(new OutputPass());

    // Colour grade on the tone-mapped LDR image.
    this.composer.addPass(new ShaderPass(GradeShader));

    // Anti-alias last, on the final image.
    const smaa = new SMAAPass(size.x, size.y);
    this.composer.addPass(smaa);
  }

  setSize(w: number, h: number) {
    if (!this.composer) return;
    this.composer.setSize(w, h);
    this.shrinkBloom(w, h);
  }

  /** Re-shrink bloom's working resolution after the composer resets it to full size. */
  private shrinkBloom(w: number, h: number) {
    this.bloom?.setSize(w / 2, h / 2);
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
