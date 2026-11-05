'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
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
  // Without NODE_TEST_CONTEXT the inner run reports as a run of its own, not to this one; without this run's
  // mark the fixture sees only the one the runner sets.
  const { NODE_TEST_CONTEXT, PASSIONCODE_TEST_RUN, ...env } = process.env; // eslint-disable-line no-unused-vars
  return spawnSync(process.execPath, [path.join(ROOT, 'scripts/test.mjs'), ...flags, path.join(__dirname, 'fixtures/leaves-temp.fixture.js')], {
    encoding: 'utf8', timeout: 60000, env: { ...env, TMPDIR: outer, TMP: outer, TEMP: outer, ...extra },
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
    // Named files run inside a marked run too: the nesting guard refuses only a whole run.
    const failing = runFixture(outer, { PC115_FIXTURE_FAILS: '1', PASSIONCODE_TEST_RUN: '1' });
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

test('PC-115: a run whose folder cannot be removed fails, and says so', { skip: (process.platform === 'win32' && 'a folder without write permission is a POSIX case') || (process.getuid?.() === 0 && 'root removes it anyway') }, () => {
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

// Starts the runner on the fixture in its own process group, as a terminal does, with the outer temporary folder
// pointed at `outer`; resolves with how it ended. A timer bounds a runner that never ends.
function startRunner(outer, extra) {
  const { NODE_TEST_CONTEXT, PASSIONCODE_TEST_RUN, ...env } = process.env; // eslint-disable-line no-unused-vars
  const runner = require('node:child_process').spawn(process.execPath, [path.join(ROOT, 'scripts/test.mjs'), path.join(__dirname, 'fixtures/leaves-temp.fixture.js')], {
    env: { ...env, ...extra, TMPDIR: outer, TMP: outer, TEMP: outer }, stdio: 'ignore', detached: true,
  });
  let timer;
  const ended = new Promise((resolve) => {
    timer = setTimeout(() => { runner.kill('SIGKILL'); resolve({ code: 'timeout' }); }, 30000);
    runner.once('exit', (code, signal) => { clearTimeout(timer); resolve({ code, signal }); });
  });
  return { runner, ended };
}
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };

for (const [name, send] of [
  ['SIGINT to the whole group (Ctrl-C in a terminal)', (r) => process.kill(-r.pid, 'SIGINT')],
  ['SIGTERM to the runner', (r) => r.kill('SIGTERM')],
  // Two signals of one kind sent at once can arrive as one; the second comes while node --test still winds down.
  ['SIGTERM twice, the second while the tests stop', (r) => { r.kill('SIGTERM'); setTimeout(() => r.kill('SIGTERM'), 300); }],
]) {
  test(`PC-116: an interrupted run stops its tests, fails and removes its folder: ${name}`, { skip: process.platform === 'win32' && 'Windows has no signals to catch' }, async () => {
    const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-tmp-'));
    const pidFile = path.join(os.tmpdir(), `pc-116-pid-${process.pid}-${Date.now()}`);
    try {
      const { runner, ended } = startRunner(outer, { PC116_FIXTURE_WAITS: pidFile });
      const started = () => fs.readdirSync(outer).some((run) => fs.existsSync(path.join(outer, run, 'started')));
      for (const until = Date.now() + 20000; !started() && Date.now() < until;) await new Promise((r) => setTimeout(r, 100));
      assert.ok(started(), 'the fixture started inside the run');
      const fixturePid = Number(fs.readFileSync(pidFile, 'utf8'));
      send(runner);
      const { code, signal } = await ended;
      assert.notEqual(code, 'timeout');
      assert.ok(code !== 0, `the run fails (exit ${code}, signal ${signal})`);
      assert.deepEqual(fs.readdirSync(outer), [], 'the interrupted run removed its folder');
      for (const until = Date.now() + 5000; alive(fixturePid) && Date.now() < until;) await new Promise((r) => setTimeout(r, 100));
      assert.ok(!alive(fixturePid), 'the test process was stopped, not left running');
    } finally {
      fs.rmSync(pidFile, { force: true });
      fs.rmSync(outer, { recursive: true, force: true });
    }
  });
}

test('PC-116: node --test killed by a signal the runner did not get fails the run, and the folder goes', { skip: process.platform === 'win32' && 'Windows has no signals to send' }, async () => {
  const outer = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-tmp-'));
  try {
    const { ended } = startRunner(outer, { PC116_FIXTURE_KILLS_RUNNER: '1' });
    const { code, signal } = await ended;
    assert.equal(signal, null);
    assert.ok(code !== 0 && code !== 'timeout', `exit ${code}`);
    assert.deepEqual(fs.readdirSync(outer), []);
  } finally {
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

test('PC-115: the full run is given a folder of its own', { skip: !['test', 'prepublishOnly'].includes(process.env.npm_lifecycle_event) && 'run through npm test' }, () => {
  assert.match(path.basename(os.tmpdir()), /^pc-test-/, os.tmpdir());
});
