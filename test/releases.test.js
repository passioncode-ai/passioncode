'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-151: an app counts as in use only for a process of this user that runs from this very bundle.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const R = require('../lib/releases');

test('PC-151: the pattern matches the bundle at the start of the command or after a space, never as the end of a longer path', () => {
  const re = new RegExp(R.runningPattern('/Applications/Fabric Switchboard.app'));
  assert.ok(re.test('/Applications/Fabric Switchboard.app/Contents/MacOS/Fabric Switchboard'));
  assert.ok(re.test('/usr/bin/env /Applications/Fabric Switchboard.app/Contents/MacOS/switchboard mcp'));
  assert.ok(!re.test('/Users/other/Applications/Fabric Switchboard.app/Contents/MacOS/Fabric Switchboard'), "another user's copy");
  assert.ok(!re.test('/Applications/Fabric SwitchboardXapp/Contents/MacOS/x'), 'the dot is literal');
  assert.ok(!re.test('/Applications/Fabric Switchboard.app.old/Contents/MacOS/x'));
});

test('PC-151: every character a regular expression reads specially is escaped, so a bundle named like a pattern matches only itself', () => {
  const special = '/Applications/A (1) [x]{2}+?*^$|\\.app';
  const re = new RegExp(R.runningPattern(special));
  assert.ok(re.test(`${special}/Contents/MacOS/A`), 'its own command line');
  for (const ch of '()[]{}+?*^$|\\.') {
    const other = special.split(ch).join('Z');
    assert.ok(!re.test(`${other}/Contents/MacOS/A`), `with ${ch} replaced it is another bundle`);
  }
});

const pgrep = spawnSync('pgrep', ['-x', 'no-such-process-pc151'], { encoding: 'utf8' });
test('PC-151: with the real pgrep, a copy running under another path is not this bundle in use', { skip: (process.platform === 'win32' || pgrep.error) && 'needs pgrep' }, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc151-'));
  const name = `PC151 ${process.pid}.app`;
  const nested = path.join(base, 'Users', 'other', 'Applications', name);
  fs.mkdirSync(path.join(nested, 'Contents', 'MacOS'), { recursive: true });
  const bin = path.join(nested, 'Contents', 'MacOS', 'sleeper');
  fs.writeFileSync(bin, '#!/bin/sh\nsleep 30\n', { mode: 0o755 }); // runs as `/bin/sh <bin>`: the path after a space
  const child = spawn(bin, [], { stdio: 'ignore', detached: true });
  t.after(() => { try { process.kill(-child.pid); } catch (_) { /* gone */ } fs.rmSync(base, { recursive: true, force: true }); });
  const until = Date.now() + 10000;
  while (!R.isRunning(nested) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  assert.equal(R.isRunning(nested), true, 'its own bundle is in use');
  assert.equal(R.isRunning(path.join(base, 'Applications', name)), false, 'a bundle whose path is a suffix of the running one is not');
  assert.equal(R.isRunning(`/Applications/${name}`), false);
});

