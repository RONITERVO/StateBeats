/** One presentation layout shared by rendering, targeting and input. Slot order
 * follows the engine: first empty unlocked cannon, next dock, selected cannon sold.
 * Two foundations on each flank leave every age's base footprint unobstructed. */
import { FIELD, cannonPoint, worldX, worldZ } from '../core/battlefield.js';
export const DOCK = Object.freeze({ width: 0.16, depth: 0.13, height: 0.044 });
const Z = FIELD.dockZ;

export function dockPosition(slot, team = 1) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= Z.length) return null;
  const p = cannonPoint(team,slot);
  return { x: worldX(p.x), y: DOCK.height, z: worldZ(p.z), slot };
}

export function defenseTarget(offer, state, point) {
  const side = state?.player;
  if (!side) return null;
  let slot = -1;
  if (offer.kind === 'turret')
    slot = side.turrets.slice(0, side.unlockedSlots).indexOf(null);
  else if (offer.kind === 'slot') slot = side.unlockedSlots;
  else if (offer.kind === 'eraser') {
    const target = dockAt(point);
    if (!target || target.slot >= side.unlockedSlots || side.turrets[target.slot] === null) return null;
    slot = target.slot;
  }
  const position = dockPosition(slot);
  return position && { ...position, y: offer.kind === 'slot' ? 0 : DOCK.height };
}

/** Choose the nearest physical dock before checking occupancy. This prevents an
 * empty dock's tracking margin from selecting an occupied neighbor instead. */
export function dockAt(point) {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.z)) return null;
  let target = null, distance = Infinity;
  for (let slot = 0; slot < Z.length; slot++) {
    const pad = dockPosition(slot);
    const d = Math.hypot(point.x - pad.x, point.z - pad.z);
    if (d < distance) { target = pad; distance = d; }
  }
  return onDock(point, target) ? target : null;
}

export function landingHeight(offer) {
  return ['turret', 'eraser'].includes(offer.kind) ? DOCK.height : 0;
}

export function onDock(point, target) {
  // Small hand-tracking allowance, clear of the base and neighboring dock
  // centers. Height is validated by the shared page landing envelope.
  return !!target && Math.abs(point.x - target.x) <= DOCK.width / 2 + 0.01 &&
    Math.abs(point.z - target.z) <= DOCK.depth / 2 + 0.01;
}
