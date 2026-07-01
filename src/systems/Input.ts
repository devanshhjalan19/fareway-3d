/**
 * Keyboard input. Maps WASD + arrow keys to driving intents.
 *   throttle: -1..1 (forward / reverse)
 *   steer:    -1..1 (left / right)
 *   handbrake: boolean (Space)
 */
export class Input {
  private keys = new Set<string>();

  // On-screen touch controls write here; merged into the getters below.
  touchThrottle = 0; // -1..1
  touchSteer = 0; // -1..1
  touchHandbrake = false;

  constructor() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      // Stop the page from scrolling on arrows / space.
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
        e.preventDefault();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
  }

  private down(...codes: string[]): boolean {
    return codes.some((c) => this.keys.has(c));
  }

  get throttle(): number {
    let v = 0;
    if (this.down("KeyW", "ArrowUp")) v += 1;
    if (this.down("KeyS", "ArrowDown")) v -= 1;
    return clamp1(v + this.touchThrottle);
  }

  get steer(): number {
    let v = 0;
    if (this.down("KeyA", "ArrowLeft")) v += 1; // left  = turn CCW (+heading)
    if (this.down("KeyD", "ArrowRight")) v -= 1; // right = turn CW
    return clamp1(v + this.touchSteer);
  }

  get handbrake(): boolean {
    return this.down("Space") || this.touchHandbrake;
  }
}

function clamp1(v: number): number {
  return Math.max(-1, Math.min(1, v));
}
