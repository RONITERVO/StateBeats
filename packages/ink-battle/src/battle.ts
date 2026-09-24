// SPDX-License-Identifier: Apache-2.0
import { battleChapters, battleSource } from './battle-data.js';
import type { BattleFrame, BattleUnit } from './types.js';
export { battleSource };
export const inkChapters = Object.freeze(
  battleChapters.map(({ age, name, special, unitNames, seed, replayDigest }) =>
    Object.freeze({
      age,
      name,
      special,
      unitNames: Object.freeze([...unitNames]),
      seed,
      replayDigest,
    }),
  ),
);
export const INK_LEAD_BEATS = 8;
export const INK_CHAPTER_BEATS = 64;

/** All time is supplied by the host. Sampling backward is identical to a fresh sample. */
export function inkChapterAt(beat: number) {
  if (!Number.isFinite(beat)) throw new Error('Battle beat must be finite');
  const age = Math.max(0, Math.min(5, Math.floor((beat - INK_LEAD_BEATS) / INK_CHAPTER_BEATS)));
  const seconds = Math.max(0, Math.min(32, (beat - INK_LEAD_BEATS - age * INK_CHAPTER_BEATS) / 2));
  return { age, seconds, chapter: inkChapters[age] };
}

/** Background presentation, not another scoring engine. IDs never interpolate across births/deaths. */
export function sampleInkBattle(beat: number): BattleFrame & { age: number; seconds: number } {
  const { age, seconds } = inkChapterAt(beat),
    tick = seconds * 60;
  const frames = battleChapters[age].frames;
  const index = Math.min(frames.length - 1, Math.floor(tick / battleSource.sampleTicks));
  const a = frames[index],
    b = frames[Math.min(index + 1, frames.length - 1)];
  const t = b.tick === a.tick ? 0 : (tick - a.tick) / (b.tick - a.tick);
  const next = new Map(b.units.map((unit) => [unit[0], unit]));
  const units = a.units.map((unit): BattleUnit => {
    const result: BattleUnit = [...unit],
      target = next.get(unit[0]);
    if (!target) return result;
    for (const k of [3, 4, 5, 8] as const) result[k] += (target[k] - result[k]) * t;
    const angle = Math.atan2(Math.sin(target[6] - unit[6]), Math.cos(target[6] - unit[6]));
    result[6] += angle * t;
    // A cooldown reset is a new shot, not a ramp through its preparation pose.
    if (target[9] <= unit[9]) result[9] += (target[9] - unit[9]) * t;
    return result;
  });
  const nextShots = new Map(b.shots.map((shot) => [shot[0], shot]));
  return {
    age,
    seconds,
    tick,
    units,
    shots: a.shots.map((shot) => {
      const result: typeof shot = [...shot],
        target = nextShots.get(shot[0]);
      if (target) for (const k of [3, 4, 5] as const) result[k] += (target[k] - result[k]) * t;
      return result;
    }),
    sides: a.sides.map((side) => ({
      hp: side.hp,
      turrets: side.turrets.map((turret) => turret && [...turret]),
    })),
    specials: a.specials.map((special) => [...special]),
  };
}

/** Read-only source evidence used by the rhythm director, in the chapter's native 60 Hz clock. */
export function inkLaunches(age: number) {
  return (
    battleChapters[age]?.launches.map((launch) => ({
      ...launch,
      origin: [...launch.origin] as typeof launch.origin,
    })) ?? []
  );
}
