import { z } from 'zod';

const duration = z.union([
  z.object({ ms: z.number().finite().min(0).max(5000) }).strict(),
  z.object({ beats: z.number().finite().min(0).max(8) }).strict(),
]);
/** Portable timing policy. Artwork is selected separately by the appearance adapter. */
export const notePresentationSchema = z
  .object({
    version: z.literal(1).default(1),
    presence: z.enum(['instant', 'fade', 'emerge']).default('fade'),
    appearMs: z.number().finite().min(0).max(2000).default(160),
    releaseMs: z.number().finite().min(0).max(2000).default(240),
    guide: z.enum(['window', 'none', 'full']).default('window'),
    ahead: duration.default({ ms: 350 }),
    behind: duration.default({ ms: 180 }),
    // Opt-in: omission preserves earlier maps and their presentation hashes.
    readiness: z
      .object({
        preview: duration.default({ beats: 2 }),
        prepare: duration.default({ beats: 1 }),
      })
      .strict()
      .optional(),
  })
  .strict();
export type NotePresentation = z.infer<typeof notePresentationSchema>;
export type NotePresentationInput = z.input<typeof notePresentationSchema>;
