import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bundleDependencies } from './bundle-dependencies.mjs';
import { execFileSync } from 'node:child_process';

function pkg(root, name, version, dependencies = {}) {
  mkdirSync(root, { recursive: true });
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name, version, dependencies, main: 'index.js' }));
  writeFileSync(join(root, 'index.js'), `module.exports = ${JSON.stringify(version)}`);
}
test('Portable graph materializes nested version conflicts without development dependency links', () => {
  const temp = mkdtempSync(join(tmpdir(), 'presentationos-closure-test-'));
  try {
    const source = join(temp, 'source'), out = join(temp, 'portable');
    pkg(source, 'desktop', '1', { a: '*', b: '*' });
    pkg(join(source, 'node_modules/a'), 'a', '1', { shared: '*' });
    pkg(join(source, 'node_modules/b'), 'b', '1', { shared: '*' });
    pkg(join(source, 'node_modules/a/node_modules/shared'), 'shared', '1');
    pkg(join(source, 'node_modules/b/node_modules/shared'), 'shared', '2');
    writeFileSync(join(source, 'node_modules/a/index.js'), "module.exports = require('shared')");
    writeFileSync(join(source, 'node_modules/b/index.js'), "module.exports = require('shared')");
    bundleDependencies(source, out);
    assert.equal(execFileSync(process.execPath, ['-p', "require('a')"], { cwd: out, encoding: 'utf8' }).trim(), '1');
    assert.equal(execFileSync(process.execPath, ['-p', "require('b')"], { cwd: out, encoding: 'utf8' }).trim(), '2');
    assert.equal(existsSync(join(out, 'node_modules/a/node_modules')), false);
    assert.equal(existsSync(join(out, 'node_modules/b/node_modules/shared')), true);
  } finally { assert.ok(temp.startsWith(join(tmpdir(), 'presentationos-closure-test-'))); rmSync(temp, { recursive: true, force: true }); }
});
