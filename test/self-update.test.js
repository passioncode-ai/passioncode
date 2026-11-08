'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
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
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PLUGIN = process.env.PC_TEST_PLUGIN_DIR || path.join(ROOT, 'plugin/passioncode');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const FAKE_NPM = `#!/usr/bin/env node
const fs = require('fs'); const path = require('path');
fs.appendFileSync(path.join(process.env.HOME, 'npm-calls.log'), process.argv.slice(2).join(' ') + '\\n');
fs.appendFileSync(path.join(process.env.HOME, 'npm-cwd.log'), process.cwd() + '\\n');
if (process.env.FAKE_NPM_SLEEP) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(process.env.FAKE_NPM_SLEEP));
if (process.env.FAKE_NPM_OUT) process.stdout.write(fs.readFileSync(process.env.FAKE_NPM_OUT, 'utf8'));
if (process.env.FAKE_NPM_ERR) process.stderr.write(process.env.FAKE_NPM_ERR);
process.exit(Number(process.env.FAKE_NPM_CODE || 0));
`;
const FAKE_NPX = `#!/usr/bin/env node
require('fs').appendFileSync(require('path').join(process.env.HOME, 'npx-calls.log'), process.argv.slice(2).join(' ') + '\\n');
require('fs').appendFileSync(require('path').join(process.env.HOME, 'npx-cwd.log'), process.cwd() + '\\n');
require('fs').appendFileSync(require('path').join(process.env.HOME, 'npx-config-dir.log'), (process.env.CLAUDE_CONFIG_DIR || '-') + '\\n');
`;

// A registry key made for these tests: the sandbox pins it in trust.json, as the shipped plugin pins npm's.
const KEYS = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const OTHER = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const spki = (pair) => pair.publicKey.export({ type: 'spki', format: 'der' }).toString('base64');
const TEST_KEY = { keyid: 'SHA256:test-registry-key', key: spki(KEYS) };
const PROVENANCE = 'https://slsa.dev/provenance/v1';
const INTEGRITY = `sha512-${crypto.createHash('sha512').update('the release tarball').digest('base64')}`;
/** What the probe records for a version: its integrity, a registry signature over it and its provenance. */
function verified(version, { integrity = INTEGRITY, signer = KEYS, keyid = TEST_KEY.keyid, signedVersion = version, provenance = PROVENANCE, signatures } = {}) {
  const sig = crypto.sign('sha256', Buffer.from(`@passioncode-ai/passioncode@${signedVersion}:${integrity}`), signer.privateKey).toString('base64');
  return { integrity, signatures: signatures || [{ keyid, sig }], provenance, version };
}
/** The `dist` npm view prints for that version. */
const distOf = (version, options) => {
  const v = verified(version, options);
  return { integrity: v.integrity, signatures: v.signatures, attestations: v.provenance ? { url: 'https://registry.npmjs.org/-/npm/v1/attestations/x', provenance: { predicateType: v.provenance } } : undefined };
};

const E404 = JSON.stringify({ error: { code: 'E404', summary: 'Not Found - GET https://registry.npmjs.org/@passioncode-ai%2fpassioncode - Not found', detail: '' } }, null, 2);
const published = (version, maintainers, publisher, dist = distOf(version)) => JSON.stringify({ version, maintainers: maintainers.map((m) => `${m} <${m}@example.com>`), ...(publisher ? { _npmUser: `${publisher} <${publisher}@example.com>` } : {}), ...(dist ? { dist } : {}) }, null, 2);

function sandbox({ trust = [], keys = [TEST_KEY] } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-self-'));
  const home = path.join(base, 'home');
  const stateDir = path.join(home, '.passioncode');
  const plugin = path.join(base, 'plugin');
  const bin = path.join(base, 'bin');
  fs.mkdirSync(stateDir, { recursive: true });
  fs.cpSync(PLUGIN, plugin, { recursive: true });
  fs.writeFileSync(path.join(plugin, 'trust.json'), JSON.stringify({ npmPublishers: trust, npmRegistryKeys: keys }));
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'npm'), FAKE_NPM, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, 'npx'), FAKE_NPX, { mode: 0o755 });
  // Windows starts no file by its #! line: there the hooks are pointed at the same stand-ins, run through Node.
  fs.writeFileSync(path.join(bin, 'npm.js'), FAKE_NPM);
  fs.writeFileSync(path.join(bin, 'npx.js'), FAKE_NPX);
  const stand = process.platform === 'win32' ? { PASSIONCODE_NPM: path.join(bin, 'npm.js'), PASSIONCODE_NPX: path.join(bin, 'npx.js') } : {};
  const env = (extra = {}) => ({ ...process.env, HOME: home, USERPROFILE: home, PASSIONCODE_HOME: stateDir, PATH: `${bin}${path.delimiter}${process.env.PATH}`, ...stand, ...extra });
  return { base, home, stateDir, plugin, env };
}

const stateOf = (sb) => JSON.parse(fs.readFileSync(path.join(sb.stateDir, 'state.json'), 'utf8'));
const setState = (sb, state) => fs.writeFileSync(path.join(sb.stateDir, 'state.json'), typeof state === 'string' ? state : JSON.stringify(state));
const fresh = () => new Date().toISOString();
const lines = (file) => { try { return fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };

const eventsOf = (sb) => lines(path.join(sb.stateDir, 'logs/update-events.log')).map((l) => l.split(' ').slice(1).join(' '));

function hook(sb, extra = {}) {
  // Run from a directory outside any passioncode-ai repository, so the read-first line (repo-rules.test.js) stays out of these cases.
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env(extra), cwd: os.tmpdir(), input: '' });
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
  const until = Date.now() + (expect ? Math.max(ms, 20000) : 700); // ends as soon as the call lands; a loaded machine can take seconds
  while (Date.now() < until) {
    if (expect && lines(file).length >= expect) break;
    await sleep(50);
  }
  if (expect) await sleep(150); // a second, unwanted spawn would land meanwhile
  return lines(file).map((l) => l.replace(/--cache=\S+ (--logs-dir=\S+ --logs-max=5 )?/, '--cache=RUN/cache '));
}

