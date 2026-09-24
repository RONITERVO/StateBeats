import { describe, expect, it } from 'vitest';
import { add, positionAt, rotate } from '@statebeats/core';
import {
  Session,
  standardActor,
  scriptedCommands,
  compile,
  createNotePresenter,
  notePresentationSchema,
  describeObservation,
  presentationIdentity,
} from '@statebeats/sdk';
import type { MapInput, Observation } from '@statebeats/sdk';
import { eventHorizonMaster } from '@statebeats/content';
import { createPathGuide } from '../packages/player/src/target-guide.js';
import { createAppearance } from '../packages/player/src/appearances.js';
import * as THREE from 'three';

const map = (): MapInput => ({
  version: 1,
  id: 'presentation',
  title: 'Presentation',
  tickRate: 120,
  durationBeats: 12,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [
    {
      id: 'rail',
      beat: 4,
      preset: 'hold',
      position: [0, 1, -0.4],
      leadMs: 1800,
      earlyMs: 0,
      lateMs: 100,
      holdMs: 1400,
      durationBeats: 4,
      slots: [{ semantic: 'left' }],
      anchor: 'player',
      motion: [
        { beat: 0.4, position: [0, 1, -8] },
        { beat: 4, position: [0, 1, -0.4] },
        { beat: 5, position: [-0.7, 1.7, -0.4] },
        { beat: 6, position: [0, 1.2, -0.4] },
        { beat: 7, position: [0.7, 0.7, -0.4] },
        { beat: 8, position: [0, 1, -0.4] },
      ],
      presentation: { ahead: { beats: 0.75 }, behind: { beats: 0.5 }, releaseMs: 400 },
    },
  ],
});
const admin = { role: 'admin' } as const;
const player = { role: 'player', actorId: 'player' } as const;
const cue = (view: Observation) => view.entities[0].presentation!;

