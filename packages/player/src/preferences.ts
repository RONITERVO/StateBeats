export interface PlayerPreferences {
  sound: boolean;
  music: boolean;
  cues: boolean;
  captions: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  swapHands: boolean;
  audioOnly: boolean;
  speed: number;
  offsetMs: number;
}
const key = 'statebeats/preferences/v1';
export function readPreferences(): PlayerPreferences {
  const defaults: PlayerPreferences = {
    sound: true,
    music: true,
    cues: true,
    captions: true,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: matchMedia('(prefers-contrast: more)').matches,
    swapHands: false,
    audioOnly: false,
    speed: 1,
    offsetMs: 0,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!stored || typeof stored !== 'object') return defaults;
    for (const name of [
      'sound',
      'music',
      'cues',
      'captions',
      'reducedMotion',
      'highContrast',
      'swapHands',
      'audioOnly',
    ] as const)
      if (typeof stored[name] === 'boolean') defaults[name] = stored[name];
    if ([0.5, 1, 1.5, 2, 4].includes(stored.speed)) defaults.speed = stored.speed;
    if (
      typeof stored.offsetMs === 'number' &&
      Number.isFinite(stored.offsetMs) &&
      stored.offsetMs >= -100 &&
      stored.offsetMs <= 100
    )
      defaults.offsetMs = stored.offsetMs;
  } catch {
    /* Restricted storage does not prevent play. */
  }
  return defaults;
}
export function storePreferences(preferences: PlayerPreferences) {
  try {
    localStorage.setItem(key, JSON.stringify(preferences));
  } catch {
    /* Optional persistence. */
  }
}
