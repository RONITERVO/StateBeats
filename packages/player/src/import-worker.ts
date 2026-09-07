/// <reference lib="webworker" />
import { analyzePcm, generateMusicMap } from '@statebeats/sdk';
import type { MusicTimeline } from '@statebeats/sdk';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (
  event: MessageEvent<{
    samples: Float32Array;
    sampleRate: number;
    source: NonNullable<MusicTimeline['source']>;
    bpm: number;
    difficulty: 'gentle' | 'flow' | 'busy';
    turning: boolean;
  }>,
) => {
  try {
    const { samples, sampleRate, source, bpm, difficulty, turning } = event.data;
    const music = analyzePcm({ samples, sampleRate });
    music.source = source;
    const map = generateMusicMap(music, {
      id: `local-${source.sha256.slice(0, 20)}`,
      title: source.name.slice(0, 100),
      bpm,
      difficulty,
      turning,
    });
    scope.postMessage({ map });
  } catch (error) {
    scope.postMessage({ error: String(error) });
  }
};
