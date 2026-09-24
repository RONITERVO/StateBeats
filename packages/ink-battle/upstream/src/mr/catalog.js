import { AGES } from '../content/ages.js';
import { UPGRADE_COSTS } from '../core/constants.js';
import { defenseTarget, onDock } from './defense-layout.js';
import { wide } from '../core/battlefield.js';

export const TABLE = Object.freeze({
  width: 2.4,
  depth: 1.35,
  lane: 0.45,
  minScale: 0.2,
  maxScale: 1.6
});
export const UNIT_FORMS = Object.freeze(
  [
    ['club', 'sling', 'dinosaur'],
    ['sword', 'bow', 'horse'],
    ['halberd', 'musket', 'cannon'],
    ['soldier', 'rifle', 'tank'],
    ['blade', 'blaster', 'mech'],
    ['drone', 'ray', 'mothership']
  ].map(Object.freeze)
);
export const DIFFICULTIES = ['normal', 'hard', 'harder', 'impossible'];

/** Physical offers are projections of the content catalog, never another economy. */
export function shopOffers(state) {
  if (!state || !state.running)
    return DIFFICULTIES.map((difficulty, i) => ({
      id: `start-${difficulty}`,
      kind: 'seal',
      label: difficulty[0].toUpperCase() + difficulty.slice(1),
      detail: 'Drop on the page to begin',
      action: 'start',
      difficulty,
      price: 0,
      x: -0.72 + i * 0.48,
      z: 0.89
    }));
  const age = AGES[state.player.age],
    offers = [];
  age.units.forEach((unit, index) =>
    offers.push({
      id: `unit-${index}`,
      kind: 'unit',
      label: unit.name,
      detail: wide(state) ? [
        'Light infantry · surround heavies; resist siege',
        'Ranged · counters infantry; heavy armor resists shots',
        'Heavy · resists ranged fire; breaks defenses'
      ][index] : 'Drop in the green rally area',
      price: unit.cost,
      command: { type: 'unit', index },
      x: -1.02 + index * 0.34,
      z: 0.86
    })
  );
  age.turrets.forEach((turret, index) =>
    offers.push({
      id: `turret-${index}`,
      kind: 'turret',
      label: turret.name,
      detail: 'Place on the highlighted empty dock',
      price: turret.cost,
      command: { type: 'turret', index },
      x: 0.12 + index * 0.34,
      z: 0.86
    })
  );
  for (const [i, stat] of ['dmg', 'hp', 'econ'].entries())
    offers.push({
      id: `upgrade-${stat}`,
      kind: 'potion',
      label: { dmg: 'Sharpened', hp: 'Thick Paper', econ: 'Fast Ink' }[stat],
      detail: 'Toss onto the battlefield',
      price: UPGRADE_COSTS[state.player.upgrades[stat]] ?? Infinity,
      command: { type: 'upgrade', stat },
      x: -1.04 + i * 0.27,
      z: 1.16
    });
  offers.push(
    {
      id: 'evolve',
      kind: 'evolve',
      label: 'Next age',
      detail: 'Pour onto the page',
      price: age.evolveXP,
      currency: 'XP',
      command: { type: 'evolve' },
      x: -0.21,
      z: 1.16
    },
    {
      id: 'special',
      kind: 'special',
      label: age.special.name,
      detail: 'Toss onto the battlefield',
      price: 0,
      command: { type: 'special' },
      x: 0.08,
      z: 1.16
    },
    {
      id: 'slot',
      kind: 'slot',
      label: 'Cannon dock',
      detail: 'Build on the highlighted outline · four docks maximum',
      price: state.player.unlockedSlots < 4 ? state.player.unlockedSlots * 500 : Infinity,
      command: { type: 'slot' },
      x: 0.37,
      z: 1.16
    },
    {
      id: 'sell',
      kind: 'eraser',
      label: 'Sell cannon',
      detail: 'Drop on any of your cannons · 50% refund',
      price: 0,
      command: { type: 'sell' },
      x: 0.66,
      z: 1.16
    }
  );
  return offers;
}

