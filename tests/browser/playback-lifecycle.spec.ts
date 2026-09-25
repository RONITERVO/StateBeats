import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { Session } from '@statebeats/sdk';

test('late worker readiness and errors cannot resurrect a cancelled run or replace its successor', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    const testHost = window as unknown as {
      releaseOld?: () => void;
      blocked?: boolean;
      releaseReplay?: () => void;
    };
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        let held = false,
          released = false,
          replayReleased = false;
        this.addEventListener('message', (event) => {
          if (event.data.type === 'replay' && !replayReleased) {
            event.stopImmediatePropagation();
            testHost.releaseReplay = () => {
              replayReleased = true;
              this.dispatchEvent(new MessageEvent('message', { data: event.data }));
            };
          }
          if (event.data.type === 'ready' && event.data.loadId === 1 && !released) {
            event.stopImmediatePropagation();
            if (held) return;
            held = true;
            testHost.blocked = true;
            testHost.releaseOld = () => {
              released = true;
              this.dispatchEvent(new MessageEvent('message', { data: event.data }));
              this.dispatchEvent(
                new MessageEvent('message', {
                  data: { type: 'error', loadId: 1, message: 'obsolete load failed' },
                }),
              );
            };
          }
        });
      }
    } as typeof Worker;
  });
  await page.goto('/?map=tutorial');
  await expect(page.locator('#watch')).toBeEnabled();
  await page.locator('#settings').click();
  await page.locator('#speed').selectOption('4');
  await page.locator('#close-settings').click();
  await page.locator('#watch').click();
  await page.waitForFunction(() => (window as unknown as { blocked?: boolean }).blocked);
  await page.locator('#pause').click();
  await page.locator('#home').click();
  await expect(page.locator('#lobby')).toBeVisible();
  await page.getByRole('button', { name: 'Agent arena', exact: true }).click();
  await page.locator('#watch').click();
  await expect(page.locator('#map-label')).toHaveText('Agent arena');
  await expect
    .poll(async () =>
      Number.parseFloat(
        (await page.locator('#progress').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? '0',
      ),
    )
    .toBeGreaterThan(0);
  await page.locator('#pause').click();
  await page.evaluate(() => (window as unknown as { releaseOld(): void }).releaseOld());
  await expect(page.locator('#pause-panel')).toBeVisible();
  await expect(page.locator('#map-label')).toHaveText('Agent arena');
  await expect(page.locator('#error')).not.toContainText('obsolete');
  await page.locator('#resume').click();
  await expect(page.locator('#result-stats')).toContainText('800', { timeout: 30000 });
  await expect(page.locator('#result-detail')).toContainText('0 missed');
  await page.locator('#export-replay').click();
  await page.waitForFunction(
    () => (window as unknown as { releaseReplay?: () => void }).releaseReplay,
  );
  await page.locator('#results-home').click();
  await expect(page.locator('#lobby')).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.evaluate(() => (window as unknown as { releaseReplay(): void }).releaseReplay());
  const file = await downloading;
  expect(file.suggestedFilename()).toBe('statebeats-agent-arena-replay.json');
  const replay = JSON.parse(await readFile((await file.path())!, 'utf8'));
  expect((await Session.verifyReplay(replay)).verified).toBe(true);
  expect(errors).toEqual([]);
});

test('pausing while the soundtrack loads survives resource readiness until explicit resume', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const fetch = window.fetch.bind(window),
      testHost = window as unknown as { releaseAudio?: () => void };
    window.fetch = async (...args) => {
      const input = args[0],
        url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (url.includes('event-horizon') && url.includes('.mp3'))
        await new Promise<void>((resolve) => (testHost.releaseAudio = resolve));
      return fetch(...args);
    };
  });
  await page.goto('/?map=event-horizon-master');
  await expect(page.locator('#watch')).toBeEnabled();
  await page.locator('#watch').click();
  await page.waitForFunction(
    () => (window as unknown as { releaseAudio?: () => void }).releaseAudio,
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('#pause-panel')).toBeVisible();
  await page.evaluate(() => (window as unknown as { releaseAudio(): void }).releaseAudio());
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#engine-status')).toContainText('Engine ready');
  await expect(page.locator('#pause-panel')).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator('#progress')).toHaveAttribute('style', 'width: 0%;');
  await page.locator('#resume').click();
  await expect(page.locator('#pause-panel')).toBeHidden();
  await expect
    .poll(async () =>
      Number.parseFloat(
        (await page.locator('#progress').getAttribute('style'))?.match(/[\d.]+/)?.[0] ?? '0',
      ),
    )
    .toBeGreaterThan(0);
});
