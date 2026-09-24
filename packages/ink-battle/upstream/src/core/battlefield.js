import { AGES } from '../content/ages.js';
import { BASE_WIDTH, CANVAS_WIDTH } from './constants.js';

// Versioned tabletop geometry in simulation units. No renderer or headset is
// needed to run exactly the same battle, including guidance and cannon damage.
export const TABLETOP_RULES_VERSION = 'tabletop-1.0.0';
export const FIELD = Object.freeze({ minX: 95, maxX: 1185, minZ: -270, maxZ: 270,
  worldScale: 2.4 / CANVAS_WIDTH, centerZ: 0.14, dockX: 48,
  dockZ: Object.freeze([-0.185, 0.46, -0.35, 0.6].map(z => (z - 0.14) / (2.4 / CANVAS_WIDTH))),
  guideTicks: 720, guideCooldown: 60, maxNudge: 160 });
export const wide = s => s.battlefield === 'tabletop';
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const round = v => Math.round(v * 1e6) / 1e6;
export const unitRadius = u => Math.min(34, u.size * 0.3);
export const worldX = x => (x - CANVAS_WIDTH / 2) * FIELD.worldScale;
export const worldZ = z => FIELD.centerZ + z * FIELD.worldScale;
export const fieldX = x => x / FIELD.worldScale + CANVAS_WIDTH / 2;
export const fieldZ = z => (z - FIELD.centerZ) / FIELD.worldScale;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const spawnX = team => team === 1 ? BASE_WIDTH : CANVAS_WIDTH - BASE_WIDTH;
export function basePoint(team) { return { kind: 'base', team, x: team === 1 ? 75 : 1205, z: 0, radius: 70 }; }
export function cannonPoint(team, slot) {
  return { kind: 'turret', team, slot, x: team === 1 ? FIELD.dockX : CANVAS_WIDTH - FIELD.dockX,
    z: FIELD.dockZ[slot], radius: 32 };
}
export function defenseHealth(age, index, hpMultiplier = 1) {
  return AGES[age].baseHp * (0.24 + index * 0.08) * hpMultiplier;
}
export function resolveTarget(s, ref) {
  if (!ref) return null;
  if (ref.kind === 'unit') return s.units.find(u => u.id === ref.id && u.hp > 0) ?? null;
  const owner = ref.team === 1 ? s.player : s.enemy;
  if (ref.kind === 'base') return owner.hp > 0 ? { ...basePoint(ref.team), hp: owner.hp } : null;
  if (ref.kind === 'turret' && owner.turrets[ref.slot] !== null && owner.turretIds[ref.slot] === ref.id)
    return { ...cannonPoint(ref.team, ref.slot), id: ref.id, hp: owner.turretHp[ref.slot] };
  return null;
}
export function targetRef(target) {
  return target.kind === 'base' ? { kind: 'base', team: target.team }
    : target.kind === 'turret' ? { kind: 'turret', team: target.team, slot: target.slot, id: target.id }
    : { kind: 'unit', id: target.id };
}
export function chooseSpawnZ(s, team, data, requested) {
  const candidates = requested === undefined ? [0, -200, 200, -100, 100] : [requested];
  let best = null, score = Infinity;
  for (const z of candidates) {
    const point = { x: spawnX(team), z };
    if (s.units.some(u => distance(u, point) < unitRadius(u) + unitRadius(data) + 5)) continue;
    const own = s.units.filter(u => u.team === team && Math.abs(u.z - z) < 75).length;
    const threat = s.units.filter(u => u.team !== team && Math.abs(u.x - point.x) < 400 && Math.abs(u.z - z) < 90).length;
    const value = own * 2 - Math.min(2, threat) + Math.abs(z) / 1000;
    if (value < score) { score = value; best = z; }
  }
  return best;
}

export function guideError(s, team, c) {
  if (!wide(s)) return 'wrong-battlefield';
  if (!Number.isSafeInteger(c.id)) return 'invalid-unit';
  const u = s.units.find(u => u.id === c.id && u.team === team && u.hp > 0);
  if (!u || u.drawProgress < 1) return 'unavailable-unit';
  if (![c.x, c.z].every(Number.isFinite) || c.x < FIELD.minX || c.x > FIELD.maxX || c.z < FIELD.minZ || c.z > FIELD.maxZ) return 'invalid-position';
  return s.tick < u.guideReady ? 'guide-cooldown' : null;
}
export function guidance(s, team, u, point) {
  const owner = team === 1 ? s.enemy : s.player;
  let target = null, best = Infinity;
  if ((point.x - 640) * team > 350) {
    for (const t of [basePoint(-team), ...owner.turrets.flatMap((v, slot) => v === null ? [] : [{ ...cannonPoint(-team, slot), id: owner.turretIds[slot] }])]) {
      const d = distance(point, t);
      if (d < best) { best = d; target = targetRef(t); }
    }
  }
  return { z: round(clamp(point.z, Math.max(FIELD.minZ + unitRadius(u), u.z - FIELD.maxNudge),
    Math.min(FIELD.maxZ - unitRadius(u), u.z + FIELD.maxNudge))), target, until: s.tick + FIELD.guideTicks };
}

// Release-frame anchors of the pencil weapons (strike/recoil = 1), not their
// resting silhouettes. Geometry tests sample the actual articulated artwork.
const catapult = [-.02 + .078*Math.cos(-1.05) - .075*Math.sin(-1.05),
  .076 + .078*Math.sin(-1.05) + .075*Math.cos(-1.05)];
const rockets = [.047*Math.cos(.16) - .036*Math.sin(.16) - .016,
  .05 + .047*Math.sin(.16) + .036*Math.cos(.16)];
const MUZZLES = [ [catapult,[.022,.132],[.039,.204]], [catapult,[.112,.084],[.055,.12]],
  [[.074,.092],[.074,.092],[.019,.162]], [[.083,.0852],rockets,[.119,.1536]],
  [[.063,.10792],[.089,.1154],[.1,.123]], [[.064,.1242],[.012,.126],[.025,.137]] ];
export function cannonMuzzle(team, slot, age, index, heading) {
  const p = cannonPoint(team, slot), [length, height] = MUZZLES[age][index];
  const reach = length * .83 / FIELD.worldScale;
  return { x: p.x + Math.cos(heading) * reach, z: p.z + Math.sin(heading) * reach,
    y: 600 - (.044 + height * .83) / FIELD.worldScale };
}
