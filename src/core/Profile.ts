export type WeatherMode = "golden" | "night" | "monsoon";

/** A cosmetic rickshaw paint job. Index 0 is owned for free. */
export interface Livery {
  name: string;
  color: number;
  cost: number;
}

export const LIVERIES: Livery[] = [
  { name: "Classic Yellow", color: 0xffcf2f, cost: 0 },
  { name: "Mumbai Black", color: 0x2c2c30, cost: 150 },
  { name: "Sea Green", color: 0x2fae7a, cost: 200 },
  { name: "Saffron", color: 0xff8a3c, cost: 250 },
  { name: "Royal Blue", color: 0x2f6fd8, cost: 320 },
];

/** Upgradeable stat track: 3 levels, each with a cost to reach it. */
interface Track {
  key: "engine" | "timer" | "tip";
  label: string;
  blurb: string;
  costs: [number, number, number]; // cost to go 0→1, 1→2, 2→3
}

export const TRACKS: Track[] = [
  { key: "engine", label: "Engine", blurb: "Top speed & acceleration", costs: [120, 220, 360] },
  { key: "timer", label: "Timer", blurb: "+15s starting time per level", costs: [100, 180, 300] },
  { key: "tip", label: "Tips", blurb: "Bigger passenger tips", costs: [140, 260, 420] },
];

const KEY = "rr-profile-v1";

interface Saved {
  wallet: number;
  engine: number;
  timer: number;
  tip: number;
  ownedLiveries: number[];
  livery: number;
  sound: boolean;
  weather: WeatherMode;
}

/**
 * Persistent player profile: the rupee wallet, purchased upgrade levels, owned
 * cosmetic liveries, and preferences (sound, weather). Survives across runs via
 * localStorage so money earned has a lasting purpose (the garage).
 */
export class Profile {
  wallet = 0;
  engine = 0;
  timer = 0;
  tip = 0;
  ownedLiveries = new Set<number>([0]);
  livery = 0;
  sound = true;
  weather: WeatherMode = "golden";

  constructor() {
    this.load();
  }

  // --- Derived gameplay values (read by the rickshaw / game / ride) ---------

  get maxSpeed(): number {
    return 18 + this.engine * 2; // 18 → 24
  }
  get accel(): number {
    return 22 + this.engine * 3; // 22 → 31
  }
  get startTime(): number {
    return 180 + this.timer * 15; // 3:00 → 3:45
  }
  get tipMultiplier(): number {
    return 1 + this.tip * 0.15; // 1.0 → 1.45
  }
  get liveryColor(): number {
    return LIVERIES[this.livery]?.color ?? LIVERIES[0].color;
  }

  // --- Upgrade purchasing ----------------------------------------------------

  level(key: Track["key"]): number {
    return this[key];
  }

  /** Cost to buy the next level of a track, or null if maxed. */
  nextCost(t: Track): number | null {
    const lvl = this.level(t.key);
    return lvl >= 3 ? null : t.costs[lvl];
  }

  buyUpgrade(t: Track): boolean {
    const cost = this.nextCost(t);
    if (cost === null || this.wallet < cost) return false;
    this.wallet -= cost;
    this[t.key] += 1;
    this.save();
    return true;
  }

  buyLivery(index: number): boolean {
    const liv = LIVERIES[index];
    if (!liv || this.ownedLiveries.has(index) || this.wallet < liv.cost) return false;
    this.wallet -= liv.cost;
    this.ownedLiveries.add(index);
    this.livery = index;
    this.save();
    return true;
  }

  selectLivery(index: number): boolean {
    if (!this.ownedLiveries.has(index)) return false;
    this.livery = index;
    this.save();
    return true;
  }

  /** Add a run's earnings to the persistent wallet. */
  bank(amount: number) {
    this.wallet += Math.max(0, Math.round(amount));
    this.save();
  }

  setSound(on: boolean) {
    this.sound = on;
    this.save();
  }
  setWeather(mode: WeatherMode) {
    this.weather = mode;
    this.save();
  }

  // --- Persistence -----------------------------------------------------------

  private save() {
    const data: Saved = {
      wallet: this.wallet,
      engine: this.engine,
      timer: this.timer,
      tip: this.tip,
      ownedLiveries: [...this.ownedLiveries],
      livery: this.livery,
      sound: this.sound,
      weather: this.weather,
    };
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
    } catch {
      /* storage unavailable — run is still playable */
    }
  }

  private load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      const d = JSON.parse(raw) as Partial<Saved>;
      this.wallet = d.wallet ?? 0;
      this.engine = clampLvl(d.engine);
      this.timer = clampLvl(d.timer);
      this.tip = clampLvl(d.tip);
      this.ownedLiveries = new Set(d.ownedLiveries ?? [0]);
      this.ownedLiveries.add(0);
      this.livery = d.livery ?? 0;
      this.sound = d.sound ?? true;
      this.weather = d.weather ?? "golden";
    } catch {
      /* corrupt save — start fresh */
    }
  }
}

function clampLvl(v: number | undefined): number {
  return Math.max(0, Math.min(3, Math.floor(v ?? 0)));
}
