import type { Vec3 } from '@statebeats/core';
import type { Observation } from './session.js';
import { EngineError } from './schema.js';

export type SpatialSoundRole = 'approach' | 'materialize' | 'hold' | 'hazard';
export interface SpatialSoundSource {
  id: string;
  role: SpatialSoundRole;
  effect?: string;
  /** Current world position, already calibrated/recentered by the session. */
  position: Vec3;
  intensity: number;
  progress: number;
  elapsedSeconds: number;
}
export interface SpatialAudioFrame {
  version: 1;
  tick: number;
  theme?: string;
  sources: SpatialSoundSource[];
  omitted: number;
}
const clamp = (n: number) => Math.max(0, Math.min(1, n));

/** Pure projection for any audio backend. Reading/repeating/seeking never advances the engine.
 * World effects are decorative. Destination/hand/timing guidance remains a separate layer.
 */
export function sampleSpatialAudio(
  view: Observation,
  options: { maxSources?: number } = {},
): SpatialAudioFrame {
  const limit = options.maxSources ?? 8;
  if (!Number.isInteger(limit) || limit < 1 || limit > 32)
    throw new EngineError('VALIDATION', 'Sample between 1 and 32 spatial sources');
  const candidates = view.finished
    ? []
    : view.entities.flatMap((e) => {
        const p = e.presentation;
        const readiness = p?.readiness;
        const remaining = (e.hitTick - view.tick) / view.tickRate;
        if (
          (!view.audio && !e.sound) ||
          e.sound?.effect === 'statebeats/silent' ||
          e.sound?.gain === 0 ||
          p?.phase === 'hidden' ||
          p?.phase === 'resolved' ||
          readiness?.phase === 'hidden' ||
          readiness?.phase === 'waiting' ||
          readiness?.phase === 'resolved' ||
          remaining > 2 ||
          view.tick > e.endTick
        )
          return [];
        const holding = e.kind === 'hold' && view.tick >= e.hitTick;
        const sustained = holding || (e.kind === 'hazard' && view.tick >= e.hitTick);
        const progress = sustained
          ? clamp((view.tick - e.hitTick) / Math.max(1, e.endTick - e.hitTick))
          : clamp(1 - Math.max(0, remaining) / 2);
        const envelope = sustained ? 1 : remaining < 0 ? clamp(1 + remaining / 0.15) : progress;
        const intensity =
          envelope * (p?.visibility ?? 1) * (readiness?.progress ?? 1) * (e.sound?.gain ?? 1);
        if (intensity <= 0) return [];
        const role: SpatialSoundRole =
          e.kind === 'hazard'
            ? 'hazard'
            : holding
              ? 'hold'
              : p?.arrival === 'materialize'
                ? 'materialize'
                : 'approach';
        return [
          {
            source: {
              id: e.id,
              role,
              ...(e.sound ? { effect: e.sound.effect } : {}),
              position: [...e.position] as Vec3,
              intensity,
              progress,
              elapsedSeconds: Math.max(
                0,
                (view.tick - (p?.spawnTick ?? e.hitTick)) / view.tickRate,
              ),
            },
            // Active holds and imminent hazards survive a busy chart; IDs break ties consistently.
            priority: holding
              ? -2
              : e.kind === 'hazard' && remaining <= 0.5
                ? -1
                : Math.abs(remaining),
          },
        ];
      });
  candidates.sort(
    (a, b) =>
      a.priority - b.priority ||
      (a.source.id < b.source.id ? -1 : a.source.id > b.source.id ? 1 : 0),
  );
  return {
    version: 1,
    tick: view.tick,
    ...(view.audio ? { theme: view.audio.theme } : {}),
    sources: candidates.slice(0, limit).map((c) => c.source),
    omitted: Math.max(0, candidates.length - limit),
  };
}
