import { AGES } from '../content/ages.js';
import { BASE_WIDTH, CANVAS_WIDTH, GROUND_Y, MAX_UNITS, UPGRADE_COSTS, DIFFICULTY_SETTINGS, TICK_RATE } from './constants.js';
import { side, multiplier, emit } from './state.js';
import { wide, FIELD, unitRadius, chooseSpawnZ, guideError, guidance, defenseHealth } from './battlefield.js';

export function commandError(s, team, c) {
  if (team !== 1 && team !== -1) return 'invalid-team';
  if (!c || typeof c !== 'object' || Array.isArray(c)) return 'invalid-command';
  if (!s.running) return 'match-ended';
  if (s.paused) return 'paused';
  const p = side(s, team), age = AGES[p.age], pacts = team === -1 ? s.agreements : {};
  if (c.type === 'guide') return guideError(s, team, c);
  if (p.drawProgress < 1) return 'base-drawing';
  switch (c.type) {
    case 'unit':
      if (!Number.isInteger(c.index) || !age.units[c.index]) return 'invalid-unit';
      if (Object.hasOwn(c, 'z') && (!wide(s) || !Number.isFinite(c.z) || c.z < FIELD.minZ + unitRadius(age.units[c.index]) || c.z > FIELD.maxZ - unitRadius(age.units[c.index]))) return 'invalid-position';
      if (pacts.meleeOnly && age.units[c.index].type === 'ranged') return 'pact';
      if (team === -1 && s.tick < s.restraintUntil) return 'truce';
      if (p.deployTimer > 0) return 'deploying';
      if (wide(s) ? chooseSpawnZ(s, team, age.units[c.index], c.z) === null : s.units.some(u => u.team === team && u.range <= age.units[c.index].range && Math.abs(u.x - (team === 1 ? BASE_WIDTH : CANVAS_WIDTH - BASE_WIDTH)) < (u.size + age.units[c.index].size) / 2 + 10)) return 'deployment-blocked';
      if (s.units.filter(u => u.team === team).length >= MAX_UNITS) return 'unit-cap';
      return p.gold < age.units[c.index].cost ? 'gold' : null;
    case 'turret':
      if (!Number.isInteger(c.index) || !age.turrets[c.index]) return 'invalid-turret';
      if (pacts.noTurrets) return 'pact';
      if (!p.turrets.slice(0, p.unlockedSlots).includes(null)) return 'slots-full';
      return p.gold < age.turrets[c.index].cost ? 'gold' : null;
    case 'sell':
      // Omitted slot keeps the original command/replay semantics. An explicit
      // slot must never fall back to another cannon when its target is invalid.
      if (!Object.hasOwn(c, 'slot')) return p.turrets.some(t => t !== null) ? null : 'no-turret';
      if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot >= p.unlockedSlots) return 'invalid-slot';
      return p.turrets[c.slot] === null ? 'no-turret' : null;
    case 'slot': return p.unlockedSlots >= 4 ? 'slots-full' : p.gold < p.unlockedSlots * 500 ? 'gold' : null;
    case 'upgrade':
      if (!['hp', 'dmg', 'econ'].includes(c.stat)) return 'invalid-upgrade';
      return p.upgrades[c.stat] >= UPGRADE_COSTS.length ? 'max-upgrade' : p.gold < UPGRADE_COSTS[p.upgrades[c.stat]] ? 'gold' : null;
    case 'evolve': return p.age >= AGES.length - 1 ? 'max-age' : p.xp < age.evolveXP ? 'xp' : null;
    case 'special':
      if (pacts.noSpecials) return 'pact';
      if (team === -1 && s.tick < s.restraintUntil) return 'truce';
      return p.specialTimer > 0 ? 'cooldown' : null;
    default: return 'unknown-command';
  }
}

