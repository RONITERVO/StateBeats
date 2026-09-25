/** Import this module once from your browser host, then use audio.theme = 'community/crystal-v1'. */
import { registerSoundTheme } from '../packages/player/src/sound-themes.js';

export const unregisterCrystalSound = registerSoundTheme({
  id: 'community/crystal-v1',
  roles: {
    approach: 'community/crystal',
    materialize: 'statebeats/shimmer',
    hold: 'statebeats/charge',
    hazard: 'statebeats/rumble',
  },
  effects: {
    'community/crystal': {
      wave: 'sine',
      frequency: 392,
      endFrequency: 784,
      filter: 'lowpass',
      filterHz: 1400,
      gain: 0.04,
      pulseHz: 2,
      pulseDepth: 0.15,
    },
  },
});
// An individual note can also use sound: { effect: 'community/crystal', gain: 0.7 }.
// Neither selection changes its collision shape, timing, trajectory or score.
