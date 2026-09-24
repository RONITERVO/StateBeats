import { test, expect } from '@playwright/test';
import { conformance } from '../../examples/conformance.mjs';
test('compiled replay, checkpoint continuation and geometry match Node', async ({ page }) => {
  // Includes the full 160-second Master composition and its held-path recordings.
  test.setTimeout(180000);
  const { recordings, ...expected } = await conformance();
  await page.goto('/conformance.html');
  await page.locator('#recordings').fill(JSON.stringify(recordings));
  await page.locator('#run').click();
  await expect(page.locator('#result')).toContainText('results', { timeout: 90000 });
  expect(JSON.parse((await page.locator('#result').textContent())!)).toEqual(expected);
});
