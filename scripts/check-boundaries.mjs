import ts from 'typescript';
import { readFile, readdir } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
const failures = [];
for (const name of await readdir('packages/core/src')) {
  if (!name.endsWith('.ts')) continue;
  const file = join('packages/core/src', name),
    text = await readFile(file, 'utf8');
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (
        spec &&
        ts.isStringLiteral(spec) &&
        (!spec.text.startsWith('./') ||
          !resolve(dirname(file), spec.text).startsWith(resolve('packages/core/src')))
      )
        failures.push(`${file}: external dependency ${spec.text}`);
    }
    if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
      const callee = node.expression.getText(ast);
      if (
        /^(Date|performance\.|fetch$|setTimeout$|setInterval$|requestAnimationFrame$|Math\.(random|sin|cos|tan|atan2|pow|exp|log))/.test(
          callee,
        )
      )
        failures.push(`${file}: forbidden host/approximation ${callee}`);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
const pkg = JSON.parse(await readFile('packages/core/package.json', 'utf8'));
if (Object.keys(pkg.dependencies ?? {}).length)
  failures.push('Core runtime dependencies must be empty');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else console.log('Core dependency and host-API boundaries verified.');