test('probe records the latest version, its maintainers and its publisher', () => {
  const sb = sandbox();
  const state = probe(sb, published('0.2.0', ['PassionCode-AI', 'sshlg'], 'sshlg'));
  assert.deepEqual(lines(path.join(sb.home, 'npm-calls.log')), ['view --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode version maintainers _npmUser dist --json']);
  assert.equal(state.published, true);
  assert.equal(state.latest, '0.2.0');
  assert.deepEqual(state.maintainers, ['passioncode-ai', 'sshlg']);
  assert.equal(state.publisher, 'sshlg');
  assert.equal(state.verify.integrity, INTEGRITY, 'the integrity is recorded');
  assert.equal(state.verify.provenance, PROVENANCE, 'and the provenance type');
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  assert.ok(u.registrySigned('0.2.0', state.verify, [TEST_KEY]), 'and a registry signature that verifies');
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
  assert.equal(out, '[passioncode] @passioncode-ai/passioncode@0.2.0 is on npm but published by mallory, not a trusted PassionCode publisher, so it is not installed; keep using 0.1.0 (npx @passioncode-ai/passioncode@0.1.0, not @latest) and see https://github.com/passioncode-ai/passioncode/blob/main/SECURITY.md#the-self-update-and-who-it-trusts.\n');
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

test('hook: with nothing installed (after uninstall, or an older state without the key) it installs nothing (PC-131)', () => {
  const { decide } = require('../plugin/passioncode/hooks/update-check');
  const trusted = { published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', config: { auto: true } };
  for (const state of [{ ...trusted, installed: null }, { ...trusted }]) {
    const r = decide(state, ['passioncode-ai']);
    assert.equal(r.spawn, null);
    assert.deepEqual(r.lines, []);
    assert.deepEqual(r.stateChanges, {});
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
  const earlier = path.join(sb.stateDir, 'run', 'cache-earlier');
  fs.mkdirSync(earlier, { recursive: true });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', verify: verified('0.2.0'), maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', updateCache: earlier });
  const emptyPath = path.join(sb.base, 'empty-bin');
  fs.mkdirSync(emptyPath);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ PATH: emptyPath, ...(process.platform === 'win32' ? { PASSIONCODE_NPX: path.join(emptyPath, 'npx') } : {}) }), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(stateOf(sb).updatingSince, undefined);
  assert.doesNotMatch(r.stdout, /updating in the background/);
  assert.match(r.stdout, /could not start the background update/);
  const run = path.join(sb.stateDir, 'run');
  assert.deepEqual(fs.readdirSync(run).filter((n) => n.startsWith('cache')), ['cache-earlier'], 'the unused cache folder is removed');
  assert.equal(stateOf(sb).updateCache, earlier, "the earlier update's folder stays recorded");
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(sb.stateDir, 'logs', 'npm')).mode & 0o777, 0o700);
});

test('PC-143: a failed start never records an earlier folder another session already removed', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  const gone = path.join(sb.stateDir, 'run', 'cache-swept'); // recorded, then removed by another session's sweep
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', verify: verified('0.2.0'), maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', updateCache: gone });
  const emptyPath = path.join(sb.base, 'empty-bin');
  fs.mkdirSync(emptyPath);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ PATH: emptyPath, ...(process.platform === 'win32' ? { PASSIONCODE_NPX: path.join(emptyPath, 'npx') } : {}) }), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /could not start the background update/);
  assert.equal(stateOf(sb).updateCache, undefined, 'no record of a folder that is gone');
});

test('PC-143: a state.json that cannot be written starts no update and says so in one line', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root writes anyway') }, async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', verify: verified('0.2.0'), maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  fs.chmodSync(sb.stateDir, 0o555); // neither state.json nor its temporary file can be written
  try {
    const out = hook(sb);
    assert.match(out, /~\/\.passioncode\/state\.json cannot be written, so no background update starts; make it and its folder writable and it is tried again next session\./, out);
    assert.doesNotMatch(out, /updating in the background/);
    assert.deepEqual(await npxCalls(sb), [], 'nothing started');
  } finally {
    fs.chmodSync(sb.stateDir, 0o755);
  }
});