describe('shared note presentation', () => {
  it('does not reveal before spawn and carries only a bounded arc alongside an approaching head', async () => {
    const session = await Session.create(map(), [standardActor()]);
    session.advance(23);
    expect(session.observe(player).entities).toEqual([]);
    session.advance(1);
    expect(cue(session.observe(player)).path).toEqual([]);
    session.advance(24);
    const view = session.observe(player),
      frame = cue(view);
    expect(frame.arrival).toBe('approach');
    expect(frame.phase).toBe('approaching');
    expect(frame.path[0].tick).toBe(24);
    expect(frame.path.at(-1)!.tick).toBe(93);
    expect(frame.path.some((p) => p.tick === view.tick && p.strength === 1)).toBe(true);
    expect(frame.path.every((p) => p.position[2] < -5)).toBe(true);
    expect(view.entities[0].contactPath).toEqual([]);
    // Authoring tools keep explicit full-route access; the reference renderer uses presentation.path.
    expect(session.observe(admin).entities[0].contactPath!.at(-1)!.tick).toBe(480);
    expect(describeObservation(view).targets[0].presentation).toEqual(frame);
  });
  it('keeps the head and every corner on the authoritative transformed trajectory across arrival', async () => {
    const session = await Session.create(map(), [standardActor()]);
    session.submit(admin, 'calibrate', [
      {
        id: 'calibrate',
        type: 'calibrate',
        tick: 1,
        actorId: 'player',
        position: [2, 0.2, 3],
        orientation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      },
    ]);
    session.advance(225);
    for (let i = 0; i < 96; i++) {
      session.advance(1);
      const live = session.snapshot().entities[0];
      const frame = cue(session.observe(player));
      for (const p of frame.path) {
        expect(p.position).toEqual(
          add(
            rotate(positionAt(live.spec, p.tick), live.transform.orientation),
            live.transform.position,
          ),
        );
      }
      expect(frame.path.find((p) => p.tick === session.tick)!.position).toEqual(live.position);
      const start = frame.path[0].tick,
        end = frame.path.at(-1)!.tick;
      for (const key of live.spec.motion.filter((k) => k.tick >= start && k.tick <= end))
        expect(frame.path.some((p) => p.tick === key.tick)).toBe(true);
      expect(frame.path[0].strength).toBe(0);
      expect(frame.path.at(-1)!.strength).toBe(0);
    }
  });
  it('measures beat windows across tempo changes rather than using one fixed BPM', async () => {
    const input = map();
    input.tempo!.push({ beat: 5, bpm: 240 });
    input.notes[0].holdMs = 1000;
    const session = await Session.create(input);
    session.advance(285); // beat 4.75; ahead .75 reaches beat 5.5 at tick 315
    const frame = cue(session.observe(player));
    expect(frame.path[0].tick).toBe(255);
    expect(frame.path.at(-1)!.tick).toBe(315);
  });
  it('finishes emergence before contact, including a zero-lead target, without moving the collider', async () => {
    const input = map();
    input.notes = [
      {
        id: 'mole',
        beat: 2,
        preset: 'left',
        position: [0, 0.15, -0.5],
        leadMs: 0,
        earlyMs: 0,
        presentation: { presence: 'emerge', appearMs: 2000, guide: 'none' },
      },
    ];
    const session = await Session.create(input);
    session.advance(120);
    const frame = cue(session.observe(player));
    expect(frame.arrival).toBe('materialize');
    expect(frame.appearanceProgress).toBe(1);
    expect(frame.visibility).toBe(1);
    expect(frame.path).toEqual([]);
    expect(session.snapshot().entities[0].position).toEqual([0, 0.15, -0.5]);
  });
  it('resolves independently of observation frequency, restores trails and reproduces scoring', async () => {
    const session = await Session.create(map(), [standardActor()]);
    session.submit(admin, 'dance', scriptedCommands(session.program));
    session.advance(430);
    const view = session.observe(player);
    expect(view.entities).toHaveLength(0);
    expect(view.resolvedEntities).toHaveLength(1);
    expect(view.resolvedEntities![0].progress).toBe(1);
    expect(view.resolvedEntities![0].hold).toBe(view.resolvedEntities![0].holdTicks);
    const frame = view.resolvedEntities![0].presentation!;
    expect(frame.phase).toBe('resolved');
    expect(frame.outcome).toBe('hit');
    expect(frame.path.every((p) => p.tick <= frame.resolveTick!)).toBe(true);
    expect(frame.visibility).toBeGreaterThan(0);
    const restored = await Session.restore(session.client(admin).checkpoint());
    expect(restored.observe(player)).toEqual(view);
    view.resolvedEntities![0].presentation!.path[0].position[0] = 999;
    expect(restored.observe(player)).toEqual(session.observe(player));
    session.advance(60);
    expect(session.observe(player).resolvedEntities).toEqual([]);
    expect(session.snapshot().scores[0].hits).toBe(1);
    expect((await Session.verifyReplay(await session.client(admin).replay())).verified).toBe(true);
  });
  it('keeps missed releases out of active targets and honours zero release duration', async () => {
    const input = map();
    const session = await Session.create(input);
    session.advance(485);
    expect(session.observe(player).entities).toEqual([]);
    expect(session.observe(player).resolvedEntities![0].presentation!.outcome).toBe('missed');
    input.notes[0].presentation!.releaseMs = 0;
    const immediate = await Session.create(input);
    immediate.advance(485);
    expect(immediate.observe(player).resolvedEntities).toEqual([]);
  });
  it('captures a same-tick spawn and hit with its calibrated stage', async () => {
    const input = map();
    input.notes = [
      {
        id: 'instant',
        preset: 'left',
        beat: 1,
        leadMs: 0,
        earlyMs: 0,
        position: [0, 1, -0.4],
        anchor: 'player',
      },
    ];
    const session = await Session.create(input, [standardActor()]);
    session.submit(admin, 'instant', [
      {
        id: 'a',
        tick: 60,
        type: 'calibrate',
        actorId: 'player',
        position: [1, 0, 0],
        orientation: [0, 0, 0, 1],
      },
      {
        id: 'b',
        tick: 60,
        type: 'pose',
        actorId: 'player',
        effectorId: 'left',
        position: [1, 1, -0.4],
      },
    ]);
    session.advance(60);
    expect(session.observe(player).entities).toEqual([]);
    expect(session.observe(player).resolvedEntities![0].position).toEqual([1, 1, -0.4]);
    expect(session.observe(player).resolvedEntities![0].progress).toBe(1);
    const restored = await Session.restore(session.client(admin).checkpoint());
    expect(restored.observe(player)).toEqual(session.observe(player));
  });
  it('binds cue settings to presentation identity without changing the collision program', async () => {
    const a = await Session.create(map());
    const input = map();
    input.notes[0].presentation!.ahead = { ms: 100 };
    const b = await Session.create(input);
    expect(a.program.id).toBe(b.program.id);
    expect(await presentationIdentity(a.map)).not.toBe(await presentationIdentity(b.map));
    const saved = a.client(admin).checkpoint();
    saved.map = b.map;
    await expect(Session.restore(saved)).rejects.toMatchObject({ code: 'PRESENTATION_MISMATCH' });
    delete saved.presentationHash;
    await expect(Session.restore(saved)).rejects.toMatchObject({ code: 'PRESENTATION_MISMATCH' });
    expect(() => notePresentationSchema.parse({ ahead: { ms: -1 } })).toThrow();
    expect(() => notePresentationSchema.parse({ ahead: { beats: 1, ms: 200 } })).toThrow();
  });
  it('uses the captured stage for a director target resolved before its first observation', async () => {
    const input = map();
    input.notes = [
      {
        id: 'directed',
        preset: 'left',
        beat: 1,
        leadMs: 0,
        earlyMs: 0,
        position: [0, 1, -0.4],
        anchor: 'player',
      },
    ];
    const entity = compile(input).program.entities[0];
    input.notes = [];
    const session = await Session.create(input, [standardActor()]);
    session.submit(admin, 'director', [
      {
        id: 'a',
        tick: 60,
        type: 'calibrate',
        actorId: 'player',
        position: [1, 0, 0],
        orientation: [0, 0, 0, 1],
      },
      { id: 'b', tick: 60, type: 'director.spawn', entity },
      {
        id: 'c',
        tick: 60,
        type: 'calibrate',
        actorId: 'player',
        position: [2, 0, 0],
        orientation: [0, 0, 0, 1],
      },
      {
        id: 'd',
        tick: 60,
        type: 'pose',
        actorId: 'player',
        effectorId: 'left',
        position: [1, 1, -0.4],
      },
    ]);
    session.advance(62);
    const released = session.observe(player).resolvedEntities![0];
    expect(released.position).toEqual([1, 1, -0.4]);
    expect(released.presentation!.outcome).toBe('hit');
    expect(released.progress).toBe(1);
    const restored = await Session.restore(session.client(admin).checkpoint());
    expect(restored.observe(player)).toEqual(session.observe(player));
  });
  it('keeps all authored corners even at maximum path density', () => {
    const input = map();
    input.notes[0].motion = Array.from({ length: 256 }, (_, i) => ({
      beat: 4 + i / 60,
      position: [(i % 2) / 100, 1, -0.4],
    }));
    input.notes[0].durationBeats = 5;
    input.notes[0].presentation = { guide: 'full', presence: 'instant' };
    const { program, map: parsed } = compile(input);
    const frame = createNotePresenter(parsed).sample(
      { spec: program.entities[0], transform: { position: [0, 0, 0], orientation: [0, 0, 0, 1] } },
      250,
    );
    expect(frame.path.length).toBeLessThanOrEqual(290);
    for (const key of program.entities[0].motion)
      expect(frame.path.some((p) => p.tick === key.tick)).toBe(true);
  });
  it('zero-beat windows remain empty at half-tick offsets, and zero release is immediate', () => {
    const input = map();
    input.offsetSeconds = 0.0125;
    input.notes[0].presentation = {
      presence: 'instant',
      ahead: { beats: 0 },
      behind: { beats: 0 },
      releaseMs: 0,
    };
    const { map: parsed, program } = compile(input);
    const presenter = createNotePresenter(parsed);
    const entity = {
      spec: program.entities[0],
      transform: {
        position: [0, 0, 0] as [number, number, number],
        orientation: [0, 0, 0, 1] as [number, number, number, number],
      },
    };
    for (let tick = 220; tick < 260; tick++)
      expect(presenter.sample(entity, tick).path).toEqual([]);
    expect(presenter.sample(entity, 260, { tick: 260, outcome: 'hit' }).visibility).toBe(0);
  });
});

