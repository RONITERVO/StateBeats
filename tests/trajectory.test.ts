import { expect, it } from 'vitest';
import fc from 'fast-check';
import { lerp, positionAt } from '@statebeats/core';
import type { EntitySpec, Vec3 } from '@statebeats/core';
import { compile, createNotePresenter } from '@statebeats/sdk';

type Trajectory = Pick<EntitySpec, 'position' | 'motion'>;
// Recording compatibility oracle: the original sequential interpolation, including exact knots.
function sequentialPositionAt(entity: Trajectory, tick: number): Vec3 {
  if (entity.motion.length === 0) return [...entity.position];
  if (tick <= entity.motion[0].tick) return [...entity.motion[0].position];
  for (let i = 1; i < entity.motion.length; i++) {
    const a = entity.motion[i - 1],
      b = entity.motion[i];
    if (tick <= b.tick) return lerp(a.position, b.position, (tick - a.tick) / (b.tick - a.tick));
  }
  return [...entity.motion.at(-1)!.position];
}

it('trajectory lookup preserves exact sequential results at and between keys in any query order', () => {
  const coordinate = fc.double({ min: -10000, max: 10000, noNaN: true });
  const vector = fc.tuple(coordinate, coordinate, coordinate);
  fc.assert(
    fc.property(
      vector,
      fc.array(fc.record({ gap: fc.integer({ min: 1, max: 1000 }), position: vector }), {
        maxLength: 256,
      }),
      (position, keys) => {
        let end = 0;
        const trajectory: Trajectory = {
          position,
          motion: keys.map((key) => ({ tick: (end += key.gap), position: key.position })),
        };
        const queries = [
          -1,
          0,
          end + 1,
          ...trajectory.motion.flatMap((key, i) => [
            key.tick,
            key.tick - 0.5,
            ((trajectory.motion[i - 1]?.tick ?? 0) + key.tick) / 2,
          ]),
        ];
        for (const tick of queries.reverse())
          expect(positionAt(trajectory, tick)).toEqual(sequentialPositionAt(trajectory, tick));
      },
    ),
    { numRuns: 100, seed: 240924 },
  );
});

it('dense presentation sampling keeps bounded key reads while preserving all authored corners', () => {
  const { program, map } = compile({
    version: 1,
    id: 'dense-trajectory',
    title: 'Dense trajectory',
    durationBeats: 256,
    tempo: [{ beat: 0, bpm: 120 }],
    notes: [
      {
        id: 'rail',
        preset: 'hold',
        beat: 1,
        durationBeats: 255,
        holdMs: 100,
        slots: [{ semantic: 'left' }],
        position: [0, 1, -1],
        leadMs: 0,
        motion: Array.from({ length: 256 }, (_, i) => ({
          beat: i + 1,
          position: [i % 2, 1, -1] as Vec3,
        })),
        presentation: { guide: 'full', presence: 'instant' },
      },
    ],
  });
  const spec = program.entities[0];
  let reads = 0;
  const instrumented = {
    ...spec,
    motion: spec.motion.map((key) => ({
      get tick() {
        reads++;
        return key.tick;
      },
      position: key.position,
    })),
  };
  const result = createNotePresenter(map).sample(
    {
      spec: instrumented,
      transform: { position: [0, 0, 0], orientation: [0, 0, 0, 1] },
    },
    spec.hitTick + 31,
  );
  expect(result.path.length).toBeGreaterThanOrEqual(256);
  expect(result.path.length).toBeLessThanOrEqual(290);
  // A deterministic complexity guard, independent of CI machine speed (linear scans exceed 37,000).
  expect(reads).toBeLessThan(6000);
  for (const key of spec.motion) expect(result.path.some((p) => p.tick === key.tick)).toBe(true);
  for (const point of result.path)
    expect(point.position).toEqual(sequentialPositionAt(spec, point.tick));
});
