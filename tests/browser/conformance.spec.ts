import { test, expect } from '@playwright/test';
import { conformance } from '../../examples/conformance.mjs';
import { Session } from '@statebeats/sdk';
import { resolve } from 'node:path';

test('stripped presentation bindings are rejected for checkpoints and replays', async ({
  page,
}) => {
  const session = await Session.create({
    version: 1,
    id: 'recording-binding',
    title: 'Recording binding',
    durationBeats: 4,
    tempo: [{ beat: 0, bpm: 120 }],
    notes: [
      {
        id: 'note',
        preset: 'left',
        beat: 2,
        position: [0, 1, -1],
        presentation: { guide: 'full', appearMs: 300 },
      },
    ],
  });
  session.advance(60);
  const checkpoint = session.checkpoint({ role: 'admin' });
  const replay = await session.exportReplay({ role: 'admin' });
  await page.goto('/conformance.html');
  const result = await page.evaluate(
    async ({ checkpoint, replay, path }) => {
      const { Session } = await import(path);
      const errors = [];
      for (const record of [checkpoint, replay]) {
        Reflect.deleteProperty(record, 'presentationHash');
        for (const note of record.map.notes) delete note.presentation;
        try {
          if ('world' in record) await Session.restore(record);
          else await Session.verifyReplay(record);
          errors.push('accepted');
        } catch (error) {
          errors.push((error as { code?: string }).code);
        }
      }
      return errors;
    },
    {
      checkpoint,
      replay,
      path: '/@fs/' + resolve('packages/sdk/dist/index.js').replaceAll('\\', '/'),
    },
  );
  expect(result).toEqual(['PRESENTATION_MISMATCH', 'PRESENTATION_MISMATCH']);
});
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
