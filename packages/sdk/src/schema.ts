import { z } from 'zod';
export const idSchema = z.string().regex(/^[\w./:-]{1,100}$/);
export const tickSchema = z.number().int().min(1).max(2147483647);
const num = z.number().finite();
export const vecSchema = z.tuple([
  num.min(-10000).max(10000),
  num.min(-10000).max(10000),
  num.min(-10000).max(10000),
]);
export const quatSchema = z.tuple([num, num, num, num]).refine((q) => {
  const n = q.reduce((s, x) => s + x * x, 0);
  return n > 1e-16 && n < 1e16;
}, 'Nonzero finite quaternion required');
export const jsonSchema = z.json();
export const beatSchema = z.union([
  num.min(0).max(1000000),
  z
    .object({ n: z.number().int().min(0).max(1e9), d: z.number().int().min(1).max(1000000) })
    .strict(),
]);
export const positionSchema = z.union([
  vecSchema,
  z
    .object({
      azimuth: num.min(-36000).max(36000),
      elevation: num.min(-90).max(90),
      radius: num.positive().max(10000),
      height: num.min(-100).max(100).default(1.4),
    })
    .strict(),
]);
export const shapeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('sphere'), radius: num.positive().max(100) }).strict(),
  z
    .object({
      kind: z.literal('box'),
      half: vecSchema.refine((v) => v.every((x) => x > 0 && x <= 100)),
      rotation: quatSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('capsule'),
      a: vecSchema,
      b: vecSchema,
      radius: num.positive().max(100),
    })
    .strict(),
]);
export const slotSchema = z
  .object({
    semantic: idSchema.optional(),
    actorId: idSchema.optional(),
    effectorId: idSchema.optional(),
  })
  .strict();
const unit = num.min(0).max(1);
export const musicChannels = [
  'energy',
  'subBass',
  'bass',
  'lowMid',
  'mid',
  'presence',
  'air',
  'rms',
  'flux',
  'transient',
  'beat',
] as const;
export const musicFeaturesSchema = z
  .object({
    energy: unit,
    subBass: unit,
    bass: unit,
    lowMid: unit,
    mid: unit,
    presence: unit,
    air: unit,
    rms: unit,
    flux: unit,
    transient: unit,
    beat: unit,
  })
  .strict();
export type MusicFeatures = z.infer<typeof musicFeaturesSchema>;
export const musicSchema = z
  .object({
    version: z.literal(1),
    tickRate: z.union([z.literal(60), z.literal(120), z.literal(240)]),
    algorithm: idSchema,
    source: z
      .object({
        name: z.string().min(1).max(240),
        sha256: z.string().regex(/^[a-f0-9]{64}$/),
        durationSeconds: num.positive().max(1800),
      })
      .strict()
      .optional(),
    frames: z
      .array(
        z
          .object({
            tick: z.number().int().min(0).max(2147483647),
            features: musicFeaturesSchema,
          })
          .strict(),
      )
      .max(36001),
  })
  .strict();
export type MusicTimeline = z.infer<typeof musicSchema>;
export const sceneObjectSchema = z
  .object({
    id: idSchema,
    appearance: idSchema,
    label: z.string().min(1).max(160),
    position: positionSchema,
    motion: z
      .array(z.object({ beat: beatSchema, position: positionSchema }).strict())
      .max(4096)
      .default([]),
    anchor: idSchema.optional(),
    scale: num.positive().max(100).default(1),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    trailSeconds: num.min(0).max(30).default(0),
    react: z
      .array(
        z
          .object({
            channel: z.enum(musicChannels),
            property: z.enum(['brightness', 'scale']),
            amount: num.min(-1).max(4),
          })
          .strict(),
      )
      .max(8)
      .default([]),
  })
  .strict();
export const sceneSchema = z
  .object({
    version: z.literal(1),
    theme: idSchema,
    label: z.string().min(1).max(500),
    objects: z.array(sceneObjectSchema).max(128).default([]),
  })
  .strict();
export type SceneDefinition = z.infer<typeof sceneSchema>;
export type SceneInput = z.input<typeof sceneSchema>;
export const playerProfileSchema = z
  .object({
    height: num.min(1).max(2.3).default(1.65),
    roomScale: num.min(0.5).max(1.75).default(1),
  })
  .strict();
