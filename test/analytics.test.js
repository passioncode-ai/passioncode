'use strict';
// PC-123: anonymous usage and error counts, on by default, off for this product alone.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const A = require('../lib/analytics');

const ROOT = path.resolve(__dirname, '..');
const KEY = 'A-SH-1234567890';
const homes = [];
test.after(() => { for (const h of homes) fs.rmSync(h, { recursive: true, force: true }); });
function home() { const h = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-analytics-')); homes.push(h); return h; }

function recorder(status = 200) {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: status < 300, status }; };
  return { calls, fetchImpl };
}
const quiet = () => { const out = []; return { out, stream: { write: (s) => out.push(s) } }; };
const base = (h, extra = {}) => ({ command: 'doctor', code: 0, json: false, startedAt: Date.parse('2026-11-05T10:00:00Z') - 1500,
  version: '0.2.76', state: path.join(h, '.passioncode'), env: {}, key: KEY, home: h, platform: 'linux',
  now: new Date('2026-11-05T10:00:00Z'), ...extra });

test('PC-123: the first run says so once on stderr, then sends installed, active and the command', async () => {
  const h = home();
  const r = recorder(); const err = quiet();
  const first = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: err.stream }));
  assert.equal(err.out.join(''), A.NOTICE + '\n');
  assert.equal(first.sent, 3);
  assert.equal(r.calls[0].url, 'https://analytics.passioncode.ai/api/v0/events');
  assert.equal(r.calls[0].init.headers['App-Key'], KEY);
  assert.deepEqual(r.calls[0].body.map((e) => e.eventName), ['app_installed', 'app_active', 'command_run']);
  assert.deepEqual(r.calls[0].body[2].props.command, 'doctor');
  assert.equal(r.calls[0].body[2].props.duration, '1-10s');
  assert.equal(r.calls[0].body[2].props.environment, 'production');
  const id = r.calls[0].body[0].props.install_id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, '.config', 'PassionCode', 'installation.json'), 'utf8')).id, id, 'the shared file holds the id');
  // The same day, the same version: the command only, and no second notice.
  const again = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: err.stream, code: 1, command: 'setup' }));
  assert.equal(err.out.length, 1);
  assert.deepEqual(again.body.map((e) => e.eventName), ['command_run', 'app_error']);
  assert.deepEqual(again.body[1].props, { where: 'setup', code: 'other', install_id: id, iid: id, environment: 'production' });
  // A new version and a new day.
  const next = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: err.stream, version: '0.2.77', now: new Date('2026-11-06T09:00:00Z') }));
  assert.deepEqual(next.body.map((e) => [e.eventName, e.props.from]), [['app_updated', '0.2.76'], ['app_active', undefined], ['command_run', undefined]]);
});

test('PC-123: a --json run before the notice sends nothing and prints nothing', async () => {
  const h = home(); const r = recorder(); const err = quiet();
  assert.deepEqual(await A.after(base(h, { json: true, fetchImpl: r.fetchImpl, stderr: err.stream })), { sent: 0, waiting: 'notice' });
  assert.equal(r.calls.length, 0);
  assert.equal(err.out.length, 0);
  await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: err.stream }));
  const after = await A.after(base(h, { json: true, fetchImpl: r.fetchImpl, stderr: err.stream }));
  assert.equal(after.body.at(-1).props.json, true, 'after the notice, a --json run is counted');
  assert.equal(err.out.length, 1);
});

test('PC-123: off, PASSIONCODE_ANALYTICS=off, DO_NOT_TRACK and a build with no key send nothing and store nothing', async () => {
  for (const [name, extra, prep] of [
    ['off', {}, (s) => A.setEnabled(s, false)],
    ['env', { env: { PASSIONCODE_ANALYTICS: 'OFF' } }],
    ['do-not-track', { env: { DO_NOT_TRACK: '1' } }],
    ['no-key', { key: null }],
  ]) {
    const h = home(); const r = recorder(); const err = quiet();
    const opts = base(h, { fetchImpl: r.fetchImpl, stderr: err.stream, ...extra });
    if (prep) prep(opts.state);
    assert.deepEqual(await A.after(opts), { sent: 0 }, name);
    assert.equal(r.calls.length, 0, name);
    assert.equal(err.out.length, 0, name);
    assert.equal(fs.existsSync(path.join(h, '.config', 'PassionCode', 'installation.json')), false, `${name}: no installation file`);
    assert.equal(A.status({ state: opts.state, env: opts.env, key: opts.key }).reason, name);
  }
  // The shared file's own `analytics` field belongs to the apps: it never turns the launcher off.
  const h = home(); const r = recorder();
  const shared = path.join(h, '.config', 'PassionCode', 'installation.json');
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  fs.writeFileSync(shared, JSON.stringify({ version: 1, id: '11111111-2222-4333-8444-555555555555', analytics: false, created_at: 1 }));
  const sent = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: quiet().stream }));
  assert.equal(sent.body[0].props.install_id, '11111111-2222-4333-8444-555555555555');
  assert.equal(JSON.parse(fs.readFileSync(shared, 'utf8')).analytics, false, 'the shared file is never rewritten');
});

