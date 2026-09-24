import { test, expect } from '@playwright/test';
import { Session, standardActor, scriptedCommands, fitMapToPlayer } from '@statebeats/sdk';
import { inkBattleMap, inkEncounters, inkHeading } from '@statebeats/ink-battle';
import { sampleMap } from '@statebeats/content';
import { resolve } from 'node:path';
const fixture = '/@fs/' + resolve('tests/browser/fixtures/ink-battle.ts').replaceAll('\\', '/');

test('six book chapters render aligned heads, real armies and bounded instancing after backward seeking', async ({
  page,
}, testInfo) => {
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  await page.setViewportSize({ width: 1280, height: 850 });
  await page.goto('/conformance.html');
  const session = await Session.create(
    fitMapToPlayer(inkBattleMap(), { height: 1.65, roomScale: 1.2 }),
    [standardActor()],
  );
  const commands = scriptedCommands(session.program);
  for (let i = 0; i < commands.length; i += 1024)
    session.submit({ role: 'admin' }, `batch-${i}`, commands.slice(i, i + 1024));
  const frames = [];
  for (let age = 0; age < 6; age++) {
    const melee = inkEncounters().find(
      (e) => e.age === age && e.kind === 'melee' && e.beat > 12 + age * 64,
    )!;
    const tick = Math.round(melee.beat * 60) - 28;
    session.advance(tick - session.tick);
    frames.push(session.observe({ role: 'admin' }));
  }
  for (const [i, view] of [...frames, frames[0]].entries()) {
    const data = await page.evaluate(
      async ({ fixture, view, heading }) => {
        const module = await import(fixture);
        return module.renderInk(view, heading);
      },
      { fixture, view, heading: inkHeading(view.tick / 60) },
    );
    expect(data.overflow).toBe(0);
    expect(data.maxOverflow).toBe(0);
    expect(data.bodiesVisible).toBe(0);
    expect(data.offsets.length).toBeGreaterThan(0);
    for (const offset of data.offsets)
      for (const axis of offset) expect(Math.abs(axis)).toBeLessThan(1e-8);
    expect(data.units).toBeGreaterThan(0);
    expect(data.draws).toBeLessThan(160);
    expect(data.triangles).toBeLessThan(450000);
    await page.screenshot({ path: testInfo.outputPath(`chapter-${i}.png`) });
    console.log(`INK ${i}: ${JSON.stringify(data)}`);
  }
  await page.evaluate(
    async ({ fixture, view }) => (await import(fixture)).renderInk(view, 0, true),
    { fixture, view: frames[1] },
  );
  await page.screenshot({ path: testInfo.outputPath('book-overview.png') });
  const other = await Session.create(sampleMap('tutorial'), [standardActor()]);
  const clean = other.observe({ role: 'admin' });
  const memory = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(async ({ fixture, view }) => (await import(fixture)).renderInk(view), {
      fixture,
      view: frames[0],
    });
    memory.push(
      await page.evaluate(async ({ fixture, view }) => (await import(fixture)).clearInk(view), {
        fixture,
        view: clean,
      }),
    );
  }
  expect(memory[2]).toEqual(memory[0]);
  expect(errors).toEqual([]);
  session.close();
  other.close();
});
