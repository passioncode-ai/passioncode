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
  assert.equal(r.calls[0].body[0].props.existing, 'false', 'no launcher state before: a new install');
  assert.deepEqual(r.calls[0].body[2].props.command, 'doctor');
  assert.equal(r.calls[0].body[2].props.duration, '1-10s');
  assert.equal(r.calls[0].body[2].props.environment, 'production');
  const id = r.calls[0].body[0].props.iid;
  assert.match(id, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(h, '.config', 'PassionCode', 'installation.json'), 'utf8')).id, id, 'the shared file holds the id');
  // The same day, the same version: the command only, and no second notice.
  const again = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: err.stream, code: 1, command: 'setup' }));
  assert.equal(err.out.length, 1);
  assert.deepEqual(again.body.map((e) => e.eventName), ['command_run', 'app_error']);
  assert.deepEqual(again.body[1].props, { where: 'setup', code: 'other', surface: 'cli', iid: id, install_id: id, environment: 'production' });
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
  assert.equal(after.body.at(-1).props.json, 'true', 'after the notice, a --json run is counted');
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
  // Another app made the shared file: its id is used as it is (its `analytics` no is the next test's).
  const h = home(); const r = recorder();
  const shared = path.join(h, '.config', 'PassionCode', 'installation.json');
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  fs.writeFileSync(shared, JSON.stringify({ version: 1, id: '11111111-2222-4333-8444-555555555555', analytics: true, created_at: 1 }));
  const sent = await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: quiet().stream }));
  assert.equal(sent.body[0].props.iid, '11111111-2222-4333-8444-555555555555');
  assert.equal(JSON.parse(fs.readFileSync(shared, 'utf8')).analytics, true, 'the shared file is never rewritten');
});

