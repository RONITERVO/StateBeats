import { nextRandom, positionAt } from '@statebeats/core';
import type { EntitySpec, Vec3 } from '@statebeats/core';
import { z } from 'zod';
import { beatValue, canonical, compile, cartesian } from './compiler.js';
import { planTurns, musicalTurns, createFacingSampler, facePoint, faceShape } from './turns.js';
import type { TurnPlanner } from './turns.js';
import type { TurnCueInput } from './turn-schema.js';
import { sampleMusic } from './music.js';
import {
  EngineError,
  idSchema,
  musicSchema,
  noteSchema,
  positionSchema,
  parsed,
} from './schema.js';
import type { MapDefinition, MapInput, MusicFeatures, NoteInput } from './schema.js';

export const CHOREOGRAPHY_VERSION = 'statebeats/choreography-v2';
export const musicGenerationSchema = z
  .object({
    id: idSchema.optional(),
    title: z.string().min(1).max(120).optional(),
    seed: z.number().int().min(1).max(4294967295).default(1),
    bpm: z.number().min(40).max(240).default(120),
    tickRate: z.union([z.literal(60), z.literal(120), z.literal(240)]).optional(),
    difficulty: z.enum(['gentle', 'flow', 'busy', 'master']).default('gentle'),
    turning: z.boolean().optional(),
    turnMode: z.enum(['forward', 'bounded', 'full']).optional(),
    turnDegrees: z.number().min(5).max(180).default(30),
    maxTurnSpeed: z.number().min(5).max(120).default(30),
    turnStyle: z.enum(['rests', 'continuous', 'musical']).default('rests'),
    maxTurnAcceleration: z.number().min(10).max(720).default(180),
    maxDirectionalTravel: z.number().min(30).max(1440).default(270),
    movementRange: z.enum(['compact', 'wide']).default('compact'),
    theme: idSchema.default('statebeats/landscape'),
    beatOffsetSeconds: z.number().min(-10).max(30).default(0),
    style: z.enum(['approach', 'stationary', 'mixed']).default('approach'),
    leadSeconds: z.number().min(1).max(8).default(2.5),
    spawnDistance: z.number().min(2).max(1000).default(18),
    playerHeight: z.number().min(1).max(2.3).default(1.65),
    reach: z.number().min(0.4).max(1).default(0.7),
    maxHandSpeed: z.number().min(0.5).max(6).default(3),
    rails: z.boolean().default(true),
    pairs: z.boolean().default(true),
    crossovers: z.boolean().default(false),
    obstacles: z.enum(['none', 'duck']).default('none'),
    rhythm: z.enum(['steady', 'accents', 'hybrid']).default('hybrid'),
  })
  .strict();
