import { nextRandom, quaternion } from '@statebeats/core';
import type { Vec3, Shape } from '@statebeats/core';
import { z } from 'zod';
import { EngineError, parsed } from './schema.js';
import { turnCueSchema, turnSettingsSchema, turnTrackSchema } from './turn-schema.js';
import type { TurnCue, TurnCueInput, TurnOptions, TurnSettings, TurnTrack } from './turn-schema.js';

export const TURN_PLANNER_VERSION = 'statebeats/musical-turns-v1';
// Exact derivative maxima of 6u^5 - 15u^4 + 10u^3 on [0,1].
const peakVelocity = 15 / 8;
const peakAcceleration = 10 / Math.sqrt(3);
const round = (n: number) => Math.round(n * 1e6) / 1e6 || 0;
const floor = (n: number) => Math.floor(Math.max(0, n) * 1e6) / 1e6;
export interface TurnDecision {
  cueId: string;
  angle: number;
  reason: string;
}
export interface TurnPlanner {
  id: string;
  /** One decision per cue, in order. The host validates all returned motion budgets. */
  plan(cues: readonly TurnCue[], settings: TurnSettings): TurnDecision[];
}
function ordered(items: readonly { id: string; beat: number; endBeat: number }[]) {
  if (
    new Set(items.map((e) => e.id)).size !== items.length ||
    items.some((e, i) => e.endBeat <= e.beat || (i > 0 && e.beat < items[i - 1].endBeat))
  )
    throw new EngineError(
      'TURN_INVALID',
      'Turns need unique IDs and ordered, non-overlapping positive intervals.',
    );
}
function angleBudget(cue: Pick<TurnCue, 'beat' | 'endBeat'>, s: TurnSettings) {
  const seconds = ((cue.endBeat - cue.beat) * 60) / s.bpm;
  return Math.min(
    (s.maxSpeed * seconds) / peakVelocity,
    (s.maxAcceleration * seconds * seconds) / peakAcceleration,
  );
}

/** Original cue-driven policy. Explicit movement leads; neutral opportunities return toward balance. */
export const musicalTurns: TurnPlanner = {
  id: TURN_PLANNER_VERSION,
  plan(cues, settings) {
    let heading = 0,
      previous = 1,
      run = 0,
      seed = settings.seed;
    return cues.map((cue) => {
      if (cue.gesture === 'settle' || settings.mode === 'forward' || cue.strength === 0)
        return { cueId: cue.id, angle: 0, reason: `${cue.reason}; hold facing` };
      let direction: number;
      if (cue.direction) direction = cue.direction === 'right' ? 1 : -1;
      else if (cue.gesture === 'continue') direction = previous;
      else if (cue.gesture === 'answer') direction = -previous;
      else if (Math.abs(heading) > 0.001) direction = -Math.sign(heading);
      else {
        const random = nextRandom(seed);
        seed = random.state;
        direction = random.value < 0.5 ? -1 : 1;
      }
      const requested =
        Math.min(cue.degrees ?? settings.degrees, settings.degrees) * (0.4 + cue.strength * 0.6);
      const room = settings.mode === 'bounded' ? settings.range - direction * heading : Infinity;
      const travel = settings.maxDirectionalTravel - (direction === previous ? run : 0);
      const amount = floor(Math.min(requested, angleBudget(cue, settings), room, travel));
      const angle = amount * direction || 0;
      if (amount > 0) {
        run = direction === previous ? run + amount : amount;
        previous = direction;
        heading += angle;
      }
      return {
        cueId: cue.id,
        angle,
        reason: `${cue.reason}; ${cue.direction ? 'directed sweep' : cue.gesture === 'sweep' ? 'balance facing' : cue.gesture}${amount + 1e-6 < requested ? '; limited by motion budget' : ''}`,
      };
    });
  },
};

