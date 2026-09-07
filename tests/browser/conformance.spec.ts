import { test, expect } from '@playwright/test';
import { conformance } from '../../examples/conformance.mjs';
test('compiled replay, checkpoint continuation and geometry match Node', async ({ page }) => {
  const { recordings, ...expected } = await conformance();
  await page.goto('/conformance.html');
  await page.locator('#recordings').fill(JSON.stringify(recordings));
  await page.locator('#run').click();
  await expect(page.locator('#result')).toContainText('results');
  expect(JSON.parse((await page.locator('#result').textContent())!)).toEqual(expected);
});
