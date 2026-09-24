import { readFile, writeFile, cp } from 'node:fs/promises';
for (const name of ['core', 'sdk', 'ink-battle', 'content', 'cli', 'mcp', 'adapters-node']) {
  const path = `packages/${name}`,
    pkg = JSON.parse(await readFile(`${path}/package.json`, 'utf8'));
  pkg.files = [...new Set([...pkg.files, 'src'])];
  pkg.engines = { node: '>=24 <25' };
  pkg.repository = {
    type: 'git',
    url: 'git+https://github.com/RONITERVO/StateBeats.git',
    directory: path,
  };
  pkg.homepage = `https://github.com/RONITERVO/StateBeats/tree/main/${path}#readme`;
  pkg.bugs = { url: 'https://github.com/RONITERVO/StateBeats/issues' };
  await writeFile(`${path}/package.json`, JSON.stringify(pkg, null, 2) + '\n');
  if (name !== 'ink-battle')
    await cp(name === 'content' ? 'LICENSE-CC0.txt' : 'LICENSE', `${path}/LICENSE`);
  if (name === 'content') {
    await cp('packages/ink-battle/LICENSE', `${path}/INK_BATTLE_LICENSE.txt`);
    await cp('packages/ink-battle/NOTICE', `${path}/INK_BATTLE_NOTICE.txt`);
  }
  if (name === 'ink-battle') continue;
  await writeFile(
    `${path}/README.md`,
    `# ${pkg.name}\n\n${pkg.description}.\n\nPart of StateBeats ${pkg.version}. ESM with TypeScript declarations and source included.\nUse Node 24 LTS; core and SDK also run in modern browsers.\n\nThe source release includes complete usage in docs/SDK.md, docs/TOOLS.md and\ndocs/SCENES_MUSIC_ACCESS.md, plus examples/headless.mjs, examples/scenes.mjs and\nexamples/extensions.mjs. The reference player uses these same packages for desktop,\nstandalone WebXR and keyboard/manual text play.\n\n[Project and quick start](https://github.com/RONITERVO/StateBeats) ·\n[SDK contract](https://github.com/RONITERVO/StateBeats/blob/main/docs/SDK.md) ·\n[Scenes, music and access](https://github.com/RONITERVO/StateBeats/blob/main/docs/SCENES_MUSIC_ACCESS.md)\n\nRelease tarballs can be installed together from the source release. The public package\nnamespace is prepared; publication is a separate maintainer action.\n\nLicense: ${pkg.license}. See LICENSE.${name === 'content' ? '\nThe Ink-Battle catalog entry and maps/ink-battle-between-the-lines.json are Apache-2.0; see INK_BATTLE_LICENSE.txt, INK_BATTLE_NOTICE.txt and @statebeats/ink-battle.' : ''}\n\nMusical phrase generation, custom composers and movement inspection are described in [the choreography guide](https://github.com/RONITERVO/StateBeats/blob/main/docs/CHOREOGRAPHY.md).\n`,
  );
}
