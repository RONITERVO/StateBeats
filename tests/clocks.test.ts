import { describe, it, expect } from 'vitest';
import { Session, RealtimeClock, standardActor } from '@statebeats/sdk';
const map = {
  version: 1,
  id: 'clock',
  title: 'Clock',
  durationBeats: 100,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [],
};
describe('clock ownership and explicit stall transitions', () => {
  it('matches a manual timeline under jittered cadence without dropping backlog', async () => {
    const a = await Session.create(map, [standardActor()]),
      b = await Session.create(map, [standardActor()]);
    const clock = new RealtimeClock(b, 3);
    clock.start(0);
    let now = 0;
    for (const ms of [10, 20, 40, 5, 60, 15, 50]) {
      now += ms;
      clock.pump(now);
    }
    for (let i = 0; i < 20; i++) clock.pump(now);
    a.advance(24);
    expect(b.snapshot()).toEqual(a.snapshot());
  });
  it('a long stall changes phase and requests audio rebase without skipping gameplay ticks', async () => {
    const session = await Session.create(map),
      clock = new RealtimeClock(session);
    clock.start(0);
    clock.pump(25);
    expect(session.tick).toBe(3);
    const status = clock.pump(2000);
    expect(status).toMatchObject({ phase: 'stalled', rebase: true, tick: 3 });
    clock.start(2000);
    clock.pump(2025);
    expect(session.tick).toBe(6);
  });
  it('pause/read do not advance; manual ownership must be explicitly restored', async () => {
    const session = await Session.create(map),
      clock = new RealtimeClock(session);
    clock.start(0);
    clock.pause();
    clock.pump(1000);
    expect(session.tick).toBe(0);
    expect(() => session.advance(1)).toThrow();
    clock.manual();
    session.advance(1);
    expect(session.tick).toBe(1);
  });
  it('rejects reversed time and invalid speed', async () => {
    const clock = new RealtimeClock(await Session.create(map));
    clock.start(100);
    expect(() => clock.pump(99)).toThrow();
    expect(() => clock.setSpeed(0)).toThrow();
  });
});