export type MusicGenerationOptions = z.input<typeof musicGenerationSchema>;
export type GenerationSettings = z.output<typeof musicGenerationSchema>;
export type Motif = 'pulses' | 'arcs' | 'pairs' | 'rail-counterpoint' | 'crossovers';
export interface PhrasePlan {
  index: number;
  beat: number;
  endBeat: number;
  heading: number;
  energy: number;
  section: 'quiet' | 'steady' | 'lift';
  motif: Motif;
}
export interface PhraseContext {
  phrase: PhrasePlan;
  settings: GenerationSettings;
  /** Coordinates are relative to the facing direction; x/y/z are metres. */
  place(x: number, y: number, z?: number, beat?: number): Vec3;
}
export interface PhraseComposer {
  id: string;
  compose(context: PhraseContext): NoteInput[];
}
export interface FacingPlanner {
  id: string;
  /** One unwrapped yaw in degrees per phrase. Rest intervals must accommodate turns. */
  plan(phrases: readonly Omit<PhrasePlan, 'heading'>[], settings: GenerationSettings): number[];
}
export interface MusicalSelector {
  id: string;
  select(context: {
    note: NoteInput;
    phrase: PhrasePlan;
    features: MusicFeatures;
    settings: GenerationSettings;
  }): boolean;
}
export interface GenerationAdapters {
  composer?: PhraseComposer;
  facing?: FacingPlanner;
  selector?: MusicalSelector;
  turns?: TurnPlanner;
}
export interface ChoreographyIssue {
  code: 'reach' | 'hand-conflict' | 'hand-speed' | 'rail-speed';
  notes: string[];
  message: string;
}
export interface ChoreographyReport {
  version: 1;
  algorithm: string;
  composer: string;
  facing: string;
  selector: string;
  settings: GenerationSettings;
  phrases: PhrasePlan[];
  summary: {
    heads: number;
    rails: number;
    pairs: number;
    hazards: number;
    durationSeconds: number;
    peakHandSpeed: number;
  };
  omitted: { note: string; reason: string }[];
  issues: ChoreographyIssue[];
  notices: string[];
  turns?: ReturnType<typeof planTurns>;
}
const round = (n: number) => Math.round(n * 1e6) / 1e6 || 0;
const distance = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const hands = (entity: EntitySpec): string[] => [
  ...new Set(
    entity.slots.flatMap((slot) =>
      slot.semantic === 'left' || slot.semantic === 'right' ? [slot.semantic] : ['left', 'right'],
    ),
  ),
];

/** A conservative authoring check, not a biomechanical or room-clearance certification. */
export function inspectChoreography(input: unknown, profile: MusicGenerationOptions = {}) {
  const settings = parsed(musicGenerationSchema, profile),
    { program } = compile(input);
  const issues: ChoreographyIssue[] = [];
  const last = new Map<string, { end: number; position: Vec3; id: string }>();
  let peakHandSpeed = 0;
  const center: Vec3 = [0, settings.playerHeight * 0.78, 0];
  for (const entity of [...program.entities].sort(
    (a, b) => a.hitTick - b.hitTick || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  )) {
    if (entity.kind === 'hazard') continue;
    const start = entity.hitTick;
    const end = entity.kind === 'hold' ? entity.endTick : start;
    const points = [
      { tick: start, position: positionAt(entity, start) },
      ...entity.motion.filter((k) => k.tick > start && k.tick < end),
      ...(end > start ? [{ tick: end, position: positionAt(entity, end) }] : []),
    ];
    if (points.some((p) => distance(p.position, center) > settings.reach + 0.001))
      issues.push({
        code: 'reach',
        notes: [entity.id],
        message: 'Contact path exceeds the configured reach sphere.',
      });
    for (let i = 1; i < points.length; i++) {
      const speed =
        (distance(points[i - 1].position, points[i].position) * program.rules.tickRate) /
        (points[i].tick - points[i - 1].tick);
      peakHandSpeed = Math.max(peakHandSpeed, speed);
      if (speed > settings.maxHandSpeed + 0.001)
        issues.push({
          code: 'rail-speed',
          notes: [entity.id],
          message: 'Held path exceeds the configured hand speed.',
        });
    }
    for (const hand of hands(entity)) {
      const prior = last.get(hand);
      if (prior) {
        const gap = start - prior.end;
        if (gap <= 0)
          issues.push({
            code: 'hand-conflict',
            notes: [prior.id, entity.id],
            message: `Overlapping ${hand} requirements.`,
          });
        else {
          const speed =
            (distance(prior.position, points[0].position) * program.rules.tickRate) / gap;
          peakHandSpeed = Math.max(peakHandSpeed, speed);
          if (speed > settings.maxHandSpeed + 0.001)
            issues.push({
              code: 'hand-speed',
              notes: [prior.id, entity.id],
              message: `${hand} transition exceeds the configured hand speed.`,
            });
        }
      }
      // Do not allow a shorter overlapping event to hide a longer reservation.
      if (!prior || end >= prior.end)
        last.set(hand, { end, position: points.at(-1)!.position, id: entity.id });
    }
  }
  return {
    issues,
    peakHandSpeed: round(peakHandSpeed),
    scope:
      'Authored hand centers; excludes room geometry, tracking, shoulder biomechanics and obstacle clearance.',
  };
}

