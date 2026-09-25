import type { GuidedHand, HandGuidanceFrame } from '@statebeats/sdk';
import type { Vec3 } from '@statebeats/core';
export type HandBeaconMode = 'off' | 'active' | 'always';
interface Voice {
  oscillator: OscillatorNode;
  gain: GainNode;
  panner: PannerNode;
}
/** Four quiet voices maximum: a lower hand beacon and an octave target beacon per hand. */
export class HandAudio {
  private voices = new Map<string, Voice>();
  constructor(
    private context: BaseAudioContext,
    private output: AudioNode,
  ) {}
  get activeVoices() {
    return this.voices.size;
  }
  private voice(
    id: string,
    frequency: number,
    volume: number,
    position: Vec3,
    wave: OscillatorType,
  ) {
    const c = this.context,
      now = c.currentTime;
    let v = this.voices.get(id);
    if (!v) {
      const oscillator = c.createOscillator(),
        gain = c.createGain(),
        panner = c.createPanner();
      oscillator.type = wave;
      oscillator.frequency.value = frequency;
      gain.gain.value = 0;
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = 1;
      [panner.positionX.value, panner.positionY.value, panner.positionZ.value] = position;
      oscillator.connect(gain);
      gain.connect(panner);
      panner.connect(this.output);
      oscillator.start();
      v = { oscillator, gain, panner };
      this.voices.set(id, v);
    }
    for (const [param, value] of [
      [v.oscillator.frequency, frequency],
      [v.gain.gain, volume],
      [v.panner.positionX, position[0]],
      [v.panner.positionY, position[1]],
      [v.panner.positionZ, position[2]],
    ] as const) {
      param.cancelScheduledValues(now);
      param.setTargetAtTime(value, now, 0.012);
    }
  }
  update(frame: HandGuidanceFrame, tickRate: number, mode: HandBeaconMode) {
    const keep = new Set<string>();
    for (const hand of frame.hands.slice(0, 2)) {
      if (!hand.tracked || !hand.active) continue;
      const base = hand.semantic === 'left' ? 196 : 293.665;
      const target = hand.target;
      if (mode === 'always' || (mode === 'active' && target)) {
        const id = `${hand.id}:hand`;
        keep.add(id);
        this.voice(
          id,
          base * (1 + Math.min(1, target?.gapMetres ?? 0) * 0.35),
          target ? 0.042 : 0.018,
          hand.position,
          'triangle',
        );
      }
      if (target) {
        const id = `${hand.id}:target`;
        keep.add(id);
        const pulse =
          target.phase === 'prepare'
            ? 0.25 + 0.75 * (0.5 + 0.5 * Math.cos((2 * Math.PI * 2 * frame.tick) / tickRate))
            : 1;
        this.voice(id, base * 2, 0.035 * pulse, target.position, 'sine');
      }
    }
    for (const id of this.voices.keys()) if (!keep.has(id)) this.remove(id);
  }
  private remove(id: string) {
    const v = this.voices.get(id);
    if (!v) return;
    v.oscillator.stop();
    v.oscillator.disconnect();
    v.gain.disconnect();
    v.panner.disconnect();
    this.voices.delete(id);
  }
  stop() {
    for (const id of this.voices.keys()) this.remove(id);
  }
}
export function handGuidanceText(hand: GuidedHand) {
  if (!hand.tracked) return `${hand.semantic} hand tracking unavailable`;
  const t = hand.target;
  if (!t) return `${hand.semantic} hand: no assigned target`;
  return `${hand.semantic}: ${t.label}; ${t.aligned ? 'aligned' : `${Math.round(t.gapMetres * 100)} centimetres from contact`}; ${t.phase === 'prepare' ? 'prepare, wait for the beat' : t.phase === 'hold' ? 'follow and hold' : 'contact window open'}`;
}
