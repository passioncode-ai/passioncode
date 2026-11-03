'use strict';
// PC-115: a test run leaves nothing in the system's temporary folder. scripts/test.mjs gives the run a
// folder of its own (TMPDIR, TMP, TEMP, inherited by the processes the tests start) and removes it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

test('PC-115: a test run leaves nothing in the temporary folder, a child process\'s folders included', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-tmp-'));
  // Without NODE_TEST_CONTEXT the inner run reports as a run of its own, not to this one.
  const { NODE_TEST_CONTEXT, ...env } = process.env; // eslint-disable-line no-unused-vars
  try {
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test.mjs'), path.join(__dirname, 'fixtures/leaves-temp.fixture.js')], {
      encoding: 'utf8', env: { ...env, TMPDIR: outer, TMP: outer, TEMP: outer },
    });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /pass 1/, r.stdout);
    assert.deepEqual(fs.readdirSync(outer), [], 'the run removed its folder and everything in it');
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test('PC-115: the full run is given a folder of its own', { skip: !process.env.npm_lifecycle_event && 'run through npm test' }, () => {
  assert.match(path.basename(os.tmpdir()), /^pc-test-/, os.tmpdir());
});
