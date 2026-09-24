import { AGES } from '../content/ages.js';
import { FIXED_DT, TICK_RATE, GROUND_Y, DIFFICULTY_SETTINGS } from './constants.js';
import { side, multiplier, emit, random } from './state.js';
import { FIELD, clamp, round, unitRadius, distance, basePoint, cannonPoint,
  resolveTarget, targetRef, cannonMuzzle } from './battlefield.js';

const radius = t => t.radius ?? unitRadius(t);
const gap = (u, t) => Math.max(0, distance(u, t) - unitRadius(u) - radius(t));
const angleDelta = (a, b) => Math.atan2(Math.sin(b - a), Math.cos(b - a));
const turn = (a, b, rate) => round(a + clamp(angleDelta(a, b), -rate * FIXED_DT, rate * FIXED_DT));

function structures(s, team) {
  const p = side(s, team);
  return [basePoint(team), ...p.turrets.flatMap((index, slot) => index === null ? []
    : [{ ...cannonPoint(team, slot), id: p.turretIds[slot] }])];
}
// The physical base blocks a cannon firing through its own foundation. Arcing
// weapons still turn toward an unobstructed target before releasing a shot.
function clearShot(from, to, team) {
  const base = basePoint(team), dx = to.x - from.x, dz = to.z - from.z;
  const t = clamp(((base.x - from.x) * dx + (base.z - from.z) * dz) / (dx * dx + dz * dz || 1), 0, 1);
  return Math.hypot(from.x + dx * t - base.x, from.z + dz * t - base.z) > base.radius;
}

function chooseTarget(s, u, enemies) {
  const old = resolveTarget(s, u.target);
  const nearby = enemies.filter(e => e.drawProgress >= .8 && gap(u, e) < Math.max(u.uType === 2 && !u.guide ? 450 : 180, u.range + 70));
  const immediate = nearby.filter(e => gap(u, e) < 75);
  // An immediate attacker beats an instruction to march past it. A brief target
  // preference prevents dithering between equally attractive adjacent enemies.
  const threats = immediate.length ? immediate : nearby;
  if (threats.length) {
    threats.sort((a, b) => (gap(u, a) - (old?.id === a.id ? 45 : 0)) - (gap(u, b) - (old?.id === b.id ? 45 : 0)) || a.id - b.id);
    u.intent = u.guide ? 'engaged' : 'fighting';
    return targetRef(threats[0]);
  }
  const instructed = resolveTarget(s, u.guide?.target);
  if (instructed) { u.intent = 'following'; return targetRef(instructed); }
  const route = u.guide?.z ?? u.routeZ;
  const goals = structures(s, -u.team);
  const score = t => Math.abs(t.z - route) * 1.35 + (t.kind === 'turret' ? (u.uType === 2 ? -65 : 5) : 0)
    + (old?.kind === t.kind && old?.slot === t.slot ? -20 : 0);
  goals.sort((a, b) => score(a) - score(b) || (a.slot ?? -1) - (b.slot ?? -1));
  u.intent = u.guide ? 'following' : goals[0].kind === 'turret' ? 'flanking' : 'advancing';
  return targetRef(goals[0]);
}

function keepInField(point, u, obstacles) {
  const r = unitRadius(u);
  point.x = clamp(point.x, FIELD.minX, FIELD.maxX);
  point.z = clamp(point.z, FIELD.minZ + r, FIELD.maxZ - r);
  // Foundations are solid. Attacks use their surface distance; a nudge cannot
  // carry a soldier through a base or put it inside a cannon.
  for (const obstacle of obstacles) {
    const dx = point.x - obstacle.x, dz = point.z - obstacle.z;
    const d = Math.hypot(dx, dz), minimum = obstacle.radius + r;
    if (d < minimum) {
      point.x = obstacle.x + (d ? dx / d : obstacle.team) * minimum;
      point.z = obstacle.z + (d ? dz / d : 0) * minimum;
    }
  }
  point.x = round(clamp(point.x, FIELD.minX, FIELD.maxX));
  point.z = round(clamp(point.z, FIELD.minZ + r, FIELD.maxZ - r));
}

