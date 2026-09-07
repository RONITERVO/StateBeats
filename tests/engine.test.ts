import { describe, it, expect } from 'vitest';
import { initialState, transition } from '@statebeats/core';
import type { Command, Vec3 } from '@statebeats/core';
import { compile, standardActor } from '@statebeats/sdk';
import type { MapInput, NoteInput } from '@statebeats/sdk';
export const fixture = (notes: NoteInput[], other: Partial<MapInput> = {}): MapInput => ({
  version: 1,
  id: 'fixture',
  title: 'Fixture',
  durationBeats: 4,
  tempo: [{ beat: 0, bpm: 120 }],
  notes,
  ...other,
});
const note = (other: Partial<NoteInput> = {}): NoteInput => ({
  id: 'one',
  beat: 1,
  position: [0, 1, -1],
  earlyMs: 0,
  lateMs: 0,
  ...other,
});
const pose = (
  tick: number,
  position: Vec3,
  effectorId = 'left',
  actorId = 'player',
  extra: object = {},
): Command => ({
  id: `pose-${actorId}-${effectorId}-${tick}`,
  tick,
  type: 'pose',
  actorId,
  effectorId,
  position,
  ...extra,
});
function run(map: MapInput, commands: Command[], ticks = 240, actors = [standardActor()]) {
  const program = compile(map).program;
  let state = initialState(program, actors);
  const events = [];
  for (let i = 1; i <= ticks; i++) {
    const r = transition(
      state,
      commands.filter((c) => c.tick === i),
      program,
    );
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}
describe('authoritative interactions', () => {
  it('a moving target crosses a stationary tracked hand between ticks', () => {
    const map = fixture([
      note({
        motion: [
          { beat: { n: 59, d: 60 }, position: [-1, 1, -1] },
          { beat: 1, position: [1, 1, -1] },
        ],
      }),
    ]);
    const r = run(map, [pose(1, [0, 1, -1])]);
    expect(r.events.filter((e) => e.type === 'interaction.hit')).toHaveLength(1);
  });
  it('a wrong hand misses, and the required hand scores', () => {
    const map = fixture([note({ preset: 'right' })]);
    expect(run(map, [pose(1, [0, 1, -1])]).state.scores[0].hits).toBe(0);
    expect(run(map, [pose(1, [0, 1, -1], 'right')]).state.scores[0].hits).toBe(1);
  });
  it('the final tick is hittable, outside the window is not', () => {
    const map = fixture([note({ lateMs: 25 })]);
    expect(run(map, [pose(1, [0, 1, 0]), pose(63, [0, 1, -1])]).state.scores[0].hits).toBe(1);
    expect(run(map, [pose(1, [0, 1, 0]), pose(64, [0, 1, -1])]).state.scores[0].hits).toBe(0);
  });
  it('no artificial sweep across a tracking gap', () => {
    const map = fixture([note()]);
    const r = run(map, [
      pose(1, [-1, 1, -1]),
      pose(59, [-1, 1, -1], 'left', 'player', { tracked: false }),
      pose(60, [1, 1, -1]),
    ]);
    expect(r.state.scores[0].hits).toBe(0);
  });
  it('combined requires distinct effectors of the SAME actor', () => {
    const map = fixture([note({ preset: 'combined', lateMs: 200 })]);
    const good = run(map, [pose(1, [0, 1, -1]), pose(61, [0, 1, -1], 'right')]);
    expect(good.state.scores[0].hits).toBe(1);
    const bad = run(map, [pose(1, [0, 1, -1]), pose(61, [0, 1, -1], 'right', 'partner')], 240, [
      standardActor(),
      standardActor('partner'),
    ]);
    expect(bad.state.scores.every((s) => s.hits === 0)).toBe(true);
  });
  it('shared requires different actors and credits both', () => {
    const r = run(
      fixture([note({ preset: 'shared' })]),
      [pose(1, [0, 1, -1]), pose(1, [0, 1, -1], 'right', 'partner')],
      240,
      [standardActor(), standardActor('partner')],
    );
    expect(r.state.scores.map((s) => s.hits)).toEqual([1, 1]);
  });
  it('arbitrates contested contact only once', () => {
    const r = run(
      fixture([note()]),
      [pose(1, [0, 1, -1]), pose(1, [0, 1, -1], 'left', 'partner')],
      240,
      [standardActor(), standardActor('partner')],
    );
    expect(r.state.scores.map((s) => s.hits)).toEqual([1, 0]);
    expect(r.events.some((e) => e.type === 'claim.arbitrated')).toBe(true);
  });
  it('a hold requires continuity and does not require speed', () => {
    const r = run(fixture([note({ preset: 'hold', holdMs: 100, durationBeats: 1 })]), [
      pose(1, [0, 1, -1]),
    ]);
    expect(r.state.scores[0].hits).toBe(1);
    expect(r.events.find((e) => e.type === 'interaction.hit')?.tick).toBe(71);
  });
  it('hazard crossing costs once even when both endpoints are outside', () => {
    const r = run(fixture([note({ preset: 'hazard', durationBeats: 1 })]), [
      pose(1, [-1, 1, -1]),
      pose(60, [1, 1, -1]),
    ]);
    expect(r.state.scores[0].hazards).toBe(1);
    expect(r.events.filter((e) => e.type === 'hazard.exited')).toHaveLength(1);
  });
  it('a consumed entity cannot score on both effectors', () => {
    const r = run(fixture([note()]), [pose(1, [0, 1, -1]), pose(1, [0, 1, -1], 'right')]);
    expect(r.state.scores[0].hits).toBe(1);
  });
  it('does not mutate frozen earlier state or depend on ambient time/randomness', () => {
    const program = compile(fixture([note()])).program;
    const deepFreeze = (x: unknown) => {
      if (x && typeof x === 'object') {
        Object.freeze(x);
        Object.values(x).forEach(deepFreeze);
      }
    };
    const prev = initialState(program, [standardActor()]);
    deepFreeze(prev);
    const before = JSON.stringify(prev);
    const random = Math.random;
    Math.random = () => {
      throw new Error('Random dependency');
    };
    try {
      const next = transition(prev, [pose(1, [0, 1, -1])], program);
      expect(next.state.tick).toBe(1);
      expect(JSON.stringify(prev)).toBe(before);
    } finally {
      Math.random = random;
    }
  });
});
