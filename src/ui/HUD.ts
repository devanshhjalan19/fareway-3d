import type { Game } from "../core/Game";

/**
 * Top-bar HUD: money, rides, countdown timer, and the current objective banner.
 * Plain DOM overlay updated each frame.
 */
export class HUD {
  private root = document.createElement("div");
  private money = document.createElement("div");
  private rides = document.createElement("div");
  private combo = document.createElement("div");
  private timer = document.createElement("div");
  private speed = document.createElement("div");
  private objective = document.createElement("div");
  private glow = document.createElement("div"); // combo edge vignette

  constructor() {
    this.root.id = "hud";

    this.glow.id = "combo-glow";
    document.body.append(this.glow);

    this.money.className = "hud-chip";
    this.rides.className = "hud-chip";
    this.combo.className = "hud-chip combo";
    this.timer.className = "hud-chip timer";
    this.speed.className = "hud-chip speed";
    this.combo.style.display = "none";
    this.root.append(this.money, this.rides, this.combo, this.timer, this.speed);

    this.objective.id = "objective";
    this.objective.style.display = "none";

    document.body.append(this.root, this.objective);
  }

  update(game: Game, objectiveLabel: string, speedMs: number) {
    this.money.textContent = `💰 ₹${game.money}`;
    this.rides.textContent = `🛺 ${game.rides}`;

    if (game.combo > 1) {
      // Escalating feedback: more flames, bigger chip, brighter edge glow.
      const flames = "🔥".repeat(Math.min(game.combo, 3));
      this.combo.textContent = `${flames} x${game.combo}`;
      this.combo.style.display = "flex";
      this.combo.style.transform = `scale(${1 + (game.combo - 1) * 0.06})`;
      this.glow.style.opacity = String(Math.min((game.combo - 1) * 0.12, 0.42));
    } else {
      this.combo.style.display = "none";
      this.glow.style.opacity = "0";
    }

    const secs = Math.ceil(game.timeLeft);
    const m = Math.floor(secs / 60);
    const s = (secs % 60).toString().padStart(2, "0");
    this.timer.textContent = `⏱ ${m}:${s}`;
    this.timer.classList.toggle("low", secs <= 15);

    this.speed.textContent = `${Math.round(Math.abs(speedMs) * 3.6)} km/h`;

    if (objectiveLabel) {
      this.objective.textContent = objectiveLabel;
      this.objective.style.display = "block";
    } else {
      this.objective.style.display = "none";
    }
  }

  setVisible(v: boolean) {
    this.root.style.display = v ? "flex" : "none";
    if (!v) {
      this.objective.style.display = "none";
      this.glow.style.opacity = "0";
    }
  }
}
