import * as THREE from "three";

const SHIRT_COLORS = [0x3a7bd5, 0xd54b3a, 0x4caf50, 0x9c27b0, 0xff9800, 0x00bcd4];

/**
 * A blocky bot customer standing on a sidewalk waiting for a ride. Built from
 * primitives; can be swapped for a glTF character later. Shows a bobbing beacon
 * while waiting so the player can spot them across the city.
 */
export class Customer {
  readonly object = new THREE.Group();
  readonly home: THREE.Vector3;

  // Patience: counts down while waiting; at 0 the passenger gives up and leaves.
  readonly maxPatience: number;
  patience: number;

  private beacon: THREE.Mesh;
  private beaconMat: THREE.MeshStandardMaterial;
  private bobT = Math.random() * Math.PI * 2;

  constructor(home: THREE.Vector3, patience = 22) {
    this.home = home.clone();
    this.maxPatience = patience;
    this.patience = patience;
    this.buildModel();
    this.beacon = this.buildBeacon();
    this.beaconMat = this.beacon.material as THREE.MeshStandardMaterial;
    this.object.add(this.beacon);
    this.object.position.copy(this.home);
  }

  get expired(): boolean {
    return this.patience <= 0;
  }

  private buildModel() {
    const shirt = SHIRT_COLORS[Math.floor(Math.random() * SHIRT_COLORS.length)];

    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.3, 0.7, 4, 8),
      new THREE.MeshStandardMaterial({ color: shirt, roughness: 0.8 }),
    );
    body.position.y = 0.85;
    body.castShadow = true;
    this.object.add(body);

    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 12, 12),
      new THREE.MeshStandardMaterial({ color: 0xc68642, roughness: 0.7 }),
    );
    head.position.y = 1.55;
    head.castShadow = true;
    this.object.add(head);
  }

  private buildBeacon(): THREE.Mesh {
    const beacon = new THREE.Mesh(
      new THREE.ConeGeometry(0.35, 0.7, 4),
      new THREE.MeshStandardMaterial({
        color: 0x33dd66,
        emissive: 0x22aa44,
        emissiveIntensity: 0.6,
      }),
    );
    beacon.rotation.x = Math.PI; // point down
    beacon.position.y = 2.6;
    return beacon;
  }

  update(dt: number) {
    this.patience -= dt;
    this.bobT += dt * 3;

    // Beacon bobs faster and shifts green -> orange -> red as patience drains.
    const ratio = Math.max(this.patience / this.maxPatience, 0);
    const urgency = 1 - ratio;
    this.beacon.position.y = 2.6 + Math.sin(this.bobT) * (0.18 + urgency * 0.25);
    this.beacon.rotation.y += dt * (2 + urgency * 4);

    const hue = ratio * 0.33; // 0.33 (green) -> 0 (red)
    this.beaconMat.color.setHSL(hue, 0.85, 0.5);
    this.beaconMat.emissive.setHSL(hue, 0.85, 0.35);
  }

  setVisible(v: boolean) {
    this.object.visible = v;
  }
}
