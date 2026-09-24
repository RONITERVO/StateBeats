import type { DomainEvent, Vec3 } from '@statebeats/core';
import type { Observation } from '@statebeats/sdk';
import { beatToTick, beatValue } from '@statebeats/sdk';
import type { MapDefinition } from '@statebeats/sdk';
/** Real audio perception: spatial target cues, front/back rhythm, height pitch and outcomes. */
export class RhythmAudio {
  private context?: AudioContext | OfflineAudioContext;
  constructor(
    private createContext: () => AudioContext | OfflineAudioContext = () =>
      new AudioContext({ latencyHint: 'interactive' }),
  ) {}
  private gain?: GainNode;
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
  offsetMs = 0;
  private listener: Vec3 = [0, 1.65, 0];
  private forward: Vec3 = [0, 0, -1];
  private initialize() {
    if (!this.context) {
      this.context = this.createContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0.6;
      this.gain.connect(this.context.destination);
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
      panner.connect(this.gain);
      osc.onended = () => {
        this.voices.delete(osc);
        osc.disconnect();
        env.disconnect();
        panner.disconnect();
      };
    } else {
      env.connect(this.gain);
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
  update(view: Observation, events: DomainEvent[], running: boolean) {
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
        gain.connect(this.gain);
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
      if (entity.presentation?.readiness?.phase === 'hidden') continue;
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
  }
  async dispose() {
    this.stop();
    if (typeof AudioContext !== 'undefined' && this.context instanceof AudioContext)
      await this.context.close();
  }
}
