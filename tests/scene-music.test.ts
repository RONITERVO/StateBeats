import { describe, expect, it } from 'vitest';
import {
  analyzePcm,
  canonical,
  compile,
  describeObservation,
  EngineService,
  generateMusicMap,
  MapBuilder,
  sampleMusic,
  sampleScene,
  Session,
  SILENT_FEATURES,
  standardActor,
  scriptedCommands,
} from '@statebeats/sdk';
import type { MapInput, MusicTimeline } from '@statebeats/sdk';
import { sunlitJourney } from '@statebeats/content';

const moving: MapInput = {
  version: 1,
  id: 'moving-source',
  title: 'Moving source',
  durationBeats: 12,
  tempo: [{ beat: 0, bpm: 120 }],
  scene: {
    version: 1,
    theme: 'community/sky',
    label: 'Star field',
    objects: [
      {
        id: 'sun',
        appearance: 'community/black-hole',
        label: 'Moving black hole',
        anchor: 'player',
        position: [0, 5, -500],
        trailSeconds: 1,
        motion: [
          { beat: 0, position: [0, 5, -500] },
          { beat: 8, position: [8, 5, -500] },
        ],
      },
    ],
  },
  notes: [
    {
      id: 'left',
      beat: 6,
      preset: 'left',
      label: 'Left star',
      appearance: 'community/star',
      position: [-0.3, 1.4, -0.8],
      emission: { source: 'sun', beat: 2 },
    },
    {
      id: 'right',
      beat: 6,
      preset: 'right',
      position: [0.3, 1.4, -0.8],
      emission: { source: 'sun', beat: 2 },
    },
    { id: 'later', beat: 8, position: [0, 1.4, -0.8], emission: { source: 'sun', beat: 4 } },
    { id: 'ground', beat: 6, position: [0, 0.15, -0.8], earlyMs: 0, leadMs: 4000 },
  ],
};
describe('shared scenes and baked release paths', () => {
  it('birds are head avoidance volumes: a stationary head collides and a ducking head clears them', async () => {
    for (const height of [1.65, 1]) {
      const map = sunlitJourney();
      map.notes = map.notes.filter((note) => note.preset === 'hazard');
      const session = await Session.create(map, [standardActor()]);
      session.client({ role: 'player', actorId: 'player' }).submit('head', [
        {
          id: 'head',
          tick: 1,
          type: 'pose',
          actorId: 'player',
          effectorId: 'head',
          position: [0, height, 0],
        },
      ]);
      session.advance(session.program.durationTicks);
      if (height === 1.65) expect(session.snapshot().scores[0].hazards).toBeGreaterThanOrEqual(5);
      else expect(session.snapshot().scores[0].hazards).toBe(0);
      session.close();
    }
  });
  it('protects replay presentation independently from gameplay, and ignores inherited stage names', async () => {
    const session = await Session.create(moving, [standardActor()]);
    session.advance(120);
    const replay = await session.client({ role: 'admin' }).replay();
    replay.map.scene!.theme = 'community/changed';
    await expect(Session.verifyReplay(replay)).rejects.toMatchObject({
      code: 'PRESENTATION_MISMATCH',
    });
    const checkpoint = session.client({ role: 'admin' }).checkpoint();
    checkpoint.map.scene!.objects[0].label = 'Changed';
    await expect(Session.restore(checkpoint)).rejects.toMatchObject({
      code: 'PRESENTATION_MISMATCH',
    });
    const { scene } = compile({
      ...moving,
      notes: [],
      scene: {
        ...moving.scene,
        objects: [{ ...moving.scene!.objects![0], anchor: 'constructor' }],
      },
    });
    expect(sampleScene(scene!, 120).objects[0].position).toEqual([2, 5, -500]);
    session.close();
  });
  it('emits simultaneous targets from the displayed source, including a rotated calibrated stage', async () => {
    const session = await Session.create(moving, [standardActor()]);
    const admin = session.client({ role: 'admin' });
    admin.submit('calibrate', [
      {
        id: 'calibrate',
        tick: 1,
        type: 'calibrate',
        actorId: 'player',
        position: [10, 0, 3],
        orientation: [0, 1, 0, 0],
      },
    ]);
    session.advance(120);
    const view = admin.observe(),
      emitter = view.scene!.objects[0];
    expect(emitter.position).toEqual([8, 5, 503]);
    for (const id of ['left', 'right'])
      expect(view.entities.find((entity) => entity.id === id)!.position).toEqual(emitter.position);
    expect(view.entities.find((entity) => entity.id === 'ground')!.position[1]).toBe(0.15);
    session.advance(120);
    const later = admin.observe();
    expect(later.entities.find((entity) => entity.id === 'later')!.position).toEqual(
      later.scene!.objects[0].position,
    );
    // First star travels independently while the source continues moving.
    expect(later.entities.find((entity) => entity.id === 'left')!.position).toEqual([
      9.15, 3.2, 253.4,
    ]);
    expect(later.scene!.objects[0].position).toEqual([6, 5, 503]);
    const checkpoint = admin.checkpoint(),
      restored = await Session.restore(checkpoint);
    expect(restored.client({ role: 'admin' }).observe()).toEqual(later);
    session.close();
    restored.close();
  });
  it('samples bounded temporary trails identically after forward or backward seeks', () => {
    const { scene } = compile(moving);
    const first = sampleScene(scene!, 180);
    expect(first.objects[0].trail[0]).toEqual([1, 5, -500]);
    expect(first.objects[0].trail.at(-1)).toEqual([3, 5, -500]);
    sampleScene(scene!, 999);
    expect(sampleScene(scene!, 180)).toEqual(first);
    expect(sampleScene(scene!, 0).objects[0].trail).toEqual([]);
    expect(first.objects[0].trail.length).toBeLessThanOrEqual(64);
    expect(() => sampleScene(scene!, NaN)).toThrow();
  });
  it('rejects unresolved emitters, conflicting anchors and quantized duplicate path times', () => {
    expect(() => compile({ ...moving, scene: undefined })).toThrow();
    expect(() =>
      compile({ ...moving, notes: [{ ...moving.notes[0], anchor: 'other' }] }),
    ).toThrow();
    expect(() =>
      compile({ ...moving, notes: [{ ...moving.notes[0], emission: { source: 'sun', beat: 6 } }] }),
    ).toThrow();
    const duplicate = structuredClone(moving);
    duplicate.scene!.objects![0].motion = [
      { beat: 0, position: [0, 0, 0] },
      { beat: 0.00001, position: [1, 0, 0] },
    ];
    expect(() => compile(duplicate)).toThrow('distinct increasing');
    expect(() => new MapBuilder(moving).setScene(undefined).compile()).toThrow();
  });
  it('permits six directions at long range and preserves hits through compiled replay without audio/graphics', async () => {
    const map: MapInput = { ...moving, scene: undefined, notes: [] };
    const origins: [number, number, number][] = [
      [500, 1, 0],
      [-500, 1, 0],
      [0, 500, 0],
      [0, -500, 0],
      [0, 1, 500],
      [0, 1, -500],
    ];
    for (let i = 0; i < origins.length; i++) {
      const beat = 4 + i,
        target: [number, number, number] = [i % 2 ? 0.3 : -0.3, 1.4, -0.8];
      map.notes.push({
        id: `n${i}`,
        preset: i % 2 ? 'right' : 'left',
        beat,
        position: target,
        earlyMs: 0,
        leadMs: (beat - 1) * 500,
        motion: [
          { beat: 1, position: origins[i] },
          { beat, position: target },
        ],
      });
    }
    const session = await Session.create(map, [standardActor()]);
    const admin = session.client({ role: 'admin' });
    admin.submit('play', scriptedCommands(session.program));
    session.advance(60);
    expect(admin.observe().entities.map((entity) => entity.position)).toEqual(origins);
    session.advance(session.program.durationTicks);
    expect(admin.observe().scores[0].hits).toBe(6);
    expect((await Session.verifyReplay(await admin.replay())).verified).toBe(true);
    session.close();
  });
});

