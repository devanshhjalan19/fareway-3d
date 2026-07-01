import * as THREE from "three";
import type { WeatherMode } from "../core/Profile";
import type { SkyDome } from "../world/SkyDome";

interface Preset {
  sky: number;
  skyTop: number; // upper gradient colour for the sky dome
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: number;
  sunIntensity: number;
  sunPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  grip: number; // road traction multiplier (1 = dry)
  rain: boolean;
}

const PRESETS: Record<WeatherMode, Preset> = {
  // Warm, bright, always-visible — the locked default the player asked for.
  golden: {
    sky: 0xf3c98a,
    skyTop: 0x4a78b0,
    fog: 0xf3c98a,
    fogNear: 60,
    fogFar: 200,
    sun: 0xffce96,
    sunIntensity: 2.0,
    sunPos: [-70, 58, 50],
    hemiSky: 0xffe2bc,
    hemiGround: 0xb09a78,
    hemiIntensity: 1.3,
    grip: 1,
    rain: false,
  },
  // Dusk/evening — cooler but still clearly readable (opt-in only).
  night: {
    sky: 0x2a3658,
    skyTop: 0x0d1430,
    fog: 0x2a3658,
    fogNear: 50,
    fogFar: 170,
    sun: 0xbcd0ff,
    sunIntensity: 0.8,
    sunPos: [-60, 50, 40],
    hemiSky: 0x6878a8,
    hemiGround: 0x2a2c3a,
    hemiIntensity: 0.55,
    grip: 1,
    rain: false,
  },
  // Mumbai monsoon — overcast grey, rain, slick roads.
  monsoon: {
    sky: 0x6b7785,
    skyTop: 0x4c565f,
    fog: 0x6b7785,
    fogNear: 45,
    fogFar: 150,
    sun: 0x9aa7b5,
    sunIntensity: 0.95,
    sunPos: [-50, 60, 30],
    hemiSky: 0x9aa7b8,
    hemiGround: 0x4a4f55,
    hemiIntensity: 0.75,
    grip: 0.78,
    rain: true,
  },
};

const RAIN_COUNT = 1400;
const RAIN_AREA = 120; // box around the camera the rain fills
const RAIN_HEIGHT = 60;

/**
 * Owns the sky/sun/fog look and the rain. Three selectable presets (golden,
 * night, monsoon) replace the old darkening cycle, and monsoon lowers road grip
 * and turns on falling rain that follows the camera.
 */
export class Weather {
  mode: WeatherMode = "golden";
  /** Offset (direction × distance) from the player to the sun, for follow-shadows. */
  readonly sunOffset = new THREE.Vector3();
  private rain: THREE.Points;
  private rainVel: Float32Array;
  private raining = false;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly sun: THREE.DirectionalLight,
    private readonly hemi: THREE.HemisphereLight,
    private readonly camera: THREE.Camera,
    private readonly skyDome: SkyDome,
    mode: WeatherMode = "golden",
  ) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(RAIN_COUNT * 3);
    this.rainVel = new Float32Array(RAIN_COUNT);
    for (let i = 0; i < RAIN_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * RAIN_AREA;
      pos[i * 3 + 1] = Math.random() * RAIN_HEIGHT;
      pos[i * 3 + 2] = (Math.random() - 0.5) * RAIN_AREA;
      this.rainVel[i] = 55 + Math.random() * 35;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.rain = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xbcc6d0,
        size: 0.5,
        transparent: true,
        opacity: 0.6,
        depthWrite: false,
      }),
    );
    this.rain.visible = false;
    this.scene.add(this.rain);

    this.setMode(mode);
  }

  /** True while monsoon rain is active (so the game can toggle rain audio). */
  get isRaining(): boolean {
    return this.raining;
  }

  /** Road traction for the current weather (multiplied with surface grip). */
  get grip(): number {
    return PRESETS[this.mode].grip;
  }

  setMode(mode: WeatherMode) {
    this.mode = mode;
    const p = PRESETS[mode];

    this.sun.color.setHex(p.sun);
    this.sun.intensity = p.sunIntensity;
    this.sun.position.set(...p.sunPos);
    this.sunOffset.set(...p.sunPos);

    this.hemi.color.setHex(p.hemiSky);
    this.hemi.groundColor.setHex(p.hemiGround);
    this.hemi.intensity = p.hemiIntensity;

    (this.scene.background as THREE.Color).setHex(p.sky);
    this.skyDome.setColors(p.skyTop, p.sky);
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.setHex(p.fog);
      this.scene.fog.near = p.fogNear;
      this.scene.fog.far = p.fogFar;
    }

    this.raining = p.rain;
    this.rain.visible = p.rain;
  }

  update(dt: number) {
    // Always keep the sky dome centred on the camera so it never clips.
    this.skyDome.follow(this.camera);
    if (!this.raining) return;
    const attr = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const cx = this.camera.position.x;
    const cz = this.camera.position.z;
    for (let i = 0; i < RAIN_COUNT; i++) {
      const yi = i * 3 + 1;
      arr[yi] -= this.rainVel[i] * dt;
      if (arr[yi] < 0) {
        // Recycle to the top, re-centered on the camera so rain is always near.
        arr[i * 3] = cx + (Math.random() - 0.5) * RAIN_AREA;
        arr[yi] = RAIN_HEIGHT;
        arr[i * 3 + 2] = cz + (Math.random() - 0.5) * RAIN_AREA;
      }
    }
    attr.needsUpdate = true;
  }
}
