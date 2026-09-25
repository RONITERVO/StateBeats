import { inverseRotate, sub, pointSegmentSq, segmentBoxSq, sweepOverlap } from '@statebeats/core';
import type { Vec3, Shape } from '@statebeats/core';
import type { Observation } from './session.js';
import { EngineError, idSchema, parsed } from './schema.js';

export interface GuidedHand {
  id: string;
  semantic: 'left' | 'right';
  tracked: boolean;
  active: boolean;
  position: Vec3;
  target?: {
    id: string;
    label: string;
    slot: number;
    action: 'reach' | 'hold';
    position: Vec3;
    secondsUntil: number;
    phase: 'prepare' | 'ready' | 'hold';
    gapMetres: number;
    /** Endpoint overlap only, not a hit prediction. */
    aligned: boolean;
    holdProgress: number;
  };
}
export interface HandGuidanceFrame {
  version: 1;
  tick: number;
  actorId: string;
  hands: GuidedHand[];
  /** Mechanics that need their own guidance adapter. */
  unsupported: { id: string; reason: 'custom-policy' | 'directional-strike' | 'multiple-actors' }[];
}
function gap(local: Vec3, radius: number, shape: Shape) {
  const boxPoint =
    shape.kind === 'box' ? inverseRotate(local, shape.rotation ?? [0, 0, 0, 1]) : local;
  const distance =
    shape.kind === 'sphere'
      ? Math.hypot(...local) - shape.radius
      : shape.kind === 'capsule'
        ? Math.sqrt(pointSegmentSq(local, shape.a, shape.b)) - shape.radius
        : Math.sqrt(segmentBoxSq(boxPoint, boxPoint, shape.half));
  return Math.max(0, distance - radius);
}
/** Geometry-aware alignment for audio, text, haptics and agents. Does not change state or score. */
export function describeHandGuidance(
  view: Observation,
  options: { actorId?: string; lookaheadSeconds?: number } = {},
): HandGuidanceFrame {
  const actorId = parsed(idSchema, options.actorId ?? 'player');
  const lookahead = options.lookaheadSeconds ?? 3;
  if (!Number.isFinite(lookahead) || lookahead < 0 || lookahead > 10)
    throw new EngineError('VALIDATION', 'Hand guidance lookahead must be 0–10 seconds');
  const actor = view.actors.find((a) => a.id === actorId);
  const effectors = (actor?.effectors ?? []).filter(
    (e) => e.semantic === 'left' || e.semantic === 'right',
  );
  const hands: GuidedHand[] = effectors.map((e) => ({
    id: e.id,
    semantic: e.semantic as 'left' | 'right',
    tracked: e.pose.tracked,
    active: e.pose.active,
    position: [...e.pose.position],
  }));
  const unsupported: HandGuidanceFrame['unsupported'] = [];
  const entities = view.finished
    ? []
    : view.entities.filter(
        (e) =>
          e.kind !== 'hazard' &&
          e.presentation?.phase !== 'resolved' &&
          e.presentation?.phase !== 'hidden' &&
          !['hidden', 'waiting', 'resolved'].includes(e.presentation?.readiness?.phase ?? '') &&
          (e.hitTick - view.tick) / view.tickRate <= lookahead &&
          view.tick <= e.endTick &&
          (e.kind !== 'strike' || view.tick <= e.hitTick + (e.window?.[1] ?? 0)),
      );
  entities.sort((a, b) => {
    const priority = (e: typeof a) =>
      e.kind === 'hold' && view.tick >= e.hitTick ? -1 : e.hitTick;
    return priority(a) - priority(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  });
  for (const e of entities) {
    const reason =
      e.policyId && e.policyId !== 'builtin/contact'
        ? 'custom-policy'
        : e.kind === 'strike' && (e.direction || (e.minSpeed ?? 0) > 0)
          ? 'directional-strike'
          : e.distinctActors ||
              e.slots.some((s) => s.actorId && s.actorId !== actorId) ||
              e.participants?.some((p) => p.actorId !== actorId)
            ? 'multiple-actors'
            : undefined;
    if (reason) {
      unsupported.push({ id: e.id, reason });
      continue;
    }
    const holding = e.kind === 'hold' && view.tick >= e.hitTick;
    const readyTick =
      e.presentation?.readyTick ??
      (e.kind === 'strike' ? e.hitTick - (e.window?.[0] ?? 0) : e.hitTick);
    const position = [
      ...(view.tick >= readyTick ? e.position : (e.targetPosition ?? e.position)),
    ] as Vec3;
    const slots = e.slots
      .map((slot, index) => ({ slot, index }))
      .sort(
        (a, b) =>
          Number(!!(b.slot.semantic || b.slot.effectorId)) -
            Number(!!(a.slot.semantic || a.slot.effectorId)) || a.index - b.index,
      );
    for (const { slot, index } of slots) {
      const participant = e.participants?.find((p) => p.slot === index);
      const candidates = hands.filter(
        (h) =>
          !h.target &&
          h.tracked &&
          h.active &&
          (!participant || participant.effectorId === h.id) &&
          (!slot.actorId || slot.actorId === actorId) &&
          (!slot.semantic || slot.semantic === h.semantic) &&
          (!slot.effectorId || slot.effectorId === h.id),
      );
      // Reserve hands needed by simultaneous explicit notes; stable ordering avoids a beacon
      // switching hands as a player moves toward an either-hand target.
      const reserved = (hand: GuidedHand) =>
        entities.some(
          (other) =>
            other.id !== e.id &&
            other.hitTick === e.hitTick &&
            other.slots.some((s) => s.semantic === hand.semantic || s.effectorId === hand.id),
        );
      candidates.sort(
        (a, b) => Number(reserved(a)) - Number(reserved(b)) || (a.id < b.id ? -1 : 1),
      );
      const hand = candidates[0];
      if (!hand) continue;
      const local = inverseRotate(sub(hand.position, position), e.orientation);
      const radius = effectors.find((f) => f.id === hand.id)!.radius;
      hand.target = {
        id: e.id,
        label: e.label ?? 'target',
        slot: index,
        action: e.kind === 'hold' ? 'hold' : 'reach',
        position: [...position],
        secondsUntil: (e.hitTick - view.tick) / view.tickRate,
        phase: holding ? 'hold' : view.tick >= readyTick ? 'ready' : 'prepare',
        gapMetres: gap(local, radius, e.shape),
        aligned: sweepOverlap(local, local, radius, e.shape),
        holdProgress: e.holdTicks > 0 ? Math.min(1, e.hold / e.holdTicks) : 0,
      };
    }
  }
  return { version: 1, tick: view.tick, actorId, hands, unsupported };
}
