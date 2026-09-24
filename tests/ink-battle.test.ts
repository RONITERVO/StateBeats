import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  inkBattleMap,
  inkEncounters,
  inkSoundtrack,
  inkChapters,
  sampleInkBattle,
  battleSource,
} from '@statebeats/ink-battle';
import {
  compile,
  Session,
  standardActor,
  scriptedCommands,
  fitMapToPlayer,
  inspectChoreography,
} from '@statebeats/sdk';
import type { Command } from '@statebeats/core';

describe('Ink-Battle collaboration', () => {
  it('retains exact pinned upstream files and reproduces every frame and verified replay using legal commands', async () => {
    const source = JSON.parse(await readFile('packages/ink-battle/PROVENANCE.json', 'utf8'));
    expect(source.commit).toBe(battleSource.commit);
    for (const [path, hash] of Object.entries(source.files)) {
      const bytes = await readFile(`packages/ink-battle/upstream/${path}`);
      expect(createHash('sha256').update(bytes).digest('hex'), path).toBe(hash);
    }
    expect(() =>
      execFileSync(process.execPath, ['scripts/record-ink-battle.mjs', '--check'], {
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
  it('ships its identified original soundtrack, source evidence and exact exported chart', async () => {
    const map = inkBattleMap(),
      notes = inkEncounters();
    expect(
      JSON.parse(await readFile('packages/content/maps/ink-battle-between-the-lines.json', 'utf8')),
    ).toEqual(map);
    const audio = await readFile('packages/ink-battle/audio/between-the-lines.mp3');
    expect(createHash('sha256').update(audio).digest('hex')).toBe(inkSoundtrack.sha256);
    expect(map.music!.source!.sha256).toBe(inkSoundtrack.sha256);
    expect(compile(map).program.durationTicks).toBe(24000);
    expect(new Set(notes.map((e) => e.age)).size).toBe(6);
    for (const kind of ['melee', 'shot', 'heavy', 'rain'])
      expect(notes.filter((e) => e.kind === kind).length).toBeGreaterThan(12);
    expect(notes.filter((e) => e.kind === 'shot' && e.sourceShot !== null).length).toBeGreaterThan(
      240,
    );
    expect(map.notes.some((n) => n.preset === 'hazard')).toBe(false);
    expect(
      inspectChoreography(map, { playerHeight: 1.65, reach: 1, maxHandSpeed: 6 }).issues,
    ).toEqual([]);
    for (const e of notes) {
      expect(e.spawnBeat).toBeLessThan(e.beat);
      expect(e.motion.at(-1)!.position).toEqual(e.target);
      // The first quarter of the approach must not cross the player's body/reach,
      // including the chords of a redirected shot from the far side of the book.
      if (e.kind !== 'rain')
        for (let i = 0; i < 2; i++) {
          const a = e.motion[i].position,
            b = e.motion[i + 1].position;
          const dx = b[0] - a[0],
            dz = b[2] - a[2];
          const t = Math.max(0, Math.min(1, -(a[0] * dx + a[2] * dz) / (dx * dx + dz * dz || 1)));
          expect(Math.hypot(a[0] + t * dx, a[2] + t * dz), e.id).toBeGreaterThan(1.5);
        }
      const mirrored = map.notes.find((n) => n.id === e.id)!;
      expect(mirrored.motion).toEqual(e.motion);
    }
  });
  it('samples each age independently of render history and does not leak mutable trace references', () => {
    const at = sampleInkBattle(85.15);
    sampleInkBattle(390);
    sampleInkBattle(2);
    expect(sampleInkBattle(85.15)).toEqual(at);
    const before = structuredClone(at);
    at.units[0][3] = 999;
    at.sides[0].hp = 0;
    at.shots.splice(0);
    expect(sampleInkBattle(85.15)).toEqual(before);
    expect(inkChapters.map((c) => c.age)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(() => sampleInkBattle(NaN)).toThrow();
    expect(sampleInkBattle(400).age).toBe(5);
  });
  it('finishes with ordinary hand poses at personal scale, restores midway and verifies a portable replay', async () => {
    const session = await Session.create(
      fitMapToPlayer(inkBattleMap(), { height: 1.65, roomScale: 1.2 }),
      [standardActor()],
    );
    const commands = scriptedCommands(session.program),
      admin = session.client({ role: 'admin' });
    for (let i = 0; i < commands.length; i += 1024)
      admin.submit(`ink-${i}`, commands.slice(i, i + 1024));
    session.advance(11777);
    const restored = await Session.restore(admin.checkpoint());
    session.advance(24000);
    restored.advance(24000);
    expect(restored.snapshot()).toEqual(session.snapshot());
    expect(session.snapshot().scores[0]).toMatchObject({ hits: 358, misses: 0, hazards: 0 });
    expect((await Session.verifyReplay(await admin.replay())).verified).toBe(true);
    session.close();
    restored.close();
  });
  it('does not let a tracked head substitute for a blocking hand', async () => {
    const map = inkBattleMap(),
      note = map.notes.find((n) => n.preset === 'any')!;
    const session = await Session.create({ ...map, notes: [note] }, [standardActor()]);
    const commands = scriptedCommands(session.program).map((c) =>
      c.type === 'pose' ? { ...c, effectorId: 'head' } : c,
    ) as Command[];
    session.submit({ role: 'admin' }, 'head-only', commands);
    session.advance(24000);
    expect(session.snapshot().scores[0]).toMatchObject({ hits: 0, misses: 1 });
    session.close();
  });
});
