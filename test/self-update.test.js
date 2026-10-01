'use strict';
// The self-update: the probe that asks npm who publishes `passioncode`, and the
// session-start hook that installs a newer version only from a trusted publisher.
// Each test runs a copy of the plugin (so trust.json can be set) against a fake
// `npm` and a fake `npx` placed first on PATH; nothing reaches the registry.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = process.env.PC_TEST_PLUGIN_DIR || path.join(ROOT, 'plugin/passioncode');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FAKE_NPM = `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
fs.appendFileSync(path.join(process.env.HOME, 'npm-calls.log'), process.argv.slice(2).join(' ') + '\\n');
if (process.env.FAKE_NPM_OUT) process.stdout.write(fs.readFileSync(process.env.FAKE_NPM_OUT, 'utf8'));
if (process.env.FAKE_NPM_ERR) process.stderr.write(process.env.FAKE_NPM_ERR);
process.exit(Number(process.env.FAKE_NPM_CODE || 0));
`;
const FAKE_NPX = `#!/usr/bin/env node
require('fs').appendFileSync(require('path').join(process.env.HOME, 'npx-calls.log'), process.argv.slice(2).join(' ') + '\\n');
`;

const E404 = JSON.stringify({ error: { code: 'E404', summary: 'Not Found - GET https://registry.npmjs.org/@passioncode-ai%2fpassioncode - Not found', detail: '' } }, null, 2);
const published = (version, maintainers, publisher) => JSON.stringify({ version, maintainers: maintainers.map((m) => `${m} <${m}@example.com>`), ...(publisher ? { _npmUser: `${publisher} <${publisher}@example.com>` } : {}) }, null, 2);

function sandbox({ trust = [] } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-self-'));
  const home = path.join(base, 'home');
  const stateDir = path.join(home, '.passioncode');
  const plugin = path.join(base, 'plugin');
  const bin = path.join(base, 'bin');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.cpSync(PLUGIN, plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, 'trust.json'), JSON.stringify({ npmPublishers: trust }));
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), FAKE_NPM, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'npx'), FAKE_NPX, { mode: 0o755 });
  const env = (extra = {}) => ({ ...process.env, HOME: home, PASSIONCODE_HOME: stateDir, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...extra });
  return { base, home, stateDir, plugin, env };
}

const stateOf = (sb) => JSON.parse(fs.readFileSync(path.join(sb.stateDir, 'state.json'), 'utf8'));
const setState = (sb, state) => fs.writeFileSync(path.join(sb.stateDir, 'state.json'), typeof state === 'string' ? state : JSON.stringify(state));
const fresh = () => new Date().toISOString();
const lines = (file) => { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };

function hook(sb) {
  // Run from a directory outside any passioncode-ai repository, so the read-first line (repo-rules.test.js) stays out of these cases.
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env(), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}

function probe(sb, stdout, code = 0) {
  const out = path.join(sb.base, 'npm-out');
  fs.writeFileSync(out, stdout);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/probe.js')], { encoding: 'utf8', env: sb.env({ FAKE_NPM_OUT: out, FAKE_NPM_CODE: String(code) }) });
  assert.equal(r.status, 0, r.stderr);
  return stateOf(sb);
}

/** The hook starts npx detached: wait for it to write, or for long enough that it would have. */
async function npxCalls(sb, { expect = 0, ms = 5000 } = {}) {
  const file = path.join(sb.home, 'npx-calls.log');
  const until = Date.now() + (expect ? ms : 700);
  while (Date.now() < until) {
    if (expect && lines(file).length >= expect) break;
    await sleep(50);
  }
  if (expect) await sleep(150); // a second, unwanted spawn would land meanwhile
  return lines(file);
}

test('probe records the latest version, its maintainers and its publisher', () => {
  const sb = sandbox();
  const state = probe(sb, published('0.2.0', ['PassionCode-AI', 'sshlg'], 'sshlg'));
  assert.deepEqual(lines(path.join(sb.home, 'npm-calls.log')), ['view @passioncode-ai/passioncode version maintainers _npmUser --json']);
  assert.equal(state.published, true);
  assert.equal(state.latest, '0.2.0');
  assert.deepEqual(state.maintainers, ['passioncode-ai', 'sshlg']);
  assert.equal(state.publisher, 'sshlg');
  assert.equal(state.checkError, undefined);
  assert.ok(Date.parse(state.checkedAt) > 0);
});

test('probe records an unclaimed name as unpublished, not as an error', () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.2', latest: '0.1.2', maintainers: ['someone'], checkError: 'old', checkErrorShown: 'old' });
  const state = probe(sb, E404, 1);
  assert.equal(state.published, false);
  assert.equal(state.latest, undefined, 'an unpublished name has no latest version');
  assert.equal(state.maintainers, undefined);
  assert.equal(state.checkError, undefined);
  assert.equal(state.installed, '0.1.2', 'the rest of the state is kept');
});

test('probe records malformed npm output as a check error and keeps no version', () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', latest: '0.2.0', published: true, maintainers: ['passioncode-ai'] });
  let state = probe(sb, 'npm WARN something\n0.3.0 garbage');
  assert.match(state.checkError, /not the expected JSON/);
  assert.equal(state.latest, undefined, 'nothing from a previous answer survives a bad one');
  state = probe(sb, JSON.stringify({ version: '0.3.0; rm -rf ~', maintainers: ['passioncode-ai'] }));
  assert.match(state.checkError, /usable version/);
  state = probe(sb, JSON.stringify({ error: { code: 'E500', summary: 'Internal\nServer Error' } }), 1);
  assert.equal(state.checkError, 'E500: Internal Server Error');
});

test('hook: an untrusted publisher is named and nothing is spawned', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai', 'mallory'], publisher: 'mallory' });
  const out = hook(sb);
  assert.equal(out, '[passioncode] @passioncode-ai/passioncode@0.2.0 is on npm but published by mallory, not a trusted PassionCode publisher — not installing; see SECURITY.md.\n');
  assert.deepEqual(await npxCalls(sb), []);
  assert.equal(stateOf(sb).updatingSince, undefined);
});

test('hook: a trusted maintainer list with an untrusted publishing account is refused', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'mallory' });
  assert.match(hook(sb), /published by mallory, not a trusted PassionCode publisher/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: missing publisher or malformed maintainer never authorizes an update', () => {
  const { decide } = require('../plugin/passioncode/hooks/update-check');
  for (const identity of [{ maintainers: ['passioncode-ai'] }, { maintainers: ['passioncode-ai', null], publisher: 'passioncode-ai' }]) {
    const r = decide({ installed: '0.1.0', published: true, latest: '0.2.0', ...identity }, ['passioncode-ai']);
    assert.equal(r.spawn, null);
    assert.match(r.lines.join('\n'), /could not be read/);
  }
});

test('probe rejects valid-looking stdout when npm exits with an error', () => {
  const sb = sandbox();
  const state = probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'), 1);
  assert.ok(state.checkError);
  assert.equal(state.latest, undefined);
});

test('hook: missing npx does not fail the session or leave an update running', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  const emptyPath = path.join(sb.base, 'empty-bin');
  fs.mkdirSync(emptyPath);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ PATH: emptyPath }), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stateOf(sb).updatingSince, undefined);
  assert.doesNotMatch(r.stdout, /updating in the background/);
  assert.match(r.stdout, /could not start the background update/);
});

test('hook: an empty trust list never spawns', async () => {
  const sb = sandbox({ trust: [] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  assert.match(hook(sb), /published by passioncode-ai, not a trusted PassionCode publisher — not installing/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: unknown maintainers never spawn', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), latest: '0.2.0' }); // what a 0.1.1 probe recorded
  assert.match(hook(sb), /who published it could not be read — not installing/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: a trusted publisher starts one update, pinned to the verified version', async () => {
  const sb = sandbox({ trust: ['passioncode-ai', 'sshlg'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai', 'sshlg'], publisher: 'sshlg' });
  assert.match(hook(sb), /0\.2\.0 is out \(you have 0\.1\.0\); updating in the background/);
  assert.deepEqual(await npxCalls(sb, { expect: 1 }), ['--yes @passioncode-ai/passioncode@0.2.0 update --quiet']);
  assert.ok(Date.parse(stateOf(sb).updatingSince) > 0, 'the running update is recorded');
  hook(sb);
  assert.deepEqual(await npxCalls(sb, { expect: 2, ms: 700 }), ['--yes @passioncode-ai/passioncode@0.2.0 update --quiet'], 'a second session start does not start a second update');
});

test('hook: with auto-update off it names the pinned command and spawns nothing', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', config: { auto: false } });
  assert.equal(hook(sb), '[passioncode] 0.2.0 is out (you have 0.1.0): npx @passioncode-ai/passioncode@0.2.0 update\n');
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: an unpublished name spawns nothing and prints nothing', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: false, latest: '0.2.0', maintainers: ['passioncode-ai'] });
  assert.equal(hook(sb), '');
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: malformed npm output never leads to a spawn', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', published: true, latest: '0.2.0', maintainers: ['passioncode-ai'] });
  probe(sb, '<html>captive portal</html>');
  const out = hook(sb);
  assert.match(out, /the daily update check failed: npm answered with something that is not the expected JSON/);
  assert.doesNotMatch(out, /updating/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: a probe error is shown once, and a different one again', () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), checkError: 'E500: Internal Server Error' });
  assert.equal(hook(sb), '[passioncode] the daily update check failed: E500: Internal Server Error (log: ~/.passioncode/logs/probe.log).\n');
  assert.equal(hook(sb), '', 'the same error is not repeated every session');
  setState(sb, { ...stateOf(sb), checkError: 'ETIMEDOUT' });
  assert.match(hook(sb), /check failed: ETIMEDOUT/);
  const state = probe(sb, published('0.1.0', ['passioncode-ai']));
  assert.equal(state.checkErrorShown, undefined, 'a success forgets the shown error, so a later failure is news again');
});

test('hook: an up-to-date set is silent and a damaged state never fails a session', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.2.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'] });
  assert.equal(hook(sb), '');
  setState(sb, '{broken');
  hook(sb); // asserts exit 0; the stale check starts the (fake) probe
});

test('hook: a stale check starts the probe, which asks npm who publishes', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2026-01-01T00:00:00.000Z' });
  hook(sb);
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 5000;
  while (!lines(file).length && Date.now() < until) await sleep(50);
  assert.deepEqual(lines(file), ['view @passioncode-ai/passioncode version maintainers _npmUser --json']);
});

test('hook: future timestamps do not suppress probes or updates indefinitely', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2999-01-01T00:00:00Z' });
  hook(sb);
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 5000;
  while (!lines(file).length && Date.now() < until) await sleep(50);
  assert.equal(lines(file).length, 1);
  const { decide } = require('../plugin/passioncode/hooks/update-check');
  const result = decide({ installed: '0.1.0', latest: '0.2.0', published: true, maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', updatingSince: '2999-01-01T00:00:00Z' }, ['passioncode-ai']);
  assert.ok(result.spawn, 'a future running marker cannot indefinitely suppress updates');
});

test('the shipped trust list is a valid list of npm accounts, and a missing one trusts no one', () => {
  const doc = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/passioncode/trust.json'), 'utf8'));
  assert.ok(Array.isArray(doc.npmPublishers));
  const { loadTrust } = require(path.join(ROOT, 'plugin/passioncode/hooks/update-check.js'));
  assert.deepEqual(loadTrust(path.join(ROOT, 'plugin/passioncode/trust.json')), doc.npmPublishers);
  assert.deepEqual(loadTrust(path.join(os.tmpdir(), 'no-such-trust.json')), [], 'a missing list trusts no one');
});

test('the package the hook watches is the org-scoped one, not the squattable bare name', () => {
  const { PACKAGE } = require('../plugin/passioncode/hooks/update-check');
  assert.equal(PACKAGE, '@passioncode-ai/passioncode');
  assert.equal(require('../package.json').name, PACKAGE);
});

test('a version published by GitHub Actions through npm trusted publishing is recognised, not unreadable', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const view = (npmUser) => JSON.stringify({ version: '0.2.0', maintainers: ['ssheleg <maintainer@example.com>'], _npmUser: npmUser });
  // npm records the OIDC publish in both shapes, depending on the client.
  for (const who of ['GitHub Actions <npm-oidc-no-reply@github.com>', { name: 'GitHub Actions', email: 'npm-oidc-no-reply@github.com' }]) {
    assert.equal(u.parseView(view(who)).publisher, u.OIDC_PUBLISHER);
  }
  // The name alone is not the identity: anyone can call an account "GitHub Actions".
  assert.notEqual(u.parseView(view('GitHub Actions <someone@example.com>')).publisher, u.OIDC_PUBLISHER);
  const state = { installed: '0.1.0', published: true, latest: '0.2.0', maintainers: ['ssheleg'], publisher: u.OIDC_PUBLISHER, config: { auto: true } };
  assert.deepEqual(u.decide(state, ['ssheleg', u.OIDC_PUBLISHER]).spawn, ['--yes', `${u.PACKAGE}@0.2.0`, 'update', '--quiet']);
  assert.equal(u.decide(state, ['ssheleg']).spawn, null, 'not listed in trust.json: not installed');
  assert.ok(u.loadTrust().includes(u.OIDC_PUBLISHER), 'the shipped trust list accepts the release workflow');
});


test('npm 12 singleton view metadata preserves the publisher trust decision', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const metadata = { version: '0.2.0', maintainers: ['ssheleg <maintainer@example.com>'], _npmUser: 'GitHub Actions <npm-oidc-no-reply@github.com>' };
  const result = u.parseView(JSON.stringify([metadata]));
  assert.deepEqual(result, u.parseView(JSON.stringify(metadata)));
  assert.deepEqual(u.decide({ installed: '0.1.0', ...result }, u.loadTrust()).spawn,
    ['--yes', `${u.PACKAGE}@0.2.0`, 'update', '--quiet']);
  for (const malformed of [[], [metadata, metadata], [[metadata]], [null], ['metadata']]) {
    assert.ok(u.parseView(JSON.stringify(malformed)).checkError, 'ambiguous or malformed arrays fail closed');
  }
  for (const identity of [{ ...metadata, _npmUser: null }, { ...metadata, maintainers: ['ssheleg', null] }]) {
    assert.equal(u.decide({ installed: '0.1.0', ...u.parseView(JSON.stringify([identity])) }, u.loadTrust()).spawn, null);
  }
});