export const noteSchema = z
  .object({
    id: idSchema,
    beat: beatSchema,
    preset: z.enum(['left', 'right', 'any', 'combined', 'shared', 'hazard', 'hold']).default('any'),
    position: positionSchema,
    shape: shapeSchema.default({ kind: 'sphere', radius: 0.15 }),
    motion: z
      .array(z.object({ beat: beatSchema, position: positionSchema }).strict())
      .max(256)
      .default([]),
    anchor: idSchema.optional(),
    appearance: idSchema.optional(),
    label: z.string().min(1).max(160).optional(),
    emission: z.object({ source: idSchema, beat: beatSchema }).strict().optional(),
    slots: z.array(slotSchema).min(1).max(4).optional(),
    distinctActors: z.boolean().optional(),
    sameActor: z.boolean().optional(),
    earlyMs: num.min(0).max(5000).default(200),
    lateMs: num.min(0).max(5000).default(200),
    leadMs: num.min(0).max(60000).default(1000),
    linkMs: num.min(0).max(5000).default(100),
    durationBeats: beatSchema.optional(),
    holdMs: num.positive().max(60000).default(500),
    breakMs: num.min(0).max(5000).default(50),
    minSpeed: num.min(0).max(1000).default(0),
    direction: z
      .object({
        vector: vecSchema.refine((v) => v.some((x) => x !== 0)),
        cosine: num.min(-1).max(1),
      })
      .strict()
      .optional(),
    policy: idSchema.default('builtin/contact'),
    config: jsonSchema.default(null),
    group: idSchema.optional(),
    value: z.number().int().min(0).max(100000).default(100),
  })
  .strict();
export const mapSchema = z
  .object({
    version: z.literal(1),
    id: idSchema,
    title: z.string().min(1).max(120),
    description: z.string().max(2000).default(''),
    seed: z.number().int().min(1).max(4294967295).default(1),
    tickRate: z.union([z.literal(60), z.literal(120), z.literal(240)]).default(120),
    offsetSeconds: num.min(-60).max(600).default(0),
    durationBeats: beatSchema,
    tempo: z
      .array(
        z
          .object({
            beat: beatSchema,
            bpm: num.min(20).max(400),
            meter: z
              .tuple([
                z.number().int().min(1).max(32),
                z.union([z.literal(2), z.literal(4), z.literal(8), z.literal(16)]),
              ])
              .default([4, 4]),
          })
          .strict(),
      )
      .min(1)
      .max(256),
    notes: z.array(noteSchema).max(10000),
    scene: sceneSchema.optional(),
    music: musicSchema.optional(),
    playerProfile: playerProfileSchema.optional(),
    generation: z
      .object({
        version: z.literal(1),
        algorithm: idSchema,
        settings: jsonSchema,
      })
      .strict()
      .optional(),
    groups: z
      .array(
        z
          .object({
            id: idSchema,
            members: z.array(idSchema).min(2).max(16),
            linkMs: num.min(0).max(5000).default(100),
            bonus: z.number().int().min(0).max(100000).default(100),
            distinctActors: z.boolean().default(false),
          })
          .strict(),
      )
      .max(2000)
      .default([]),
    profile: z
      .object({
        hazardPenalty: z.number().int().min(0).max(10000).default(25),
        hazardIntervalMs: num.min(10).max(5000).default(100),
      })
      .strict()
      .default({ hazardPenalty: 25, hazardIntervalMs: 100 }),
  })
  .strict();
export type MapInput = z.input<typeof mapSchema>;
export type MapDefinition = z.output<typeof mapSchema>;
export type NoteInput = z.input<typeof noteSchema>;
export type Beat = z.infer<typeof beatSchema>;
export const actorSchema = z
  .object({
    id: idSchema,
    effectors: z
      .array(
        z
          .object({
            id: idSchema,
            semantic: idSchema,
            radius: num.positive().max(2),
            position: vecSchema.optional(),
          })
          .strict(),
      )
      .min(1)
      .max(16),
  })
  .strict()
  .refine(
    (a) => new Set(a.effectors.map((e) => e.id)).size === a.effectors.length,
    'Duplicate effector IDs',
  );
