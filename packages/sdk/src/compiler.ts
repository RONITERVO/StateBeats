import {
  contactPolicy,
  defaultRules,
  defaultScoring,
  defaultArbitration,
  nextRandom,
  quaternion,
} from '@statebeats/core';
import type {
  EntitySpec,
  InteractionPolicy,
  Program,
  Vec3,
  ScoringPolicy,
  ArbitrationPolicy,
} from '@statebeats/core';
import { EngineError, mapSchema, compiledProgramSchema, parsed } from './schema.js';
import type { CompiledProgram } from './schema.js';
import type {
  Beat,
  MapDefinition,
  MapInput,
  NoteInput,
  SceneInput,
  MusicTimeline,
} from './schema.js';
import { scenePositionAt } from './scene.js';
import type { CompiledScene } from './scene.js';
import { validateTurnTrack } from './turns.js';
export const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
export function canonical(value: unknown, depth = 0, ancestors = new Set<object>()): string {
  if (depth > 64) throw new EngineError('JSON_DEPTH', 'JSON nesting exceeds 64 levels');
  if (value === null) return 'null';
  if (typeof value === 'number') {
    if (!Number.isFinite(value))
      throw new EngineError('NON_FINITE', 'Canonical numbers must be finite');
    return String(value === 0 ? 0 : value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'object') {
    if (ancestors.has(value)) throw new EngineError('NOT_JSON', 'Cyclic JSON value');
    if (
      !Array.isArray(value) &&
      Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null
    )
      throw new EngineError('NOT_JSON', 'Plain JSON objects required');
    ancestors.add(value);
    const nested = (v: unknown) => canonical(v, depth + 1, ancestors);
    const result = Array.isArray(value)
      ? '[' + value.map(nested).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
          .map((k) => JSON.stringify(k) + ':' + nested((value as Record<string, unknown>)[k]))
          .join(',') +
        '}';
    ancestors.delete(value);
    return result;
  }
  throw new EngineError('NOT_JSON', 'Cannot serialize value');
}
export async function digest(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(value));
  const hash = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), (x) => x.toString(16).padStart(2, '0')).join('');
}
type Rational = { n: bigint; d: bigint };
function rational(value: number | Beat): Rational {
  if (typeof value !== 'number') return { n: BigInt(value.n), d: BigInt(value.d) };
  const [base, exp = '0'] = String(value).toLowerCase().split('e'),
    parts = base.split('.'),
    places = (parts[1]?.length ?? 0) - Number(exp);
  const n = BigInt(parts.join(''));
  return places >= 0 ? { n, d: 10n ** BigInt(places) } : { n: n * 10n ** BigInt(-places), d: 1n };
}
const plus = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d + b.n * a.d, d: a.d * b.d });
const minus = (a: Rational, b: Rational): Rational => ({ n: a.n * b.d - b.n * a.d, d: a.d * b.d });
const compare = (a: Rational, b: Rational) =>
  a.n * b.d < b.n * a.d ? -1 : a.n * b.d > b.n * a.d ? 1 : 0;
export const beatValue = (beat: Beat): number =>
  typeof beat === 'number' ? beat : beat.n / beat.d;