function moveUnits(s, plans) {
  const obstacles = [1,-1].flatMap(team => [basePoint(team),
    ...Array.from({length: side(s,team).unlockedSlots},(_,slot) => cannonPoint(team,slot))]);
  // Symmetric local separation, accumulated before application. Never resolve
  // one army first, and never teleport an overlapping troop out of a crowd.
  const offsets = plans.map(() => ({ x: 0, z: 0 }));
  for (let i = 0; i < plans.length; i++) for (let j = i + 1; j < plans.length; j++) {
    const a = plans[i], b = plans[j], dx = b.x - a.x, dz = b.z - a.z;
    const limit = unitRadius(a.u) + unitRadius(b.u) + 3;
    if (Math.abs(dx) >= limit || Math.abs(dz) >= limit) continue;
    const d = Math.hypot(dx, dz);
    if (d >= limit) continue;
    const push = Math.min(1.4, (limit - d) * .5);
    // Coincident allies separate laterally; opposing troops keep their fronts.
    const nx = d ? dx / d : a.u.team !== b.u.team ? a.u.team : 0;
    const nz = d ? dz / d : a.u.team === b.u.team ? 1 : 0;
    offsets[i].x -= nx * push; offsets[i].z -= nz * push;
    offsets[j].x += nx * push; offsets[j].z += nz * push;
  }
  for (let i = 0; i < plans.length; i++) {
    const plan = plans[i], u = plan.u;
    plan.x += offsets[i].x; plan.z += offsets[i].z;
    // Resolve foundations before limiting the entire move. A newly purchased
    // dock can overlap a soldier; it must walk clear rather than teleport out.
    keepInField(plan, u, obstacles);
    // Crowd and foundation correction share the unit's movement budget.
    const d = distance(plan, u), maximum = u.speed * FIXED_DT;
    if (d > maximum) { plan.x = u.x + (plan.x - u.x) * maximum / d; plan.z = u.z + (plan.z - u.z) * maximum / d; }
    plan.x = round(plan.x); plan.z = round(plan.z);
    u.moving = distance(plan, u) > .01;
    u.x = plan.x; u.z = plan.z;
  }
}

export function tabletopCombatTick(s) {
  const hits = [], shots = [], plans = [];
  const armies = { '1': s.units.filter(u => u.team === 1), '-1': s.units.filter(u => u.team === -1) };
  for (const u of s.units) {
    u.attackCooldown = Math.max(0, u.attackCooldown - FIXED_DT);
    u.animTimer = Math.max(0, u.animTimer - FIXED_DT);
    if (u.guide && s.tick >= u.guide.until) { u.routeZ = u.guide.z; u.guide = null; u.thinkAt = 0; }
    if (u.drawProgress < 1) { u.drawProgress = Math.min(1, u.drawProgress + FIXED_DT * 2); continue; }
    if (s.tick >= u.thinkAt || !resolveTarget(s, u.target)) {
      u.target = chooseTarget(s, u, armies[-u.team]); u.thinkAt = s.tick + 12;
    }
    const target = resolveTarget(s, u.target);
    if (!target) continue;
    const range = gap(u, target), structure = u.target.kind !== 'unit';
    u.isAttacking = range <= u.range + 1e-6;
    const heading = Math.atan2(target.z - u.z, target.x - u.x);
    const plan = { u, x: u.x, z: u.z };
    if (!u.isAttacking) {
      const route = u.guide?.z ?? u.routeZ;
      const z = structure && Math.abs(target.x - u.x) > Math.max(260, u.range + 100) ? route : target.z;
      const dx = structure && Math.abs(z-u.z)>8 ? Math.sign(target.x-u.x)*Math.min(220,Math.abs(target.x-u.x)) : target.x - u.x;
      const dz = z - u.z, d = Math.hypot(dx, dz) || 1;
      const travel = Math.min(u.speed * FIXED_DT, Math.max(0, range - u.range));
      plan.x += dx / d * travel; plan.z += dz / d * travel;
      u.heading = turn(u.heading, Math.atan2(dz, dx), 7);
    } else {
      u.heading = turn(u.heading, heading, 9);
      // Siege closes gradually while firing at a screen, retaining its original
      // anti-stall behavior while other troops have room to pass on either side.
      if (u.siegeMultiplier && !structure && range > 35) {
        const d = distance(u, target) || 1;
        plan.x += (target.x - u.x) / d * u.speed * FIXED_DT * .3;
        plan.z += (target.z - u.z) / d * u.speed * FIXED_DT * .3;
      }
      if (s.metrics.firstContactTick === null) s.metrics.firstContactTick = s.tick;
      if (u.attackCooldown <= 1e-9 && Math.abs(angleDelta(u.heading, heading)) < .18) {
        u.attackCooldown = u.attackSpeed; u.animTimer = .3;
        const dmg = u.dmg * multiplier(s, u.team, 'dmg') * (structure ? u.siegeMultiplier || 1 : 1);
        if (u.projType) shots.push({ x: u.x + Math.cos(heading) * unitRadius(u), y: u.y - u.size * .7,
          z: u.z + Math.sin(heading) * unitRadius(u), target, ref: u.target, type: u.projType,
          speed: u.projSpeed, dmg, team: u.team, sourceRole: u.uType, splashRadius: u.splashRadius || 0 });
        else { hits.push({ team: u.team, ref: u.target, dmg }); emit(s, 'melee', { team: u.team, x: u.x, y: u.y - u.size / 2, z: u.z }); }
      }
    }
    plans.push(plan);
  }
  for (const team of [1, -1]) {
    const p = side(s, team);
    for (let slot = 0; slot < p.unlockedSlots; slot++) {
      p.turretTimers[slot] = Math.max(0, p.turretTimers[slot] - FIXED_DT);
      if (p.turrets[slot] === null) continue;
      const data = AGES[p.age].turrets[p.turrets[slot]], origin = cannonPoint(team, slot), aim = p.turretAim[slot];
      const targets = armies[-team].filter(u => u.drawProgress >= .8 && distance(origin, u) <= data.range + 120 && clearShot(origin, u, team));
      targets.sort((a, b) => distance(origin, a) - (a.id === aim.target?.id ? 35 : 0) - distance(origin, b) + (b.id === aim.target?.id ? 35 : 0) || a.id - b.id);
      const target = targets[0];
      aim.target = target ? targetRef(target) : null;
      if (!target || p.turretProgress[slot] < 1) continue;
      const heading = Math.atan2(target.z - origin.z, target.x - origin.x);
      aim.heading = turn(aim.heading, heading, 3.8);
      if (p.turretTimers[slot] > 1e-9 || Math.abs(angleDelta(aim.heading, heading)) > .045) continue;
      // Snap the last <3 degrees at release so muzzle and trajectory agree.
      aim.heading = heading;
      shots.push({ ...cannonMuzzle(team, slot, p.age, p.turrets[slot], heading), target, ref: aim.target,
        sourceSlot: slot, sourceId: p.turretIds[slot], type: data.projType, speed: data.projSpeed,
        dmg: data.dmg * multiplier(s, team, 'dmg'), team });
      p.turretTimers[slot] = data.attackSpeed;
    }
  }
  moveUnits(s, plans);
  for (const shot of shots) launch(s, shot);
  specialTick(s, hits);
  projectileTick(s, hits);
  for (const hit of hits) damage(s, hit);
  finishTick(s);
}

