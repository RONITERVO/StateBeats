import type { SpatialAudioFrame, SpatialSoundSource } from '@statebeats/sdk';
import { resolveSound } from './sound-themes.js';
import type { SoundPatch } from './sound-themes.js';

interface Voice {
  effect: string;
  source: OscillatorNode | AudioBufferSourceNode;
  filter: BiquadFilterNode;
  envelope: GainNode;
  panner: PannerNode;
  dispose(): void;
}
/** Bounded Web Audio backend for the portable, tick-sampled effects layer. */
export class SpatialSounds {
  private voices = new Map<string, Voice>();
  private tails = new Set<Voice>();
  private noise?: AudioBuffer;
  constructor(
    private context: BaseAudioContext,
    private output: AudioNode,
  ) {}
  get activeVoices() {
    return this.voices.size;
  }
  private noiseBuffer() {
    if (!this.noise) {
      this.noise = this.context.createBuffer(1, this.context.sampleRate, this.context.sampleRate);
      const data = this.noise.getChannelData(0);
      let seed = 97231;
      for (let i = 0; i < data.length; i++) {
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        data[i] = (seed >>> 0) / 2147483648 - 1;
      }
    }
    return this.noise;
  }
  private create(effect: string, patch: SoundPatch, s: SpatialSoundSource): Voice {
    const c = this.context;
    const source = patch.wave === 'noise' ? c.createBufferSource() : c.createOscillator();
    if ('buffer' in source) {
      source.buffer = this.noiseBuffer();
      source.loop = true;
    } else {
      source.type = patch.wave as OscillatorType;
      source.frequency.value = patch.frequency;
    }
    const filter = c.createBiquadFilter(),
      envelope = c.createGain(),
      panner = c.createPanner();
    filter.type = patch.filter;
    filter.frequency.value = patch.filterHz;
    filter.Q.value = patch.wave === 'noise' ? 2 : 0.7;
    envelope.gain.value = 0;
    panner.panningModel = 'HRTF';
    panner.distanceModel = 'inverse';
    panner.refDistance = 1;
    panner.maxDistance = 60;
    panner.rolloffFactor = 0.6;
    [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = s.position;
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(panner);
    panner.connect(this.output);
    let disposed = false;
    const voice: Voice = {
      effect,
      source,
      filter,
      envelope,
      panner,
      dispose: () => {
        if (disposed) return;
        disposed = true;
        try {
          source.stop();
        } catch {}
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
        panner.disconnect();
        this.tails.delete(voice);
      },
    };
    source.onended = voice.dispose;
    // Different deterministic offsets prevent a crowd of noise sources becoming correlated.
    if ('buffer' in source) {
      let hash = 0;
      for (const ch of s.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
      source.start(c.currentTime, (hash % 1000) / 1000);
    } else source.start();
    return voice;
  }
  update(frame: SpatialAudioFrame) {
    const chosen = frame.sources.slice(0, 8).flatMap((s) => {
      const sound = resolveSound(frame.theme, s);
      return sound ? [{ s, ...sound }] : [];
    });
    const now = this.context.currentTime;
    const wanted = new Map(chosen.map((s) => [s.s.id, s.id]));
    for (const [id, voice] of this.voices)
      if (wanted.get(id) !== voice.effect) {
        this.voices.delete(id);
        // At most eight short release tails, even if an author changes IDs every frame.
        if (this.tails.size >= 8) this.tails.values().next().value!.dispose();
        this.tails.add(voice);
        voice.envelope.gain.cancelScheduledValues(now);
        voice.envelope.gain.setTargetAtTime(0, now, 0.008);
        voice.source.stop(now + 0.04);
      }
    const normalization = 1 / Math.sqrt(Math.max(1, chosen.length));
    for (const { s, id, patch } of chosen) {
      let voice = this.voices.get(s.id);
      if (!voice) {
        voice = this.create(id, patch, s);
        this.voices.set(s.id, voice);
      }
      const smooth = (param: AudioParam, value: number) => {
        param.cancelScheduledValues(now);
        param.setTargetAtTime(value, now, 0.012);
      };
      const frequency = patch.frequency * (patch.endFrequency / patch.frequency) ** s.progress;
      if ('frequency' in voice.source) smooth(voice.source.frequency, frequency);
      else smooth(voice.filter.frequency, frequency);
      const pulse =
        1 -
        (patch.pulseDepth ?? 0) *
          (0.5 + 0.5 * Math.cos(2 * Math.PI * (patch.pulseHz ?? 0) * s.elapsedSeconds));
      smooth(voice.envelope.gain, patch.gain * s.intensity * pulse * normalization);
      smooth(voice.panner.positionX, s.position[0]);
      smooth(voice.panner.positionY, s.position[1]);
      smooth(voice.panner.positionZ, s.position[2]);
    }
  }
  stop() {
    for (const voice of [...this.voices.values(), ...this.tails]) voice.dispose();
    this.voices.clear();
    this.tails.clear();
  }
}
