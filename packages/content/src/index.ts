import { compile, generateMap } from '@statebeats/sdk';
import type { MapDefinition, MapInput, NoteInput } from '@statebeats/sdk';
import { sunlitJourney } from './journey.js';
import { choreographyJourney } from './choreography.js';
import { eventHorizonMaster } from './event-horizon.js';
import { inkBattleMap } from '@statebeats/ink-battle';
import { audioTutorial } from './audio-tutorial.js';
export { audioTutorial, AUDIO_TUTORIAL_ID } from './audio-tutorial.js';
const p = (azimuth: number, radius = 0.8, elevation = 0) => ({
  azimuth,
  elevation,
  radius,
  height: 1.4,
});
function note(
  id: string,
  beat: number,
  preset: NoteInput['preset'],
  azimuth: number,
  moving = false,
): NoteInput {
  const position = p(azimuth, 0.8, preset === 'left' ? -5 : 5);
  return {
    id,
    beat,
    preset,
    position,
    anchor: 'player',
    shape: { kind: 'sphere', radius: preset === 'combined' ? 0.22 : 0.16 },
    earlyMs: 250,
    lateMs: 250,
    motion: moving
      ? [
          { beat: beat - 2, position: { ...position, radius: 3 } },
          { beat, position },
          { beat: beat + 0.5, position: { ...position, radius: 0.65 } },
        ]
      : [],
  };
}
const tutorial: MapInput = {
  version: 1,
  id: 'tutorial',
  title: 'First orbit',
  description:
    'A guided minute: each hand, approaching notes, paired touches, holds, avoidance and a gentle full turn.',
  durationBeats: 112,
  tempo: [{ beat: 0, bpm: 112 }],
  notes: [],
};
for (let i = 0; i < 24; i++) {
  const beat = 4 + i * 4,
    azimuth = i < 8 ? 0 : Math.floor((i - 8) / 2) * 45;
  const preset: NoteInput['preset'] =
    i === 6 || i === 16 ? 'combined' : i === 10 || i === 20 ? 'hold' : i % 2 ? 'right' : 'left';
  tutorial.notes.push({
    ...note(
      `tutorial-${i}`,
      beat,
      preset,
      azimuth + (preset === 'left' ? -18 : preset === 'right' ? 18 : 0),
      i % 4 >= 2,
    ),
    ...(preset === 'hold' ? { holdMs: 600, durationBeats: 2 } : {}),
    minSpeed: 0,
  });
}
tutorial.notes.push({
  id: 'tutorial-hazard',
  beat: 104,
  preset: 'hazard',
  position: [0, 1.55, -0.15],
  anchor: 'player',
  shape: { kind: 'box', half: [0.2, 0.32, 0.2] },
  durationBeats: 2,
  leadMs: 2500,
});
const showcase: MapInput = {
  version: 1,
  id: 'showcase',
  title: 'Around the pulse',
  description:
    'A full 360-degree rhythm journey with moving and anchored notes, changing tempo and meter.',
  durationBeats: 288,
  tempo: [
    { beat: 0, bpm: 112 },
    { beat: 96, bpm: 128, meter: [3, 4] },
    { beat: 192, bpm: 104, meter: [4, 4] },
  ],
  notes: [],
  groups: [],
};
for (let i = 0; i < 90; i++) {
  const beat = 4 + i * 3,
    sector = Math.floor(i / 5) * 45,
    preset: NoteInput['preset'] =
      i % 15 === 9 ? 'hold' : i % 15 === 12 ? 'combined' : i % 2 ? 'right' : 'left';
  showcase.notes.push({
    ...note(
      `orbit-${i}`,
      beat,
      preset,
      sector + (preset === 'left' ? -18 : preset === 'right' ? 18 : 0),
      i % 3 !== 0,
    ),
    ...(preset === 'hold' ? { holdMs: 700, durationBeats: 2 } : {}),
    minSpeed: 0.1,
  });
  if (i % 20 === 18)
    showcase.notes.push({
      id: `wall-${i}`,
      beat: beat + 1,
      preset: 'hazard',
      position: p(sector, 0.15, 0),
      anchor: 'player',
      shape: { kind: 'box', half: [0.2, 0.35, 0.18] },
      durationBeats: 1,
      leadMs: 2000,
    });
}
// Linked separate volumes complement the single-volume combined preset.
showcase.notes.push(
  { ...note('linked-left', 280, 'left', -25), group: 'final-chord' },
  { ...note('linked-right', 280, 'right', 25), group: 'final-chord' },
);
showcase.groups!.push({
  id: 'final-chord',
  members: ['linked-left', 'linked-right'],
  linkMs: 150,
  bonus: 200,
});
const duet: MapInput = {
  version: 1,
  id: 'duet',
  title: 'Shared frequency',
  description:
    'Cooperate with a local partner actor. The reference player supplies a visible bot partner.',
  durationBeats: 112,
  tempo: [{ beat: 0, bpm: 108 }],
  notes: [],
};
for (let i = 0; i < 24; i++) {
  const beat = 4 + i * 4,
    azimuth = Math.floor(i / 4) * 60;
  duet.notes.push({
    ...note(`duet-${i}`, beat, 'shared', azimuth, i % 2 === 1),
    slots: [{ actorId: 'player' }, { actorId: 'partner' }],
    linkMs: 150,
  });
}
const arena: MapInput = {
  version: 1,
  id: 'agent-arena',
  title: 'Agent arena',
  description:
    'Short generous sequence for deterministic scripts, manual LLM turns and local competitive actors.',
  durationBeats: 40,
  tempo: [{ beat: 0, bpm: 100 }],
  notes: [],
};
for (let i = 0; i < 8; i++)
  arena.notes.push({
    ...note(`arena-${i}`, 4 + i * 4, 'any', i * 45, i % 2 === 1),
    earlyMs: 400,
    lateMs: 400,
  });
const raw = [
  tutorial,
  showcase,
  duet,
  arena,
  sunlitJourney(),
  sunlitJourney(true),
  choreographyJourney(),
  eventHorizonMaster(),
  inkBattleMap(),
  audioTutorial(),
];
export const sampleMaps: MapDefinition[] = raw.map((map) => compile(map).map);
export function sampleMap(id: string): MapDefinition {
  const map = sampleMaps.find((m) => m.id === id);
  if (!map) throw new Error(`Unknown sample map: ${id}`);
  return JSON.parse(JSON.stringify(map));
}
export { generateMap };
export { sunlitJourney };
export { choreographyJourney };
export {
  eventHorizonMaster,
  eventHorizonHeading,
  eventHorizonSoundtrack,
  eventHorizonSections,
  eventHorizonTurnPlan,
  EVENT_HORIZON_ID,
} from './event-horizon.js';