test('hook: an empty trust list never spawns', async () => {
  const sb = sandbox({ trust: [] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  assert.match(hook(sb), /published by passioncode-ai, not a trusted PassionCode publisher, so it is not installed;/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: unknown maintainers never spawn', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), latest: '0.2.0' }); // what a 0.1.1 probe recorded
  assert.match(hook(sb), /who published it could not be read, so it is not installed;/);
  assert.deepEqual(await npxCalls(sb), []);
});

test('hook: a trusted publisher starts one update, pinned to the verified version', async () => {
  const sb = sandbox({ trust: ['passioncode-ai', 'sshlg'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', verify: verified('0.2.0'), maintainers: ['passioncode-ai', 'sshlg'], publisher: 'sshlg' });
  assert.match(hook(sb), /0\.2\.0 is out \(you have 0\.1\.0\); updating in the background/);
  assert.deepEqual(await npxCalls(sb, { expect: 1 }), ['--yes --cache=RUN/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update --quiet']);
  assert.ok(Date.parse(stateOf(sb).updatingSince) > 0, 'the running update is recorded');
  hook(sb);
  assert.deepEqual(await npxCalls(sb, { expect: 2, ms: 700 }), ['--yes --cache=RUN/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update --quiet'], 'a second session start does not start a second update');
});

test('hook: a tampered, unsigned, foreign-signed or provenance-less version is refused and nothing is spawned (PC-131)', async () => {
  const trust = ['passioncode-ai'];
  const who = { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' };
  const tampered = `sha512-${crypto.createHash('sha512').update('a different tarball').digest('base64')}`;
  const signature = /its registry signature does not verify against the npm key pinned in this plugin, so it is not installed; keep using 0\.1\.0 \(npx @passioncode-ai\/passioncode@0\.1\.0, not @latest\) and see https:\/\/github\.com\/passioncode-ai\/passioncode\/blob\/main\/SECURITY\.md#the-self-update-and-who-it-trusts\./;
  const cases = [
    ['other bytes than the signed ones', { ...verified('0.2.0'), integrity: tampered }, signature],
    ['a signature over another version', verified('0.2.0', { signedVersion: '0.1.9' }), signature],
    ['no signature at all', verified('0.2.0', { signatures: [] }), signature],
    ['signed by a key npm never published', verified('0.2.0', { signer: OTHER }), signature],
    ['a pinned keyid on a foreign key', verified('0.2.0', { signer: OTHER, keyid: TEST_KEY.keyid }), signature],
    ['an unpinned keyid', verified('0.2.0', { keyid: 'SHA256:not-pinned' }), signature],
    ['a damaged signature', { ...verified('0.2.0'), signatures: [{ keyid: TEST_KEY.keyid, sig: 'AAAA' }] }, signature],
    ['no integrity', { ...verified('0.2.0'), integrity: null }, signature],
    ['no build provenance', verified('0.2.0', { provenance: null }), /0\.2\.0 is on npm without a build provenance attestation, so it is not installed; keep using 0\.1\.0/],
    ['another provenance type', verified('0.2.0', { provenance: 'https://slsa.dev/provenance/v0.2' }), /without a build provenance attestation/],
  ];
  for (const [name, verify, line] of cases) {
    const sb = sandbox({ trust });
    setState(sb, { ...who, verify });
    assert.match(hook(sb), line, name);
    assert.deepEqual(await npxCalls(sb), [], name);
    assert.equal(stateOf(sb).updatingSince, undefined, name);
  }
  // With auto-update off the person is not told to run an unverified version by hand either.
  const sb = sandbox({ trust });
  setState(sb, { ...who, config: { auto: false }, verify: { ...verified('0.2.0'), integrity: tampered } });
  const out = hook(sb);
  assert.match(out, signature);
  assert.doesNotMatch(out, /update\n$/);
});

test('hook: no pinned registry key (a missing or damaged trust.json) means nothing installs on its own', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'], keys: [] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  assert.match(hook(sb), /registry signature does not verify/);
  assert.deepEqual(await npxCalls(sb), []);
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  assert.deepEqual(u.loadRegistryKeys(path.join(os.tmpdir(), 'no-such-trust.json')), []);
});

test('hook: a check recorded before signatures were read installs nothing and asks npm again at once (PC-131)', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  const out = path.join(sb.base, 'npm-out');
  fs.writeFileSync(out, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'));
  assert.equal(hook(sb, { FAKE_NPM_OUT: out }), '', 'nothing to refuse yet: the record is only older than the check');
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 20000;
  while (!stateOf(sb).verify && Date.now() < until) await sleep(50);
  assert.equal(lines(file).length, 1, 'a fresh check, although the last one is less than a day old');
  assert.deepEqual(await npxCalls(sb), []);
  assert.match(hook(sb), /updating in the background/, 'the next session installs the verified version');
  assert.deepEqual(await npxCalls(sb, { expect: 1 }), ['--yes --cache=RUN/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update --quiet']);
});

test('hook: signature data recorded for another version (an older plugin probed since) is not used; it asks npm again (PC-131)', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.1', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  assert.equal(hook(sb), '', 'no refusal for a version whose signature was never read');
  // PC-157: the detached probe may already have logged its own check; the hook itself installed nothing.
  assert.deepEqual(eventsOf(sb).filter((e) => !e.startsWith('update_check ')), [], eventsOf(sb).join('\n'));
  const until = Date.now() + 20000;
  while (!lines(path.join(sb.home, 'npm-calls.log')).length && Date.now() < until) await sleep(50);
  assert.equal(lines(path.join(sb.home, 'npm-calls.log')).length, 1, 'a fresh probe');
  assert.deepEqual(await npxCalls(sb), []);
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  assert.equal(u.needsProbe({ published: true, latest: '0.2.0', verify: 'damaged' }), true);
  assert.equal(u.needsProbe({ published: true, latest: '0.2.0', verify: [verified('0.2.0')] }), true);
  assert.equal(u.needsProbe({ published: true, latest: '0.2.0', verify: verified('0.2.0') }), false);
});

test('hook: while the latest version is refused, its own lines name the installed version, never @latest (PC-131)', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0', { signatures: [] }) });
  fs.writeFileSync(path.join(sb.stateDir, 'doctor.json'), JSON.stringify({ at: new Date().toISOString(), summary: { ok: 1, warn: 0, fail: 1, info: 0 }, failed: ['skills.passioncode'] }));
  const out = hook(sb);
  assert.match(out, /registry signature does not verify/);
  assert.match(out, /`npx @passioncode-ai\/passioncode@0\.1\.0 setup` repairs them/);
  assert.doesNotMatch(out, /@latest [a-z]/, 'no command that would run the refused version');
  setState(sb, { ...stateOf(sb), verify: verified('0.2.0') , installed: '0.2.0' });
  assert.match(hook(sb), /`npx @passioncode-ai\/passioncode@latest setup` repairs them/, 'nothing refused: the usual command');
});

test('hook: an unreadable publisher is refused, and logged once (PC-131)', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: null, verify: verified('0.2.0') });
  assert.match(hook(sb), /who published it could not be read, so it is not installed; keep using 0\.1\.0/);
  hook(sb);
  assert.deepEqual(eventsOf(sb), ['update_check signature_failed unreadable_publisher']);
});

test('a pinned key that is not ECDSA P-256 verifies nothing', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const p384 = crypto.generateKeyPairSync('ec', { namedCurve: 'secp384r1' });
  const sig = crypto.sign('sha256', Buffer.from(`${u.PACKAGE}@0.2.0:${INTEGRITY}`), p384.privateKey).toString('base64');
  const verify = { integrity: INTEGRITY, signatures: [{ keyid: 'k', sig }], provenance: PROVENANCE, version: '0.2.0' };
  assert.equal(u.registrySigned('0.2.0', verify, [{ keyid: 'k', key: spki(p384) }]), false);
});

test('the npm registry key shipped in trust.json verifies a real release (0.2.75), and only it', () => {
  const u = require(path.join(ROOT, 'plugin/passioncode/hooks/update-check.js'));
  const keys = u.loadRegistryKeys(path.join(ROOT, 'plugin/passioncode/trust.json'));
  assert.ok(keys.length >= 1, 'at least one npm registry key is pinned');
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/npm-dist-0.2.75.json'), 'utf8'));
  const verify = { ...u.readDist(real.dist), version: real.version };
  assert.equal(verify.provenance, u.PROVENANCE);
  assert.ok(u.registrySigned(real.version, verify, keys), 'npm signature of the published 0.2.75');
  assert.ok(!u.registrySigned('0.2.76', verify, keys), 'the same signature does not cover another version');
  assert.ok(!u.registrySigned(real.version, { ...verify, integrity: INTEGRITY }, keys), 'nor other bytes');
  assert.ok(!u.registrySigned(real.version, verify, [TEST_KEY]), 'nor verifies with another key');
  const state = { installed: '0.2.74', published: true, latest: real.version, maintainers: ['ssheleg'], publisher: u.OIDC_PUBLISHER, verify };
  assert.deepEqual(u.decide(state, u.loadTrust(), Date.now(), keys).spawn, ['--yes', ...u.REGISTRY_ARGS, `${u.PACKAGE}@0.2.75`, 'update', '--quiet']);
});

test('probe reads only well-formed signature fields from dist', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  assert.deepEqual(u.readDist(undefined), { integrity: null, signatures: [], provenance: null });
  assert.deepEqual(u.readDist({ integrity: 'sha1-abc', signatures: 'x', attestations: [] }), { integrity: null, signatures: [], provenance: null });
  const odd = u.readDist({ integrity: INTEGRITY, signatures: [null, { keyid: 1, sig: 'AA==' }, { keyid: 'k', sig: 'not base64!' }, { keyid: 'k', sig: 'AA==', extra: true }] });
  assert.deepEqual(odd.signatures, [{ keyid: 'k', sig: 'AA==' }]);
});


test('PC-131: a refusal is logged once per version and reason, an update start once (LC-16)', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  const who = { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' };
  setState(sb, { ...who, verify: verified('0.2.0', { provenance: null }) });
  hook(sb);
  hook(sb);
  assert.deepEqual(eventsOf(sb), ['update_check signature_failed provenance'], 'the line repeats at every session, the log entry does not');
  setState(sb, { ...stateOf(sb), publisher: 'mallory' });
  hook(sb);
  assert.deepEqual(eventsOf(sb).slice(1), ['update_check signature_failed untrusted_publisher'], 'another reason is news');
  setState(sb, { ...stateOf(sb), publisher: 'passioncode-ai', verify: verified('0.2.0') });
  hook(sb);
  assert.deepEqual(await npxCalls(sb, { expect: 1 }), ['--yes --cache=RUN/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update --quiet']);
  assert.deepEqual(eventsOf(sb).slice(2), ['update_download started']);
});