test('PC-123: no payload carries a path, a user name, a rule or a token', async () => {
  const h = home(); const r = recorder();
  const secret = 'sk-test-0000000000000000';
  await A.after(base(h, { command: `setup ${h} Bash(rm:*) ${secret}`, fetchImpl: r.fetchImpl, stderr: quiet().stream,
    env: { HOME: h, USER: 'example-person', PASSIONCODE_TOKEN: secret } }));
  const text = JSON.stringify(r.calls[0].body);
  for (const planted of [h, 'example-person', 'Bash(rm', secret, os.userInfo().username]) assert.ok(!text.includes(planted), planted);
  assert.equal(r.calls[0].body.at(-1).props.command, 'help', 'a command not in the list is sent as help');
  for (const e of r.calls[0].body) for (const [k, v] of Object.entries(e.props)) assert.ok(typeof v !== 'string' || k === 'install_id' || k === 'iid' || /^[a-z0-9._-]+$/.test(v), `${k}=${v}`);
});

test('PC-123: a failed or slow send never fails the command', async () => {
  const h = home();
  assert.deepEqual(await A.after(base(h, { fetchImpl: async () => { throw new Error('offline'); }, stderr: quiet().stream })), { sent: 0 });
  assert.equal((await A.after(base(h, { fetchImpl: async () => ({ ok: false, status: 500 }), stderr: quiet().stream }))).sent, 0);
});

test('PC-123: the analytics command turns it off and on and reports why it sends nothing', () => {
  const h = home();
  const env = { ...process.env, HOME: h, USERPROFILE: h, PASSIONCODE_HOME: path.join(h, '.passioncode') };
  delete env.DO_NOT_TRACK; delete env.PASSIONCODE_ANALYTICS;
  const run = (...args) => spawnSync(process.execPath, [path.join(ROOT, 'bin', 'passioncode.js'), 'analytics', ...args], { env, encoding: 'utf8' });
  assert.equal(JSON.parse(run('status', '--json').stdout).reason, 'no-key', 'a checkout carries no key');
  assert.equal(run('off').status, 0);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, '.passioncode', 'analytics.json'), 'utf8')).enabled, false);
  assert.match(run().stdout, /Anonymous usage and error counts: turned off \(analytics off\)\./);
  assert.equal(run('on').status, 0);
  assert.equal(JSON.parse(run('status', '--json').stdout).enabled, true);
  assert.equal(run('maybe').status, 2);
});

test('PC-123: the SessionStart background update sends no counts', () => {
  const src = fs.readFileSync(path.join(ROOT, 'plugin', 'passioncode', 'hooks', 'session-start.js'), 'utf8');
  assert.match(src, /env: \{ \.\.\.process\.env, PASSIONCODE_ANALYTICS: 'off' \}/);
});

test('PC-123: every event the code sends is in the catalogue, at its line', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib', 'analytics.js'), 'utf8').split('\n');
  const emits = [];
  src.forEach((line, i) => { for (const m of line.matchAll(/out\.push\(\['([a-z_]+)'/g)) emits.push([m[1], i + 1]); });
  assert.ok(emits.length >= 5, 'the emits were found');
  const doc = fs.readFileSync(path.join(ROOT, 'docs', 'analytics-events.md'), 'utf8');
  for (const [name, line] of emits) {
    assert.match(doc, new RegExp(`\\| \`${name}\` \\| (live|retired[^|]*) \\| lib/analytics\\.js:${line} \\|`), `${name} at lib/analytics.js:${line}`);
  }
});
