// Shared wire protocol between the browser client and the PartyKit room server.
// Kept dependency-free so it can be imported from both `src/` and `party/`.

export const MAX_PLAYERS = 4;
export const ROUND_SECONDS = 180; // 3-minute rounds, matching single-player
export const CITY_SEED = 1337; // fixed so every client builds the identical map

/** How many waiting passengers the room keeps alive for a given player count. */
export function passengerTarget(playerCount: number): number {
  return 4 + playerCount * 2; // 6 for solo test, 12 for a full 4-player room
}

export type Phase = "lobby" | "playing" | "ended";

// --- Client -> Server ------------------------------------------------------
export type ClientMsg =
  | { t: "hello"; name: string; waitPoints: number }
  | { t: "start" }
  | { t: "move"; x: number; z: number; h: number }
  | { t: "pickup"; pid: number }
  | { t: "dropoff"; pid: number };

// --- Server -> Client ------------------------------------------------------
export interface PlayerState {
  id: string;
  name: string;
  x: number;
  z: number;
  h: number;
  score: number; // passengers dropped off
  carrying: number | null; // passenger id in the rickshaw, or null
  host: boolean;
}

export interface PassengerState {
  id: number;
  pickup: number; // wait-point index of where they wait
  drop: number | null; // wait-point index of the destination (once boarded)
  carrier: string | null; // player id carrying them, or null
  state: "waiting" | "riding";
}

export type ServerMsg =
  | { t: "welcome"; you: string; seed: number }
  | { t: "full" }
  | {
      t: "state";
      phase: Phase;
      timeLeft: number;
      players: PlayerState[];
      passengers: PassengerState[];
    };

export function parseServer(raw: string): ServerMsg | null {
  try {
    return JSON.parse(raw) as ServerMsg;
  } catch {
    return null;
  }
}

export function parseClient(raw: string): ClientMsg | null {
  try {
    return JSON.parse(raw) as ClientMsg;
  } catch {
    return null;
  }
}
