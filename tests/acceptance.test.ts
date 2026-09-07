import { it, expect } from 'vitest';
import { Session, standardActor, compile, EngineService, canonical } from '@statebeats/sdk';
import { initialState, transition } from '@statebeats/core';
const map = {
  version: 1,
  id: 'edge',
  title: 'Edge',
  durationBeats: 4,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [{ id: 'a', beat: 1, preset: 'left', position: [0, 1, -1], earlyMs: 0, lateMs: 0 }],
};
const pose = (id: string, tick: number, position: number[], effectorId = 'left') => ({
  id,
  tick,
  type: 'pose',
  actorId: 'player',
  effectorId,
  position,
});
it('stage rotation moves both authoritative positions and reported orientation, without moving existing targets', async () => {
  const s = await Session.create({ ...map, notes: [{ ...map.notes[0], anchor: 'player' }] }, [
    standardActor(),
  ]);
  s.client({ role: 'admin' }).submit('setup', [
    {
      id: 'a-calibrate',
      tick: 1,
      type: 'calibrate',
      actorId: 'player',
      position: [2, 0, 3],
      orientation: [0, 1, 0, 0],
    },
    pose('b-hand', 60, [2, 1, 4]),
  ]);
  s.advance(1);
  expect(s.observe({ role: 'admin' }).entities[0].position).toEqual([2, 1, 4]);
  expect(s.observe({ role: 'admin' }).entities[0].orientation).toEqual([0, 1, 0, 0]);
  s.client({ role: 'admin' }).submit('recenter', [
    {
      id: 'recenter',
      tick: 2,
      type: 'calibrate',
      actorId: 'player',
      position: [9, 0, 9],
      orientation: [0, 0, 0, 1],
    },
  ]);
  s.advance(60);
  expect(s.snapshot().scores[0].hits).toBe(1);
});
it('a broken linked group retains the successful member base score', async () => {
  const s = await Session.create(
    {
      ...map,
      notes: [
        { ...map.notes[0], group: 'pair' },
        { ...map.notes[0], id: 'b', preset: 'right', position: [1, 1, -1], group: 'pair' },
      ],
      groups: [{ id: 'pair', members: ['a', 'b'], linkMs: 50, bonus: 500 }],
    },
    [standardActor()],
  );
  s.client({ role: 'admin' }).submit('one', [pose('touch', 60, [0, 1, -1])]);
  const events = s.advance(240);
  expect(s.snapshot().scores[0].points).toBe(100);
  expect(events.filter((e) => e.type === 'group.broken')).toHaveLength(1);
  expect(events.some((e) => e.type === 'group.completed')).toBe(false);
});
it('director IDs cannot be reused after resolution and future chart capacity is reserved', async () => {
  const s = await Session.create(map, [standardActor()]);
  const entity = {
    ...compile(map).program.entities[0],
    id: 'dynamic',
    spawnTick: 1,
    hitTick: 1,
    endTick: 1,
  };
  s.client({ role: 'director' }).submit('spawn', [
    { id: 'first', tick: 1, type: 'director.spawn', entity },
  ]);
  s.advance(1);
  s.client({ role: 'director' }).submit('reuse', [
    {
      id: 'second',
      tick: 2,
      type: 'director.spawn',
      entity: { ...entity, spawnTick: 2, hitTick: 2, endTick: 2 },
    },
  ]);
  expect(s.advance(1).some((e) => e.type === 'command.rejected')).toBe(true);
  const program = compile(map).program;
  program.rules.maxEntities = 1;
  const r = transition(
    initialState(program),
    [{ id: 'reserve', tick: 1, type: 'director.spawn', entity: { ...entity, endTick: 100 } }],
    program,
  );
  expect(r.events.some((e) => e.type === 'command.rejected')).toBe(true);
  expect(r.state.entities.map((e) => e.spec.id)).toEqual(['a']);
});
it('event overflow is explicit and faulting perception is disposed after three faults', async () => {
  const s = await Session.create({
    ...map,
    notes: Array.from({ length: 2100 }, (_, i) => ({
      ...map.notes[0],
      id: `n${i}`,
      beat: { n: 60 + i, d: 60 },
      leadMs: 0,
    })),
  });
  let disposed = 0;
  s.attachSink(
    { role: 'observer' },
    {
      id: 'bad',
      frame() {
        throw new Error('failed consumer');
      },
      dispose() {
        disposed++;
      },
    },
  );
  for (let i = 0; i < 3; i++) s.advance(800);
  expect(disposed).toBe(1);
  const events = s.eventsSince({ role: 'admin' }, 0, 4096);
  expect(events.overflow).toBe(true);
  expect(events.events.length).toBe(4096);
  expect(events.nextSeq).toBe(s.snapshot().eventSeq);
});
it('a thousand repeated pure transitions have one canonical result without host clock or randomness', () => {
  const program = compile(map).program,
    state = initialState(program, [standardActor()]);
  const expected = canonical(transition(state, [], program));
  const random = Math.random,
    now = Date.now;
  try {
    Math.random = () => {
      throw new Error('random');
    };
    Date.now = () => {
      throw new Error('clock');
    };
    for (let i = 0; i < 1000; i++) expect(canonical(transition(state, [], program))).toBe(expected);
  } finally {
    Math.random = random;
    Date.now = now;
  }
});
it('administrative retries cannot reset a progressed session twice', async () => {
  const service = new EngineService();
  await service.dispatch({ op: 'session.create', sessionId: 's', args: { map } });
  const reset = { op: 'session.reset' as const, sessionId: 's', requestId: 'reset' };
  const first = await service.dispatch(reset);
  await service.dispatch({
    op: 'clock.advance',
    sessionId: 's',
    requestId: 'advance',
    args: { ticks: 10 },
  });
  expect(await service.dispatch(reset)).toEqual(first);
  expect(
    ((await service.dispatch({ op: 'observe', sessionId: 's' })) as { tick: number }).tick,
  ).toBe(10);
  service.close();
});