test('PC-131: a refusal is forgotten once the version passes, and the hook rotates its own logs', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  const who = { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], verify: verified('0.2.0') };
  setState(sb, { ...who, publisher: null });
  hook(sb);
  assert.equal(stateOf(sb).refusalLogged, '0.2.0 unreadable_publisher');
  setState(sb, { ...stateOf(sb), publisher: 'passioncode-ai' });
  hook(sb);
  assert.deepEqual(await npxCalls(sb, { expect: 1 }), ['--yes --cache=RUN/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update --quiet']);
  assert.equal(stateOf(sb).refusalLogged, null, 'accepted now: no refusal left for status to show');
  // The hook opens probe.log through the capped writer: a full one moves aside, and it is 0600.
  const log = require(path.join(PLUGIN, 'hooks/update-log'));
  const probeLog = path.join(sb.stateDir, 'logs', 'probe.log');
  fs.writeFileSync(probeLog, Buffer.alloc(log.MAX_BYTES), { mode: 0o644 });
  setState(sb, { ...stateOf(sb), checkedAt: '2026-01-01T00:00:00.000Z' });
  hook(sb);
  assert.equal(fs.statSync(`${probeLog}.1`).size, log.MAX_BYTES, 'the full probe.log moved aside');
  if (process.platform !== 'win32') assert.equal(fs.statSync(probeLog).mode & 0o777, 0o600);
});

test('PC-131: an offered or caught-up version forgets its refusal, and an unchecked newer one is never named @latest', () => {
  const who = { checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', refusalLogged: '0.2.0 provenance' };
  const off = sandbox({ trust: ['passioncode-ai'] });
  setState(off, { ...who, installed: '0.1.0', verify: verified('0.2.0'), config: { auto: false } });
  assert.match(hook(off), /0\.2\.0 is out \(you have 0\.1\.0\): npx /);
  assert.equal(stateOf(off).refusalLogged, null, 'offered by hand now: not refused any more');
  const caught = sandbox({ trust: ['passioncode-ai'] });
  setState(caught, { ...who, installed: '0.2.0', verify: verified('0.2.0') });
  assert.equal(hook(caught), '');
  assert.equal(stateOf(caught).refusalLogged, null, 'installed by hand: nothing left to refuse');
  // A newer version not yet checked (no signature data): the setup reminder names the installed version.
  const unchecked = sandbox({ trust: ['passioncode-ai'] });
  setState(unchecked, { ...who, installed: '0.1.0', refusalLogged: undefined });
  fs.writeFileSync(path.join(unchecked.stateDir, 'probe.pending'), new Date().toISOString()); // a probe is already running
  fs.writeFileSync(path.join(unchecked.stateDir, 'doctor.json'), JSON.stringify({ at: new Date().toISOString(), summary: { ok: 1, warn: 0, fail: 1, info: 0 }, failed: ['skills.passioncode'] }));
  const out = hook(unchecked);
  assert.match(out, /`npx @passioncode-ai\/passioncode@0\.1\.0 setup` repairs them/);
  assert.doesNotMatch(out, /@latest setup/);
});

test('PC-131: a failed check keeps a standing refusal: logged once, and the reminder still names the installed version', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0', { provenance: null }) });
  hook(sb);
  assert.deepEqual(eventsOf(sb), ['update_check signature_failed provenance']);
  probe(sb, 'garbage'); // npm failed: no latest known
  fs.writeFileSync(path.join(sb.stateDir, 'doctor.json'), JSON.stringify({ at: new Date().toISOString(), summary: { ok: 1, warn: 0, fail: 1, info: 0 }, failed: ['skills.passioncode'] }));
  setState(sb, { ...stateOf(sb), checkedAt: fresh() });
  const out = hook(sb);
  assert.match(out, /`npx @passioncode-ai\/passioncode@0\.1\.0 setup` repairs them/);
  assert.equal(stateOf(sb).refusalLogged, '0.2.0 provenance', 'a failed check forgets nothing');
  assert.match(out, /@passioncode-ai\/passioncode@0\.2\.0 was not installed \(no build provenance\) and the last check could not tell whether that changed; keep using 0\.1\.0/);
  assert.match(hook(sb), /0\.2\.0 was not installed .* keep using 0\.1\.0/, 'at every session, not once');
  probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai', distOf('0.2.0', { provenance: null })));
  assert.equal(require(path.join(PLUGIN, 'hooks/update-check')).verifiedFor(stateOf(sb)), true, 'the refusal branch runs');
  hook(sb);
  assert.deepEqual(eventsOf(sb).filter((e) => e.startsWith('update_check signature_failed')), ['update_check signature_failed provenance'], 'the same refusal is not logged again');
});

test('PC-131: with nothing installed the setup reminder never names an undefined version', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' });
  fs.writeFileSync(path.join(sb.stateDir, 'probe.pending'), new Date().toISOString());
  fs.writeFileSync(path.join(sb.stateDir, 'doctor.json'), JSON.stringify({ at: new Date().toISOString(), summary: { ok: 1, warn: 0, fail: 1, info: 0 }, failed: ['skills.passioncode'] }));
  const out = hook(sb);
  assert.doesNotMatch(out, /@undefined/);
  assert.match(out, /`npx @passioncode-ai\/passioncode@latest setup` repairs them/);
});

test('PC-131: the update runs in the launcher\'s own folder, never the session project\'s (its node_modules or .npmrc)', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const project = path.join(sb.base, 'project');
  fs.mkdirSync(path.join(project, 'node_modules', '@passioncode-ai', 'passioncode'), { recursive: true });
  fs.writeFileSync(path.join(project, 'package.json'), '{}');
  fs.writeFileSync(path.join(project, '.npmrc'), 'script-shell=/tmp/not-this\n');
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env(), cwd: project, input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await npxCalls(sb, { expect: 1 })).length, 1);
  const run = path.join(sb.stateDir, 'run');
  assert.deepEqual(lines(path.join(sb.home, 'npx-cwd.log')).map((d) => fs.realpathSync(d)), [fs.realpathSync(run)]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(run, 'package.json'), 'utf8')), { private: true }, 'npm stops its walk here');
  const call = lines(path.join(sb.home, 'npx-calls.log'))[0];
  const cache = (call.match(/--cache=(\S+) /) || [])[1];
  assert.equal(path.dirname(cache), run, 'a new cache folder of its own: npx downloads and npm checks');
  assert.match(path.basename(cache), /^cache-/);
  assert.ok(call.includes(`--logs-dir=${path.join(sb.stateDir, 'logs', 'npm')} `), "npm's debug logs stay beside the update log");
  assert.ok(fs.existsSync(cache), 'the folder of an update that started stays for it');
  assert.equal(stateOf(sb).updateCache, cache, 'the started update records the folder it runs from');
  // The probe's npm view runs there too.
  setState(sb, { ...stateOf(sb), checkedAt: '2026-01-01T00:00:00.000Z' });
  spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env(), cwd: project, input: '' });
  const until = Date.now() + 20000;
  while (!lines(path.join(sb.home, 'npm-cwd.log')).length && Date.now() < until) await sleep(50);
  assert.deepEqual(lines(path.join(sb.home, 'npm-cwd.log')).map((d) => fs.realpathSync(d)), [fs.realpathSync(run)]);
});

