import { test, expect } from '@playwright/test';
import { Session } from '@statebeats/sdk';
import type { Observation } from '@statebeats/sdk';
import { eventHorizonMaster } from '@statebeats/content';
import { resolve } from 'node:path';

test('Event Horizon distinguishes waiting, preparation and contact without full-bright competing solids', async ({
  page,
}) => {
  const input = eventHorizonMaster();
  const id = input.notes.find((n) => n.presentation?.readiness)!.id;
  const session = await Session.create(input);
  const target = session.program.entities.find((e) => e.id === id)!;
  const frames: Observation[] = [];
  for (const tick of [
    target.hitTick - 97,
    target.hitTick - 65,
    target.hitTick - 24,
    target.hitTick,
  ]) {
    session.advance(tick - session.tick);
    frames.push(session.observe({ role: 'admin' }));
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.goto('/conformance.html');
  const result = await page.evaluate(
    async ({ frames, id, path }) => {
      const { readinessScene } = await import(path);
      const host = readinessScene(frames, id);
      (window as unknown as { readinessScene: typeof host }).readinessScene = host;
      return { samples: host.samples, redraw: host.redraw };
    },
    {
      frames,
      id,
      path: '/@fs/' + resolve('tests/browser/fixtures/readiness.ts').replaceAll('\\', '/'),
    },
  );
  expect(result.redraw).toEqual(result.samples);
  const [hidden, waiting, preparing, ready] = result.samples;
  expect(hidden.visible).toBe(false);
  expect(waiting).toMatchObject({
    body: 0,
    bodyVisible: false,
    core: 0,
    ring: 0,
    markerVisible: true,
    artworkRootVisible: false,
  });
  expect(waiting.marker).toBeGreaterThan(0);
  expect(waiting.label).toBeLessThan(0.3);
  expect(waiting.opacity.every((v: number) => v === 0)).toBe(true);
  expect(preparing.core).toBeCloseTo(0.5);
  expect(ready).toMatchObject({
    bodyVisible: true,
    core: 1,
    markerVisible: false,
    artworkRootVisible: true,
  });
  expect(ready.opacity[0]).toBe(1);
  for (const [name, index] of [
    ['waiting', 1],
    ['preparing', 2],
    ['ready', 3],
  ] as const) {
    await page.evaluate((frame) => {
      (
        window as unknown as { readinessScene: { draw(view: Observation): void } }
      ).readinessScene.draw(frame);
    }, frames[index]);
    await page.screenshot({ path: `artifacts/readiness-${name}.png` });
  }
  await page.evaluate(() =>
    (
      window as unknown as { readinessScene: { scene: { dispose(): void } } }
    ).readinessScene.scene.dispose(),
  );
  expect(errors).toEqual([]);
});

test('readiness preserves custom visibility, nested presence and explicit artistic ownership', async ({
  page,
}) => {
  const session = await Session.create({
    version: 1,
    id: 'readiness-artwork',
    title: 'Readiness artwork',
    durationBeats: 8,
    tempo: [{ beat: 0, bpm: 120 }],
    notes: [
      {
        id: 'target',
        preset: 'hold',
        beat: 4,
        earlyMs: 0,
        leadMs: 2000,
        holdMs: 500,
        appearance: 'test/readiness',
        position: [0, 1.4, -0.6],
        presentation: { readiness: { preview: { beats: 2 }, prepare: { beats: 1 } } },
      },
    ],
  });
  const frames: Observation[] = [];
  for (const tick of [150, 210, 240]) {
    session.advance(tick - session.tick);
    frames.push(session.observe({ role: 'admin' }));
  }
  await page.goto('/conformance.html');
  const cases = await page.evaluate(
    async ({ frames, path }) => {
      const { readinessScene, registerReadinessFixture } = await import(path);
      return [false, true].map((ownsReadiness) => {
        const unregister = registerReadinessFixture(ownsReadiness);
        const host = readinessScene(frames, 'target', true, true);
        const result = { samples: host.samples, redraw: host.redraw };
        host.scene.dispose();
        unregister();
        return result;
      });
    },
    {
      frames,
      path: '/@fs/' + resolve('tests/browser/fixtures/readiness.ts').replaceAll('\\', '/'),
    },
  );
  for (const result of cases) {
    expect(result.redraw).toEqual(result.samples);
    expect(result.samples.every((s: { artworkVisible: boolean }) => !s.artworkVisible)).toBe(true);
    expect(result.samples[0].body).toBe(0);
    expect(result.samples[0].marker).toBeGreaterThan(0.5);
    expect(result.samples[2].body).toBe(1);
  }
  expect(cases[0].samples.map((s: { opacity: number[] }) => s.opacity[0])).toEqual([0, 0.4, 0.8]);
  expect(cases[1].samples.map((s: { opacity: number[] }) => s.opacity[0])).toEqual([0.8, 0.8, 0.8]);
});
