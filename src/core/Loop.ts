/**
 * Fixed-timestep game loop. `update(dt)` is called with a constant dt for
 * deterministic physics; `render(alpha)` is called once per frame.
 */
export class Loop {
  private readonly step = 1 / 60; // seconds per physics tick
  private accumulator = 0;
  private last = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
  ) {}

  start() {
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame(this.tick);
  }

  stop() {
    this.running = false;
  }

  private tick = (now: number) => {
    if (!this.running) return;
    requestAnimationFrame(this.tick);

    let frameTime = (now - this.last) / 1000;
    this.last = now;
    // Avoid spiral-of-death after tab switches / long pauses.
    if (frameTime > 0.25) frameTime = 0.25;

    this.accumulator += frameTime;
    while (this.accumulator >= this.step) {
      this.update(this.step);
      this.accumulator -= this.step;
    }
    this.render();
  };
}