export const compiledEntitySchema = z
  .object({
    id: idSchema,
    policy: idSchema,
    config: jsonSchema,
    kind: z.enum(['strike', 'hold', 'hazard']),
    hitTick: tickSchema,
    spawnTick: tickSchema,
    endTick: tickSchema,
    position: vecSchema,
    shape: shapeSchema,
    motion: z.array(z.object({ tick: tickSchema, position: vecSchema }).strict()).max(256),
    anchor: idSchema.optional(),
    slots: z.array(slotSchema).min(1).max(4),
    distinctActors: z.boolean(),
    sameActor: z.boolean(),
    window: z.tuple([
      z.number().int().nonnegative().max(1200),
      z.number().int().nonnegative().max(1200),
    ]),
    minSpeed: num.min(0).max(1000),
    direction: z
      .object({
        vector: vecSchema.refine((v) => v.some((x) => x !== 0)),
        cosine: num.min(-1).max(1),
      })
      .strict()
      .optional(),
    linkTicks: z.number().int().nonnegative().max(1200),
    holdTicks: z.number().int().positive().max(14400),
    breakTicks: z.number().int().nonnegative().max(1200),
    group: idSchema.optional(),
    value: z.number().int().nonnegative().max(100000),
  })
  .strict()
  .refine((e) => e.spawnTick <= e.hitTick && e.hitTick <= e.endTick, 'Invalid entity timeline')
  .refine(
    (e) => e.motion.every((k, i) => !i || k.tick > e.motion[i - 1].tick),
    'Motion ticks must increase',
  );
const commandBase = { id: idSchema, tick: tickSchema };
const policyRefSchema = z.object({ id: idSchema, version: z.string().min(1).max(64) }).strict();
export const compiledProgramSchema = z
  .object({
    version: z.literal(1),
    id: idSchema,
    title: z.string().min(1).max(120),
    seed: z.number().int().min(1).max(4294967295),
    durationTicks: tickSchema,
    entities: z.array(compiledEntitySchema).max(10000),
    groups: z
      .array(
        z
          .object({
            id: idSchema,
            members: z.array(idSchema).min(2).max(16),
            linkTicks: z.number().int().min(0).max(1200),
            bonus: z.number().int().min(0).max(100000),
            distinctActors: z.boolean(),
          })
          .strict(),
      )
      .max(2000),
    policies: z.array(policyRefSchema).min(1).max(128),
    scoring: policyRefSchema,
    arbitration: policyRefSchema,
    rules: z
      .object({
        tickRate: z.union([z.literal(60), z.literal(120), z.literal(240)]),
        maxTick: tickSchema,
        grades: z
          .array(
            z
              .object({
                within: z.number().int().min(0).max(2147483647),
                name: z.string().min(1).max(64),
                multiplier: num.min(0).max(1000),
              })
              .strict(),
          )
          .min(1)
          .max(32),
        hazardInterval: tickSchema,
        hazardPenalty: z.number().int().min(0).max(10000),
        groupBonus: z.number().int().min(0).max(100000),
        maxActors: z.number().int().min(1).max(16),
        maxEntities: z.number().int().min(1).max(2000),
        maxDirectorSpawnsPerTick: z.number().int().min(1).max(16),
      })
      .strict(),
  })
  .strict();
export type CompiledProgram = z.infer<typeof compiledProgramSchema>;
export const commandSchema = z.discriminatedUnion('type', [
  z.object({ ...commandBase, type: z.literal('actor.add'), actor: actorSchema }).strict(),
  z.object({ ...commandBase, type: z.literal('actor.remove'), actorId: idSchema }).strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('pose'),
      actorId: idSchema,
      effectorId: idSchema,
      position: vecSchema,
      orientation: quatSchema.optional(),
      tracked: z.boolean().optional(),
      active: z.boolean().optional(),
    })
    .strict(),
  z
    .object({
      ...commandBase,
      type: z.literal('calibrate'),
      actorId: idSchema,
      position: vecSchema,
      orientation: quatSchema,
    })
    .strict(),
  z
    .object({ ...commandBase, type: z.literal('director.spawn'), entity: compiledEntitySchema })
    .strict(),
]);
export class EngineError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: unknown = null,
  ) {
    super(message);
    this.name = 'EngineError';
  }
}
export function parsed<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success)
    throw new EngineError(
      'VALIDATION',
      'Input validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  return result.data;
}