/** Constant-tempo authoring. Playback uses baked positions; this never rotates a tracked camera. */
export function planTurns(
  input: readonly TurnCueInput[],
  options: TurnOptions = {},
  planner: TurnPlanner = musicalTurns,
) {
  const cues = parsed(z.array(turnCueSchema).max(8192), input),
    settings = parsed(turnSettingsSchema, options);
  ordered(cues);
  const decisions = parsed(
    z
      .array(
        z
          .object({
            cueId: z.string(),
            angle: z.number().finite(),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(8192),
    planner.plan(structuredClone(cues), structuredClone(settings)),
  );
  if (decisions.length !== cues.length)
    throw new EngineError('TURN_INVALID', 'Planner must return one decision per cue.');
  let heading = 0,
    direction = 0,
    run = 0;
  for (const [i, decision] of decisions.entries()) {
    const cue = cues[i],
      amount = Math.abs(decision.angle),
      sign = Math.sign(decision.angle);
    if (amount > 0) {
      run = sign === direction ? run + amount : amount;
      direction = sign;
    }
    heading += decision.angle;
    if (
      decision.cueId !== cue.id ||
      amount > Math.min(cue.degrees ?? settings.degrees, settings.degrees) + 1e-6 ||
      amount > angleBudget(cue, settings) + 1e-6 ||
      run > settings.maxDirectionalTravel + 1e-6 ||
      ((cue.gesture === 'settle' || cue.strength === 0 || settings.mode === 'forward') &&
        amount !== 0) ||
      (settings.mode === 'bounded' && Math.abs(heading) > settings.range + 1e-6)
    )
      throw new EngineError('TURN_INVALID', `Planner exceeds the turn budget at ${cue.id}.`);
  }
  const track = validateTurnTrack({
    version: 1,
    planner: planner.id,
    initialHeading: 0,
    events: decisions.flatMap((d, i) =>
      d.angle === 0
        ? []
        : [
            {
              id: d.cueId,
              beat: cues[i].beat,
              endBeat: cues[i].endBeat,
              angle: d.angle,
              curve: 'smootherstep',
              reason: d.reason,
            },
          ],
    ),
  });
  return { cues, track, decisions, settings, summary: inspectTurns(track, settings.bpm) };
}

export function validateTurnTrack(input: unknown): TurnTrack {
  const track = parsed(turnTrackSchema, input);
  ordered(track.events);
  return track;
}

/** Copies/validates once, then samples in O(log events), including before/after the track. */
export function createFacingSampler(input: unknown): (beat: number) => number {
  const track = validateTurnTrack(input),
    ends: number[] = [];
  let heading = track.initialHeading;
  for (const event of track.events) {
    heading += event.angle;
    ends.push(heading);
  }
  return (beat) => {
    if (!Number.isFinite(beat))
      throw new EngineError('TURN_INVALID', 'Facing sample beat must be finite.');
    let lo = 0,
      hi = track.events.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (track.events[mid].beat <= beat) lo = mid + 1;
      else hi = mid;
    }
    if (lo === 0) return track.initialHeading;
    const event = track.events[lo - 1],
      u = Math.min(1, (beat - event.beat) / (event.endBeat - event.beat));
    const eased = u * u * u * (10 + u * (-15 + 6 * u));
    return (lo > 1 ? ends[lo - 2] : track.initialHeading) + event.angle * eased;
  };
}

/** Positive yaw turns the authored forward direction right; points retain floor height. */
export function facePoint(point: Vec3, heading: number): Vec3 {
  const a = (heading * Math.PI) / 180;
  return [
    round(point[0] * Math.cos(a) - point[2] * Math.sin(a)),
    point[1],
    round(point[0] * Math.sin(a) + point[2] * Math.cos(a)),
  ];
}

/** Rotate a fixed collision shape with its contact facing, including existing local box rotation. */
export function faceShape(shape: Shape, heading: number): Shape {
  if (shape.kind === 'sphere') return { ...shape };
  if (shape.kind === 'capsule')
    return { ...shape, a: facePoint(shape.a, heading), b: facePoint(shape.b, heading) };
  const [x, y, z, w] = quaternion(shape.rotation ?? [0, 0, 0, 1]);
  const half = (-heading * Math.PI) / 360,
    s = Math.sin(half),
    c = Math.cos(half);
  return {
    ...shape,
    rotation: quaternion([c * x + s * z, c * y + s * w, c * z - s * x, c * w - s * y]),
  };
}

/** Analytic limits for a constant BPM, without a graphics or realtime dependency. */
export function inspectTurns(input: unknown, bpm: number) {
  const track = validateTurnTrack(input),
    settings = parsed(turnSettingsSchema, { bpm });
  let peakSpeed = 0,
    peakAccel = 0,
    totalTravel = 0,
    reversals = 0,
    previous = 0,
    run = 0,
    longestRun = 0;
  for (const event of track.events) {
    const amount = Math.abs(event.angle),
      seconds = ((event.endBeat - event.beat) * 60) / settings.bpm;
    peakSpeed = Math.max(peakSpeed, (amount * peakVelocity) / seconds);
    peakAccel = Math.max(peakAccel, (amount * peakAcceleration) / (seconds * seconds));
    totalTravel += amount;
    if (amount > 0) {
      const direction = Math.sign(event.angle);
      if (previous && direction !== previous) reversals++;
      run = direction === previous ? run + amount : amount;
      longestRun = Math.max(longestRun, run);
      previous = direction;
    }
  }
  return {
    events: track.events.length,
    reversals,
    totalTravel: round(totalTravel),
    longestDirectionalTravel: round(longestRun),
    peakSpeed: round(peakSpeed),
    peakAcceleration: round(peakAccel),
    finalHeading: round(track.initialHeading + track.events.reduce((n, e) => n + e.angle, 0)),
  };
}
