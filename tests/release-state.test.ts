import { expect, it } from 'vitest';
import { initialState, transition } from '@statebeats/core';
import { Session, compile, standardActor, scriptedCommands } from '@statebeats/sdk';
import type { MapInput, NoteInput } from '@statebeats/sdk';

const admin = { role: 'admin' } as const;
const map = (note: NoteInput): MapInput => ({
  version: 1,
  id: 'release-state',
  title: 'Release state',
  durationBeats: 8,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [note],
});
const note: NoteInput = {
  id: 'target',
  beat: 2,
  preset: 'left',
  position: [0, 1, -0.4],
  earlyMs: 0,
};

it.each([0, 1000])(
  'released strikes contain their completing slots with %i ms lead',
  async (leadMs) => {
    const s = await Session.create(map({ ...note, leadMs }), [standardActor()]);
    s.submit(admin, 'poses', scriptedCommands(s.program));
    s.advance(121);
    const view = s.observe(admin),
      release = view.resolvedEntities![0];
    expect(view.entities).toEqual([]);
    expect(view.scores[0].hits).toBe(1);
    expect(release.presentation!.outcome).toBe('hit');
    expect(release.progress).toBe(1);
    expect((await Session.restore(s.client(admin).checkpoint())).observe(admin)).toEqual(view);
    expect((await Session.verifyReplay(await s.client(admin).replay())).verified).toBe(true);
  },
);

it('expired holds retain the final break/reset, not the previous near-completion state', async () => {
  const s = await Session.create(
    map({
      ...note,
      preset: 'hold',
      slots: [{ semantic: 'left' }],
      holdMs: 100,
      breakMs: 0,
      durationBeats: 0.2,
    }),
    [standardActor()],
  );
  s.submit(admin, 'poses', [
    {
      id: 'start',
      type: 'pose',
      tick: 121,
      actorId: 'player',
      effectorId: 'left',
      position: [0, 1, -0.4],
    },
    {
      id: 'release',
      type: 'pose',
      tick: 132,
      actorId: 'player',
      effectorId: 'left',
      position: [0, 1, -0.4],
      active: false,
    },
  ]);
  s.advance(131);
  expect(s.observe(admin).entities[0].hold).toBe(11);
  s.advance(1);
  const view = s.observe(admin),
    release = view.resolvedEntities![0];
  expect(release.presentation!.outcome).toBe('missed');
  expect(release.hold).toBe(0);
  expect(release.progress).toBe(0);
  expect(view.scores[0].hits).toBe(0);
  expect(view.scores[0].misses).toBe(1);
  expect((await Session.restore(s.client(admin).checkpoint())).observe(admin)).toEqual(view);
});

it('the core returns detached final states, including same-tick spawn/hit and finished sessions', () => {
  const { program } = compile(map({ ...note, leadMs: 0 }));
  let state = initialState(program, [standardActor()]);
  for (let tick = 1; tick < 120; tick++) state = transition(state, [], program).state;
  const before = structuredClone(state);
  const result = transition(
    state,
    [
      {
        id: 'hit',
        type: 'pose',
        tick: 120,
        actorId: 'player',
        effectorId: 'left',
        position: [0, 1, -0.4],
      },
    ],
    program,
  );
  expect(state).toEqual(before);
  expect(result.state.entities).toEqual([]);
  expect(result.resolvedEntities[0].hits).toEqual([
    { slot: 0, actorId: 'player', effectorId: 'left', tick: 120 },
  ]);
  const hit = result.events.find((e) => e.type === 'interaction.hit')!;
  const eventBefore = structuredClone(hit);
  result.resolvedEntities[0].hits[0].actorId = 'changed';
  result.resolvedEntities[0].spec.position[0] = 999;
  expect(hit).toEqual(eventBefore);
  expect(program.entities[0].position).toEqual([0, 1, -0.4]);
  expect(state).toEqual(before);
  expect(transition({ ...result.state, finished: true }, [], program).resolvedEntities).toEqual([]);
});
