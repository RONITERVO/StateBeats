// SPDX-License-Identifier: Apache-2.0
import {
  compile,
  clone,
  facePoint,
  planTurns,
  createFacingSampler,
  SILENT_FEATURES,
} from '@statebeats/sdk';
import type { MapInput, NoteInput, TurnCueInput } from '@statebeats/sdk';
import type { Vec3 } from '@statebeats/core';
import { score } from './score.js';
import { battleSource, inkChapters, inkLaunches, sampleInkBattle } from './battle.js';

export const INK_BATTLE_ID = 'ink-battle-between-the-lines';
export const INK_THEME_ID = 'ink-battle/sketchbook-v1';
export const inkSoundtrack = {
  name: 'Between the Lines',
  file: 'between-the-lines.mp3',
  sha256: score.sha256,
  durationSeconds: score.durationSeconds,
  license: 'Apache-2.0',
  musicVolume: 0.9,
  cueVolume: 0.12,
} as const;
const cues: TurnCueInput[] = Array.from({ length: 96 }, (_, bar) => {
  const local = bar % 16,
    age = Math.floor(bar / 16);
  const sign = [1, 1, -1, -1, 1, 1, 1, -1][Math.floor(local / 2) % 8];
  return {
    id: `ink-turn-${bar}`,
    beat: 8 + bar * 4,
    endBeat: 11.5 + bar * 4,
    gesture: local % 8 === 7 ? 'settle' : 'sweep',
    direction: sign > 0 ? 'right' : 'left',
    strength: 1,
    degrees: age < 2 ? 20 : 30,
    reason: `${inkChapters[age].name}: ${local % 8 === 7 ? 'cadence; take in the battlefield' : 'follow the answering melody through the crossfire'}`,
  };
});
const turns = planTurns(cues, {
  bpm: 120,
  seed: 73190,
  degrees: 360,
  maxSpeed: 55,
  maxAcceleration: 130,
  maxDirectionalTravel: 270,
});
const heading = createFacingSampler(turns.track);
export const inkHeading = (beat: number) => heading(beat);
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const pos = (point: Vec3, beat: number): Vec3 => facePoint(point, heading(beat)).map(round) as Vec3;

export interface InkEncounter {
  id: string;
  age: number;
  team: number;
  kind: 'melee' | 'shot' | 'rain' | 'heavy';
  beat: number;
  spawnBeat: number;
  origin: Vec3;
  target: Vec3;
  sourceUnit: number | null;
  sourceShot: number | null;
  sourceTick: number | null;
  /** Original recorded origin, before the rhythm director moves it into the readable approach space. */
  sourceOrigin: Vec3 | null;
  projectile: string;
  motion: { beat: number; position: Vec3 }[];
}

