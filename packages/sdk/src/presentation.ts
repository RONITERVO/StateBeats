import { add, positionAt, rotate } from '@statebeats/core';
import type { LiveEntity, Vec3 } from '@statebeats/core';
import { beatToTick, beatValue } from './compiler.js';
import type { MapDefinition } from './schema.js';
import { notePresentationSchema } from './presentation-schema.js';
import type { NotePresentation } from './presentation-schema.js';

export const PRESENTATION_VERSION = 'statebeats/note-presentation-v1';
export interface TargetPresentation {
  version: 1;
  phase: 'hidden' | 'appearing' | 'approaching' | 'waiting' | 'ready' | 'active' | 'resolved';
  arrival: 'approach' | 'materialize';
  presence: NotePresentation['presence'];
  /** Normalized lifecycle values, not mandatory opacity or scale instructions. */
  appearanceProgress: number;
  releaseProgress: number;
  visibility: number;
  spawnTick: number;
  readyTick: number;
  /** Scheduled availability, never a claim that a hand has acquired the target. */
  readiness?: {
    phase: 'hidden' | 'waiting' | 'preparing' | 'ready' | 'resolved';
    previewTick: number;
    prepareTick: number;
    progress: number;
  };
  resolveTick?: number;
  outcome?: 'hit' | 'missed' | 'expired';
  guide: NotePresentation['guide'];
  /** World-space points on the scored trajectory. No decorative smoothing. */
  path: { tick: number; position: Vec3; strength: number }[];
}
export interface TargetResolution {
  tick: number;
  outcome: 'hit' | 'missed' | 'expired';
}
const clamp = (x: number) => Math.max(0, Math.min(1, x));
const smooth = (x: number) => x * x * (3 - 2 * x);

