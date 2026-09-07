import { contactPolicy, initialState, positionAt, transition, add, rotate } from '@statebeats/core';
import type {
  ActorSpec,
  Command,
  DomainEvent,
  EntitySpec,
  InteractionPolicy,
  Program,
  WorldState,
  Vec3,
  Quat,
} from '@statebeats/core';
import {
  canonical,
  clone,
  compile,
  digest,
  programIdentity,
  programDescriptor,
  loadCompiled,
  compileScene,
  presentationIdentity,
} from './compiler.js';
import { sampleScene } from './scene.js';
import type { CompiledScene, SceneFrame } from './scene.js';
import { sampleMusic } from './music.js';
import type { MusicFeatures } from './schema.js';
import type { MapDefinition, CompiledProgram } from './schema.js';
import type { RuleExtensions } from './compiler.js';
import { actorSchema, commandSchema, EngineError, idSchema, mapSchema, parsed } from './schema.js';

export const ENGINE_VERSION = '0.1.0';
export type Capability = (
  | { role: 'admin' }
  | { role: 'director' }
  | { role: 'player'; actorId: string }
  | { role: 'observer' }
) & { controlTime?: boolean };
export interface TimelineBatch {
  acceptedAt: number;
  requestId: string;
  commands: Command[];
}
interface RequestRecord {
  id: string;
  payload: string;
  result: unknown;
}
interface AdvanceRecord {
  id: string;
  count: number;
  fromTick: number;
  toTick: number;
  eventSeq: number;
  finished: boolean;
}
export interface Checkpoint {
  version: 1;
  engineVersion: string;
  programHash: string;
  presentationHash?: string;
  map: MapDefinition;
  compiled: CompiledProgram;
  initialActors: ActorSpec[];
  world: WorldState;
  pending: Command[];
  timeline: TimelineBatch[];
  requests: RequestRecord[];
  commandIds: string[];
  events: DomainEvent[];
  eventBase: number;
  replayEvents: DomainEvent[];
  advances: AdvanceRecord[];
}
export interface Replay {
  version: 1;
  engineVersion: string;
  programHash: string;
  presentationHash?: string;
  map: MapDefinition;
  compiled: CompiledProgram;
  initialActors: ActorSpec[];
  timeline: TimelineBatch[];
  endTick: number;
  finalStateHash: string;
  eventDigest: string;
}
export interface Observation {
  version: 1;
  tick: number;
  eventSeq: number;
  finished: boolean;
  programId: string;
  title: string;
  tickRate: number;
  durationTicks: number;
  scene?: SceneFrame;
  music?: MusicFeatures;
  entities: {
    id: string;
    kind: EntitySpec['kind'];
    position: number[];
    targetPosition?: Vec3;
    label?: string;
    appearance?: string;
    orientation: [number, number, number, number];
    shape: EntitySpec['shape'];
    hitTick: number;
    endTick: number;
    slots: EntitySpec['slots'];
    sameActor?: boolean;
    distinctActors?: boolean;
    window?: [number, number];
    linkTicks?: number;
    minSpeed?: number;
    hold: number;
    holdTicks: number;
    progress: number;
    direction?: EntitySpec['direction'];
  }[];
  actors: WorldState['actors'];
  scores: WorldState['scores'];
}
export interface ActorSource {
  id: string;
  poll(tick: number, view: Observation): Command[];
  detach?(): void;
}
export interface PerceptionSink {
  id: string;
  frame?(view: Observation): void;
  events?(events: readonly DomainEvent[]): void;
  dispose?(): void;
}
const MAX_LOG_COMMANDS = 500000,
  MAX_REQUESTS = 100000,
  EVENT_RETENTION = 4096;
const keyOf = (cap: Capability) =>
  cap.role === 'player' ? 'player:' + encodeURIComponent(cap.actorId) : cap.role;
function assertSize(value: unknown, limit = 16_000_000): void {
  if (canonical(value).length > limit)
    throw new EngineError('SIZE_LIMIT', 'Payload exceeds size limit');
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const v of Object.values(value)) freeze(v);
  }
  return value;
}

