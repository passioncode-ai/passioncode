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

// Runs scripts/test.mjs on the fixture with the outer temporary folder pointed at `outer`. A timeout: a runner
// that ignored its arguments would start the whole suite again, inside itself.
function runFixture(outer, extra = {}, flags = []) {
  // Without NODE_TEST_CONTEXT the inner run reports as a run of its own, not to this one.
  const { NODE_TEST_CONTEXT, ...env } = process.env; // eslint-disable-line no-unused-vars
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts/test.mjs'), ...flags, path.join(__dirname, 'fixtures/leaves-temp.fixture.js')], {
    // Named files run inside a marked run too: the nesting guard refuses only a whole run.
    encoding: 'utf8', timeout: 60000, env: { ...env, PASSIONCODE_TEST_RUN: '1', TMPDIR: outer, TMP: outer, TEMP: outer, ...extra },
  });
}

test('PC-115: a test run leaves nothing in the temporary folder, a child process\'s folders included', () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-tmp-'));
  try {
    const r = runFixture(outer);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /pass 1/, r.stdout);
    assert.deepEqual(fs.readdirSync(outer), [], 'the run removed its folder and everything in it');
    // A failing run fails the run, and still leaves nothing.
    const failing = runFixture(outer, { PC115_FIXTURE_FAILS: '1' });
    assert.notEqual(failing.status, 0, failing.stdout + failing.stderr);
    assert.match(failing.stdout, /fail 1/, failing.stdout);
    assert.deepEqual(fs.readdirSync(outer), []);
    // An argument that starts with - reaches node --test: a pattern no test matches skips the failing one.
    const filtered = runFixture(outer, { PC115_FIXTURE_FAILS: '1' }, ['--test-name-pattern=no-such-test']);
    assert.equal(filtered.status, 0, filtered.stdout + filtered.stderr);
    assert.doesNotMatch(filtered.stdout, /fail 1/, filtered.stdout);
    assert.deepEqual(fs.readdirSync(outer), []);
  } finally {
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test('PC-115: a run whose folder cannot be removed fails, and says so', { skip: process.platform === 'win32' && 'a folder without write permission is a POSIX case' }, () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-tmp-'));
  try {
    const r = runFixture(outer, { PC115_FIXTURE_STUCK: '1' });
    assert.notEqual(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /pass 1/, r.stdout); // the tests passed; the run fails for its folder
    assert.match(r.stderr, /could not be removed/, r.stderr);
  } finally {
    for (const run of fs.readdirSync(outer)) {
      const stuck = path.join(outer, run, 'stuck');
      if (fs.existsSync(stuck)) fs.chmodSync(stuck, 0o700);
    }
    fs.rmSync(outer, { recursive: true, force: true });
  }
});

test('PC-115: a whole run refuses to start inside another run', () => {
  const inner = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-test-'));
  try {
    const { NODE_TEST_CONTEXT, ...env } = process.env; // eslint-disable-line no-unused-vars
    const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts/test.mjs')], { encoding: 'utf8', timeout: 60000, env: { ...env, PASSIONCODE_TEST_RUN: '1', TMPDIR: inner, TMP: inner, TEMP: inner } });
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /cannot start inside another one/);
  } finally {
    fs.rmSync(inner, { recursive: true, force: true });
  }
});

test('PC-115: the full run is given a folder of its own', { skip: !process.env.npm_lifecycle_event && 'run through npm test' }, () => {
  assert.match(path.basename(os.tmpdir()), /^pc-test-/, os.tmpdir());
});