export const phraseFacing: FacingPlanner = {
  id: 'statebeats/phrase-facing-v1',
  plan(phrases, settings) {
    const mode = settings.turnMode ?? (settings.turning ? 'full' : 'forward');
    let heading = 0,
      direction = 1;
    const turnBeats = settings.turnStyle === 'continuous' ? 8 : 2;
    const step = Math.min(
      settings.turnDegrees,
      (settings.maxTurnSpeed * turnBeats * 60) / settings.bpm,
      mode === 'bounded' ? 60 : Infinity,
    );
    return phrases.map((_, i) => {
      if (i && mode !== 'forward') {
        if (mode === 'bounded' && Math.abs(heading + direction * step) > 60) direction *= -1;
        heading += direction * step;
      }
      return round(heading);
    });
  },
};

export const phraseRhythm: MusicalSelector = {
  id: 'statebeats/phrase-rhythm-v1',
  select({ note, phrase, features, settings }) {
    const accent = Math.max(features.transient, features.flux, features.beat);
    const offset = beatValue(note.beat) - phrase.beat;
    const subdivision = Math.abs(offset - Math.round(offset)) > 0.01;
    return (
      !(settings.rhythm === 'accents' && accent < 0.08) &&
      !(settings.rhythm === 'hybrid' && subdivision && phrase.section === 'quiet' && accent < 0.08)
    );
  },
};

/** Original reusable movement phrases. No commercial chart data is included. */
export const dancePhrases: PhraseComposer = {
  id: 'statebeats/dance-phrases-v1',
  compose({ phrase: p, settings: s, place }) {
    const result: NoteInput[] = [];
    const spacing = s.difficulty === 'gentle' ? 2 : s.difficulty === 'flow' ? 1 : 0.5;
    const lateBeats = Math.min((0.15 * s.bpm) / 60, 0.4);
    const playableEnd = Math.min(p.endBeat - p.beat, s.turnStyle === 'rests' ? 6 : 8) - lateBeats;
    const width = s.reach * (s.movementRange === 'wide' ? 0.92 : 0.5),
      height = s.reach * (s.movementRange === 'wide' ? 0.95 : 0.32);
    const variant = p.index % 4,
      mirror = variant >= 2 ? -1 : 1;
    const add = (offset: number, hand: 'left' | 'right', x: number, y: number) => {
      result.push({
        id: `p${p.index}-${result.length}`,
        beat: round(p.beat + offset),
        preset: hand,
        position: place(x, y, undefined, p.beat + offset),
        label: `${hand} ${p.motif}`,
        appearance: 'statebeats/star',
      });
    };
    if (p.motif === 'rail-counterpoint' && playableEnd >= 4) {
      const hand = p.index % 2 ? 'right' : 'left',
        sign = hand === 'left' ? -1 : 1;
      const end = 3.5,
        start = place(sign * width, -height * 0.6);
      result.push({
        id: `p${p.index}-rail`,
        beat: p.beat,
        preset: 'hold',
        slots: [{ semantic: hand }],
        position: start,
        holdMs: (end * 60000) / s.bpm,
        durationBeats: end + 0.25,
        earlyMs: 0,
        lateMs: 100,
        label: `Follow the ${hand} arc`,
        appearance: 'statebeats/star',
        motion: Array.from({ length: 14 }, (_, i) => {
          const phase = (i + 1) / 14;
          return {
            beat: round(p.beat + end * phase),
            position: place(
              sign * width * (0.8 + 0.15 * Math.sin(Math.PI * phase)),
              height * (-0.6 + 1.2 * Math.sin(Math.PI * phase)),
              undefined,
              p.beat + end * phase,
            ),
          };
        }),
      });
      for (let i = 0; i < playableEnd; i += spacing)
        add(
          i,
          hand === 'left' ? 'right' : 'left',
          -sign * width,
          height * Math.sin((i * Math.PI) / 3),
        );
    } else {
      for (let i = 0, index = 0; i < playableEnd; i += spacing, index++) {
        if (p.motif === 'pairs') {
          add(i, 'left', -width, height * Math.sin((i * Math.PI) / 3));
          add(
            i,
            'right',
            width,
            height * Math.sin((i * Math.PI) / 3) * (s.difficulty === 'master' ? -1 : 1),
          );
        } else {
          const left = (p.motif === 'pulses' ? Math.floor(index / 2) : index) % 2 === 0;
          const hand = left === (mirror === 1) ? 'left' : 'right';
          const sign = hand === 'left' ? -1 : 1;
          const x =
            p.motif === 'crossovers'
              ? width * Math.cos((index * Math.PI) / 3) * sign
              : width * sign * (0.8 + 0.2 * Math.cos((index * Math.PI) / 3));
          const y =
            p.motif === 'pulses'
              ? index % 2
                ? height
                : -height * 0.5
              : height * Math.sin((index * Math.PI) / 3 + (variant * Math.PI) / 2);
          add(i, hand, x, y);
        }
      }
    }
    return result;
  },
};

