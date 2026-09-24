import type { ActorSpec, Command, Vec3 } from '@statebeats/core';
import { lerp } from '@statebeats/core';
import {
  clone,
  compile,
  generateMap,
  MapBuilder,
  programDescriptor,
  programIdentity,
  canonical,
} from './compiler.js';
import { EngineError, parsed, actorSchema, idSchema } from './schema.js';
import type { MapDefinition, MapInput } from './schema.js';
import type { SceneInput, MusicTimeline } from './schema.js';
import { generateMusicMap } from './music.js';
import { generateChoreography, inspectChoreography } from './choreography.js';
import { describeObservation } from './perception.js';
import { Session, standardActor } from './session.js';
import type { Capability, Checkpoint, Replay } from './session.js';
export interface MapStore {
  get(id: string): Promise<MapDefinition | undefined>;
  put(map: MapDefinition): Promise<void>;
  list(): Promise<{ id: string; title: string }[]>;
}
export interface ReplayStore {
  get(id: string): Promise<Replay | undefined>;
  put(id: string, replay: Replay): Promise<void>;
}
export class MemoryMapStore implements MapStore {
  private maps = new Map<string, MapDefinition>();
  async get(id: string) {
    const m = this.maps.get(id);
    return m ? clone(m) : undefined;
  }
  async put(map: MapDefinition) {
    this.maps.set(map.id, clone(map));
  }
  async list() {
    return [...this.maps.values()].map((m) => ({ id: m.id, title: m.title }));
  }
}
export class MemoryReplayStore implements ReplayStore {
  private replays = new Map<string, Replay>();
  async get(id: string) {
    const r = this.replays.get(id);
    return r ? clone(r) : undefined;
  }
  async put(id: string, replay: Replay) {
    this.replays.set(id, clone(replay));
  }
}
export const operations = [
  'session.create',
  'session.list',
  'session.close',
  'session.reset',
  'map.list',
  'map.import',
  'map.export',
  'map.validate',
  'map.generate',
  'music.generate',
  'music.compose',
  'choreography.inspect',
  'map.edit',
  'map.compile',
  'actor.register',
  'command.submit',
  'pose.trajectory',
  'clock.advance',
  'observe',
  'perception.describe',
  'events.since',
  'snapshot.save',
  'snapshot.restore',
  'replay.export',
  'replay.verify',
  'diagnostics.inspect',
] as const;
export type Operation = (typeof operations)[number];
export interface ServiceRequest {
  op: Operation;
  sessionId?: string;
  requestId?: string;
  args?: Record<string, unknown>;
}
/** Single operation dispatcher shared by CLI and MCP. Role comes from the host, never args. */
export class EngineService {
  private sessions = new Map<string, Session>();
  private serial: Promise<unknown> = Promise.resolve();
  private sequence = 0;
  private hostRetries = new Map<string, { payload: string; result: unknown }>();
  constructor(
    readonly maps: MapStore = new MemoryMapStore(),
    readonly replays: ReplayStore = new MemoryReplayStore(),
  ) {}
  async addMap(input: unknown) {
    const { map, warnings } = compile(input);
    await this.maps.put(map);
    return { id: map.id, warnings };
  }
  dispatch(request: ServiceRequest, cap: Capability = { role: 'admin' }): Promise<unknown> {
    // Capture request and capability before asynchronous dispatch to prevent caller mutation.
    let payload: string;
    try {
      payload = canonical(request);
      if (payload.length > 64_000_000)
        throw new EngineError('SIZE_LIMIT', 'Service payload too large');
    } catch (error) {
      return Promise.reject(error);
    }
    const captured = JSON.parse(payload) as ServiceRequest,
      capability = clone(cap);
    const action = this.serial.then(async () => {
      const hostOperation = [
        'session.create',
        'session.reset',
        'session.close',
        'snapshot.restore',
        'map.generate',
        'music.generate',
        'music.compose',
        'map.import',
        'map.edit',
      ].includes(captured.op);
      if (!hostOperation || !captured.requestId) return this.perform(captured, capability);
      parsed(idSchema, captured.requestId);
      const key = canonical([capability, captured.sessionId ?? null, captured.requestId]),
        prior = this.hostRetries.get(key);
      if (prior) {
        if (prior.payload !== payload)
          throw new EngineError('RETRY_CONFLICT', 'Host operation request changed');
        return clone(prior.result);
      }
      if (this.hostRetries.size >= 10000)
        throw new EngineError('SESSION_LIMIT', 'Host request cache is full; restart service');
      const result = await this.perform(captured, capability);
      this.hostRetries.set(key, { payload, result: clone(result) });
      return result;
    });
    this.serial = action.catch(() => {});
    return action;
  }
  private async perform(request: ServiceRequest, cap: Capability): Promise<unknown> {
    if (!request || !operations.includes(request.op))
      throw new EngineError('UNKNOWN_OPERATION', 'Unknown service operation');
    const a = request.args ?? {},
      sid = request.sessionId ?? 'default';
    const admin = () => {
      if (cap.role !== 'admin') throw new EngineError('FORBIDDEN', 'Host administrator operation');
    };
    const requestId = () => {
      if (!request.requestId) throw new EngineError('REQUEST_ID', 'Mutation requires requestId');
      return request.requestId;
    };
    const get = () => {
      const s = this.sessions.get(sid);
      if (!s) throw new EngineError('NOT_FOUND', 'Unknown session');
      return s;
    };
    const findMap = async () => {
      if (a.map) return a.map;
      const map = await this.maps.get(String(a.mapId ?? ''));
      if (!map) throw new EngineError('NOT_FOUND', 'Unknown map');
      return map;
    };
    switch (request.op) {
      case 'map.list':
        return this.maps.list();
      case 'map.validate': {
        const { program, warnings } = compile(a.map);
        return {
          valid: true,
          notes: program.entities.length,
          durationTicks: program.durationTicks,
          warnings,
        };
      }
      case 'map.generate': {
        admin();
        const map = generateMap(a as Parameters<typeof generateMap>[0]);
        await this.maps.put(map);
        return map;
      }
      case 'music.generate': {
        admin();
        const map = generateMusicMap(a.music, a.options as Parameters<typeof generateMusicMap>[1]);
        await this.maps.put(map);
        return map;
      }
      case 'music.compose': {
        admin();
        const result = generateChoreography(
          a.music,
          a.options as Parameters<typeof generateChoreography>[1],
        );
        await this.maps.put(result.map);
        return result;
      }
      case 'choreography.inspect':
        return inspectChoreography(
          await findMap(),
          a.options as Parameters<typeof inspectChoreography>[1],
        );
      case 'map.import':
        admin();
        return this.addMap(a.map);
      case 'map.export':
        admin();
        return findMap();
      case 'map.edit': {
        admin();
        const map = await findMap(),
          builder = new MapBuilder(map as MapInput);
        if ('scene' in a) builder.setScene(a.scene === null ? undefined : (a.scene as SceneInput));
        else if ('music' in a)
          builder.setMusic(a.music === null ? undefined : (a.music as MusicTimeline));
        else if (a.remove) builder.remove(String(a.remove));
        else if (a.note) {
          const note = a.note as MapDefinition['notes'][number];
          if (builder.export().notes.some((n) => n.id === note.id)) builder.replace(note);
          else builder.add(note);
        } else throw new EngineError('VALIDATION', 'Provide note, remove, scene or music');
        const result = builder.compile();
        await this.maps.put(result.map);
        return { map: result.map, warnings: result.warnings };
      }
      case 'map.compile': {
        admin();
        const result = compile(await findMap());
        result.program.id = await programIdentity(result.program);
        return {
          compiled: programDescriptor(result.program),
          ...(result.scene ? { scene: result.scene } : {}),
          warnings: result.warnings,
        };
      }
      case 'session.create': {
        admin();
        if (this.sessions.size >= 16) throw new EngineError('SESSION_LIMIT', 'At most 16 sessions');
        const id = request.sessionId ?? `s${++this.sequence}`;
        if (this.sessions.has(id))
          throw new EngineError('DUPLICATE_SESSION', 'Session already exists');
        const actors = (a.actors ?? [standardActor()]) as ActorSpec[];
        if (!Array.isArray(actors)) throw new EngineError('VALIDATION', 'Actors must be an array');
        const session = await Session.create(await findMap(), actors);
        this.sessions.set(id, session);
        return { sessionId: id, observation: session.observe(cap) };
      }
      case 'session.list':
        admin();
        return [...this.sessions.entries()].map(([sessionId, s]) => ({
          sessionId,
          tick: s.tick,
          title: s.program.title,
        }));
      case 'session.close': {
        admin();
        const s = this.sessions.get(sid);
        s?.close();
        this.sessions.delete(sid);
        return { closed: true };
      }
      case 'session.reset': {
        admin();
        const old = get();
        await this.replays.put(sid, await old.exportReplay(cap));
        const session = await Session.create(a.map ?? old.map, old.initialActors);
        old.close();
        this.sessions.set(sid, session);
        return session.observe(cap);
      }
      case 'actor.register':
        return get().submit(cap, requestId(), [
          {
            id: requestId() + ':actor',
            tick: a.tick,
            type: 'actor.add',
            actor: parsed(actorSchema, a.actor),
          },
        ]);
      case 'command.submit':
        return get().submit(cap, requestId(), a.commands);
      case 'pose.trajectory': {
        const start = Number(a.startTick),
          end = Number(a.endTick),
          from = a.from as Vec3,
          to = a.to as Vec3;
        if (
          !Number.isInteger(start) ||
          !Number.isInteger(end) ||
          end < start ||
          end - start > 1000 ||
          !Array.isArray(from) ||
          !Array.isArray(to) ||
          from.length !== 3 ||
          to.length !== 3
        )
          throw new EngineError(
            'VALIDATION',
            'Trajectory needs valid endpoints and at most 1001 ticks',
          );
        const commands: Command[] = [];
        for (let tick = start; tick <= end; tick++)
          commands.push({
            id: `${requestId()}:${tick}`,
            type: 'pose',
            tick,
            actorId: String(a.actorId),
            effectorId: String(a.effectorId),
            position: lerp(from, to, end === start ? 1 : (tick - start) / (end - start)),
          });
        return get().submit(cap, requestId(), commands);
      }
      case 'clock.advance':
        return get().advanceRequest(cap, requestId(), Number(a.ticks));
      case 'observe':
        return get().observe(cap);
      case 'perception.describe':
        return describeObservation(
          get().observe(cap),
          a as Parameters<typeof describeObservation>[1],
        );
      case 'events.since':
        return get().eventsSince(cap, Number(a.since ?? 0), Number(a.limit ?? 512));
      case 'snapshot.save':
        return get().checkpoint(cap);
      case 'snapshot.restore': {
        admin();
        const restored = await Session.restore(a.checkpoint as Checkpoint);
        this.sessions.get(sid)?.close();
        this.sessions.set(sid, restored);
        return restored.observe(cap);
      }
      case 'replay.export': {
        const replay = await get().exportReplay(cap);
        await this.replays.put(sid, replay);
        return replay;
      }
      case 'replay.verify':
        admin();
        return Session.verifyReplay(a.replay as Replay);
      case 'diagnostics.inspect':
        admin();
        return { diagnostics: clone(get().diagnostics), mode: get().mode, tick: get().tick };
    }
  }
  close() {
    for (const s of this.sessions.values()) s.close();
    this.sessions.clear();
    this.hostRetries.clear();
  }
}
