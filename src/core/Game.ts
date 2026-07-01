export type GamePhase = "title" | "playing" | "gameover";

/**
 * Holds the run's score, money and countdown timer, plus the high-level phase.
 * Pure state + small helpers; rendering/UI lives elsewhere.
 */
export class Game {
  phase: GamePhase = "title";

  money = 0;
  rides = 0;
  timeLeft = 0;

  // Tip-combo streak: chain drop-offs within the window to grow the multiplier.
  combo = 1;
  comboTimer = 0;
  readonly maxCombo = 5;
  readonly comboWindow = 14; // seconds to keep the streak alive

  startTime = 180; // 3-minute rounds (raised by the Timer upgrade)
  readonly bonusPerRide = 15; // seconds added per completed ride

  bestRides = Number(localStorage.getItem("rr-best-rides") ?? 0);

  start() {
    this.phase = "playing";
    this.money = 0;
    this.rides = 0;
    this.timeLeft = this.startTime;
    this.combo = 1;
    this.comboTimer = 0;
  }

  /**
   * Reward a completed ride. `base` is the distance fare, `tip` the speed bonus.
   * The tip is multiplied by the current combo. Returns the awarded total and
   * the combo that applied.
   */
  completeRide(base: number, tip: number): { total: number; combo: number } {
    this.combo = this.comboTimer > 0 ? Math.min(this.combo + 1, this.maxCombo) : 1;
    this.comboTimer = this.comboWindow;
    const total = base + tip * this.combo;
    this.rides += 1;
    this.money += total;
    this.timeLeft += this.bonusPerRide;
    return { total, combo: this.combo };
  }

  /** Small money reward that isn't a full ride (e.g. a near-miss). */
  addBonus(amount: number) {
    this.money += Math.max(0, Math.round(amount));
  }

  /** Advances timers. Returns true on the tick the run just ended. */
  tick(dt: number): boolean {
    if (this.phase !== "playing") return false;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 1; // streak expired
    }

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.end();
      return true;
    }
    return false;
  }

  private end() {
    this.phase = "gameover";
    if (this.rides > this.bestRides) {
      this.bestRides = this.rides;
      localStorage.setItem("rr-best-rides", String(this.bestRides));
    }
  }
}
