import type { Input } from "../systems/Input";

/**
 * On-screen driving controls for touch devices: a steering pair on the left and
 * throttle/brake/handbrake on the right. Each pad writes straight into the
 * shared Input state, so keyboard and touch coexist. Hidden on desktop unless a
 * coarse (touch) pointer is detected.
 */
export class TouchControls {
  private root = document.createElement("div");

  constructor(input: Input) {
    this.root.id = "touch-controls";

    const left = document.createElement("div");
    left.className = "touch-cluster left";
    left.append(
      this.pad("◀", () => (input.touchSteer = 1), () => (input.touchSteer = 0)),
      this.pad("▶", () => (input.touchSteer = -1), () => (input.touchSteer = 0)),
    );

    const right = document.createElement("div");
    right.className = "touch-cluster right";
    right.append(
      this.pad("✋", () => (input.touchHandbrake = true), () => (input.touchHandbrake = false), "small"),
      this.pad("▼", () => (input.touchThrottle = -1), () => (input.touchThrottle = 0), "small"),
      this.pad("▲", () => (input.touchThrottle = 1), () => (input.touchThrottle = 0), "go"),
    );

    this.root.append(left, right);
    document.body.append(this.root);

    // Show automatically on touch-capable devices.
    if (this.isTouch()) this.root.classList.add("active");
  }

  private isTouch(): boolean {
    return (
      "ontouchstart" in window ||
      navigator.maxTouchPoints > 0 ||
      window.matchMedia?.("(pointer: coarse)").matches
    );
  }

  private pad(
    label: string,
    onDown: () => void,
    onUp: () => void,
    extra = "",
  ): HTMLButtonElement {
    const b = document.createElement("button");
    b.type = "button";
    b.className = `touch-btn ${extra}`.trim();
    b.textContent = label;
    b.setAttribute("aria-label", label);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      b.setPointerCapture?.(e.pointerId);
      onDown();
    };
    const up = (e: PointerEvent) => {
      e.preventDefault();
      if (b.hasPointerCapture?.(e.pointerId)) b.releasePointerCapture(e.pointerId);
      onUp();
    };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("pointerleave", up);
    return b;
  }

  setVisible(v: boolean) {
    // Only meaningful when touch is active; keep hidden on desktop.
    if (this.root.classList.contains("active")) {
      this.root.style.display = v ? "flex" : "none";
    }
  }
}
