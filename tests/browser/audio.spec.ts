import { test, expect } from '@playwright/test';
test('hand beacons and targets pan with the head, stay bounded, and obey mute, tracking and pause', async ({
  page,
}) => {
  await page.goto('/conformance.html');
  await page.locator('#run-hands').click();
  await expect(page.locator('#hands-result')).toContainText('stopped');
  const results = JSON.parse((await page.locator('#hands-result').textContent())!);
  const get = (mode: string) => results.find((r: { mode: string }) => r.mode === mode);
  expect(get('left').energy[0]).toBeGreaterThan(get('left').energy[1] * 1.2);
  expect(get('right').energy[1]).toBeGreaterThan(get('right').energy[0] * 1.2);
  // Low-frequency HRTF level differences vary by browser; rotation must reverse the louder ear.
  expect(get('rotated').energy[1]).toBeGreaterThan(get('rotated').energy[0] * 1.05);
  expect(get('left').initial).toBe(2);
  expect(get('targets-only').initial).toBe(1);
  expect(get('both').initial).toBe(4);
  for (const mode of ['muted', 'master-muted', 'lost-tracking', 'paused']) {
    expect(get(mode).energy).toEqual([0, 0]);
    expect(get(mode).later).toBe(0);
  }
  expect(get('resume').later).toBe(2);
  expect(get('resume').energy[0]).toBeGreaterThan(0.001);
  expect(results.every((r: { stopped: number }) => r.stopped === 0)).toBe(true);
});
test('moving effects pan with targets and head direction; mix, pause and resume stay independent', async ({
  page,
}) => {
  await page.goto('/conformance.html');
  await page.locator('#run-spatial').click();
  await expect(page.locator('#spatial-result')).toContainText('stopped');
  const results = JSON.parse((await page.locator('#spatial-result').textContent())!);
  const get = (mode: string) => results.find((r: { mode: string }) => r.mode === mode);
  const moving = get('moving');
  expect(moving.first[0]).toBeGreaterThan(moving.first[1] * 1.2);
  if (moving.dynamic) expect(moving.last[1]).toBeGreaterThan(moving.last[0] * 1.2);
  expect(get('right').first[1]).toBeGreaterThan(get('right').first[0] * 1.2);
  expect(get('rotated').first[1]).toBeGreaterThan(get('rotated').first[0] * 1.2);
  expect(get('muted').first).toEqual([0, 0]);
  expect(get('muted').last).toEqual([0, 0]);
  expect(get('paused').last).toEqual([0, 0]);
  expect(get('paused').later).toBe(0);
  expect(get('resume').last[1]).toBeGreaterThan(get('resume').last[0] * 1.2);
  expect(get('guidance').first[0] + get('guidance').first[1]).toBeGreaterThan(0.001);
  expect(get('guidance').initial).toBe(0);
  expect(get('dense').initial).toBe(8);
  expect(get('dense').later).toBe(8);
  expect(results.every((r: { stopped: number }) => r.stopped === 0)).toBe(true);
});
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
  const [start, resume, paused, later, earlier] = JSON.parse(
    (await page.locator('#transport-result').textContent())!,
  );
  expect(start.early).toBe(0);
  expect(start.late).toBeCloseTo(0.027, 5);
  expect(resume.early).toBeCloseTo(0.081, 5);
  expect(resume.late).toBeCloseTo(0.081, 5);
  expect(paused).toEqual({ early: 0, late: 0 });
  expect(later.late).toBe(0);
  expect(earlier.early).toBeCloseTo(0.027, 5);
  expect(earlier.late).toBeCloseTo(0.081, 5);
});
