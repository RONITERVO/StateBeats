import type { MapInput, NoteInput } from '@statebeats/sdk';
export const AUDIO_TUTORIAL_ID = 'finding-the-pulse';
/** One ordinary map for visual, audio, text and tool-driven play. No auto-hit path. */
export function audioTutorial(): MapInput {
  const notes: NoteInput[] = [];
  for (const [i, beat] of [16, 24, 32, 40, 48, 56, 64].entries()) {
    const hand = i < 2 ? 'left' : i < 4 ? 'right' : i < 6 ? 'any' : 'combined';
    notes.push({
      id: `listen-${i}`,
      beat,
      preset: hand,
      label:
        hand === 'combined'
          ? 'Bring both hands together in front'
          : `${hand === 'any' ? 'Either hand' : `${hand} hand`} — reach the steady sound`,
      position: [
        hand === 'left' ? -0.28 : hand === 'right' ? 0.28 : 0,
        1.25 + (i % 2) * 0.12,
        -0.4,
      ],
      anchor: 'player',
      shape: { kind: 'sphere', radius: 0.22 },
      leadMs: 3000,
      earlyMs: 250,
      lateMs: 350,
      linkMs: 250,
      presentation: { guide: 'none', readiness: { preview: { beats: 5 }, prepare: { beats: 5 } } },
    });
  }
  for (const [hand, beat, x] of [
    ['left', 76, -0.28],
    ['right', 88, 0.28],
  ] as const) {
    notes.push({
      id: `listen-hold-${hand}`,
      beat,
      preset: 'hold',
      slots: [{ semantic: hand }],
      label: `${hand} hand — follow the sound slowly, keeping the smooth alignment tone`,
      position: [x, 1.25, -0.4],
      anchor: 'player',
      shape: { kind: 'sphere', radius: 0.22 },
      leadMs: 3000,
      earlyMs: 0,
      lateMs: 350,
      holdMs: 2500,
      breakMs: 180,
      durationBeats: 5,
      motion: [
        { beat, position: [x, 1.25, -0.4] },
        { beat: beat + 4, position: [x * 1.8, 1.55, -0.4] },
      ],
      presentation: {
        guide: 'window',
        readiness: { preview: { beats: 5 }, prepare: { beats: 5 } },
      },
    });
  }
  return {
    version: 1,
    id: AUDIO_TUTORIAL_ID,
    title: 'Finding the pulse — Audio-led tutorial',
    description:
      'A one-minute introduction to audible hands and alignment with a gentle procedural musical pulse. Sparse left, right, either-hand, two-hand and slow hold targets. Face forward; no turns or obstacles. Use Audio-led setup to learn the sounds. Blind-player and Quest listening validation remain pending.',
    durationBeats: 96,
    tempo: [{ beat: 0, bpm: 96 }],
    tickRate: 120,
    playerProfile: { height: 1.65, roomScale: 1 },
    notes,
  };
}
