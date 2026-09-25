import type { DomainEvent, Vec3 } from '@statebeats/core';
import type { Observation } from '@statebeats/sdk';
import { beatToTick, beatValue, sampleSpatialAudio, describeHandGuidance } from '@statebeats/sdk';
import type { HandGuidanceFrame } from '@statebeats/sdk';
import { HandAudio } from './hand-audio.js';
import type { HandBeaconMode } from './hand-audio.js';
import type { MapDefinition } from '@statebeats/sdk';
import { SpatialSounds } from './spatial-sounds.js';
export interface AudioMix {
  music: number;
  guidance: number;
  effects: number;
}
export const DEFAULT_AUDIO_MIX: Readonly<AudioMix> = Object.freeze({
  music: 1,
  guidance: 0.35,
  effects: 0.75,
});
/** Real audio perception: spatial target cues, front/back rhythm, height pitch and outcomes. */
export class RhythmAudio {
  private context?: AudioContext | OfflineAudioContext;
  constructor(
    private createContext: () => AudioContext | OfflineAudioContext = () =>
      new AudioContext({ latencyHint: 'interactive' }),
  ) {}
  private gain?: GainNode;
  private musicBus?: GainNode;
  private guidanceBus?: GainNode;
  private effectsBus?: GainNode;
  private spatial?: SpatialSounds;
  private handAudio?: HandAudio;
  nonvisualEnabled = false;
  handBeacons: HandBeaconMode = 'active';
  get activeHandVoices() {
    return this.handAudio?.activeVoices ?? 0;
  }
  private levels: AudioMix = { ...DEFAULT_AUDIO_MIX };
  private duckUntil = 0;
  get mix(): AudioMix {
    return { ...this.levels };
  }
  get activeEffectVoices() {
    return this.spatial?.activeVoices ?? 0;
  }
  setMix(mix: Partial<AudioMix>) {
    const next = { ...this.levels, ...mix };
    for (const value of Object.values(next))
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new RangeError('Audio levels must be between zero and one.');
    this.levels = next;
    this.applyMix();
    if (next.effects === 0) this.spatial?.stop();
  }
  private applyMix() {
    if (!this.context) return;
    const now = this.context.currentTime;
    const guidingHands =
      this.cuesEnabled && this.levels.guidance > 0 && (this.handAudio?.activeVoices ?? 0) > 0;
    for (const [bus, value] of [
      [this.musicBus, this.musicEnabled ? this.levels.music * (guidingHands ? 0.65 : 1) : 0],
      [this.guidanceBus, this.cuesEnabled ? this.levels.guidance : 0],
      [
        this.effectsBus,
        this.effectsEnabled
          ? this.levels.effects * (now < this.duckUntil || guidingHands ? 0.32 : 1)
          : 0,
      ],
    ] as const)
      if (bus) {
        bus.gain.cancelScheduledValues(now);
        bus.gain.setTargetAtTime(value, now, 0.015);
      }
  }
  private voices = new Set<OscillatorNode>();
  private cued = new Set<string>();
  private lastPulse = -1;
  private beatTicks: { tick: number; accent: boolean; index: number }[] = [];
  private base: { tick: number; time: number } | undefined;
  private song?: { buffer: AudioBuffer; startTick: number; volume: number; cueVolume: number };
  private songSource?: AudioBufferSourceNode;
  private songGain?: GainNode;
  speed = 1;
  enabled = true;
  musicEnabled = true;
  cuesEnabled = true;
  effectsEnabled = true;
  offsetMs = 0;
  private listener: Vec3 = [0, 1.65, 0];
  private forward: Vec3 = [0, 0, -1];
  private initialize() {
    if (!this.context) {
      this.context = this.createContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0.6;
      this.gain.connect(this.context.destination);
      this.musicBus = this.context.createGain();
      this.guidanceBus = this.context.createGain();
      this.effectsBus = this.context.createGain();
      for (const bus of [this.musicBus, this.guidanceBus, this.effectsBus]) bus.connect(this.gain);
      this.musicBus.gain.value = this.musicEnabled ? this.levels.music : 0;
      this.guidanceBus.gain.value = this.cuesEnabled ? this.levels.guidance : 0;
      this.effectsBus.gain.value = this.effectsEnabled ? this.levels.effects : 0;
      this.spatial = new SpatialSounds(this.context, this.effectsBus);
      this.handAudio = new HandAudio(this.context, this.guidanceBus);
      this.pose(this.listener, this.forward);
    }
  }
  async unlock() {
    this.initialize();
    if (typeof AudioContext !== 'undefined' && this.context instanceof AudioContext)
      await this.context.resume();
  }
  setScore(map: MapDefinition) {
    this.song = undefined;
    this.beatTicks = [];
    for (let beat = 0; beat <= beatValue(map.durationBeats); beat++) {
      const tempo = [...map.tempo].reverse().find((t) => beatValue(t.beat) <= beat)!;
      this.beatTicks.push({
        tick: beatToTick(beat, map),
        accent: (beat - beatValue(tempo.beat)) % tempo.meter[0] === 0,
        index: beat,
      });
    }
    this.rebase();
  }
  async decodeSong(data: ArrayBuffer): Promise<AudioBuffer> {
    this.initialize();
    return this.context!.decodeAudioData(data);
  }
  setSong(
    buffer: AudioBuffer,
    startTick: number,
    mix: { volume?: number; cueVolume?: number } = {},
  ) {
    for (const value of [mix.volume ?? 0.45, mix.cueVolume ?? 1])
      if (!Number.isFinite(value) || value < 0 || value > 1)
        throw new RangeError('Song mix must be between zero and one.');
    this.rebase();
    this.song = { buffer, startTick, volume: mix.volume ?? 0.45, cueVolume: mix.cueVolume ?? 1 };
  }
  rebase() {
    this.stop();
    this.base = undefined;
    this.cued.clear();
    this.lastPulse = -1;
  }
  pose(position: Vec3, forward: Vec3) {
    this.listener = position;
    this.forward = forward;
    const c = this.context;
    if (!c) return;
    const l = c.listener;
    // Firefox exposes the legacy listener setters instead of these AudioParams.
    if (!l.positionX) {
      l.setPosition(...position);
      l.setOrientation(...forward, 0, 1, 0);
      return;
    }
    l.positionX.value = position[0];
    l.positionY.value = position[1];
    l.positionZ.value = position[2];
    l.forwardX.value = forward[0];
    l.forwardY.value = forward[1];
    l.forwardZ.value = forward[2];
    l.upX.value = 0;
    l.upY.value = 1;
    l.upZ.value = 0;
  }
  reset() {
    this.rebase();
  }
  stop() {
    this.handAudio?.stop();
    this.spatial?.stop();
    this.duckUntil = 0;
    if (this.songSource) {
      try {
        this.songSource.stop();
      } catch {}
      this.songSource.disconnect();
      this.songSource = undefined;
      this.songGain?.disconnect();
      this.songGain = undefined;
    }
    for (const voice of this.voices)
      try {
        voice.stop();
      } catch {}
    this.voices.clear();
  }
  private tone(
    frequency: number,
    duration: number,
    volume: number,
    position?: Vec3,
    type: OscillatorType = 'sine',
    delay = 0,
    endFrequency?: number,
    channel: 'cue' | 'music' = 'cue',
  ) {
    const c = this.context;
    if (
      !c ||
      !this.enabled ||
      !this.gain ||
      (channel === 'cue' ? !this.cuesEnabled : !this.musicEnabled)
    )
      return;
    const when = c.currentTime + Math.max(0, delay + this.offsetMs / 1000),
      osc = c.createOscillator(),
      env = c.createGain();
    if (channel === 'cue') volume *= this.song?.cueVolume ?? 1;
    if (channel === 'cue' && volume > 0 && this.levels.guidance > 0)
      this.duckUntil = Math.max(this.duckUntil, when + duration + 0.08);
    const bus = (channel === 'cue' ? this.guidanceBus : this.musicBus)!;
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, when);
    if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, when + duration);
    env.gain.setValueAtTime(0, when);
    env.gain.linearRampToValueAtTime(volume, when + 0.005);
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env);
    if (position) {
      const panner = c.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      panner.maxDistance = 10;
      panner.positionX.value = position[0];
      panner.positionY.value = position[1];
      panner.positionZ.value = position[2];
      env.connect(panner);
      panner.connect(bus);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        env.disconnect();
        panner.disconnect();
      };
    } else {
      env.connect(bus);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        env.disconnect();
      };
    }
    this.voices.add(osc);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }
  update(view: Observation, events: DomainEvent[], running: boolean, hands?: HandGuidanceFrame) {
    if (!running || !this.enabled) {
      this.stop();
      this.base = undefined;
      return;
    }
    const c = this.context;
    if (!c) return;
    this.base ??= { tick: view.tick, time: c.currentTime };
    const delayAt = (tick: number) =>
      this.base!.time + (tick - this.base!.tick) / (view.tickRate * this.speed) - c.currentTime;
    if (this.song && this.musicEnabled && !this.songSource && this.gain) {
      const offset = Math.max(
        0,
        (view.tick - this.song.startTick) / view.tickRate - (this.offsetMs * this.speed) / 1000,
      );
      if (offset < this.song.buffer.duration) {
        const source = c.createBufferSource(),
          gain = c.createGain();
        source.buffer = this.song.buffer;
        source.playbackRate.value = this.speed;
        gain.gain.value = this.song.volume;
        source.connect(gain);
        gain.connect(this.musicBus!);
        source.start(
          c.currentTime + Math.max(0, delayAt(this.song.startTick) + this.offsetMs / 1000),
          offset,
        );
        this.songSource = source;
        this.songGain = gain;
      }
    }
    // Piecewise-tempo beat positions are compiled by the shared SDK. Audio schedules ahead.
    for (const beat of this.beatTicks) {
      if (this.song) break;
      if (beat.index <= this.lastPulse || beat.tick < view.tick - 2) continue;
      const delay = delayAt(beat.tick);
      if (delay > 0.25) break;
      this.lastPulse = beat.index;
      this.tone(beat.accent ? 65 : 90, 0.1, 0.055, undefined, 'sine', delay, 40, 'music');
      if (beat.index % 2)
        this.tone(
          440 * 2 ** ([0, 3, 7, 10][Math.floor(beat.index / 4) % 4] / 12),
          0.25,
          0.015,
          undefined,
          'triangle',
          delay,
          undefined,
          'music',
        );
    }
    for (const entity of view.entities) {
      if (['hidden', 'waiting'].includes(entity.presentation?.readiness?.phase ?? '')) continue;
      const remaining = (entity.hitTick - view.tick) / view.tickRate;
      if (remaining < -0.1 || remaining > 1.05) continue;
      const stage =
          remaining > 0.65
            ? 'early'
            : remaining > 0.3
              ? 'middle'
              : remaining > 0.08
                ? 'late'
                : 'now',
        key = entity.id + ':' + stage;
      if (this.cued.has(key)) continue;
      this.cued.add(key);
      const p = (entity.targetPosition ?? entity.position) as Vec3,
        delta = p.map((v, i) => v - this.listener[i]) as Vec3,
        rear = delta[0] * this.forward[0] + delta[2] * this.forward[2] < 0;
      const semantic = entity.slots[0]?.semantic,
        base =
          entity.kind === 'hazard'
            ? 95
            : entity.slots.length > 1
              ? 520
              : semantic === 'left'
                ? 330
                : semantic === 'right'
                  ? 660
                  : 440;
      const frequency = base * 2 ** (Math.max(-0.8, Math.min(0.8, p[1] - this.listener[1])) / 2),
        volume = stage === 'now' ? 0.13 : 0.055;
      const cueDelay = stage === 'now' ? delayAt(entity.hitTick) : 0;
      this.tone(
        frequency,
        entity.kind === 'hold' ? 0.22 : 0.1,
        volume,
        p,
        entity.kind === 'hazard' ? 'sawtooth' : semantic === 'right' ? 'triangle' : 'sine',
        cueDelay,
        stage === 'now' ? frequency * 1.3 : undefined,
      );
      if (entity.slots.length > 1)
        this.tone(frequency * 1.5, 0.13, volume * 0.6, p, 'sine', cueDelay);
      if (rear) this.tone(frequency * 0.5, 0.055, volume * 0.8, p, 'triangle', cueDelay + 0.075);
    }
    for (const event of events) {
      if (event.type === 'interaction.hit') {
        this.tone(880, 0.12, 0.055, undefined, 'sine', 0, 1400);
      }
      if (event.type === 'interaction.missed')
        this.tone(130, 0.18, 0.035, undefined, 'triangle', 0, 65);
      if (event.type === 'hazard.penalty') this.tone(60, 0.15, 0.08, undefined, 'sawtooth');
      if (event.type === 'group.completed') {
        this.tone(660, 0.25, 0.05);
        this.tone(990, 0.25, 0.04, undefined, 'sine', 0.06);
      }
    }
    if (this.effectsEnabled && this.levels.effects > 0)
      this.spatial?.update(sampleSpatialAudio(view));
    else this.spatial?.stop();
    if (this.nonvisualEnabled && this.cuesEnabled && this.levels.guidance > 0 && !view.finished)
      this.handAudio?.update(hands ?? describeHandGuidance(view), view.tickRate, this.handBeacons);
    else this.handAudio?.stop();
    this.applyMix();
  }
  async dispose() {
    this.stop();
    if (typeof AudioContext !== 'undefined' && this.context instanceof AudioContext)
      await this.context.close();
  }
}
