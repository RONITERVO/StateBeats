import { describe, expect, it } from 'vitest';
import { Playback } from '../packages/player/src/playback.js';
import { TrackingGuard } from '../packages/player/src/xr-tracking.js';
import { controllerSamples } from '../packages/player/src/xr-input.js';

describe('player transport state', () => {
  it.each(['audio', 'worker', 'scene'] as const)(
    'preserves a pause during %s preparation until an explicit resume',
    (stage) => {
      const p = new Playback(),
        id = p.begin('map', false);
      if (stage !== 'audio') p.audioReady(id);
      if (stage === 'scene') p.workerReady(id);
      expect(p.canPause).toBe(true);
      p.pause();
      expect(p.canPause).toBe(false);
      expect(p.running).toBe(false);
      expect(p.acceptsInput).toBe(false);
      if (stage === 'audio') p.audioReady(id);
      if (stage !== 'scene') p.workerReady(id);
      expect(p.sceneReady(id)).toBe(true);
      expect(p.state.phase).toBe('paused');
      p.resume();
      expect(p.running).toBe(true);
      expect(p.acceptsInput).toBe(true);
    },
  );
  it('invalidates delayed resources, ready messages and errors after Home or a replacement load', () => {
    const p = new Playback(),
      old = p.begin('old', true);
    p.audioReady(old);
    p.home();
    expect(p.workerReady(old)).toBe(false);
    expect(p.fail(old)).toBe(false);
    const current = p.begin('current', false);
    p.audioReady(current);
    expect(p.workerReady(old)).toBe(false);
    expect(p.workerReady(current)).toBe(true);
    expect(p.sceneReady(old)).toBe(false);
    expect(p.sceneReady(current)).toBe(true);
    expect(p.mapId).toBe('current');
    expect(p.autoplay).toBe(false);
  });
  it('rejects out-of-order/duplicate completions and cannot resume an ended or failed run', () => {
    const p = new Playback(),
      id = p.begin('map', true);
    expect(p.sceneReady(id)).toBe(false);
    expect(p.workerReady(id)).toBe(false);
    p.audioReady(id);
    p.workerReady(id);
    p.sceneReady(id);
    expect(p.workerReady(id)).toBe(false);
    expect(p.acceptsInput).toBe(false);
    expect(p.finish(id)).toBe(true);
    expect(p.finish(id)).toBe(false);
    expect(p.fail(id)).toBe(false);
    p.resume();
    expect(p.state.phase).toBe('ended');
    const next = p.begin('next', false);
    p.fail(next);
    expect(p.fail(next)).toBe(false);
    p.resume();
    expect(p.state.phase).toBe('error');
    expect(p.sceneReady(next)).toBe(false);
    expect(p.resumable).toBe(false);
  });
});

describe('XR tracking interruption', () => {
  const controller = (handedness: string) => ({
    handedness,
    position: [0, 1, -1] as [number, number, number],
    orientation: [0, 0, 0, 1] as [number, number, number, number],
    tracked: true,
  });
  it.each([[], [controller('left')], [controller('right')]].map((connected) => ({ connected })))(
    'invalidates missing hands and pauses after the grace period',
    ({ connected }) => {
      const samples = controllerSamples(connected);
      expect(samples).toHaveLength(2); // The reviewed adapter already supplies explicit missing-hand samples.
      expect(samples.some((s) => !s.tracked && !s.active)).toBe(true);
      const guard = new TrackingGuard();
      expect(guard.interrupted(100, true, samples)).toBe(false);
      expect(guard.interrupted(349, true, samples)).toBe(false);
      expect(guard.interrupted(350, true, samples)).toBe(true);
    },
  );
  it('also rejects incomplete raw sample arrays, handles head loss and resets after reacquisition', () => {
    const guard = new TrackingGuard(),
      both = controllerSamples([controller('right'), controller('left')]);
    guard.interrupted(0, true, []);
    expect(guard.interrupted(250, true, both.slice(0, 1))).toBe(true);
    expect(guard.interrupted(260, true, both)).toBe(false);
    expect(guard.interrupted(270, false, both)).toBe(false);
    expect(guard.interrupted(520, false, both)).toBe(true);
    guard.reset();
    expect(guard.interrupted(900, false, both)).toBe(false);
  });
});
