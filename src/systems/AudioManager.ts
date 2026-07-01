/**
 * All audio is synthesized with the Web Audio API so the game needs zero sound
 * assets: a speed-driven engine drone, pickup/drop-off dings, and a honk.
 * Must be resumed from a user gesture (the Start button) to satisfy autoplay.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;

  // Engine drone nodes.
  private engineOsc: OscillatorNode | null = null;
  private engineGain: GainNode | null = null;

  // Rain ambience source (its gain rides under the muted master).
  private rainSrc: AudioBufferSourceNode | null = null;

  enabled = true;

  /** Call from a user gesture. Safe to call repeatedly. */
  resume() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.enabled ? 0.6 : 0;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  /** Mute/unmute everything (the sound toggle). */
  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(on ? 0.6 : 0, this.ctx.currentTime, 0.05);
    }
  }

  startEngine() {
    if (!this.ctx || !this.master || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = "sawtooth";
    this.engineOsc.frequency.value = 60;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0.0;

    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;

    this.engineOsc.connect(lp);
    lp.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  }

  stopEngine() {
    if (this.engineGain) this.engineGain.gain.value = 0;
  }

  /** Modulate the engine pitch/volume by speed (m/s). */
  updateEngine(speed: number) {
    if (!this.ctx || !this.engineOsc || !this.engineGain || !this.enabled) return;
    const s = Math.abs(speed);
    const target = 55 + s * 6.5;
    this.engineOsc.frequency.setTargetAtTime(target, this.ctx.currentTime, 0.08);
    const vol = 0.015 + Math.min(s / 18, 1) * 0.05;
    this.engineGain.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.1);
  }

  private blip(freq: number, start: number, dur: number, type: OscillatorType = "sine", peak = 0.25) {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + start;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  ding() {
    if (!this.enabled) return;
    this.blip(880, 0, 0.12);
    this.blip(1320, 0.1, 0.16);
  }

  /** Drop-off chime. Rises in pitch with the combo for escalating reward feel. */
  cash(combo = 1) {
    if (!this.enabled) return;
    const k = Math.pow(1.06, combo - 1); // ~6% per combo step
    this.blip(1046 * k, 0, 0.1);
    this.blip(1318 * k, 0.08, 0.1);
    this.blip(1568 * k, 0.16, 0.18);
    if (combo >= 3) this.blip(2093 * k, 0.24, 0.2); // sparkle on a hot streak
  }

  /** Quick metallic ping for collected coins. */
  coin() {
    if (!this.enabled) return;
    this.blip(1760, 0, 0.07, "triangle", 0.18);
    this.blip(2349, 0.05, 0.09, "triangle", 0.14);
  }

  /** Airy whoosh as the rickshaw squeezes past traffic (near-miss). */
  whoosh() {
    if (!this.ctx || !this.master || !this.enabled) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(0.35);
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(500, t);
    bp.frequency.exponentialRampToValueAtTime(2400, t + 0.25);
    bp.Q.value = 0.8;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + 0.35);
  }

  /** Start/stop a soft looping rain bed for monsoon weather. */
  rainStart() {
    if (!this.ctx || !this.master || this.rainSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer(2, true);
    src.loop = true;
    const lp = this.ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 1800;
    const g = this.ctx.createGain();
    g.gain.value = this.enabled ? 0.06 : 0;
    src.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    src.start();
    this.rainSrc = src;
  }

  rainStop() {
    if (this.rainSrc) {
      try {
        this.rainSrc.stop();
      } catch {
        /* already stopped */
      }
      this.rainSrc = null;
    }
  }

  private noiseBuffer(seconds: number, loopable = false): AudioBuffer {
    const ctx = this.ctx!;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    if (loopable) {
      // Smooth the seam so the loop doesn't click.
      const f = Math.min(2000, len >> 2);
      for (let i = 0; i < f; i++) data[i] *= i / f;
    }
    return buf;
  }

  honk() {
    if (!this.enabled) return;
    this.blip(420, 0, 0.18, "square");
    this.blip(360, 0, 0.18, "square");
  }

  /** A faint, pitch-varied honk somewhere in the city for ambiance. */
  ambientHonk() {
    if (!this.enabled) return;
    const base = 280 + Math.random() * 220;
    this.blip(base, 0, 0.2 + Math.random() * 0.2, "square", 0.05);
  }
}
