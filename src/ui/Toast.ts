import type { RideReward } from "../systems/Ride";

/**
 * Transient floating popups: the rich drop-off reward (fare, combo, stars,
 * passenger reaction) and small one-liners like near-miss bonuses. Each toast
 * animates up and fades, then removes itself.
 */
export class Toast {
  private layer = document.createElement("div");

  constructor() {
    this.layer.id = "toast-layer";
    document.body.append(this.layer);
  }

  /** Big celebratory popup for a completed ride. */
  reward(r: RideReward) {
    const stars = "★★★".slice(0, r.stars) + "☆☆☆".slice(0, 3 - r.stars);
    const comboTag = r.combo > 1 ? `<span class="t-combo">🔥 x${r.combo}</span>` : "";
    const cls = r.stars === 3 ? "great" : r.reckless ? "rough" : "ok";
    this.spawn(
      `<div class="t-amount">+₹${r.total}</div>
       <div class="t-stars ${cls}">${stars}</div>
       <div class="t-reaction">${r.reaction}</div>
       ${comboTag}`,
      "reward",
      1500,
    );
  }

  /** Small popup (near-miss bonus, etc.). */
  note(text: string) {
    this.spawn(text, "note", 1000);
  }

  private spawn(html: string, kind: string, ms: number) {
    const el = document.createElement("div");
    el.className = `toast ${kind}`;
    el.innerHTML = html;
    this.layer.append(el);
    setTimeout(() => el.remove(), ms);
  }
}
