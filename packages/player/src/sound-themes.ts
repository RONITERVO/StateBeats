import type { SpatialSoundRole, SpatialSoundSource } from '@statebeats/sdk';

/** Small procedural patches; hosts can also consume the same SDK frame in another audio backend. */
export interface SoundPatch {
  wave: 'sine' | 'triangle' | 'noise';
  frequency: number;
  endFrequency: number;
  filter: 'lowpass' | 'bandpass';
  filterHz: number;
  gain: number;
  pulseHz?: number;
  pulseDepth?: number;
}
export interface SoundTheme {
  id: string;
  roles: Record<SpatialSoundRole, string>;
  effects: Record<string, SoundPatch>;
}
const themes = new Map<string, SoundTheme>();
const effects = new Map<string, SoundPatch>();
/** Trusted host registration. No downloads, eval, or imports from map data. */
export function registerSoundTheme(input: SoundTheme): () => void {
  if (themes.has(input.id)) throw new Error(`Sound theme already registered: ${input.id}`);
  for (const [id, patch] of Object.entries(input.effects)) {
    if (id === 'statebeats/silent' || effects.has(id))
      throw new Error(`Sound effect already registered: ${id}`);
    for (const [value, low, high] of [
      [patch.frequency, 20, 12000],
      [patch.endFrequency, 20, 12000],
      [patch.filterHz, 40, 16000],
      [patch.gain, 0, 0.15],
      [patch.pulseHz ?? 0, 0, 30],
      [patch.pulseDepth ?? 0, 0, 1],
    ])
      if (!Number.isFinite(value) || value < low || value > high)
        throw new RangeError(`Invalid sound patch: ${id}`);
    if (
      !['sine', 'triangle', 'noise'].includes(patch.wave) ||
      !['lowpass', 'bandpass'].includes(patch.filter)
    )
      throw new TypeError(`Invalid sound patch: ${id}`);
  }
  for (const role of ['approach', 'materialize', 'hold', 'hazard'] as const)
    if (!input.effects[input.roles[role]] && !effects.has(input.roles[role]))
      throw new Error(`Missing sound role: ${role}`);
  const theme = Object.freeze({
    ...input,
    roles: Object.freeze({ ...input.roles }),
    effects: Object.freeze(
      Object.fromEntries(
        Object.entries(input.effects).map(([id, patch]) => [id, Object.freeze({ ...patch })]),
      ),
    ),
  });
  themes.set(theme.id, theme);
  for (const [id, patch] of Object.entries(theme.effects)) effects.set(id, patch);
  return () => {
    if (themes.get(theme.id) !== theme) return;
    themes.delete(theme.id);
    for (const [id, patch] of Object.entries(theme.effects))
      if (effects.get(id) === patch) effects.delete(id);
  };
}
const patch = (
  wave: SoundPatch['wave'],
  frequency: number,
  endFrequency: number,
  gain: number,
  filterHz = 2000,
  pulseHz = 0,
  pulseDepth = 0,
): SoundPatch => ({
  wave,
  frequency,
  endFrequency,
  gain,
  filter: wave === 'noise' ? 'bandpass' : 'lowpass',
  filterHz,
  pulseHz,
  pulseDepth,
});
registerSoundTheme({
  id: 'statebeats/neutral-v1',
  roles: {
    approach: 'statebeats/air',
    materialize: 'statebeats/shimmer',
    hold: 'statebeats/charge',
    hazard: 'statebeats/rumble',
  },
  effects: {
    'statebeats/air': patch('noise', 450, 1400, 0.06, 1300),
    'statebeats/shimmer': patch('sine', 740, 880, 0.025),
    'statebeats/charge': patch('triangle', 165, 220, 0.035, 1100, 3, 0.15),
    'statebeats/rumble': patch('noise', 70, 120, 0.09, 160, 4, 0.4),
  },
});
registerSoundTheme({
  id: 'statebeats/orbital-v1',
  roles: {
    approach: 'orbital/stream',
    materialize: 'orbital/appear',
    hold: 'orbital/arc',
    hazard: 'statebeats/rumble',
  },
  effects: {
    'orbital/stream': patch('noise', 480, 2100, 0.065, 2100, 2, 0.12),
    'orbital/appear': patch('sine', 554.37, 830.61, 0.025, 1600),
    'orbital/arc': patch('triangle', 138.59, 277.18, 0.04, 1100, 4, 0.22),
  },
});
registerSoundTheme({
  id: 'ink-battle/battlefield-v1',
  roles: {
    approach: 'ink-battle/whistle',
    materialize: 'ink-battle/steps',
    hold: 'statebeats/charge',
    hazard: 'statebeats/rumble',
  },
  effects: {
    'ink-battle/whistle': patch('noise', 1800, 850, 0.12, 2100),
    'ink-battle/steps': patch('noise', 110, 180, 0.14, 220, 3.5, 0.95),
    'ink-battle/meteor': patch('noise', 180, 700, 0.15, 700, 7, 0.2),
    'ink-battle/heavy': patch('triangle', 55, 95, 0.065, 420, 8, 0.2),
    'ink-battle/energy': patch('triangle', 320, 900, 0.035, 1700, 5, 0.2),
  },
});
export function resolveSound(
  themeId: string | undefined,
  source: SpatialSoundSource,
): { id: string; patch: SoundPatch } | undefined {
  if (source.effect === 'statebeats/silent' || (!themeId && !source.effect)) return;
  const theme = themes.get(themeId ?? '') ?? themes.get('statebeats/neutral-v1')!;
  const id = source.effect && effects.has(source.effect) ? source.effect : theme.roles[source.role];
  const selected = effects.get(id);
  return selected ? { id, patch: selected } : undefined;
}
