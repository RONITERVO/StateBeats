import { AGES } from '../content/ages.js';
import { FIXED_DT, DIFFICULTY_SETTINGS } from './constants.js';
import { side, income } from './state.js';
import { applyCommand } from './commands.js';
import { combatTick } from './combat.js';
import { opponentTick } from './opponent.js';
import { tabletopCombatTick } from './tabletop-combat.js';
import { wide } from './battlefield.js';

// Internal in-place tick for simulation throughput. Only Session owns this state.
export function step(s) {
  if (!s.running || s.paused) return false;
  s.tick++;
  for (const team of [1, -1]) {
    const p = side(s, team);
    p.gold += income(s, team) * FIXED_DT;
    if (p.age < AGES.length - 1) {
      const previous = p.age ? AGES[p.age - 1].evolveXP : 0;
      p.xp += (AGES[p.age].evolveXP - previous) / 110 * FIXED_DT * (team === -1 ? DIFFICULTY_SETTINGS[s.difficulty].xpMult : 1);
    }
    p.specialTimer = Math.max(0, p.specialTimer - FIXED_DT);
    p.deployTimer = Math.max(0, p.deployTimer - FIXED_DT);
    p.drawProgress = Math.min(1, p.drawProgress + FIXED_DT * .3);
    for (let i = 0; i < 4; i++) p.turretProgress[i] = Math.min(1, p.turretProgress[i] + FIXED_DT * .5);
  }
  opponentTick(s);
  if (wide(s)) tabletopCombatTick(s);
  else combatTick(s);
  return true;
}

// Pure reference transition, useful to consumers that store immutable state.
export function transition(state, commands = []) {
  const next = structuredClone(state);
  next.events = [];
  const receipts = commands.map(({ team, command }) => applyCommand(next, team, command));
  step(next);
  return { state: next, receipts, events: structuredClone(next.events) };
}
