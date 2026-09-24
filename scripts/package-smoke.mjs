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
  /^statebeats-(core|sdk|content|cli|mcp|adapters-node)-/.test(n),
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
import { Session, standardActor, analyzePcm, sampleMusic, describeObservation, generateChoreography, inspectChoreography } from '@statebeats/sdk';
import { sampleMap } from '@statebeats/content';
const session = await Session.create(sampleMap('sunlit-journey'), [standardActor()]);
session.advance(240);
const view = session.observe({role:'admin'});
assert.equal(view.scene.objects[0].id, 'sun');
assert.ok(describeObservation(view).targets.length > 0);
const music = analyzePcm({ samples: Float32Array.from({length:16000}, (_, i) => Math.sin(i * .1) * .4), sampleRate:16000 });
assert.ok(sampleMusic(music, 500).energy > 0);
session.close();
const composed = generateChoreography(sampleMap('choreography-journey').music, { seed:17, difficulty:'flow', turnMode:'full' });
assert.ok(composed.report.summary.rails > 0);
assert.equal(inspectChoreography(composed.map, composed.report.settings).issues.length, 0);
assert.equal(composed.map.generation.algorithm, 'statebeats/choreography-v1');
console.log('Packaged scenes, music, choreography and semantic perception work.');
`,
);
await run(['sdk-smoke.mjs'], directory);
await writeFile(
  join(output, 'package-smoke.json'),
  JSON.stringify({ passed: true, node: process.version, directory, packages: tarballs }, null, 2),
);