/** Composes a saved chart. Musical selection, movement and facing are independent of playback. */
export function generateChoreography(
  input: unknown,
  options: MusicGenerationOptions = {},
  adapters: GenerationAdapters = {},
): { map: MapDefinition; report: ChoreographyReport } {
  const s = parsed(musicGenerationSchema, options),
    music = parsed(musicSchema, input);
  const tickRate = s.tickRate ?? music.tickRate;
  if (
    tickRate !== music.tickRate ||
    music.frames.length < 2 ||
    music.frames.some((f, i) => i > 0 && f.tick <= music.frames[i - 1].tick)
  )
    throw new EngineError('VALIDATION', 'Music needs increasing frames and matching tick rates.');
  const secondsPerBeat = 60 / s.bpm,
    beatTicks = secondsPerBeat * tickRate;
  const audioStart = music.frames[0].tick / tickRate,
    endSeconds = music.frames.at(-1)!.tick / tickRate;
  const origin = (audioStart + s.beatOffsetSeconds) / secondsPerBeat;
  const earliest = Math.max(audioStart + s.leadSeconds, s.leadSeconds + 0.1) / secondsPerBeat;
  const first = origin + Math.max(0, Math.ceil((earliest - origin) / 2)) * 2;
  const last = (endSeconds - 0.25) / secondsPerBeat;
  if (last - first < 2)
    throw new EngineError(
      'MUSIC_TOO_SHORT',
      'Choose a song with room for an approach and a movement phrase.',
    );
  if (endSeconds - audioStart > 1800)
    throw new EngineError('VALIDATION', 'Music is limited to 30 minutes.');
  const mean = music.frames.reduce((n, f) => n + f.features.energy, 0) / music.frames.length;
  let seed = s.seed;
  const plans: Omit<PhrasePlan, 'heading'>[] = [];
  const motifs: Motif[] = [
    'pulses',
    'arcs',
    ...(s.pairs ? ['pairs' as const] : []),
    ...(s.rails ? ['rail-counterpoint' as const] : []),
    ...(s.crossovers ? ['crossovers' as const] : []),
  ];
  for (let beat = first, index = 0; beat + 1 < last; beat += 8, index++) {
    const energy =
      Array.from(
        { length: 8 },
        (_, i) => sampleMusic(music, Math.round((beat + i) * beatTicks)).energy,
      ).reduce((a, b) => a + b, 0) / 8;
    const random = nextRandom(seed);
    seed = random.state;
    // A stable small vocabulary returns with height/mirror variations across phrases.
    const motif = motifs[(index + Math.floor(random.value * motifs.length)) % motifs.length];
    plans.push({
      index,
      beat: round(beat),
      endBeat: round(Math.min(last, beat + 8)),
      energy: round(energy),
      section: energy < mean * 0.65 ? 'quiet' : energy > mean * 1.2 ? 'lift' : 'steady',
      motif,
    });
  }
  const composer = adapters.composer ?? dancePhrases,
    facing = adapters.facing ?? phraseFacing,
    selector = adapters.selector ?? phraseRhythm;
  const musical = s.turnStyle === 'musical';
  if ((musical && adapters.facing) || (!musical && adapters.turns))
    throw new EngineError(
      'CHOREOGRAPHY_INVALID',
      'Use the turns adapter for musical turning and facing for legacy styles.',
    );
  parsed(idSchema, composer.id);
  parsed(idSchema, facing.id);
  parsed(idSchema, selector.id);
  const headings = musical
    ? plans.map(() => 0)
    : facing.plan(structuredClone(plans), structuredClone(s));
  const mode = s.turnMode ?? (s.turning ? 'full' : 'forward');
  const turnBeats = s.turnStyle === 'continuous' ? 8 : 2;
  if (
    headings.length !== plans.length ||
    headings.some(
      (h, i) =>
        !Number.isFinite(h) ||
        Math.abs(h) > 36000 + s.maxTurnSpeed * endSeconds ||
        (mode === 'forward' && h !== 0) ||
        (mode === 'bounded' && Math.abs(h) > 60) ||
        (i > 0 &&
          Math.abs(h - headings[i - 1]) > s.maxTurnSpeed * turnBeats * secondsPerBeat + 0.0001),
    )
  )
    throw new EngineError(
      'CHOREOGRAPHY_INVALID',
      'Facing planner exceeds the selected turn budget.',
    );
  const phrases = plans.map((p, i) => ({ ...p, heading: headings[i] }));
  let headingAt = (beat: number) => {
    const index = Math.max(0, Math.min(phrases.length - 1, Math.floor((beat - first + 1e-6) / 8)));
    const phrase = phrases[index],
      next = phrases[index + 1];
    if (musical || s.turnStyle === 'rests' || !next) return phrase.heading;
    return (
      phrase.heading +
      (next.heading - phrase.heading) * Math.max(0, Math.min(1, (beat - phrase.beat) / 8))
    );
  };
  const sceneKeys: { beat: number; position: Vec3 }[] = [];
  const emitter = (heading: number): Vec3 => {
    const angle = (heading * Math.PI) / 180;
    return [
      round(Math.sin(angle) * s.spawnDistance),
      round(s.playerHeight + 3),
      round(-Math.cos(angle) * s.spawnDistance),
    ];
  };
  for (let i = 0; i < phrases.length; i++) {
    const p = phrases[i];
    const beat = Math.max(0, p.beat - s.leadSeconds / secondsPerBeat);
    if (s.turnStyle !== 'rests') {
      // Four keys per phrase preserve a bounded curved source path without stopping spawns.
      for (let offset = 0; offset < Math.min(8, p.endBeat - p.beat); offset += 2)
        sceneKeys.push({
          beat: round(beat + offset),
          position: emitter(headingAt(p.beat + offset)),
        });
      continue;
    }
    if (i)
      sceneKeys.push({
        beat: round(Math.max(sceneKeys.at(-1)!.beat + 0.001, beat - 2)),
        position: emitter(phrases[i - 1].heading),
      });
    sceneKeys.push({ beat: round(beat), position: emitter(p.heading) });
  }
  // Keep every hold/turn boundary: decimating these keys changes actual emission positions.
  // Thirty minutes at 240 BPM needs at most 3,600 keys, within the scene's 4,096-key bound.
  const path = sceneKeys;
  const map: MapInput = {
    version: 1,
    id: s.id ?? `music-${s.seed}`,
    title: s.title ?? 'Your rhythm in motion',
    seed: s.seed,
    tickRate,
    description:
      'Original musical movement phrases with planned facing, stored timing, independent hands and deterministic authoring checks.',
    durationBeats: round(endSeconds / secondsPerBeat + 1),
    tempo: [{ beat: 0, bpm: s.bpm }],
    music,
    playerProfile: { height: s.playerHeight, roomScale: 1 },
    generation: {
      version: 1,
      algorithm: CHOREOGRAPHY_VERSION,
      settings: JSON.parse(
        canonical({
          ...s,
          composer: composer.id,
          facing: musical ? (adapters.turns ?? musicalTurns).id : facing.id,
          selector: selector.id,
        }),
      ),
    },
    scene: {
      version: 1,
      theme: s.theme,
      label:
        s.turnStyle !== 'rests'
          ? 'Follow the traveling sun through continuous turns.'
          : 'Follow the traveling sun; each phrase has a stable facing direction.',
      objects: [
        {
          id: 'sun',
          appearance: 'statebeats/sun',
          label: 'Next phrase direction',
          anchor: 'player',
          position: path[0].position,
          motion: path,
          trailSeconds: 4,
          color: '#ffd58a',
          react: [
            { channel: 'energy', property: 'brightness', amount: 1.5 },
            { channel: 'bass', property: 'scale', amount: 0.15 },
          ],
        },
      ],
    },
    notes: [],
  };
  const omitted: ChoreographyReport['omitted'] = [];
  const draft: NoteInput[] = [];
  for (const phrase of phrases) {
    const place = (
      x: number,
      y: number,
      z = -s.reach * (s.movementRange === 'wide' ? 0.4 : 0.64),
      beat = phrase.beat,
    ): Vec3 => {
      const radians = (headingAt(beat) * Math.PI) / 180;
      // Wide gestures use the full configured reach, including opposed high/low pairs.
      const scale =
        s.movementRange === 'wide' ? Math.min(1, (s.reach * 0.98) / Math.hypot(x, y, z)) : 1;
      return [
        round((x * Math.cos(radians) - z * Math.sin(radians)) * scale),
        round(s.playerHeight * 0.78 + y * scale),
        round((x * Math.sin(radians) + z * Math.cos(radians)) * scale),
      ];
    };
    const notes = composer.compose({
      phrase: structuredClone(phrase),
      settings: structuredClone(s),
      place,
    });
    if (!Array.isArray(notes) || notes.length > 128)
      throw new EngineError(
        'CHOREOGRAPHY_INVALID',
        'Composer must return at most 128 notes per phrase.',
      );
    for (const [i, raw] of notes.entries()) {
      parsed(noteSchema, raw);
      const note = structuredClone(raw),
        beat = beatValue(note.beat);
      const lateMs =
        note.preset === 'hold'
          ? Math.min(50, secondsPerBeat * 200)
          : Math.min(150, secondsPerBeat * 400);
      const interactionEnd = Math.min(
        phrase.endBeat,
        phrase.beat + (s.turnStyle === 'rests' ? 6 : 8),
      );
      const lifetimeBeats =
        note.preset === 'hold' || note.preset === 'hazard'
          ? note.durationBeats !== undefined
            ? beatValue(note.durationBeats)
            : ((note.holdMs ?? 500) + lateMs) / 1000 / secondsPerBeat
          : lateMs / 1000 / secondsPerBeat;
      if (beat < phrase.beat || beat >= interactionEnd || beat + lifetimeBeats > interactionEnd)
        throw new EngineError(
          'CHOREOGRAPHY_INVALID',
          'Composer must respect the selected phrase interval and recovery and turning budget.',
        );
      const features = sampleMusic(music, Math.round(beat * beatTicks));
      if (
        features.rms < 0.004 ||
        !selector.select(structuredClone({ note, phrase, features, settings: s }))
      ) {
        omitted.push({
          note: note.id,
          reason: features.rms < 0.004 ? 'silence' : 'musical-selection',
        });
        continue;
      }
      note.anchor = 'player';
      note.earlyMs = note.preset === 'hold' ? 0 : 100;
      note.lateMs = lateMs;
      note.shape ??= { kind: 'sphere', radius: s.difficulty === 'gentle' ? 0.14 : 0.11 };
      note.leadMs = s.leadSeconds * 1000;
      if (s.style === 'approach' || (s.style === 'mixed' && i % 2 === 0))
        note.emission = { source: 'sun', beat: round(beat - s.leadSeconds / secondsPerBeat) };
      else if (note.motion?.length && beatValue(note.motion[0].beat) > beat)
        note.motion.unshift({ beat: note.beat, position: structuredClone(note.position) });
      draft.push(note);
    }
    if (
      s.obstacles === 'duck' &&
      phrase.index % 4 === 3 &&
      phrase.endBeat - phrase.beat >= 6 &&
      phrase.section !== 'quiet'
    ) {
      const beat = phrase.beat + 4;
      draft.push({
        id: `p${phrase.index}-duck`,
        beat,
        preset: 'hazard',
        slots: [{ semantic: 'head' }],
        anchor: 'player',
        label: 'Duck beneath the arch',
        position: [0, s.playerHeight, 0],
        shape: { kind: 'box', half: [s.reach, 0.12, 0.25] },
        durationBeats: 1,
        leadMs: s.leadSeconds * 1000,
        earlyMs: 0,
        lateMs: 0,
      });
    }
  }
  if (draft.length > 10000)
    throw new EngineError(
      'MAP_CAPACITY',
      'Reduce density or shorten the song; at most 10,000 interactions.',
    );
  let turnPlan: ReturnType<typeof planTurns> | undefined;
  if (musical) {
    // Compose/select once in local facing, then read actual per-hand movement, never the
    // alternating left/right hand centers as if they were one zigzagging hand.
    const cues: TurnCueInput[] = [];
    const point = (p: NoteInput['position']) => cartesian(parsed(positionSchema, p));
    const samples = draft
      .filter((n) => n.preset !== 'hazard')
      .flatMap((n) => {
        const semantic = n.slots?.[0]?.semantic ?? n.preset ?? 'any';
        return [
          { beat: beatValue(n.beat), x: point(n.position)[0], hand: semantic },
          ...(n.motion ?? []).map((p) => ({
            beat: beatValue(p.beat),
            x: point(p.position)[0],
            hand: semantic,
          })),
        ];
      });
    for (const phrase of phrases)
      for (let start = phrase.beat; start + 1 < phrase.endBeat; start += 4) {
        const end = Math.min(start + 4, phrase.endBeat);
        const points = samples
          .filter((p) => p.beat >= start && p.beat < end)
          .sort((a, b) => a.beat - b.beat);
        let displacement = 0,
          travel = 0;
        for (const hand of new Set(points.map((p) => p.hand))) {
          const path = points.filter((p) => p.hand === hand);
          if (path.length < 2) continue;
          displacement += path.at(-1)!.x - path[0].x;
          for (let i = 1; i < path.length; i++) travel += Math.abs(path[i].x - path[i - 1].x);
        }
        const directed = Math.abs(displacement) > 0.12 && Math.abs(displacement) > travel * 0.45;
        const settle = new Set(points.map((p) => p.beat)).size < 2;
        cues.push({
          id: `turn-${cues.length}`,
          beat: start,
          endBeat: Math.max(start + 1, Math.min(end, points.at(-1)?.beat ?? end)),
          gesture: settle ? 'settle' : 'sweep',
          ...(directed
            ? { direction: displacement > 0 ? ('right' as const) : ('left' as const) }
            : {}),
          strength: phrase.section === 'lift' ? 1 : phrase.section === 'quiet' ? 0.3 : 0.65,
          reason: `${phrase.motif}: ${settle ? 'sparse passage' : directed ? 'coherent hand sweep' : 'balanced or answering movement'}`,
        });
      }
    turnPlan = planTurns(
      cues,
      {
        bpm: s.bpm,
        seed: s.seed,
        mode,
        degrees: s.turnDegrees,
        maxSpeed: s.maxTurnSpeed,
        maxAcceleration: s.maxTurnAcceleration,
        maxDirectionalTravel: s.maxDirectionalTravel,
      },
      adapters.turns,
    );
    map.turns = turnPlan.track;
    headingAt = createFacingSampler(turnPlan.track);
    for (const phrase of phrases) phrase.heading = round(headingAt(phrase.beat));
    for (const note of draft) {
      const angle = headingAt(beatValue(note.beat));
      note.position = facePoint(point(note.position), angle);
      for (const key of note.motion ?? [])
        key.position = facePoint(point(key.position), headingAt(beatValue(key.beat)));
      if (note.shape) note.shape = faceShape(note.shape, angle);
      if (note.direction) note.direction.vector = facePoint(note.direction.vector, angle);
    }
    // Every source key anticipates the facing at contact, preserving the existing travel time.
    for (const key of path)
      key.position = emitter(headingAt(key.beat + s.leadSeconds / secondsPerBeat));
    map.scene!.objects![0].position = path[0].position;
    map.scene!.label = 'Follow the musical sweeps and answers; notes keep arriving during turns.';
  }
  // Compile and inspect, then remove later conflicting requirements deterministically. Repeat only
  // if a removal exposes a different transition. Custom composers obey the same checks.
  map.notes = draft;
  for (let pass = 0; pass < draft.length + 1; pass++) {
    const check = inspectChoreography(map, s);
    if (!check.issues.length) break;
    const remove = new Set(check.issues.map((issue) => issue.notes.at(-1)!));
    for (const id of remove)
      omitted.push({
        note: id,
        reason: check.issues.find((issue) => issue.notes.at(-1) === id)!.code,
      });
    map.notes = map.notes.filter((note) => !remove.has(note.id));
    if (!map.notes.some((note) => note.preset !== 'hazard')) break;
  }
  if (!map.notes.some((note) => note.preset !== 'hazard'))
    throw new EngineError(
      'MUSIC_SILENT',
      'No playable musical events remain; check rhythm, tempo and reach settings.',
    );
  const result = compile(map).map,
    check = inspectChoreography(result, s);
  const times = new Map<string, number>();
  for (const n of result.notes.filter((n) => n.preset !== 'hazard'))
    times.set(String(beatValue(n.beat)), (times.get(String(beatValue(n.beat))) ?? 0) + 1);
  return {
    map: result,
    report: {
      version: 1,
      algorithm: CHOREOGRAPHY_VERSION,
      composer: composer.id,
      facing: musical ? (adapters.turns ?? musicalTurns).id : facing.id,
      selector: selector.id,
      settings: s,
      phrases,
      summary: {
        heads: result.notes.filter((n) => n.preset !== 'hazard').length,
        rails: result.notes.filter((n) => n.preset === 'hold').length,
        pairs: [...times.values()].filter((n) => n > 1).length,
        hazards: result.notes.filter((n) => n.preset === 'hazard').length,
        durationSeconds: round(endSeconds - audioStart),
        peakHandSpeed: check.peakHandSpeed,
      },
      omitted,
      issues: check.issues,
      ...(turnPlan ? { turns: turnPlan } : {}),
      notices: [
        'Beat timing uses your BPM and beat offset. Energy regions are estimates, not detected verse/chorus labels.',
        'Reach/speed checks cover authored hand centers. Validate tracking, visibility, turn comfort and obstacle clearance on a headset.',
        ...(s.obstacles !== 'none'
          ? ['Duck obstacles require a standing playtest and suitable play space.']
          : []),
      ],
    },
  };
}

/** Compatibility entry point; use generateChoreography when you also need the authoring report. */
export function generateMusicMap(
  input: unknown,
  options: MusicGenerationOptions = {},
): MapDefinition {
  return generateChoreography(input, options).map;
}
