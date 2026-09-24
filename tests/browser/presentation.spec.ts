import { test, expect } from '@playwright/test';
import { Session, standardActor, scriptedCommands } from '@statebeats/sdk';
import { sampleMap } from '@statebeats/content';
import type { Observation } from '@statebeats/sdk';
import { resolve } from 'node:path';

test('moving guides render the shared window, survive restore, and dispose with the target', async ({
  page,
}) => {
  const session = await Session.create(sampleMap('event-horizon-master'), [standardActor()]);
  const commands = scriptedCommands(session.program);
  for (let i = 0; i < commands.length; i += 1024)
    session.submit({ role: 'admin' }, `batch-${i}`, commands.slice(i, i + 1024));
  const hold = session.program.entities.find((e) => e.kind === 'hold')!;
  const frames: Observation[] = [];
  for (const tick of [
    hold.spawnTick,
    hold.hitTick - 25,
    hold.hitTick + 30,
    hold.hitTick + hold.holdTicks + 10,
  ]) {
    session.advance(tick - session.tick);
    frames.push(session.observe({ role: 'player', actorId: 'player' }));
  }
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.setViewportSize({ width: 1200, height: 850 });
  await page.goto('/conformance.html');
  const results = await page.evaluate(
    async ({ frames, holdId }) => {
      const modulePath = '/src/scene.ts';
      const { OrbitScene } = await import(modulePath);
      document.body.replaceChildren();
      document.body.style.margin = '0';
      const scene = new OrbitScene(document.body);
      scene.camera.position.set(0, 1.65, 0.7);
      scene.camera.lookAt(0, 1.35, -1);
      const results = [];
      for (const view of frames) {
        // Keep the actual stage but isolate the tested hand for reproducible geometry counts.
        const frame = {
          ...view,
          entities: view.entities.filter((e) => e.id === holdId),
          resolvedEntities: view.resolvedEntities?.filter((e) => e.id === holdId),
        };
        scene.update(frame);
        scene.render();
        const guide = scene.targets.getObjectByName('trajectory-guide');
        const cue = [...frame.entities, ...(frame.resolvedEntities ?? [])][0]?.presentation;
        results.push({
          count: guide?.geometry.drawRange.count ?? 0,
          expected: Math.max(0, (cue?.path.length ?? 0) - 1) * 36,
          phase: cue?.phase,
          visible: guide?.visible ?? false,
        });
      }
      // Deterministic redraw of the held frame; the browser test captures this actual WebGL output.
      const focus = frames[2].entities.find((e) => e.id === holdId)!.position;
      scene.camera.position.set(0, 1.65, 0);
      scene.camera.lookAt(focus[0], 1.45, focus[2]);
      scene.update(frames[2]);
      scene.render();
      (window as unknown as { presentationScene: typeof scene }).presentationScene = scene;
      return results;
    },
    { frames, holdId: hold.id },
  );
  for (const r of results) expect(r.count).toBe(r.expected);
  expect(results[0].visible).toBe(false);
  expect(results[1].visible).toBe(true);
  expect(results[2].phase).toBe('active');
  expect(results[3].phase).toBe('resolved');
  await page.screenshot({ path: 'artifacts/presentation-held.png' });
  const disposal = await page.evaluate((frame) => {
    const host = window as unknown as {
      presentationScene: {
        update(view: Observation): void;
        render(): void;
        dispose(): void;
        targets: { children: unknown[] };
        renderer: { info: { memory: { geometries: number } } };
      };
    };
    const scene = host.presentationScene;
    const before = scene.renderer.info.memory.geometries;
    scene.update({ ...frame, entities: [], resolvedEntities: [] });
    scene.render();
    const result = {
      remaining: scene.targets.children.length,
      released: before - scene.renderer.info.memory.geometries,
    };
    scene.dispose();
    return result;
  }, frames[2]);
  expect(disposal.remaining).toBe(0);
  expect(disposal.released).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

test('lifecycle opacity covers semantic and particle cues with independent labels and complete cleanup', async ({
  page,
}) => {
  const session = await Session.create({
    version: 1,
    id: 'presence-review',
    title: 'Presence review',
    durationBeats: 8,
    tempo: [{ beat: 0, bpm: 120 }],
    notes: ['a', 'b', 'c'].map((id, i) => ({
      id,
      preset: 'left',
      beat: 4,
      earlyMs: 0,
      leadMs: id === 'b' ? 2000 : 1000,
      position: [(i - 1) * 0.4, 1.2, -1],
      ...(id === 'c' ? { appearance: 'test/presence-adapter' } : {}),
      presentation: { appearMs: 1000, guide: 'none' },
    })),
  });
  session.advance(150);
  const frames = [session.observe({ role: 'admin' })];
  session.advance(30);
  frames.push(session.observe({ role: 'admin' }));
  // Core spawn order puts b before a; compare observations in the same stable order as rendering.
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (e) => {
    if (e.type() === 'error') errors.push(e.text());
  });
  await page.goto('/conformance.html');
  const result = await page.evaluate(
    async ({ frames, path }) => {
      const { exercisePresence } = await import(path);
      return exercisePresence(frames);
    },
    { frames, path: '/@fs/' + resolve('tests/browser/fixtures/presence.ts').replaceAll('\\', '/') },
  );
  for (const [i, frame] of frames.entries())
    for (const [j, entity] of frame.entities.entries()) {
      const sample = result.samples[i][j],
        visibility = entity.presentation!.visibility;
      expect(sample.body).toBeCloseTo(0.72 * visibility);
      expect(sample.ring).toBeCloseTo(0.8 * visibility);
      expect(sample.core).toBeCloseTo(visibility);
      expect(sample.label).toBeCloseTo(visibility);
      if (entity.id === 'c')
        expect(sample.particle).toBeCloseTo((i === 0 ? 0.8 : 0.2) * visibility);
    }
  expect(result.independentLabels).toBe(true);
  expect(result.sharedTexture).toBe(true);
  expect(result.afterRemoval).toEqual({
    guideUpdates: 0,
    guideDisposals: 1,
    artworkDisposals: 1,
    labelDisposals: 3,
    textureDisposals: 0,
    targets: 0,
  });
  expect(result.afterDisposal).toEqual({
    guideUpdates: 0,
    guideDisposals: 1,
    artworkDisposals: 1,
    labelDisposals: 3,
    textureDisposals: 1,
  });
  expect(errors).toEqual([]);
});
