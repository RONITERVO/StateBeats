import { inverseRotate, sub, quaternion } from '@statebeats/core';
import type { DomainEvent, Quat, Vec3 } from '@statebeats/core';
import type { Observation, PerceptionSink } from './session.js';
import { EngineError, parsed, quatSchema, vecSchema } from './schema.js';
import type { TargetPresentation } from './presentation.js';

export interface TargetCue {
  id: string;
  label: string;
  action: 'reach' | 'hold' | 'avoid';
  requirement: string;
  position: Vec3;
  bearingDegrees: number;
  elevationDegrees: number;
  distanceMetres: number;
  clockPosition: number;
  height: 'low' | 'level' | 'high';
  dueTick: number;
  secondsUntil: number;
  holdSeconds: number;
  text: string;
  presentation?: TargetPresentation;
}
export interface PerceptionDescription {
  version: 1;
  tick: number;
  eventSeq: number;
  finished: boolean;
  summary: string;
  targets: TargetCue[];
  omitted: number;
}
function requirement(entity: Observation['entities'][number]): string {
  const slots = entity.slots.map((slot) => {
    const effector = slot.semantic ?? slot.effectorId ?? 'any effector';
    return slot.actorId ? `${slot.actorId}'s ${effector}` : effector;
  });
  const relation = entity.distinctActors
    ? 'different players: '
    : entity.sameActor && slots.length > 1
      ? 'same player: '
      : '';
  return relation + slots.join(' + ');
}

/** Shared semantic cues for text, speech, caption, haptic and audio adapters; no visual color semantics. */
export function describeObservation(
  view: Observation,
  options: {
    position?: Vec3;
    orientation?: Quat;
    maxTargets?: number;
  } = {},
): PerceptionDescription {
  const limit = options.maxTargets ?? 12;
  if (!Number.isInteger(limit) || limit < 1 || limit > 128)
    throw new EngineError('VALIDATION', 'Describe between 1 and 128 targets');
  const origin = parsed(vecSchema, options.position ?? [0, 1.4, 0]);
  const orientation = quaternion(parsed(quatSchema, options.orientation ?? [0, 0, 0, 1]));
  const entities = view.entities
    .filter((e) => e.presentation?.readiness?.phase !== 'hidden')
    .sort((a, b) => a.hitTick - b.hitTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const targets = entities.slice(0, limit).map((entity) => {
    const position = [
      ...(entity.kind === 'hold' && view.tick >= entity.hitTick
        ? entity.position
        : (entity.targetPosition ?? entity.position)),
    ] as Vec3;
    const relative = inverseRotate(sub(position, origin), orientation);
    const distanceMetres = Math.hypot(...relative);
    const horizontal = Math.hypot(relative[0], relative[2]);
    const bearingDegrees =
      horizontal < 1e-8 ? 0 : (Math.atan2(relative[0], -relative[2]) * 180) / Math.PI;
    const elevationDegrees =
      (Math.atan2(relative[1], Math.hypot(relative[0], relative[2])) * 180) / Math.PI;
    const clockPosition = ((Math.round(bearingDegrees / 30) % 12) + 12) % 12 || 12;
    const height = elevationDegrees < -20 ? 'low' : elevationDegrees > 20 ? 'high' : 'level';
    const action = entity.kind === 'hazard' ? 'avoid' : entity.kind === 'hold' ? 'hold' : 'reach';
    const label = entity.label ?? (entity.kind === 'hazard' ? 'obstacle' : 'target');
    const secondsUntil = (entity.hitTick - view.tick) / view.tickRate;
    const holdSeconds = entity.kind === 'hold' ? entity.holdTicks / view.tickRate : 0;
    const needs = requirement(entity);
    const when = secondsUntil > 0 ? `in ${secondsUntil.toFixed(2)} seconds` : 'now';
    const verb = action === 'avoid' ? 'Avoid' : action === 'hold' ? 'Hold' : 'Reach';
    const instruction =
      entity.presentation?.readiness?.phase === 'waiting'
        ? `Upcoming ${action}`
        : entity.presentation?.readiness?.phase === 'preparing'
          ? `Prepare to ${action}`
          : verb;
    return {
      id: entity.id,
      label,
      action,
      requirement: needs,
      position,
      bearingDegrees,
      elevationDegrees,
      distanceMetres,
      clockPosition,
      height,
      dueTick: entity.hitTick,
      secondsUntil,
      holdSeconds,
      ...(entity.presentation ? { presentation: entity.presentation } : {}),
      text: `${instruction} ${label}; ${needs}; ${distanceMetres < 0.1 ? 'at your position' : `${clockPosition} o'clock ${height}`}; ${distanceMetres.toFixed(2)} metres; ${when}${holdSeconds ? `; hold ${holdSeconds.toFixed(2)} seconds` : ''}.`,
    } satisfies TargetCue;
  });
  const score = view.scores
    .map(
      (score) =>
        `${score.actorId}: ${score.points} points, ${score.hits} hits, ${score.misses} misses, ${score.hazards} hazard contacts`,
    )
    .join('; ');
  return {
    version: 1,
    tick: view.tick,
    eventSeq: view.eventSeq,
    finished: view.finished,
    summary: `${view.title}. ${view.finished ? 'Complete' : `Tick ${view.tick} of ${view.durationTicks}`}. ${score}`,
    targets,
    omitted: Math.max(0, entities.length - targets.length),
  };
}
export function describeEvent(event: DomainEvent): string | undefined {
  const target = event.entityId ? ` ${event.entityId}` : '';
  if (event.type === 'interaction.hit') return `Hit${target}.`;
  if (event.type === 'interaction.missed') return `Missed${target}.`;
  if (event.type === 'hazard.penalty') return `Obstacle contact${target}.`;
  if (event.type === 'group.completed') return 'Group complete.';
  if (event.type === 'session.ended') return 'Sequence complete.';
  return undefined;
}
/** Bounded, change-driven human-readable output; observations and outcomes use the same SDK contract. */
export function textPerception(
  write: (text: string) => void,
  options: Parameters<typeof describeObservation>[1] = {},
): PerceptionSink {
  let previous = '';
  return {
    id: 'statebeats/text',
    frame(view) {
      const description = describeObservation(view, options);
      const key = JSON.stringify([
        Math.floor(view.tick / view.tickRate),
        description.targets.map((target) => target.id),
        view.finished,
      ]);
      if (key === previous) return;
      previous = key;
      write(
        [
          description.summary,
          ...description.targets.map((target) => target.text),
          ...(description.omitted ? [`${description.omitted} additional targets.`] : []),
        ].join('\n'),
      );
    },
    events(events) {
      for (const event of events) {
        const text = describeEvent(event);
        if (text) write(text);
      }
    },
  };
}