function encounters(): InkEncounter[] {
  const launches = inkChapters.map((chapter) => inkLaunches(chapter.age));
  const used = new Set<string>();
  return score.events.map(([beat, age, bar, index], serial) => {
    const local = bar % 16,
      rain = local === 12 || local === 13;
    const melee = !rain && index === 0 && local % 2 === 0;
    const heavy = !rain && !melee && age >= 2 && local % 4 === 3 && index === 1;
    const kind: InkEncounter['kind'] = rain ? 'rain' : melee ? 'melee' : heavy ? 'heavy' : 'shot';
    const lead = melee ? 4 : rain ? 2.75 : 2.5;
    const spawnBeat = Math.max(8 + age * 64, beat - lead);
    // New chapters get their first anticipation during the final rest of the old page.
    const spawn = beat === 8 + age * 64 ? beat - lead : spawnBeat;
    const sourceFrame = sampleInkBattle(Math.max(8 + age * 64, spawn));
    let team = (serial + age) % 2 ? -1 : 1;
    const front = pos([0, 0, -1], beat);
    const candidates = sourceFrame.units.filter(
      (unit) =>
        unit[2] === 0 &&
        unit[8] > 0.8 &&
        Math.hypot(unit[3], unit[5]) >= 2.6 &&
        unit[3] * front[0] + unit[5] * front[2] > Math.hypot(unit[3], unit[5]) * 0.5 &&
        !used.has(`${age}/${unit[0]}/${Math.floor(beat / 8)}`),
    );
    const unit = candidates.sort(
      (a, b) =>
        Math.hypot(a[3], a[5]) +
          (a[1] === team ? 0 : 2) -
          (Math.hypot(b[3], b[5]) + (b[1] === team ? 0 : 2)) || a[0] - b[0],
    )[0];
    if (unit && melee) {
      team = unit[1];
      used.add(`${age}/${unit[0]}/${Math.floor(beat / 8)}`);
    }
    const sourceTick = (Math.max(8 + age * 64, spawn) - 8 - age * 64) * 30;
    const shot = launches[age]
      .filter(
        (p) => p.team === team && (heavy ? p.sourceRole === 2 || p.sourceRole === null : true),
      )
      .sort(
        (a, b) => Math.abs(a.tick - sourceTick) - Math.abs(b.tick - sourceTick) || a.id - b.id,
      )[0];
    const side = serial % 2 ? 0.54 : -0.54;
    const height = melee
      ? age === 5
        ? 1.08
        : 1.264
      : rain
        ? 1.82 + (index % 2) * 0.1
        : heavy
          ? 1.25
          : [0.85, 1.48, 1.15, 1.72][(index + local) % 4];
    const target = pos(
      [
        heavy ? 0 : rain ? side * 0.7 : side,
        height,
        rain ? -0.44 : heavy ? -0.62 : -0.52 - (local % 3) * 0.07,
      ],
      beat,
    );
    const origin: Vec3 = melee
      ? unit
        ? [unit[3], height, unit[5]]
        : pos([side * 2, height, -3.2], beat)
      : rain
        ? pos([side * 4, 7 + (age % 3), -3.2], beat)
        : shot
          ? [...shot.origin]
          : [-team * 9.5, 1.7, -1.5];
    const sourceOrigin: Vec3 | null = melee
      ? unit
        ? [unit[3], height, unit[5]]
        : null
      : rain
        ? null
        : shot
          ? [...shot.origin]
          : null;
    // Recorded fighting may happen inside a human's reach. Retiming that shot must
    // not leave a bright future target beside their hands before its approach.
    const radius = Math.hypot(origin[0], origin[2]);
    if (!rain && radius < 2.6) {
      origin[0] = radius > 1e-6 ? (origin[0] * 2.6) / radius : front[0] * 2.6;
      origin[2] = radius > 1e-6 ? (origin[2] * 2.6) / radius : front[2] * 2.6;
    }
    const motion: InkEncounter['motion'] = [];
    // A rhythm adaptation must announce a redirect before contact. A source behind the
    // upcoming facing enters its readable approach corridor early, never at the last instant.
    const distance = Math.hypot(origin[0], origin[2]);
    const redirected = !rain && origin[0] * front[0] + origin[2] * front[2] < distance * 0.5;
    const ingress = pos([side * 2, height + (melee ? 0 : 0.3), -2.6], beat);
    for (let i = 0; i <= 8; i++) {
      const t = i / 8,
        curve = melee ? 0 : rain ? 0.25 : shot?.type === 'arc' ? 0.8 : 0.25;
      const a = redirected && t >= 0.25 ? ingress : origin;
      const b = redirected && t < 0.25 ? ingress : target;
      const progress = redirected ? (t < 0.25 ? t / 0.25 : (t - 0.25) / 0.75) : t;
      const point = a.map((n, axis) =>
        round(
          n + (b[axis] - n) * progress + (axis === 1 ? Math.sin(Math.PI * progress) * curve : 0),
        ),
      ) as Vec3;
      if (redirected && t < 0.25) {
        // Travel around the clearance circle, never through the player's body on
        // the way to a future contact. The two sampled chords stay outside reach.
        const start = Math.atan2(origin[0], -origin[2]),
          end = Math.atan2(ingress[0], -ingress[2]);
        const angle = start + Math.atan2(Math.sin(end - start), Math.cos(end - start)) * progress;
        const r = distance + (Math.hypot(ingress[0], ingress[2]) - distance) * progress;
        point[0] = round(Math.sin(angle) * r);
        point[2] = round(-Math.cos(angle) * r);
      }
      motion.push({ beat: round(spawn + (beat - spawn) * t), position: point });
    }
    // Contact remains at the marked position throughout its late window.
    motion.push({ beat: beat + 0.4, position: target });
    return {
      id: `ink-${age}-${serial}`,
      age,
      team,
      kind,
      beat,
      spawnBeat: spawn,
      origin,
      target,
      sourceUnit: melee ? (unit?.[0] ?? null) : null,
      sourceShot: melee || rain ? null : (shot?.id ?? null),
      sourceTick: melee ? (unit ? sourceTick : null) : rain ? null : (shot?.tick ?? null),
      sourceOrigin,
      projectile: rain
        ? age === 1
          ? 'arrow'
          : age === 4
            ? 'laser'
            : age === 5
              ? 'orb'
              : 'meteor'
        : (shot?.type ?? 'arc'),
      motion,
    };
  });
}
const authoredEncounters = encounters();
/** Copies protect the bundled director from caller mutation. IDs bind art to ordinary scored notes. */
export function inkEncounters() {
  return clone(authoredEncounters);
}

