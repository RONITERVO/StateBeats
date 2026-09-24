import { mkdir, writeFile } from 'node:fs/promises';
import { sampleMap, eventHorizonSoundtrack } from '@statebeats/content';
import { Session, standardActor, scriptedCommands, fitMapToPlayer } from '@statebeats/sdk';

const map = fitMapToPlayer(sampleMap('event-horizon-master'), { height: 1.65, roomScale: 1.2 });
const session = await Session.create(map, [standardActor()]);
const admin = session.client({ role: 'admin' });
const commands = scriptedCommands(session.program);
for (let i = 0; i < commands.length; i += 1024)
  admin.submit(`performance-${i}`, commands.slice(i, i + 1024));
session.advance(session.program.durationTicks);
const replay = await admin.replay();
const verification = await Session.verifyReplay(replay);
if (!verification.verified || session.snapshot().scores[0].misses)
  throw new Error('Showcase replay did not complete correctly.');
await mkdir('artifacts', { recursive: true });
await writeFile('artifacts/event-horizon-replay.json', JSON.stringify(replay));
console.log(
  JSON.stringify(
    {
      mode: 'Scripted hand poses; head untracked. See tracked-head avoidance tests for body clearance.',
      soundtrack: eventHorizonSoundtrack,
      asset: import.meta.resolve('@statebeats/content/audio/event-horizon.mp3'),
      scores: session.snapshot().scores,
      verification,
    },
    null,
    2,
  ),
);
session.close();