function rounded(r: Rational): number {
  const sign = r.n < 0n ? -1n : 1n,
    n = r.n * sign,
    q = n / r.d,
    rem = n % r.d;
  return Number(sign * (q + (rem * 2n > r.d || (rem * 2n === r.d && q % 2n !== 0n) ? 1n : 0n)));
}
export function beatToTick(
  beat: Beat,
  map: Pick<MapDefinition, 'tempo' | 'offsetSeconds' | 'tickRate'>,
): number {
  return rationalToTick(rational(beat), map);
}
function rationalToTick(
  target: Rational,
  map: Pick<MapDefinition, 'tempo' | 'offsetSeconds' | 'tickRate'>,
): number {
  let total = rational(map.offsetSeconds);
  for (let i = 0; i < map.tempo.length; i++) {
    const start = rational(map.tempo[i].beat);
    if (compare(target, start) <= 0) break;
    const next = i + 1 < map.tempo.length ? rational(map.tempo[i + 1].beat) : target;
    const end = compare(target, next) < 0 ? target : next,
      span = minus(end, start),
      bpm = rational(map.tempo[i].bpm);
    total = plus(total, { n: span.n * 60n * bpm.d, d: span.d * bpm.n });
  }
  return rounded({ n: total.n * BigInt(map.tickRate), d: total.d });
}
export function cartesian(p: MapDefinition['notes'][number]['position']): Vec3 {
  if (Array.isArray(p)) return p.map((x) => (x === 0 ? 0 : x)) as Vec3;
  const a = ((((p.azimuth % 360) + 360) % 360) * Math.PI) / 180,
    e = (p.elevation * Math.PI) / 180;
  // Quantize compiled authoring geometry to micrometres. Runtime replays these stored values.
  return [
    Math.sin(a) * Math.cos(e) * p.radius,
    Math.sin(e) * p.radius + p.height,
    -Math.cos(a) * Math.cos(e) * p.radius,
  ].map((x) => Math.round(x * 1e6) / 1e6 || 0) as Vec3;
}
export interface Compilation {
  map: MapDefinition;
  program: Program;
  scene?: CompiledScene;
  warnings: { path: string; message: string }[];
}
export interface RuleExtensions {
  scoring?: ScoringPolicy;
  arbitration?: ArbitrationPolicy;
}
/** Compile presentation tracks once. Music is sampled from its stored tick timeline. */
export function compileScene(map: MapDefinition): CompiledScene | undefined {
  if (!map.scene) return undefined;
  const ids = new Set<string>();
  return {
    ...clone(map.scene),
    objects: map.scene.objects.map((object) => {
      if (ids.has(object.id))
        throw new EngineError('MAP_INVALID', `Duplicate scene object ${object.id}`);
      ids.add(object.id);
      const motion = object.motion.map((key) => ({
        tick: beatToTick(key.beat, map),
        position: cartesian(key.position),
      }));
      if (
        motion.some(
          (key, i) =>
            key.tick < 0 || key.tick > 2147483647 || (i > 0 && key.tick <= motion[i - 1].tick),
        )
      )
        throw new EngineError(
          'MAP_INVALID',
          `Scene motion must have distinct increasing nonnegative ticks: ${object.id}`,
        );
      const { trailSeconds, ...definition } = clone(object);
      return {
        ...definition,
        position: cartesian(object.position),
        motion,
        trailTicks: Math.round(trailSeconds * map.tickRate),
      };
    }),
  };
}
export function compile(
  input: unknown,
  policies: readonly InteractionPolicy[] = [contactPolicy],
  extensions: RuleExtensions = {},
): Compilation {
  if (canonical(input).length > 16_000_000)
    throw new EngineError('SIZE_LIMIT', 'Map exceeds the 16 MB authoring limit');
  const map = parsed(mapSchema, input),
    errors: string[] = [],
    warnings: Compilation['warnings'] = [];
  if (beatValue(map.tempo[0].beat) !== 0) errors.push('Tempo must start at beat 0');
  for (let i = 1; i < map.tempo.length; i++)
    if (beatValue(map.tempo[i].beat) <= beatValue(map.tempo[i - 1].beat))
      errors.push('Tempo beats must strictly increase');
  if (new Set(map.notes.map((n) => n.id)).size !== map.notes.length)
    errors.push('Duplicate note IDs');
  if (new Set(map.groups.map((g) => g.id)).size !== map.groups.length)
    errors.push('Duplicate group IDs');
  if (new Set(policies.map((p) => p.id)).size !== policies.length)
    errors.push('Duplicate policy IDs');
  if (map.music?.frames.some((frame, i, frames) => i > 0 && frame.tick <= frames[i - 1].tick))
    errors.push('Music feature ticks must strictly increase');
  if (map.music && map.music.tickRate !== map.tickRate)
    errors.push('Music and map tick rates must match');
  if (map.turns) {
    validateTurnTrack(map.turns);
    if (map.turns.events.some((e) => e.endBeat > beatValue(map.durationBeats)))
      errors.push('Turn track extends past map duration');
  }
  // Validate tempo before sampling any presentation/emitter paths.
  if (errors.length) throw new EngineError('MAP_INVALID', 'Map compilation failed', errors);
  const scene = compileScene(map);
  const ms = (n: number) => Math.round((n * map.tickRate) / 1000);
  const entities: EntitySpec[] = map.notes.map((note, i) => {
    const policy = policies.find((p) => p.id === note.policy);
    if (!policy) errors.push(`Unknown policy ${note.policy}`);
    else errors.push(...policy.validate(note.config).map((e) => note.id + ': ' + e));
    const hitTick = beatToTick(note.beat, map),
      kind = note.preset === 'hazard' ? 'hazard' : note.preset === 'hold' ? 'hold' : 'strike';
    const duration = note.durationBeats
      ? rationalToTick(plus(rational(note.beat), rational(note.durationBeats)), map) - hitTick
      : ms(note.holdMs) + ms(note.lateMs);
    const endTick = kind === 'strike' ? hitTick + ms(note.lateMs) : hitTick + duration;
    if (hitTick < 1 || endTick > 2147483647) errors.push(`Invalid note time ${note.id}`);
    if (kind === 'hold' && duration < ms(note.holdMs))
      errors.push(`Hold ${note.id} is longer than its available interval`);
    const slots =
      note.slots ??
      (note.preset === 'combined'
        ? [{ semantic: 'left' }, { semantic: 'right' }]
        : note.preset === 'shared'
          ? [{}, {}]
          : note.preset === 'left' || note.preset === 'right'
            ? [{ semantic: note.preset }]
            : [{}]);
    const sameActor = note.sameActor ?? note.preset === 'combined',
      distinctActors = note.distinctActors ?? note.preset === 'shared';
    if (sameActor && distinctActors && slots.length > 1)
      errors.push(`Contradictory actor requirements in ${note.id}`);
    let motion = note.motion.map((k) => ({
      tick: beatToTick(k.beat, map),
      position: cartesian(k.position),
    }));
    if (motion.some((k, j) => k.tick < 1 || (j > 0 && k.tick <= motion[j - 1].tick)))
      errors.push(`Motion keys must have distinct increasing ticks: ${note.id}`);
    let spawnTick = Math.max(1, hitTick - ms(note.earlyMs) - ms(note.leadMs)),
      anchor = note.anchor;
    if (note.emission) {
      const emitter = scene?.objects.find((object) => object.id === note.emission!.source);
      const releaseTick = beatToTick(note.emission.beat, map);
      if (!emitter) errors.push(`Unknown emitter ${note.emission.source}: ${note.id}`);
      else {
        if (note.anchor !== undefined && note.anchor !== emitter.anchor)
          errors.push(`Emitter and target must use the same coordinate anchor: ${note.id}`);
        anchor = emitter.anchor;
        if (releaseTick < 1 || releaseTick >= hitTick || releaseTick > hitTick - ms(note.earlyMs))
          errors.push(`Emission must precede the interaction window: ${note.id}`);
        if (
          motion.some((key) => key.tick <= releaseTick || key.tick === hitTick) ||
          motion.length > 254
        )
          errors.push(
            `Emission motion keys must follow release, omit the implicit hit key, at most 254: ${note.id}`,
          );
        if (motion.some((key) => key.tick > endTick))
          errors.push(`Emission motion must finish within the entity lifetime: ${note.id}`);
        spawnTick = releaseTick;
        motion = [
          { tick: releaseTick, position: scenePositionAt(emitter, releaseTick) },
          ...motion.filter((key) => key.tick < hitTick),
          { tick: hitTick, position: cartesian(note.position) },
          ...motion.filter((key) => key.tick > hitTick),
        ];
      }
    }
    if (
      !Array.isArray(note.position) &&
      (note.position.elevation < -40 ||
        note.position.elevation > 60 ||
        note.position.radius > 2.5 ||
        note.position.radius < 0.3)
    )
      warnings.push({
        path: `notes.${i}.position`,
        message: 'Outside the reference reach envelope; validate the intended play space.',
      });
    if (note.group && !map.groups.some((g) => g.id === note.group && g.members.includes(note.id)))
      errors.push(`Unresolved group membership: ${note.id}`);
    const shape = clone(note.shape);
    if (shape.kind === 'box' && shape.rotation) shape.rotation = quaternion(shape.rotation);
    return {
      id: note.id,
      policy: note.policy,
      config: clone(note.config),
      kind,
      hitTick,
      spawnTick,
      endTick,
      position: cartesian(note.position),
      shape,
      motion,
      ...(anchor ? { anchor } : {}),
      slots,
      sameActor,
      distinctActors,
      window: [ms(note.earlyMs), ms(note.lateMs)],
      minSpeed: note.minSpeed,
      ...(note.direction ? { direction: clone(note.direction) } : {}),
      linkTicks: ms(note.linkMs),
      holdTicks: Math.max(1, ms(note.holdMs)),
      breakTicks: ms(note.breakMs),
      ...(note.group ? { group: note.group } : {}),
      value: note.value,
    };
  });
  const groups = map.groups.map((g) => {
    if (
      new Set(g.members).size !== g.members.length ||
      g.members.some((id) => !entities.some((e) => e.id === id && e.group === g.id))
    )
      errors.push(`Invalid group members: ${g.id}`);
    return {
      id: g.id,
      members: g.members,
      linkTicks: ms(g.linkMs),
      bonus: g.bonus,
      distinctActors: g.distinctActors,
    };
  });
  if (errors.length) throw new EngineError('MAP_INVALID', 'Map compilation failed', errors);
  entities.sort(
    (a, b) =>
      a.spawnTick - b.spawnTick ||
      map.notes.findIndex((n) => n.id === a.id) - map.notes.findIndex((n) => n.id === b.id),
  );
  const rules = defaultRules(map.tickRate);
  rules.hazardPenalty = map.profile.hazardPenalty;
  rules.hazardInterval = Math.max(1, ms(map.profile.hazardIntervalMs));
  validateCapacity(entities, rules.maxEntities);
  return {
    map,
    ...(scene ? { scene } : {}),
    program: {
      version: 1,
      id: map.id,
      title: map.title,
      seed: map.seed,
      rules,
      entities,
      groups,
      policies: [...policies],
      scoring: extensions.scoring ?? defaultScoring,
      arbitration: extensions.arbitration ?? defaultArbitration,
      durationTicks: Math.max(
        beatToTick(map.durationBeats, map),
        ...entities.map((e) => e.endTick),
        1,
      ),
    },
    warnings,
  };
}
export function programDescriptor(program: Program): CompiledProgram {
  return parsed(compiledProgramSchema, {
    ...program,
    policies: program.policies.map((p) => ({ id: p.id, version: p.version })),
    scoring: { id: program.scoring.id, version: program.scoring.version },
    arbitration: { id: program.arbitration.id, version: program.arbitration.version },
  });
}
export async function programIdentity(program: Program): Promise<string> {
  return digest({ ...programDescriptor(program), id: undefined });
}
/** Presentation is protected separately so a theme change does not change collision/scoring identity. */
export function presentationIdentity(map: MapDefinition): Promise<string> {
  return digest({
    version: 1,
    tickRate: map.tickRate,
    tempo: map.tempo,
    offsetSeconds: map.offsetSeconds,
    scene: map.scene ?? null,
    music: map.music ?? null,
    ...(map.generation ? { generation: map.generation } : {}),
    ...(map.playerProfile ? { playerProfile: map.playerProfile } : {}),
    labels: map.notes
      .filter((note) => note.label || note.appearance)
      .map((note) => ({ id: note.id, label: note.label, appearance: note.appearance })),
    ...(map.notes.some((note) => note.presentation)
      ? {
          notePresentation: map.notes
            .filter((note) => note.presentation)
            .map((note) => ({
              id: note.id,
              presentation: note.presentation,
            })),
        }
      : {}),
  });
}
function validateCapacity(entities: readonly EntitySpec[], limit: number): void {
  const edges = entities.flatMap((e) => [
    { tick: e.spawnTick, delta: 1 },
    { tick: e.endTick + 1, delta: -1 },
  ]);
  edges.sort((a, b) => a.tick - b.tick || a.delta - b.delta);
  let active = 0;
  for (const edge of edges) {
    active += edge.delta;
    if (active > limit) throw new EngineError('MAP_CAPACITY', 'Too many simultaneous entities');
  }
}
/** Resolve only trusted, explicitly registered implementations. JSON never contains executable code. */
export function loadCompiled(
  input: unknown,
  policies: readonly InteractionPolicy[] = [contactPolicy],
  extensions: RuleExtensions = {},
): Program {
  const data: CompiledProgram = parsed(compiledProgramSchema, input);
  const scoring = extensions.scoring ?? defaultScoring,
    arbitration = extensions.arbitration ?? defaultArbitration;
  const same = (a: { id: string; version: string }, b: { id: string; version: string }) =>
    a.id === b.id && a.version === b.version;
  const resolved = data.policies.map((ref) => {
    const policy = policies.find((p) => same(p, ref));
    if (!policy)
      throw new EngineError('POLICY_MISMATCH', `Missing policy ${ref.id}@${ref.version}`);
    return policy;
  });
  if (!same(scoring, data.scoring) || !same(arbitration, data.arbitration))
    throw new EngineError('POLICY_MISMATCH', 'Scoring or arbitration version differs');
  if (
    new Set(data.entities.map((e) => e.id)).size !== data.entities.length ||
    new Set(data.groups.map((g) => g.id)).size !== data.groups.length ||
    new Set(resolved.map((p) => p.id)).size !== resolved.length ||
    data.durationTicks > data.rules.maxTick
  )
    throw new EngineError('COMPILED_INVALID', 'Invalid identity or duration');
  for (const [i, e] of data.entities.entries()) {
    const p = resolved.find((p) => p.id === e.policy);
    if (
      !p ||
      p.validate(e.config).length ||
      e.endTick > data.durationTicks ||
      (i > 0 && e.spawnTick < data.entities[i - 1].spawnTick) ||
      (e.sameActor && e.distinctActors && e.slots.length > 1) ||
      (e.group && !data.groups.some((g) => g.id === e.group && g.members.includes(e.id)))
    )
      throw new EngineError('COMPILED_INVALID', `Invalid entity ${e.id}`);
  }
  for (const g of data.groups)
    if (
      new Set(g.members).size !== g.members.length ||
      g.members.some((id) => !data.entities.some((e) => e.id === id && e.group === g.id))
    )
      throw new EngineError('COMPILED_INVALID', `Invalid group ${g.id}`);
  validateCapacity(data.entities, data.rules.maxEntities);
  return { ...data, policies: resolved, scoring, arbitration };
}
export class MapBuilder {
  private data: MapDefinition;
  constructor(input: MapInput) {
    this.data = parsed(mapSchema, input);
  }
  add(note: NoteInput): this {
    this.data = parsed(mapSchema, { ...this.data, notes: [...this.data.notes, note] });
    return this;
  }
  remove(id: string): this {
    this.data.notes = this.data.notes.filter((n) => n.id !== id);
    this.data.groups = this.data.groups.filter((g) => !g.members.includes(id));
    for (const note of this.data.notes)
      if (note.group && !this.data.groups.some((g) => g.id === note.group)) delete note.group;
    return this;
  }
  replace(note: NoteInput): this {
    if (!this.data.notes.some((n) => n.id === note.id))
      throw new EngineError('NOT_FOUND', 'Unknown note');
    const next = clone(this.data);
    next.notes = next.notes.map((n) =>
      n.id === note.id ? (note as MapDefinition['notes'][number]) : n,
    );
    this.data = parsed(mapSchema, next);
    return this;
  }
  setScene(scene?: SceneInput): this {
    this.data = parsed(mapSchema, { ...this.data, scene });
    return this;
  }
  setMusic(music?: MusicTimeline): this {
    this.data = parsed(mapSchema, { ...this.data, music });
    return this;
  }
  export(): MapDefinition {
    return clone(this.data);
  }
  compile(policies?: InteractionPolicy[]): Compilation {
    return compile(this.data, policies);
  }
}
export function generateMap(
  options: {
    seed?: number;
    count?: number;
    style?: 'anchored' | 'approaching' | 'mixed';
    turning?: boolean;
  } = {},
): MapDefinition {
  let seed = options.seed ?? 1;
  const count = options.count ?? 32;
  if (
    !Number.isInteger(seed) ||
    seed < 1 ||
    seed > 4294967295 ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 1000 ||
    (options.style !== undefined &&
      !['anchored', 'approaching', 'mixed'].includes(options.style)) ||
    (options.turning !== undefined && typeof options.turning !== 'boolean')
  )
    throw new EngineError('VALIDATION', 'Invalid generation seed/count');
  const notes: NoteInput[] = [];
  let azimuth = 0;
  for (let i = 0; i < count; i++) {
    const r = nextRandom(seed);
    seed = r.state;
    if (options.turning && i % 4 === 0) azimuth = (azimuth + 45) % 360;
    const beat = 4 + i * 2,
      preset = i % 2 ? 'right' : 'left',
      position = {
        azimuth: azimuth + (preset === 'left' ? -18 : 18),
        elevation: Math.round(r.value * 24 - 12),
        radius: 0.85,
        height: 1.4,
      };
    const moving =
      options.style === 'approaching' || ((options.style ?? 'mixed') === 'mixed' && i % 2 === 1);
    notes.push({
      id: `note-${i}`,
      beat,
      preset,
      position,
      anchor: 'player',
      motion: moving
        ? [
            { beat: beat - 2, position: { ...position, radius: 3 } },
            { beat, position },
          ]
        : [],
    });
  }
  return parsed(mapSchema, {
    version: 1,
    id: `generated-${options.seed ?? 1}`,
    title: 'Generated sequence',
    seed: options.seed ?? 1,
    durationBeats: 6 + count * 2,
    tempo: [{ beat: 0, bpm: 110 }],
    notes,
  });
}
