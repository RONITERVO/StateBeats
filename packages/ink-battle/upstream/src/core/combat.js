import { AGES } from '../content/ages.js';
import { BASE_WIDTH, CANVAS_WIDTH, GROUND_Y, FIXED_DT, TICK_RATE, DIFFICULTY_SETTINGS } from './constants.js';
import { side, multiplier, emit, random } from './state.js';

const baseX = team => team === 1 ? BASE_WIDTH : CANVAS_WIDTH - BASE_WIDTH;
const separation = (a, b) => Math.round(Math.abs(a - b) * 1e6) / 1e6;
const distance = (u, v) => Math.max(0, (v.x - u.x) * u.team - (u.size + v.size) / 2);

// Calculate both sides' intent before applying movement or damage. Equal lethal blows trade.
export function combatTick(s) {
  const hits = [], moves = [], shots = [];
  for (const team of [1, -1]) {
    const allies = s.units.filter(u => u.team === team).sort((a, b) => (b.x - a.x) * team || a.id - b.id);
    const enemies = s.units.filter(u => u.team !== team && u.drawProgress >= .8).sort((a, b) => (a.x - b.x) * team || a.id - b.id);
    let front = null;
    for (const u of allies) {
      u.attackCooldown = Math.max(0, u.attackCooldown - FIXED_DT);
      u.animTimer = Math.max(0, u.animTimer - FIXED_DT);
      if (u.drawProgress < 1) { u.drawProgress = Math.min(1, u.drawProgress + FIXED_DT * 2); front = u; continue; }
      // Units that touch/overlap are still valid targets; they cannot walk through each other.
      const target = enemies.find(e => (e.x - u.x) * team >= -(u.size + e.size) / 2);
      const targetIsBase = !target;
      const range = target ? distance(u, target) : Math.max(0, (baseX(-team) - u.x) * team - u.size / 2);
      u.isAttacking = range <= u.range + 1e-6; u.moving = !u.isAttacking;
      if (u.isAttacking) {
        // Siege advances slowly while firing. A cheap ranged screen cannot pin a
        // whole expensive column outside turret range forever.
        if (u.siegeMultiplier && !targetIsBase) {
          const travel = Math.min(u.speed * FIXED_DT * .35, Math.max(0, range - 20));
          if (travel > 0) { moves.push([u, u.x + team * travel]); u.moving = true; }
        }
        if (s.metrics.firstContactTick === null) s.metrics.firstContactTick = s.tick;
        if (u.attackCooldown <= 1e-9) {
          u.attackCooldown = u.attackSpeed; u.animTimer = .3;
          const dmg = u.dmg * multiplier(s, team, 'dmg');
          if (u.projType) shots.push({ x: u.x, y: u.y - u.size * .7, targetX: target ? target.x : baseX(-team),
            targetY: target ? target.y - target.size / 2 : GROUND_Y - 40, type: u.projType, speed: u.projSpeed,
            dmg: dmg * (targetIsBase ? u.siegeMultiplier || 1 : 1), team, targetId: target?.id ?? null, targetIsBase,
            splashRadius: u.splashRadius || 0 });
          else {
            hits.push({ team, targetId: target?.id ?? null, dmg });
            emit(s, 'melee', { team, x: u.x + team * u.size / 2, y: u.y - u.size / 2 });
          }
        }
      } else {
        let travel = Math.min(u.speed * FIXED_DT, Math.max(0, range - u.range));
        // Queue at the base instead of pushing existing units off the map.
        if (front && front.range <= u.range) travel = Math.min(travel, Math.max(0, (front.x - u.x) * team - (front.size + u.size) / 2 - 10));
        moves.push([u, Math.max(BASE_WIDTH, Math.min(CANVAS_WIDTH - BASE_WIDTH, u.x + team * travel))]);
        u.moving = travel > 0;
      }
      front = u;
    }
    const owner = side(s, team);
    for (let i = 0; i < owner.unlockedSlots; i++) {
      owner.turretTimers[i] = Math.max(0, owner.turretTimers[i] - FIXED_DT);
      if (owner.turrets[i] === null || owner.turretProgress[i] < 1 || owner.turretTimers[i] > 1e-9) continue;
      const data = AGES[owner.age].turrets[owner.turrets[i]], x = baseX(team) - team * 10;
      const target = enemies.find(e => Math.abs(e.x - x) <= data.range + 1e-6);
      if (target) {
        shots.push({ x, y: GROUND_Y - 150 - i * 90, targetX: target.x, targetY: target.y - target.size / 2,
          type: data.projType, speed: data.projSpeed, dmg: data.dmg * multiplier(s, team, 'dmg'), team, targetId: target.id, targetIsBase: false });
        owner.turretTimers[i] = data.attackSpeed;
      }
    }
  }
  // Canonical micro-pixel positions keep mirrored queues tied identically after overtaking.
  for (const [u, x] of moves) u.x = Math.round(x * 1e6) / 1e6;
  for (const shot of shots) launch(s, shot);
  specialTick(s, hits);
  projectileTick(s, hits);
  for (const hit of hits) {
    const target = hit.targetId === null ? side(s, -hit.team) : s.units.find(u => u.id === hit.targetId);
    if (!target) continue;
    s.metrics.damage[hit.team] += Math.min(Math.max(0, target.hp), hit.dmg);
    target.hp -= hit.dmg;
    emit(s, 'damage', { team: hit.team, targetId: hit.targetId, amount: hit.dmg,
      x: target.x ?? baseX(-hit.team), y: target.y ? target.y - target.size / 2 : GROUND_Y - 100 });
  }
  const config = DIFFICULTY_SETTINGS[s.difficulty];
  for (const u of s.units) {
    if (u.hp > 0) continue;
    const winner = side(s, -u.team), loser = side(s, u.team);
    winner.gold += u.killGold * (u.team === 1 ? config.econMult : 1);
    winner.xp += u.killXp * (u.team === 1 ? config.xpMult : 1);
    // Losing troops teaches the defender too; this prevents an early kill lead locking out ages.
    loser.xp += u.killXp * .5 * (u.team === -1 ? config.xpMult : 1);
    s.metrics.kills[-u.team]++;
    emit(s, 'death', { team: u.team, id: u.id, x: u.x, y: u.y, size: u.size, gold: u.killGold, xp: u.killXp });
  }
  s.units = s.units.filter(u => u.hp > 0);
  s.metrics.peakUnits = Math.max(s.metrics.peakUnits, s.units.length);
  if (s.player.hp <= 0 || s.enemy.hp <= 0) {
    s.player.hp = Math.max(0, s.player.hp); s.enemy.hp = Math.max(0, s.enemy.hp);
    s.winner = s.player.hp === 0 && s.enemy.hp === 0 ? 0 : s.enemy.hp === 0 ? 1 : -1;
    s.running = false; emit(s, 'end', { winner: s.winner });
  }
}

