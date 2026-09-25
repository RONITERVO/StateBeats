import { Session, standardActor } from '@statebeats/sdk';
import { RhythmAudio } from './audio.js';

/** Real DSP for hand/target pairs, independent muting and cleanup, without mocking Web Audio. */
export async function handAudioConformance() {
  const results = [];
  for (const mode of [
    'left',
    'right',
    'rotated',
    'muted',
    'master-muted',
    'paused',
    'resume',
    'lost-tracking',
    'targets-only',
    'both',
  ] as const) {
    const context = new OfflineAudioContext(2, 24000, 48000);
    const audio = new RhythmAudio(() => context);
    audio.nonvisualEnabled = true;
    audio.musicEnabled = audio.effectsEnabled = false;
    audio.setMix({ guidance: mode === 'muted' ? 0 : 1 });
    audio.enabled = mode !== 'master-muted';
    audio.handBeacons = mode === 'targets-only' ? 'off' : 'active';
    const x = mode === 'right' ? 2 : -2;
    const s = await Session.create(
      {
        version: 1,
        id: 'hand-audio',
        title: 'Hand audio',
        durationBeats: 12,
        tempo: [{ beat: 0, bpm: 120 }],
        notes: [
          {
            id: 'target',
            preset: mode === 'both' ? 'combined' : 'left',
            beat: 4,
            position: [x, 1.65, -1],
            leadMs: 3000,
          },
        ],
      },
      [standardActor()],
    );
    s.submit(
      { role: 'admin' },
      'hands',
      ['left', 'right'].map((hand) => ({
        id: hand,
        tick: 1,
        type: 'pose' as const,
        actorId: 'player',
        effectorId: hand,
        position: [x, 1.65, -1],
        tracked: mode !== 'lost-tracking',
        active: true,
      })),
    );
    s.advance(60); // 1.5 seconds before hit: isolates the continuous guidance from timing chimes.
    await audio.unlock();
    audio.pose([0, 1.65, 0], mode === 'rotated' ? [0, 0, 1] : [0, 0, -1]);
    audio.update(s.observe({ role: 'admin' }), [], true);
    const initial = audio.activeHandVoices;
    if (mode === 'paused' || mode === 'resume')
      audio.update(s.observe({ role: 'admin' }), [], false);
    if (mode === 'resume') {
      audio.rebase();
      audio.update(s.observe({ role: 'admin' }), [], true);
    }
    const later = audio.activeHandVoices;
    const buffer = await context.startRendering();
    const energy = [0, 1].map((channel) =>
      buffer.getChannelData(channel).reduce((sum, value) => sum + value * value, 0),
    );
    audio.stop();
    results.push({ mode, initial, later, energy, stopped: audio.activeHandVoices });
    s.close();
    await audio.dispose();
  }
  return results;
}

/** Actual offline DSP, including movement, independent layers and transport lifecycle. */
export async function spatialAudioConformance() {
  const energy = (buffer: AudioBuffer, channel: number, start: number, end: number) => {
    const data = buffer.getChannelData(channel);
    let sum = 0;
    for (let i = Math.floor(start * buffer.sampleRate); i < end * buffer.sampleRate; i++)
      sum += data[i] ** 2;
    return sum;
  };
  const results = [];
  for (const mode of [
    'moving',
    'right',
    'muted',
    'paused',
    'resume',
    'guidance',
    'rotated',
    'dense',
  ] as const) {
    const context = new OfflineAudioContext(2, 48000, 48000);
    const audio = new RhythmAudio(() => context);
    audio.musicEnabled = false;
    audio.cuesEnabled = mode === 'guidance';
    audio.effectsEnabled = mode !== 'guidance';
    audio.setMix({ effects: mode === 'muted' ? 0 : 1, guidance: 1 });
    const session = await Session.create({
      version: 1,
      id: 'moving-sounds',
      title: 'Moving sounds',
      durationBeats: 20,
      tempo: [{ beat: 0, bpm: 120 }],
      audio: { version: 1, theme: 'statebeats/orbital-v1' },
      notes: Array.from({ length: mode === 'dense' ? 48 : 1 }, (_, i) => ({
        id: `moving-${i}`,
        preset: 'hold',
        beat: 2,
        holdMs: 3000,
        durationBeats: 8,
        position: [-2, 1.65, -1],
        earlyMs: 0,
        leadMs: 1000,
        motion: [
          { beat: 2, position: [-2, 1.65, -1] },
          { beat: 4, position: [2, 1.65, -1] },
        ],
        sound: { effect: 'orbital/arc' },
      })),
    });
    await audio.unlock();
    audio.pose([0, 1.65, 0], mode === 'rotated' ? [0, 0, 1] : [0, 0, -1]);
    audio.setScore(session.map);
    const dynamic = typeof context.suspend === 'function';
    session.advance(mode === 'right' || (!dynamic && mode === 'resume') ? 240 : 120);
    audio.update(session.observe({ role: 'admin' }), [], true);
    const initial = audio.activeEffectVoices;
    const advance = () => {
      if (dynamic) session.advance(120);
      if (mode === 'paused' || mode === 'resume')
        audio.update(session.observe({ role: 'admin' }), [], false);
      if (mode === 'resume') {
        audio.rebase();
        audio.update(session.observe({ role: 'admin' }), [], true);
      } else if (mode !== 'paused') audio.update(session.observe({ role: 'admin' }), [], true);
    };
    let rendered: AudioBuffer;
    if (dynamic) {
      const suspended = context.suspend(0.45);
      const rendering = context.startRendering();
      await suspended;
      advance();
      await context.resume();
      rendered = await rendering;
    } else {
      // Firefox has no offline suspend/resume. Render independent trajectory snapshots there;
      // Chromium also verifies continuous node movement during a single offline render.
      advance();
      rendered = await context.startRendering();
    }
    const later = audio.activeEffectVoices;
    const first = [0, 1].map((c) => energy(rendered, c, 0.1, 0.35));
    const last = [0, 1].map((c) => energy(rendered, c, 0.7, 0.95));
    audio.stop();
    results.push({ mode, dynamic, first, last, initial, later, stopped: audio.activeEffectVoices });
    session.close();
    await audio.dispose();
  }
  return results;
}
