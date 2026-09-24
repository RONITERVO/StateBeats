// Authoritative geometry uses the original canvas coordinate system.
export const RULES_VERSION = '2.0.0';
export const TICK_RATE = 60;
export const FIXED_DT = 1 / TICK_RATE;
export const CANVAS_WIDTH = 1280;
export const CANVAS_HEIGHT = 720;
export const GROUND_Y = 600;
export const BASE_WIDTH = 180;
export const MAX_UNITS = 80; // per side, including units being drawn
export const UPGRADE_COSTS = [500, 1500, 3500, 8000, 18000, 35000, 75000, 150000, 350000, 750000];
export const INCOME = [5, 12, 35, 200, 700, 1800];
// Normal is a fair economy. Higher difficulty handicaps remain explicit.
export const DIFFICULTY_SETTINGS = Object.freeze({
  normal: { name: 'Normal', color: 'hsl(var(--diff-normal))', hpMult: 1, dmgMult: 1, econMult: 1, xpMult: 1, baseGold: 175, baseHpMult: 1, thinkRate: 1.8, aiAggression: .35 },
  hard: { name: 'Hard', color: 'hsl(var(--diff-hard))', hpMult: 1.2, dmgMult: 1.1, econMult: 1.4, xpMult: 1.2, baseGold: 250, baseHpMult: 1.2, thinkRate: 1.15, aiAggression: .58 },
  harder: { name: 'Harder', color: 'hsl(var(--diff-harder))', hpMult: 1.5, dmgMult: 1.3, econMult: 2, xpMult: 1.5, baseGold: 500, baseHpMult: 1.5, thinkRate: .65, aiAggression: .82 },
  impossible: { name: 'Impossible', color: 'hsl(var(--diff-impossible))', hpMult: 2, dmgMult: 1.5, econMult: 4, xpMult: 2.5, baseGold: 1500, baseHpMult: 2, thinkRate: .28, aiAggression: 1 }
});
