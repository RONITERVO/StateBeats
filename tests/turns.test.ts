import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { rotate } from '@statebeats/core';
import {
  planTurns,
  createFacingSampler,
  inspectTurns,
  validateTurnTrack,
  facePoint,
  faceShape,
  compile,
  generateChoreography,
  inspectChoreography,
  SILENT_FEATURES,
  EngineService,
} from '@statebeats/sdk';
import type { TurnCueInput, MusicTimeline } from '@statebeats/sdk';

const cue = (id: number, direction?: 'left' | 'right'): TurnCueInput => ({
  id: `c${id}`,
  beat: id * 4,
  endBeat: id * 4 + 2,
  gesture: 'sweep',
  direction,
  reason: 'Test movement phrase',
});
const source = (): MusicTimeline => ({
  version: 1,
  tickRate: 120,
  algorithm: 'test/music',
  frames: Array.from({ length: 901 }, (_, i) => ({
    tick: i * 6,
    features: { ...SILENT_FEATURES, rms: 0.6, energy: i < 450 ? 0.4 : 0.8, transient: 0.7 },
  })),
});

describe('portable musical turn planning', () => {
  it('carries explicit gestures, answers them, and settles without forcing alternate directions', () => {
    const cues = [
      cue(0, 'right'),
      { ...cue(1), gesture: 'continue' as const },
      cue(2),
      cue(3),
      { ...cue(4), gesture: 'answer' as const },
      { ...cue(5), gesture: 'settle' as const },
    ];
    const before = structuredClone(cues);
    const result = planTurns(cues, { degrees: 30, maxSpeed: 90, maxAcceleration: 240 });
    expect(result.decisions.map((d) => d.angle)).toEqual([30, 30, -30, -30, 30, 0]);
    expect(result.summary.reversals).toBe(2);
    expect(planTurns(cues, { degrees: 30, maxSpeed: 90, maxAcceleration: 240 })).toEqual(result);
    expect(cues).toEqual(before);
    expect(planTurns(cues, { mode: 'forward' }).track.events).toEqual([]);
  });

  it('arrives exactly on the accent with zero endpoint velocity and acceleration, retaining heading in gaps', () => {
    const plan = planTurns([cue(1, 'right')], { degrees: 30, maxSpeed: 90, maxAcceleration: 240 });
    const at = createFacingSampler(plan.track);
    expect(at(-20)).toBe(0);
    expect(at(4)).toBe(0);
    expect(at(5)).toBeCloseTo(15, 8);
    expect(at(6)).toBe(30);
    expect(at(100)).toBe(30);
    const h = 1e-4;
    for (const b of [4, 6]) {
      expect(Math.abs((at(b + h) - at(b - h)) / (2 * h))).toBeLessThan(1e-4);
      expect(Math.abs((at(b + h) - 2 * at(b) + at(b - h)) / h ** 2)).toBeLessThan(0.02);
    }
    plan.track.events[0].angle = -30;
    expect(at(6)).toBe(30); // Snapshot semantics; editing a plan cannot alter a running sampler.
    expect(() => at(NaN)).toThrow('finite');
  });

  it('enforces analytic speed, acceleration, heading range and sustained directional budgets across tempos', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 40, max: 240 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 10000 }),
        (bpm, duration, seed) => {
          const cues = Array.from({ length: 12 }, (_, i) => ({
            ...cue(i, i < 8 ? 'right' : 'left'),
            beat: i * duration,
            endBeat: (i + 1) * duration,
          }));
          const plan = planTurns(cues, {
            bpm,
            seed,
            mode: 'bounded',
            degrees: 180,
            maxSpeed: 57,
            maxAcceleration: 123,
            maxDirectionalTravel: 80,
          });
          expect(plan.summary.peakSpeed).toBeLessThanOrEqual(57.000001);
          expect(plan.summary.peakAcceleration).toBeLessThanOrEqual(123.000001);
          expect(plan.summary.longestDirectionalTravel).toBeLessThanOrEqual(80.000001);
          const at = createFacingSampler(plan.track);
          for (let b = 0; b <= 12 * duration; b += 0.25)
            expect(Math.abs(at(b))).toBeLessThanOrEqual(60.000001);
        },
      ),
      { numRuns: 32 },
    );
    const short = planTurns([{ ...cue(0, 'right'), endBeat: 0.5 }], {
      degrees: 120,
      maxSpeed: 120,
      maxAcceleration: 40,
    });
    expect(short.summary.peakAcceleration).toBeLessThanOrEqual(40);
    expect(short.decisions[0].reason).toContain('motion budget');
  });

  it('rejects malformed tracks and untrusted planner output instead of silently changing its timing', () => {
    for (const cues of [
      [cue(1), cue(0)],
      [cue(0), cue(0)],
      [{ ...cue(0), endBeat: 0 }],
      [{ ...cue(0), beat: NaN }],
    ])
      expect(() => planTurns(cues)).toThrow();
    expect(() =>
      planTurns(
        [cue(0)],
        {},
        { id: 'test/bad', plan: () => [{ cueId: 'c0', angle: 180, reason: 'too fast' }] },
      ),
    ).toThrow('budget');
    expect(() => planTurns([cue(0)], {}, { id: 'test/bad', plan: () => [] })).toThrow(
      'one decision',
    );
    const track = planTurns([cue(0, 'right')]).track;
    expect(() =>
      validateTurnTrack({ ...track, events: [...track.events, ...track.events] }),
    ).toThrow();
    expect(() =>
      compile({
        version: 1,
        id: 'bad-track',
        title: 'Bad',
        tempo: [{ beat: 0, bpm: 120 }],
        durationBeats: 1,
        notes: [],
        turns: track,
      }),
    ).toThrow('compilation');
    expect(() => inspectTurns(track, NaN)).toThrow();
  });

  it('rotates contact points and collision shapes in the same convention without moving floor height', () => {
    expect(facePoint([0, 1.5, -1], 90)).toEqual([1, 1.5, 0]);
    const original = {
      kind: 'box' as const,
      half: [0.7, 0.1, 0.3] as [number, number, number],
      rotation: [Math.sin(0.2), 0, 0, Math.cos(0.2)] as [number, number, number, number],
    };
    const turned = faceShape(original, 75);
    if (turned.kind !== 'box') throw new Error('Wrong shape');
    const a = rotate([0.7, 0.1, 0.3], turned.rotation!);
    const b = facePoint(rotate([0.7, 0.1, 0.3], original.rotation), 75);
    for (let i = 0; i < 3; i++) expect(a[i]).toBeCloseTo(b[i], 5);
  });

  it('bakes note and rail facing into normal maps, preserving musical timing and calibrated reach', () => {
    const options = {
      bpm: 137,
      seed: 7,
      turnStyle: 'musical' as const,
      difficulty: 'master' as const,
      reach: 1,
      maxHandSpeed: 6,
      turnDegrees: 70,
      maxTurnSpeed: 65,
      movementRange: 'wide' as const,
    };
    const before = source();
    const flat = generateChoreography(before, { ...options, turnMode: 'forward' });
    const result = generateChoreography(before, { ...options, turnMode: 'full' });
    expect(result).toEqual(generateChoreography(source(), { ...options, turnMode: 'full' }));
    expect(result.report.turns!.summary.events).toBeGreaterThan(5);
    expect(result.report.turns!.summary.reversals).toBeGreaterThan(0);
    expect(inspectChoreography(result.map, options).issues).toEqual([]);
    const at = createFacingSampler(result.map.turns);
    for (const note of result.map.notes) {
      const local = flat.map.notes.find((n) => n.id === note.id)!;
      expect(note.beat).toEqual(local.beat);
      expect(note.emission).toEqual(local.emission);
      expect(note.position).toEqual(
        facePoint(local.position as [number, number, number], at(Number(note.beat))),
      );
      for (const [i, key] of note.motion.entries())
        expect(key.position).toEqual(
          facePoint(local.motion[i].position as [number, number, number], at(Number(key.beat))),
        );
    }
    expect(
      result.map.notes.some((n) =>
        result.map.turns!.events.some((t) => Number(n.beat) > t.beat && Number(n.beat) < t.endBeat),
      ),
    ).toBe(true);
    expect(before).toEqual(source());
  });

  it('exposes planning and inspection through the shared service without a session or clock', async () => {
    const service = new EngineService();
    const result = planTurns([cue(0, 'left')], { bpm: 150 });
    expect(
      await service.dispatch(
        { op: 'turns.plan', args: { cues: [cue(0, 'left')], options: { bpm: 150 } } },
        { role: 'observer' },
      ),
    ).toEqual(result);
    expect(
      await service.dispatch({ op: 'turns.inspect', args: { track: result.track, bpm: 150 } }),
    ).toEqual(result.summary);
    expect(await service.dispatch({ op: 'session.list' })).toEqual([]);
    service.close();
  });
});