function signal(hz: number, seconds = 2): Float32Array {
  return Float32Array.from(
    { length: 16000 * seconds },
    (_, i) => Math.sin((2 * Math.PI * hz * i) / 16000) * 0.5,
  );
}
describe('recorded music features', () => {
  it('distinguishes low and high frequencies, has no fake signal in silence, and rejects invalid PCM', () => {
    const low = analyzePcm({ samples: signal(100), sampleRate: 16000 });
    const high = analyzePcm({ samples: signal(3000), sampleRate: 16000 });
    expect(low.frames[4].features.bass).toBeGreaterThan(low.frames[4].features.presence * 20);
    expect(high.frames[4].features.presence).toBeGreaterThan(high.frames[4].features.bass * 20);
    expect(
      analyzePcm({ samples: new Float32Array(16000), sampleRate: 16000 }).frames.every((frame) =>
        Object.values(frame.features).every((value) => value === 0),
      ),
    ).toBe(true);
    expect(() => analyzePcm({ samples: new Float32Array([NaN]), sampleRate: 16000 })).toThrow();
    expect(() => analyzePcm({ samples: signal(100), sampleRate: 100 })).toThrow();
    expect(canonical(analyzePcm({ samples: signal(100), sampleRate: 16000 }))).toBe(canonical(low));
  });
  it('interpolates stored features at manual ticks, handles silence outside the track, and returns owned data', () => {
    const timeline: MusicTimeline = {
      version: 1,
      tickRate: 120,
      algorithm: 'test/features-v1',
      frames: [
        { tick: 120, features: { ...SILENT_FEATURES } },
        { tick: 240, features: { ...SILENT_FEATURES, bass: 1 } },
      ],
    };
    expect(sampleMusic(timeline, 180).bass).toBe(0.5);
    expect(sampleMusic(timeline, 119).bass).toBe(0);
    expect(sampleMusic(timeline, 241).bass).toBe(0);
    sampleMusic(timeline, 240).bass = 0;
    expect(sampleMusic(timeline, 240).bass).toBe(1);
    expect(() => compile({ ...moving, music: { ...timeline, tickRate: 60 } })).toThrow();
    expect(() =>
      compile({ ...moving, music: { ...timeline, frames: [...timeline.frames].reverse() } }),
    ).toThrow();
  });
  it('generates playable, repeatable music charts with reachable destinations and replays stored paths', async () => {
    const music = analyzePcm({ samples: signal(100, 20), sampleRate: 16000 });
    const a = generateMusicMap(music, { seed: 52, turning: true, difficulty: 'flow' });
    expect(a).toEqual(generateMusicMap(music, { seed: 52, turning: true, difficulty: 'flow' }));
    expect(a.notes).not.toEqual(
      generateMusicMap(music, { seed: 53, turning: true, difficulty: 'flow' }).notes,
    );
    expect(a.notes.length).toBeGreaterThan(8);
    const session = await Session.create(a, [standardActor()]);
    session.client({ role: 'admin' }).submit('play', scriptedCommands(session.program));
    session.advance(session.program.durationTicks);
    expect(session.snapshot().scores[0].hits).toBe(a.notes.length);
    expect(
      (await Session.verifyReplay(await session.client({ role: 'admin' }).replay())).verified,
    ).toBe(true);
    session.close();
  });
});

it('describes approaching destinations and hand requirements through the shared service without advancing time', async () => {
  const service = new EngineService();
  await service.addMap(moving);
  await service.dispatch({ op: 'session.create', sessionId: 'text', args: { mapId: moving.id } });
  await service.dispatch({
    op: 'clock.advance',
    sessionId: 'text',
    requestId: 'step',
    args: { ticks: 120 },
  });
  const view = (await service.dispatch({ op: 'observe', sessionId: 'text' })) as Awaited<
    ReturnType<Session['observe']>
  >;
  const description = describeObservation(view);
  const left = description.targets.find((target) => target.id === 'left')!;
  expect(left.label).toBe('Left star');
  expect(left.requirement).toBe('left');
  expect(left.distanceMetres).toBeLessThan(1);
  expect(left.text).toContain("11 o'clock");
  expect(left.secondsUntil).toBe(2);
  expect(await service.dispatch({ op: 'perception.describe', sessionId: 'text' })).toEqual(
    description,
  );
  expect(
    ((await service.dispatch({ op: 'observe', sessionId: 'text' })) as { tick: number }).tick,
  ).toBe(120);
  service.close();
});
