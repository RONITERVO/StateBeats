import { expect, it } from 'vitest';
import {
  Session,
  standardActor,
  compile,
  MapBuilder,
  canonical,
  fitMapToPlayer,
} from '@statebeats/sdk';
import {
  doubleEntry,
  examplePolicies,
  flatScore,
  reversePriority,
  observerBot,
  jsonPerception,
} from '../examples/extensions.mjs';
const map = {
  version: 1,
  id: 'extension',
  title: 'Extension',
  durationBeats: 4,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [
    {
      id: 'one',
      beat: 2,
      position: [0, 1, -1],
      earlyMs: 1000,
      lateMs: 1000,
      policy: doubleEntry.id,
    },
  ],
};
it('personal layout accepts the host interaction/scoring adapters', () => {
  const fitted = fitMapToPlayer(map, { height: 1.65, roomScale: 1.2 }, examplePolicies, {
    scoring: flatScore,
  });
  expect(fitted.notes[0].policy).toBe(doubleEntry.id);
  expect(compile(fitted, examplePolicies, { scoring: flatScore }).program.scoring.id).toBe(
    flatScore.id,
  );
});
it('a new interaction stores its memory across checkpoint restore without core edits', async () => {
  const session = await Session.create(map, [standardActor()], examplePolicies, {
    scoring: flatScore,
  });
  const admin = session.client({ role: 'admin' });
  admin.submit(
    'motion',
    [1, 30, 60].map((tick, i) => ({
      id: `p${tick}`,
      tick,
      type: 'pose',
      actorId: 'player',
      effectorId: 'left',
      position: i === 1 ? [5, 1, -1] : [0, 1, -1],
    })),
  );
  session.advance(35);
  expect(session.snapshot().scores[0].hits).toBe(0);
  const restored = await Session.restore(admin.checkpoint(), examplePolicies, {
    scoring: flatScore,
  });
  restored.advance(100);
  expect(restored.snapshot().scores[0].points).toBe(42);
  const replay = await restored.client({ role: 'admin' }).replay();
  expect(
    (await Session.verifyReplay(replay, examplePolicies, { scoring: flatScore })).verified,
  ).toBe(true);
  await expect(Session.verifyReplay(replay)).rejects.toMatchObject({ code: 'POLICY_MISMATCH' });
});
it('arbitration adapter determines the winner of a contested contact', async () => {
  const session = await Session.create(
    { ...map, notes: [{ ...map.notes[0], policy: 'builtin/contact' }] },
    [standardActor(), standardActor('opponent')],
    undefined,
    { arbitration: reversePriority },
  );
  session.client({ role: 'admin' }).submit(
    'contest',
    ['player', 'opponent'].map((actorId) => ({
      id: actorId,
      tick: 1,
      type: 'pose',
      actorId,
      effectorId: 'left',
      position: [0, 1, -1],
    })),
  );
  session.advance(120);
  expect(session.snapshot().scores.map((s) => s.hits)).toEqual([0, 1]);
});
it('actor and text perception adapters play using only public observations', async () => {
  const session = await Session.create(
    { ...map, notes: [{ ...map.notes[0], policy: 'builtin/contact' }] },
    [standardActor()],
  );
  const lines: string[] = [];
  session.attachActor({ role: 'player', actorId: 'player' }, observerBot());
  session.attachSink(
    { role: 'observer' },
    jsonPerception((line: string) => lines.push(line)),
  );
  session.advance(240);
  expect(session.snapshot().scores[0].hits).toBe(1);
  expect(lines.some((line) => JSON.parse(line).event?.type === 'session.ended')).toBe(true);
  session.close();
});
it('replay consumes stored geometry even when authoring metadata differs; altered compiled geometry is rejected', async () => {
  const s = await Session.create(
    { ...map, notes: [{ ...map.notes[0], policy: 'builtin/contact' }] },
    [standardActor()],
  );
  s.advance(150);
  const replay = await s.client({ role: 'admin' }).replay();
  replay.map.notes[0].position = [99, 99, 99];
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  replay.compiled.entities[0].position = [98, 98, 98];
  await expect(Session.verifyReplay(replay)).rejects.toMatchObject({ code: 'PROGRAM_MISMATCH' });
});
it('builder removal clears dependent group references, and cyclic inputs fail clearly', () => {
  const b = new MapBuilder({
    ...map,
    notes: [
      { id: 'a', beat: 1, position: [0, 1, -1], group: 'pair' },
      { id: 'b', beat: 1, position: [1, 1, -1], group: 'pair' },
    ],
    groups: [{ id: 'pair', members: ['a', 'b'] }],
  } as never);
  expect(b.remove('a').compile().program.entities).toHaveLength(1);
  const cyclic: any = {};
  cyclic.self = cyclic;
  expect(() => canonical(cyclic)).toThrow('Cyclic');
  expect(() =>
    compile({
      ...map,
      notes: Array.from({ length: 2001 }, (_, i) => ({
        id: `n${i}`,
        beat: 1,
        position: [0, 1, 0],
      })),
    }),
  ).toThrow('simultaneous');
});
