import { test, expect } from '@playwright/test';
test('real Web Audio rendering produces non-silent spatial cues', async ({ page }) => {
  await page.goto('/conformance.html');
  await page.locator('#run-audio').click();
  await expect(page.locator('#audio-result')).toContainText('energy');
  const result = JSON.parse((await page.locator('#audio-result').textContent())!);
  expect(result.samples).toBe(48000);
  expect(result.energy[0]).toBeGreaterThan(0.001);
  expect(result.energy[1]).toBeGreaterThan(0.001);
});
test('imported audio honors a tick-aligned lead-in, resumes at the correct song offset and stops on pause', async ({
  page,
}) => {
  await page.goto('/conformance.html');
  await page.locator('#run-transport').click();
  await expect(page.locator('#transport-result')).toContainText('late');
  const [start, resume, paused] = JSON.parse(
    (await page.locator('#transport-result').textContent())!,
  );
  expect(start.early).toBe(0);
  expect(start.late).toBeCloseTo(0.027, 5);
  expect(resume.early).toBeCloseTo(0.081, 5);
  expect(resume.late).toBeCloseTo(0.081, 5);
  expect(paused).toEqual({ early: 0, late: 0 });
});
