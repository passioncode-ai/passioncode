'use strict';
// PC-115 fixture: a test that leaves temporary folders behind, its own and a child process's.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('leaves its temporary folders', async () => {
  // The run's own folder, under every name a tool reads it by (TMPDIR on POSIX, TEMP and TMP on Windows).
  for (const key of ['TMPDIR', 'TMP', 'TEMP']) assert.equal(process.env[key], os.tmpdir(), key);
  assert.match(path.basename(os.tmpdir()), /^pc-test-/);
  assert.equal(process.env.PASSIONCODE_TEST_RUN, '1');
  if (process.env.PC115_FIXTURE_FAILS) assert.fail('the fixture fails on request');
  if (process.env.PC116_FIXTURE_KILLS_RUNNER) process.kill(process.ppid, 'SIGKILL'); // node --test dies by a signal
  if (process.env.PC116_FIXTURE_WAITS) { // a run to interrupt: says it started (and its pid), then waits
    fs.writeFileSync(process.env.PC116_FIXTURE_WAITS, String(process.pid));
    fs.writeFileSync(path.join(os.tmpdir(), 'started'), '');
    await new Promise((resolve) => setTimeout(resolve, 30000));
  }
  if (process.env.PC115_FIXTURE_STUCK) { // a folder the run cannot remove (POSIX: no write permission on it)
    const stuck = path.join(os.tmpdir(), 'stuck');
    fs.mkdirSync(stuck);
    fs.writeFileSync(path.join(stuck, 'held'), '');
    fs.chmodSync(stuck, 0o500);
  }
  fs.mkdtempSync(path.join(os.tmpdir(), 'pc-fixture-'));
  require('node:child_process').execFileSync(process.execPath, ['-e', "require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'pc-child-'))"]);
});
