import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { Ray, Vector3 } from 'three';
import Ajv2020 from 'ajv/dist/2020.js';
import { Session, compile, mapSchema, textPerception } from '@statebeats/sdk';
import type { MapInput, NoteInput } from '@statebeats/sdk';
import { assistedTargetPoint } from '../packages/player/src/desktop-input.js';
import { sampleMaps } from '@statebeats/content';

const admin = { role: 'admin' } as const;
const input = (): MapInput => ({
  version: 1,
  id: 'readiness-review',
  title: 'Readiness review',
  tempo: [{ beat: 0, bpm: 120 }],
  durationBeats: 8,
  notes: [
    {
      id: 'target',
      preset: 'hold',
      beat: 5.5,
      earlyMs: 0,
      leadMs: 2000,
      holdMs: 200,
      position: [0, 1.4, -0.4],
      presentation: { readiness: { preview: { ms: 500 }, prepare: { ms: 100 } } },
    },
  ],
});

it('announces waiting, preparation and eligibility within one second without repeating stable frames', async () => {
  const session = await Session.create(input());
  const messages: string[] = [];
  const sink = textPerception((text) => messages.push(text));
  // All phases fall in second 2: preview at 270, prepare at 318, ready at 330.
  for (const tick of [270, 271, 318, 319, 330, 331]) {
    session.advance(tick - session.tick);
    sink.frame!(session.observe(admin));
    sink.frame!(session.observe(admin));
  }
  expect(messages).toHaveLength(3);
  expect(messages[0]).toContain('Upcoming hold');
  expect(messages[1]).toContain('Prepare to hold');
  expect(messages[2]).toContain('\nHold');
  session.close();
});

it.each<NonNullable<NoteInput['shape']>>([
  { kind: 'sphere', radius: 0.08 },
  { kind: 'box', half: [0.08, 0.08, 0.08] },
  { kind: 'capsule', a: [0, -0.1, 0], b: [0, 0.1, 0], radius: 0.08 },
])(
  'desktop assistance cannot locate a hidden $kind target but resumes at preview',
  async (shape) => {
    const source = input();
    source.notes[0].shape = shape;
    const session = await Session.create(source);
    const ray = new Ray(new Vector3(0, 1.4, 0), new Vector3(0, 0, -1));
    session.advance(269);
    const hidden = session.observe(admin).entities[0];
    expect(hidden.presentation!.readiness!.phase).toBe('hidden');
    expect(assistedTargetPoint(ray, hidden, session.tick)).toBeNull();
    session.advance(1);
    expect(
      assistedTargetPoint(ray, session.observe(admin).entities[0], session.tick),
    ).not.toBeNull();
    // Legacy observations retain assistance without requiring readiness metadata.
    const { presentation: _presentation, ...legacy } = hidden;
    expect(assistedTargetPoint(ray, legacy, 269)).not.toBeNull();
    session.close();
  },
);

const validate = new Ajv2020({ strict: false }).compile(
  JSON.parse(readFileSync(new URL('../schemas/map.schema.json', import.meta.url), 'utf8')),
);
it.each([{}, { preview: { ms: 500 } }, { prepare: { beats: 0.5 } }])(
  'the published authoring schema accepts runtime readiness defaults: %j',
  (readiness) => {
    const source = input();
    source.notes[0].presentation!.readiness = readiness;
    const parsed = mapSchema.parse(source);
    const partial: MapInput = structuredClone(parsed);
    partial.notes[0].presentation!.readiness = readiness;
    expect(validate(partial), JSON.stringify(validate.errors)).toBe(true);
    expect(validate(source), JSON.stringify(validate.errors)).toBe(true);
    expect(parsed.notes[0].presentation!.readiness).toEqual({
      preview: { beats: 2 },
      prepare: { beats: 1 },
      ...readiness,
    });
    expect(validate(parsed), JSON.stringify(validate.errors)).toBe(true);
  },
);
it('the published authoring schema also accepts every bundled map', () => {
  for (const map of sampleMaps)
    expect(validate(map), `${map.id}: ${JSON.stringify(validate.errors)}`).toBe(true);
});
it.each([
  { preview: { ms: -1 } },
  { prepare: { beats: 9 } },
  { preview: { ms: 100, beats: 1 } },
  { surprise: true },
])('both map validators reject invalid readiness: %j', (readiness) => {
  // Start with a valid, normalized map so unrelated default fields cannot hide a regression.
  const source = compile(input()).map;
  Object.assign(source.notes[0].presentation!, { readiness });
  expect(validate(source)).toBe(false);
  expect(mapSchema.safeParse(source).success).toBe(false);
});
