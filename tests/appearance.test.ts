import { expect, it } from 'vitest';
import { Mesh } from 'three';
import { Session, standardActor } from '@statebeats/sdk';
import { createAppearance, registerAppearance } from '../packages/player/src/appearances.js';
import '../examples/community-appearance.js';

it('a community mole appearance is attached and disposed without changing a ground target or its scoring', async () => {
  const session = await Session.create(
    {
      version: 1,
      id: 'mole',
      title: 'Mole',
      durationBeats: 4,
      tempo: [{ beat: 0, bpm: 120 }],
      notes: [
        {
          id: 'mole',
          preset: 'left',
          beat: 2,
          position: [0, 0.15, -0.8],
          appearance: 'community/mole',
          label: 'Ground mole',
        },
      ],
    },
    [standardActor()],
  );
  session.advance(1);
  const view = session.observe({ role: 'admin' }),
    target = view.entities[0],
    before = JSON.stringify(target);
  const appearance = createAppearance(target, 0xffffff)!;
  expect(appearance.object.children).toHaveLength(2);
  appearance.update!(target, view, { reducedMotion: false, highContrast: false });
  expect(appearance.object.position.y).toBeLessThan(0);
  expect(JSON.stringify(target)).toBe(before);
  session.client({ role: 'player', actorId: 'player' }).submit('reach', [
    {
      id: 'reach',
      tick: 120,
      type: 'pose',
      actorId: 'player',
      effectorId: 'left',
      position: [0, 0.15, -0.8],
    },
  ]);
  session.advance(120);
  expect(session.snapshot().scores[0].hits).toBe(1);
  let disposed = 0;
  for (const object of appearance.object.children) {
    if (object instanceof Mesh) object.geometry.addEventListener('dispose', () => disposed++);
  }
  appearance.dispose();
  expect(disposed).toBe(2);
  session.close();
});
it('appearance IDs require host registration and unknown IDs use the default representation', () => {
  expect(createAppearance({ appearance: 'community/unknown' } as never, 0xffffff)).toBeUndefined();
  const remove = registerAppearance('test/scoped', () => {
    throw new Error('Unused');
  });
  expect(() =>
    registerAppearance('test/scoped', () => {
      throw new Error('Unused');
    }),
  ).toThrow('already registered');
  remove();
  expect(createAppearance({ appearance: 'test/scoped' } as never, 0xffffff)).toBeUndefined();
});
