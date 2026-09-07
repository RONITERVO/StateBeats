import { mkdir, writeFile } from 'node:fs/promises';
import {
  Session, standardActor, scriptedCommands, describeObservation, analyzePcm, generateMusicMap,
} from '@statebeats/sdk';
import { sunlitJourney } from '@statebeats/content';

const session = await Session.create(sunlitJourney(), [standardActor()]);
const host = session.client({ role: 'admin' });
host.submit('script', scriptedCommands(session.program));
host.advance(240);
const view = host.observe();
console.log(JSON.stringify({ scene: view.scene.objects.map(({ id, position, trail }) => ({ id, position, trailSamples: trail.length })), cues: describeObservation(view, { maxTargets: 3 }).targets.map(cue => cue.text) }, null, 2));
host.advance(session.program.durationTicks - session.tick);
const replay = await host.replay();
console.log(JSON.stringify({ scores: host.observe().scores, replay: await Session.verifyReplay(replay) }, null, 2));

// The PCM source is generated here. A decoder adapter can provide local file audio instead.
const sampleRate = 16000;
const samples = Float32Array.from({ length: sampleRate * 12 }, (_, index) =>
  Math.sin(2 * Math.PI * 100 * index / sampleRate) * 0.4,
);
const music = analyzePcm({ samples, sampleRate });
const map = generateMusicMap(music, { seed: 73, bpm: 120, turning: true });
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/music-scene-map.json', JSON.stringify(map, null, 2));
await writeFile('artifacts/sun-journey-replay.json', JSON.stringify(replay));
console.log(`Saved ${map.notes.length} generated interactions, music features, a moving emitter and the journey replay.`);
session.close();
