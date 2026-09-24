import { expect, it } from 'vitest';
import { Session, standardActor } from '@statebeats/sdk';
import type { MapInput } from '@statebeats/sdk';

const admin = { role: 'admin' } as const;
const map = (custom: boolean): MapInput => ({
  version: 1,
  id: 'recording-integrity',
  title: 'Recording integrity',
  durationBeats: 4,
  tempo: [{ beat: 0, bpm: 120 }],
  notes: [
    {
      id: 'note',
      preset: 'left',
      beat: 2,
      position: [0, 1, -0.5],
      ...(custom ? { presentation: { guide: 'full', appearMs: 300, releaseMs: 800 } } : {}),
    },
  ],
});

for (const format of ['checkpoint', 'replay'] as const) {
  it.each([true, false])(
    `${format} rejects a removed hash even after all custom cues are stripped (custom=%s)`,
    async (custom) => {
      const session = await Session.create(map(custom), [standardActor()]);
      session.advance(60);
      const record =
        format === 'checkpoint' ? session.checkpoint(admin) : await session.exportReplay(admin);
      Reflect.deleteProperty(record, 'presentationHash');
      for (const note of record.map.notes) delete note.presentation;
      const result = 'world' in record ? Session.restore(record) : Session.verifyReplay(record);
      await expect(result).rejects.toMatchObject({ code: 'PRESENTATION_MISMATCH' });
    },
  );
}

it('rejects malformed or mismatched binding values for both recording APIs', async () => {
  const session = await Session.create(map(false));
  for (const hash of [null, '', false, {}, 'not-a-digest', '0'.repeat(64)]) {
    const checkpoint = session.checkpoint(admin),
      replay = await session.exportReplay(admin);
    Object.assign(checkpoint, { presentationHash: hash });
    Object.assign(replay, { presentationHash: hash });
    await expect(Session.restore(checkpoint)).rejects.toMatchObject({
      code: 'PRESENTATION_MISMATCH',
    });
    await expect(Session.verifyReplay(replay)).rejects.toMatchObject({
      code: 'PRESENTATION_MISMATCH',
    });
  }
});

it.each([true, false])(
  'existing version-1 exports with valid hashes still restore and verify (custom=%s)',
  async (custom) => {
    const session = await Session.create(map(custom), [standardActor()]);
    session.advance(60);
    const checkpoint = session.checkpoint(admin),
      replay = await session.exportReplay(admin);
    expect(checkpoint.version).toBe(1);
    expect(replay.version).toBe(1);
    expect(checkpoint.presentationHash).toMatch(/^[a-f0-9]{64}$/);
    expect(replay.presentationHash).toBe(checkpoint.presentationHash);
    const restored = await Session.restore(checkpoint);
    expect(restored.observe(admin)).toEqual(session.observe(admin));
    expect(await restored.exportReplay(admin)).toEqual(replay);
    expect(await Session.verifyReplay(replay)).toMatchObject({
      verified: true,
      stateHash: replay.finalStateHash,
      eventDigest: replay.eventDigest,
    });
  },
);
