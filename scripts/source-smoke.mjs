import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
const directory = await mkdtemp(join(tmpdir(), 'statebeats-source-smoke-'));
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Run through npm');
const run = (command, args) =>
  new Promise((ok, fail) => {
    const p = spawn(command, args, { cwd: directory, stdio: 'inherit' });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${command} exited ${code}`))));
  });
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
await run('tar', [
  '-xzf',
  resolve(`artifacts/release/${version}/statebeats-source-${version}.tgz`),
  '-C',
  directory,
]);
await run(process.execPath, [npm, 'ci']);
await run(process.execPath, [npm, 'run', 'check']);
await run(process.execPath, [npm, 'run', 'demo']);
await run(process.execPath, ['examples/headless.mjs']);
await run(process.execPath, ['examples/scenes.mjs']);
await run(process.execPath, ['examples/choreography.mjs']);
await run(process.execPath, ['examples/turns.mjs']);
await run(process.execPath, ['examples/event-horizon.mjs']);
await run(process.execPath, ['examples/ink-battle.mjs']);
await run(process.execPath, [
  'packages/cli/dist/index.js',
  'run',
  'examples/agent-loop.json',
  'artifacts/agent-results.json',
]);
await run(process.execPath, [
  'packages/cli/dist/index.js',
  'generate',
  '42',
  'artifacts/generated.json',
]);
await run(process.execPath, ['packages/cli/dist/index.js', 'validate', 'artifacts/generated.json']);
await run(process.execPath, [
  'packages/cli/dist/index.js',
  'verify',
  'artifacts/headless-replay.json',
]);
await mkdir('artifacts', { recursive: true });
await writeFile(
  'artifacts/source-smoke.json',
  JSON.stringify(
    {
      passed: true,
      node: process.version,
      directory,
      checks: [
        'npm ci',
        'check',
        'demo',
        'headless example',
        'scene/music example',
        'choreography composition/inspection/replay example',
        'musical turn planning and inspection example',
        'Event Horizon bundled audio resolution and complete Master replay',
        'CLI run/generate/validate/verify',
      ],
    },
    null,
    2,
  ),
);
