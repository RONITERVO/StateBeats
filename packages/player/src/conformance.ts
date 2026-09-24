// Development-only entry, excluded from the production player's build.
// @ts-expect-error The shared .mjs fixture is intentionally executable without TypeScript.
import { conformance } from '../../../examples/conformance.mjs';
import { RhythmAudio } from './audio.js';
import { Session, standardActor } from '@statebeats/sdk';
document.querySelector('#run')!.addEventListener('click', async () => {
  const output = document.querySelector('#result')!;
  try {
    const source = (document.querySelector('#recordings') as HTMLTextAreaElement).value;
    const { recordings: _recordings, ...result } = await conformance(
      source ? JSON.parse(source) : undefined,
    );
    output.textContent = JSON.stringify(result);
  } catch (error) {
    output.textContent = JSON.stringify({ error: String(error) });
  }
});
document.querySelector('#run-audio')!.addEventListener('click', async () => {
  const output = document.querySelector('#audio-result')!;
  try {
    const context = new OfflineAudioContext(2, 48000, 48000),
      audio = new RhythmAudio(() => context);
    await audio.unlock();
    const session = await Session.create(
      {
        version: 1,
        id: 'audio',
        title: 'Audio',
        durationBeats: 4,
        tempo: [{ beat: 0, bpm: 120 }],
        notes: [{ id: 'a', preset: 'left', beat: 1, position: [-1, 1.8, -1] }],
      },
      [standardActor()],
    );
    audio.setScore(session.map);
    session.advance(1);
    audio.update(session.observe({ role: 'admin' }), [], true);
    const buffer = await context.startRendering();
    const energy = [0, 1].map((channel) =>
      buffer.getChannelData(channel).reduce((s, v) => s + v * v, 0),
    );
    output.textContent = JSON.stringify({ energy, samples: buffer.length });
    session.close();
  } catch (error) {
    output.textContent = JSON.stringify({ error: String(error) });
  }
});
document.querySelector('#run-transport')!.addEventListener('click', async () => {
  const output = document.querySelector('#transport-result')!;
  try {
    const results: { early: number; late: number }[] = [];
    for (const mode of ['start', 'resume', 'paused', 'offset-later', 'offset-earlier']) {
      const context = new OfflineAudioContext(1, 96000, 48000),
        audio = new RhythmAudio(() => context);
      await audio.unlock();
      audio.cuesEnabled = false;
      const session = await Session.create({
        version: 1,
        id: 'transport',
        title: 'Transport',
        durationBeats: 12,
        tempo: [{ beat: 0, bpm: 120 }],
        notes: [],
      });
      audio.setScore(session.map);
      const song = context.createBuffer(1, 144000, 48000),
        data = song.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = i < 48000 ? 0.1 : 0.3;
      audio.setSong(song, 120);
      if (mode === 'offset-later') audio.offsetMs = 750;
      if (mode === 'offset-earlier') audio.offsetMs = -750;
      if (mode === 'resume') session.advance(240);
      audio.update(session.observe({ role: 'admin' }), [], true);
      if (mode === 'paused') audio.stop();
      const rendered = (await context.startRendering()).getChannelData(0);
      results.push({ early: rendered[24000], late: rendered[72000] });
      session.close();
      await audio.dispose();
    }
    output.textContent = JSON.stringify(results);
  } catch (error) {
    output.textContent = JSON.stringify({ error: String(error) });
  }
});
