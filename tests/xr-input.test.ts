import { it, expect } from 'vitest';
import { controllerSamples } from '../packages/player/src/xr-input.js';
it('synthetic XR input binds handedness independently of controller array order and handles loss/reacquisition', () => {
  const right = {
    handedness: 'right',
    position: [1, 1, -1] as [number, number, number],
    orientation: [0, 0, 0, -2] as [number, number, number, number],
    tracked: true,
  };
  const left = { ...right, handedness: 'left', position: [-1, 1, -1] as [number, number, number] };
  const samples = controllerSamples([right, left]);
  expect(samples.map((s) => s.id)).toEqual(['left', 'right']);
  expect(samples[1].orientation).toEqual([0, 0, 0, 1]);
  expect(controllerSamples([{ ...right, tracked: false }]).every((s) => !s.tracked)).toBe(true);
  expect(controllerSamples([right])[1].tracked).toBe(true);
  expect(controllerSamples([{ ...right, position: [NaN, 0, 0] }])[1].tracked).toBe(false);
});
