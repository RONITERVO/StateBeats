import { describe, it, expect } from 'vitest';
import {
  Session,
  canonical,
  standardActor,
  compile,
  beatToTick,
  generateMap,
} from '@statebeats/sdk';
import type { MapInput } from '@statebeats/sdk';
const input: MapInput = {
  version: 1,
  id: 'session',
  title: 'Session',
  durationBeats: 4,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [{ id: 'note', beat: 2, position: [0, 1, -1], preset: 'left', earlyMs: 0, lateMs: 0 }],
};
const commands = [
  {
    id: 'ready',
    tick: 1,
    type: 'pose',
    actorId: 'player',
    effectorId: 'left',
    position: [0, 1, 0],
  },
  {
    id: 'hit',
    tick: 120,
    type: 'pose',
    actorId: 'player',
    effectorId: 'left',
    position: [0, 1, -1],
  },
];
describe('session checkpoints, retries and permissions', () => {
  it('clock retries are idempotent even after a full session restore', async () => {
    const s = await Session.create(input, [standardActor()]),
      admin = s.client({ role: 'admin' });
    const first = admin.advanceOnce('step', 30);
    expect(admin.advanceOnce('step', 30)).toEqual(first);
    expect(s.tick).toBe(30);
    const restored = await Session.restore(admin.checkpoint());
    expect(restored.client({ role: 'admin' }).advanceOnce('step', 30)).toEqual(first);
    expect(restored.tick).toBe(30);
    expect(() => admin.advanceOnce('step', 31)).toThrow();
  });
  it('restores queued future inputs and retry results exactly', async () => {
    const original = await Session.create(input, [standardActor()]),
      admin = original.client({ role: 'admin' });
    const accepted = admin.submit('schedule', commands);
    admin.advance(40);
    const checkpoint = admin.checkpoint();
    const restored = await Session.restore(checkpoint),
      restoredAdmin = restored.client({ role: 'admin' });
    expect(restoredAdmin.submit('schedule', commands)).toEqual(accepted);
    original.advance(140);
    restored.advance(140);
    expect(canonical(restored.snapshot())).toBe(canonical(original.snapshot()));
    expect(restored.snapshot().scores[0].hits).toBe(1);
    expect(await restoredAdmin.replay()).toEqual(await admin.replay());
  });
  it('replaying verifies and tampering fails', async () => {
    const s = await Session.create(input, [standardActor()]),
      admin = s.client({ role: 'admin' });
    admin.submit('s', commands);
    admin.advance(180);
    const replay = await admin.replay();
    expect((await Session.verifyReplay(replay)).verified).toBe(true);
    replay.timeline[0].commands[1] = {
      ...replay.timeline[0].commands[1],
      position: [9, 9, 9],
    } as (typeof replay.timeline)[0]['commands'][number];
    await expect(Session.verifyReplay(replay)).rejects.toMatchObject({ code: 'REPLAY_DIVERGED' });
  });
  it('atomic validation and retry conflict leave authoritative state unchanged', async () => {
    const s = await Session.create(input, [standardActor()]),
      admin = s.client({ role: 'admin' });
    expect(() =>
      admin.submit('bad', [commands[0], { ...commands[1], position: [NaN, 0, 0] }]),
    ).toThrow();
    expect(admin.checkpoint().pending).toHaveLength(0);
    admin.submit('ok', commands);
    const before = canonical(admin.checkpoint());
    expect(() => admin.submit('ok', [commands[0]])).toThrow();
    expect(canonical(admin.checkpoint())).toBe(before);
    expect(() => admin.submit('other', commands)).toThrow();
  });
  it('player cannot drive another actor, advance time, inspect checkpoint or submit director commands', async () => {
    const s = await Session.create(input, [standardActor(), standardActor('partner')]),
      player = s.client({ role: 'player', actorId: 'player' });
    expect(() => player.submit('wrong', [{ ...commands[0], actorId: 'partner' }])).toThrow();
    expect(() => player.advance(1)).toThrow();
    expect(() => player.checkpoint()).toThrow();
    expect(player.observe().actors.map((a) => a.id)).toEqual(['player']);
    expect('rng' in player.observe()).toBe(false);
  });
  it('bulk and individual steps emit the same events and state', async () => {
    const a = await Session.create(input, [standardActor()]),
      b = await Session.create(input, [standardActor()]);
    a.client({ role: 'admin' }).submit('s', commands);
    b.client({ role: 'admin' }).submit('s', commands);
    const events = a.advance(180),
      single = [];
    for (let i = 0; i < 180; i++) single.push(...b.advance(1));
    expect(single).toEqual(events);
    expect(b.snapshot()).toEqual(a.snapshot());
  });
  it('sessions are isolated and disposal is idempotent', async () => {
    const a = await Session.create(input, [standardActor()]),
      b = await Session.create(input, [standardActor()]);
    a.advance(20);
    expect(b.tick).toBe(0);
    a.close();
    a.close();
    expect(() => a.advance(1)).toThrow();
  });
  it('tampered pending continuation is rejected', async () => {
    const s = await Session.create(input, [standardActor()]),
      admin = s.client({ role: 'admin' });
    admin.submit('s', commands);
    const cp = admin.checkpoint();
    cp.pending = [];
    await expect(Session.restore(cp)).rejects.toMatchObject({ code: 'CHECKPOINT_INVALID' });
  });
});
describe('native map compiler', () => {
  it('integrates tempo changes rather than applying a single BPM', () => {
    const map = compile({
      ...input,
      tempo: [
        { beat: 0, bpm: 120 },
        { beat: 4, bpm: 60, meter: [3, 4] },
      ],
    }).map;
    expect(beatToTick(4, map)).toBe(240);
    expect(beatToTick(6, map)).toBe(480);
    expect(beatToTick({ n: 1, d: 3 }, map)).toBe(20);
  });
  it('uses half-even tick rounding on exact beat fractions', () => {
    const map = compile(input).map;
    expect(beatToTick({ n: 1, d: 120 }, map)).toBe(0);
    expect(beatToTick({ n: 3, d: 120 }, map)).toBe(2);
  });
  it('generates reproducibly and validates duplicate IDs and unknown policies', () => {
    expect(generateMap({ seed: 101 })).toEqual(generateMap({ seed: 101 }));
    expect(generateMap({ seed: 101 })).not.toEqual(generateMap({ seed: 102 }));
    expect(() => compile({ ...input, notes: [...input.notes, ...input.notes] })).toThrow();
    expect(() =>
      compile({ ...input, notes: [{ ...input.notes[0], policy: 'evil/code' }] }),
    ).toThrow();
  });
  it('0 and 360 author to identical positions', () => {
    const a = compile({
      ...input,
      notes: [{ ...input.notes[0], position: { azimuth: 0, elevation: 0, radius: 1 } }],
    }).program;
    const b = compile({
      ...input,
      notes: [{ ...input.notes[0], position: { azimuth: 360, elevation: 0, radius: 1 } }],
    }).program;
    expect(a.entities[0].position).toEqual(b.entities[0].position);
  });
});