test('PC-151: pgrep is asked only about this user\'s processes', { skip: (process.platform === 'win32' || typeof process.getuid !== 'function') && 'POSIX users' }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pc151-bin-'));
  const log = path.join(bin, 'args.log');
  fs.writeFileSync(path.join(bin, 'pgrep'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\nexit 1\n`, { mode: 0o755 });
  // PC-169: macOS checks a new executable on its first start, which under heavy load outlasts isRunning's 5 s timeout
  // (a timeout reads as in use); one start beforehand keeps the check out of the call under test.
  require('node:child_process').spawnSync(path.join(bin, 'pgrep'), ['--warm'], { timeout: 60000 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.equal(R.isRunning('/Applications/X.app'), false);
  } finally { process.env.PATH = saved; }
  const args = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.deepEqual(args.slice(0, 3), ['-U', String(process.getuid()), '-f']);
  fs.rmSync(bin, { recursive: true, force: true });
});

// PC-185: release lookups send a token the machine has, and a refused API falls back to the web host's newest tag.
const http = require('node:http');

async function fakeGitHub(t, handle) {
  const seen = [];
  const server = http.createServer((req, res) => { seen.push({ url: req.url, auth: req.headers.authorization || null }); handle(req, res); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const saved = { api: process.env.PASSIONCODE_GITHUB_API, web: process.env.PASSIONCODE_GITHUB_WEB, gh: process.env.GITHUB_TOKEN, ghcli: process.env.GH_TOKEN };
  process.env.PASSIONCODE_GITHUB_API = `${base}/api`;
  process.env.PASSIONCODE_GITHUB_WEB = `${base}/web`;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GH_TOKEN;
  t.after(() => {
    server.close();
    for (const [k, v] of [['PASSIONCODE_GITHUB_API', saved.api], ['PASSIONCODE_GITHUB_WEB', saved.web], ['GITHUB_TOKEN', saved.gh], ['GH_TOKEN', saved.ghcli]]) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  });
  return { base, seen };
}

const stable = { id: 'x', name: 'X', repo: 'acme/x', asset: (v) => `X-${v}.zip` };
const pre = { id: 'f', name: 'F', repo: 'acme/f', prerelease: true, asset: (v) => `F-${v}.dmg` };
const vendor = { id: 'o', name: 'O', repo: 'acme/o', trust: 'vendor', asset: (v) => `O-${v}.dmg` };
const json = (res, status, body) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
const latestBody = { tag_name: 'v1.2.3', html_url: 'https://example.invalid/r', assets: [{ name: 'X-1.2.3.zip', browser_download_url: 'https://example.invalid/a', size: 5, digest: 'sha256:' + 'a'.repeat(64) }] };

test('PC-185: GITHUB_TOKEN, then GH_TOKEN, is sent to the API as a bearer token; none is sent without one', async (t) => {
  const { seen } = await fakeGitHub(t, (req, res) => json(res, 200, latestBody));
  await R.latestRelease(stable);
  assert.equal(seen.at(-1).auth, null, 'no token on the machine, no header');
  process.env.GH_TOKEN = 'gh-cli-value';
  await R.latestRelease(stable);
  assert.equal(seen.at(-1).auth, 'Bearer gh-cli-value');
  process.env.GITHUB_TOKEN = 'actions-value';
  const release = await R.latestRelease(stable);
  assert.equal(seen.at(-1).auth, 'Bearer actions-value', 'GITHUB_TOKEN wins');
  assert.equal(release.version, '1.2.3');
  assert.equal(release.source, undefined, 'an API answer carries no source mark');
});

test('PC-185: a blank or multi-word token value is no token', () => {
  assert.equal(R.githubToken({ GITHUB_TOKEN: '  ', GH_TOKEN: '' }), null);
  assert.equal(R.githubToken({ GITHUB_TOKEN: 'a b' }), null);
  assert.equal(R.githubToken({ GITHUB_TOKEN: ' ', GH_TOKEN: ' t1 ' }), 't1');
});

test('PC-185: a token the API refuses (401) does not stop the lookup: it is asked once more without one', async (t) => {
  const { seen } = await fakeGitHub(t, (req, res) => (req.headers.authorization ? json(res, 401, { message: 'Bad credentials' }) : json(res, 200, latestBody)));
  process.env.GITHUB_TOKEN = 'revoked-value';
  const release = await R.latestRelease(stable);
  assert.equal(release.version, '1.2.3');
  assert.deepEqual(seen.map((s) => s.auth), ['Bearer revoked-value', null]);
});

test('PC-185: a rate-limited API (403) falls back to the releases/latest redirect, builds the asset links on the web host and is not cached', async (t) => {
  const { base, seen } = await fakeGitHub(t, (req, res) => {
    if (req.url.startsWith('/api/')) return json(res, 403, { message: 'API rate limit exceeded' });
    if (req.url === '/web/acme/x/releases/latest') { res.statusCode = 302; res.setHeader('Location', 'https://github.com/acme/x/releases/tag/v2.0.1'); return res.end(); }
    res.statusCode = 404; res.end();
  });
  const cacheFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pc185-')), 'releases-cache.json');
  t.after(() => fs.rmSync(path.dirname(cacheFile), { recursive: true, force: true }));
  const release = await R.latestRelease(stable, { cacheFile });
  assert.equal(release.version, '2.0.1');
  assert.equal(release.source, 'web');
  assert.deepEqual(release.assets.map((a) => [a.name, a.url, a.digest]), [
    ['X-2.0.1.zip', `${base}/web/acme/x/releases/download/v2.0.1/X-2.0.1.zip`, null],
    ['SHA256SUMS', `${base}/web/acme/x/releases/download/v2.0.1/SHA256SUMS`, null],
    ['SHA256SUMS.asc', `${base}/web/acme/x/releases/download/v2.0.1/SHA256SUMS.asc`, null],
  ]);
  assert.equal(fs.existsSync(cacheFile), false, 'a web answer is never cached');
  assert.deepEqual(seen.map((s) => s.url), ['/api/repos/acme/x/releases/latest', '/web/acme/x/releases/latest']);
});

test('PC-185: a product that ships prereleases only (Fabric) falls back to the first entry of the releases feed', async (t) => {
  await fakeGitHub(t, (req, res) => {
    if (req.url.startsWith('/api/')) return json(res, 429, {});
    if (req.url === '/web/acme/f/releases.atom') {
      res.setHeader('Content-Type', 'application/atom+xml');
      return res.end('<feed><entry><link rel="alternate" href="https://github.com/acme/f/releases/tag/v0.3.21"/></entry><entry><link href="https://github.com/acme/f/releases/tag/v0.3.20"/></entry></feed>');
    }
    res.statusCode = 404; res.end();
  });
  const release = await R.latestRelease(pre);
  assert.equal(release.version, '0.3.21');
  assert.equal(release.prerelease, true);
  assert.equal(release.assets[0].name, 'F-0.3.21.dmg');
});

test('PC-185: a vendor-trust product gets only its asset from the web host, without a digest, so installApp refuses it', async (t) => {
  await fakeGitHub(t, (req, res) => {
    if (req.url.startsWith('/api/')) return json(res, 403, {});
    res.statusCode = 302; res.setHeader('Location', '/acme/o/releases/tag/v1.10.0'); res.end();
  });
  const release = await R.latestRelease(vendor);
  assert.deepEqual(release.assets.map((a) => a.name), ['O-1.10.0.dmg']);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc185-home-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const saved = process.env.PASSIONCODE_APPLICATIONS;
  process.env.PASSIONCODE_APPLICATIONS = path.join(home, 'Applications');
  t.after(() => { if (saved === undefined) delete process.env.PASSIONCODE_APPLICATIONS; else process.env.PASSIONCODE_APPLICATIONS = saved; });
  await assert.rejects(R.installApp({ ...vendor, app: 'O.app' }, release, { work: path.join(home, 'work'), home }), /rate limit\), so its SHA-256 digest is unknown; nothing unverified is installed/);
});

test('PC-185: when the web host fails too, the error names both, suggests a token and never carries one', async (t) => {
  await fakeGitHub(t, (req, res) => (req.url.startsWith('/api/') ? json(res, 403, {}) : (res.statusCode = 500, res.end())));
  await assert.rejects(R.latestRelease(stable), (error) => {
    assert.match(error.message, /answered HTTP 403 \(rate limit\) and the web fallback failed: .*HTTP 500.*; set GITHUB_TOKEN or GH_TOKEN/);
    return true;
  });
  process.env.GITHUB_TOKEN = 'never-printed-value';
  await assert.rejects(R.latestRelease(stable), (error) => {
    assert.doesNotMatch(error.message, /never-printed-value/);
    assert.doesNotMatch(error.message, /set GITHUB_TOKEN/, 'a machine with a token is not told to set one');
    return true;
  });
});

test('PC-185: any other API error is final, with no web fallback', async (t) => {
  const { seen } = await fakeGitHub(t, (req, res) => json(res, 404, {}));
  await assert.rejects(R.latestRelease(stable), /answered HTTP 404$/);
  assert.equal(seen.length, 1);
});

test('PC-185: a pinned release (a train) read while the API is rate-limited comes from its tag on the web host', async (t) => {
  const { seen } = await fakeGitHub(t, (req, res) => json(res, 403, {}));
  const release = await R.releaseAt(stable, '1.4.0');
  assert.equal(release.tag, 'v1.4.0');
  assert.equal(release.source, 'web');
  assert.equal(release.assets.length, 3);
  assert.equal(seen.length, 1, 'the tag is known: no web lookup is needed');
});

// PC-232 (studio-agent's board request b85bb7ea, STU-80/81): `setup` run for a space's user over ssh failed with only
// "failed gatekeeper". The first assessment of a new bundle on a loaded Mac can outlast the wait, and the error must say
// what spctl answered.
function gatekeeperBench(t, wait) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-gk-'));
  const bin = path.join(dir, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'spctl'), `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-tools.js')}" spctl "$@"\n`, { mode: 0o755 });
  const saved = { PATH: process.env.PATH, HOME: process.env.HOME, PASSIONCODE_GATEKEEPER_WAIT: process.env.PASSIONCODE_GATEKEEPER_WAIT };
  process.env.PATH = `${bin}${path.delimiter}${saved.PATH}`;
  process.env.HOME = dir;
  if (wait === undefined) delete process.env.PASSIONCODE_GATEKEEPER_WAIT; else process.env.PASSIONCODE_GATEKEEPER_WAIT = wait;
  t.after(() => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(dir, { recursive: true, force: true });
  });
  const app = (...markers) => {
    const a = path.join(dir, `X${markers.join('-')}.app`);
    fs.mkdirSync(path.join(a, 'Contents'), { recursive: true });
    for (const m of markers) fs.writeFileSync(path.join(a, m), '');
    return a;
  };
  const calls = () => { try { return fs.readFileSync(path.join(dir, 'fake-tools.log'), 'utf8').trim().split('\n').filter((l) => l.startsWith('spctl')).length; } catch (_) { return 0; } };
  return { app, calls };
}

const UNIX_TOOLS = process.platform === 'win32' && 'the spctl stand-in is a shell script';

test('PC-232: Gatekeeper waits 120 s, then once 600 s; PASSIONCODE_GATEKEEPER_WAIT replaces the list, a bad value is ignored', () => {
  const saved = process.env.PASSIONCODE_GATEKEEPER_WAIT;
  try {
    delete process.env.PASSIONCODE_GATEKEEPER_WAIT;
    assert.deepEqual(R.gatekeeperWaits(), [120, 600]);
    process.env.PASSIONCODE_GATEKEEPER_WAIT = '300, 900';
    assert.deepEqual(R.gatekeeperWaits(), [300, 900]);
    for (const bad of ['0', 'abc', '120,x', '5000', '1.5', ',']) {
      process.env.PASSIONCODE_GATEKEEPER_WAIT = bad;
      assert.deepEqual(R.gatekeeperWaits(), [120, 600], bad);
    }
  } finally { if (saved === undefined) delete process.env.PASSIONCODE_GATEKEEPER_WAIT; else process.env.PASSIONCODE_GATEKEEPER_WAIT = saved; }
});

test('PC-232: a notarized bundle is accepted at the first try', { skip: UNIX_TOOLS }, (t) => {
  const b = gatekeeperBench(t, '30');
  const c = R.gatekeeperCheck(b.app());
  assert.equal(c.ok, true, c.detail);
  assert.equal(c.detail, 'accepted, source=Notarized Developer ID');
  assert.equal(b.calls(), 1);
});

test('PC-232: a first assessment that times out is tried again with the longer wait, and says so', { skip: UNIX_TOOLS }, (t) => {
  const b = gatekeeperBench(t, '1,30');
  const c = R.gatekeeperCheck(b.app('SLOW_ONCE'));
  assert.equal(c.ok, true, c.detail);
  assert.match(c.detail, /^accepted, source=Notarized Developer ID \(after 1 timed-out try\)$/);
  assert.equal(b.calls(), 2);
});

test('PC-232: when every wait runs out the check fails and names the waits and the way on', { skip: UNIX_TOOLS }, (t) => {
  const b = gatekeeperBench(t, '1,1');
  const c = R.gatekeeperCheck(b.app('SLOW'));
  assert.equal(c.ok, false);
  assert.match(c.detail, /did not answer within 1 s, then 1 s/);
  assert.match(c.detail, /PASSIONCODE_GATEKEEPER_WAIT/);
  assert.equal(b.calls(), 2);
});

test('PC-232: a rejection names the exit code and the source; accepted without notarization is not enough', { skip: UNIX_TOOLS }, (t) => {
  const b = gatekeeperBench(t, '30');
  const rejected = R.gatekeeperCheck(b.app('BROKEN'));
  assert.equal(rejected.ok, false);
  assert.equal(rejected.detail, 'spctl exit 3: source=no usable signature');
  const plain = R.gatekeeperCheck(b.app('UNNOTARIZED'));
  assert.equal(plain.ok, false, 'a Developer ID without notarization is refused, as before');
  assert.equal(plain.detail, 'spctl exit 0: source=Developer ID');
  assert.equal(b.calls(), 2, 'a rejection is not retried');
});
