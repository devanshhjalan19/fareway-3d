import * as THREE from "three";
import type { Input } from "../systems/Input";
import type { CollisionWorld } from "../world/Collision";

/**
 * The player's auto-rickshaw. Built from primitives (Phase 1) so we never block
 * on assets; a loaded glTF model can replace `buildModel()` later.
 *
 * Movement is an arcade kinematic model: a scalar speed along a heading angle,
 * with acceleration, drag, and speed-scaled steering. No physics engine.
 */
export class Rickshaw {
  readonly object = new THREE.Group();

  // Kinematic state
  speed = 0; // m/s, signed (negative = reverse)
  heading = 0; // radians, 0 = facing +Z
  private velHeading = 0; // direction the body is actually travelling (for slides)

  // Tuning (arcade feel). maxSpeed/accel are mutable so garage upgrades apply.
  maxSpeed = 18;
  accel = 22;
  private readonly maxReverse = 6;
  private readonly brakeAccel = 30;
  private readonly drag = 8; // coast deceleration
  private readonly turnRate = 2.4; // rad/s at full steer
  private readonly handbrakeDecel = 40;
  private readonly driftDecel = 11; // gentler bleed while drifting
  private readonly driftTurnBoost = 1.9;
  private readonly baseCatch = 24; // how fast travel-dir catches the facing dir

  drifting = false;

  // Surface/weather feel, set each frame by the game before update():
  //   grip 1 = dry tarmac (tight); <1 = slippery (the tail slides out).
  //   surfaceDrag = extra deceleration from loose gravel etc.
  grip = 1;
  surfaceDrag = 0;
  /** Set true on any frame the rickshaw hit a wall/vehicle (reckless driving). */
  collidedThisFrame = false;

  private readonly collisionRadius = 1.1;
  private wheels: THREE.Object3D[] = [];
  private bodyMat!: THREE.MeshStandardMaterial;

  constructor() {
    this.buildModel();
  }

  /** Apply garage-driven tuning + paint. */
  setMaxSpeed(v: number) {
    this.maxSpeed = v;
  }
  setAccel(v: number) {
    this.accel = v;
  }
  setLiveryColor(hex: number) {
    this.bodyMat.color.setHex(hex);
  }

  private buildModel() {
    const yellow = new THREE.MeshStandardMaterial({ color: 0xffcf2f, roughness: 0.6 });
    this.bodyMat = yellow; // recolored by liveries
    const black = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.8 });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x9fd8ff,
      transparent: true,
      opacity: 0.5,
      roughness: 0.1,
    });

    // Lower body (passenger cabin)
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.0, 2.2), yellow);
    body.position.y = 0.75;
    body.castShadow = true;
    this.object.add(body);

    // Canopy / roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.12, 2.0), black);
    roof.position.set(0, 1.32, -0.1);
    roof.castShadow = true;
    this.object.add(roof);

    // Front cowl (driver nose, narrower, toward +Z front)
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.7), yellow);
    nose.position.set(0, 0.7, 1.35);
    nose.castShadow = true;
    this.object.add(nose);

    // Windscreen
    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.6, 0.06), glass);
    screen.position.set(0, 1.05, 1.0);
    screen.rotation.x = -0.25;
    this.object.add(screen);

    // Wheels: 1 front, 2 rear
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16);
    const makeWheel = (x: number, z: number) => {
      const w = new THREE.Mesh(wheelGeo, black);
      w.rotation.z = Math.PI / 2;
      w.position.set(x, 0.34, z);
      w.castShadow = true;
      this.object.add(w);
      this.wheels.push(w);
    };
    makeWheel(0, 1.45); // front center
    makeWheel(-0.72, -0.85); // rear left
    makeWheel(0.72, -0.85); // rear right

    // Headlight
    const light = new THREE.Mesh(
      new THREE.SphereGeometry(0.12, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0xffffaa, emissiveIntensity: 1.8 }),
    );
    light.position.set(0, 0.7, 1.72);
    this.object.add(light);
  }

  update(dt: number, input: Input, collision?: CollisionWorld) {
    const throttle = input.throttle;
    this.drifting = false;
    this.collidedThisFrame = false;

    if (input.handbrake) {
      if (Math.abs(this.speed) > 6 && input.steer !== 0) {
        // Drift: keep speed (bleeds slowly) and turn harder.
        this.drifting = true;
        this.speed = approach(this.speed, 0, this.driftDecel * dt);
      } else {
        this.speed = approach(this.speed, 0, this.handbrakeDecel * dt);
      }
    } else if (throttle > 0) {
      this.speed += this.accel * dt;
    } else if (throttle < 0) {
      // Brake if moving forward, else accelerate in reverse.
      this.speed -= (this.speed > 0 ? this.brakeAccel : this.accel) * dt;
    } else {
      this.speed = approach(this.speed, 0, this.drag * dt);
    }

    // Extra deceleration from loose surfaces (gravel) regardless of throttle.
    if (this.surfaceDrag > 0) this.speed = approach(this.speed, 0, this.surfaceDrag * dt);

    this.speed = clamp(this.speed, -this.maxReverse, this.maxSpeed);

    // Steering scales with how fast we're going; invert when reversing so it
    // feels natural. Almost no turning when nearly stopped.
    const speedFactor = clamp(Math.abs(this.speed) / 4, 0, 1);
    const dir = this.speed >= 0 ? 1 : -1;
    const turn = this.turnRate * (this.drifting ? this.driftTurnBoost : 1);
    this.heading += input.steer * turn * speedFactor * dir * dt;

    // Grip model: the travel direction (velHeading) chases the facing direction.
    // On dry tarmac (grip≈1) it snaps instantly so handling stays tight; on a
    // puddle or in the monsoon (grip<1) it lags, letting the tail slide out.
    const grip = clamp(this.grip * (this.drifting ? 0.6 : 1), 0.18, 1);
    this.velHeading = approachAngle(this.velHeading, this.heading, this.baseCatch * grip * dt);

    // Integrate position along the actual travel direction.
    this.object.position.x += Math.sin(this.velHeading) * this.speed * dt;
    this.object.position.z += Math.cos(this.velHeading) * this.speed * dt;

    // Resolve building collisions: push out and bleed off speed on impact.
    if (collision && collision.resolveCircle(this.object.position, this.collisionRadius)) {
      this.speed *= 0.25;
      this.collidedThisFrame = true;
    }

    this.object.rotation.y = this.heading;

    // Spin wheels for feedback.
    const spin = this.speed * dt * 2.5;
    for (const w of this.wheels) w.rotation.x += spin;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Move `value` toward `target` by at most `maxDelta`. */
function approach(value: number, target: number, maxDelta: number): number {
  if (value < target) return Math.min(value + maxDelta, target);
  if (value > target) return Math.max(value - maxDelta, target);
  return target;
}

/** Move an angle toward another by at most `maxDelta`, taking the short way. */
function approachAngle(value: number, target: number, maxDelta: number): number {
  let diff = target - value;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) <= maxDelta) return target;
  return value + Math.sign(diff) * maxDelta;
}
