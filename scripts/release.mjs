import { cp, mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
const version = JSON.parse(await readFile('package.json', 'utf8')).version;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Release version must be a numeric semver.');
const releaseRoot = resolve('artifacts/release'),
  destination = resolve(releaseRoot, version);
await mkdir(destination, { recursive: true });
async function run(command, args, cwd = process.cwd()) {
  return new Promise((ok, fail) => {
    const p = spawn(command, args, { cwd, stdio: 'inherit' });
    p.on('error', fail);
    p.on('close', (code) => (code === 0 ? ok() : fail(new Error(`${command} exited ${code}`))));
  });
}
const npm = process.env.npm_execpath;
if (!npm) throw new Error('Use npm run release:local so the npm executable is known.');
for (const name of ['core', 'sdk', 'content', 'cli', 'mcp', 'adapters-node']) {
  const path = `packages/${name}`;
  await cp(name === 'content' ? 'LICENSE-CC0.txt' : 'LICENSE', `${path}/LICENSE`);
  await run(
    process.execPath,
    [npm, 'pack', '--ignore-scripts', '--pack-destination', destination],
    resolve(path),
  );
}
const playerDestination = resolve(destination, 'player');
if (relative(releaseRoot, playerDestination) !== join(version, 'player'))
  throw new Error('Release target escaped the artifact directory.');
await rm(playerDestination, { recursive: true, force: true });
await cp('packages/player/dist', playerDestination, { recursive: true });
for (const name of ['LICENSE', 'CONTENT_LICENSE.md', 'LICENSE-CC0.txt', 'THIRD_PARTY_NOTICES.md'])
  await cp(name, join(destination, 'player', name));
await cp('docs/QUEST_PLAYTEST.md', join(destination, 'player', 'QUEST_PLAYTEST.md'));
await cp('scripts/serve-player.mjs', join(destination, 'player', 'serve.mjs'));
await writeFile(
  join(destination, 'player', 'README.md'),
  '# StateBeats static player\n\nServe this directory on HTTPS for standalone Quest Browser.\nFor desktop/local USB testing, use Node 24 and run `node serve.mjs .` here, then open http://127.0.0.1:4173.\nSee QUEST_PLAYTEST.md. Hardware verification is pending. No application server or model API is required.\n',
);
await run('tar', [
  '-czf',
  join(destination, `statebeats-player-${version}.tgz`),
  '-C',
  destination,
  'player',
]);
const source = [
  'packages',
  'tests',
  'scripts',
  'examples',
  'schemas',
  'docs',
  '.github',
  'package.json',
  'package-lock.json',
  'tsconfig.json',
  'vitest.config.ts',
  'playwright.config.ts',
  '.prettierrc.json',
  '.prettierignore',
  '.gitignore',
  '.gitattributes',
  '.nvmrc',
  'README.md',
  'LICENSE',
  'LICENSE-CC0.txt',
  'CONTENT_LICENSE.md',
  'THIRD_PARTY_NOTICES.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
];
await run('tar', [
  '-czf',
  join(destination, `statebeats-source-${version}.tgz`),
  '--exclude=node_modules',
  '--exclude=dist',
  '--exclude=*.tsbuildinfo',
  ...source,
]);
const hashes = [];
for (const file of (await readdir(destination)).filter((n) => n.endsWith('.tgz')).sort())
  hashes.push(
    `${createHash('sha256')
      .update(await readFile(join(destination, file)))
      .digest('hex')}  ${file}`,
  );
await writeFile(join(destination, 'SHA256SUMS.txt'), hashes.join('\n') + '\n');
console.log(`Local release artifacts prepared at ${destination}. Nothing published.`);
