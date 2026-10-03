'use strict';
// The launcher held to the organization's lifecycle contract
// (fabric-workspace knowledge/lifecycle.md): one update at a time (LC-03, F14), and the
// launcher's own releases kept at current + previous (LC-11, LC-15, F15). Every test runs in
// a temp HOME against the fake `claude` CLI.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin/passioncode.js');
const LAUNCHER = path.join(ROOT, 'lib/launcher.js');
const FAKE = path.join(__dirname, 'fake-claude.js');
const MEMBERS = [{ name: 'example-agent', version: '0.1.0', skills: ['example-agent'], legacyPluginIds: [] }];

function makePayload(dir, version, members = MEMBERS) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  for (const m of members) {
    fs.mkdirSync(path.join(dir, 'plugins', m.name, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugins', m.name, '.claude-plugin/plugin.json'), JSON.stringify({ name: m.name, version: m.version }));
    for (const s of m.skills) {
      fs.mkdirSync(path.join(dir, 'plugins', m.name, 'skills', s), { recursive: true });
      fs.writeFileSync(path.join(dir, 'plugins', m.name, 'skills', s, 'SKILL.md'), `---\nname: ${s}\n---\n${version}\n`);
    }
  }
  fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'passioncode', plugins: members.map((m) => ({ name: m.name, source: `./plugins/${m.name}` })) }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ family: 'passioncode', version, members }));
}

function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-life-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const env = { home: path.join(base, 'home'), payload: path.join(base, 'payload') };
  fs.mkdirSync(env.home);
  return env;
}

function run(env, ...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_CLAUDE: FAKE, PASSIONCODE_HOME: '' } });
}

function install(env, version) {
  makePayload(env.payload, version);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  return JSON.parse(r.stdout);
}

const releases = (env) => fs.readdirSync(path.join(env.home, '.passioncode/releases')).sort();

// --- LC-11 / LC-15 (F15): current + previous release ----------------------------------------

test('LC-15 after four updates only the current and the previous release remain', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  install(env, '0.1.1');
  assert.deepEqual(releases(env), ['0.1.0', '0.1.1']);
  install(env, '0.1.2');
  const last = install(env, '0.1.3');
  assert.deepEqual(releases(env), ['0.1.2', '0.1.3']);
  assert.equal(fs.readlinkSync(path.join(env.home, '.passioncode/current')), path.join(env.home, '.passioncode/releases/0.1.3'));
  const prune = last.steps.find((s) => s.kind === 'prune');
  assert.equal(prune.outcome, 'done');
  assert.match(prune.detail, /0\.1\.1/);
});

test('LC-15 the previous release is the one that was installed, not the newest other one', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  install(env, '0.1.5');
  // A downgrade to 0.1.3 (a rollback published as a new install) keeps 0.1.5, the one it replaced.
  install(env, '0.1.3');
  assert.deepEqual(releases(env), ['0.1.3', '0.1.5']);
  // Re-running the same version keeps a rollback target too.
  install(env, '0.1.3');
  assert.deepEqual(releases(env), ['0.1.3', '0.1.5']);
});

test('LC-12 a partial release left by a killed update is swept', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  const partial = path.join(env.home, '.passioncode/releases/0.1.1.99999.partial');
  fs.mkdirSync(path.join(partial, 'plugins'), { recursive: true });
  install(env, '0.1.1');
  assert.deepEqual(releases(env), ['0.1.0', '0.1.1']);
});

test('LC-15 a dry run plans the prune and removes nothing; stray files are left alone', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  install(env, '0.1.1');
  install(env, '0.1.2');
  fs.writeFileSync(path.join(env.home, '.passioncode/releases/NOTES.txt'), 'mine');
  makePayload(env.payload, '0.1.3');
  const r = run(env, 'update', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'prune' && s.outcome === 'planned'));
  assert.deepEqual(releases(env), ['0.1.1', '0.1.2', 'NOTES.txt']);
});

// --- LC-03 (F14): one update at a time ------------------------------------------------------

/** A second process that holds the update lock until told to stop. */
function holdLock(env) {
  const state = path.join(env.home, '.passioncode');
  const child = spawn(process.execPath, ['-e', `
    const L = require(${JSON.stringify(LAUNCHER)});
    const lock = L.acquireUpdateLock(L.paths(${JSON.stringify(env.home)}));
    process.stdout.write('held\\n');
    process.stdin.once('data', () => { lock.release(); process.exit(0); });
  `], { stdio: ['pipe', 'pipe', 'inherit'], env: { ...process.env, HOME: env.home, PASSIONCODE_HOME: state } });
  return new Promise((resolve, reject) => {
    const failed = (code) => reject(new Error(`the lock holder exited (${code}) before taking the lock`));
    child.once('exit', failed);
    child.stdout.once('data', () => (child.off('exit', failed), resolve({
      pid: child.pid,
      stop: () => new Promise((done) => { child.once('exit', done); child.stdin.write('x'); }),
    })));
  });
}

test('LC-03 a second update refuses while one holds the lock, and names the holder', async (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  const holder = await holdLock(env);
  try {
    makePayload(env.payload, '0.1.1');
    const r = run(env, 'update');
    assert.equal(r.status, 1);
    assert.match(r.stderr, new RegExp(`update is already running \\(process ${holder.pid} holds `));
    assert.deepEqual(releases(env), ['0.1.0'], 'nothing was installed');
    for (const cmd of ['restore', 'uninstall']) {
      const other = run(env, cmd);
      assert.equal(other.status, 1, cmd);
      assert.match(other.stderr, /already running/, cmd);
    }
  } finally {
    await holder.stop();
  }
  const after = run(env, 'update');
  assert.equal(after.status, 0, after.stderr);
  assert.deepEqual(releases(env), ['0.1.0', '0.1.1']);
});

test('LC-03 a lock file left by a dead process does not block the next update', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  // A pid that cannot be alive: the lock records it, but no process holds the lock.
  fs.writeFileSync(path.join(env.home, '.passioncode/update.lock'), '2147483646');
  makePayload(env.payload, '0.1.1');
  const r = run(env, 'update');
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(releases(env), ['0.1.0', '0.1.1']);
});

test('LC-03 the lock is released when the update fails', (t) => {
  const env = setup(t);
  install(env, '0.1.0');
  makePayload(env.payload, '0.1.1');
  fs.writeFileSync(path.join(env.payload, 'manifest.json'), '{"broken": true}');
  assert.equal(run(env, 'update').status, 1);
  makePayload(env.payload, '0.1.1');
  assert.equal(run(env, 'update').status, 0);
});
