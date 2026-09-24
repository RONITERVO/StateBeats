import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { positionAt } from '@statebeats/core';
import {
  compile,
  generateChoreography,
  dancePhrases,
  scenePositionAt,
  SILENT_FEATURES,
  Session,
  standardActor,
  fitMapToPlayer,
  cartesian,
  beatValue,
  EngineService,
  scriptedCommands,
} from '@statebeats/sdk';
import type { MusicTimeline, MapInput, Observation } from '@statebeats/sdk';
import { assistedTargetPoint } from '../packages/player/src/desktop-input.js';

const music = (seconds = 50): MusicTimeline => ({
  version: 1,
  tickRate: 120,
  algorithm: 'test/constant',
  frames: Array.from({ length: seconds + 1 }, (_, i) => ({
    tick: (i + 4) * 120,
    features: { ...SILENT_FEATURES, rms: 0.2, energy: 0.6, beat: 0.8 },
  })),
});
const holdMap = (): MapInput => ({
  version: 1,
  id: 'late-rail',
  title: 'Late rail',
  tempo: [{ beat: 0, bpm: 120 }],
  durationBeats: 12,
  scene: {
    version: 1,
    theme: 'statebeats/landscape',
    label: 'Test',
    objects: [
      { id: 'source', appearance: 'statebeats/sun', label: 'Source', position: [0, 2, -10] },
    ],
  },
  notes: [
    {
      id: 'rail',
      preset: 'hold',
      slots: [{ semantic: 'left' }],
      beat: 4,
      holdMs: 500,
      lateMs: 500,
      durationBeats: 3,
      position: [-0.2, 1.3, -0.4],
      emission: { source: 'source', beat: 1 },
      motion: [
        { beat: 6, position: [-0.3, 1.4, -0.4] },
        { beat: 7, position: [-0.4, 1.3, -0.4] },
      ],
    },
  ],
});

