import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Session } from '@statebeats/sdk';

test('desktop input reaches an authored target at a different depth through ordinary poses', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#import-panel > summary').click();
  const map = {
    version: 1,
    id: 'near-target',
    title: 'Near target',
    tempo: [{ beat: 0, bpm: 120 }],
    durationBeats: 10,
    notes: [
      {
        id: 'near',
        beat: 5,
        preset: 'left',
        position: [0, 1.65, -0.35],
        shape: { kind: 'sphere', radius: 0.08 },
        earlyMs: 150,
        lateMs: 150,
        leadMs: 2000,
      },
    ],
  };
  await page.locator('#map-file').setInputFiles({
    name: 'near.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(map)),
  });
  await expect(page.locator('#import-status')).toContainText('Near target is ready');
  await page.locator('#import-panel > summary').click();
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.waitForTimeout(650);
  await page.mouse.move(640, 360);
  await page.mouse.down({ button: 'left' });
  await expect(page.locator('#score')).not.toHaveText('0');
  await page.mouse.up({ button: 'left' });
});
test('browser worker plays, pauses, exports a verified replay and restarts', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#close-settings').click();
  await page.getByRole('button', { name: /Agent arena/ }).click();
  await page.locator('#watch').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.locator('#pause').click();
  await expect(page.locator('#pause-panel')).toBeVisible();
  const score = await page.locator('#score').textContent();
  await page.waitForTimeout(300);
  expect(await page.locator('#score').textContent()).toBe(score);
  await page.locator('#resume').click();
  await expect(page.locator('#results')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#result-stats')).toContainText('800');
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  const download = page.waitForEvent('download');
  await page.locator('#export-replay').click();
  const file = await download;
  const replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  await page.locator('#again').click();
  await expect(page.locator('#results')).toBeHidden();
  await page.locator('#pause').click();
  await page.locator('#home').click();
  await expect(page.locator('#lobby')).toBeVisible();
  expect(errors).toEqual([]);
});
test('desktop mouse input earns a hit and finishes a real sequence', async ({ page }) => {
  // Hold input during a slow real-worker load. It must survive until the clock starts.
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        let readyCount = 0;
        this.addEventListener('message', (event) => {
          if (event.data.type === 'ready' && ++readyCount === 2) {
            event.stopImmediatePropagation();
            setTimeout(
              () => this.dispatchEvent(new MessageEvent('message', { data: event.data })),
              1000,
            );
          }
        });
      }
    };
  });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto('/');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#close-settings').click();
  await page.getByRole('button', { name: /Agent arena/ }).click();
  await page.locator('#play').click();
  await expect(page.locator('#hud')).toBeVisible();
  await page.mouse.move(640, 537);
  await page.mouse.down({ button: 'left' });
  await expect(page.locator('#score')).not.toHaveText('0');
  await page.mouse.up({ button: 'left' });
  await expect(page.locator('#results')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('#mode-label')).toHaveText('DESKTOP SESSION');
});
