import type { HandSample } from './protocol.js';
/** Device tracking grace period; independent from playback state and simulation time. */
export class TrackingGuard {
  private lostAt: number | undefined;
  reset() {
    this.lostAt = undefined;
  }
  interrupted(now: number, headTracked: boolean, samples: readonly HandSample[]) {
    const complete =
      headTracked &&
      ['left', 'right'].every((id) => samples.some((s) => s.id === id && s.tracked && s.active));
    if (complete) {
      this.reset();
      return false;
    }
    this.lostAt ??= now;
    return now - this.lostAt >= 250;
  }
}
