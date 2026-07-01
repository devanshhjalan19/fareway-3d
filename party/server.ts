import type * as Party from "partykit/server";
import {
  MAX_PLAYERS,
  ROUND_SECONDS,
  CITY_SEED,
  passengerTarget,
  parseClient,
  type Phase,
  type PlayerState,
  type PassengerState,
  type ServerMsg,
} from "../src/net/protocol";

interface Player {
  id: string;
  name: string;
  x: number;
  z: number;
  h: number;
  score: number;
  carrying: number | null;
}

interface Passenger {
  id: number;
  pickup: number;
  drop: number | null;
  carrier: string | null;
  state: "waiting" | "riding";
}

const TICK_MS = 100; // 10 Hz state broadcast + timer

/**
 * Authoritative room server. One instance per room code. Owns the shared
 * passenger pool (so "first to arrive wins" is refereed centrally), the round
 * clock, and each player's score. Player movement is client-reported and
 * relayed (no anti-cheat — this is a friendly party game).
 */
export default class RickshawServer implements Party.Server {
  private players = new Map<string, Player>();
  private passengers: Passenger[] = [];
  private phase: Phase = "lobby";
  private timeLeft = ROUND_SECONDS;
  private hostId: string | null = null;
  private waitPointCount = 0;
  private usedPoints = new Set<number>();
  private nextPid = 1;
  private loop: ReturnType<typeof setInterval> | null = null;
  private lastTick = 0;

  constructor(readonly room: Party.Room) {}

  onClose(conn: Party.Connection) {
    this.removePlayer(conn.id);
  }

  onError(conn: Party.Connection) {
    this.removePlayer(conn.id);
  }

  onMessage(raw: string, sender: Party.Connection) {
    const msg = parseClient(raw);
    if (!msg) return;

    switch (msg.t) {
      case "hello": {
        // Reject if the room is full or a round is already underway.
        const known = this.players.has(sender.id);
        if (!known && (this.players.size >= MAX_PLAYERS || this.phase !== "lobby")) {
          sender.send(JSON.stringify({ t: "full" } satisfies ServerMsg));
          sender.close();
          return;
        }
        if (!this.hostId) this.hostId = sender.id;
        if (msg.waitPoints > this.waitPointCount) this.waitPointCount = msg.waitPoints;
        this.players.set(sender.id, {
          id: sender.id,
          name: (msg.name || "Driver").slice(0, 16),
          x: 0,
          z: 0,
          h: 0,
          score: 0,
          carrying: null,
        });
        sender.send(
          JSON.stringify({ t: "welcome", you: sender.id, seed: CITY_SEED } satisfies ServerMsg),
        );
        this.broadcast();
        break;
      }

      case "start": {
        // Host can start from the lobby or restart from the scoreboard (rematch).
        if (sender.id === this.hostId && this.phase !== "playing") this.startRound();
        break;
      }

      case "move": {
        const p = this.players.get(sender.id);
        if (p) {
          p.x = msg.x;
          p.z = msg.z;
          p.h = msg.h;
        }
        break;
      }

      case "pickup": {
        this.handlePickup(sender.id, msg.pid);
        break;
      }

      case "dropoff": {
        this.handleDropoff(sender.id, msg.pid);
        break;
      }
    }
  }

  // --- Round lifecycle -----------------------------------------------------

  private startRound() {
    this.phase = "playing";
    this.timeLeft = ROUND_SECONDS;
    this.passengers = [];
    this.usedPoints.clear();
    for (const p of this.players.values()) {
      p.score = 0;
      p.carrying = null;
    }
    const target = passengerTarget(this.players.size);
    for (let i = 0; i < target; i++) this.spawnPassenger();

    this.lastTick = Date.now();
    if (this.loop) clearInterval(this.loop);
    this.loop = setInterval(() => this.tick(), TICK_MS);
    this.broadcast();
  }

