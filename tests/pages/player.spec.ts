import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Session } from '@statebeats/sdk';
import { sampleMaps } from '@statebeats/content';

test('Event Horizon loads its real soundtrack automatically, resumes in sync and completes on the public path', async ({
  page,
}) => {
  test.setTimeout(90000);
  const errors: string[] = [],
    soundtrackRequests: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
    if (response.url().endsWith('.mp3')) soundtrackRequests.push(response.url());
  });
  await page.addInitScript(() => {
    const host = window as unknown as {
      soundtrackStarts: { duration: number; offset: number; energy: number }[];
    };
    host.soundtrackStarts = [];
    const original = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (when = 0, offset = 0, duration?: number) {
      if (this.buffer && this.buffer.duration > 100) {
        const pcm = this.buffer.getChannelData(0);
        let energy = 0;
        for (let i = 0; i < pcm.length; i += 97) energy += pcm[i] * pcm[i];
        host.soundtrackStarts.push({ duration: this.buffer.duration, offset, energy });
      }
      if (duration === undefined) original.call(this, when, offset);
      else original.call(this, when, offset, duration);
    };
  });
  await page.goto('./?map=event-horizon-master');
  await expect(page.locator('[data-map="event-horizon-master"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.locator('#watch')).toBeEnabled();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#close-settings').click();
  await page.locator('#watch').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForFunction(
    () => Number.parseFloat(document.querySelector<HTMLElement>('#progress')!.style.width) > 30,
    {},
    { timeout: 30000 },
  );
  await page.screenshot({ path: 'artifacts/event-horizon-stage.png' });
  await page.locator('#pause').click();
  // The worker may deliver its last pre-pause frame after the click reaches the UI.
  await page.waitForTimeout(250);
  const paused = await page.locator('#progress').getAttribute('style');
  await page.waitForTimeout(250);
  expect(await page.locator('#progress').getAttribute('style')).toBe(paused);
  await page.locator('#resume').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 50000 });
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  const starts = await page.evaluate(
    () =>
      (
        window as unknown as {
          soundtrackStarts: { duration: number; offset: number; energy: number }[];
        }
      ).soundtrackStarts,
  );
  expect(starts.length).toBeGreaterThanOrEqual(2);
  expect(starts[0].duration).toBeCloseTo(160, 1);
  expect(starts[0].energy).toBeGreaterThan(100);
  expect(starts.at(-1)!.offset).toBeGreaterThan(45);
  expect(soundtrackRequests).toHaveLength(1);
  const download = page.waitForEvent('download');
  await page.locator('#export-replay').click();
  const file = await download;
  const replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  expect(errors).toEqual([]);
});
test('the built player works under the GitHub Pages project path with workers, guide and text entry', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('response', (response) => {
    if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`);
  });
  await page.goto('./');
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#maps button')).toHaveCount(sampleMaps.length);
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#player-height').fill('1.65');
  await page.locator('#room-scale').fill('1.2');
  await page.locator('#close-settings').click();
  await page.getByRole('button', { name: /Agent arena/ }).click();
  await page.locator('#watch').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  const download = page.waitForEvent('download');
  await page.locator('#export-replay').click();
  const file = await download;
  const replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  await page.goto('guide.html');
  await expect(page.getByRole('heading', { name: 'An engine for any player.' })).toBeVisible();
  await page.goto('text.html');
  await expect(page.getByRole('heading', { name: /StateBeats/ }).first()).toBeVisible();
  expect(errors).toEqual([]);
});
test('the production authoring worker rebuilds an expert map under the project path', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('./');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#import-panel > summary').click();
  await page.locator('#map-file').setInputFiles({
    name: 'phrases.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify(sampleMaps.find((map) => map.id === 'choreography-journey')),
    ),
  });
  await expect(page.locator('#regenerate-map')).toBeEnabled();
  await page.locator('#song-preset').selectOption('master');
  await page.locator('#regenerate-map').click();
  await expect(page.locator('#import-status')).toContainText('is ready');
  const download = page.waitForEvent('download');
  await page.locator('#save-map').click();
  const file = await download;
  const map = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(map.generation.settings.turnStyle).toBe('musical');
  expect(map.turns.events.length).toBeGreaterThan(0);
  expect(map.generation.settings.difficulty).toBe('master');
  await expect(page.locator('#save-generation-report')).toBeEnabled();
  await page.locator('#import-panel > summary').click();
  await page.getByRole('button', { name: 'Event Horizon — Master', exact: true }).click();
  await expect(page.locator('#save-generation-report')).toBeDisabled();
  await page.locator('[data-imported="true"]').click();
  await expect(page.locator('#save-generation-report')).toBeEnabled();
  await page.locator('#import-panel > summary').click();
  await page.screenshot({ path: 'artifacts/expert-settings.png' });
  expect(errors).toEqual([]);
});
