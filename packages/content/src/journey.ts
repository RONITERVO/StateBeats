import { cartesian, SILENT_FEATURES } from '@statebeats/sdk';
import type { MapInput, MusicTimeline } from '@statebeats/sdk';

/** Original content. Every release, approach and avoidance volume is authorable without a renderer. */
export function sunlitJourney(space = false): MapInput {
  const durationBeats = 136;
  const music: MusicTimeline = {
    version: 1,
    tickRate: 120,
    algorithm: 'statebeats/score-envelope-v1',
    frames: [],
  };
  for (let tick = 0; tick <= durationBeats * 60; tick += 6) {
    const beat = tick / 60,
      phase = beat % 1,
      pulse = Math.exp(-phase * 9);
    const phrase = 0.5 + 0.5 * Math.sin((beat / 16) * Math.PI);
    music.frames.push({
      tick,
      features: {
        ...SILENT_FEATURES,
        energy: 0.25 + 0.4 * phrase + 0.2 * pulse,
        rms: 0.18 + 0.1 * phrase,
        bass: pulse * 0.8,
        subBass: pulse * 0.55,
        lowMid: 0.3 + 0.25 * phrase,
        mid: 0.2 + 0.3 * (1 - phrase),
        presence: (beat % 2 >= 1 ? 0.6 : 0.2) * pulse,
        air: 0.2 + 0.25 * (1 - phrase),
        beat: pulse,
        transient: pulse,
        flux: pulse * 0.4,
      },
    });
  }
  const position = (beat: number, hand = 0) => ({
    azimuth: ((beat - 8) / 128) * 360 + hand * 16,
    elevation: hand * 5,
    radius: 0.8,
    height: 1.35,
  });
  const map: MapInput = {
    version: 1,
    id: space ? 'black-hole' : 'sunlit-journey',
    title: space ? 'A sky full of stars' : 'Chasing the sun',
    description: space
      ? 'Follow a moving black hole around a star field. Its trail guides paired star catches and passing obstacles.'
      : 'Follow a traveling sun over water and mountains. Catch its stars, hold the fireflies and duck beneath passing birds through a complete turn.',
    durationBeats,
    tempo: [{ beat: 0, bpm: 120 }],
    music,
    scene: {
      version: 1,
      theme: space ? 'statebeats/space' : 'statebeats/landscape',
      label: space
        ? 'A moving black hole leaves a glowing trail across a field of stars.'
        : 'A golden sun travels around a watercolor landscape. Water, mountains and clouds respond to different parts of the music.',
      objects: [
        {
          id: 'sun',
          appearance: space ? 'statebeats/black-hole' : 'statebeats/sun',
          label: space ? 'Traveling black hole' : 'Traveling sun',
          position: [0, 10, -24],
          anchor: 'player',
          scale: 1.2,
          color: space ? '#b4a0ff' : '#ffd58a',
          trailSeconds: 5,
          react: [
            { channel: 'bass', property: 'scale', amount: 0.12 },
            { channel: 'energy', property: 'brightness', amount: 1.3 },
          ],
          motion: Array.from({ length: 18 }, (_, i) => ({
            beat: i * 8,
            position: {
              azimuth: ((i * 8 - 2) / 128) * 360,
              elevation: 22 + 5 * Math.sin(i / 4),
              radius: 24,
              height: 1.4,
            },
          })),
        },
      ],
    },
    notes: [],
  };
  for (let i = 0; i < 61; i++) {
    const beat = 8 + i * 2,
      paired = i > 0 && i % 12 === 0,
      stationary = i > 0 && i % 15 === 0;
    for (const hand of paired ? [-1, 1] : [i % 2 ? 1 : -1]) {
      const semantic = hand < 0 ? 'left' : 'right';
      map.notes.push({
        id: `journey-${i}-${semantic}`,
        beat,
        preset: stationary ? 'hold' : semantic,
        slots: [{ semantic }],
        position: position(beat, hand),
        anchor: 'player',
        appearance: stationary ? 'statebeats/firefly' : 'statebeats/star',
        label: `${semantic} ${stationary ? 'firefly' : 'star'}`,
        ...(stationary
          ? { holdMs: 350, durationBeats: 1.5, leadMs: 2000 }
          : { emission: { source: 'sun', beat: beat - 6 } }),
        earlyMs: 180,
        lateMs: 250,
        shape: { kind: 'sphere', radius: stationary ? 0.2 : 0.16 },
      });
    }
  }
  for (const beat of [22, 46, 70, 94, 118]) {
    const azimuth = ((beat - 8) / 128) * 360;
    map.notes.push({
      id: `bird-${beat}`,
      beat,
      preset: 'hazard',
      anchor: 'player',
      appearance: 'statebeats/bird',
      label: 'Passing bird; duck to avoid',
      slots: [{ semantic: 'head' }],
      position: [0, 1.65, 0],
      shape: { kind: 'box', half: [0.5, 0.12, 0.22] },
      earlyMs: 0,
      lateMs: 0,
      durationBeats: 1,
      leadMs: 3000,
      motion: [
        { beat: beat - 6, position: { azimuth, elevation: 10, radius: 20, height: 1.65 } },
        { beat, position: [0, 1.65, 0] },
        {
          beat: beat + 1,
          position: cartesian({ azimuth: azimuth + 180, elevation: 0, radius: 2, height: 1.65 }),
        },
      ],
    });
  }
  return map;
}