  private tick() {
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;

    if (this.phase === "playing") {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.phase = "ended";
        if (this.loop) {
          clearInterval(this.loop);
          this.loop = null;
        }
      }
    }
    this.broadcast();
  }

  // --- Passengers ----------------------------------------------------------

  private freePoint(exclude = -1): number {
    if (this.waitPointCount <= 0) return -1;
    const free: number[] = [];
    for (let i = 0; i < this.waitPointCount; i++) {
      if (i !== exclude && !this.usedPoints.has(i)) free.push(i);
    }
    if (free.length === 0) return -1;
    return free[Math.floor(Math.random() * free.length)];
  }

  private spawnPassenger() {
    const pickup = this.freePoint();
    if (pickup === -1) return;
    this.usedPoints.add(pickup);
    this.passengers.push({
      id: this.nextPid++,
      pickup,
      drop: null,
      carrier: null,
      state: "waiting",
    });
  }

  private handlePickup(playerId: string, pid: number) {
    if (this.phase !== "playing") return;
    const player = this.players.get(playerId);
    if (!player || player.carrying !== null) return;
    const pax = this.passengers.find((p) => p.id === pid);
    if (!pax || pax.state !== "waiting" || pax.carrier !== null) return; // someone beat them

    const drop = this.freePoint(pax.pickup);
    pax.carrier = playerId;
    pax.state = "riding";
    pax.drop = drop === -1 ? pax.pickup : drop;
    if (drop !== -1) this.usedPoints.add(drop);
    player.carrying = pid;
    this.broadcast();
  }

  private handleDropoff(playerId: string, pid: number) {
    if (this.phase !== "playing") return;
    const player = this.players.get(playerId);
    if (!player) return;
    const idx = this.passengers.findIndex((p) => p.id === pid);
    if (idx === -1) return;
    const pax = this.passengers[idx];
    if (pax.carrier !== playerId || pax.state !== "riding") return;

    player.score += 1;
    player.carrying = null;
    this.usedPoints.delete(pax.pickup);
    if (pax.drop !== null) this.usedPoints.delete(pax.drop);
    this.passengers.splice(idx, 1);
    this.spawnPassenger(); // keep the city populated
    this.broadcast();
  }

  // --- Players / broadcast -------------------------------------------------

  private removePlayer(id: string) {
    const player = this.players.get(id);
    if (!player) return;
    // Release any fare they were carrying back into the waiting pool.
    if (player.carrying !== null) {
      const pax = this.passengers.find((p) => p.id === player.carrying);
      if (pax) {
        pax.carrier = null;
        pax.state = "waiting";
        if (pax.drop !== null) this.usedPoints.delete(pax.drop);
        pax.drop = null;
      }
    }
    this.players.delete(id);
    if (this.hostId === id) this.hostId = this.players.keys().next().value ?? null;

    if (this.players.size === 0) {
      if (this.loop) {
        clearInterval(this.loop);
        this.loop = null;
      }
      this.phase = "lobby";
      this.timeLeft = ROUND_SECONDS;
      this.passengers = [];
      this.usedPoints.clear();
      this.hostId = null;
    } else {
      this.broadcast();
    }
  }

  private broadcast() {
    const players: PlayerState[] = [];
    for (const p of this.players.values()) {
      players.push({
        id: p.id,
        name: p.name,
        x: p.x,
        z: p.z,
        h: p.h,
        score: p.score,
        carrying: p.carrying,
        host: p.id === this.hostId,
      });
    }
    const passengers: PassengerState[] = this.passengers.map((p) => ({
      id: p.id,
      pickup: p.pickup,
      drop: p.drop,
      carrier: p.carrier,
      state: p.state,
    }));

    const msg: ServerMsg = {
      t: "state",
      phase: this.phase,
      timeLeft: Math.ceil(this.timeLeft),
      players,
      passengers,
    };
    this.room.broadcast(JSON.stringify(msg));
  }
}
