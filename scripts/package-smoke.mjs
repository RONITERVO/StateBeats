import { mkdtemp, readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
const output = resolve('artifacts');
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
const release = join(output, 'release', version);
await mkdir(output, { recursive: true });
const directory = await mkdtemp(join(tmpdir(), 'statebeats-install-smoke-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm.');
const run = (args, cwd) =>
  new Promise((ok, fail) => {
    const p = spawn(process.execPath, args, { cwd, stdio: 'inherit' });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`Exit ${code}`))));
  });
await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
const tarballs = (await readdir(release)).filter((n) =>
  /^statebeats-(core|sdk|ink-battle|content|cli|mcp|adapters-node)-/.test(n),
);
await run(
  [npm, 'install', '--ignore-scripts', ...tarballs.map((n) => join(release, n))],
  directory,
);
await run(['node_modules/@statebeats/cli/dist/index.js', 'demo'], directory);
await writeFile(
  join(directory, 'sdk-smoke.mjs'),
  `
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import { Session, standardActor, analyzePcm, sampleMusic, describeObservation, describeHandGuidance, generateChoreography, inspectChoreography, planTurns, createFacingSampler, createNotePresenter, PRESENTATION_VERSION } from '@statebeats/sdk';
import { sampleMap, eventHorizonSoundtrack } from '@statebeats/content';
import { inkBattleMap, inkSoundtrack, sampleInkBattle } from '@statebeats/ink-battle';
import { Session as Battle } from '@statebeats/ink-battle/upstream/src/sdk/session.js';
const inkAudio = await readFile(new URL(import.meta.resolve('@statebeats/ink-battle/audio/between-the-lines.mp3')));
assert.equal(createHash('sha256').update(inkAudio).digest('hex'),inkSoundtrack.sha256);
assert.equal(inkBattleMap().notes.length,358);
assert.equal(sampleInkBattle(330).age,5);
assert.equal(new Battle({battlefield:'tabletop'}).tick,0);
assert.match(await readFile(new URL('../LICENSE',import.meta.resolve('@statebeats/ink-battle')),'utf8'),/Apache License/);
assert.match(await readFile(new URL('../NOTICE',import.meta.resolve('@statebeats/ink-battle')),'utf8'),/Ink-Battle/);
assert.match(await readFile(new URL('../INK_BATTLE_LICENSE.txt',import.meta.resolve('@statebeats/content')),'utf8'),/Apache License/);
const bundledAudio = await readFile(new URL(import.meta.resolve('@statebeats/content/audio/event-horizon.mp3')));
assert.equal(createHash('sha256').update(bundledAudio).digest('hex'), eventHorizonSoundtrack.sha256);
assert.equal(sampleMap('event-horizon-master').music.source.sha256, eventHorizonSoundtrack.sha256);
const session = await Session.create(sampleMap('sunlit-journey'), [standardActor()]);
session.advance(240);
const view = session.observe({role:'admin'});
assert.equal(describeHandGuidance(view).version, 1);
assert.equal(sampleMap('finding-the-pulse').notes.length, 9);
assert.equal(view.scene.objects[0].id, 'sun');
assert.ok(describeObservation(view).targets.length > 0);
assert.equal(view.presentationVersion, PRESENTATION_VERSION);
const presenter=createNotePresenter(session.map);
const live=session.snapshot().entities[0];
assert.deepEqual(presenter.sample(live,session.tick),view.entities[0].presentation);
assert.deepEqual(describeObservation(view).targets[0].presentation,
  view.entities.find(e=>e.id===describeObservation(view).targets[0].id).presentation);
const music = analyzePcm({ samples: Float32Array.from({length:16000}, (_, i) => Math.sin(i * .1) * .4), sampleRate:16000 });
assert.ok(sampleMusic(music, 500).energy > 0);
session.close();
const composed = generateChoreography(sampleMap('choreography-journey').music, { seed:17, difficulty:'flow', turnMode:'full', turnStyle:'musical' });
assert.ok(composed.report.summary.rails > 0);
assert.equal(inspectChoreography(composed.map, composed.report.settings).issues.length, 0);
assert.equal(composed.map.generation.algorithm, 'statebeats/choreography-v2');
assert.ok(composed.map.turns.events.length > 0);
const turn = planTurns([{id:'accent',beat:4,endBeat:7,gesture:'sweep',direction:'right',reason:'Lead'}],{bpm:150});
assert.ok(createFacingSampler(turn.track)(7) > 0);
console.log('Packaged scenes, music, choreography, musical turns, target presentation and semantic perception work.');
`,
);
await run(['sdk-smoke.mjs'], directory);
await writeFile(
  join(output, 'package-smoke.json'),
  JSON.stringify({ passed: true, node: process.version, directory, packages: tarballs }, null, 2),
);
