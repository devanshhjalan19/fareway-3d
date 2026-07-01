import PartySocket from "partysocket";
import { parseServer, type ClientMsg, type ServerMsg } from "./protocol";

/** Where the PartyKit room server lives (dev default, overridden at build). */
export const PARTY_HOST: string =
  (import.meta.env.VITE_PARTYKIT_HOST as string | undefined) || "127.0.0.1:1999";

export interface NetHandlers {
  onWelcome?: (you: string, seed: number) => void;
  onState?: (msg: Extract<ServerMsg, { t: "state" }>) => void;
  onFull?: () => void;
  onClose?: () => void;
  onError?: () => void;
}

/**
 * Thin wrapper over PartySocket that talks the game's protocol. One instance per
 * joined room; `dispose()` tears the connection down.
 */
export class NetClient {
  private socket: PartySocket;
  /** Server-assigned id for this player (set on welcome). */
  you = "";

  constructor(
    room: string,
    private readonly name: string,
    private readonly waitPoints: number,
    private readonly handlers: NetHandlers,
  ) {
    this.socket = new PartySocket({ host: PARTY_HOST, room });

    this.socket.addEventListener("open", () => {
      this.send({ t: "hello", name: this.name, waitPoints: this.waitPoints });
    });
    this.socket.addEventListener("message", (e) => {
      const msg = parseServer(typeof e.data === "string" ? e.data : "");
      if (!msg) return;
      this.dispatch(msg);
    });
    this.socket.addEventListener("close", () => this.handlers.onClose?.());
    this.socket.addEventListener("error", () => this.handlers.onError?.());
  }

  private dispatch(msg: ServerMsg) {
    switch (msg.t) {
      case "welcome":
        this.you = msg.you;
        this.handlers.onWelcome?.(msg.you, msg.seed);
        break;
      case "state":
        this.handlers.onState?.(msg);
        break;
      case "full":
        this.handlers.onFull?.();
        break;
    }
  }

  private send(msg: ClientMsg) {
    if (this.socket.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(msg));
  }

  start() {
    this.send({ t: "start" });
  }
  move(x: number, z: number, h: number) {
    this.send({ t: "move", x, z, h });
  }
  pickup(pid: number) {
    this.send({ t: "pickup", pid });
  }
  dropoff(pid: number) {
    this.send({ t: "dropoff", pid });
  }

  dispose() {
    this.socket.close();
  }
}
