import type { Vec3, Quat } from '@statebeats/core';
import { quaternion } from '@statebeats/core';
import type { HandSample } from './protocol.js';
export interface TrackedController {
  handedness: string;
  position: Vec3;
  orientation: Quat;
  tracked: boolean;
}
/** Device-independent WebXR handedness and grip poses; no gamepad button indices. */
export function controllerSamples(controllers: readonly TrackedController[]): HandSample[] {
  return ['left', 'right'].map((id) => {
    const c = controllers.find((c) => c.handedness === id);
    if (c?.tracked && c.position.every(Number.isFinite)) {
      try {
        return {
          id,
          position: [...c.position] as Vec3,
          orientation: quaternion(c.orientation),
          tracked: true,
          active: true,
        };
      } catch {}
    }
    return {
      id,
      position: [0, 0, 0] as Vec3,
      orientation: [0, 0, 0, 1] as Quat,
      tracked: false,
      active: false,
    };
  });
}
