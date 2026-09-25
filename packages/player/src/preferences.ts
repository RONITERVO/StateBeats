export interface PlayerPreferences {
  sound: boolean;
  music: boolean;
  cues: boolean;
  effects: boolean;
  nonvisual: boolean;
  narration: boolean;
  handBeacons: 'off' | 'active' | 'always';
  musicVolume: number;
  guidanceVolume: number;
  effectsVolume: number;
  captions: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  swapHands: boolean;
  audioOnly: boolean;
  speed: number;
  offsetMs: number;
  playerHeight: number;
  roomScale: number;
}
const key = 'statebeats/preferences/v1';
export function readPreferences(): PlayerPreferences {
  const defaults: PlayerPreferences = {
    sound: true,
    music: true,
    cues: true,
    effects: true,
    nonvisual: false,
    narration: false,
    handBeacons: 'active',
    musicVolume: 1,
    guidanceVolume: 0.35,
    effectsVolume: 0.75,
    captions: true,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    highContrast: matchMedia('(prefers-contrast: more)').matches,
    swapHands: false,
    audioOnly: false,
    speed: 1,
    offsetMs: 0,
    playerHeight: 1.65,
    roomScale: 1,
  };
  try {
    const stored = JSON.parse(localStorage.getItem(key) ?? 'null');
    if (!stored || typeof stored !== 'object') return defaults;
    for (const name of [
      'sound',
      'music',
      'cues',
      'effects',
      'nonvisual',
      'narration',
      'captions',
      'reducedMotion',
      'highContrast',
      'swapHands',
      'audioOnly',
    ] as const)
      if (typeof stored[name] === 'boolean') defaults[name] = stored[name];
    if ([0.5, 1, 1.5, 2, 4].includes(stored.speed)) defaults.speed = stored.speed;
    if (['off', 'active', 'always'].includes(stored.handBeacons))
      defaults.handBeacons = stored.handBeacons;
    if (
      typeof stored.offsetMs === 'number' &&
      Number.isFinite(stored.offsetMs) &&
      stored.offsetMs >= -100 &&
      stored.offsetMs <= 100
    )
      defaults.offsetMs = stored.offsetMs;
    for (const [name, low, high] of [
      ['playerHeight', 1, 2.3],
      ['roomScale', 0.5, 1.75],
      ['musicVolume', 0, 1],
      ['guidanceVolume', 0, 1],
      ['effectsVolume', 0, 1],
    ] as const)
      if (
        typeof stored[name] === 'number' &&
        Number.isFinite(stored[name]) &&
        stored[name] >= low &&
        stored[name] <= high
      )
        defaults[name] = stored[name];
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
