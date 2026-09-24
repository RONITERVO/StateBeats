import {
  compile,
  clone,
  SILENT_FEATURES,
  planTurns,
  createFacingSampler,
  facePoint,
} from '@statebeats/sdk';
import type { MapInput, NoteInput, MusicTimeline, TurnCueInput } from '@statebeats/sdk';
import type { Vec3 } from '@statebeats/core';
import { eventHorizonScore as score } from './event-horizon-score.js';

export const EVENT_HORIZON_ID = 'event-horizon-master';
export const eventHorizonSoundtrack = {
  name: 'Event Horizon',
  file: 'event-horizon.mp3',
  sha256: score.sha256,
  durationSeconds: score.durationSeconds,
  license: 'CC0-1.0',
  musicVolume: 0.85,
  cueVolume: 0.18,
} as const;
export const eventHorizonSections = score.sections;
const round = (v: number) => Math.round(v * 1e6) / 1e6;
const duckBars = new Set([30, 62, 78, 86]);
const leanBars = new Set([35, 67, 83]);
function turnCues(): TurnCueInput[] {
  return Array.from({ length: score.bars }, (_, bar): TurnCueInput[] => {
    const section = score.sections.find((s) => bar >= s.bar && bar < s.endBar)!;
    const local = bar - section.bar,
      motif = local % 8;
    const intense = section.kind === 'drop' || section.kind === 'finale';
    const obstacle = duckBars.has(bar) || leanBars.has(bar);
    if (bar > 56 && bar < 60) return [];
    if (bar === 56)
      return [
        {
          id: 'eh-turn-56',
          beat: score.leadBeats + 224,
          endBeat: score.leadBeats + 239.5,
          gesture: 'continue',
          direction: 'right',
          strength: 1,
          degrees: 240,
          reason: 'Binary stars: carry the four-bar driving lead through a sustained sweep',
        },
      ];
    // These directions belong to the original score's calls, answers and held phrases.
    // A repeated lead may carry on; the response and cadence do not inherit its drift.
    const calls = [1, 1, 1, -1, -1, -1, 1, 0];
    const responses = [-1, -1, 1, 1, 1, -1, -1, 0];
    const sustained = section.name === 'Binary stars' && local < 8;
    const sign = sustained ? 1 : (section.kind === 'finale' ? responses : calls)[motif];
    const settle =
      bar >= 94 || (section.kind === 'break' && local % 2 === 1) || (!intense && motif === 7);
    const degrees =
      section.kind === 'intro'
        ? 24
        : section.kind === 'outro'
          ? 20
          : section.kind === 'break'
            ? 32
            : section.kind === 'build'
              ? 32 + local * 4
              : section.kind === 'finale'
                ? 72
                : intense
                  ? 60
                  : 38;
    // Chords resolve on the backbeat; melody/ribbon phrases land on the last pickup.
    const duration = obstacle ? 1.5 : intense && bar % 4 === 0 ? 3 : 3.5;
    return [
      {
        id: `eh-turn-${bar}`,
        beat: score.leadBeats + bar * 4,
        endBeat: score.leadBeats + bar * 4 + duration,
        gesture: settle ? 'settle' : sustained && local > 0 ? 'continue' : 'sweep',
        ...(sign ? { direction: sign > 0 ? ('right' as const) : ('left' as const) } : {}),
        strength: 1,
        degrees,
        reason: `${section.name}, bar ${local + 1}: ${settle ? 'let the cadence settle' : obstacle ? 'arrive before the body accent' : sustained ? 'sustained driving phrase' : sign === 0 ? 'phrase turnaround' : intense && bar % 4 === 2 ? 'rail and counterpoint sweep' : intense && bar % 4 === 0 ? 'stereo chord accent' : 'melodic call and response'}`,
      },
    ];
  }).flat();
}
const turnPlan = planTurns(turnCues(), {
  bpm: score.bpm,
  seed: 20260924,
  degrees: 360,
  maxSpeed: 78,
  maxAcceleration: 220,
  maxDirectionalTravel: 540,
});
const facingAt = createFacingSampler(turnPlan.track);
export function eventHorizonTurnPlan() {
  return clone(turnPlan);
}
/** Local score beat; the saved track uses absolute map beats including the count-in. */
export function eventHorizonHeading(beat: number): number {
  return facingAt(beat + score.leadBeats);
}
function place(beat: number, x: number, y: number, z = -0.4): Vec3 {
  return facePoint([x, round(y), z], eventHorizonHeading(beat));
}

