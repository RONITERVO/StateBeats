import { EngineError, musicChannels } from './schema.js';
import type { MusicFeatures, MusicTimeline } from './schema.js';

export const SILENT_FEATURES: Readonly<MusicFeatures> = Object.freeze({
  energy: 0,
  subBass: 0,
  bass: 0,
  lowMid: 0,
  mid: 0,
  presence: 0,
  air: 0,
  rms: 0,
  flux: 0,
  transient: 0,
  beat: 0,
});
const unit = (value: number) => Math.max(0, Math.min(1, value));

/** Stored features are shared by every sense. Sampling is stateless and never advances time. */
export function sampleMusic(timeline: MusicTimeline | undefined, tick: number): MusicFeatures {
  if (!Number.isInteger(tick) || tick < 0 || tick > 2147483647)
    throw new EngineError('VALIDATION', 'Music sampling requires a nonnegative integer tick');
  const frames = timeline?.frames;
  if (!frames?.length || tick < frames[0].tick || tick > frames[frames.length - 1].tick)
    return { ...SILENT_FEATURES };
  let lo = 0,
    hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].tick <= tick) lo = mid;
    else hi = mid - 1;
  }
  const a = frames[lo],
    b = frames[lo + 1];
  if (!b || a.tick === tick) return { ...a.features };
  const amount = (tick - a.tick) / (b.tick - a.tick),
    result = { ...SILENT_FEATURES };
  for (const channel of musicChannels)
    result[channel] = a.features[channel] + (b.features[channel] - a.features[channel]) * amount;
  return result;
}

// Iterative radix-2 FFT, entirely local. Audio decoding is a host adapter's responsibility.
function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let i = 1, j = 0; i < size; i++) {
    let bit = size >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
    }
  }
  for (let length = 2; length <= size; length *= 2) {
    const angle = (-2 * Math.PI) / length,
      wr = Math.cos(angle),
      wi = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let ur = 1,
        ui = 0;
      for (let j = 0; j < length / 2; j++) {
        const even = start + j,
          odd = even + length / 2;
        const tr = real[odd] * ur - imaginary[odd] * ui,
          ti = real[odd] * ui + imaginary[odd] * ur;
        real[odd] = real[even] - tr;
        imaginary[odd] = imaginary[even] - ti;
        real[even] += tr;
        imaginary[even] += ti;
        const next = ur * wr - ui * wi;
        ui = ur * wi + ui * wr;
        ur = next;
      }
    }
  }
}

/** Bounded offline analysis at 20 frames/second. Persist the output; no analyzer is needed to play/replay it. */
export function analyzePcm(options: {
  samples: Float32Array;
  sampleRate: number;
  tickRate?: 60 | 120 | 240;
  startTick?: number;
}): MusicTimeline {
  const { samples, sampleRate } = options,
    tickRate = options.tickRate ?? 120,
    startTick = options.startTick ?? tickRate * 4;
  if (
    !(samples instanceof Float32Array) ||
    !Number.isInteger(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    ![60, 120, 240].includes(tickRate) ||
    !Number.isInteger(startTick) ||
    startTick < 0 ||
    startTick > 1000000 ||
    samples.length < 1 ||
    samples.length > sampleRate * 1800
  )
    throw new EngineError(
      'VALIDATION',
      'Expected mono PCM, 8–96 kHz, at most 30 minutes, and a valid tick rate/start',
    );
  for (const sample of samples)
    if (!Number.isFinite(sample) || Math.abs(sample) > 1)
      throw new EngineError('VALIDATION', 'PCM samples must be finite and normalized to [-1, 1]');
  const size = 2048,
    hop = Math.max(1, Math.round(sampleRate / 20));
  const real = new Float64Array(size),
    imaginary = new Float64Array(size),
    window = new Float64Array(size);
  const previous = new Float64Array(size / 2),
    edges = [20, 60, 250, 500, 2000, 6000, 20000];
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (size - 1));
  const frames: MusicTimeline['frames'] = [];
  let meanFlux = 0,
    envelope = 0,
    beat = 0,
    lastBeat = -sampleRate;
  for (let offset = 0; offset < samples.length; offset += hop) {
    let square = 0;
    imaginary.fill(0);
    for (let i = 0; i < size; i++) {
      const sample = samples[offset + i] ?? 0;
      square += sample * sample;
      real[i] = sample * window[i];
    }
    fft(real, imaginary);
    const bands = new Array<number>(6).fill(0);
    let flux = 0;
    for (let i = 1; i < size / 2; i++) {
      const magnitude = Math.sqrt(real[i] ** 2 + imaginary[i] ** 2) / size;
      flux += Math.max(0, magnitude - previous[i]);
      previous[i] = magnitude;
      const hz = (i * sampleRate) / size;
      for (let band = 0; band < 6; band++)
        if (hz >= edges[band] && hz < edges[band + 1]) {
          bands[band] += magnitude * magnitude;
          break;
        }
    }
    const rms = Math.sqrt(square / size),
      level = unit(rms * 2.5);
    envelope += (level - envelope) * (level > envelope ? 0.8 : 0.18);
    flux = unit(flux * 2);
    const trigger =
      flux > Math.max(0.025, meanFlux * 1.6) &&
      rms > 0.012 &&
      offset - lastBeat > sampleRate * 0.24;
    const transient = unit(Math.max(0, flux - meanFlux) * 3);
    meanFlux += (flux - meanFlux) * 0.12;
    if (trigger) lastBeat = offset;
    beat = trigger ? 1 : beat * 0.55;
    const [subBass, bass, lowMid, mid, presence, air] = bands.map((value) =>
      unit(Math.sqrt(value) * 4),
    );
    frames.push({
      tick: startTick + Math.round((offset / sampleRate) * tickRate),
      features: {
        energy: envelope,
        subBass,
        bass,
        lowMid,
        mid,
        presence,
        air,
        rms: unit(rms),
        flux,
        transient,
        beat,
      },
    });
  }
  frames.push({
    tick: startTick + Math.ceil((samples.length / sampleRate) * tickRate),
    features: { ...SILENT_FEATURES },
  });
  // A very short final hop can round to the previous tick; keep the explicit silent end marker.
  const unique = frames.filter(
    (frame, i) => i === frames.length - 1 || frame.tick < frames[i + 1].tick,
  );
  return { version: 1, tickRate, algorithm: 'statebeats/pcm-fft-v1', frames: unique };
}

export { generateMusicMap, musicGenerationSchema } from './choreography.js';
