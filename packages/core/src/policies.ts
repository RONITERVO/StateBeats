import type { InteractionPolicy, Rules, ScoringPolicy, ArbitrationPolicy } from './types.js';
export const contactPolicy: InteractionPolicy = {
  id: 'builtin/contact',
  version: '1.0.0',
  validate: () => [],
  evaluate: ({ contacts, memory, entity }) => ({
    eligible: contacts.filter(
      (c) =>
        entity.kind === 'hazard' ||
        c.semantic !== 'head' ||
        entity.slots.some((s) => s.semantic === 'head' || s.effectorId === c.effectorId),
    ),
    memory,
  }),
};
export const defaultScoring: ScoringPolicy = {
  id: 'builtin/timing-score',
  version: '1.0.0',
  score: ({ entity, error, rules }) => {
    const grade =
      rules.grades.find((g) => error <= g.within) ?? rules.grades[rules.grades.length - 1];
    return { grade: grade.name, points: Math.round(entity.value * grade.multiplier) };
  },
};
export const defaultArbitration: ArbitrationPolicy = {
  id: 'builtin/stable-order',
  version: '1.0.0',
  order: (contacts) =>
    [...contacts].sort((a, b) => a.actorIndex - b.actorIndex || a.effectorIndex - b.effectorIndex),
};
export const defaultRules = (tickRate = 120): Rules => ({
  tickRate,
  maxTick: 2147483647,
  grades: [
    { within: Math.round(tickRate / 30), name: 'perfect', multiplier: 1 },
    { within: Math.round(tickRate / 12), name: 'great', multiplier: 0.8 },
    { within: Math.round(tickRate / 5), name: 'good', multiplier: 0.5 },
    { within: 2147483647, name: 'contact', multiplier: 0.25 },
  ],
  hazardInterval: Math.round(tickRate / 10),
  hazardPenalty: 25,
  groupBonus: 100,
  maxActors: 16,
  maxEntities: 2000,
  maxDirectorSpawnsPerTick: 16,
});
