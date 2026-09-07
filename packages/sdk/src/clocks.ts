import type { Session } from './session.js';
import { EngineError } from './schema.js';
export class ManualClock {
  constructor(readonly session: Session) {}
  advance(ticks: number) {
    return this.session.advance(ticks, 'manual');
  }
}
export interface ClockStatus {
  phase: 'paused' | 'running' | 'stalled' | 'ended';
  tick: number;
  backlogMs: number;
  rebase: boolean;
}
/** Feed a monotonic timestamp. Scheduling (setInterval/XR frame/etc.) is an adapter's job. */
export class RealtimeClock {
  private last: number | null = null;
  private accumulator = 0;
  private running = false;
  private speed = 1;
  private stalled = false;
  constructor(
    readonly session: Session,
    readonly maxTicksPerPump = 16,
    readonly stallMs = 250,
  ) {}
  get active() {
    return this.running;
  }
  start(now: number): ClockStatus {
    if (!Number.isFinite(now)) throw new EngineError('VALIDATION', 'Nonfinite timestamp');
    this.session.setClockMode('realtime');
    this.last = now;
    this.running = true;
    this.stalled = false;
    return this.status(true);
  }
  pause(): ClockStatus {
    this.running = false;
    this.last = null;
    return this.status(true);
  }
  setSpeed(speed: number): ClockStatus {
    if (!Number.isFinite(speed) || speed < 0.1 || speed > 4)
      throw new EngineError('VALIDATION', 'Speed must be 0.1–4');
    this.speed = speed;
    return this.status(true);
  }
  manual(): ClockStatus {
    this.pause();
    this.session.setClockMode('manual');
    return this.status(true);
  }
  pump(now: number): ClockStatus {
    if (!Number.isFinite(now) || (this.last !== null && now < this.last))
      throw new EngineError('CLOCK_REVERSED', 'Clock must be finite and monotonic');
    if (!this.running) return this.status(false);
    const elapsed = now - this.last!;
    this.last = now;
    // Large elapsed intervals mean the experience has paused. No ticks are skipped;
    // audio must cancel scheduled voices and rebase to the unchanged simulation tick.
    if (elapsed > this.stallMs) {
      this.running = false;
      this.stalled = true;
      this.last = null;
      return this.status(true);
    }
    this.accumulator += elapsed * this.speed;
    const step = 1000 / this.session.program.rules.tickRate,
      count = Math.min(this.maxTicksPerPump, Math.floor((this.accumulator + 1e-8) / step));
    if (count) {
      const before = this.session.tick;
      this.session.advance(count, 'realtime');
      this.accumulator -= count * step;
      if (this.session.tick === before || this.session.snapshot().finished) this.running = false;
    }
    return this.status(false);
  }
  private status(rebase: boolean): ClockStatus {
    return {
      phase: this.session.snapshot().finished
        ? 'ended'
        : this.running
          ? 'running'
          : this.stalled
            ? 'stalled'
            : 'paused',
      tick: this.session.tick,
      backlogMs: Math.max(0, this.accumulator),
      rebase,
    };
  }
}