export function inkBattleMap() {
  const notes: NoteInput[] = authoredEncounters.map((e) => ({
    id: e.id,
    beat: e.beat,
    preset: e.kind === 'heavy' ? 'combined' : 'any',
    position: e.target,
    motion: e.motion,
    anchor: 'player',
    appearance: `ink-battle/${e.kind}/${e.age}/${e.team === 1 ? 'teal' : 'red'}/${e.projectile}`,
    sound: {
      effect:
        e.kind === 'melee'
          ? 'ink-battle/steps'
          : e.kind === 'heavy'
            ? 'ink-battle/heavy'
            : ['laser', 'orb'].includes(e.projectile)
              ? 'ink-battle/energy'
              : e.projectile === 'meteor'
                ? 'ink-battle/meteor'
                : 'ink-battle/whistle',
    },
    label:
      e.kind === 'melee'
        ? `${inkChapters[e.age].unitNames[0]} — touch the marked head with either hand`
        : e.kind === 'rain'
          ? `${inkChapters[e.age].special} — block the falling shot`
          : e.kind === 'heavy'
            ? 'Heavy fire — block with both hands'
            : 'Crossfire — block with either hand',
    shape: { kind: 'sphere', radius: e.kind === 'heavy' ? 0.2 : e.kind === 'melee' ? 0.15 : 0.13 },
    earlyMs: 110,
    lateMs: 150,
    leadMs: (e.beat - e.spawnBeat) * 500 - 110,
    minSpeed: 0,
    presentation: { presence: 'fade', appearMs: 100, releaseMs: 300, guide: 'none' },
  }));
  const map: MapInput = {
    version: 1,
    id: INK_BATTLE_ID,
    title: 'Ink-Battle — Between the Lines',
    seed: 73190,
    description:
      'Stand between two armies inside Ink-Battle’s painted sketchbook. Six ages, real recorded battles and an original 3:20 score. Touch marked troop heads; parry marked shots with either hand; heavy fire takes both. Unmarked armies are scenery. Sweeping 360° phrases, no dodge walls. Advanced. The neutral-player encounters adapt the battle; your parries do not change its outcome.',
    durationBeats: 400,
    tempo: [{ beat: 0, bpm: 120 }],
    tickRate: 120,
    playerProfile: { height: 1.65, roomScale: 1 },
    audio: { version: 1, theme: 'ink-battle/battlefield-v1' },
    notes,
    turns: clone(turns.track),
    music: {
      version: 1,
      tickRate: 120,
      algorithm: 'ink-battle/original-score-v1',
      source: {
        name: inkSoundtrack.file,
        sha256: score.sha256,
        durationSeconds: score.durationSeconds,
      },
      frames: score.frames.map(([tick, rms, bass, mid, air]) => ({
        tick,
        features: {
          ...SILENT_FEATURES,
          rms,
          energy: rms,
          bass,
          mid,
          air,
          subBass: bass * 0.7,
          lowMid: mid * 0.7,
          presence: air * 0.65,
          beat: Math.exp(-(tick % 60) / 12),
        },
      })),
    },
    generation: {
      version: 1,
      algorithm: 'ink-battle/neutral-director-v1',
      settings: {
        source: { ...battleSource },
        chapters: inkChapters.map((c) => ({
          age: c.age,
          seed: c.seed,
          replayDigest: c.replayDigest,
        })),
        score: score.sha256,
        battleMode:
          'six recorded tabletop excerpts; neutral encounters are authored rhythm adaptation',
        license: 'Apache-2.0',
      },
    },
    scene: {
      version: 1,
      theme: INK_THEME_ID,
      label:
        'Ink-Battle: an enlarged watercolor sketchbook, two armies and six ages. Only marked targets interact with you.',
      // Explicit scene basis keeps artwork in the same personal scale and recentered stage as scoring.
      objects: (
        [
          [0, 0, 0],
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ] as Vec3[]
      ).map((position, i) => ({
        id: `ink-basis-${i}`,
        appearance: 'ink-battle/basis',
        label: ['Book origin', 'Book right', 'Book up', 'Book forward'][i],
        position,
        anchor: 'player',
        scale: 0.001,
      })),
    },
  };
  return compile(map).map;
}
