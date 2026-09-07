import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  pointSegmentSq,
  segmentBoxSq,
  segmentSegmentSq,
  sweepOverlap,
  rotate,
  quaternion,
} from '@statebeats/core';
describe('continuous geometry with independently derived expectations', () => {
  it('detects a crossing whose endpoints both miss the sphere', () => {
    expect(sweepOverlap([-3, 1, 0], [3, 1, 0], 0, { kind: 'sphere', radius: 2 })).toBe(true);
    expect(sweepOverlap([-3, 2.01, 0], [3, 2.01, 0], 0, { kind: 'sphere', radius: 2 })).toBe(false);
    expect(sweepOverlap([-3, 2, 0], [3, 2, 0], 0, { kind: 'sphere', radius: 2 })).toBe(true);
  });
  it('finds exact box corner distance, rejecting inflated-AABB false positives', () => {
    expect(segmentBoxSq([2, 2, 0], [2, 2, 0], [1, 1, 1])).toBe(2);
    expect(sweepOverlap([2, 2, 0], [2, 2, 0], 1, { kind: 'box', half: [1, 1, 1] })).toBe(false);
    expect(segmentBoxSq([-3, 2, 0], [3, 2, 0], [1, 1, 1])).toBe(1);
    expect(sweepOverlap([-3, 2, 0], [3, 2, 0], 1, { kind: 'box', half: [1, 1, 1] })).toBe(true);
  });
  it('handles capsules and zero-length/parallel segments', () => {
    expect(segmentSegmentSq([-1, 0, 0], [1, 0, 0], [0, -1, 0], [0, 1, 0])).toBe(0);
    expect(segmentSegmentSq([0, 2, 0], [2, 2, 0], [0, 0, 0], [2, 0, 0])).toBe(4);
    expect(segmentSegmentSq([0, 2, 0], [0, 2, 0], [0, 0, 0], [2, 0, 0])).toBe(4);
    expect(
      sweepOverlap([-3, 0, 0], [3, 0, 0], 0.1, {
        kind: 'capsule',
        a: [0, -1, 0],
        b: [0, 1, 0],
        radius: 0.2,
      }),
    ).toBe(true);
  });
  it('rotates an oriented box with the same physical result', () => {
    const q = quaternion([0, Math.sin(Math.PI / 8), 0, Math.cos(Math.PI / 8)]);
    expect(
      sweepOverlap(rotate([-4, 0, 0], q), rotate([4, 0, 0], q), 0.1, {
        kind: 'box',
        half: [0.5, 1, 2],
        rotation: q,
      }),
    ).toBe(true);
  });
  it('segment distance is symmetric and never exceeds endpoint distance', () => {
    const vec = fc.tuple(
      fc.double({ min: -20, max: 20, noNaN: true }),
      fc.double({ min: -20, max: 20, noNaN: true }),
      fc.double({ min: -20, max: 20, noNaN: true }),
    );
    fc.assert(
      fc.property(vec, vec, vec, (p, a, b) => {
        const ab = pointSegmentSq(p, a, b),
          ba = pointSegmentSq(p, b, a);
        expect(ab).toBeCloseTo(ba, 7);
        expect(ab).toBeLessThanOrEqual(pointSegmentSq(p, a, a) + 1e-7);
      }),
      { numRuns: 300, seed: 3001 },
    );
  });
});