/** Host owns Session; untrusted callers receive a capability-bound SessionClient. */
export class Session {
  readonly program: Program;
  readonly map: MapDefinition;
  readonly initialActors: ActorSpec[];
  private readonly scene?: CompiledScene;
  private readonly descriptions: Map<string, { label?: string; appearance?: string }>;
  private world: WorldState;
  private pending: Command[] = [];
  private timeline: TimelineBatch[] = [];
  private requests: RequestRecord[] = [];
  private requestLookup = new Map<string, RequestRecord>();
  private advances: AdvanceRecord[] = [];
  private commandIds = new Set<string>();
  private eventLog: DomainEvent[] = [];
  private replayEvents: DomainEvent[] = [];
  private sources = new Map<string, { source: ActorSource; cap: Capability }>();
  private sinks = new Map<string, { sink: PerceptionSink; cap: Capability; faults: number }>();
  private closed = false;
  private owner: 'manual' | 'realtime' = 'manual';
  readonly diagnostics: { type: string; adapter?: string; message: string }[] = [];
  private constructor(
    program: Program,
    map: MapDefinition,
    actors: ActorSpec[],
    private readonly presentationHash: string,
  ) {
    this.program = freeze(program);
    this.map = freeze(map);
    this.scene = compileScene(map);
    this.descriptions = new Map(
      map.notes.map((note) => [
        note.id,
        {
          ...(note.label ? { label: note.label } : {}),
          ...(note.appearance ? { appearance: note.appearance } : {}),
        },
      ]),
    );
    this.initialActors = freeze(clone(actors));
    this.world = initialState(program, actors);
  }
  static async create(
    input: unknown,
    actors: ActorSpec[] = [],
    policies: readonly InteractionPolicy[] = [contactPolicy],
    extensions: RuleExtensions = {},
  ): Promise<Session> {
    assertSize(input);
    const { program, map } = compile(input, policies, extensions);
    program.id = await programIdentity(program);
    const validated = actors.map((a) => parsed(actorSchema, a));
    return new Session(program, map, validated, await presentationIdentity(map));
  }
  client(capability: Capability): SessionClient {
    return new SessionClient(this, freeze(clone(capability)));
  }
  static async fromCompiled(
    input: unknown,
    sourceMap: unknown,
    actors: ActorSpec[] = [],
    policies: readonly InteractionPolicy[] = [contactPolicy],
    extensions: RuleExtensions = {},
  ): Promise<Session> {
    assertSize(input);
    const program = loadCompiled(input, policies, extensions);
    const hash = await programIdentity(program);
    if (program.id !== hash)
      throw new EngineError('PROGRAM_MISMATCH', 'Compiled program hash mismatch');
    assertSize(sourceMap);
    const map = parsed(mapSchema, sourceMap);
    if (
      map.music &&
      (map.music.tickRate !== map.tickRate ||
        map.music.frames.some((frame, i, frames) => i > 0 && frame.tick <= frames[i - 1].tick))
    )
      throw new EngineError('VALIDATION', 'Invalid stored music timeline');
    return new Session(
      program,
      map,
      actors.map((a) => parsed(actorSchema, a)),
      await presentationIdentity(map),
    );
  }
  get tick(): number {
    return this.world.tick;
  }
  get mode(): 'manual' | 'realtime' {
    return this.owner;
  }
  private alive(): void {
    if (this.closed) throw new EngineError('CLOSED', 'Session is closed');
  }
  setClockMode(mode: 'manual' | 'realtime'): void {
    this.alive();
    this.owner = mode;
  }
  snapshot(): WorldState {
    this.alive();
    return clone(this.world);
  }
  private requireAdmin(cap: Capability): void {
    if (cap.role !== 'admin')
      throw new EngineError('FORBIDDEN', 'Administrator capability required');
  }
  private checkCommand(cap: Capability, c: Command): void {
    if (cap.role === 'admin') return;
    if (cap.role === 'director' && c.type === 'director.spawn') return;
    if (
      cap.role === 'player' &&
      (c.type === 'pose' || c.type === 'calibrate') &&
      c.actorId === cap.actorId
    )
      return;
    throw new EngineError('FORBIDDEN', 'Command exceeds caller capability');
  }
  submit(cap: Capability, requestId: string, input: unknown): { accepted: number; tick: number } {
    this.alive();
    parsed(idSchema, requestId);
    assertSize(input, 2_000_000);
    const payload = canonical(input),
      requestKey = keyOf(cap) + '/' + requestId,
      prior = this.requestLookup.get(requestKey);
    if (this.advances.some((r) => r.id === requestKey))
      throw new EngineError('RETRY_CONFLICT', 'Request ID belongs to a clock operation');
    if (prior) {
      if (prior.payload !== payload)
        throw new EngineError('RETRY_CONFLICT', 'Request ID already has different input');
      return clone(prior.result) as { accepted: number; tick: number };
    }
    if (this.world.finished)
      throw new EngineError('SESSION_ENDED', 'Reset before submitting new commands');
    if (!Array.isArray(input) || input.length < 1 || input.length > 1024)
      throw new EngineError('BATCH_SIZE', 'Submit between 1 and 1024 commands');
    if (
      this.requests.length >= MAX_REQUESTS ||
      this.commandIds.size + input.length > MAX_LOG_COMMANDS
    )
      throw new EngineError('SESSION_LIMIT', 'Checkpoint/export and begin a new session segment');
    const commands = input.map((c) => parsed(commandSchema, c) as Command),
      batchIds = new Set<string>();
    for (const c of commands) {
      this.checkCommand(cap, c);
      if (c.tick <= this.world.tick)
        throw new EngineError('LATE_COMMAND', 'Target tick has already committed');
      if (c.tick > this.program.rules.maxTick)
        throw new EngineError('TICK_LIMIT', 'Target tick exceeds numeric bounds');
      if (this.commandIds.has(c.id) || batchIds.has(c.id))
        throw new EngineError('DUPLICATE_COMMAND', 'Command ID already used');
      batchIds.add(c.id);
      if (c.type === 'director.spawn') {
        if (
          c.entity.spawnTick !== c.tick ||
          c.entity.group ||
          !this.program.policies.some((p) => p.id === c.entity.policy)
        )
          throw new EngineError(
            'INVALID_SPAWN',
            'Spawn must start at command tick and use a known policy without a compiled group',
          );
        const errors = this.program.policies
          .find((p) => p.id === c.entity.policy)!
          .validate(c.entity.config);
        if (errors.length)
          throw new EngineError('INVALID_SPAWN', 'Policy configuration rejected', errors);
      }
    }
    const result = { accepted: commands.length, tick: this.world.tick };
    this.pending.push(...clone(commands));
    for (const id of batchIds) this.commandIds.add(id);
    this.timeline.push({
      acceptedAt: this.world.tick,
      requestId: requestKey,
      commands: clone(commands),
    });
    const record = { id: requestKey, payload, result };
    this.requests.push(record);
    this.requestLookup.set(requestKey, record);
    return result;
  }
  /** Only host and bounded local bots use this; external callers use a bound client. */
  advance(count: number, by: 'manual' | 'realtime' = 'manual'): DomainEvent[] {
    this.alive();
    if (this.owner !== by)
      throw new EngineError('CLOCK_OWNERSHIP', `Clock is owned by ${this.owner}`);
    if (
      !Number.isInteger(count) ||
      count < 0 ||
      count > 100000 ||
      this.tick + count > this.program.rules.maxTick
    )
      throw new EngineError('TICK_LIMIT', 'Advance count out of range');
    const all: DomainEvent[] = [];
    for (let i = 0; i < count; i++) {
      if (this.world.finished) break;
      const tick = this.world.tick + 1;
      for (const [id, { source, cap }] of this.sources) {
        try {
          const commands = source.poll(tick, this.observe(cap));
          if (commands.length) this.submit(cap, `source:${id}:${tick}`, commands);
        } catch (error) {
          this.diagnose('actor.error', String(error), id);
          this.sources.delete(id);
          try {
            source.detach?.();
          } catch {
            /* already quarantined */
          }
        }
      }
      const ready = this.pending.filter((c) => c.tick === tick);
      this.pending = this.pending.filter((c) => c.tick !== tick);
      // Explicit coalescing: greatest command ID supplies the one pose per effector/tick.
      const poses = new Map<string, Command>(),
        other: Command[] = [];
      for (const c of ready.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
        if (c.type === 'pose') poses.set(JSON.stringify([c.actorId, c.effectorId]), c);
        else other.push(c);
      }
      const result = transition(this.world, [...other, ...poses.values()], this.program);
      this.world = result.state;
      all.push(...result.events);
      this.eventLog.push(...result.events);
      this.replayEvents.push(...result.events);
      if (this.eventLog.length > EVENT_RETENTION)
        this.eventLog.splice(0, this.eventLog.length - EVENT_RETENTION);
    }
    for (const [id, entry] of this.sinks) {
      try {
        entry.sink.frame?.(this.observe(entry.cap));
        entry.sink.events?.(this.filterEvents(entry.cap, all));
        entry.faults = 0;
      } catch (error) {
        entry.faults++;
        this.diagnose('sink.error', String(error), id);
        if (entry.faults >= 3) {
          this.sinks.delete(id);
          try {
            entry.sink.dispose?.();
          } catch {
            /* quarantine */
          }
        }
      }
    }
    return clone(all);
  }
  advanceRequest(cap: Capability, requestId: string, count: number): AdvanceRecord {
    this.alive();
    if (cap.role !== 'admin' && !cap.controlTime)
      throw new EngineError('FORBIDDEN', 'Clock control was not delegated by the host');
    parsed(idSchema, requestId);
    const id = keyOf(cap) + '/' + requestId,
      prior = this.advances.find((r) => r.id === id);
    if (this.requestLookup.has(id))
      throw new EngineError('RETRY_CONFLICT', 'Request ID belongs to command submission');
    if (prior) {
      if (prior.count !== count)
        throw new EngineError('RETRY_CONFLICT', 'Advance request count changed');
      return clone(prior);
    }
    if (this.advances.length >= MAX_REQUESTS)
      throw new EngineError('SESSION_LIMIT', 'Advance request retention limit reached');
    const fromTick = this.tick;
    this.advance(count);
    const result = {
      id,
      count,
      fromTick,
      toTick: this.tick,
      eventSeq: this.world.eventSeq,
      finished: this.world.finished,
    };
    this.advances.push(result);
    return clone(result);
  }
  observe(cap: Capability): Observation {
    this.alive();
    const privileged = cap.role === 'admin' || cap.role === 'director';
    const music = this.map.music ? sampleMusic(this.map.music, this.world.tick) : undefined;
    return clone({
      version: 1,
      tick: this.world.tick,
      eventSeq: this.world.eventSeq,
      finished: this.world.finished,
      programId: this.program.id,
      title: this.program.title,
      tickRate: this.program.rules.tickRate,
      durationTicks: this.program.durationTicks,
      ...(music ? { music } : {}),
      ...(this.scene
        ? {
            scene: sampleScene(
              this.scene,
              this.world.tick,
              music,
              Object.fromEntries(this.world.actors.map((actor) => [actor.id, actor.stage])),
            ),
          }
        : {}),
      entities: this.world.entities.map((e) => ({
        id: e.spec.id,
        kind: e.spec.kind,
        position: e.position,
        targetPosition: add(
          rotate(positionAt(e.spec, e.spec.hitTick), e.transform.orientation),
          e.transform.position,
        ),
        ...this.descriptions.get(e.spec.id),
        orientation: e.transform.orientation,
        shape: e.spec.shape,
        hitTick: e.spec.hitTick,
        endTick: e.spec.endTick,
        slots: e.spec.slots,
        sameActor: e.spec.sameActor,
        distinctActors: e.spec.distinctActors,
        window: e.spec.window,
        linkTicks: e.spec.linkTicks,
        minSpeed: e.spec.minSpeed,
        hold: e.hold,
        holdTicks: e.spec.holdTicks,
        progress: e.hits.length / e.spec.slots.length,
        ...(e.spec.direction ? { direction: e.spec.direction } : {}),
      })),
      actors: privileged
        ? this.world.actors
        : cap.role === 'player'
          ? this.world.actors.filter((a) => a.id === cap.actorId)
          : [],
      scores: this.world.scores,
    });
  }
  private filterEvents(cap: Capability, events: DomainEvent[]): DomainEvent[] {
    if (cap.role === 'admin' || cap.role === 'director') return clone(events);
    return clone(
      events.filter(
        (e) =>
          !e.type.startsWith('command.') &&
          (!e.actorId || (cap.role === 'player' && e.actorId === cap.actorId)),
      ),
    );
  }
  eventsSince(
    cap: Capability,
    since: number,
    limit = 512,
  ): { events: DomainEvent[]; overflow: boolean; nextSeq: number; tick: number } {
    this.alive();
    if (
      !Number.isInteger(since) ||
      since < 0 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 4096
    )
      throw new EngineError('VALIDATION', 'Invalid event cursor/limit');
    const base = this.eventLog[0]?.seq ?? this.world.eventSeq + 1,
      selected = this.eventLog.filter((e) => e.seq > since).slice(0, limit);
    return {
      events: this.filterEvents(cap, selected),
      overflow: since < base - 1,
      nextSeq: selected.at(-1)?.seq ?? Math.max(since, this.world.eventSeq),
      tick: this.tick,
    };
  }
  checkpoint(cap: Capability): Checkpoint {
    this.alive();
    this.requireAdmin(cap);
    return clone({
      version: 1,
      engineVersion: ENGINE_VERSION,
      programHash: this.program.id,
      presentationHash: this.presentationHash,
      map: this.map,
      compiled: programDescriptor(this.program),
      initialActors: this.initialActors,
      world: this.world,
      pending: this.pending,
      timeline: this.timeline,
      requests: this.requests,
      commandIds: [...this.commandIds],
      events: this.eventLog,
      eventBase: this.eventLog[0]?.seq ?? this.world.eventSeq + 1,
      replayEvents: this.replayEvents,
      advances: this.advances,
    });
  }
  static async restore(
    input: Checkpoint,
    policies: readonly InteractionPolicy[] = [contactPolicy],
    extensions: RuleExtensions = {},
  ): Promise<Session> {
    assertSize(input, 64_000_000);
    if (!input || input.version !== 1 || input.engineVersion !== ENGINE_VERSION)
      throw new EngineError('VERSION', 'Unsupported checkpoint version');
    const session = await Session.fromCompiled(
      input.compiled,
      input.map,
      input.initialActors,
      policies,
      extensions,
    );
    if (session.program.id !== input.programHash || input.world.programId !== input.programHash)
      throw new EngineError('PROGRAM_MISMATCH', 'Checkpoint program hash mismatch');
    if (
      (input.presentationHash || input.map.scene || input.map.music) &&
      input.presentationHash !== session.presentationHash
    )
      throw new EngineError('PRESENTATION_MISMATCH', 'Checkpoint scene/music metadata differs');
    // Reconstruct from the accepted timeline, verifying all internal continuation state.
    const restored = await Session.reconstruct(
      input.map,
      input.compiled,
      input.initialActors,
      input.timeline,
      input.world.tick,
      policies,
      extensions,
    );
    if (
      canonical(restored.world) !== canonical(input.world) ||
      canonical(restored.pending) !== canonical(input.pending) ||
      canonical(restored.replayEvents) !== canonical(input.replayEvents) ||
      canonical([...restored.commandIds]) !== canonical(input.commandIds)
    )
      throw new EngineError(
        'CHECKPOINT_INVALID',
        'Checkpoint does not match its accepted timeline',
      );
    // Request results are reconstructed from original acceptance ticks, preserving caller namespaces.
    if (
      canonical(restored.requests) !== canonical(input.requests) ||
      canonical(restored.eventLog) !== canonical(input.events) ||
      input.eventBase !== (restored.eventLog[0]?.seq ?? restored.world.eventSeq + 1)
    )
      throw new EngineError('CHECKPOINT_INVALID', 'Checkpoint retry/event state mismatch');
    if (
      !Array.isArray(input.advances) ||
      input.advances.length > MAX_REQUESTS ||
      new Set(input.advances.map((r) => r.id)).size !== input.advances.length
    )
      throw new EngineError('CHECKPOINT_INVALID', 'Invalid clock retry cache');
    for (const r of input.advances) {
      const expectedSeq = restored.replayEvents.filter((e) => e.tick <= r.toTick).at(-1)?.seq ?? 0;
      if (
        typeof r.id !== 'string' ||
        !Number.isInteger(r.count) ||
        r.count < 0 ||
        r.count > 100000 ||
        !Number.isInteger(r.fromTick) ||
        r.fromTick < 0 ||
        r.toTick !==
          Math.min(r.fromTick + r.count, restored.world.finished ? restored.tick : 2147483647) ||
        r.toTick > restored.tick ||
        r.eventSeq !== expectedSeq ||
        r.finished !== (restored.world.finished && r.toTick === restored.tick) ||
        restored.requestLookup.has(r.id)
      )
        throw new EngineError('CHECKPOINT_INVALID', 'Invalid clock retry result');
    }
    restored.advances = clone(input.advances);
    return restored;
  }
  private static async reconstruct(
    map: MapDefinition,
    compiled: CompiledProgram,
    actors: ActorSpec[],
    timeline: TimelineBatch[],
    endTick: number,
    policies: readonly InteractionPolicy[],
    extensions: RuleExtensions = {},
  ): Promise<Session> {
    if (
      !Number.isInteger(endTick) ||
      endTick < 0 ||
      endTick > 2147483647 ||
      !Array.isArray(timeline) ||
      timeline.length > MAX_REQUESTS
    )
      throw new EngineError('REPLAY_INVALID', 'Invalid replay timeline');
    const session = await Session.fromCompiled(compiled, map, actors, policies, extensions);
    let previous = -1;
    for (const batch of timeline) {
      if (
        !Number.isInteger(batch.acceptedAt) ||
        batch.acceptedAt < previous ||
        batch.acceptedAt > endTick
      )
        throw new EngineError('REPLAY_INVALID', 'Invalid acceptance order');
      while (session.tick < batch.acceptedAt) {
        const before = session.tick;
        session.advance(Math.min(100000, batch.acceptedAt - session.tick));
        if (session.tick === before)
          throw new EngineError('REPLAY_INVALID', 'Timeline extends beyond ended session');
      }
      const slash = batch.requestId.indexOf('/'),
        scope = batch.requestId.slice(0, slash),
        id = batch.requestId.slice(slash + 1);
      const cap: Capability = scope.startsWith('player:')
        ? { role: 'player', actorId: decodeURIComponent(scope.slice(7)) }
        : scope === 'admin'
          ? { role: 'admin' }
          : scope === 'director'
            ? { role: 'director' }
            : { role: 'observer' };
      session.submit(cap, id, batch.commands);
      previous = batch.acceptedAt;
    }
    while (session.tick < endTick) {
      const before = session.tick;
      session.advance(Math.min(100000, endTick - session.tick));
      if (session.tick === before)
        throw new EngineError('REPLAY_INVALID', 'Replay extends beyond ended session');
    }
    return session;
  }
  async exportReplay(cap: Capability): Promise<Replay> {
    this.requireAdmin(cap);
    return {
      version: 1,
      engineVersion: ENGINE_VERSION,
      programHash: this.program.id,
      presentationHash: this.presentationHash,
      map: clone(this.map),
      compiled: programDescriptor(this.program),
      initialActors: clone(this.initialActors),
      timeline: clone(this.timeline),
      endTick: this.tick,
      finalStateHash: await digest(this.world),
      eventDigest: await digest(this.replayEvents),
    };
  }
  static async verifyReplay(
    replay: Replay,
    policies: readonly InteractionPolicy[] = [contactPolicy],
    extensions: RuleExtensions = {},
  ): Promise<{ verified: true; tick: number; stateHash: string; eventDigest: string }> {
    assertSize(replay, 64_000_000);
    if (replay.version !== 1 || replay.engineVersion !== ENGINE_VERSION)
      throw new EngineError('VERSION', 'Unsupported replay version');
    const session = await Session.reconstruct(
      replay.map,
      replay.compiled,
      replay.initialActors,
      replay.timeline,
      replay.endTick,
      policies,
      extensions,
    );
    if (session.program.id !== replay.programHash)
      throw new EngineError('PROGRAM_MISMATCH', 'Replay program differs');
    if (
      (replay.presentationHash || replay.map.scene || replay.map.music) &&
      replay.presentationHash !== session.presentationHash
    )
      throw new EngineError('PRESENTATION_MISMATCH', 'Replay scene/music metadata differs');
    const stateHash = await digest(session.world),
      eventDigest = await digest(session.replayEvents);
    if (stateHash !== replay.finalStateHash || eventDigest !== replay.eventDigest)
      throw new EngineError('REPLAY_DIVERGED', 'Replay state/events differ', {
        stateHash,
        eventDigest,
      });
    return { verified: true, tick: session.tick, stateHash, eventDigest };
  }
  attachActor(cap: Capability, source: ActorSource): () => void {
    this.alive();
    if (this.sources.has(source.id))
      throw new EngineError('DUPLICATE_ADAPTER', 'Source already attached');
    this.sources.set(source.id, { source, cap: clone(cap) });
    return () => {
      this.sources.delete(source.id);
      source.detach?.();
    };
  }
  attachSink(cap: Capability, sink: PerceptionSink): () => void {
    this.alive();
    if (this.sinks.has(sink.id))
      throw new EngineError('DUPLICATE_ADAPTER', 'Sink already attached');
    this.sinks.set(sink.id, { sink, cap: clone(cap), faults: 0 });
    return () => {
      this.sinks.delete(sink.id);
      sink.dispose?.();
    };
  }
  private diagnose(type: string, message: string, adapter?: string): void {
    this.diagnostics.push({ type, message, ...(adapter ? { adapter } : {}) });
    if (this.diagnostics.length > 100) this.diagnostics.shift();
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const { source } of this.sources.values())
      try {
        source.detach?.();
      } catch {}
    for (const { sink } of this.sinks.values())
      try {
        sink.dispose?.();
      } catch {}
    this.sources.clear();
    this.sinks.clear();
    this.pending = [];
  }
}
/** Deliberately no capability escalation or raw Session getter. */
export class SessionClient {
  constructor(
    private readonly session: Session,
    private readonly cap: Capability,
  ) {}
  submit(requestId: string, commands: unknown) {
    return this.session.submit(this.cap, requestId, commands);
  }
  observe() {
    return this.session.observe(this.cap);
  }
  events(since = 0, limit = 512) {
    return this.session.eventsSince(this.cap, since, limit);
  }
  advance(count: number) {
    if (this.cap.role !== 'admin')
      throw new EngineError('FORBIDDEN', 'Clock advancement belongs to the host');
    return this.session.advance(count);
  }
  advanceOnce(requestId: string, count: number) {
    return this.session.advanceRequest(this.cap, requestId, count);
  }
  checkpoint() {
    return this.session.checkpoint(this.cap);
  }
  replay() {
    return this.session.exportReplay(this.cap);
  }
}
export function standardActor(id = 'player'): ActorSpec {
  return {
    id,
    effectors: [
      { id: 'left', semantic: 'left', radius: 0.07, position: [-0.3, 1.1, -0.2] },
      { id: 'right', semantic: 'right', radius: 0.07, position: [0.3, 1.1, -0.2] },
      { id: 'head', semantic: 'head', radius: 0.13, position: [0, 1.65, 0] },
    ],
  };
}
/** Deterministic example driver. Uses observations for public bots; this scripted fixture compiler is host tooling. */
export function scriptedCommands(
  program: Program,
  actorId = 'player',
  stages: Record<string, { position: Vec3; orientation: Quat }> = {},
): Command[] {
  const out: Command[] = [];
  let seq = 0;
  for (const entity of program.entities) {
    if (entity.kind === 'hazard') continue;
    const stage = entity.anchor ? stages[entity.anchor] : undefined;
    const at = (tick: number): Vec3 =>
      stage
        ? add(rotate(positionAt(entity, tick), stage.orientation), stage.position)
        : positionAt(entity, tick);
    for (let slot = 0; slot < entity.slots.length; slot++) {
      const requirement = entity.slots[slot],
        effectorId =
          requirement.effectorId ??
          (requirement.semantic === 'left'
            ? 'left'
            : requirement.semantic === 'right'
              ? 'right'
              : slot % 2
                ? 'right'
                : 'left');
      const actor =
          requirement.actorId ?? (entity.distinctActors && slot > 0 ? 'partner' : actorId),
        p = at(entity.hitTick);
      const start = Math.max(1, entity.hitTick - 2);
      out.push({
        id: `script:${seq++}`,
        tick: start,
        type: 'pose',
        actorId: actor,
        effectorId,
        position: [p[0], p[1], p[2] + 0.5],
      });
      const end = entity.kind === 'hold' ? entity.hitTick + entity.holdTicks : entity.hitTick;
      for (let t = entity.hitTick; t <= end; t++)
        out.push({
          id: `script:${seq++}`,
          tick: t,
          type: 'pose',
          actorId: actor,
          effectorId,
          position: at(t),
        });
      out.push({
        id: `script:${seq++}`,
        tick: end + 1,
        type: 'pose',
        actorId: actor,
        effectorId,
        position: p,
        active: false,
      });
    }
  }
  return out;
}
