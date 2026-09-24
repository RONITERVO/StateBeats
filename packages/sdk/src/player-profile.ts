import type { Vec3, InteractionPolicy } from '@statebeats/core';
import { cartesian, compile } from './compiler.js';
import type { RuleExtensions } from './compiler.js';
import { parsed, playerProfileSchema } from './schema.js';
import type { MapDefinition } from './schema.js';
export interface PlayerProfile {
  height: number;
  roomScale: number;
}

/** Bakes personal dimensions into ordinary map data so all actors, senses and replays agree.
 * Height rescales vertical layout from the floor; roomScale spreads the horizontal layout.
 * Collision sizes stay authored; scaling is a recorded layout choice, not a safety guarantee.
 */
export function fitMapToPlayer(
  input: unknown,
  profile: Partial<PlayerProfile> = {},
  policies?: readonly InteractionPolicy[],
  extensions: RuleExtensions = {},
): MapDefinition {
  const map = compile(input, policies, extensions).map,
    target = parsed(playerProfileSchema, profile);
  const recipe = map.generation?.settings as Record<string, unknown> | undefined;
  const authoredHeight =
    typeof recipe?.playerHeight === 'number' &&
    recipe.playerHeight >= 1 &&
    recipe.playerHeight <= 2.3
      ? recipe.playerHeight
      : 1.65;
  const source = map.playerProfile ?? { height: authoredHeight, roomScale: 1 };
  const horizontal = target.roomScale / source.roomScale,
    vertical = target.height / source.height;
  const point = (value: Parameters<typeof cartesian>[0]): Vec3 => {
    const [x, y, z] = cartesian(value);
    return [x * horizontal, y * vertical, z * horizontal];
  };
  for (const note of map.notes) {
    note.position = point(note.position);
    for (const key of note.motion) key.position = point(key.position);
    if (note.direction) note.direction.vector = point(note.direction.vector);
  }
  for (const object of map.scene?.objects ?? []) {
    object.position = point(object.position);
    for (const key of object.motion) key.position = point(key.position);
  }
  map.playerProfile = target;
  return compile(map, policies, extensions).map;
}
