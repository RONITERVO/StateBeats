import { AGES } from '../content/ages.js';
import { BASE_WIDTH, CANVAS_WIDTH, TICK_RATE, DIFFICULTY_SETTINGS, UPGRADE_COSTS } from './constants.js';
import { side } from './state.js';
import { commandError, applyCommand } from './commands.js';

// Observation-only deterministic policy. The same legal actions are available to humans and bots.
export function chooseAction(s, team = -1, style = 'adaptive') {
  const own = side(s, team), enemy = side(s, -team), age = AGES[own.age];
  const ours = s.units.filter(u => u.team === team), theirs = s.units.filter(u => u.team !== team);
  const x = team === 1 ? BASE_WIDTH : CANVAS_WIDTH - BASE_WIDTH;
  const threats = theirs.filter(u => Math.abs(u.x - x) < 500);
  const danger = theirs.filter(u => Math.abs(u.x - x) < 320);
  const legal = c => !commandError(s, team, c);
  const evolve = { type: 'evolve' };
  if (legal(evolve)) return evolve;
  const special = { type: 'special' };
  if (style !== 'passive' && legal(special) && (theirs.length >= 3 || (danger.length > 0 && own.hp < own.maxHp * .4))) return special;
  if (style === 'passive') return null;
  const candidates = [];
  const add = (command, score) => {
    if (legal(command)) candidates.push({ command, score });
    else if (command.type === 'unit' && command.index > 0 && commandError(s, team, command) === 'gold' && danger.length === 0 && ours.length >= 1)
      candidates.push({ command: null, score }); // Bank for a counter instead of feeding cheap troops.
  };
  const front = ours.filter(u => u.type !== 'ranged').length;
  const ranged = ours.filter(u => u.type === 'ranged').length;
  const incomingRanged = theirs.filter(u => u.type === 'ranged').length;
  const emotion = team === -1 ? s.opponent.emotion.toLowerCase() : 'centered';
  const aggressive = /angry|furious|brave|confident|excited|eager/.test(emotion);
  const cautious = /afraid|anxious|worried|scared|tense|sad|weary/.test(emotion);
  for (let i = 0; i < age.units.length; i++) {
    const u = age.units[i];
    let score = 2;
    if (style === 'melee') score += i === 0 ? 10 : -10;
    else if (style === 'ranged') score += i === 1 ? 10 : -10;
    else if (style === 'heavy') score += i === 2 ? 10 : -10;
    else if (style === 'mixed') score += i === s.metrics.spawned[team] % 3 ? 5 : 0;
    else {
      if (u.type === 'ranged') score += front > 0 ? 3 : -.5;
      else score += front === 0 ? 3 : 0;
      if (i === 2) score += incomingRanged > 1 ? 2 : .5;
      if (i === 2 && enemy.turrets.some(t => t !== null)) score += 3;
      if (i === 2 && theirs.length >= 3 && ours.filter(u => u.uType === 2).length < 2) score += 3;
      if (aggressive && i === 2) score += .5;
      if (cautious && i === 0) score += .5;
      if (u.type === 'ranged' && ranged >= Math.max(2, front * 2)) score -= 3;
      if (i === 0 && front > Math.max(2, ranged)) score -= 2;
      // Price-normalized efficiency avoids raw-damage scores always choosing expensive units.
      score += Math.min(1, (u.hp * u.dmg / u.attackSpeed) / (u.cost * u.cost));
    }
    if (style === 'heavy' && i !== 2 && threats.length < 2) continue;
    if (style === 'melee' && i !== 0 || style === 'ranged' && i !== 1) continue;
    add({ type: 'unit', index: i }, score);
  }
  if (style === 'adaptive' || style === 'turtle' || style === 'mixed') {
    // Buy defense to meet actual pressure; do not sink the opening army into idle turrets.
    if (danger.length >= 2 || style === 'turtle') {
      for (let i = 0; i < age.turrets.length; i++) add({ type: 'turret', index: i }, 3 + threats.length * .7 + (style === 'turtle' ? 5 : 0) + i * .1);
      if (own.turrets.every((t, i) => i >= own.unlockedSlots || t !== null)) add({ type: 'slot' }, style === 'turtle' ? 6 : threats.length > 4 ? 4 : 0);
    }
    if (ours.length >= 1 || own.gold >= age.units[2].cost * 2) {
      for (const stat of ['econ', 'dmg', 'hp']) {
        const level = own.upgrades[stat], cost = UPGRADE_COSTS[level];
        // Keep cash for a screen; economy only when its payback fits a normal battle.
        if (own.gold >= cost + age.units[0].cost * .25) add({ type: 'upgrade', stat }, stat === 'econ' ? (threats.length < 2 ? 5 : 2) : 5.5);
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0]?.command ?? null;
}

export function opponentTick(s) {
  if (!s.opponent.enabled || s.tick < s.opponent.nextTick) return;
  const config = DIFFICULTY_SETTINGS[s.difficulty];
  s.opponent.nextTick = s.tick + Math.max(1, Math.round(config.thinkRate * TICK_RATE));
  const command = chooseAction(s);
  if (command && applyCommand(s, -1, command).ok) {
    s.opponent.lastAction = command.type;
    s.opponent.order = command.type === 'turret' ? 'defend' : command.type === 'evolve' ? 'tech' : command.type === 'special' ? 'special' : 'counter';
  } else s.opponent.order = 'hold';
}
