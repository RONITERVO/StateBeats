import type {
  ActorSpec,
  ActorState,
  Command,
  DomainEvent,
  EntitySpec,
  LiveEntity,
  PolicyContact,
  Program,
  Score,
  SlotHit,
  TransitionResult,
  Vec3,
  WorldState,
} from './types.js';
import {
  add,
  dot,
  identity,
  inverseRotate,
  lengthSq,
  lerp,
  quaternion,
  rotate,
  sub,
  sweepOverlap,
} from './math.js';

const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const finiteVec = (v: unknown): v is Vec3 =>
  Array.isArray(v) &&
  v.length === 3 &&
  v.every((x) => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) <= 10000);
const validId = (x: unknown): x is string => typeof x === 'string' && /^[\w./:-]{1,100}$/.test(x);
export function validateActor(actor: ActorSpec): boolean {
  return (
    !!actor &&
    validId(actor.id) &&
    Array.isArray(actor.effectors) &&
    actor.effectors.length > 0 &&
    actor.effectors.length <= 16 &&
    new Set(actor.effectors.map((e) => e.id)).size === actor.effectors.length &&
    actor.effectors.every(
      (e) =>
        validId(e.id) &&
        validId(e.semantic) &&
        Number.isFinite(e.radius) &&
        e.radius > 0 &&
        e.radius <= 2 &&
        (!e.position || finiteVec(e.position)),
    )
  );
}
export function makeActor(spec: ActorSpec, index: number): ActorState {
  return {
    id: spec.id,
    index,
    stage: { position: [0, 0, 0], orientation: identity() },
    effectors: spec.effectors.map((e) => {
      const pose = {
        position: e.position ?? ([0, 0, 0] as Vec3),
        orientation: identity(),
        tracked: false,
        active: true,
      };
      return { ...copy(e), pose: copy(pose), previous: copy(pose) };
    }),
  };
}
const newScore = (actorId: string): Score => ({
  actorId,
  points: 0,
  hits: 0,
  misses: 0,
  combo: 0,
  bestCombo: 0,
  hazards: 0,
});
export function initialState(program: Program, actors: ActorSpec[] = []): WorldState {
  if (
    actors.some((a) => !validateActor(a)) ||
    new Set(actors.map((a) => a.id)).size !== actors.length ||
    actors.length > program.rules.maxActors
  )
    throw new Error('Invalid actors');
  return {
    version: 1,
    programId: program.id,
    tick: 0,
    eventSeq: 0,
    rng: program.seed || 1,
    actors: actors.map(makeActor),
    entities: [],
    groups: program.groups.map((g) => ({ id: g.id, hits: [], firstTick: null, resolved: false })),
    scores: actors.map((a) => newScore(a.id)),
    cursor: 0,
    finished: false,
    resolvedCount: 0,
    directorIds: [],
  };
}
export function positionAt(entity: Pick<EntitySpec, 'position' | 'motion'>, tick: number): Vec3 {
  if (entity.motion.length === 0) return [...entity.position];
  if (tick <= entity.motion[0].tick) return [...entity.motion[0].position];
  // Validated motion keys are strictly increasing. Find the same right endpoint as
  // the original scan, including exact knots, without rescanning a dense path.
  let lo = 1,
    hi = entity.motion.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (tick <= entity.motion[mid].tick) hi = mid;
    else lo = mid + 1;
  }
  if (lo < entity.motion.length) {
    const a = entity.motion[lo - 1],
      b = entity.motion[lo];
    return lerp(a.position, b.position, (tick - a.tick) / (b.tick - a.tick));
  }
  return [...entity.motion[entity.motion.length - 1].position];
}
function spawn(spec: EntitySpec, state: WorldState): LiveEntity {
  const actor = state.actors.find((a) => a.id === spec.anchor),
    transform = copy(actor?.stage ?? { position: [0, 0, 0] as Vec3, orientation: identity() });
  const position = add(
    rotate(positionAt(spec, state.tick), transform.orientation),
    transform.position,
  );
  return {
    spec: copy(spec),
    position,
    previous: [...position],
    transform,
    hits: [],
    armedTick: null,
    hold: 0,
    brokenFor: 0,
    occupancy: [],
    memory: null,
  };
}
function matches(slot: EntitySpec['slots'][number], contact: PolicyContact): boolean {
  return (
    (!slot.actorId || slot.actorId === contact.actorId) &&
    (!slot.effectorId || slot.effectorId === contact.effectorId) &&
    (!slot.semantic || slot.semantic === contact.semantic)
  );
}
/** Reserve capacity through a director entity's full lifetime, including future chart spawns. */
function canReserve(spec: EntitySpec, state: WorldState, program: Program): boolean {
  const intervals = [...state.entities.map((e) => e.spec), ...program.entities.slice(state.cursor)];
  const edges = intervals
    .filter((e) => e.spawnTick <= spec.endTick && e.endTick >= state.tick)
    .flatMap((e) => [
      { tick: Math.max(state.tick, e.spawnTick), delta: 1 },
      { tick: e.endTick + 1, delta: -1 },
    ]);
  edges.sort((a, b) => a.tick - b.tick || a.delta - b.delta);
  let active = 1;
  for (const edge of edges) {
    active += edge.delta;
    if (active > program.rules.maxEntities) return false;
  }
  return true;
}
function assignSlots(
  entity: LiveEntity,
  contacts: PolicyContact[],
  tick: number,
  keep: boolean,
): SlotHit[] {
  const slots = entity.spec.slots,
    fixed = keep ? [...entity.hits] : [];
  // Small bounded bipartite matching avoids an 'any' slot stealing the only left effector.
  let best = fixed;
  const search = (slot: number, hits: SlotHit[]) => {
    if (slot === slots.length) {
      if (hits.length > best.length) best = [...hits];
      return;
    }
    if (hits.some((h) => h.slot === slot)) {
      search(slot + 1, hits);
      return;
    }
    for (const c of contacts) {
      if (
        !matches(slots[slot], c) ||
        hits.some((h) => h.actorId === c.actorId && h.effectorId === c.effectorId) ||
        (entity.spec.distinctActors && hits.some((h) => h.actorId === c.actorId)) ||
        (entity.spec.sameActor && hits.some((h) => h.actorId !== c.actorId))
      )
        continue;
      search(slot + 1, [...hits, { slot, actorId: c.actorId, effectorId: c.effectorId, tick }]);
      if (best.length === slots.length) return;
    }
    search(slot + 1, hits);
  };
  search(0, fixed);
  return best;
}
export function transition(
  previous: WorldState,
  commands: readonly Command[],
  program: Program,
): TransitionResult {
  if (previous.programId !== program.id || previous.tick >= program.rules.maxTick)
    throw new Error('Program/tick invariant violated');
  if (previous.finished) return { state: previous, events: [], resolvedEntities: [] };
  const state: WorldState = {
    ...previous,
    tick: previous.tick + 1,
    directorIds: [...previous.directorIds],
    actors: previous.actors.map((a) => ({
      ...a,
      stage: copy(a.stage),
      effectors: a.effectors.map((e) => ({ ...e, pose: copy(e.pose), previous: copy(e.pose) })),
    })),
    entities: previous.entities.map((e) => ({
      ...e,
      position: [...e.position],
      previous: [...e.position],
      hits: e.hits.map((h) => ({ ...h })),
      occupancy: e.occupancy.map((o) => ({ ...o })),
      memory: copy(e.memory),
    })),
    groups: copy(previous.groups),
    scores: previous.scores.map((s) => ({ ...s })),
  };
  const events: DomainEvent[] = [];
  const emit = (
    type: string,
    data: DomainEvent['data'] = {},
    entityId?: string,
    actorId?: string,
  ) => {
    const e: DomainEvent = { seq: ++state.eventSeq, tick: state.tick, type, data };
    if (entityId) e.entityId = entityId;
    if (actorId) e.actorId = actorId;
    events.push(e);
  };
  const reject = (c: Command, reason: string) =>
    emit('command.rejected', { commandId: c.id, reason });
  const seen = new Set<string>();
  let spawned = 0;
  const ordered = [...commands].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  for (const c of ordered) {
    if (!validId(c.id) || c.tick !== state.tick || seen.has(c.id)) {
      reject(c, 'INVALID_TICK_OR_ID');
      continue;
    }
    seen.add(c.id);
    if (c.type === 'actor.add') {
      if (
        !validateActor(c.actor) ||
        state.scores.some((a) => a.actorId === c.actor.id) ||
        state.actors.length >= program.rules.maxActors
      ) {
        reject(c, 'INVALID_ACTOR');
        continue;
      }
      const index = state.scores.length;
      state.actors.push(makeActor(c.actor, index));
      state.scores.push(newScore(c.actor.id));
      emit('actor.added', {}, undefined, c.actor.id);
      continue;
    }
    if (c.type === 'director.spawn') {
      if (
        ++spawned > program.rules.maxDirectorSpawnsPerTick ||
        state.entities.length >= program.rules.maxEntities ||
        !program.policies.some((p) => p.id === c.entity.policy) ||
        program.entities.some((e) => e.id === c.entity.id) ||
        state.directorIds.includes(c.entity.id) ||
        state.directorIds.length >= 10000 ||
        c.entity.spawnTick !== state.tick ||
        c.entity.group ||
        !canReserve(c.entity, state, program)
      ) {
        reject(c, 'INVALID_SPAWN');
        continue;
      }
      state.entities.push(spawn(c.entity, state));
      state.directorIds.push(c.entity.id);
      emit('entity.spawned', { kind: c.entity.kind }, c.entity.id);
      continue;
    }
    const actor = state.actors.find((a) => a.id === c.actorId);
    if (!actor) {
      reject(c, 'UNKNOWN_ACTOR');
      continue;
    }
    if (c.type === 'actor.remove') {
      state.actors = state.actors.filter((a) => a !== actor);
      emit('actor.removed', {}, undefined, c.actorId);
      continue;
    }
    if (c.type === 'calibrate') {
      if (!finiteVec(c.position)) {
        reject(c, 'INVALID_POSITION');
        continue;
      }
      try {
        actor.stage = { position: [...c.position], orientation: quaternion(c.orientation) };
        for (const e of actor.effectors) e.pose.tracked = false;
        emit('actor.calibrated', {}, undefined, c.actorId);
      } catch {
        reject(c, 'INVALID_ORIENTATION');
      }
      continue;
    }
    const effector = actor.effectors.find((e) => e.id === c.effectorId);
    if (!effector || !finiteVec(c.position)) {
      reject(c, 'INVALID_POSE');
      continue;
    }
    try {
      const pose = {
        position: [...c.position] as Vec3,
        orientation: c.orientation ? quaternion(c.orientation) : effector.pose.orientation,
        tracked: c.tracked ?? true,
        active: c.active ?? true,
      };
      if (!pose.tracked) {
        pose.position = [...effector.pose.position];
      }
      if (!effector.previous.tracked || !pose.tracked) effector.previous = copy(pose);
      effector.pose = pose;
    } catch {
      reject(c, 'INVALID_ORIENTATION');
    }
  }
  while (
    state.cursor < program.entities.length &&
    program.entities[state.cursor].spawnTick <= state.tick
  ) {
    const spec = program.entities[state.cursor++];
    if (state.entities.length >= program.rules.maxEntities)
      throw new Error('Entity capacity exceeded');
    state.entities.push(spawn(spec, state));
    emit('entity.spawned', { kind: spec.kind }, spec.id);
  }
  const resolved = new Set<string>();
  for (const entity of state.entities) {
    const spec = entity.spec,
      at = (t: number) =>
        add(rotate(positionAt(spec, t), entity.transform.orientation), entity.transform.position);
    entity.previous = at(Math.max(spec.spawnTick, state.tick - 1));
    entity.position = at(state.tick);
    const contacts: PolicyContact[] = [];
    for (const actor of state.actors)
      for (let i = 0; i < actor.effectors.length; i++) {
        const e = actor.effectors[i];
        if (!e.pose.tracked || (!e.pose.active && spec.kind !== 'hazard')) continue;
        const from = inverseRotate(
            sub(e.previous.position, entity.previous),
            entity.transform.orientation,
          ),
          to = inverseRotate(sub(e.pose.position, entity.position), entity.transform.orientation);
        if (!sweepOverlap(from, to, e.radius, spec.shape)) continue;
        const movement = sub(e.pose.position, e.previous.position),
          speed = Math.sqrt(lengthSq(movement)) * program.rules.tickRate;
        contacts.push({
          actorId: actor.id,
          actorIndex: actor.index,
          effectorId: e.id,
          semantic: e.semantic,
          effectorIndex: i,
          speed,
          movement,
          inside: sweepOverlap(to, to, e.radius, spec.shape),
        });
      }
    const orderedContacts = program.arbitration.order(copy(contacts), {
      tick: state.tick,
      entityId: spec.id,
      actorCount: state.actors.length,
    });
    if (
      orderedContacts.length !== contacts.length ||
      new Set(orderedContacts.map((c) => JSON.stringify([c.actorId, c.effectorId]))).size !==
        contacts.length ||
      orderedContacts.some(
        (c) =>
          !contacts.some((real) => real.actorId === c.actorId && real.effectorId === c.effectorId),
      )
    )
      throw new Error('Arbitration policy must return a permutation of contacts');
    contacts.sort(
      (a, b) =>
        orderedContacts.findIndex((c) => c.actorId === a.actorId && c.effectorId === a.effectorId) -
        orderedContacts.findIndex((c) => c.actorId === b.actorId && c.effectorId === b.effectorId),
    );
    const policy = program.policies.find((p) => p.id === spec.policy);
    if (!policy) throw new Error('Unknown policy in program');
    const context = {
      tick: state.tick,
      entity: copy(spec),
      contacts: copy(contacts),
      memory: copy(entity.memory),
    };
    const result = policy.evaluate(context);
    entity.memory = copy(result.memory);
    // Policies can filter contacts, not fabricate a contact identity through the result.
    const eligible = contacts.filter((c) =>
      result.eligible.some((r) => r.actorId === c.actorId && r.effectorId === c.effectorId),
    );
    if (spec.kind === 'hazard') {
      if (state.tick >= spec.hitTick && state.tick <= spec.endTick) {
        const active = new Set<string>();
        for (const c of eligible) {
          if (spec.slots.length && !spec.slots.some((s) => matches(s, c))) continue;
          const key = JSON.stringify([c.actorId, c.effectorId]);
          let occupancy = entity.occupancy.find((o) => o.key === key);
          if (!occupancy) {
            occupancy = {
              key,
              since: state.tick,
              lastPenalty: state.tick - program.rules.hazardInterval,
            };
            entity.occupancy.push(occupancy);
            emit('hazard.entered', { effectorId: c.effectorId }, spec.id, c.actorId);
          }
          if (state.tick - occupancy.lastPenalty >= program.rules.hazardInterval) {
            occupancy.lastPenalty = state.tick;
            const score = state.scores.find((s) => s.actorId === c.actorId)!;
            score.points = Math.max(0, score.points - program.rules.hazardPenalty);
            score.hazards++;
            score.combo = 0;
            emit('hazard.penalty', { points: program.rules.hazardPenalty }, spec.id, c.actorId);
          }
          if (c.inside) active.add(key);
        }
        entity.occupancy = entity.occupancy.filter((o) => {
          if (active.has(o.key)) return true;
          emit('hazard.exited', { effector: o.key }, spec.id);
          return false;
        });
      }
      if (state.tick >= spec.endTick) resolved.add(spec.id);
      continue;
    }
    const inWindow =
      state.tick >= spec.hitTick - spec.window[0] && state.tick <= spec.hitTick + spec.window[1];
    let good = eligible;
    if (spec.kind === 'strike')
      good = good.filter((c) => {
        if (c.speed + 1e-9 < spec.minSpeed) return false;
        if (!spec.direction) return true;
        const dir = rotate(spec.direction.vector, entity.transform.orientation),
          den = Math.sqrt(lengthSq(c.movement) * lengthSq(dir));
        return den > 0 && dot(c.movement, dir) >= spec.direction.cosine * den;
      });
    let complete = false;
    if (spec.kind === 'strike' && inWindow) {
      if (entity.armedTick !== null && state.tick - entity.armedTick > spec.linkTicks) {
        emit('interaction.broken', {}, spec.id);
        resolved.add(spec.id);
      } else {
        entity.hits = assignSlots(entity, good, state.tick, true);
        if (entity.hits.length && entity.armedTick === null) entity.armedTick = state.tick;
        complete = entity.hits.length === spec.slots.length;
      }
    }
    if (spec.kind === 'hold' && state.tick >= spec.hitTick && state.tick <= spec.endTick) {
      const matched = assignSlots(
        entity,
        good.filter((c) => c.inside),
        state.tick,
        false,
      );
      const identityMatches =
        entity.hits.length === 0 ||
        matched.every((m) =>
          entity.hits.some(
            (h) => h.slot === m.slot && h.actorId === m.actorId && h.effectorId === m.effectorId,
          ),
        );
      if (matched.length === spec.slots.length && identityMatches) {
        entity.hits = matched;
        entity.hold++;
        entity.brokenFor = 0;
      } else if (++entity.brokenFor > spec.breakTicks) {
        entity.hold = 0;
        entity.hits = [];
      }
      complete = entity.hold >= spec.holdTicks;
    }
    if (complete) {
      const error =
        spec.kind === 'hold'
          ? 0
          : Math.max(...entity.hits.map((h) => Math.abs(h.tick - spec.hitTick)));
      const actorIds = [...new Set(entity.hits.map((h) => h.actorId))];
      for (const actorId of actorIds) {
        const score = state.scores.find((s) => s.actorId === actorId)!;
        const result = program.scoring.score({
          entity: copy(spec),
          error,
          rules: copy(program.rules),
          actor: { ...score },
        });
        const { points, grade } = result;
        if (
          !Number.isInteger(points) ||
          points < 0 ||
          points > 2147483647 ||
          typeof grade !== 'string' ||
          grade.length > 100
        )
          throw new Error('Scoring policy returned invalid result');
        score.points = Math.min(2147483647, score.points + points);
        score.hits++;
        score.combo++;
        score.bestCombo = Math.max(score.bestCombo, score.combo);
        emit(
          'interaction.hit',
          {
            grade,
            points,
            error,
            slots: entity.hits.map((h) => ({
              slot: h.slot,
              actorId: h.actorId,
              effectorId: h.effectorId,
              tick: h.tick,
            })),
          },
          spec.id,
          actorId,
        );
      }
      const group = state.groups.find((g) => g.id === spec.group);
      if (group && !group.resolved) {
        group.hits.push({ entityId: spec.id, actorIds, tick: state.tick });
        group.firstTick ??= state.tick;
      }
      for (const c of good)
        if (!entity.hits.some((h) => h.actorId === c.actorId && h.effectorId === c.effectorId))
          emit('claim.arbitrated', { effectorId: c.effectorId }, spec.id, c.actorId);
      resolved.add(spec.id);
    } else if (resolved.has(spec.id) || state.tick >= spec.endTick) {
      resolved.add(spec.id);
      emit('interaction.missed', {}, spec.id);
      for (const score of state.scores) {
        if (spec.slots.some((s) => !s.actorId || s.actorId === score.actorId)) {
          score.misses++;
          score.combo = 0;
        }
      }
    }
  }
  for (const group of state.groups) {
    if (group.resolved) continue;
    const definition = program.groups.find((g) => g.id === group.id)!;
    const complete = definition.members.every((id) => group.hits.some((h) => h.entityId === id));
    const expired = group.firstTick !== null && state.tick - group.firstTick > definition.linkTicks;
    const memberMissed = events.some(
      (e) => e.type === 'interaction.missed' && definition.members.includes(e.entityId ?? ''),
    );
    if (
      complete &&
      !expired &&
      (!definition.distinctActors ||
        new Set(group.hits.flatMap((h) => h.actorIds)).size >= definition.members.length)
    ) {
      group.resolved = true;
      const actors = [...new Set(group.hits.flatMap((h) => h.actorIds))];
      for (const id of actors) {
        const score = state.scores.find((s) => s.actorId === id)!;
        score.points = Math.min(2147483647, score.points + definition.bonus);
      }
      emit('group.completed', { groupId: group.id, bonus: definition.bonus });
    } else if (expired || memberMissed || (complete && definition.distinctActors)) {
      group.resolved = true;
      emit('group.broken', { groupId: group.id });
    }
  }
  const resolvedEntities = state.entities
    .filter((e) => resolved.has(e.spec.id))
    .map((e) => copy(e));
  state.entities = state.entities.filter((e) => !resolved.has(e.spec.id));
  state.resolvedCount += resolved.size;
  if (
    state.tick >= program.durationTicks &&
    state.cursor >= program.entities.length &&
    state.entities.length === 0
  ) {
    state.finished = true;
    emit('session.ended', { resolved: state.resolvedCount });
  }
  return { state, events, resolvedEntities };
}
