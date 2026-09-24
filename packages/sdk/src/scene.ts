import { add, rotate, positionAt } from '@statebeats/core';
import type { MotionKey, Quat, Vec3 } from '@statebeats/core';
import type { MusicFeatures, SceneDefinition } from './schema.js';
import { EngineError } from './schema.js';

export interface CompiledSceneObject
  extends Omit<SceneDefinition['objects'][number], 'position' | 'motion' | 'trailSeconds'> {
  position: Vec3;
  motion: MotionKey[];
  trailTicks: number;
}
export interface CompiledScene extends Omit<SceneDefinition, 'objects'> {
  objects: CompiledSceneObject[];
}
export interface SceneFrame {
  version: 1;
  theme: string;
  label: string;
  objects: {
    id: string;
    appearance: string;
    label: string;
    position: Vec3;
    scale: number;
    brightness: number;
    color?: string;
    trail: Vec3[];
  }[];
}
export type StageTransforms = Record<string, { position: Vec3; orientation: Quat }>;

/** Uses exactly the kernel's piecewise-linear path sampler, without creating an entity. */
export function scenePositionAt(
  object: Pick<CompiledSceneObject, 'position' | 'motion'>,
  tick: number,
): Vec3 {
  // Locate the same adjacent keys as the kernel, in logarithmic time for long songs.
  const keys = object.motion;
  if (keys.length < 2 || tick <= keys[0].tick || tick >= keys.at(-1)!.tick)
    return positionAt(
      keys.length
        ? { position: object.position, motion: [tick <= keys[0].tick ? keys[0] : keys.at(-1)!] }
        : object,
      tick,
    );
  let low = 1,
    high = keys.length - 1;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (keys[mid].tick < tick) low = mid + 1;
    else high = mid;
  }
  return positionAt({ position: object.position, motion: [keys[low - 1], keys[low]] }, tick);
}

/** Stateless presentation sampling: seeking/backward/manual ticks need no hidden trail history. */
export function sampleScene(
  scene: CompiledScene,
  tick: number,
  features?: MusicFeatures,
  stages: StageTransforms = {},
): SceneFrame {
  if (!Number.isInteger(tick) || tick < 0 || tick > 2147483647)
    throw new EngineError('VALIDATION', 'Scene sampling requires a nonnegative integer tick');
  return {
    version: 1,
    theme: scene.theme,
    label: scene.label,
    objects: scene.objects.map((object) => {
      const stage =
        object.anchor && Object.hasOwn(stages, object.anchor) ? stages[object.anchor] : undefined;
      const at = (time: number) => {
        const position = scenePositionAt(object, time);
        return stage ? add(rotate(position, stage.orientation), stage.position) : position;
      };
      let scale = object.scale,
        brightness = 1;
      for (const binding of object.react) {
        const value = (features?.[binding.channel] ?? 0) * binding.amount;
        if (binding.property === 'scale') scale *= Math.max(0.01, 1 + value);
        else brightness *= Math.max(0, 1 + value);
      }
      const trail: Vec3[] = [];
      if (object.trailTicks > 0 && tick > 0) {
        const duration = Math.min(tick, object.trailTicks),
          count = Math.min(64, duration + 1);
        for (let i = 0; i < count; i++)
          trail.push(at(Math.round(tick - duration + (duration * i) / (count - 1))));
      }
      return {
        id: object.id,
        appearance: object.appearance,
        label: object.label,
        position: at(tick),
        scale,
        brightness,
        ...(object.color ? { color: object.color } : {}),
        trail,
      };
    }),
  };
}