function launch(s, shot) {
  const dx = shot.targetX - shot.x, dy = shot.targetY - shot.y;
  const beam = shot.type === 'laser';
  const arc = ['arc', 'meteor', 'arrow', 'cannonball'].includes(shot.type);
  const seconds = beam ? FIXED_DT : Math.max(FIXED_DT, (arc ? Math.abs(dx) : Math.hypot(dx, dy)) / shot.speed);
  const flightTicks = Math.max(1, Math.ceil(seconds * TICK_RATE - 1e-8));
  s.projectiles.push({ ...shot, id: s.nextId++, startX: shot.x, startY: shot.y, flightTicks, elapsed: 0,
    vx: dx / seconds, vy: dy / seconds - (arc ? 400 * seconds : 0), arc, active: true,
    isSpecial: !!shot.isSpecial, hit: false, life: beam ? .25 : 0, trailX: [], trailY: [], trailCount: 0 });
}

function projectileTick(s, hits) {
  for (const p of s.projectiles) {
    p.elapsed++;
    if (p.hit) { p.life -= FIXED_DT; p.active = p.life > 0; continue; }
    p.trailX.unshift(p.x); p.trailY.unshift(p.y); p.trailX.length = Math.min(10, p.trailX.length); p.trailY.length = p.trailX.length; p.trailCount = p.trailX.length;
    const t = Math.min(1, p.elapsed / p.flightTicks), duration = p.flightTicks / TICK_RATE;
    p.x = p.startX + (p.targetX - p.startX) * t;
    p.y = p.startY + (p.targetY - p.startY) * t - (p.arc ? 400 * duration * duration * t * (1 - t) : 0);
    if (t < 1) continue;
    if (p.isSpecial) {
      for (const u of s.units) if (u.team !== p.team && Math.abs(u.x - p.x) < p.radius) hits.push({ team: p.team, targetId: u.id, dmg: p.dmg });
      emit(s, 'impact', { x: p.x, y: p.y, type: p.type });
    } else if (p.targetIsBase) hits.push({ team: p.team, targetId: null, dmg: p.dmg });
    else {
      const target = s.units.find(u => u.id === p.targetId);
      if (target && separation(target.x, p.targetX) <= target.size + 20) {
        const direct = p.splashRadius && target.uType === 0 ? p.dmg * .5 : p.dmg;
        hits.push({ team: p.team, targetId: target.id, dmg: direct });
        if (p.splashRadius) {
          const nearby = s.units.filter(u => u.team !== p.team && u.id !== target.id && separation(u.x, target.x) < p.splashRadius)
            .sort((a, b) => separation(a.x, target.x) - separation(b.x, target.x) || a.id - b.id).slice(0, 2);
          for (const u of nearby) hits.push({ team: p.team, targetId: u.id, dmg: p.dmg * .35 * (u.uType === 0 ? .5 : 1) });
          // Siege can chip a base when defenders shelter inside the actual blast radius.
          if (separation(baseX(-p.team), target.x) < p.splashRadius) hits.push({ team: p.team, targetId: null, dmg: p.dmg * .35 });
        }
      }
    }
    p.hit = true; p.active = p.type === 'laser';
  }
  s.projectiles = s.projectiles.filter(p => p.active);
}

