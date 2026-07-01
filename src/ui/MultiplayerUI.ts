import type { PlayerState } from "../net/protocol";

/** Generate a shareable 4-character room code (no ambiguous chars). */
export function makeRoomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}

interface LobbyOpts {
  code: string;
  isHost: boolean;
  onStart: () => void;
  onLeave: () => void;
}

/**
 * Overlays for the multiplayer flow: the join-code prompt, the pre-game lobby
 * (with the shareable room code + player list), and the final scoreboard.
 */
export class MultiplayerUI {
  private join = document.createElement("div");
  private lobby = document.createElement("div");
  private board = document.createElement("div");

  private lobbyList = document.createElement("div");
  private lobbyCode = document.createElement("div");
  private startBtn = document.createElement("button");
  private waitMsg = document.createElement("p");
  private boardList = document.createElement("div");

  constructor() {
    this.buildJoin();
    this.buildLobby();
    this.buildBoard();
    document.body.append(this.join, this.lobby, this.board);
  }

  // --- Join prompt ----------------------------------------------------------

  private joinSubmit: ((code: string) => void) | null = null;
  private joinInput = document.createElement("input");
  private joinError = document.createElement("p");

  private buildJoin() {
    this.join.className = "screen mp hidden";
    const h = document.createElement("h2");
    h.textContent = "JOIN A ROOM";
    const p = document.createElement("p");
    p.textContent = "Enter the 4-letter code your friend shared with you.";

    this.joinInput.className = "code-input";
    this.joinInput.maxLength = 4;
    this.joinInput.placeholder = "CODE";
    this.joinInput.autocapitalize = "characters";
    this.joinInput.oninput = () => {
      this.joinInput.value = this.joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    };
    this.joinInput.onkeydown = (e) => {
      if (e.key === "Enter") this.submitJoin();
    };

    this.joinError.className = "mp-error";

    const go = document.createElement("button");
    go.textContent = "JOIN";
    go.onclick = () => this.submitJoin();

    const back = document.createElement("button");
    back.className = "ghost";
    back.textContent = "BACK";
    back.onclick = () => this.hideAll();

    this.join.append(h, p, this.joinInput, this.joinError, go, back);
  }

  private submitJoin() {
    const code = this.joinInput.value.trim().toUpperCase();
    if (code.length < 3) {
      this.joinError.textContent = "That code looks too short.";
      return;
    }
    this.joinError.textContent = "";
    this.joinSubmit?.(code);
  }

  showJoinPrompt(onSubmit: (code: string) => void) {
    this.hideAll();
    this.joinSubmit = onSubmit;
    this.joinInput.value = "";
    this.joinError.textContent = "";
    this.join.classList.remove("hidden");
    this.joinInput.focus();
  }

  // --- Lobby ----------------------------------------------------------------

  private buildLobby() {
    this.lobby.className = "screen mp hidden";
    const h = document.createElement("h2");
    h.textContent = "ROOM LOBBY";

    const codeLabel = document.createElement("p");
    codeLabel.textContent = "Share this code so friends can join:";
    this.lobbyCode.className = "room-code";

    this.lobbyList.className = "player-list";

    this.startBtn.textContent = "START RACE";
    this.waitMsg.className = "wait-msg";
    this.waitMsg.textContent = "Waiting for the host to start…";

    const leave = document.createElement("button");
    leave.className = "ghost";
    leave.textContent = "LEAVE";

    this.lobby.append(h, codeLabel, this.lobbyCode, this.lobbyList, this.startBtn, this.waitMsg, leave);
    this.leaveBtn = leave;
  }

  private leaveBtn!: HTMLButtonElement;

  showLobby(opts: LobbyOpts) {
    this.hideAll();
    this.lobbyCode.textContent = opts.code;
    this.startBtn.onclick = opts.onStart;
    this.leaveBtn.onclick = opts.onLeave;
    this.lobby.classList.remove("hidden");
  }

  updateLobby(players: PlayerState[], isHost: boolean) {
    this.lobbyList.innerHTML = "";
    players.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "player-row";
      const dot = document.createElement("span");
      dot.className = "player-dot";
      dot.style.background = ["#ffcf2f", "#2fae7a", "#ff6a3c", "#2f8fd8"][i % 4];
      const name = document.createElement("span");
      name.textContent = p.name + (p.host ? "  👑" : "");
      row.append(dot, name);
      this.lobbyList.append(row);
    });
    const slots = document.createElement("div");
    slots.className = "player-count";
    slots.textContent = `${players.length} / 4 drivers`;
    this.lobbyList.append(slots);

    this.startBtn.style.display = isHost ? "" : "none";
    this.waitMsg.style.display = isHost ? "none" : "";
    this.startBtn.disabled = players.length < 1;
  }

  // --- Scoreboard -----------------------------------------------------------

  private buildBoard() {
    this.board.className = "screen mp hidden";
    const h = document.createElement("h2");
    h.textContent = "🏁 FINAL STANDINGS";
    this.boardList.className = "score-list";
    this.board.append(h, this.boardList);
    this.boardExtra = document.createElement("div");
    this.board.append(this.boardExtra);
  }

  private boardExtra!: HTMLDivElement;

  showScoreboard(
    ranking: PlayerState[],
    youId: string,
    opts: { onRematch?: () => void; onExit: () => void; canRematch: boolean },
  ) {
    this.hideAll();
    this.boardList.innerHTML = "";
    const medals = ["🥇", "🥈", "🥉", "4️⃣"];
    ranking.forEach((p, i) => {
      const row = document.createElement("div");
      row.className = "score-row" + (p.id === youId ? " you" : "");
      const rank = document.createElement("span");
      rank.textContent = medals[i] ?? `${i + 1}.`;
      const name = document.createElement("span");
      name.className = "score-name";
      name.textContent = p.name + (p.id === youId ? " (you)" : "");
      const val = document.createElement("span");
      val.className = "score-val";
      val.textContent = `${p.score} 🧍`;
      row.append(rank, name, val);
      this.boardList.append(row);
    });

    this.boardExtra.innerHTML = "";
    if (opts.canRematch && opts.onRematch) {
      const rematch = document.createElement("button");
      rematch.textContent = "REMATCH";
      rematch.onclick = opts.onRematch;
      this.boardExtra.append(rematch);
    }
    const exit = document.createElement("button");
    exit.className = "ghost";
    exit.textContent = "BACK TO MENU";
    exit.onclick = opts.onExit;
    this.boardExtra.append(exit);

    this.board.classList.remove("hidden");
  }

  showError(msg: string) {
    this.joinError.textContent = msg;
    this.join.classList.remove("hidden");
    this.lobby.classList.add("hidden");
    this.board.classList.add("hidden");
  }

  hideAll() {
    this.join.classList.add("hidden");
    this.lobby.classList.add("hidden");
    this.board.classList.add("hidden");
  }
}
