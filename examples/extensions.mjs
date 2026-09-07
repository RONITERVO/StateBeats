import { contactPolicy } from '@statebeats/core';

// A second entry after leaving is required. Memory is part of snapshots and replays.
export const doubleEntry = {
  id: 'example/double-entry', version: '1.0.0', validate: () => [],
  evaluate({contacts, memory}) {
    const before = memory ?? {inside: false, entries: 0};
    const inside = contacts.some(c=>c.inside);
    const entries = before.entries + (inside && !before.inside ? 1 : 0);
    return {eligible: entries >= 2 ? contacts.filter(c=>c.inside) : [], memory:{inside, entries}};
  },
};
export const examplePolicies = [contactPolicy, doubleEntry];
export const flatScore = {
  id: 'example/flat-score', version: '1.0.0',
  score: () => ({grade:'completed',points:42}),
};
export const reversePriority = {
  id:'example/reverse-priority', version:'1.0.0',
  order: contacts => [...contacts].sort((a,b)=>b.actorIndex-a.actorIndex || b.effectorIndex-a.effectorIndex),
};
// This bot knows only its observation, unlike the privileged scripted fixture generator.
export function observerBot(actorId = 'player') {
  return {
    id:`example-bot-${actorId}`,
    poll(tick,view) {
      const target = view.entities.find(e=>e.kind !== 'hazard' && tick === e.hitTick);
      if (!target) return [];
      const slots = target.slots.filter(s=>!s.actorId || s.actorId === actorId);
      return slots.map((slot,i)=>({id:`bot-${actorId}-${tick}-${i}`, tick, type:'pose', actorId,
        effectorId:slot.effectorId ?? slot.semantic ?? (i ? 'right' : 'left'), position:target.position}));
    },
  };
}
export function jsonPerception(write) {
  return {id:'example-json', frame:view=>write(JSON.stringify({tick:view.tick, entities:view.entities, scores:view.scores})),
    events:events=>events.forEach(event=>write(JSON.stringify({event})))};
}