test('PC-131: signature data an older plugin\'s probe kept beside its own new answer is not used', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const now = new Date('2026-11-05T10:00:00Z');
  const state = u.recordProbe({}, u.parseView(published('0.2.0', ['passioncode-ai'], 'passioncode-ai')), now);
  assert.equal(state.verify.checkedAt, state.checkedAt);
  assert.equal(u.needsProbe(state), false);
  // An older probe (it knows no `verify`) records the same version later, with other accounts, and keeps the old verify.
  const older = { ...state, checkedAt: '2026-11-05T11:00:00.000Z', publisher: 'someone-else' };
  assert.equal(u.needsProbe(older), true);
  assert.equal(u.decide({ ...older, installed: '0.1.0' }, ['passioncode-ai', 'someone-else'], Date.now(), [TEST_KEY]).spawn, null);
});

test('PC-131: without a cache folder of its own the update does not start', { skip: process.platform === 'win32' && 'POSIX modes' }, async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const run = path.join(sb.stateDir, 'run');
  fs.mkdirSync(run, { recursive: true });
  fs.writeFileSync(path.join(run, 'package.json'), '{ "private": true }\n');
  fs.chmodSync(run, 0o555);
  try {
    assert.match(hook(sb), /could not start the background update: its folder ~\/\.passioncode\/run cannot be written; make it writable \(or remove it\)/);
    assert.deepEqual(await npxCalls(sb), [], 'never without its own cache');
    assert.equal(stateOf(sb).updatingSince, undefined);
    assert.ok(eventsOf(sb).includes('update_install failed cache'));
  } finally {
    fs.chmodSync(run, 0o755);
  }
});

test('PC-143: a log folder that cannot be written is named, never PATH', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root writes anyway') }, async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const logs = path.join(sb.stateDir, 'logs');
  fs.mkdirSync(logs, { recursive: true });
  fs.chmodSync(logs, 0o555);
  try {
    const out = hook(sb);
    assert.match(out, /could not start the background update: its log folder ~\/\.passioncode\/logs cannot be written; make it writable \(or remove it\)/, out);
    assert.doesNotMatch(out, /npx is on PATH/);
    assert.deepEqual(await npxCalls(sb), [], 'nothing started without its log');
    assert.equal(stateOf(sb).updatingSince, undefined);
  } finally {
    fs.chmodSync(logs, 0o755);
  }
});

test('PC-131: every session start removes update cache folders older than an hour, except the running update\'s', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  const run = path.join(sb.stateDir, 'run');
  const old = path.join(run, 'cache-old');
  const kept = path.join(run, 'cache-kept');
  const recent = path.join(run, 'cache-recent');
  for (const d of [old, kept, recent]) fs.mkdirSync(d, { recursive: true });
  const twoHours = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
  for (const d of [old, kept]) fs.utimesSync(d, twoHours, twoHours);
  const halfHour = (Date.now() - 30 * 60 * 1000) / 1000;
  fs.utimesSync(recent, halfHour, halfHour);
  // A verified record, so the first session starts no probe whose late write would undo the next setState.
  setState(sb, { installed: '0.2.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0'), updateCache: kept });
  hook(sb);
  assert.ok(!fs.existsSync(old), 'an old folder is removed with nothing to install');
  assert.ok(fs.existsSync(kept), 'the folder the last update runs from stays');
  assert.ok(fs.existsSync(recent), 'one under an hour old stays');
  // A session that starts an update sweeps too (its own new marker does not stop it), and records its folder.
  fs.mkdirSync(old);
  fs.utimesSync(old, twoHours, twoHours);
  assert.equal(require(path.join(PLUGIN, 'hooks/update-check')).needsProbe(stateOf(sb)), false, 'no probe runs beside this case');
  setState(sb, { ...stateOf(sb), installed: '0.1.0' });
  hook(sb);
  assert.equal((await npxCalls(sb, { expect: 1 })).length, 1);
  assert.ok(!fs.existsSync(old), 'swept by the session that started an update');
  const cache = stateOf(sb).updateCache;
  assert.notEqual(cache, kept, 'the new update replaces the recorded folder');
  assert.ok(cache && fs.existsSync(cache) && path.dirname(cache) === run, 'the new update\'s folder is recorded');
  assert.ok(fs.existsSync(kept), 'an older recorded folder is swept only once it is no longer the recorded one');
});

test('PC-131: an npm log folder left wider by an earlier version is made 0700', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const npmLogs = path.join(sb.stateDir, 'logs', 'npm');
  fs.mkdirSync(npmLogs, { recursive: true });
  fs.chmodSync(npmLogs, 0o755);
  assert.match(hook(sb), /updating in the background/);
  assert.equal((await npxCalls(sb, { expect: 1 })).length, 1);
  if (process.platform !== 'win32') assert.equal(fs.statSync(npmLogs).mode & 0o777, 0o700);
});

test('PC-131: an npm log folder that cannot be made does not stop the update or blame the run folder', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  fs.mkdirSync(path.join(sb.stateDir, 'logs'), { recursive: true });
  fs.writeFileSync(path.join(sb.stateDir, 'logs', 'npm'), 'a file where the folder would be');
  assert.match(hook(sb), /updating in the background/);
  const calls = await npxCalls(sb, { expect: 1 });
  assert.equal(calls.length, 1);
  assert.doesNotMatch(lines(path.join(sb.home, 'npx-calls.log'))[0], /--logs-dir/);
});

test('the hook loads only pinned keys written as plain one-line base64', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-keys-'));
  const file = path.join(dir, 'trust.json');
  // A URL-safe spelling differs from the plain one only when the key holds + or /: draw keys until one does.
  let plain = TEST_KEY.key;
  while (!/[+/]/.test(plain)) plain = spki(crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }));
  const urlSafe = plain.replace(/\+/g, '-').replace(/\//g, '_');
  assert.notEqual(urlSafe, plain);
  for (const key of [`${plain.slice(0, 40)}\n${plain.slice(40)}`, urlSafe]) {
    fs.writeFileSync(file, JSON.stringify({ npmRegistryKeys: [{ keyid: 'k', key }] }));
    assert.deepEqual(u.loadRegistryKeys(file), []);
  }
  fs.rmSync(dir, { recursive: true, force: true });
});

test('PC-131: an update npx cannot start is logged as a failed install', () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const emptyPath = path.join(sb.base, 'empty-bin');
  fs.mkdirSync(emptyPath);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ PATH: emptyPath, ...(process.platform === 'win32' ? { PASSIONCODE_NPX: path.join(emptyPath, 'npx') } : {}) }), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(eventsOf(sb), ['update_download started', 'update_install failed spawn']);
});

