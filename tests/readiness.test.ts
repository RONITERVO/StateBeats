import { expect, it } from 'vitest';
import {
  Session,
  compile,
  createNotePresenter,
  describeObservation,
  scriptedCommands,
  standardActor,
  presentationIdentity,
} from '@statebeats/sdk';
import type { MapInput } from '@statebeats/sdk';
import { eventHorizonMaster } from '@statebeats/content';

const admin = { role: 'admin' } as const;
const input = (): MapInput => ({
  version: 1,
  id: 'readiness',
  title: 'Readiness',
  durationBeats: 10,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [
    {
      id: 'hold',
      preset: 'hold',
      beat: 6,
      earlyMs: 0,
      leadMs: 2400,
      holdMs: 500,
      durationBeats: 1,
      slots: [{ semantic: 'left' }],
      position: [0, 1, -0.5],
      motion: [
        { beat: 6, position: [0, 1, -0.5] },
        { beat: 7, position: [0.4, 1.4, -0.5] },
      ],
      presentation: { appearMs: 160, readiness: { preview: { beats: 2 }, prepare: { beats: 1 } } },
    },
  ],
});
const presenterFor = (source: MapInput) => {
  const { program, map } = compile(source);
  const entity = {
    spec: program.entities[0],
    transform: {
      position: [0, 0, 0] as [number, number, number],
      orientation: [0, 0, 0, 1] as [number, number, number, number],
    },
  };
  return {
    spec: entity.spec,
    sample: (tick: number) => createNotePresenter(map).sample(entity, tick),
  };
};

it('stages stationary targets by contact time and keeps hidden/waiting guides and descriptions quiet', async () => {
  const { sample, spec } = presenterFor(input());
  expect(spec.spawnTick).toBe(72);
  expect(sample(239)).toMatchObject({
    phase: 'hidden',
    visibility: 0,
    path: [],
    readiness: { previewTick: 240, prepareTick: 300, phase: 'hidden', progress: 0 },
  });
  expect(sample(260)).toMatchObject({
    phase: 'waiting',
    visibility: 1,
    path: [],
    readiness: { phase: 'waiting', progress: 0 },
  });
  const preparing = sample(330);
  expect(preparing.readiness).toMatchObject({ phase: 'preparing', progress: 0.5 });
  expect(Math.max(...preparing.path.map((p) => p.strength))).toBe(0.5);
  expect(sample(360)).toMatchObject({ readiness: { phase: 'ready', progress: 1 }, visibility: 1 });
  const session = await Session.create(input());
  session.advance(239);
  expect(session.observe(admin).entities).toHaveLength(1); // Authoritative existence is unchanged.
  expect(describeObservation(session.observe(admin)).targets).toEqual([]);
  session.advance(21);
  expect(describeObservation(session.observe(admin)).targets[0].text).toContain('Upcoming hold');
  session.advance(70);
  expect(describeObservation(session.observe(admin)).targets[0].text).toContain('Prepare to hold');
  session.advance(30);
  expect(describeObservation(session.observe(admin)).targets[0].text).toMatch(/^Hold /);
});

it('integrates readiness beat windows across tempo changes and clamps preparation inside the preview', () => {
  const source = input();
  source.tempo!.push({ beat: 5, bpm: 240 });
  source.notes[0].holdMs = 250;
  expect(presenterFor(source).sample(315)).toMatchObject({
    readyTick: 330,
    readiness: { previewTick: 240, prepareTick: 300, progress: 0.5 },
  });
  source.notes[0].presentation!.readiness = { preview: { ms: 100 }, prepare: { beats: 8 } };
  expect(presenterFor(source).sample(324)).toMatchObject({
    readiness: { previewTick: 318, prepareTick: 318, progress: 0.5 },
  });
});

it.each(['left', 'hold', 'hazard'] as const)(
  'zero preview/lead never hides an eligible %s target',
  (preset) => {
    const source = input();
    source.notes[0].preset = preset;
    source.notes[0].leadMs = 0;
    source.notes[0].presentation = {
      appearMs: 2000,
      readiness: { preview: { beats: 0 }, prepare: { ms: 0 } },
    };
    const { spec, sample } = presenterFor(source);
    expect(sample(spec.spawnTick)).toMatchObject({
      visibility: 1,
      appearanceProgress: 1,
      readyTick: spec.spawnTick,
      readiness: { phase: 'ready', progress: 1 },
    });
  },
);

it('strike readiness starts at the first eligible early-window tick, independent of movement', async () => {
  const source = input();
  source.notes[0].preset = 'left';
  source.notes[0].earlyMs = 200;
  const session = await Session.create(source, [standardActor()]);
  session.submit(admin, 'hand', [
    {
      id: 'hand',
      type: 'pose',
      tick: 1,
      actorId: 'player',
      effectorId: 'left',
      position: [0, 1, -0.5],
    },
  ]);
  session.advance(335);
  expect(session.observe(admin).entities[0].presentation!.readiness!.progress).toBeLessThan(1);
  expect(session.snapshot().scores[0].hits).toBe(0);
  session.advance(1);
  expect(session.snapshot().scores[0].hits).toBe(1);
  expect(session.observe(admin).resolvedEntities![0].presentation).toMatchObject({
    readyTick: 336,
    readiness: { phase: 'resolved', progress: 1 },
  });
});

it('readiness restores exactly and changes only presentation identity, not gameplay or recorded results', async () => {
  const source = input(),
    legacy = input();
  delete legacy.notes[0].presentation!.readiness;
  const a = await Session.create(source, [standardActor()]),
    b = await Session.create(legacy, [standardActor()]);
  expect(a.program.id).toBe(b.program.id);
  expect(await presentationIdentity(a.map)).not.toBe(await presentationIdentity(b.map));
  const commands = scriptedCommands(a.program);
  a.submit(admin, 'play', commands);
  b.submit(admin, 'play', commands);
  a.advance(330);
  b.advance(330);
  const view = a.observe(admin);
  const restored = await Session.restore(a.checkpoint(admin));
  expect(restored.observe(admin)).toEqual(view);
  expect(a.observe(admin)).toEqual(view);
  a.advance(270);
  b.advance(270);
  restored.advance(270);
  expect(a.snapshot()).toEqual(b.snapshot());
  expect(restored.snapshot()).toEqual(a.snapshot());
  const replay = await a.exportReplay(admin);
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  expect((await b.exportReplay(admin)).finalStateHash).toBe(replay.finalStateHash);
  delete replay.map.notes[0].presentation!.readiness;
  await expect(Session.verifyReplay(replay)).rejects.toMatchObject({
    code: 'PRESENTATION_MISMATCH',
  });
});

it('Event Horizon opts only its stationary holds into readiness without changing their compiled program', async () => {
  const map = eventHorizonMaster();
  const staged = map.notes.filter((n) => n.presentation?.readiness);
  expect(staged.length).toBeGreaterThan(0);
  expect(staged.every((n) => n.preset === 'hold' && !n.emission && n.leadMs === 2400)).toBe(true);
  const older = structuredClone(map);
  for (const n of older.notes) if (n.presentation) delete n.presentation.readiness;
  expect((await Session.create(map)).program.id).toBe((await Session.create(older)).program.id);
});