describe('review regressions and expert settings', () => {
  it('preserves phrase emitter holds for a six-minute high-tempo song without decimation', () => {
    const { map, report } = generateChoreography(music(360), {
      bpm: 180,
      turnMode: 'full',
      rails: false,
    });
    const { program, scene } = compile(map);
    expect(report.phrases.length).toBeGreaterThan(125);
    expect(scene!.objects[0].motion.length).toBeGreaterThan(256);
    for (const entity of program.entities) {
      const note = map.notes.find((n) => n.id === entity.id)!;
      const phrase = report.phrases.find(
        (p) => beatValue(note.beat) >= p.beat && beatValue(note.beat) < p.endBeat,
      )!;
      const angle = (phrase.heading * Math.PI) / 180;
      const actual = positionAt(entity, entity.spawnTick);
      expect(actual[0]).toBeCloseTo(Math.sin(angle) * 18, 5);
      expect(actual[2]).toBeCloseTo(-Math.cos(angle) * 18, 5);
    }
    for (let tick = 0; tick < program.durationTicks; tick += 137)
      expect(scenePositionAt(scene!.objects[0], tick)).toEqual(positionAt(scene!.objects[0], tick));
  });
  it('starts every stationary rail at its authored contact point and includes its first segment', () => {
    const { map } = generateChoreography(
      music(),
      { style: 'stationary' },
      {
        composer: {
          id: 'test/rails',
          compose: (context) =>
            dancePhrases.compose({
              ...context,
              phrase: { ...context.phrase, motif: 'rail-counterpoint' },
            }),
        },
      },
    );
    for (const entity of compile(map).program.entities.filter((e) => e.kind === 'hold')) {
      const note = map.notes.find((n) => n.id === entity.id)!;
      expect(positionAt(entity, entity.hitTick)).toEqual(cartesian(note.position));
      expect(positionAt(entity, entity.hitTick + 1)).not.toEqual(
        positionAt(entity, entity.motion[1].tick),
      );
    }
  });
  it('rejects post-expiry emitted motion and accepts a waypoint exactly at expiry', () => {
    const map = holdMap();
    expect(() => compile(map)).not.toThrow();
    map.notes[0].motion!.at(-1)!.beat = 8;
    expect(() => compile(map)).toThrowError(
      expect.objectContaining({
        code: 'MAP_INVALID',
        details: expect.arrayContaining([expect.stringContaining('lifetime')]),
      }),
    );
  });
  it('keeps a late active hold preview through its actual contact lifetime', async () => {
    const session = await Session.create(holdMap(), [standardActor()]);
    session.advance(310);
    const preview = session.observe({ role: 'admin' }).entities[0].contactPath!;
    expect(preview[0].tick).toBe(310);
    expect(preview.at(-1)!.tick).toBe(420);
    expect(preview.at(-1)!.position).toEqual([-0.4, 1.3, -0.4]);
    const restored = await Session.restore(session.client({ role: 'admin' }).checkpoint());
    expect(restored.observe({ role: 'admin' })).toEqual(session.observe({ role: 'admin' }));
    session.close();
    restored.close();
  });
  it('aims late moving strikes at their live depth', () => {
    const entity = target({ kind: 'sphere', radius: 0.08 });
    entity.position = [0.5, 1.65, -1.4];
    const ray = new THREE.Ray(
      new THREE.Vector3(0, 1.65, 0),
      new THREE.Vector3(0.5, 0, -1.4).normalize(),
    );
    const point = assistedTargetPoint(ray, entity, 110)!;
    expect(point.distanceTo(new THREE.Vector3(...entity.position))).toBeLessThan(1e-12);
    expect(assistedTargetPoint(ray, entity, 90)).toBeNull();
  });
  it('assists rays through the edges of oriented boxes and elongated capsules', () => {
    const box = target({
      kind: 'box',
      half: [0.6, 0.1, 0.08],
      rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2],
    });
    const ray = new THREE.Ray(new THREE.Vector3(0, 2.05, 0), new THREE.Vector3(0, 0, -1));
    expect(assistedTargetPoint(ray, box, 90)).not.toBeNull();
    const capsule = target({ kind: 'capsule', a: [0, -0.6, 0], b: [0, 0.6, 0], radius: 0.04 });
    expect(assistedTargetPoint(ray, capsule, 90)?.z).toBeCloseTo(-0.4);
    const miss = new THREE.Ray(new THREE.Vector3(0.3, 2.05, 0), new THREE.Vector3(0, 0, -1));
    expect(assistedTargetPoint(miss, capsule, 90)).toBeNull();
  });
  it('allows continuous expert phrases to keep emitting during turns and use opposed wide pairs', () => {
    const { map, report } = generateChoreography(
      music(),
      {
        difficulty: 'master',
        turnMode: 'full',
        turnStyle: 'continuous',
        turnDegrees: 120,
        maxTurnSpeed: 60,
        movementRange: 'wide',
        maxHandSpeed: 6,
        rhythm: 'steady',
      },
      {
        composer: {
          id: 'test/pairs',
          compose: (context) =>
            dancePhrases.compose({ ...context, phrase: { ...context.phrase, motif: 'pairs' } }),
        },
      },
    );
    const phrase = report.phrases[0];
    expect(map.notes.some((n) => beatValue(n.beat) === phrase.beat + 7.5)).toBe(true);
    expect(report.issues).toEqual([]);
    const paired = map.notes.filter((n) => beatValue(n.beat) === phrase.beat + 1);
    expect(paired).toHaveLength(2);
    expect(
      Math.abs(cartesian(paired[0].position)[1] - cartesian(paired[1].position)[1]),
    ).toBeGreaterThan(0.7);
    const emitter = compile(map).scene!.objects[0];
    const keys = emitter.motion.slice(0, 4);
    expect(new Set(keys.map((k) => JSON.stringify(k.position))).size).toBe(4);
  });
  it('bakes height and room scale without changing timing, note size or the original, and is idempotent', () => {
    const original = generateChoreography(music(), { playerHeight: 1.65 }).map;
    const before = structuredClone(original);
    const fitted = fitMapToPlayer(original, { height: 1.8, roomScale: 1.2 });
    expect(original).toEqual(before);
    expect(fitMapToPlayer(fitted, { height: 1.8, roomScale: 1.2 })).toEqual(fitted);
    fitted.notes.forEach((note, i) => {
      const p = cartesian(original.notes[i].position),
        q = cartesian(note.position);
      expect(q[0]).toBeCloseTo(p[0] * 1.2);
      expect(q[1]).toBeCloseTo((p[1] * 1.8) / 1.65);
      expect(q[2]).toBeCloseTo(p[2] * 1.2);
      expect(note.beat).toEqual(original.notes[i].beat);
      expect(note.shape).toEqual(original.notes[i].shape);
    });
    expect(() => fitMapToPlayer(original, { roomScale: NaN })).toThrow();
  });
  it('fits an expert chart through CLI/MCP service contracts and verifies ordinary pose play', async () => {
    const { map } = generateChoreography(music(), {
      difficulty: 'master',
      turnMode: 'full',
      turnStyle: 'continuous',
      movementRange: 'wide',
      turnDegrees: 120,
      maxTurnSpeed: 60,
      maxHandSpeed: 6,
    });
    const service = new EngineService();
    const request = {
      op: 'map.fit',
      requestId: 'personal-profile',
      args: { map, options: { height: 1.65, roomScale: 1.2 } },
    } as const;
    await expect(service.dispatch(request, { role: 'observer' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const fitted = await service.dispatch(request);
    expect(await service.dispatch(request)).toEqual(fitted);
    const session = await Session.create(fitted, [standardActor()]);
    const admin = session.client({ role: 'admin' }),
      commands = scriptedCommands(session.program);
    for (let i = 0; i < commands.length; i += 1024)
      admin.submit(`poses-${i}`, commands.slice(i, i + 1024));
    session.advance(session.program.durationTicks);
    expect(session.snapshot().scores[0].misses).toBe(0);
    expect(session.snapshot().scores[0].hits).toBe(map.notes.length);
    expect((await Session.verifyReplay(await admin.replay())).verified).toBe(true);
    session.close();
    service.close();
  });
});
function target(shape: Observation['entities'][number]['shape']): Observation['entities'][number] {
  return {
    id: 'target',
    kind: 'strike',
    position: [0, 1.65, -0.4],
    targetPosition: [0, 1.65, -0.4],
    orientation: [0, 0, 0, 1],
    shape,
    hitTick: 100,
    endTick: 160,
    slots: [{ semantic: 'left' }],
    hold: 0,
    holdTicks: 0,
    progress: 0,
  };
}