test('PC-131: the probe logs a check once until its answer changes, and every failure (LC-16)', () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0' });
  probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'));
  probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'));
  assert.deepEqual(eventsOf(sb), ['update_check ready'], 'the same answer adds no line');
  probe(sb, 'garbage');
  probe(sb, 'garbage');
  assert.deepEqual(eventsOf(sb).slice(1), ['update_check check_failed', 'update_check check_failed']);
  setState(sb, { ...stateOf(sb), installed: '0.2.0' });
  probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'));
  probe(sb, published('0.2.0', ['passioncode-ai'], 'passioncode-ai'));
  assert.deepEqual(eventsOf(sb).slice(3), ['update_check current'], 'after a failure the answer is news again, once');
  probe(sb, E404, 1);
  assert.equal(eventsOf(sb).length, 4, 'an unpublished name is not an update check event');
});

test('PC-131: update logs are capped at five files of 5 MB, 0600, and only codes are written (LC-12)', () => {
  const log = require(path.join(PLUGIN, 'hooks/update-log'));
  assert.equal(fs.readFileSync(path.join(PLUGIN, 'hooks/update-log.js'), 'utf8'), fs.readFileSync(path.join(ROOT, 'lib/update-log.js'), 'utf8'), 'the CLI copy is the plugin file, byte for byte');
  assert.equal(log.MAX_BYTES, 5 * 1024 * 1024);
  assert.equal(log.KEEP, 5);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-log-'));
  const file = path.join(dir, 'probe.log');
  for (let i = 0; i < 7; i += 1) {
    fs.writeFileSync(file, `generation ${i}\n`.padEnd(64, '.'));
    assert.equal(log.rotateLog(file, 32, 5), true);
  }
  assert.equal(log.rotateLog(path.join(dir, 'absent.log'), 32, 5), false);
  const names = fs.readdirSync(dir).sort();
  assert.deepEqual(names, ['probe.log.1', 'probe.log.2', 'probe.log.3', 'probe.log.4'], 'four older files and room for the live one');
  assert.match(fs.readFileSync(path.join(dir, 'probe.log.1'), 'utf8'), /^generation 6/);
  assert.match(fs.readFileSync(path.join(dir, 'probe.log.4'), 'utf8'), /^generation 3/);
  fs.writeFileSync(file, 'small', { mode: 0o644 });
  assert.equal(log.rotateLog(file, 32, 5), false, 'under the cap it stays');
  fs.closeSync(log.openLog(file));
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'an older, wider file is made 0600');
  fs.writeFileSync(file, Buffer.alloc(log.MAX_BYTES));
  fs.closeSync(log.openLog(file));
  assert.equal(fs.statSync(file).size, 0, 'a log that reached 5 MB is moved aside when it is opened');
  assert.equal(fs.statSync(`${file}.1`).size, log.MAX_BYTES);
  assert.equal(log.logEvent(dir, 'update_check', 'current; rm -rf ~'), false, 'not a code: nothing written');
  assert.equal(log.logEvent(dir, 'update_check', 'ready', 'a reason with spaces'), false);
  assert.equal(log.logEvent(dir, 'update_check', 'ready', undefined, new Date('2026-11-05T00:00:00Z')), true);
  assert.deepEqual(lines(path.join(dir, 'logs', log.EVENTS)), ['2026-11-05T00:00:00.000Z update_check ready']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('hook: with auto-update off it names the pinned command and spawns nothing', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', verify: verified('0.2.0'), maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', config: { auto: false } });
  assert.equal(hook(sb), '[passioncode] 0.2.0 is out (you have 0.1.0): npx --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@0.2.0 update\n');
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
  setState(sb, { installed: '0.2.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], verify: verified('0.2.0') });
  assert.equal(hook(sb), '');
  setState(sb, '{broken');
  hook(sb); // asserts exit 0; the stale check starts the (fake) probe
});

test('hook: a stale check starts the probe, which asks npm who publishes', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2026-01-01T00:00:00.000Z' });
  hook(sb);
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 20000;
  while (!lines(file).length && Date.now() < until) await sleep(50);
  assert.deepEqual(lines(file), ['view --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode version maintainers _npmUser dist --json']);
});

test('hook: session starts inside one probe window start one npm view, not one each (F13)', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2026-01-01T00:00:00.000Z' });
  const out = path.join(sb.base, 'npm-out');
  fs.writeFileSync(out, published('0.1.0', ['passioncode-ai'], 'passioncode-ai'));
  // npm takes its time; three sessions restored at once all see the stale check meanwhile.
  for (let i = 0; i < 3; i += 1) hook(sb, { FAKE_NPM_SLEEP: '1500', FAKE_NPM_OUT: out });
  const marker = path.join(sb.stateDir, 'probe.pending');
  assert.ok(fs.existsSync(marker), 'the marker is written before npm is asked');
  const until = Date.now() + 8000;
  while (fs.existsSync(marker) && Date.now() < until) await sleep(50);
  assert.equal(fs.existsSync(marker), false, 'the probe clears its marker when it has recorded');
  assert.equal(lines(path.join(sb.home, 'npm-calls.log')).length, 1);
  assert.equal(stateOf(sb).latest, '0.1.0');
});

test('hook: a probe marker left by a probe that died does not stop the next check', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2026-01-01T00:00:00.000Z' });
  const marker = path.join(sb.stateDir, 'probe.pending');
  fs.writeFileSync(marker, '2026-01-01T00:00:00.000Z');
  const old = (Date.now() - 10 * 60 * 1000) / 1000;
  fs.utimesSync(marker, old, old);
  hook(sb);
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 20000;
  while (!lines(file).length && Date.now() < until) await sleep(50);
  assert.equal(lines(file).length, 1);
});

