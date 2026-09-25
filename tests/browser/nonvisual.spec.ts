import { test, expect } from '@playwright/test';
test('audio-led setup selects the shared tutorial, persists preferences, and offers keyboard-only menu control', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Exercise the documented speech-unavailable fallback instead of using the machine's voices.
  await page.addInitScript(() =>
    Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true }),
  );
  await page.goto('/');
  await page.locator('#audio-setup-open').click();
  await expect(page.locator('#speech-support')).toContainText('no speech synthesis');
  await page.locator('#audio-enable').click();
  await page.locator('#audio-tutorial').click();
  await expect(page.locator('#selected-description')).toContainText('one-minute');
  await page.screenshot({ path: 'artifacts/nonvisual-setup.png' });
  await page.locator('#audio-setup-close').click();
  await page.keyboard.press('Alt+m');
  await expect(page.locator('#spoken-choice')).toContainText('Play Finding the pulse');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#spoken-choice')).toContainText('recenter and restart');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('Enter');
  await expect(page.locator('#hud')).toBeVisible();
  await expect(page.locator('#spoken-menu')).not.toBeVisible();
  await page.locator('#pause').click();
  await expect(page.locator('#spoken-choice')).toContainText('Resume');
  const score = await page.locator('#score').textContent();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#score')).toHaveText(score!);
  await page.reload();
  await page.locator('#settings').click();
  await expect(page.locator('#nonvisual-enabled')).toBeChecked();
  await expect(page.locator('#narration-enabled')).toBeChecked();
  expect(errors).toEqual([]);
});
test('the text player opens the same tutorial and exposes shared hand guidance without advancing automatically', async ({
  page,
}) => {
  await page.goto('/text.html?map=finding-the-pulse');
  await expect(page.locator('#map')).toHaveValue('finding-the-pulse');
  await expect(page.locator('#json')).toContainText('handGuidance');
  await expect(page.locator('#json')).toContainText('"tick": 0');
  await page.locator('#next').click();
  await expect(page.locator('#targets')).toContainText('left hand');
  // Reach left/right/either/two-hand targets through the same manual actor; then follow the moving holds.
  for (const [i, hand] of [
    'left',
    'left',
    'right',
    'right',
    'left',
    'left',
    'both',
    'left',
    'right',
  ].entries()) {
    while (!(await page.locator('#targets article').count())) await page.locator('#next').click();
    await page
      .locator('#targets article')
      .first()
      .getByRole('button', { name: `Reach with ${hand} at beat`, exact: true })
      .click();
    if (i >= 7) await page.getByRole('button', { name: 'Follow this hold (assisted)' }).click();
  }
  await expect(page.locator('#score')).toContainText('9 hits');
  await expect(page.locator('#error')).toHaveText('');
});
