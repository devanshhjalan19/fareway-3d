import type { Game } from "../core/Game";

/**
 * Title and game-over overlays. Calls `onStart` when the player begins or
 * restarts a run.
 */
export class Screens {
  private title = document.createElement("div");
  private over = document.createElement("div");
  private overStats = document.createElement("div");

  constructor(
    onStart: () => void,
    onGarage: () => void,
    onCreateRoom: () => void,
    onJoinRoom: () => void,
    mpAvailable = true,
  ) {
    // --- Title ---
    this.title.className = "screen";
    this.title.innerHTML = `
      <h1>🛺 RICKSHAW RACING</h1>
      <p>You're an auto-rickshaw driver in Mumbai. Pick up waiting passengers,
         drop them at their destination, and complete as many rides as you can
         before time runs out!</p>
      <p class="controls"><b>W/↑</b> drive &nbsp; <b>S/↓</b> brake / reverse &nbsp;
         <b>A·D / ←·→</b> steer &nbsp; <b>Space</b> handbrake &nbsp; <b>P</b> pause</p>
    `;
    const startBtn = document.createElement("button");
    startBtn.textContent = mpAvailable ? "▶ SINGLE PLAYER" : "▶ START DRIVING";
    startBtn.onclick = onStart;

    // Multiplayer entry points.
    const mpRow = document.createElement("div");
    mpRow.className = "mp-row";
    const createBtn = document.createElement("button");
    createBtn.textContent = "🚦 CREATE ROOM";
    createBtn.onclick = onCreateRoom;
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "🔗 JOIN ROOM";
    joinBtn.onclick = onJoinRoom;
    mpRow.append(createBtn, joinBtn);

    const garageBtn = document.createElement("button");
    garageBtn.className = "ghost";
    garageBtn.textContent = "🔧 GARAGE";
    garageBtn.onclick = onGarage;
    // Only surface the Create/Join buttons when a multiplayer server is
    // configured (VITE_PARTYKIT_HOST). Otherwise keep the menu clean.
    if (mpAvailable) this.title.append(startBtn, mpRow, garageBtn);
    else this.title.append(startBtn, garageBtn);

    // --- Game over ---
    this.over.className = "screen hidden";
    const overTitle = document.createElement("h2");
    overTitle.textContent = "TIME'S UP!";
    this.overStats.className = "stat";
    const againBtn = document.createElement("button");
    againBtn.textContent = "DRIVE AGAIN";
    againBtn.onclick = onStart;
    const overGarageBtn = document.createElement("button");
    overGarageBtn.className = "ghost";
    overGarageBtn.textContent = "🔧 GARAGE";
    overGarageBtn.onclick = onGarage;
    this.over.append(overTitle, this.overStats, againBtn, overGarageBtn);

    document.body.append(this.title, this.over);
  }

  showTitle() {
    this.title.classList.remove("hidden");
    this.over.classList.add("hidden");
  }

  showGameOver(game: Game, wallet: number) {
    const best = game.rides >= game.bestRides ? " 🏆 New best!" : ` (Best: ${game.bestRides})`;
    this.overStats.innerHTML = `Rides completed: <b>${game.rides}</b><br/>
      Earnings: <b>₹${game.money}</b>${best}<br/>
      <span class="bank">Banked to wallet — total ₹${wallet}. Spend it in the Garage!</span>`;
    this.over.classList.remove("hidden");
    this.title.classList.add("hidden");
  }

  hideAll() {
    this.title.classList.add("hidden");
    this.over.classList.add("hidden");
  }
}
