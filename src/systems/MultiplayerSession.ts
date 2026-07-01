import * as THREE from "three";
import { Customer } from "../entities/Customer";
import { Marker } from "../entities/Marker";
import { RemoteRickshaw, PLAYER_COLORS } from "../entities/RemoteRickshaw";
import type { Rickshaw } from "../entities/Rickshaw";
import type { NetClient } from "../net/NetClient";
import type { Phase, PlayerState, ServerMsg } from "../net/protocol";

type StateMsg = Extract<ServerMsg, { t: "state" }>;

/**
 * Client-side driver for a multiplayer round. It reconciles the authoritative
 * server state into the scene (rendering the shared passengers and the other
 * players' rickshaws), reports the local player's movement, and fires pickup /
 * drop-off requests when the local rickshaw is in range — the server decides who
 * actually gets each fare.
 */
export class MultiplayerSession {
  phase: Phase = "lobby";
  timeLeft = 0;
  players: PlayerState[] = [];

  // Surfaced for the HUD / arrow / mini-map, mirroring the solo Ride API.
  objectiveLabel = "";
  objectivePosition: THREE.Vector3 | null = null;

  // One-frame event flags (read by the game loop for audio / toasts).
  justPickedUp = false;
  justDropped = false;
  justBeaten = false;

  private remotes = new Map<string, RemoteRickshaw>();
  private paxCustomers = new Map<number, Customer>();
  private passengers: StateMsg["passengers"] = [];
  private dropMarker = new Marker(0xff4d4d);

  private myCarrying: number | null = null;
  private myScore = 0;
  private pendingPickup: number | null = null;
  private moveTimer = 0;
  private actionCooldown = 0;

  private readonly pickupRadius = 3.6;
  private readonly dropoffRadius = 4.2;
  private readonly slowSpeed = 5;

  constructor(
    private readonly scene: THREE.Scene,
    private readonly waitPoints: THREE.Vector3[],
    private readonly net: NetClient,
  ) {
    this.scene.add(this.dropMarker.object);
  }

  get me(): PlayerState | undefined {
    return this.players.find((p) => p.id === this.net.you);
  }

  /** This player's server-assigned id. */
  get you(): string {
    return this.net.you;
  }

  get isHost(): boolean {
    return !!this.me?.host;
  }

  /** Ask the server to (re)start a round. Only the host is honoured. */
  requestStart() {
    this.net.start();
  }

  get score(): number {
    return this.myScore;
  }