/** Original musical choreography. Playback is ordinary map geometry and pose commands. */
export function eventHorizonMaster() {
  const music: MusicTimeline = {
    version: 1,
    tickRate: 120,
    algorithm: 'statebeats/event-horizon-master-v1',
    source: {
      name: eventHorizonSoundtrack.file,
      sha256: score.sha256,
      durationSeconds: score.durationSeconds,
    },
    frames: score.frames.map(([tick, rms, bass, mid, air, transient]) => ({
      tick,
      features: {
        ...SILENT_FEATURES,
        rms,
        energy: rms,
        bass,
        subBass: bass * 0.7,
        lowMid: mid * 0.65,
        mid,
        presence: air * 0.7,
        air,
        flux: transient,
        transient,
        beat: tick < score.leadBeats * 48 ? 0 : Math.exp(-((tick - score.leadBeats * 48) % 48) / 9),
      },
    })),
  };
  const map: MapInput = {
    version: 1,
    id: EVENT_HORIZON_ID,
    title: 'Event Horizon — Master',
    seed: 20260924,
    description:
      'Original 150 BPM electronic soundtrack included. Expert musical turns: sweeping calls, counter-turn answers and cadences, with notes throughout. Wide linked chords, independent hand rails, stationary constellations, ducking and leaning. 2:40. Room scale 1.2 widens the authored layout.',
    durationBeats: score.durationBeats,
    tempo: [{ beat: 0, bpm: score.bpm }],
    tickRate: 120,
    playerProfile: { height: 1.65, roomScale: 1 },
    music,
    turns: clone(turnPlan.track),
    notes: [],
    groups: [],
    generation: {
      version: 1,
      algorithm: 'statebeats/event-horizon-authored-v2',
      settings: {
        playerHeight: 1.65,
        difficulty: 'master',
        bpm: score.bpm,
        score: score.sha256,
        turnPlanner: turnPlan.track.planner,
        turnSettings: { ...turnPlan.settings },
        composer: 'Original score-led choreography; see docs/EVENT_HORIZON.md',
      },
    },
    scene: {
      version: 1,
      theme: 'statebeats/event-horizon',
      label:
        'An orbital observatory around a moving singularity. Two sources cast cyan and coral streams; the spectrum, aurora and horizon respond to the bundled score.',
      objects: [-1, 1].map((side) => ({
        id: side < 0 ? 'core' : 'echo',
        appearance: 'statebeats/black-hole',
        label: side < 0 ? 'Leading singularity' : 'Companion star',
        position: place(0, side * 7, 7, -42),
        anchor: 'player',
        scale: side < 0 ? 1.7 : 0.9,
        color: side < 0 ? '#9c8aff' : '#ffad83',
        trailSeconds: 5,
        react: [
          { channel: 'bass', property: 'scale' as const, amount: 0.12 },
          { channel: 'energy', property: 'brightness' as const, amount: 1.8 },
        ],
        motion: Array.from({ length: score.durationBeats * 2 + 1 }, (_, i) => {
          const b = i / 2 - score.leadBeats + 6;
          return {
            beat: i / 2,
            position: place(
              b,
              side * (7 + 2 * Math.sin(b / 12)),
              7 + 3 * Math.sin(b / 24 + side),
              -42 - 7 * Math.sin(b / 32),
            ),
          };
        }),
      })),
    },
  };
  let serial = 0;
  const add = (beat: number, hand: -1 | 1, xyz: Vec3, options: Partial<NoteInput> = {}) => {
    const semantic = hand < 0 ? 'left' : 'right';
    const note: NoteInput = {
      id: `eh-${String(serial++).padStart(4, '0')}`,
      beat: score.leadBeats + beat,
      preset: semantic,
      slots: [{ semantic }],
      anchor: 'player',
      position: place(beat, ...xyz),
      appearance: 'statebeats/prism',
      shape: { kind: 'sphere', radius: 0.115 },
      earlyMs: 100,
      lateMs: 110,
      emission: { source: hand < 0 ? 'core' : 'echo', beat: score.leadBeats + beat - 6 },
      label: `${semantic} · ${options.label ?? 'melody'}`,
      ...options,
    };
    map.notes.push(note);
    return note;
  };
  const pair = (b: number, x: number, y: number, spread = 0.25, low = false) => {
    const members = [-1, 1].map((side) =>
      add(b, side as -1 | 1, [side * x, low ? y : y + side * spread, -0.4], {
        label: 'Linked stereo chord',
      }),
    );
    const id = `chord-${members[0].id}`;
    members.forEach((note) => (note.group = id));
    map.groups!.push({ id, members: members.map((n) => n.id), linkMs: 100, bonus: 150 });
  };
  const rail = (
    beat: number,
    hand: -1 | 1,
    length: number,
    path: (phase: number) => Vec3,
    stationary = false,
  ) => {
    const motion = Array.from({ length: 25 }, (_, i) => {
      const phase = i / 24,
        b = beat + length * phase;
      return { beat: round(score.leadBeats + b), position: place(b, ...path(phase)) };
    });
    add(beat, hand, path(0), {
      preset: 'hold',
      holdMs: (length * 60000) / score.bpm,
      breakMs: 100,
      durationBeats: length + 0.3,
      label: stationary ? 'Stationary constellation ribbon' : 'Follow the independent orbit',
      appearance: 'statebeats/prism',
      ...(stationary ? { emission: undefined, leadMs: 2400, motion } : { motion: motion.slice(1) }),
    });
  };
  for (let bar = 0; bar < score.bars; bar++) {
    const section = score.sections.find((s) => bar >= s.bar && bar < s.endBar)!;
    const b = bar * 4,
      duck = duckBars.has(bar),
      lean = leanBars.has(bar);
    const kind = section.kind,
      motif = bar % 4;
    if (kind === 'break') {
      for (const hand of [-1, 1] as const)
        rail(
          b,
          hand,
          2.5,
          (p) => [
            hand * (0.3 + 0.17 * Math.sin(p * Math.PI)),
            (bar % 2 ? 0.77 : 1.45) + hand * 0.27 * Math.sin(p * Math.PI * 2),
            -0.35,
          ],
          true,
        );
      pair(b + 3.5, 0.25, bar % 2 ? 0.55 : 1.55, 0.1, true);
    } else if (kind === 'drop' || kind === 'finale') {
      if (motif === 0) {
        for (let i = 0; i < 4; i++) {
          if (i === 2) pair(b + i, 0.28, 1.27, kind === 'finale' ? -0.78 : -0.68);
          else
            pair(
              b + i,
              0.66 + 0.07 * Math.sin((i * Math.PI) / 3),
              1.27,
              Math.cos((i * Math.PI) / 3) * (kind === 'finale' ? 0.5 : 0.38),
            );
        }
      } else if (motif === 1) {
        // Interlock a recurring melody and the backbeat; neither hand is just a mirror.
        const melody = score.melody.filter(([beat]) => beat >= b && beat < b + 4);
        melody.forEach(([at, pitch], i) => {
          const hand = (i % 2 ? 1 : -1) as -1 | 1;
          add(
            at,
            hand,
            [hand * (0.38 + 0.17 * Math.sin(i)), 1.15 + Math.min(0.7, (pitch - 74) * 0.045), -0.5],
            { label: 'Syncopated lead' },
          );
        });
      } else if (motif === 2) {
        rail(b, -1, 3, (p) => [
          -0.45 + 0.2 * Math.sin(p * Math.PI * 2),
          (duck ? 0.82 : 1.35) + 0.25 * Math.cos(p * Math.PI * 2),
          -0.42,
        ]);
        for (let i = 0; i < 7; i++)
          add(
            b + i * 0.5,
            1,
            [
              0.45 + 0.17 * Math.sin(i * 0.8),
              (duck ? 0.85 : 1.28) + 0.25 * Math.cos(i * 0.8),
              -0.42,
            ],
            { label: 'Right-hand counterpoint' },
          );
        pair(b + 3.5, 0.4, duck ? 0.9 : 1.35, 0.15);
      } else {
        for (const hand of [-1, 1] as const)
          rail(b, hand, 2.5, (p) => [
            (lean ? 0.28 : 0) + hand * (0.27 + 0.13 * Math.cos(p * Math.PI * 2)),
            1.28 + hand * 0.44 * Math.sin(p * Math.PI * 2),
            -0.46,
          ]);
        pair(b + 3, 0.4, 1.28, 0.1);
        if (kind === 'finale') pair(b + 3.5, 0.66, 1.27, 0.5);
      }
    } else if (kind === 'build') {
      const count = bar >= 54 ? 16 : 8;
      for (let i = 0; i < count; i++) {
        const hand = (i % 2 ? 1 : -1) as -1 | 1,
          p = i / count;
        add(
          b + p * 4,
          hand,
          [hand * (0.25 + 0.12 * Math.sin(p * Math.PI)), 0.95 + p * 0.65, -0.45],
          { label: 'Snare roll staircase' },
        );
      }
    } else {
      const melody = score.melody.filter(([beat]) => beat >= b && beat < b + 4);
      melody.forEach(([at, pitch], i) => {
        const hand = ((bar + i) % 2 ? 1 : -1) as -1 | 1;
        const crossed = kind === 'verse' && bar % 4 === 3;
        add(
          at,
          hand,
          [
            hand * (crossed ? -0.12 : 0.38 + 0.16 * Math.sin(i)),
            1.23 + Math.max(-0.36, Math.min(0.58, (pitch - 74) * 0.05)),
            -0.48,
          ],
          bar === 95
            ? {
                label: 'Final unison; bring both hands together',
                preset: 'combined',
                slots: [{ semantic: 'left' }, { semantic: 'right' }],
              }
            : { label: crossed ? 'Melodic crossover' : 'Opening melody' },
        );
      });
    }
    if (duck || lean) {
      const at = b + 1.5,
        angle = (-eventHorizonHeading(at) * Math.PI) / 180;
      const x = lean ? -0.22 : 0;
      map.notes.push({
        id: `eh-${duck ? 'duck' : 'lean'}-${bar}`,
        preset: 'hazard',
        beat: score.leadBeats + at,
        slots: [{ semantic: 'head' }],
        anchor: 'player',
        position: place(at, x, 1.58, 0),
        shape: {
          kind: 'box',
          half: duck ? [0.95, 0.12, 0.22] : [0.25, 0.72, 0.2],
          rotation: [0, Math.sin(angle / 2), 0, Math.cos(angle / 2)],
        },
        label: duck
          ? 'Duck under the solar ribbon; keep both hands playing'
          : 'Lean toward the right-hand stream',
        durationBeats: 1,
        leadMs: 2500,
        earlyMs: 0,
        lateMs: 0,
        motion: [
          { beat: score.leadBeats + at - 6, position: place(at, x, 1.58, -14) },
          { beat: score.leadBeats + at, position: place(at, x, 1.58, 0) },
          { beat: score.leadBeats + at + 1, position: place(at, x, 1.58, 2.5) },
        ],
      });
    }
  }
  return compile(map).map;
}
