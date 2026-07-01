import { Profile, TRACKS, LIVERIES } from "../core/Profile";

/**
 * The garage: spend the persistent wallet on engine/timer/tip upgrades and
 * cosmetic liveries between runs. Re-renders itself after every purchase and
 * notifies the game so the rickshaw repaints / re-tunes live.
 */
export class Garage {
  private root = document.createElement("div");

  constructor(
    private readonly profile: Profile,
    private readonly onChange: () => void,
    private readonly onClose: () => void,
  ) {
    this.root.className = "screen garage hidden";
    document.body.append(this.root);
  }

  open() {
    this.render();
    this.root.classList.remove("hidden");
  }

  close() {
    this.root.classList.add("hidden");
  }

  private render() {
    const p = this.profile;
    this.root.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "🔧 GARAGE";
    const wallet = document.createElement("div");
    wallet.className = "garage-wallet";
    wallet.innerHTML = `Wallet: <b>₹${p.wallet}</b>`;

    // --- Upgrade tracks ---
    const upgrades = document.createElement("div");
    upgrades.className = "garage-grid";
    for (const t of TRACKS) {
      const lvl = p.level(t.key);
      const cost = p.nextCost(t);
      const card = document.createElement("div");
      card.className = "garage-card";
      const pips = "●".repeat(lvl) + "○".repeat(3 - lvl);
      const btn =
        cost === null
          ? `<span class="maxed">MAXED</span>`
          : `<button ${p.wallet < cost ? "disabled" : ""}>Upgrade · ₹${cost}</button>`;
      card.innerHTML = `
        <div class="g-name">${t.label}</div>
        <div class="g-blurb">${t.blurb}</div>
        <div class="g-pips">${pips}</div>
        ${btn}`;
      const b = card.querySelector("button");
      if (b) b.onclick = () => this.buy(() => p.buyUpgrade(t));
      upgrades.append(card);
    }

    // --- Liveries ---
    const liveryTitle = document.createElement("div");
    liveryTitle.className = "garage-subtitle";
    liveryTitle.textContent = "Liveries";
    const liveries = document.createElement("div");
    liveries.className = "garage-liveries";
    LIVERIES.forEach((liv, i) => {
      const owned = p.ownedLiveries.has(i);
      const selected = p.livery === i;
      const chip = document.createElement("button");
      chip.className = `livery-chip${selected ? " selected" : ""}`;
      chip.style.background = `#${liv.color.toString(16).padStart(6, "0")}`;
      chip.title = liv.name;
      chip.innerHTML = owned
        ? selected
          ? "✓"
          : ""
        : `<span class="lock">₹${liv.cost}</span>`;
      chip.onclick = () =>
        this.buy(() => (owned ? p.selectLivery(i) : p.buyLivery(i)));
      liveries.append(chip);
    });

    // --- Back ---
    const back = document.createElement("button");
    back.className = "garage-back";
    back.textContent = "◀ BACK";
    back.onclick = this.onClose;

    this.root.append(title, wallet, upgrades, liveryTitle, liveries, back);
  }

  private buy(action: () => boolean) {
    if (action()) {
      this.onChange();
      this.render();
    }
  }
}
