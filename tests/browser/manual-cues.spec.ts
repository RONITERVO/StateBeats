import { test, expect } from '@playwright/test';
import { Session } from '@statebeats/sdk';

for (const earlyMs of [0, 100]) {
  test(`manual next cue preserves preview, preparation and eligibility (${earlyMs} ms early window)`, async ({
    page,
  }) => {
    const map = {
      version: 1,
      id: 'manual-readiness',
      title: 'Manual readiness',
      tempo: [{ beat: 0, bpm: 120 }],
      durationBeats: 8,
      notes: [
        {
          id: 'target',
          preset: 'left',
          beat: 6,
          earlyMs,
          leadMs: 2000,
          position: [0, 1.4, -0.4],
          presentation: { readiness: { preview: { ms: 500 }, prepare: { ms: 100 } } },
        },
      ],
    };
    const session = await Session.create(map);
    const target = session.program.entities[0];
    session.advance(target.spawnTick);
    const cue = session.observe({ role: 'admin' }).entities[0].presentation!;
    await page.goto('/text.html');
    await expect(page.locator('#title')).toHaveText('Agent arena');
    await page.locator('#file').setInputFiles({
      name: 'manual-readiness.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(map)),
    });
    await expect(page.locator('#title')).toHaveText('Manual readiness');
    const steps = [
      { tick: target.spawnTick, text: null },
      { tick: cue.readiness!.previewTick, text: 'Upcoming reach' },
      { tick: cue.readiness!.prepareTick, text: 'Prepare to reach' },
      { tick: cue.readyTick, text: 'Reach target' },
      ...(earlyMs ? [{ tick: target.hitTick, text: 'Reach target' }] : []),
    ];
    for (const { tick, text } of steps) {
      await page.locator('#next').focus();
      await page.keyboard.press('Enter');
      await expect
        .poll(async () => JSON.parse((await page.locator('#json').textContent())!).tick)
        .toBe(tick);
      if (text) await expect(page.locator('#targets')).toContainText(text);
      else await expect(page.locator('#targets article')).toHaveCount(0);
    }
    await expect(page.locator('#error')).toHaveText('');
    session.close();
  });
}
