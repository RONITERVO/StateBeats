import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  beatToTick,
  compile,
  dancePhrases,
  EngineService,
  generateChoreography,
  inspectChoreography,
  Session,
  SILENT_FEATURES,
  scriptedCommands,
  standardActor,
} from '@statebeats/sdk';
import type { MusicTimeline, MusicGenerationOptions, MapInput } from '@statebeats/sdk';

function music(tickRate: 60 | 120 | 240 = 120): MusicTimeline {
  return {
    version: 1,
    tickRate,
    algorithm: 'test/pulses',
    frames: Array.from({ length: 961 }, (_, i) => ({
      tick: 4 * tickRate + Math.round((i * tickRate) / 20),
      features:
        i === 960
          ? { ...SILENT_FEATURES }
          : {
              ...SILENT_FEATURES,
              rms: 0.2,
              energy: i < 320 ? 0.2 : i < 640 ? 0.7 : 0.4,
              bass: 0.4,
              flux: i % 10 === 0 ? 0.7 : 0.05,
              transient: i % 10 === 0 ? 0.8 : 0,
              beat: i % 10 === 0 ? 1 : 0,
            },
    })),
  };
}
describe('musical choreography pipeline', () => {
  it('reproduces saved choices without mutating source, varies seeds, and exposes independent hands', () => {
    const source = music(),
      before = structuredClone(source);
    const options = { seed: 17, difficulty: 'flow', turnMode: 'full' } as const;
    const a = generateChoreography(source, options);
    expect(a).toEqual(generateChoreography(source, options));
    expect(a.map.notes).not.toEqual(
      generateChoreography(source, { ...options, seed: 18 }).map.notes,
    );
    expect(source).toEqual(before);
    expect(a.map.generation?.algorithm).toBe('statebeats/choreography-v1');
    expect(a.report.summary.rails).toBeGreaterThan(0);
    expect(a.report.summary.pairs).toBeGreaterThan(0);
    expect(a.report.issues).toEqual([]);
    expect(new Set(a.report.phrases.map((p) => p.section)).size).toBeGreaterThan(1);
  });
  it('places the supplied beat grid relative to audio and preserves fixed-second anticipation', () => {
    for (const bpm of [80, 137, 200]) {
      const { map } = generateChoreography(music(), {
        bpm,
        beatOffsetSeconds: 0.375,
        leadSeconds: 2,
        rails: false,
      });
      for (const note of map.notes) {
        const hit = beatToTick(note.beat, map) / map.tickRate;
        const grid = ((hit - 4 - 0.375) * bpm) / 60;
        expect(Math.abs(grid - Math.round(grid))).toBeLessThan(0.02);
        expect(note.emission).toBeDefined();
        expect(
          (beatToTick(note.beat, map) - beatToTick(note.emission!.beat, map)) / map.tickRate,
        ).toBeCloseTo(2, 1);
      }
    }
  });
  it('satisfies hand-center constraints across seeds, intensities, reach, tempo and tick rates', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100000 }),
        fc.constantFrom(60, 120, 240),
        fc.integer({ min: 60, max: 220 }),
        (seed, rate, bpm) => {
          const options: MusicGenerationOptions = {
            seed,
            bpm,
            tickRate: rate as 60 | 120 | 240,
            difficulty: 'busy',
            turnMode: 'bounded',
            reach: 0.45,
            maxHandSpeed: 1.8,
            crossovers: true,
          };
          const { map, report } = generateChoreography(music(rate as 60 | 120 | 240), options);
          expect(inspectChoreography(map, options).issues).toEqual([]);
          expect(report.phrases.every((p) => Math.abs(p.heading) <= 60)).toBe(true);
          expect(report.summary.peakHandSpeed).toBeLessThanOrEqual(1.801);
        },
      ),
      { numRuns: 16 },
    );
  });
  it('keeps rails and turning on separate intervals and supports stationary or distant approaches', () => {
    const adapters = {
      composer: {
        id: 'test/rails',
        compose: (context: Parameters<typeof dancePhrases.compose>[0]) =>
          dancePhrases.compose({
            ...context,
            phrase: { ...context.phrase, motif: 'rail-counterpoint' },
          }),
      },
    };
    for (const style of ['approach', 'stationary', 'mixed'] as const) {
      const { map, report } = generateChoreography(
        music(),
        { style, spawnDistance: 500, difficulty: 'flow', turnMode: 'full' },
        adapters,
      );
      expect(report.summary.rails).toBeGreaterThan(0);
      const entities = compile(map).program.entities;
      for (const rail of entities.filter((e) => e.kind === 'hold')) {
        expect(rail.motion.some((k) => k.tick > rail.hitTick)).toBe(true);
        if (style === 'approach')
          expect(Math.hypot(...rail.motion[0].position)).toBeGreaterThan(499);
        if (style === 'stationary') expect(rail.motion[0].tick).toBeGreaterThan(rail.hitTick);
      }
      for (let i = 1; i < report.phrases.length; i++)
        expect(
          Math.abs(report.phrases[i].heading - report.phrases[i - 1].heading),
        ).toBeLessThanOrEqual(30);
    }
  });
  it('plays moving rails through ordinary pose commands, restores previews, and verifies replay', async () => {
    const { map, report } = generateChoreography(music(), {
      seed: 17,
      difficulty: 'flow',
      turnMode: 'full',
    });
    const session = await Session.create(map, [standardActor()]);
    const admin = session.client({ role: 'admin' }),
      commands = scriptedCommands(session.program);
    for (let i = 0; i < commands.length; i += 1024)
      admin.submit(`batch-${i}`, commands.slice(i, i + 1024));
    const rail = session.program.entities.find((e) => e.kind === 'hold')!;
    session.advance(rail.spawnTick);
    const preview = admin.observe().entities.find((e) => e.id === rail.id)!.contactPath!;
    expect(preview.length).toBeGreaterThan(2);
    expect(preview.length).toBeLessThanOrEqual(64);
    const restored = await Session.restore(admin.checkpoint());
    expect(restored.observe({ role: 'admin' })).toEqual(admin.observe());
    session.advance(session.program.durationTicks);
    expect(session.snapshot().scores[0].hits).toBe(report.summary.heads);
    expect(session.snapshot().scores[0].misses).toBe(0);
    expect((await Session.verifyReplay(await admin.replay())).verified).toBe(true);
    session.close();
    restored.close();
  });
  it('finds an impossible simultaneous hand requirement and out-of-reach held path', () => {
    const bad: MapInput = {
      version: 1,
      id: 'bad',
      title: 'Bad',
      tempo: [{ beat: 0, bpm: 120 }],
      durationBeats: 16,
      notes: [
        {
          id: 'rail',
          beat: 4,
          preset: 'hold',
          slots: [{ semantic: 'left' }],
          position: [-0.2, 1.3, -0.4],
          holdMs: 1000,
          motion: [
            { beat: 4, position: [-0.2, 1.3, -0.4] },
            { beat: 6, position: [-2, 1.3, -0.4] },
          ],
        },
        { id: 'other', beat: 5, preset: 'left', position: [0.3, 1.3, -0.4] },
      ],
    };
    const codes = inspectChoreography(bad).issues.map((i) => i.code);
    expect(codes).toContain('reach');
    expect(codes).toContain('hand-conflict');
  });
  it('does not infer musical labels or create notes from silence; validates timeline and planner output', () => {
    const silent = music();
    silent.frames.forEach((f) => (f.features = { ...SILENT_FEATURES }));
    expect(() => generateChoreography(silent)).toThrow('No playable');
    expect(() => generateChoreography(music(), { bpm: NaN })).toThrow();
    expect(() => generateChoreography(music(), { tickRate: 60 })).toThrow('matching');
    const bad = music();
    bad.frames.reverse();
    expect(() => generateChoreography(bad)).toThrow('increasing');
    expect(() =>
      generateChoreography(
        music(),
        {},
        { facing: { id: 'test/bad', plan: (phrases) => phrases.map((_, i) => i * 180) } },
      ),
    ).toThrow('turn budget');
  });
  it('shares composition/report/inspection through the service with capability and retry enforcement', async () => {
    const service = new EngineService();
    const request = {
      op: 'music.compose',
      requestId: 'compose-1',
      args: { music: music(), options: { seed: 17 } },
    } as const;
    await expect(service.dispatch(request, { role: 'observer' })).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
    const result = (await service.dispatch(request)) as ReturnType<typeof generateChoreography>;
    expect(await service.dispatch(request)).toEqual(result);
    const inspected = (await service.dispatch({
      op: 'choreography.inspect',
      args: { mapId: result.map.id },
    })) as ReturnType<typeof inspectChoreography>;
    expect(inspected.issues).toEqual([]);
    service.close();
  });
  it('validates custom composer data and keeps late rail completion out of the turn interval', () => {
    expect(() =>
      generateChoreography(
        music(),
        {},
        {
          composer: { id: 'test/malformed', compose: () => [{ id: 'bad' } as never] },
        },
      ),
    ).toThrowError(expect.objectContaining({ code: 'VALIDATION' }));
    expect(() =>
      generateChoreography(
        music(),
        {},
        {
          composer: {
            id: 'test/late-hold',
            compose: ({ phrase, place }) => [
              {
                id: `rail-${phrase.index}`,
                beat: phrase.beat + 5,
                preset: 'hold',
                slots: [{ semantic: 'left' }],
                position: place(-0.2, 0),
                holdMs: 500,
              },
            ],
          },
        },
      ),
    ).toThrow('recovery and turning');
    // A song may finish between grid points; the final phrase still reserves its late window.
    const source = music();
    source.frames = source.frames.filter((frame) => frame.tick <= 6021);
    expect(generateChoreography(source, { bpm: 137, difficulty: 'busy' }).report.issues).toEqual(
      [],
    );
  });
});
