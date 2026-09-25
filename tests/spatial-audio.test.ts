import { describe, expect, it } from 'vitest';
import {
  compile,
  Session,
  standardActor,
  sampleSpatialAudio,
  MapBuilder,
  presentationIdentity,
  programIdentity,
  EngineService,
  fitMapToPlayer,
} from '@statebeats/sdk';
import type { MapInput, Observation } from '@statebeats/sdk';
import { eventHorizonMaster } from '@statebeats/content';
import { inkBattleMap } from '@statebeats/ink-battle';
import { resolveSound, registerSoundTheme } from '../packages/player/src/sound-themes.js';

const admin = { role: 'admin' } as const;
const input = (): MapInput => ({
  version: 1,
  id: 'spatial-audio',
  title: 'Spatial audio',
  durationBeats: 12,
  tempo: [{ beat: 0, bpm: 120 }],
  audio: { version: 1, theme: 'statebeats/orbital-v1' },
  notes: [
    {
      id: 'arc',
      preset: 'hold',
      beat: 4,
      position: [-1, 1.5, -1],
      anchor: 'player',
      leadMs: 2000,
      earlyMs: 0,
      holdMs: 1200,
      durationBeats: 4,
      motion: [
        { beat: 4, position: [-1, 1.5, -1] },
        { beat: 8, position: [1, 2, -1] },
      ],
      sound: { effect: 'orbital/arc', gain: 0.6 },
      presentation: { readiness: { preview: { beats: 3 }, prepare: { beats: 1 } } },
    },
  ],
});
describe('portable spatial sound projection', () => {
  it('keeps hidden/waiting targets quiet, follows the active arc and stops at resolution', async () => {
    const s = await Session.create(input(), [standardActor()]);
    s.advance(30);
    expect(sampleSpatialAudio(s.observe(admin)).sources).toEqual([]);
    s.advance(100);
    expect(s.observe(admin).entities[0].presentation!.readiness!.phase).toBe('waiting');
    expect(sampleSpatialAudio(s.observe(admin)).sources).toEqual([]);
    s.advance(80);
    const preparing = sampleSpatialAudio(s.observe(admin)).sources[0];
    expect(preparing.intensity).toBeGreaterThan(0);
    expect(preparing.intensity).toBeLessThan(0.6);
    s.advance(40);
    const view = s.observe(admin);
    const frame = sampleSpatialAudio(view);
    expect(frame.sources[0].role).toBe('hold');
    expect(frame.sources[0].position).toEqual(view.entities[0].position);
    expect(frame.sources[0].position).not.toEqual(view.entities[0].targetPosition);
    expect(frame.sources[0].intensity).toBeCloseTo(0.6);
    expect(sampleSpatialAudio(view)).toEqual(frame);
    frame.sources[0].position[0] = 999;
    expect(s.observe(admin).entities[0].position[0]).not.toBe(999);
    s.advance(400);
    expect(sampleSpatialAudio(s.observe(admin)).sources).toEqual([]);
    s.close();
  });
  it('uses calibrated/recentered world coordinates and does not change gameplay identity', async () => {
    const map = input();
    const a = compile(map);
    delete map.audio;
    delete map.notes[0].sound;
    const b = compile(map);
    expect(await programIdentity(a.program)).toBe(await programIdentity(b.program));
    expect(await presentationIdentity(a.map)).not.toBe(await presentationIdentity(b.map));
    const fitted = fitMapToPlayer(a.map, { height: 1.8, roomScale: 1.2 });
    const s = await Session.create(fitted, [standardActor()]);
    s.submit(admin, 'recenter', [
      {
        id: 'recenter',
        type: 'calibrate',
        tick: 1,
        actorId: 'player',
        position: [2, 0.2, 3],
        orientation: [0, Math.SQRT1_2, 0, Math.SQRT1_2],
      },
    ]);
    s.advance(240);
    const view = s.observe(admin);
    expect(sampleSpatialAudio(view).sources[0].position).toEqual(view.entities[0].position);
    expect(view.audio).toEqual(a.map.audio);
    expect(view.entities[0].sound).toEqual(a.map.notes[0].sound);
    const restored = await Session.restore(await s.checkpoint(admin));
    expect(sampleSpatialAudio(restored.observe(admin))).toEqual(sampleSpatialAudio(view));
    s.close();
    restored.close();
  });
  it('bounds dense frames, prioritizes active holds and never exposes resolved release effects', async () => {
    const s = await Session.create(input());
    s.advance(240);
    const view = s.observe(admin);
    const entity = view.entities[0];
    view.entities = Array.from({ length: 40 }, (_, i) => ({
      ...entity,
      id: `note-${i}`,
      kind: 'strike',
      hitTick: view.tick + i,
    }));
    view.entities.push({ ...entity, id: 'important-hold' });
    const frame = sampleSpatialAudio(view);
    expect(frame.sources).toHaveLength(8);
    expect(frame.omitted).toBe(33);
    expect(frame.sources[0].id).toBe('important-hold');
    view.entities.reverse();
    expect(sampleSpatialAudio(view)).toEqual(frame);
    expect(() => sampleSpatialAudio(view, { maxSources: 100 })).toThrow();
    view.resolvedEntities = view.entities;
    view.entities = [];
    expect(sampleSpatialAudio(view).sources).toEqual([]);
    s.close();
  });
  it('supports SDK/CLI/MCP authoring, validates sound data and prevents replay theme tampering', async () => {
    const map = input();
    expect(new MapBuilder(map).setAudio(undefined).export().audio).toBeUndefined();
    expect(() =>
      compile({ ...map, audio: { version: 1, theme: 'ok', url: 'https://example.com/audio' } }),
    ).toThrow();
    expect(() =>
      compile({ ...map, notes: [{ ...map.notes[0], sound: { effect: 'x', gain: 2 } }] }),
    ).toThrow();
    const service = new EngineService();
    await service.addMap(map);
    await service.dispatch({
      op: 'map.edit',
      args: { mapId: map.id, audio: { version: 1, theme: 'statebeats/neutral-v1' } },
    });
    await service.dispatch({ op: 'session.create', sessionId: 'audio', args: { mapId: map.id } });
    await service.dispatch({
      op: 'clock.advance',
      sessionId: 'audio',
      requestId: 'a',
      args: { ticks: 240 },
    });
    const view = (await service.dispatch({ op: 'observe', sessionId: 'audio' })) as Observation;
    expect(await service.dispatch({ op: 'perception.audio', sessionId: 'audio' })).toEqual(
      sampleSpatialAudio(view),
    );
    expect(
      ((await service.dispatch({ op: 'observe', sessionId: 'audio' })) as Observation).tick,
    ).toBe(view.tick);
    service.close();
    const s = await Session.create(map);
    s.advance(240);
    const replay = await s.exportReplay(admin);
    replay.map.audio!.theme = 'statebeats/neutral-v1';
    await expect(Session.verifyReplay(replay)).rejects.toThrow();
    s.close();
  });
  it('ships themed maps, gives unknown IDs a local fallback and allows explicit silence', () => {
    const ink = inkBattleMap();
    expect(ink.audio?.theme).toBe('ink-battle/battlefield-v1');
    expect(new Set(ink.notes.map((n) => n.sound?.effect)).size).toBeGreaterThanOrEqual(4);
    expect(eventHorizonMaster().audio?.theme).toBe('statebeats/orbital-v1');
    const source = {
      id: 'x',
      role: 'hold' as const,
      position: [0, 1, -1] as [number, number, number],
      intensity: 1,
      progress: 0,
      elapsedSeconds: 0,
    };
    expect(resolveSound(undefined, source)).toBeUndefined();
    expect(resolveSound('uninstalled/theme', { ...source, effect: 'uninstalled/sound' })?.id).toBe(
      'statebeats/charge',
    );
    expect(
      resolveSound('statebeats/orbital-v1', { ...source, effect: 'statebeats/silent' }),
    ).toBeUndefined();
    expect(resolveSound('statebeats/orbital-v1', source)?.id).toBe('orbital/arc');
    expect(() =>
      registerSoundTheme({
        id: 'bad',
        roles: {} as never,
        effects: {
          bad: {
            wave: 'sine',
            frequency: NaN,
            endFrequency: 200,
            gain: 0.1,
            filter: 'lowpass',
            filterHz: 500,
          },
        },
      }),
    ).toThrow();
  });
  it('keeps active hazards audible and budgets only opted-in notes on otherwise silent maps', async () => {
    const s = await Session.create(input());
    s.advance(240);
    const view = s.observe(admin);
    const entity = view.entities[0];
    entity.kind = 'hazard';
    view.tick += 100;
    expect(sampleSpatialAudio(view).sources[0].role).toBe('hazard');
    expect(sampleSpatialAudio(view).sources[0].intensity).toBeCloseTo(0.6);
    delete view.audio;
    view.entities = [
      entity,
      ...Array.from({ length: 20 }, (_, i) => ({ ...entity, id: `silent-${i}`, sound: undefined })),
    ];
    expect(sampleSpatialAudio(view).sources.map((source) => source.id)).toEqual([entity.id]);
    entity.sound = { effect: 'statebeats/silent', gain: 1 };
    expect(sampleSpatialAudio(view).sources).toEqual([]);
    s.close();
  });
});
