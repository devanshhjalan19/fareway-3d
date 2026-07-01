import * as THREE from "three";
import { Customer } from "../entities/Customer";
import { Marker } from "../entities/Marker";
import type { Rickshaw } from "../entities/Rickshaw";
import type { Game } from "../core/Game";

type ActiveRide = {
  customer: Customer;
  pickup: THREE.Vector3;
  dropoff: THREE.Vector3;
  pointIndex: number; // dropoff wait-point index
  elapsed: number;
  recklessHits: number; // collisions while the fare was aboard
  hitCooldown: number; // debounce so one bump isn't counted many times
};

export interface RideReward {
  total: number;
  combo: number;
  stars: number; // 1–3
  reckless: boolean;
  reaction: string; // passenger's line
}

/** Passenger's parting line, keyed by star rating. */
const REACTIONS: Record<number, string> = {
  3: "Shabaash! 🙏",
  2: "Theek hai.",
  1: "Arre, dhyaan se!",
};

/**
 * Drives the ride lifecycle: spawn waiting customers, detect pickup (stop near a
 * waiting customer), reveal a destination, detect drop-off, and reward the run.
 */
export class Ride {
  private customers: { c: Customer; index: number }[] = [];
  private used = new Set<number>();
  private active: ActiveRide | null = null;
  private dropMarker = new Marker(0xff4d4d);

  private readonly pickupRadius = 3.6;
  private readonly dropoffRadius = 4.2;
  private readonly slowSpeed = 5; // must be near-stopped to board / drop off
  private readonly waitingCount = 4;

  /** Multiplier on tips from the garage "Tips" upgrade (set by the game). */
  tipMultiplier = 1;

  // Surfaced for HUD / guidance arrow.
  objectiveLabel = "";
  objectivePosition: THREE.Vector3 | null = null;
  justPickedUp = false;
  justCompleted = false;
  justExpired = false;
  lastReward: RideReward | null = null;

  constructor(
    private readonly group: THREE.Group,
    private readonly waitPoints: THREE.Vector3[],
    private readonly game: Game,
  ) {
    this.group.add(this.dropMarker.object);
  }

  /** Home positions of customers currently waiting (for the mini-map). */
  get waitingPositions(): THREE.Vector3[] {
    return this.customers.map((e) => e.c.home);
  }

  /** Active drop-off position, or null if no ride in progress. */
  get dropoff(): THREE.Vector3 | null {
    return this.active ? this.active.dropoff : null;
  }

  reset() {
    for (const { c } of this.customers) this.group.remove(c.object);
    this.customers = [];
    this.used.clear();
    this.active = null;
    this.dropMarker.hide();
    for (let i = 0; i < this.waitingCount; i++) this.spawnWaiting();
  }

