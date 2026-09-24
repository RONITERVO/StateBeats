import { z } from 'zod';

const finite = z.number().finite();
const id = z.string().regex(/^[\w./:-]{1,100}$/);
export const turnCueSchema = z
  .object({
    id,
    beat: finite.min(0).max(1_000_000),
    endBeat: finite.min(0).max(1_000_000),
    gesture: z.enum(['sweep', 'continue', 'answer', 'settle']),
    direction: z.enum(['left', 'right']).optional(),
    strength: finite.min(0).max(1).default(1),
    degrees: finite.min(1).max(360).optional(),
    reason: z.string().min(1).max(240),
  })
  .strict();
export const turnSettingsSchema = z
  .object({
    bpm: finite.min(20).max(400).default(120),
    seed: finite.int().min(1).max(4294967295).default(1),
    mode: z.enum(['forward', 'bounded', 'full']).default('full'),
    degrees: finite.min(1).max(360).default(45),
    maxSpeed: finite.min(1).max(180).default(60),
    maxAcceleration: finite.min(1).max(720).default(180),
    maxDirectionalTravel: finite.min(1).max(1440).default(270),
    range: finite.min(1).max(180).default(60),
  })
  .strict();
export const turnTrackSchema = z
  .object({
    version: z.literal(1),
    planner: id,
    initialHeading: finite.min(-1_000_000).max(1_000_000),
    events: z
      .array(
        z
          .object({
            id,
            beat: finite.min(0).max(1_000_000),
            endBeat: finite.min(0).max(1_000_000),
            angle: finite.min(-360).max(360),
            curve: z.literal('smootherstep'),
            reason: z.string().min(1).max(500),
          })
          .strict(),
      )
      .max(8192),
  })
  .strict();
export type TurnCue = z.output<typeof turnCueSchema>;
export type TurnCueInput = z.input<typeof turnCueSchema>;
export type TurnSettings = z.output<typeof turnSettingsSchema>;
export type TurnOptions = z.input<typeof turnSettingsSchema>;
export type TurnTrack = z.infer<typeof turnTrackSchema>;
