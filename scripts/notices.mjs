import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
let text =
  '# Third-party notices\n\nGenerated from the exact installed lockfile, including build/test dependencies.\nOriginal StateBeats code is MIT; original maps and procedural audio are CC0-1.0, except the Apache-2.0 Ink-Battle collaboration (see CONTENT_LICENSE.md).\n\n';
text += `## Ink-Battle collaboration\n\n${await readFile('packages/ink-battle/NOTICE', 'utf8')}\n\n~~~text\n${await readFile('packages/ink-battle/LICENSE', 'utf8')}\n~~~\n\n`;
const missing = [];
for (const [path, info] of Object.entries(lock.packages).sort()) {
  if (!path.startsWith('node_modules/') || info.link) continue;
  let pkg;
  try {
    pkg = JSON.parse(await readFile(join(path, 'package.json'), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && info.optional) continue;
    throw error;
  }
  text += `## ${pkg.name} ${pkg.version}\n\nDeclared license: ${typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license)}\n\n`;
  const files = (await readdir(path)).filter((n) =>
    /^(license|licence|copying|notice)(\.|$|-)/i.test(n),
  );
  let found = false;
  for (const name of files)
    try {
      text += `### ${name}\n\n~~~text\n${await readFile(join(path, name), 'utf8')}\n~~~\n\n`;
      found = true;
    } catch {}
  if (!found) {
    if (pkg.name.startsWith('@rolldown/binding-')) {
      text += `### Parent rolldown distribution license\n\n~~~text\n${await readFile('node_modules/rolldown/LICENSE', 'utf8')}\n~~~\n\n`;
      continue;
    }
    if (pkg.name === 'stackback') {
      const source = await readFile(join(path, 'formatstack.js'), 'utf8');
      text += `### Included V8 source notice (formatstack.js)\n\n~~~text\n${source.split(/\r?\n\r?\n/)[0]}\n~~~\n\n`;
      text +=
        'The package author declares MIT for the package; the included V8 source retains the notice above.\n\n';
      continue;
    }
    missing.push(pkg.name);
    text +=
      'No separate license file distributed in this installed package; see its declared SPDX license above.\n\n';
  }
}
await writeFile('THIRD_PARTY_NOTICES.md', text);
console.log(
  JSON.stringify({ written: 'THIRD_PARTY_NOTICES.md', withoutSeparateLicenseFile: missing }),
);