  private freePointIndex(awayFrom?: THREE.Vector3, minDist = 0): number {
    const candidates: number[] = [];
    for (let i = 0; i < this.waitPoints.length; i++) {
      if (this.used.has(i)) continue;
      if (awayFrom && this.waitPoints[i].distanceTo(awayFrom) < minDist) continue;
      candidates.push(i);
    }
    if (candidates.length === 0) return -1;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  private spawnWaiting() {
    const idx = this.freePointIndex();
    if (idx === -1) return;
    this.used.add(idx);
    const patience = 18 + Math.random() * 10; // 18–28s
    const c = new Customer(this.waitPoints[idx], patience);
    this.group.add(c.object);
    this.customers.push({ c, index: idx });
  }

  /** Remove passengers who ran out of patience and refill the pool. */
  private handleExpired() {
    const survivors: { c: Customer; index: number }[] = [];
    for (const entry of this.customers) {
      if (entry.c.expired) {
        this.group.remove(entry.c.object);
        this.used.delete(entry.index);
        this.justExpired = true;
      } else {
        survivors.push(entry);
      }
    }
    if (survivors.length === this.customers.length) return;

    this.customers = survivors;
    while (this.customers.length < this.waitingCount) {
      const before = this.customers.length;
      this.spawnWaiting();
      if (this.customers.length === before) break; // no free points left
    }
  }

  update(dt: number, rickshaw: Rickshaw) {
    this.justPickedUp = false;
    this.justCompleted = false;
    this.justExpired = false;
    this.lastReward = null;

    for (const { c } of this.customers) c.update(dt);
    this.handleExpired();
    this.dropMarker.update(dt);

    const pos = rickshaw.position;
    const slow = Math.abs(rickshaw.speed) < this.slowSpeed;

    if (!this.active) {
      this.updateWaitingPhase(pos, slow);
    } else {
      this.updateRidingPhase(dt, pos, slow, rickshaw);
    }
  }

  private updateWaitingPhase(pos: THREE.Vector3, slow: boolean) {
    // Guidance points to the nearest waiting customer.
    let nearest: { c: Customer; index: number } | null = null;
    let nearestDist = Infinity;
    for (const entry of this.customers) {
      const d = entry.c.home.distanceTo(pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = entry;
      }
    }

    if (nearest) {
      this.objectiveLabel = "Pick up the passenger";
      this.objectivePosition = nearest.c.home;
      if (nearestDist < this.pickupRadius && slow) {
        this.board(nearest);
      }
    } else {
      this.objectiveLabel = "";
      this.objectivePosition = null;
    }
  }

  private board(entry: { c: Customer; index: number }) {
    entry.c.setVisible(false);
    this.customers = this.customers.filter((e) => e !== entry);

    const pickup = entry.c.home.clone();
    const dropIdx = this.freePointIndex(pickup, 30);
    const fallbackIdx = dropIdx === -1 ? this.freePointIndex(pickup, 0) : dropIdx;
    const finalIdx = fallbackIdx === -1 ? entry.index : fallbackIdx;

    this.used.add(finalIdx);
    const dropoff = this.waitPoints[finalIdx].clone();

    this.active = {
      customer: entry.c,
      pickup,
      dropoff,
      pointIndex: finalIdx,
      elapsed: 0,
      recklessHits: 0,
      hitCooldown: 0,
    };
    this.dropMarker.show(dropoff);
    this.justPickedUp = true;
  }

  private updateRidingPhase(
    dt: number,
    pos: THREE.Vector3,
    slow: boolean,
    rickshaw: Rickshaw,
  ) {
    const ride = this.active!;
    ride.elapsed += dt;
    this.objectiveLabel = "Drop off the passenger";
    this.objectivePosition = ride.dropoff;

    // Reckless driving with a fare aboard: count distinct bumps (debounced).
    ride.hitCooldown = Math.max(0, ride.hitCooldown - dt);
    if (rickshaw.collidedThisFrame && ride.hitCooldown === 0) {
      ride.recklessHits += 1;
      ride.hitCooldown = 0.8;
    }

    if (ride.dropoff.distanceTo(pos) < this.dropoffRadius && slow) {
      this.complete(ride);
    }
  }

  private complete(ride: ActiveRide) {
    const dist = ride.pickup.distanceTo(ride.dropoff);
    const base = 20 + Math.round(dist * 2);

    // Speed tip (faster = bigger), trimmed by reckless bumps, scaled by upgrade.
    const speedTip = Math.max(0, 60 - ride.elapsed * 1.5);
    const recklessPenalty = ride.recklessHits * 10;
    const tip = Math.max(0, Math.round((speedTip - recklessPenalty) * this.tipMultiplier));

    // Star rating: smooth + clean = 3 stars, rough or slow loses stars.
    let stars = 3;
    const par = dist * 0.9 + 8; // generous time budget for the distance
    if (ride.elapsed > par) stars -= 1;
    if (ride.recklessHits >= 1) stars -= 1;
    if (ride.recklessHits >= 3) stars -= 1;
    stars = Math.max(1, Math.min(3, stars));

    const reward = this.game.completeRide(base, tip);
    this.lastReward = {
      ...reward,
      stars,
      reckless: ride.recklessHits > 0,
      reaction: REACTIONS[stars] ?? "",
    };

    this.dropMarker.hide();
    this.used.delete(ride.pointIndex);
    this.active = null;
    this.justCompleted = true;

    // Keep the city populated.
    this.spawnWaiting();
  }
}