function specialTick(s, hits) {
  for (const sp of s.specials) {
    const data = AGES[sp.age].special, owner = side(s, sp.team);
    const cx = sp.x;
    if (data.type === 'laser' || data.type === 'orbital') {
      const radius = data.type === 'laser' ? 150 : 300, dmg = (data.type === 'laser' ? 800 : 2500) * FIXED_DT;
      for (const u of s.units) if (u.team !== sp.team && Math.abs(u.x - cx) < radius) hits.push({ team: sp.team, targetId: u.id, dmg });
    } else {
      sp.nextPulse--;
      if (sp.nextPulse <= 0) {
        const profiles = { meteor: [8, 150, 150, 'meteor', 800], arrows: [30, 40, 60, 'arrow', 1000],
          cannons: [6, 300, 120, 'cannonball', 1200], airstrike: [8, 400, 120, 'bombDrop', 800] };
        const [rate, dmg, radius, type, speed] = profiles[data.type];
        sp.nextPulse += TICK_RATE / rate;
        const position = BASE_WIDTH + 50 + random(owner) * (CANVAS_WIDTH - BASE_WIDTH - 50);
        const x = sp.team === 1 ? position : CANVAS_WIDTH - position;
        launch(s, { x: type === 'bombDrop' ? x : x - sp.team * 200, y: -50, targetX: x, targetY: GROUND_Y,
          team: sp.team, type, speed, dmg, radius, targetId: null, targetIsBase: false, isSpecial: true });
      }
    }
    sp.remaining--;
  }
  s.specials = s.specials.filter(sp => sp.remaining > 0);
}