test('PC-123: no payload carries a path, a user name, a rule or a token', async () => {
  const h = home(); const r = recorder();
  const secret = 'sk-test-0000000000000000';
  await A.after(base(h, { command: `setup ${h} Bash(rm:*) ${secret}`, fetchImpl: r.fetchImpl, stderr: quiet().stream,
    env: { HOME: h, USER: 'example-person', PASSIONCODE_TOKEN: secret } }));
  const text = JSON.stringify(r.calls[0].body);
  for (const planted of [h, 'example-person', 'Bash(rm', secret, os.userInfo().username]) assert.ok(!text.includes(planted), planted);
  assert.equal(r.calls[0].body.at(-1).props.command, 'other', 'a command not in the list is sent as other');
  for (const e of r.calls[0].body) for (const [k, v] of Object.entries(e.props)) assert.ok(typeof v !== 'string' || k === 'iid' || k === 'install_id' || /^[a-z0-9._-]+$/.test(v), `${k}=${v}`);
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
  assert.match(run().stdout, /Anonymous usage and error counts from the launcher: turned off \(analytics off\)\. Each PassionCode app has its own switch\./);
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

test('PC-123: every event carries iid, surface cli and an environment growth counts', async () => {
  for (const [version, environment] of [['0.2.76', 'production'], ['0.2.77-rc.1', 'sandbox'], ['0.2.77-beta.2', 'sandbox'], ['0.2.76+local', 'sandbox']]) {
    const h = home(); const r = recorder();
    await A.after(base(h, { version, fetchImpl: r.fetchImpl, stderr: quiet().stream, code: 1 }));
    for (const e of r.calls[0].body) {
      assert.match(e.props.iid, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, `${version} ${e.eventName}`);
      assert.equal(e.props.surface, 'cli');
      assert.equal(e.props.environment, environment, version);
      assert.equal(e.systemProps.isDebug, environment !== 'production');
      assert.equal(e.props.install_id, e.props.iid, 'install_id is always iid: the family joins on it');
    }
  }
});

test('PC-123: the real command keeps its exit code, and a host that never answers costs at most about two seconds', () => {
  const h = home();
  const keyFile = path.join(h, 'key.json');
  fs.writeFileSync(keyFile, JSON.stringify({ appKey: KEY }));
  const preload = path.join(h, 'fetch.js'); // no request leaves the machine: fetch is replaced before the CLI loads
  fs.writeFileSync(preload, `const fs = require('fs'); globalThis.fetch = (url, init) => { fs.appendFileSync(${JSON.stringify(path.join(h, 'sent.log'))}, init.body + '\\n'); return new Promise((resolve, reject) => { if (process.env.HANG) { const hold = setInterval(() => {}, 1000); init.signal.addEventListener('abort', () => { clearInterval(hold); reject(new Error('aborted')); }); } else resolve({ ok: true, status: 200 }); }); };`);
  const env = { ...process.env, HOME: h, USERPROFILE: h, APPDATA: path.join(h, 'AppData'), XDG_CONFIG_HOME: path.join(h, '.config'),
    PASSIONCODE_HOME: path.join(h, '.passioncode'), PASSIONCODE_ANALYTICS_KEY_FILE: keyFile };
  delete env.DO_NOT_TRACK; delete env.PASSIONCODE_ANALYTICS;
  const run = (args, extra = {}) => spawnSync(process.execPath, ['--require', preload, path.join(ROOT, 'bin', 'passioncode.js'), ...args], { env: { ...env, ...extra }, encoding: 'utf8' });
  const usage = run(['analytics', 'maybe']);
  assert.equal(usage.status, 2);
  assert.match(usage.stderr, /The PassionCode launcher sends anonymous usage and error counts/);
  const failed = run(['config', 'set', 'update.auto', 'maybe']);
  assert.ok([1, 2].includes(failed.status), 'the command ends as it would without counts');
  const sent = fs.readFileSync(path.join(h, 'sent.log'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(sent[0].map((e) => [e.eventName, e.props.command, e.props.outcome]).filter((x) => x[0] === 'command_run'), [['command_run', 'analytics', 'usage']]);
  const t0 = Date.now();
  const slow = run(['analytics', 'status'], { HANG: '1' });
  assert.equal(slow.status, 0);
  const took = Date.now() - t0; // the stub holds the process until the ceiling aborts the send
  assert.ok(took >= 1800 && took < 4000, `took ${took} ms`);
});

test('PC-124: on Linux the sessions row says doctor checks their apps on macOS and Windows only', () => {
  const h = home();
  const env = { ...process.env, HOME: h, USERPROFILE: h, PASSIONCODE_HOME: path.join(h, '.passioncode'), PASSIONCODE_PLATFORM: 'linux',
    PASSIONCODE_SERVICES_DIR: path.join(h, 'services'), PASSIONCODE_ANALYTICS: 'off', PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js') };
  const r = spawnSync(process.execPath, [path.join(ROOT, 'bin', 'passioncode.js'), 'doctor', '--json', '--offline'], { env, encoding: 'utf8' });
  const row = JSON.parse(r.stdout).checks.find((c) => c.id === 'sessions.on-demand');
  assert.deepEqual([row.state, row.detail], ['info', 'sessions Fabric starts on a board request: doctor checks the apps they need on macOS and Windows only']);
});

test('PC-123: a launcher installed before the counts says so in its first app_installed, and the sent fields are the documented ones', async () => {
  const h = home(); const r = recorder();
  fs.mkdirSync(path.join(h, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(h, '.passioncode', 'state.json'), JSON.stringify({ installed: '0.2.75' }));
  await A.after(base(h, { fetchImpl: r.fetchImpl, stderr: quiet().stream }));
  assert.deepEqual(r.calls[0].body[0].props.existing, 'true');
  const e = r.calls[0].body[0];
  assert.deepEqual(Object.keys(e).sort(), ['eventName', 'props', 'sessionId', 'systemProps', 'timestamp']);
  assert.deepEqual(Object.keys(e.systemProps).sort(), ['appBuildNumber', 'appVersion', 'engineName', 'engineVersion', 'isDebug', 'locale', 'osName', 'osVersion', 'sdkVersion']);
  assert.match(e.sessionId, /^\d{18}$/);
});

test('PC-123: a first command that writes the launcher state itself is still a new install', () => {
  const h = home();
  const keyFile = path.join(h, 'key.json');
  fs.writeFileSync(keyFile, JSON.stringify({ appKey: KEY }));
  const log = path.join(h, 'sent.log');
  const preload = path.join(h, 'fetch.js');
  fs.writeFileSync(preload, `globalThis.fetch = async (url, init) => { require('fs').appendFileSync(${JSON.stringify(log)}, init.body + '\\n'); return { ok: true, status: 200 }; };`);
  const env = { ...process.env, HOME: h, USERPROFILE: h, XDG_CONFIG_HOME: path.join(h, '.config'), APPDATA: path.join(h, 'AppData'),
    PASSIONCODE_HOME: path.join(h, '.passioncode'), PASSIONCODE_ANALYTICS_KEY_FILE: keyFile };
  delete env.DO_NOT_TRACK; delete env.PASSIONCODE_ANALYTICS;
  const r = spawnSync(process.execPath, ['--require', preload, path.join(ROOT, 'bin', 'passioncode.js'), 'config', 'set', 'update.auto', 'off'], { env, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(h, '.passioncode', 'state.json')), 'the command wrote the launcher state');
  const first = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n')[0]);
  assert.equal(first.find((e) => e.eventName === 'app_installed').props.existing, 'false');
});

test('PC-123: a state that cannot be written leaves no notice claimed and no installation file', async () => {
  const h = home(); const r = recorder(); const err = quiet();
  const opts = base(h, { fetchImpl: r.fetchImpl, stderr: err.stream });
  fs.mkdirSync(path.join(opts.state, 'analytics.json'), { recursive: true }); // a folder where the file goes: the write fails
  assert.equal((await A.after(opts)).sent, 0);
  assert.equal(err.out.length, 0, 'nothing said');
  assert.equal(fs.existsSync(path.join(h, '.config', 'PassionCode', 'installation.json')), false, 'nothing stored');
  fs.rmSync(path.join(opts.state, 'analytics.json'), { recursive: true });
  assert.equal((await A.after(opts)).sent, 3, 'the next run says it and sends');
  assert.equal(err.out.length, 1);
});

test('PC-123: status says nothing is sent until the notice has been shown once', async () => {
  const h = home();
  const opts = base(h, { fetchImpl: recorder().fetchImpl, stderr: quiet().stream });
  const st = () => A.status({ state: opts.state, env: opts.env, key: opts.key });
  assert.deepEqual([st().sending, st().reason], [false, 'notice']);
  await A.after({ ...opts, json: true });
  assert.equal(st().reason, 'notice', 'a --json run never shows it');
  await A.after(opts);
  assert.deepEqual([st().sending, st().reason], [true, null]);
});

test('PC-123: a machine an agent sets up with --json is a new install, and the first status run says it sends', () => {
  const h = home();
  const keyFile = path.join(h, 'key.json');
  fs.writeFileSync(keyFile, JSON.stringify({ appKey: KEY }));
  const log = path.join(h, 'sent.log');
  const preload = path.join(h, 'fetch.js');
  fs.writeFileSync(preload, `globalThis.fetch = async (url, init) => { require('fs').appendFileSync(${JSON.stringify(log)}, init.body + '\\n'); return { ok: true, status: 200 }; };`);
  const env = { ...process.env, HOME: h, USERPROFILE: h, XDG_CONFIG_HOME: path.join(h, '.config'), APPDATA: path.join(h, 'AppData'),
    PASSIONCODE_HOME: path.join(h, '.passioncode'), PASSIONCODE_ANALYTICS_KEY_FILE: keyFile };
  delete env.DO_NOT_TRACK; delete env.PASSIONCODE_ANALYTICS;
  const run = (...args) => spawnSync(process.execPath, ['--require', preload, path.join(ROOT, 'bin', 'passioncode.js'), ...args], { env, encoding: 'utf8' });
  assert.equal(run('config', 'set', 'update.auto', 'off', '--json').status, 0); // writes the launcher state, sends nothing yet
  assert.equal(fs.existsSync(log), false, 'nothing sent before the notice');
  const status = run('analytics', 'status');
  assert.equal(status.status, 0, status.stderr);
  assert.doesNotMatch(status.stdout, /nothing is sent/);
  assert.match(status.stdout, /this run shows the notice below/);
  assert.match(status.stderr, /The PassionCode launcher sends anonymous usage and error counts/);
  const first = JSON.parse(fs.readFileSync(log, 'utf8').trim().split('\n')[0]);
  assert.equal(first.find((e) => e.eventName === 'app_installed').props.existing, 'false');
  assert.match(run('analytics', 'status', '--json').stdout, /"sending": true/);
});

test('PC-124: the sessions row never becomes a step the person owes', () => {
  const S = require('../lib/setup');
  const after = [{ id: 'sessions.on-demand', area: 'services', state: 'warn', fix: 'install Claude Code' }, { id: 'x', state: 'warn', fix: 'do x' }];
  const steps = S.humanSteps({ actions: [] }, after, [], []);
  assert.deepEqual(steps, ['do x']);
});

test('PC-123: a stale notice marker with no record behind it is claimed again, a fresh one is not', async () => {
  const h = home(); const r = recorder(); const err = quiet();
  const opts = base(h, { fetchImpl: r.fetchImpl, stderr: err.stream });
  assert.equal((await A.after(opts)).sent, 3);
  fs.rmSync(path.join(opts.state, 'analytics.json')); // the record is gone, the marker stays
  fs.utimesSync(path.join(opts.state, 'analytics-notice'), opts.now, opts.now); // as fresh as this run's clock
  assert.deepEqual(await A.after(opts), { sent: 0, waiting: 'notice' }, 'a marker younger than a minute is another command saying it');
  const old = new Date(opts.now.getTime() - 120_000);
  fs.utimesSync(path.join(opts.state, 'analytics-notice'), old, old);
  assert.equal((await A.after(opts)).sent, 3, 'stale: the notice is shown again and counts resume');
  assert.equal(err.out.length, 2);
});

test('PC-123: a "no" already given in a PassionCode app is kept as the launcher\'s off, once; analytics on lifts it for the launcher alone', async () => {
  const h = home(); const r = recorder(); const err = quiet();
  const opts = base(h, { fetchImpl: r.fetchImpl, stderr: err.stream });
  const shared = path.join(h, '.config', 'PassionCode', 'installation.json');
  fs.mkdirSync(path.dirname(shared), { recursive: true });
  fs.writeFileSync(shared, JSON.stringify({ version: 1, id: '11111111-2222-4333-8444-555555555555', analytics: false, created_at: 1 }) + '\n');
  assert.deepEqual(await A.after({ ...opts, json: true }), { sent: 0 }, 'decided by the first run, whatever its flags');
  assert.deepEqual(await A.after(opts), { sent: 0 });
  assert.equal(r.calls.length, 0); assert.equal(err.out.length, 0, 'no notice: they are off');
  const st = () => A.status({ state: opts.state, env: opts.env, key: opts.key });
  assert.deepEqual([st().enabled, st().reason], [false, 'off-elsewhere']);
  A.setEnabled(opts.state, true);
  assert.equal((await A.after(opts)).sent, 3, 'the person turned the launcher on: the shared field is not read again');
  assert.equal(JSON.parse(fs.readFileSync(shared, 'utf8')).analytics, false, 'the shared file is never rewritten');
});

test('PC-123: a shared "no" written after the first counting run does not turn the launcher off', async () => {
  const h = home(); const r = recorder();
  const opts = base(h, { fetchImpl: r.fetchImpl, stderr: quiet().stream });
  assert.equal((await A.after(opts)).sent, 3);
  const shared = path.join(h, '.config', 'PassionCode', 'installation.json');
  const doc = JSON.parse(fs.readFileSync(shared, 'utf8')); doc.analytics = false; fs.writeFileSync(shared, JSON.stringify(doc));
  assert.ok((await A.after(opts)).sent >= 1, 'one product\'s switch never turns another off later');
});

test('PC-123: with a shared no, the first analytics status says off and the first analytics on is final', () => {
  const run = (h, ...args) => {
    const keyFile = path.join(h, 'key.json');
    fs.writeFileSync(keyFile, JSON.stringify({ appKey: KEY }));
    const log = path.join(h, 'sent.log');
    const preload = path.join(h, 'fetch.js');
    fs.writeFileSync(preload, `globalThis.fetch = async (url, init) => { require('fs').appendFileSync(${JSON.stringify(log)}, init.body + '\\n'); return { ok: true, status: 200 }; };`);
    const env = { ...process.env, HOME: h, USERPROFILE: h, XDG_CONFIG_HOME: path.join(h, '.config'), APPDATA: path.join(h, 'AppData'),
      PASSIONCODE_HOME: path.join(h, '.passioncode'), PASSIONCODE_ANALYTICS_KEY_FILE: keyFile };
    delete env.DO_NOT_TRACK; delete env.PASSIONCODE_ANALYTICS;
    return spawnSync(process.execPath, ['--require', preload, path.join(ROOT, 'bin', 'passioncode.js'), ...args], { env, encoding: 'utf8' });
  };
  const sharedNo = (h) => {
    const shared = A.installationPath(process.platform, { APPDATA: path.join(h, 'AppData'), XDG_CONFIG_HOME: path.join(h, '.config') }, h);
    fs.mkdirSync(path.dirname(shared), { recursive: true });
    fs.writeFileSync(shared, JSON.stringify({ version: 1, id: '11111111-2222-4333-8444-555555555555', analytics: false, created_at: 1 }));
  };
  const a = home(); sharedNo(a);
  assert.equal(JSON.parse(run(a, 'analytics', 'status', '--json').stdout).reason, 'off-elsewhere', 'the first --json status already knows');
  const b = home(); sharedNo(b);
  const first = run(b, 'analytics', 'status');
  assert.match(first.stdout, /off, because they were turned off in another PassionCode app/);
  assert.doesNotMatch(first.stderr, /sends anonymous usage/);
  assert.equal(fs.existsSync(path.join(b, 'sent.log')), false);
  const c = home(); sharedNo(c);
  const on = run(c, 'analytics', 'on');
  assert.equal(on.status, 0);
  assert.match(on.stderr, /sends anonymous usage/, 'the person\'s on stands: this run shows the notice');
  assert.ok(fs.existsSync(path.join(c, 'sent.log')), 'and counts are sent');
  assert.equal(JSON.parse(run(c, 'analytics', 'status', '--json').stdout).reason, null);
});

test('PC-123: an analytics off given while the command ran wins: nothing said, sent or stored, the claim released', async () => {
  const h = home(); const r = recorder(); const err = quiet();
  const opts = base(h, { fetchImpl: r.fetchImpl, stderr: err.stream });
  const t = opts.startedAt;
  // The duration is read between after()'s first read of the switch and its write: the off lands exactly there.
  const startedAt = { valueOf: () => { A.setEnabled(opts.state, false); return t; } };
  assert.deepEqual(await A.after({ ...opts, startedAt }), { sent: 0 });
  assert.equal(r.calls.length, 0); assert.equal(err.out.length, 0);
  assert.equal(fs.existsSync(path.join(opts.state, 'analytics-notice')), false, 'the notice claim is released');
  assert.equal(fs.existsSync(path.join(h, '.config', 'PassionCode', 'installation.json')), false);
  assert.equal(A.readState(opts.state).enabled, false);
});