export const TOOLS = Object.freeze([
  {
    id: 'pause',
    action: 'pause',
    kind: 'hourglass',
    label: 'Pause / resume',
    detail: 'Lift and return to the page',
    x: 1.05,
    z: 0.83
  },
  {
    id: 'speed',
    action: 'speed',
    kind: 'clock',
    label: 'Battle speed',
    detail: 'Lift and return · 1× / 2× / 3×',
    x: 1.05,
    z: 1.13
  },
  {
    id: 'quality',
    action: 'quality',
    kind: 'feather',
    label: 'Mist & detail',
    detail: 'Lift and return to change',
    x: -1.05,
    z: -0.66
  },
  {
    id: 'new',
    action: 'new',
    kind: 'page',
    label: 'New canvas',
    detail: 'Pause first, then drop on the page',
    x: -0.69,
    z: -0.66
  },
  {
    id: 'music',
    action: 'music',
    kind: 'music',
    label: 'Music box',
    detail: 'Lift and return to toggle music',
    x: 0.69,
    z: -0.66
  },
  {
    id: 'exit',
    action: 'exit',
    kind: 'compass',
    label: 'Leave the table',
    detail: 'Lift and return to leave MR',
    x: 1.05,
    z: -0.66
  }
]);

export function dropZone(offer, point, state) {
  if (!point || !['x', 'y', 'z'].every((k) => Number.isFinite(point[k])))
    return 'invalid-position';
  if (
    Math.abs(point.x) > TABLE.width / 2 ||
    Math.abs(point.z) > TABLE.depth / 2 ||
    Math.abs(point.y) > 0.12
  )
    return 'off-table';
  if (
    offer.kind === 'unit' &&
    !(
      point.x >= -0.88 &&
      point.x <= -0.44 &&
      point.z >= (state && wide(state) ? -0.36 : 0.14) &&
      point.z <= 0.65
    )
  )
    return 'rally-area';
  if (
    offer.kind === 'nudge' && (point.z < -0.37 || point.z > 0.65)
  ) return 'off-table';
  if (
    ['turret', 'slot', 'eraser'].includes(offer.kind) &&
    !onDock(point, defenseTarget(offer, state, point))
  )
    return { turret: 'cannon-dock', slot: 'dock-outline', eraser: 'sell-dock' }[offer.kind];
  return null;
}

export const REASONS = Object.freeze({
  'guide-cooldown': 'Let this troop react before nudging it again.',
  'unavailable-unit': 'That troop is no longer available to guide.',
  'wrong-battlefield': 'Start a new tabletop battle to use troop guidance.',
  gold: 'More gold is needed. The piece returns to the shop.',
  xp: 'More XP is needed for the next age.',
  paused: 'Drop the hourglass onto the page to resume first.',
  deploying: 'Your last troop is still deploying.',
  'deployment-blocked': 'Make room at your rally point.',
  'unit-cap': 'Your army is full.',
  'slots-full': 'Add a cannon dock or sell a cannon first.',
  'no-turret': 'There is no cannon to sell.',
  cooldown: 'The special is still recharging.',
  'base-drawing': 'Your new base is still being drawn.',
  'max-upgrade': 'This potion is already at its strongest.',
  'max-age': 'You have reached the final age.',
  'off-table': 'Missed the page. Nothing was spent.',
  'rally-area': 'Drop troops in the green rally area.',
  'cannon-dock': 'Place the cannon on the highlighted empty dock beside your base.',
  'dock-outline': 'Build the dock on the highlighted dashed outline beside your base.',
  'sell-dock': 'Drop the eraser on an occupied dock beside your base. The dock stays.',
  'max-docks': 'All four cannon docks are built. Place a cannon on an empty dock.',
  'stale-age': 'The age changed. Choose a new piece.',
  'pause-first': 'Pause before starting a new canvas.',
  'match-ended': 'Choose a difficulty to start the next battle.',
  'tracking-lost': 'Tracking lost. Held pieces returned safely.',
  'not-started': 'Drop a difficulty seal onto the page.',
  'invalid-position': 'The drop could not be tracked.',
  'already-holding': 'Release the piece in this hand first.',
  'unknown-offer': 'That piece is no longer on sale.'
});
