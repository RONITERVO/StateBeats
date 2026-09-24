import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Session } from '@statebeats/sdk';
import { sampleMaps } from '@statebeats/content';
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
  expect(map.generation.settings.turnStyle).toBe('continuous');
  expect(map.generation.settings.difficulty).toBe('master');
  await page.screenshot({ path: 'artifacts/expert-settings.png' });
  expect(errors).toEqual([]);
});
