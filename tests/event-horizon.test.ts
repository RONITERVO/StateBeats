import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  eventHorizonMaster,
  eventHorizonHeading,
  eventHorizonSoundtrack,
} from '@statebeats/content';
import {
  compile,
  fitMapToPlayer,
  inspectChoreography,
  Session,
  standardActor,
  scriptedCommands,
  cartesian,
} from '@statebeats/sdk';
import type { Command, Vec3 } from '@statebeats/core';

describe('Event Horizon original bundled showcase', () => {
  it('ships the audio identified by the saved map, with analysed features and complete timing', async () => {
    const map = eventHorizonMaster();
    const audio = await readFile('packages/content/audio/event-horizon.mp3');
    expect(createHash('sha256').update(audio).digest('hex')).toBe(map.music!.source!.sha256);
    expect(map.music!.source!.sha256).toBe(eventHorizonSoundtrack.sha256);
    expect(audio.length).toBeLessThan(5_000_000);
    expect(eventHorizonSoundtrack.durationSeconds).toBe(160);
    expect(map.music!.frames[0].tick).toBe(0);
    expect(map.music!.frames.at(-1)!.tick).toBeLessThanOrEqual(19200);
    expect(map.music!.frames.some((frame) => frame.features.air > 0.8)).toBe(true);
    expect(map.music!.frames.some((frame) => frame.features.bass > 0.8)).toBe(true);
    expect(compile(map).program.durationTicks).toBe(19200);
  });
  it('authors wide musical combinations without impossible hand reservations or excessive authored transitions', () => {
    const map = eventHorizonMaster();
    const report = inspectChoreography(map, { playerHeight: 1.65, reach: 1, maxHandSpeed: 6 });
    expect(report.issues).toEqual([]);
    expect(map.groups.length).toBe(84);
    expect(map.notes.filter((n) => n.preset === 'hold')).toHaveLength(52);
    expect(map.notes.filter((n) => n.preset === 'hazard')).toHaveLength(7);
    const y = map.notes.filter((n) => n.preset !== 'hazard').map((n) => cartesian(n.position)[1]);
    expect(Math.min(...y)).toBeLessThan(0.51);
    expect(Math.max(...y)).toBeGreaterThan(2);
    expect(map.notes.some((n) => n.preset === 'combined')).toBe(true);
    expect(eventHorizonHeading(280)).toBeGreaterThan(eventHorizonHeading(240));
    expect(eventHorizonHeading(340)).toBeLessThan(eventHorizonHeading(300));
    // There are scoring events inside every full bar of the fast-turn sections.
    for (let bar = 56; bar < 88; bar++)
      expect(
        map.notes.some(
          (n) => typeof n.beat === 'number' && n.beat >= 8 + bar * 4 && n.beat < 12 + bar * 4,
        ),
      ).toBe(true);
  });
  it('completes at room scale 1.2 with tracked head avoidance, ordinary hand poses and a portable checkpoint/replay', async () => {
    const map = fitMapToPlayer(eventHorizonMaster(), { height: 1.65, roomScale: 1.2 });
    const session = await Session.create(map, [standardActor()]);
    const admin = session.client({ role: 'admin' });
    const commands = scriptedCommands(session.program);
    const hazards = session.program.entities.filter((e) => e.kind === 'hazard');
    for (let tick = 1; tick < session.program.durationTicks; tick += 6) {
      let position: Vec3 = [0, 1.65, 0];
      for (const hazard of hazards) {
        const distance = Math.abs(tick - hazard.hitTick);
        const strength = Math.max(0, Math.min(1, (120 - distance) / 60));
        if (!strength) continue;
        if (hazard.id.includes('duck')) position = [0, 1.65 - 0.5 * strength, 0];
        else {
          const angle = (eventHorizonHeading(hazard.hitTick / 48 - 8) * Math.PI) / 180;
          position = [0.6 * Math.cos(angle) * strength, 1.65, 0.6 * Math.sin(angle) * strength];
        }
      }
      commands.push({
        id: `head-${tick}`,
        tick,
        type: 'pose',
        actorId: 'player',
        effectorId: 'head',
        position,
        tracked: true,
        active: true,
      } as Command);
    }
    for (let i = 0; i < commands.length; i += 1024)
      admin.submit(`showcase-${i}`, commands.slice(i, i + 1024));
    session.advance(9500);
    const restored = await Session.restore(admin.checkpoint());
    session.advance(session.program.durationTicks);
    restored.advance(restored.program.durationTicks);
    expect(restored.snapshot()).toEqual(session.snapshot());
    expect(session.snapshot().scores[0]).toMatchObject({ hits: 620, misses: 0, hazards: 0 });
    expect((await Session.verifyReplay(await admin.replay())).verified).toBe(true);
    session.close();
    restored.close();
  }, 60000);
  it('penalizes a tracked standing head in the actual avoidance volumes', async () => {
    const map = eventHorizonMaster();
    map.notes = map.notes.filter((n) => n.preset === 'hazard');
    map.groups = [];
    const session = await Session.create(map, [standardActor()]);
    session.client({ role: 'admin' }).submit('stand', [
      {
        id: 'stand',
        tick: 1,
        type: 'pose',
        actorId: 'player',
        effectorId: 'head',
        position: [0, 1.65, 0],
        tracked: true,
        active: true,
      },
    ]);
    session.advance(session.program.durationTicks);
    expect(session.snapshot().scores[0].hazards).toBeGreaterThanOrEqual(7);
    session.close();
  });
});