test('hook: future timestamps do not suppress probes or updates indefinitely', async () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0', checkedAt: '2999-01-01T00:00:00Z' });
  hook(sb);
  const file = path.join(sb.home, 'npm-calls.log');
  const until = Date.now() + 20000;
  while (!lines(file).length && Date.now() < until) await sleep(50);
  assert.equal(lines(file).length, 1);
  const { decide } = require('../plugin/passioncode/hooks/update-check');
  const result = decide({ installed: '0.1.0', latest: '0.2.0', published: true, maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0'), updatingSince: '2999-01-01T00:00:00Z' }, ['passioncode-ai'], Date.now(), [TEST_KEY]);
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
  const state = { installed: '0.1.0', published: true, latest: '0.2.0', maintainers: ['ssheleg'], publisher: u.OIDC_PUBLISHER, verify: verified('0.2.0'), config: { auto: true } };
  assert.deepEqual(u.decide(state, ['ssheleg', u.OIDC_PUBLISHER], Date.now(), [TEST_KEY]).spawn, ['--yes', ...u.REGISTRY_ARGS, `${u.PACKAGE}@0.2.0`, 'update', '--quiet']);
  assert.equal(u.decide(state, ['ssheleg'], Date.now(), [TEST_KEY]).spawn, null, 'not listed in trust.json: not installed');
  assert.ok(u.loadTrust().includes(u.OIDC_PUBLISHER), 'the shipped trust list accepts the release workflow');
});


test('npm 12 singleton view metadata preserves the publisher trust decision', () => {
  const u = require(path.join(PLUGIN, 'hooks/update-check'));
  const metadata = { version: '0.2.0', maintainers: ['ssheleg <maintainer@example.com>'], _npmUser: 'GitHub Actions <npm-oidc-no-reply@github.com>', dist: distOf('0.2.0') };
  const result = u.parseView(JSON.stringify([metadata]));
  assert.deepEqual(result, u.parseView(JSON.stringify(metadata)));
  assert.deepEqual(u.decide({ installed: '0.1.0', ...result }, u.loadTrust(), Date.now(), [TEST_KEY]).spawn,
    ['--yes', ...u.REGISTRY_ARGS, `${u.PACKAGE}@0.2.0`, 'update', '--quiet']);
  for (const malformed of [[], [metadata, metadata], [[metadata]], [null], ['metadata']]) {
    assert.ok(u.parseView(JSON.stringify(malformed)).checkError, 'ambiguous or malformed arrays fail closed');
  }
  for (const identity of [{ ...metadata, _npmUser: null }, { ...metadata, maintainers: ['ssheleg', null] }]) {
    assert.equal(u.decide({ installed: '0.1.0', ...u.parseView(JSON.stringify([identity])) }, u.loadTrust(), Date.now(), [TEST_KEY]).spawn, null);
  }
});

// ADR-0004: the hook repeats the last saved doctor result while it has failures; it never runs doctor.
test('session start names the failures of the last saved setup check, and is silent when it passed', () => {
  const sb = sandbox();
  setState(sb, { checkedAt: fresh(), latest: null });
  const doctorFile = path.join(sb.stateDir, 'doctor.json');
  fs.writeFileSync(doctorFile, JSON.stringify({ at: '2026-10-13T10:00:00.000Z', summary: { ok: 9, warn: 1, fail: 2, info: 0 }, failed: ['mcp.claude.switchboard', 'skills.passioncode'] }));
  const out = hook(sb);
  assert.match(out, /\[passioncode\] the setup check of 2026-10-13 found 2 problem\(s\) \(mcp\.claude\.switchboard, skills\.passioncode\); `npx @passioncode-ai\/passioncode@latest setup` repairs them/);
  // PC-147: failures setup cannot repair (an app whose folder this user cannot write) send the person to doctor alone.
  fs.writeFileSync(doctorFile, JSON.stringify({ at: '2026-10-13T10:00:00.000Z', summary: { ok: 9, warn: 0, fail: 1, info: 0 }, failed: ['app.switchboard.signature'], blocked: ['app.switchboard.signature'] }));
  assert.match(hook(sb), /found 1 problem\(s\) \(app\.switchboard\.signature\); `npx @passioncode-ai\/passioncode@latest doctor` shows them\./);
  fs.writeFileSync(doctorFile, JSON.stringify({ at: '2026-10-13T10:00:00.000Z', summary: { ok: 9, warn: 0, fail: 2, info: 0 }, failed: ['app.switchboard.signature', 'skills.passioncode'], blocked: ['app.switchboard.signature'] }));
  assert.match(hook(sb), /`npx @passioncode-ai\/passioncode@latest setup` repairs what it can, `doctor` shows them\./, 'a failure setup can repair still names setup, and no more than it can');
  fs.writeFileSync(doctorFile, JSON.stringify({ at: '2026-10-13T11:00:00.000Z', summary: { ok: 12, warn: 1, fail: 0, info: 0 }, failed: [] }));
  assert.doesNotMatch(hook(sb), /setup check/);
  fs.writeFileSync(doctorFile, JSON.stringify({ at: '2026-10-13T10:00:00.000Z', summary: { ok: 9, warn: 0, fail: 2, info: 0 }, failed: ['mcp.claude.switchboard'] }));
  setState(sb, { checkedAt: fresh(), latest: null, installedAt: '2026-10-13T12:00:00.000Z' });
  assert.doesNotMatch(hook(sb), /setup check/, 'an update after the check makes it stale');
  fs.writeFileSync(doctorFile, 'not json');
  assert.doesNotMatch(hook(sb), /setup check/, 'a damaged file is ignored');
  assert.equal(lines(path.join(sb.home, 'npx-calls.log')).filter((l) => /doctor|setup/.test(l)).length, 0, 'the hook runs neither');
});

test('PC-135: on Windows the hooks start npm\'s own script through this Node; elsewhere the command by name', () => {
  const { npmCommand } = require(path.join(PLUGIN, 'hooks/update-check'));
  const node = 'C:\\Program Files\\nodejs\\node.exe';
  const cli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js';
  assert.deepEqual(npmCommand('npx', { env: {}, platform: 'win32', execPath: node, exists: (f) => f === cli }), [node, [cli]]);
  assert.deepEqual(npmCommand('npm', { env: {}, platform: 'win32', execPath: node, exists: () => false }), ['npm', []], 'no script beside Node: the name, as before');
  assert.deepEqual(npmCommand('npx', { env: {}, platform: 'darwin', execPath: '/usr/local/bin/node', exists: () => true }), ['npx', []]);
  assert.deepEqual(npmCommand('npx', { env: { PASSIONCODE_NPX: '/t/npx.js' }, platform: 'linux', execPath: '/n' }), ['/n', ['/t/npx.js']], 'a JavaScript stand-in runs through Node');
  assert.deepEqual(npmCommand('npm', { env: { PASSIONCODE_NPM: '/t/npm' }, platform: 'win32', execPath: '/n' }), ['/t/npm', []]);
});

test('PC-143: npm is missing only on Windows, with no stand-in and no npm script beside Node', () => {
  const { npmMissing } = require(path.join(PLUGIN, 'hooks/update-check'));
  const node = 'C:\\Program Files\\nodejs\\node.exe';
  const cli = 'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npx-cli.js';
  assert.equal(npmMissing('npx', { env: {}, platform: 'win32', execPath: node, exists: () => false }), 'C:\\Program Files\\nodejs', 'the folder of the Node that runs the hook');
  assert.equal(npmMissing('npx', { env: {}, platform: 'win32', execPath: node, exists: (f) => f === cli }), null, 'npm beside Node');
  assert.equal(npmMissing('npx', { env: { PASSIONCODE_NPX: 'C:\\t\\npx.cmd' }, platform: 'win32', execPath: node, exists: () => false }), null, 'a stand-in');
  assert.equal(npmMissing('npx', { env: { PASSIONCODE_NPX: '' }, platform: 'win32', execPath: node, exists: () => false }), 'C:\\Program Files\\nodejs', 'an empty stand-in is none');
  assert.equal(npmMissing('npm', { env: {}, platform: 'darwin', execPath: '/usr/local/bin/node', exists: () => false }), null, 'elsewhere the name starts npm');
});

// On Windows itself, with no stand-in: the npm script beside this Node exists and starts (no download).
test('PC-135: on Windows the npm and npx scripts beside Node start with --version', { skip: process.platform !== 'win32' && 'needs Windows' }, () => {
  const { npmCommand } = require(path.join(PLUGIN, 'hooks/update-check'));
  const env = { ...process.env }; delete env.PASSIONCODE_NPM; delete env.PASSIONCODE_NPX;
  for (const name of ['npm', 'npx']) {
    const [cmd, pre] = npmCommand(name, { env });
    assert.equal(cmd, process.execPath, `${name} runs through this Node`);
    assert.ok(fs.existsSync(pre[0]), `${pre[0]} exists`);
    assert.equal(path.basename(pre[0]), `${name}-cli.js`, `${name} starts its own script`);
    const r = spawnSync(cmd, [...pre, '--version'], { encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout.trim(), /^\d+\.\d+\.\d+/);
  }
});

// On real Windows the npm beside Node is there, and the update would really start: the stand-in platform runs elsewhere.
test('PC-129: a relative CLAUDE_CONFIG_DIR reaches the background update as the folder of the session, not of the run folder', async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const project = path.join(sb.base, 'project');
  fs.mkdirSync(project);
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ CLAUDE_CONFIG_DIR: 'cc' }), cwd: project, input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal((await npxCalls(sb, { expect: 1 })).length, 1);
  assert.deepEqual(lines(path.join(sb.home, 'npx-config-dir.log')).map((l) => fs.realpathSync(path.dirname(l)) + path.sep + path.basename(l)), [fs.realpathSync(project) + path.sep + 'cc']);
  // An empty value stays unset: it is not made into the session's folder.
  const empty = sandbox({ trust: ['passioncode-ai'] });
  setState(empty, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const e = spawnSync(process.execPath, [path.join(empty.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: empty.env({ CLAUDE_CONFIG_DIR: '' }), cwd: project, input: '' });
  assert.equal(e.status, 0, e.stderr);
  assert.equal((await npxCalls(empty, { expect: 1 })).length, 1);
  assert.deepEqual(lines(path.join(empty.home, 'npx-config-dir.log')), ['-']);
});

test('PC-129: a session folder removed under a relative CLAUDE_CONFIG_DIR still starts the update, the value left as it is', { skip: process.platform === 'win32' && 'a removed working folder' }, async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0') });
  const gone = path.join(sb.base, 'gone');
  fs.mkdirSync(gone);
  const r = spawnSync('/bin/sh', ['-c', 'cd "$1" && rmdir "$1" && exec "$2" "$3"', 'sh', gone, process.execPath, path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ CLAUDE_CONFIG_DIR: 'cc' }), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(gone), 'the session folder is gone');
  assert.equal((await npxCalls(sb, { expect: 1 })).length, 1);
  assert.deepEqual(lines(path.join(sb.home, 'npx-config-dir.log')), ['cc']);
});