export function applyCommand(s, team, c) {
  const error = commandError(s, team, c);
  if (error) return { ok: false, error };
  const p = side(s, team), age = AGES[p.age];
  const pay = cost => { p.gold -= cost; s.metrics.spent[team] += cost; };
  switch (c.type) {
    case 'unit': {
      const data = age.units[c.index], hp = data.hp * multiplier(s, team, 'hp');
      pay(data.cost); p.deployTimer = .4;
      const u = { ...data, id: s.nextId++, team, age: p.age, uType: c.index,
        x: team === 1 ? BASE_WIDTH : CANVAS_WIDTH - BASE_WIDTH, y: GROUND_Y,
        hp, maxHp: hp, attackCooldown: 0, drawProgress: 0, active: true,
        isAttacking: false, moving: true, animTimer: 0, animOffset: s.nextId * 17 % 100 };
      if (wide(s)) Object.assign(u, { z: chooseSpawnZ(s, team, data, c.z),
        heading: team === 1 ? 0 : Math.PI, target: null, thinkAt: 0, guide: null, guideReady: 0, intent: 'advancing' });
      if (wide(s)) u.routeZ = u.z;
      s.units.push(u); s.metrics.spawned[team]++;
      emit(s, 'spawn', { team, id: u.id, index: c.index, x: u.x, y: u.y, size: u.size });
      break;
    }
    case 'turret': {
      const slot = p.turrets.findIndex((t, i) => t === null && i < p.unlockedSlots);
      pay(age.turrets[c.index].cost); p.turrets[slot] = c.index; p.turretProgress[slot] = 0; p.turretTimers[slot] = 0;
      if (wide(s)) {
        p.turretHp[slot] = p.turretMaxHp[slot] = defenseHealth(p.age, c.index, multiplier(s, team, 'hp'));
        p.turretIds[slot] = s.nextId++;
        p.turretAim[slot] = { heading: team === 1 ? 0 : Math.PI, target: null };
      }
      break;
    }
    case 'sell': {
      const i = Object.hasOwn(c, 'slot') ? c.slot : p.turrets.findLastIndex(t => t !== null);
      p.gold += age.turrets[p.turrets[i]].cost * .5; p.turrets[i] = null; p.turretTimers[i] = 0;
      if (wide(s)) { p.turretHp[i] = p.turretMaxHp[i] = 0; p.turretIds[i] = null; p.turretAim[i].target = null; }
      break;
    }
    case 'guide': {
      const u = s.units.find(u => u.id === c.id);
      u.guide = guidance(s, team, u, c); u.guideReady = s.tick + FIELD.guideCooldown; u.thinkAt = 0;
      emit(s, 'guide', { team, id: u.id, z: u.guide.z, target: u.guide.target });
      break;
    }
    case 'slot': pay(p.unlockedSlots * 500); p.unlockedSlots++; break;
    case 'upgrade': {
      pay(UPGRADE_COSTS[p.upgrades[c.stat]]); p.upgrades[c.stat]++;
      if (c.stat === 'hp') resizeBase(s, team);
      break;
    }
    case 'evolve':
      p.age++; p.drawProgress = 0; resizeBase(s, team);
      // Existing defenses are refunded at their normal resale value on both sides.
      p.gold += p.turrets.reduce((sum, t) => sum + (t === null ? 0 : age.turrets[t].cost * .5), 0);
      p.turrets.fill(null); p.turretTimers.fill(0); p.turretProgress.fill(1);
      if (wide(s)) { p.turretHp.fill(0); p.turretMaxHp.fill(0); p.turretIds.fill(null); for (const aim of p.turretAim) aim.target = null; }
      s.metrics.evolutions.push({ tick: s.tick, team, age: p.age });
      emit(s, 'evolve', { team, age: p.age }); break;
    case 'special': {
      p.specialTimer = age.special.cooldown;
      const targets = s.units.filter(u => u.team !== team);
      const radius = p.age === 4 ? 150 : 300;
      const cluster = targets.map(u => ({ x: u.x, ...(wide(s) ? {z:u.z} : {}), value: targets.filter(v => (wide(s) ? Math.hypot(v.x-u.x,v.z-u.z) : Math.abs(v.x - u.x)) < radius).reduce((n, v) => n + v.cost, 0) }))
        .sort((a, b) => b.value - a.value || (a.x - b.x) * team)[0];
      const x = cluster?.x ?? (team === 1 ? CANVAS_WIDTH - 300 : 300);
      s.specials.push({ id: s.nextId++, team, age: p.age, x, ...(wide(s) ? { z: cluster?.z ?? 0 } : {}), remaining: Math.round(age.special.duration * TICK_RATE), nextPulse: 0 });
      emit(s, 'special', { team, age: p.age }); break;
    }
  }
  emit(s, 'command', { team, command: { ...c } });
  return { ok: true };
}

function resizeBase(s, team) {
  const p = side(s, team);
  const maxHp = AGES[p.age].baseHp * multiplier(s, team, 'hp') * (team === -1 ? DIFFICULTY_SETTINGS[s.difficulty].baseHpMult : 1);
  p.hp += maxHp - p.maxHp; p.maxHp = maxHp;
}
