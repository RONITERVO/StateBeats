import type { Quat, Vec3, Shape } from './types.js';
export const EPSILON = 1e-10;
export const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const lengthSq = (a: Vec3): number => dot(a, a);
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => add(a, mul(sub(b, a), t));
export const clamp = (x: number, lo = 0, hi = 1): number => Math.max(lo, Math.min(hi, x));
export const identity = (): Quat => [0, 0, 0, 1];
export function quaternion(q: Quat): Quat {
  const n = Math.sqrt(q.reduce((s, x) => s + x * x, 0));
  if (!Number.isFinite(n) || n < 1e-8 || n > 1e8) throw new Error('Invalid quaternion');
  const sign =
    q[3] < 0 || (q[3] === 0 && (q[2] < 0 || (q[2] === 0 && (q[1] < 0 || (q[1] === 0 && q[0] < 0)))))
      ? -1
      : 1;
  return q.map((x) => (x === 0 ? 0 : (sign * x) / n)) as Quat;
}
export function rotate(v: Vec3, q: Quat): Vec3 {
  const [x, y, z, w] = q;
  const tx = 2 * (y * v[2] - z * v[1]),
    ty = 2 * (z * v[0] - x * v[2]),
    tz = 2 * (x * v[1] - y * v[0]);
  return [
    v[0] + w * tx + y * tz - z * ty,
    v[1] + w * ty + z * tx - x * tz,
    v[2] + w * tz + x * ty - y * tx,
  ];
}
export const inverseRotate = (v: Vec3, q: Quat): Vec3 => rotate(v, [-q[0], -q[1], -q[2], q[3]]);
export function pointSegmentSq(p: Vec3, a: Vec3, b: Vec3): number {
  const d = sub(b, a),
    dd = dot(d, d);
  return lengthSq(sub(p, lerp(a, b, dd === 0 ? 0 : clamp(dot(sub(p, a), d) / dd))));
}
/** Minimum squared distance between two closed segments, including degenerate segments. */
export function segmentSegmentSq(p: Vec3, q: Vec3, a: Vec3, b: Vec3): number {
  const u = sub(q, p),
    v = sub(b, a),
    w = sub(p, a),
    aa = dot(u, u),
    bb = dot(u, v),
    cc = dot(v, v),
    dd = dot(u, w),
    ee = dot(v, w);
  if (aa < EPSILON) return pointSegmentSq(p, a, b);
  if (cc < EPSILON) return pointSegmentSq(a, p, q);
  const den = aa * cc - bb * bb;
  let s = den > EPSILON * aa * cc ? clamp((bb * ee - cc * dd) / den) : 0;
  let t = (bb * s + ee) / cc;
  if (t < 0) {
    t = 0;
    s = clamp(-dd / aa);
  } else if (t > 1) {
    t = 1;
    s = clamp((bb - dd) / aa);
  }
  return lengthSq(sub(lerp(p, q, s), lerp(a, b, t)));
}
/** Exact piecewise-quadratic minimization, not box inflation or temporal sampling. */
export function segmentBoxSq(a: Vec3, b: Vec3, half: Vec3): number {
  const d = sub(b, a),
    cuts = [0, 1];
  for (let k = 0; k < 3; k++)
    if (d[k] !== 0)
      for (const side of [-half[k], half[k]]) {
        const t = (side - a[k]) / d[k];
        if (t > 0 && t < 1) cuts.push(t);
      }
  cuts.sort((x, y) => x - y);
  const at = (t: number) => {
    let s = 0;
    for (let k = 0; k < 3; k++) {
      const v = Math.max(0, Math.abs(a[k] + d[k] * t) - half[k]);
      s += v * v;
    }
    return s;
  };
  let best = Math.min(at(0), at(1));
  for (let i = 0; i < cuts.length - 1; i++) {
    const lo = cuts[i],
      hi = cuts[i + 1],
      mid = (lo + hi) / 2;
    let aa = 0,
      bb = 0;
    for (let k = 0; k < 3; k++) {
      const x = a[k] + d[k] * mid;
      if (Math.abs(x) > half[k]) {
        const c = a[k] - (x > 0 ? half[k] : -half[k]);
        aa += d[k] * d[k];
        bb += d[k] * c;
      }
    }
    best = Math.min(best, at(lo), at(hi), at(aa === 0 ? mid : clamp(-bb / aa, lo, hi)));
  }
  return best;
}
/** A spherical effector against a fixed-orientation shape in target-relative coordinates. */
export function sweepOverlap(a: Vec3, b: Vec3, radius: number, shape: Shape): boolean {
  let distance: number,
    r = radius;
  if (shape.kind === 'sphere') {
    distance = pointSegmentSq([0, 0, 0], a, b);
    r += shape.radius;
  } else if (shape.kind === 'capsule') {
    distance = segmentSegmentSq(a, b, shape.a, shape.b);
    r += shape.radius;
  } else {
    const q = shape.rotation ?? identity();
    distance = segmentBoxSq(inverseRotate(a, q), inverseRotate(b, q), shape.half);
  }
  return distance <= r * r + EPSILON;
}
export function nextRandom(seed: number): { state: number; value: number } {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return { state: x >>> 0, value: (x >>> 0) / 4294967296 };
}
