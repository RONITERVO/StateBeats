import { mkdir, writeFile } from 'node:fs/promises';
import { planTurns, createFacingSampler } from '@statebeats/sdk';
import { eventHorizonTurnPlan } from '@statebeats/content';

const plan = planTurns(
  [
    {
      id: 'call',
      beat: 8,
      endBeat: 11.5,
      gesture: 'sweep',
      direction: 'right',
      reason: 'Lead melody',
    },
    { id: 'carry', beat: 12, endBeat: 15.5, gesture: 'continue', reason: 'Repeated lead' },
    { id: 'answer', beat: 16, endBeat: 19.5, gesture: 'answer', reason: 'Answering phrase' },
    { id: 'land', beat: 20, endBeat: 23.5, gesture: 'settle', reason: 'Cadence' },
  ],
  { bpm: 150, degrees: 45, maxSpeed: 70, maxAcceleration: 180 },
);
const at = createFacingSampler(plan.track);
console.log('Original phrase:', plan.summary);
console.log(
  'Facing at beats 8–24:',
  Array.from({ length: 17 }, (_, i) => [8 + i, at(8 + i)]),
);
const showcase = eventHorizonTurnPlan();
console.log('Event Horizon:', showcase.summary);
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/event-horizon-turns.json', JSON.stringify(showcase, null, 2) + '\n');