function launch(s, shot) {
  const { target, ref, ...data } = shot;
  const targetY = target.kind ? GROUND_Y - (target.kind === 'base' ? 65 : 60) : target.y - target.size / 2;
  const ticks = shot.type === 'laser' ? 1 : Math.max(1, Math.ceil(distance(shot, target) / shot.speed * TICK_RATE));
  s.projectiles.push({ ...data, id: s.nextId++, target: { ...ref }, targetId: ref.id ?? null, targetIsBase: ref.kind === 'base',
    targetX: target.x, targetY, targetZ: target.z, startX: shot.x, startY: shot.y, startZ: shot.z,
    flightTicks: ticks, elapsed: 0, vx: (target.x - shot.x) / (ticks / TICK_RATE), vy: (targetY - shot.y) / (ticks / TICK_RATE),
    arc: ['arc','meteor','arrow','cannonball'].includes(shot.type), active: true, hit: false, life: shot.type === 'laser' ? .12 : 0 });
}
function projectileTick(s, hits) {
  for (const p of s.projectiles) {
    if (p.hit) { p.life -= FIXED_DT; p.active = p.life > 0; continue; }
    const t = Math.min(1, ++p.elapsed / p.flightTicks), duration = p.flightTicks / TICK_RATE;
    p.x = p.startX + (p.targetX - p.startX) * t;
    p.z = p.startZ + (p.targetZ - p.startZ) * t;
    p.y = p.startY + (p.targetY - p.startY) * t - (p.arc ? Math.min(180, 220 * duration) * t * (1 - t) : 0);
    if (t < 1) continue;
    const target = resolveTarget(s, p.target);
    if (target && distance(target, { x: p.targetX, z: p.targetZ }) <= (target.size || radius(target)) + 20) {
      const reduced = p.splashRadius && target.uType === 0;
      // Heavy armor counters ordinary ranged fire. Light melee retains its
      // siege resistance: width must not turn ranged spam into the only army.
      const armor = p.sourceRole === 1 && target.uType === 2 ? .5 : 1;
      const infantry = p.sourceRole === 1 && target.uType === 0 ? 1.5 : 1;
      hits.push({ team: p.team, ref: p.target, dmg: p.dmg * (reduced ? .5 : 1) * armor * infantry });
      if (p.splashRadius) {
        const impact = { x: p.targetX, z: p.targetZ };
        const nearby = s.units.filter(u => u.team !== p.team && u.id !== target.id && distance(u, impact) < p.splashRadius)
          .sort((a,b) => distance(a,impact) - distance(b,impact) || a.id - b.id).slice(0,2);
        for (const u of nearby) hits.push({ team: p.team, ref: targetRef(u), dmg: p.dmg * .35 * (u.uType === 0 ? .5 : 1) });
      }
    }
    p.hit = true; p.active = p.life > 0;
    emit(s, 'impact', { x: p.x, y: p.y, z: p.z, projectileType: p.type });
  }
  s.projectiles = s.projectiles.filter(p => p.active);
}
function specialTick(s, hits) {
  for (const sp of s.specials) {
    const type = AGES[sp.age].special.type;
    const continuous = type === 'laser' || type === 'orbital';
    if (continuous || --sp.nextPulse <= 0) {
      const profiles = { meteor: [8,150,150], arrows: [30,40,60], cannons: [6,300,120], airstrike: [8,400,120], laser: [60,800/60,150], orbital: [60,2500/60,300] };
      const [rate, dmg, radius] = profiles[type];
      sp.nextPulse += TICK_RATE / rate;
      const owner = side(s, sp.team);
      const x = continuous ? sp.x : sp.x + sp.team * (random(owner) - .5) * 420;
      const z = continuous ? sp.z : sp.z + (random(owner) - .5) * 260;
      for (const u of s.units) if (u.team !== sp.team && distance(u,{x,z}) < radius) hits.push({ team: sp.team, ref: targetRef(u), dmg });
      for (const t of structures(s, -sp.team)) if (t.kind === 'turret' && distance(t,{x,z}) < radius) hits.push({ team: sp.team, ref: targetRef(t), dmg: dmg * .5 });
    }
    sp.remaining--;
  }
  s.specials = s.specials.filter(sp => sp.remaining > 0);
}
function damage(s, hit) {
  const target = resolveTarget(s, hit.ref);
  if (!target) return;
  const owner = side(s, hit.ref.team), turret = hit.ref.kind === 'turret';
  s.metrics.damage[hit.team] += Math.min(Math.max(0,target.hp), hit.dmg);
  if (turret) owner.turretHp[hit.ref.slot] -= hit.dmg;
  else if (hit.ref.kind === 'base') owner.hp -= hit.dmg;
  else target.hp -= hit.dmg;
  emit(s, 'damage', { team: hit.team, targetId: hit.ref.id ?? null, target: hit.ref, amount: hit.dmg, x: target.x, y: GROUND_Y - 50, z: target.z });
}
function finishTick(s) {
  const config = DIFFICULTY_SETTINGS[s.difficulty];
  for (const team of [1,-1]) {
    const owner = side(s, team);
    for (let slot = 0; slot < 4; slot++) if (owner.turrets[slot] !== null && owner.turretHp[slot] <= 0) {
      emit(s,'cannon-destroyed',{team,slot,id:owner.turretIds[slot],...cannonPoint(team,slot)});
      owner.turrets[slot] = null; owner.turretIds[slot] = null;
      owner.turretHp[slot] = owner.turretMaxHp[slot] = owner.turretTimers[slot] = 0;
      owner.turretProgress[slot] = 1; owner.turretAim[slot].target = null;
    }
  }
  for (const u of s.units) if (u.hp <= 0) {
    const winner = side(s,-u.team), loser = side(s,u.team);
    winner.gold += u.killGold * (u.team === 1 ? config.econMult : 1);
    winner.xp += u.killXp * (u.team === 1 ? config.xpMult : 1);
    loser.xp += u.killXp * .5 * (u.team === -1 ? config.xpMult : 1);
    s.metrics.kills[-u.team]++;
    emit(s,'death',{team:u.team,id:u.id,x:u.x,y:u.y,z:u.z,size:u.size,gold:u.killGold,xp:u.killXp});
  }
  s.units = s.units.filter(u => u.hp > 0);
  s.metrics.peakUnits = Math.max(s.metrics.peakUnits,s.units.length);
  if (s.player.hp <= 0 || s.enemy.hp <= 0) {
    s.player.hp = Math.max(0,s.player.hp); s.enemy.hp = Math.max(0,s.enemy.hp);
    s.winner = s.player.hp === 0 && s.enemy.hp === 0 ? 0 : s.enemy.hp === 0 ? 1 : -1;
    s.running = false; emit(s,'end',{winner:s.winner});
  }
}
