import { AGES } from '../content/ages.js';
import { DIFFICULTY_SETTINGS, RULES_VERSION, TICK_RATE, INCOME } from './constants.js';
import { TABLETOP_RULES_VERSION } from './battlefield.js';

export function side(state, team) { return team === 1 ? state.player : state.enemy; }
export function multiplier(state, team, stat) {
  const upgrade = side(state, team).upgrades[stat];
  const base = 1 + upgrade * ({ dmg: .15, hp: .25, econ: .2 }[stat]);
  return base * (team === -1 ? DIFFICULTY_SETTINGS[state.difficulty][`${stat}Mult`] : 1);
}
export function income(state, team) { return INCOME[side(state, team).age] * multiplier(state, team, 'econ'); }
export function random(state) {
  // Independent, serializable PRNG per side: mirrored specials consume mirrored streams.
  let x = state.rng >>> 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.rng = x >>> 0;
  return state.rng / 4294967296;
}
export function emit(state, type, data = {}) { state.events.push({ tick: state.tick, type, ...data }); }
export function createState({ seed = 1, difficulty = 'normal', startAge = 0, opponent = true, battlefield } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('seed must be a uint32');
  if (!Object.hasOwn(DIFFICULTY_SETTINGS, difficulty)) throw new Error('Unknown difficulty');
  if (!Number.isInteger(startAge) || startAge < 0 || startAge >= AGES.length) throw new Error('Invalid startAge');
  if (typeof opponent !== 'boolean') throw new Error('opponent must be boolean');
  if (battlefield !== undefined && battlefield !== 'tabletop') throw new Error('Unknown battlefield');
  const config = DIFFICULTY_SETTINGS[difficulty];
  const makeSide = team => {
    const maxHp = AGES[startAge].baseHp * (team === -1 ? config.baseHpMult : 1);
    return { hp: maxHp, maxHp, age: startAge, gold: (team === -1 ? config.baseGold : 175) * AGES[startAge].units[0].cost / 15,
      xp: startAge ? AGES[startAge - 1].evolveXP : 0, upgrades: { dmg: 0, hp: 0, econ: 0 },
      turrets: [null, null, null, null], turretProgress: [1, 1, 1, 1], turretTimers: [0, 0, 0, 0],
      unlockedSlots: 1, specialTimer: 0, drawProgress: 1, deployTimer: 0, rng: (seed || 1) >>> 0,
      ...(battlefield ? { turretHp: [0,0,0,0], turretMaxHp: [0,0,0,0], turretIds: [null,null,null,null],
        turretAim: Array.from({length: 4}, () => ({heading: team === 1 ? 0 : Math.PI, target: null})) } : {}) };
  };
  return { version: battlefield ? TABLETOP_RULES_VERSION : RULES_VERSION, ...(battlefield ? { battlefield } : {}), seed, difficulty, tick: 0, nextId: 1, running: true, paused: false, winner: null,
    player: makeSide(1), enemy: makeSide(-1), units: [], projectiles: [], specials: [], events: [],
    agreements: { noSpecials: false, noTurrets: false, meleeOnly: false }, restraintUntil: 0,
    opponent: { enabled: opponent, nextTick: Math.round(.8 * TICK_RATE), order: 'balanced', lastAction: '', emotion: 'Centered' },
    metrics: { firstContactTick: null, kills: { '1': 0, '-1': 0 }, spent: { '1': 0, '-1': 0 },
      damage: { '1': 0, '-1': 0 }, spawned: { '1': 0, '-1': 0 }, peakUnits: 0, evolutions: [] } };
}
