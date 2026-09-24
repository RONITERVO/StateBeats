import { mkdir, writeFile } from 'node:fs/promises';
import { generateChoreography, inspectChoreography, Session, scriptedCommands, standardActor } from '@statebeats/sdk';
import { choreographyJourney } from '@statebeats/content';

const {map, report} = generateChoreography(choreographyJourney().music, {
  seed: 17, bpm: 120, difficulty: 'flow', turnMode: 'full', style: 'mixed',
});
const check = inspectChoreography(map, report.settings);
if (check.issues.length) throw new Error(JSON.stringify(check.issues));
const session = await Session.create(map, [standardActor()]);
const admin = session.client({role:'admin'});
const commands = scriptedCommands(session.program);
for (let i=0;i<commands.length;i+=1024) admin.submit(`play-${i}`,commands.slice(i,i+1024));
session.advance(session.program.durationTicks);
const replay = await admin.replay();
const verification = await Session.verifyReplay(replay);
await mkdir('artifacts/choreography',{recursive:true});
await writeFile('artifacts/choreography/map.json',JSON.stringify(map,null,2));
await writeFile('artifacts/choreography/report.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({summary:report.summary,issues:check.issues,scores:session.snapshot().scores,verification},null,2));
session.close();
