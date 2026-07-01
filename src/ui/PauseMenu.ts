import type { Profile, WeatherMode } from "../core/Profile";

interface Handlers {
  onResume: () => void;
  onRestart: () => void;
  onSound: (on: boolean) => void;
  onWeather: (mode: WeatherMode) => void;
}

const WEATHERS: { mode: WeatherMode; label: string }[] = [
  { mode: "golden", label: "☀️ Golden" },
  { mode: "night", label: "🌆 Evening" },
  { mode: "monsoon", label: "🌧️ Monsoon" },
];

/**
 * In-run pause overlay: resume, restart, and live toggles for sound and
 * weather. Reads/writes preferences through the Profile.
 */
export class PauseMenu {
  private root = document.createElement("div");
  open = false;

  constructor(
    private readonly profile: Profile,
    private readonly h: Handlers,
  ) {
    this.root.className = "screen pause hidden";
    document.body.append(this.root);
  }

  show() {
    this.render();
    this.root.classList.remove("hidden");
    this.open = true;
  }

  hide() {
    this.root.classList.add("hidden");
    this.open = false;
  }

  toggle() {
    this.open ? this.hide() : this.show();
  }

  private render() {
    const p = this.profile;
    this.root.innerHTML = "";

    const title = document.createElement("h2");
    title.textContent = "⏸ PAUSED";

    const resume = btn("RESUME", () => this.h.onResume());
    resume.className = "pause-primary";
    const restart = btn("RESTART RUN", () => this.h.onRestart());

    // Sound toggle.
    const sound = btn(`Sound: ${p.sound ? "ON" : "OFF"}`, () => {
      this.h.onSound(!p.sound);
      this.render();
    });

    // Weather selector.
    const wRow = document.createElement("div");
    wRow.className = "pause-weather";
    for (const w of WEATHERS) {
      const b = btn(w.label, () => {
        this.h.onWeather(w.mode);
        this.render();
      });
      b.className = `pause-wbtn${p.weather === w.mode ? " active" : ""}`;
      wRow.append(b);
    }

    const wLabel = document.createElement("div");
    wLabel.className = "pause-sublabel";
    wLabel.textContent = "Weather";

    this.root.append(title, resume, restart, sound, wLabel, wRow);
  }
}

function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