test('PC-143: on Windows with no npm beside Node the hook says so, not to fix PATH', { skip: process.platform === 'win32' && 'needs a Node without npm beside it' }, async () => {
  const sb = sandbox({ trust: ['passioncode-ai'] });
  setState(sb, { installed: '0.1.0', checkedAt: fresh(), published: true, latest: '0.2.0', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai', verify: verified('0.2.0'), updateCache: '/x/earlier' });
  // The sandbox's npx stays on PATH: by name it would start here, so only the npm rule keeps the hook from starting it.
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/session-start.js')], { encoding: 'utf8', env: sb.env({ PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_NPX: '' }), cwd: os.tmpdir(), input: '' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /there is no npm beside the Node in .*, so automatic updates cannot be checked or installed; reinstall that Node\.js with npm \(with the tool that installed it\), or put a Node\.js that has npm first on PATH, then start Claude Code again: the next session checks again\./);
  // The manual command names the verified version and npm's own registry, as the hook's other manual line does.
  assert.match(r.stdout, /To update now, run in a terminal where npx works: npx --yes --registry=https:\/\/registry\.npmjs\.org \S+ \S+ @passioncode-ai\/passioncode@0\.2\.0 update\n/);
  assert.doesNotMatch(r.stdout, /check that npx is on PATH|@latest/);
  assert.deepEqual(eventsOf(sb), ['update_install failed npm'], 'no download logged as started when nothing could start');
  assert.equal(stateOf(sb).updatingSince, undefined);
  const run = path.join(sb.stateDir, 'run');
  assert.deepEqual(fs.existsSync(run) ? fs.readdirSync(run).filter((n) => n.startsWith('cache')) : [], [], 'no cache folder for an update that cannot start');
  assert.deepEqual(await npxCalls(sb), [], 'nothing started');
  assert.equal(fs.existsSync(path.join(sb.stateDir, 'logs', 'update.log')), false);
  assert.equal(stateOf(sb).updateCache, '/x/earlier', 'the earlier update folder stays recorded');
});

test('PC-143: on Windows with no npm beside Node the probe records it, and the session line names the fix, not spawn npm ENOENT', { skip: process.platform === 'win32' && 'needs a Node without npm beside it' }, () => {
  const sb = sandbox();
  setState(sb, { installed: '0.1.0' });
  const win = { PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_NPM: '', PASSIONCODE_NPX: '' };
  fs.writeFileSync(path.join(sb.stateDir, 'probe.pending'), new Date().toISOString()); // the hook claimed it before starting the probe
  const r = spawnSync(process.execPath, [path.join(sb.plugin, 'hooks/probe.js')], { encoding: 'utf8', env: sb.env(win) });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(sb.stateDir, 'probe.pending')), false, 'the probe releases its marker');
  assert.equal(stateOf(sb).checkError, 'npm-missing');
  assert.deepEqual(lines(path.join(sb.home, 'npm-calls.log')), [], 'nothing is started');
  assert.deepEqual(eventsOf(sb), ['update_check check_failed npm']);
  const out = hook(sb, win);
  assert.match(out, /^\[passioncode\] there is no npm beside the Node in .*, so automatic updates cannot be checked or installed; .*the next session checks again\.\n$/);
  assert.doesNotMatch(out, /ENOENT|daily update check failed|To update now/);
  assert.equal(hook(sb, win), '', 'shown once, as every check error');
  // With npm back beside Node, the next session checks again at once instead of a day later.
  fs.rmSync(path.join(sb.home, 'npm-calls.log'), { force: true });
  hook(sb, { PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_NPX: '', PASSIONCODE_NPM: path.join(sb.base, 'bin', 'npm.js') }); // npm is there now
  const until = Date.now() + 20000;
  while (stateOf(sb).checkError === 'npm-missing' && Date.now() < until) spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 100)']);
  assert.notEqual(stateOf(sb).checkError, 'npm-missing', 'the probe ran again');
  assert.equal(lines(path.join(sb.home, 'npm-calls.log')).length, 1);
});