it('the reference guide is reusable, bounded, tapered, disposable and stable with reduced motion', async () => {
  const session = await Session.create(map());
  session.advance(310);
  const view = session.observe(player),
    target = view.entities[0];
  const guide = createPathGuide(0x72f4df);
  guide.update(target, view, { reducedMotion: false, highContrast: false });
  const geometry = (guide.object as THREE.Mesh).geometry;
  const vertices = Array.from(geometry.getAttribute('position').array);
  const strengths = geometry.getAttribute('strength');
  expect(geometry.drawRange.count).toBe((target.presentation!.path.length - 1) * 36);
  expect(strengths.getX(0)).toBe(0);
  expect(Math.max(...Array.from(strengths.array))).toBe(1);
  guide.update(target, view, { reducedMotion: true, highContrast: false });
  expect(Array.from(geometry.getAttribute('position').array)).toEqual(vertices);
  let disposed = false;
  geometry.addEventListener('dispose', () => {
    disposed = true;
  });
  guide.dispose();
  expect(disposed).toBe(true);
});

it('Event Horizon uses travelling beat windows and a distinct stationary emergence', () => {
  const { map: input, program } = compile(eventHorizonMaster());
  const holds = input.notes.filter((n) => n.preset === 'hold');
  expect(holds.length).toBeGreaterThan(0);
  expect(holds.every((n) => n.presentation?.guide === 'window')).toBe(true);
  expect(holds.some((n) => n.presentation?.presence === 'emerge')).toBe(true);
  expect(
    program.entities.filter((e) => e.kind === 'hold').every((e) => e.motion.length >= 65),
  ).toBe(true);
  const target = {
    appearance: 'statebeats/prism',
    shape: { kind: 'sphere', radius: 0.1 },
  } as Observation['entities'][number];
  const appearance = createAppearance(target, 0xffffff)!;
  expect(appearance.handlesPresence).toBe(true);
  expect(appearance.guide).toBeTruthy();
  if (appearance.guide) appearance.guide.dispose();
  appearance.dispose();
});