  /** Positions of the other players (for mini-map dots). */
  get otherPositions(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const r of this.remotes.values()) out.push(r.position);
    return out;
  }

  /** Waiting-passenger positions (mini-map). */
  get waitingPositions(): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (const p of this.passengers) {
      if (p.state === "waiting") out.push(this.waitPoints[p.pickup]);
    }
    return out;
  }

  /** My active drop-off position, or null. */
  get dropoff(): THREE.Vector3 | null {
    if (this.myCarrying === null) return null;
    const pax = this.passengers.find((p) => p.id === this.myCarrying);
    return pax && pax.drop !== null ? this.waitPoints[pax.drop] : null;
  }

  /** Final standings, highest score first (for the scoreboard). */
  get ranking(): PlayerState[] {
    return [...this.players].sort((a, b) => b.score - a.score);
  }

  // --- Server state ---------------------------------------------------------

  onState(msg: StateMsg) {
    this.phase = msg.phase;
    this.timeLeft = msg.timeLeft;
    this.players = msg.players;
    this.passengers = msg.passengers;

    this.reconcileRemotes();
    this.reconcilePassengers();

    // Track my own carry/score to raise one-frame events.
    const me = this.me;
    const carrying = me ? me.carrying : null;
    const score = me ? me.score : 0;
    if (carrying !== null && this.myCarrying === null) {
      this.justPickedUp = true;
      this.pendingPickup = null;
    }
    if (score > this.myScore) this.justDropped = true;
    // My requested fare got taken by someone else.
    if (this.pendingPickup !== null) {
      const pax = this.passengers.find((p) => p.id === this.pendingPickup);
      if (!pax || (pax.carrier && pax.carrier !== this.net.you)) {
        this.justBeaten = true;
        this.pendingPickup = null;
      }
    }
    this.myCarrying = carrying;
    this.myScore = score;
  }

  private reconcileRemotes() {
    const seen = new Set<string>();
    let colorIdx = 0;
    for (const p of this.players) {
      if (p.id === this.net.you) {
        colorIdx++;
        continue;
      }
      seen.add(p.id);
      let r = this.remotes.get(p.id);
      if (!r) {
        r = new RemoteRickshaw(p.name, PLAYER_COLORS[colorIdx % PLAYER_COLORS.length]);
        this.remotes.set(p.id, r);
        this.scene.add(r.object);
      }
      r.setTarget(p.x, p.z, p.h);
      colorIdx++;
    }
    for (const [id, r] of this.remotes) {
      if (!seen.has(id)) {
        this.scene.remove(r.object);
        this.remotes.delete(id);
      }
    }
  }

  private reconcilePassengers() {
    const seen = new Set<number>();
    for (const p of this.passengers) {
      seen.add(p.id);
      let c = this.paxCustomers.get(p.id);
      if (!c) {
        // Large patience: MP passengers don't expire (the server owns them).
        c = new Customer(this.waitPoints[p.pickup], 1e9);
        this.paxCustomers.set(p.id, c);
        this.scene.add(c.object);
      }
      // Waiting passengers are visible; boarded ones ride hidden in a rickshaw.
      c.setVisible(p.state === "waiting");
    }
    for (const [id, c] of this.paxCustomers) {
      if (!seen.has(id)) {
        this.scene.remove(c.object);
        this.paxCustomers.delete(id);
      }
    }
  }

  // --- Per-frame update -----------------------------------------------------

  update(dt: number, rickshaw: Rickshaw) {
    this.justPickedUp = false;
    this.justDropped = false;
    this.justBeaten = false;

    for (const r of this.remotes.values()) r.update(dt);
    for (const c of this.paxCustomers.values()) c.update(dt);
    this.dropMarker.update(dt);

    // Report my movement ~15 Hz.
    this.moveTimer -= dt;
    if (this.moveTimer <= 0) {
      this.net.move(rickshaw.position.x, rickshaw.position.z, rickshaw.heading);
      this.moveTimer = 1 / 15;
    }

    if (this.phase !== "playing") {
      this.objectivePosition = null;
      this.objectiveLabel = "";
      this.dropMarker.hide();
      return;
    }

    this.actionCooldown = Math.max(0, this.actionCooldown - dt);
    const pos = rickshaw.position;
    const slow = Math.abs(rickshaw.speed) < this.slowSpeed;

    if (this.myCarrying !== null) {
      // Carrying a fare: guide to and detect the drop-off.
      const drop = this.dropoff;
      this.objectiveLabel = "Drop off the passenger";
      this.objectivePosition = drop;
      if (drop) {
        this.dropMarker.show(drop);
        if (drop.distanceTo(pos) < this.dropoffRadius && slow && this.actionCooldown === 0) {
          this.net.dropoff(this.myCarrying);
          this.actionCooldown = 0.4;
        }
      }
    } else {
      // Free: head for the nearest waiting passenger and try to grab it.
      this.dropMarker.hide();
      let nearest: StateMsg["passengers"][number] | null = null;
      let nearestDist = Infinity;
      for (const p of this.passengers) {
        if (p.state !== "waiting") continue;
        const d = this.waitPoints[p.pickup].distanceTo(pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = p;
        }
      }
      if (nearest) {
        this.objectiveLabel = "Race for the passenger";
        this.objectivePosition = this.waitPoints[nearest.pickup];
        if (nearestDist < this.pickupRadius && slow && this.actionCooldown === 0) {
          this.pendingPickup = nearest.id;
          this.net.pickup(nearest.id);
          this.actionCooldown = 0.4;
        }
      } else {
        this.objectiveLabel = "";
        this.objectivePosition = null;
      }
    }
  }

  dispose() {
    for (const r of this.remotes.values()) this.scene.remove(r.object);
    for (const c of this.paxCustomers.values()) this.scene.remove(c.object);
    this.remotes.clear();
    this.paxCustomers.clear();
    this.scene.remove(this.dropMarker.object);
    this.net.dispose();
  }
}