/** A pure tick-to-cue projection shared by renderers, audio, text, bots and manual tooling. */
export function createNotePresenter(map: MapDefinition) {
  const settings = new Map(map.notes.map((n) => [n.id, n.presentation]));
  const defaults = notePresentationSchema.parse({});
  const tempo = map.tempo.map((t) => ({
    beat: beatValue(t.beat),
    tick: beatToTick(t.beat, map),
    bpm: t.bpm,
  }));
  const windowTick = (tick: number, span: NotePresentation['ahead'], direction: number) => {
    if ('ms' in span) return tick + direction * Math.round((span.ms * map.tickRate) / 1000);
    if (span.beats === 0) return tick;
    const segment = [...tempo].reverse().find((s) => s.tick <= tick) ?? tempo[0];
    const beat = segment.beat + ((tick - segment.tick) * segment.bpm) / (60 * map.tickRate);
    return beatToTick(Math.max(0, beat + direction * span.beats), map);
  };
  const policyFor = (id: string, kind: LiveEntity['spec']['kind']) => {
    const policy = settings.get(id);
    return (
      policy ?? { ...defaults, guide: kind === 'hold' ? ('window' as const) : ('none' as const) }
    );
  };
  const releaseTicks = (id: string, kind: LiveEntity['spec']['kind']) =>
    Math.round((policyFor(id, kind).releaseMs * map.tickRate) / 1000);
  function sample(
    entity: Pick<LiveEntity, 'spec' | 'transform'>,
    tick: number,
    resolution?: TargetResolution,
  ): TargetPresentation {
    const { spec, transform } = entity;
    const policy = policyFor(spec.id, spec.kind);
    const at = (t: number) =>
      add(rotate(positionAt(spec, t), transform.orientation), transform.position);
    const readyTick =
      spec.kind === 'strike'
        ? Math.max(spec.spawnTick, spec.hitTick - spec.window[0])
        : spec.hitTick;
    const previewTick = policy.readiness
      ? Math.max(
          spec.spawnTick,
          Math.min(readyTick, windowTick(readyTick, policy.readiness.preview, -1)),
        )
      : spec.spawnTick;
    const prepareTick = policy.readiness
      ? Math.max(
          previewTick,
          Math.min(readyTick, windowTick(readyTick, policy.readiness.prepare, -1)),
        )
      : readyTick;
    const readiness: TargetPresentation['readiness'] = policy.readiness
      ? {
          phase:
            tick < previewTick
              ? 'hidden'
              : resolution
                ? 'resolved'
                : tick >= readyTick
                  ? 'ready'
                  : tick >= prepareTick
                    ? 'preparing'
                    : 'waiting',
          previewTick,
          prepareTick,
          progress:
            tick >= readyTick
              ? 1
              : readyTick === prepareTick
                ? 0
                : clamp((tick - prepareTick) / (readyTick - prepareTick)),
        }
      : undefined;
    // Emergence must finish before contact can count, even with zero lead time.
    const appearTicks =
      policy.presence === 'instant'
        ? 0
        : Math.min(Math.round((policy.appearMs * map.tickRate) / 1000), readyTick - previewTick);
    const appearanceProgress = appearTicks <= 0 ? 1 : clamp((tick - previewTick) / appearTicks);
    const releaseDuration = releaseTicks(spec.id, spec.kind);
    const releaseProgress = resolution
      ? releaseDuration === 0
        ? 1
        : clamp((tick - resolution.tick) / releaseDuration)
      : 0;
    const visibility =
      tick < previewTick ? 0 : smooth(appearanceProgress) * (1 - smooth(releaseProgress));
    const origin = positionAt(spec, spec.spawnTick);
    const arrival = [
      spec.hitTick,
      ...spec.motion
        .filter((k) => k.tick >= spec.spawnTick && k.tick < spec.hitTick)
        .map((k) => k.tick),
    ].some((t) => positionAt(spec, t).some((v, i) => Math.abs(v - origin[i]) > 1e-6))
      ? 'approach'
      : 'materialize';
    const phase =
      tick < previewTick
        ? 'hidden'
        : resolution
          ? 'resolved'
          : appearanceProgress < 1
            ? 'appearing'
            : tick >= spec.hitTick
              ? 'active'
              : tick >= readyTick
                ? 'ready'
                : arrival === 'approach'
                  ? 'approaching'
                  : 'waiting';
    const head = Math.min(tick, resolution?.tick ?? spec.endTick);
    const behind = Math.min(head, windowTick(head, policy.behind, -1));
    const ahead = Math.max(head, windowTick(head, policy.ahead, 1));
    const start = Math.max(spec.spawnTick, policy.guide === 'full' ? spec.hitTick : behind);
    // Never continue drawing an actionable future after resolution.
    const end = Math.min(
      resolution?.tick ?? spec.endTick,
      policy.guide === 'full' ? spec.endTick : ahead,
    );
    const path: TargetPresentation['path'] = [];
    const readinessStrength = smooth(readiness?.progress ?? 1);
    if (visibility > 0 && readinessStrength > 0 && policy.guide !== 'none' && end > start) {
      // Keep every authored corner; add subdivisions only for smooth strength falloff.
      // <= 256 keys + 33 subdivisions + the exact head = 290 points.
      const ticks = new Set([start, end, Math.max(start, Math.min(end, head))]);
      for (const key of spec.motion) if (key.tick > start && key.tick < end) ticks.add(key.tick);
      for (let i = 1; i < 32; i++) ticks.add(Math.round(start + ((end - start) * i) / 32));
      for (const t of [...ticks].sort((a, b) => a - b)) {
        const weight =
          policy.guide === 'full' || t === head
            ? 1
            : t < head
              ? (t - behind) / Math.max(1, head - behind)
              : (ahead - t) / Math.max(1, ahead - head);
        path.push({
          tick: t,
          position: at(t),
          strength: visibility * readinessStrength * smooth(clamp(weight)),
        });
      }
    }
    return {
      version: 1,
      phase,
      arrival,
      presence: policy.presence,
      appearanceProgress,
      releaseProgress,
      visibility,
      spawnTick: spec.spawnTick,
      readyTick,
      ...(readiness ? { readiness } : {}),
      ...(resolution ? { resolveTick: resolution.tick, outcome: resolution.outcome } : {}),
      guide: policy.guide,
      path,
    };
  }
  return { sample, releaseTicks };
}
