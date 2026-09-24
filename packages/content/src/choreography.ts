import { generateChoreography, SILENT_FEATURES } from '@statebeats/sdk';
import type { MusicTimeline } from '@statebeats/sdk';

/** Original recorded feature score for the player's procedural soundtrack, with no external audio. */
export function choreographyJourney() {
  const music: MusicTimeline = {
    version: 1,
    tickRate: 120,
    algorithm: 'statebeats/original-phrase-score-v1',
    frames: [],
  };
  for (let tick = 480; tick <= 12000; tick += 6) {
    const beat = (tick - 480) / 60,
      phrase = Math.floor(beat / 8);
    const pulse = Math.exp(-((tick - 480) % 60) / 10);
    const energy = phrase % 4 === 0 ? 0.2 : phrase % 4 === 3 ? 0.75 : 0.45;
    music.frames.push({
      tick,
      features:
        tick === 12000
          ? { ...SILENT_FEATURES }
          : {
              ...SILENT_FEATURES,
              energy,
              rms: 0.18,
              bass: pulse * 0.6,
              mid: energy * 0.7,
              air: 0.08,
              flux: pulse * 0.7,
              transient: pulse * 0.8,
              beat: pulse,
            },
    });
  }
  const { map } = generateChoreography(music, {
    id: 'choreography-journey',
    title: 'Phrases in orbit',
    seed: 17,
    bpm: 120,
    difficulty: 'flow',
    turnMode: 'full',
    turnDegrees: 30,
    crossovers: true,
  });
  map.description =
    'Original paired pulses, mirrored arcs, independent hand rails and crossovers. Facing stays steady during each phrase; recovery gaps make room for a full turn.';
  return map;
}
