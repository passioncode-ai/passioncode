'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const script = path.join(root, 'scripts/pack-carries.mjs');
const pack = {
  name: '@passioncode-ai/passioncode', version: '0.2.77',
  filename: 'passioncode-ai-passioncode-0.2.77.tgz', integrity: 'sha512-fixture',
  files: [{ path: 'package.json' }, { path: 'lib/analytics-key.json' }],
};
const run = (stdin, args = ['lib/analytics-key.json']) =>
  spawnSync(process.execPath, [script, ...args], { input: stdin, encoding: 'utf8' });

test('0.2.77: the App Key check reads npm 12\'s name-keyed pack output (run 42680768155)', () => {
  const r = run(JSON.stringify({ [pack.name]: pack }));
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /lib\/analytics-key\.json is in the package/);
});

test('0.2.77: the App Key check still reads npm 11\'s array', () => {
  assert.equal(run(JSON.stringify([pack])).status, 0);
});

test('0.2.77: a package without the key, or output that is not one package, fails without a stack', () => {
  const without = { ...pack, files: [{ path: 'package.json' }] };
  for (const out of [JSON.stringify([without]), JSON.stringify({ [pack.name]: without })]) {
    const r = run(out);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /does not carry lib\/analytics-key\.json/);
  }
  for (const out of ['not json', '[]', JSON.stringify([pack, pack])]) {
    const r = run(out);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /could not read npm pack's output/);
    assert.doesNotMatch(r.stderr, /TypeError|at Socket/);
  }
  assert.equal(run(JSON.stringify([pack]), []).status, 2);
});

test('0.2.77: release.yml checks the packed key through pack-carries, not by indexing an array', () => {
  const wf = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8');
  assert.match(wf, /npm pack --dry-run --json --ignore-scripts \| node scripts\/pack-carries\.mjs lib\/analytics-key\.json/);
  assert.doesNotMatch(wf, /JSON\.parse\(s\)\[0\]/);
});
