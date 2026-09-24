/// <reference lib="webworker" />
import { analyzePcm, generateChoreography } from '@statebeats/sdk';
import type { MusicTimeline, MusicGenerationOptions } from '@statebeats/sdk';
const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = (
  event: MessageEvent<{
    samples?: Float32Array;
    sampleRate?: number;
    source?: NonNullable<MusicTimeline['source']>;
    music?: MusicTimeline;
    options: MusicGenerationOptions;
  }>,
) => {
  try {
    const { samples, sampleRate, source, options } = event.data;
    const music =
      event.data.music ??
      analyzePcm({ samples: samples!, sampleRate: sampleRate!, tickRate: options.tickRate });
    if (source) music.source = source;
    const result = generateChoreography(music, {
      ...options,
      ...(music.source
        ? {
            id: `local-${music.source.sha256.slice(0, 20)}`,
            title: music.source.name.slice(0, 100),
          }
        : {}),
    });
    scope.postMessage(result);
  } catch (error) {
    scope.postMessage({ error: String(error) });
  }
};
