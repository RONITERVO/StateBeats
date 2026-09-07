import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Session } from '@statebeats/sdk';

function wave(seconds = 20) {
  const rate = 16000,
    count = rate * seconds,
    bytes = Buffer.alloc(44 + count * 2);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(rate, 24);
  bytes.writeUInt32LE(rate * 2, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++)
    bytes.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 100 * i) / rate) * 14000), 44 + i * 2);
  return bytes;
}
test('perception preferences survive a reload and do not require audio to play', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    Object.assign(window, { audioAttempts: 0 });
    Object.defineProperty(window, 'AudioContext', {
      value: class {
        constructor() {
          const host = window as unknown as { audioAttempts: number };
          host.audioAttempts++;
          throw new Error('Audio deliberately unavailable in this fixture');
        }
      },
    });
  });
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#sound').click();
  await page.locator('#settings').click();
  await page.locator('#music-enabled').uncheck();
  await page.locator('#cues-enabled').uncheck();
  await page.locator('#reduced-motion').check();
  await page.locator('#high-contrast').check();
  await page.locator('#speed').selectOption('0.5');
  await page.reload();
  await expect(page.locator('#play')).toBeEnabled();
  await expect(page.locator('#sound')).toHaveText('Sound off');
  await page.locator('#settings').click();
  await expect(page.locator('#music-enabled')).not.toBeChecked();
  await expect(page.locator('#cues-enabled')).not.toBeChecked();
  await expect(page.locator('#captions-enabled')).toBeChecked();
  await expect(page.locator('#reduced-motion')).toBeChecked();
  await expect(page.locator('#high-contrast')).toBeChecked();
  await expect(page.locator('#speed')).toHaveValue('0.5');
  await page.locator('#close-settings').click();
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#pause').click();
  await page.locator('#resume').click();
  expect(
    await page.evaluate(() => (window as unknown as { audioAttempts: number }).audioAttempts),
  ).toBe(0);
  expect(errors).toEqual([]);
});

test('text player stays paused while reading and a keyboard user completes a real map', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.addInitScript(() => {
    HTMLCanvasElement.prototype.getContext = () => {
      throw new Error('Canvas deliberately unavailable');
    };
    Object.defineProperty(window, 'AudioContext', { value: undefined });
  });
  await page.goto('/text.html');
  await expect(page.locator('#title')).toHaveText('Agent arena');
  const initial = await page.locator('#score').textContent();
  await page.waitForTimeout(400);
  expect(await page.locator('#score').textContent()).toBe(initial);
  await page.locator('#next').focus();
  await page.keyboard.press('Enter');
  for (let i = 0; i < 8; i++) {
    const reach = page.getByRole('button', { name: 'Reach with left at beat' }).first();
    await expect(reach).toBeVisible();
    await reach.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#score')).toContainText(`${i + 1} hits`);
    if (i < 7) {
      await page.locator('#next').focus();
      await page.keyboard.press('Enter');
    }
  }
  await page.locator('#ticks').fill('10000');
  await page.locator('#advance').click();
  await expect(page.locator('#score')).toContainText('Complete');
  await expect(page.locator('#score')).toContainText('800 points');
  const download = page.waitForEvent('download');
  await page.locator('#replay').click();
  const file = await download,
    replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  expect(errors).toEqual([]);
});

test('local audio decodes, becomes a portable scene map, and plays through the simulation worker', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#import-panel summary').click();
  await page
    .locator('#song-file')
    .setInputFiles({ name: 'original-tone.wav', mimeType: 'audio/wav', buffer: wave() });
  await expect(page.locator('#import-status')).toContainText('is ready', { timeout: 20000 });
  const download = page.waitForEvent('download');
  await page.locator('#save-map').click();
  const file = await download,
    map = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect(map.music.source.name).toBe('original-tone.wav');
  expect(map.music.source.sha256).toMatch(/^[a-f0-9]{64}$/);
  expect(
    map.music.frames.some((frame: { features: { bass: number } }) => frame.features.bass > 0.1),
  ).toBe(true);
  expect(map.notes.length).toBeGreaterThan(4);
  expect(map.scene.objects[0].id).toBe('sun');
  await page.locator('#import-panel summary').click();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#close-settings').click();
  await page.locator('#watch').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  expect(errors).toEqual([]);
});

test('the moving-sun map renders, completes and exports matching headless gameplay', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.getByRole('button', { name: 'Chasing the sun', exact: true }).click();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#high-contrast').check();
  await page.locator('#close-settings').click();
  await page.locator('#watch').click();
  await expect(page.locator('#captions')).toContainText("o'clock");
  await page.screenshot({ path: 'artifacts/sunlit-journey.png' });
  await expect(page.locator('#results')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  const download = page.waitForEvent('download');
  await page.locator('#export-replay').click();
  const file = await download,
    replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  expect(errors).toEqual([]);
});
