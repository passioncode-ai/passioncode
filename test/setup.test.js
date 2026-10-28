'use strict';
// setup and doctor end to end (ADR-0004): a new machine, an existing broken one, the no-op re-run,
// and every way a download must be refused. Releases come from a local server imitating GitHub's
// API, signed by a throwaway key; macOS tools are test/fake-tools.js; nothing real is touched.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const catalog = require('../lib/catalog');
const { makeKey } = require('./pgp-fixture');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin/passioncode.js');
const KEY = makeKey();
const TOOLS = ['codesign', 'xcrun', 'spctl', 'plutil', 'pgrep', 'ditto', 'hdiutil', 'launchctl', 'open', 'supabase', 'docker'];

function makePayload(dir) {
  const members = [{ name: 'example-agent', version: '0.1.0', skills: ['example-agent'], legacyPluginIds: [] }];
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  for (const m of members) {
    fs.mkdirSync(path.join(dir, 'plugins', m.name, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugins', m.name, '.claude-plugin/plugin.json'), JSON.stringify({ name: m.name, version: m.version }));
    for (const s of m.skills) {
      fs.mkdirSync(path.join(dir, 'plugins', m.name, 'skills', s), { recursive: true });
      fs.writeFileSync(path.join(dir, 'plugins', m.name, 'skills', s, 'SKILL.md'), `---\nname: ${s}\n---\n`);
    }
  }
  fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'passioncode', plugins: members.map((m) => ({ name: m.name, source: `./plugins/${m.name}` })) }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ family: 'passioncode', version: '0.1.0', members }));
}

/** A GitHub-shaped release server: latest release per repo, signed SHA256SUMS, the archives. */
function releaseServer(t, { version = '1.2.0', also = [], tamper = null, foreign = null, team = null, broken = null } = {}) {
  const files = new Map(); // `${repo}/${name}` → bytes
  const releasesOf = new Map();
  const tagged = new Map(); // `${repo}@v${version}` → release, `also` holds older releases a train may pin
  let base;
  for (const v of [...also, version]) for (const pr of catalog.PRODUCTS) {
    const version = v;
    const asset = pr.asset(version);
    const bytes = Buffer.from(JSON.stringify({ app: pr.app, version, ...(team === pr.id ? { team } : {}), ...(broken === pr.id ? { broken: true } : {}) }));
    const sums = `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${asset}\n`;
    const served = tamper === pr.id ? Buffer.from(`${bytes}x`) : bytes;
    const signer = foreign === pr.id ? makeKey() : KEY;
    files.set(`${pr.repo}/v${version}/${asset}`, served);
    files.set(`${pr.repo}/v${version}/SHA256SUMS`, Buffer.from(sums));
    files.set(`${pr.repo}/v${version}/SHA256SUMS.asc`, Buffer.from(signer.sign(Buffer.from(sums))));
    const release = () => ({
      tag_name: `v${version}`, draft: false, prerelease: !!pr.prerelease, html_url: `https://example.invalid/${pr.repo}`,
      assets: [asset, 'SHA256SUMS', 'SHA256SUMS.asc'].map((name) => ({
        name, size: files.get(`${pr.repo}/v${version}/${name}`).length, browser_download_url: `${base}/dl/${pr.repo}/v${version}/${name}`,
        // GitHub's digest is of the published bytes; a tampered upload still differs from the signed sums.
        digest: `sha256:${crypto.createHash('sha256').update(files.get(`${pr.repo}/v${version}/${name}`)).digest('hex')}`,
      })),
    });
    tagged.set(`${pr.repo}@v${version}`, release);
    releasesOf.set(pr.repo, release); // the last version written is the latest
  }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, base);
    const tag = /^\/repos\/([^/]+\/[^/]+)\/releases\/tags\/([^/]+)$/.exec(u.pathname);
    if (tag && tagged.has(`${tag[1]}@${tag[2]}`)) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(tagged.get(`${tag[1]}@${tag[2]}`)())); return; }
    let m = /^\/repos\/([^/]+\/[^/]+)\/releases\/latest$/.exec(u.pathname);
    if (m && releasesOf.has(m[1])) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(releasesOf.get(m[1])())); return; }
    m = /^\/repos\/([^/]+\/[^/]+)\/releases$/.exec(u.pathname);
    if (m && releasesOf.has(m[1])) { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify([releasesOf.get(m[1])()])); return; }
    m = /^\/dl\/(.+)$/.exec(u.pathname);
    if (m && files.has(m[1])) { res.end(files.get(m[1])); return; }
    res.statusCode = 404; res.end('{}');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    base = `http://127.0.0.1:${server.address().port}`;
    t.after(() => server.close());
    resolve(base);
  }));
}

function machine({ tools = TOOLS } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-setup-'));
  const payload = path.join(home, 'payload'); makePayload(payload);
  const bin = path.join(home, 'fakebin'); fs.mkdirSync(bin);
  for (const name of tools) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-tools.js')}" ${name} "$@"\n`, { mode: 0o755 });
  // A tool left out is "not found" even where the host has one in /usr/bin (CI runners carry docker).
  for (const name of TOOLS.filter((x) => !tools.includes(x))) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
  fs.writeFileSync(path.join(home, 'key.asc'), KEY.publicArmour);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {} }));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Applications'));
  fs.mkdirSync(path.join(home, 'services'));
  return { home, payload, bin, apps: path.join(home, 'Applications') };
}

function cliEnv(m, api) {
  const env = {
    ...process.env, HOME: m.home, PATH: `${m.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, PASSIONCODE_PAYLOAD: m.payload, PASSIONCODE_HOME: '',
    PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_APPLICATIONS: m.apps, PASSIONCODE_GITHUB_API: api,
    PASSIONCODE_RELEASE_KEY: path.join(m.home, 'key.asc'), PASSIONCODE_PLATFORM: 'darwin', PASSIONCODE_SERVICES_DIR: path.join(m.home, 'services'),
    KIMI_CODE_HOME: path.join(m.home, '.kimi-code'), PASSIONCODE_FABRIC_DASHBOARDS_MCP: '', FABRIC_SERVICES_DIR: '',
  };
  delete env.PASSIONCODE_FABRIC_DASHBOARDS_MCP;
  if (m.trains) env.PASSIONCODE_TRAINS = m.trains; else delete env.PASSIONCODE_TRAINS;
  return env;
}

function cli(m, api, ...args) {
  const env = cliEnv(m, api);
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr, json: (() => { try { return JSON.parse(stdout); } catch (_) { return null; } })() }));
  });
}
const toolLog = (m) => { try { return fs.readFileSync(path.join(m.home, 'fake-tools.log'), 'utf8').trim().split('\n'); } catch (_) { return []; } };
const installApp = (m, pr, { version = '1.2.0', running = false, broken = false } = {}) => {
  const app = path.join(m.apps, pr.app);
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: version }));
  if (running) fs.writeFileSync(path.join(app, 'RUNNING'), '');
  if (broken) fs.writeFileSync(path.join(app, 'BROKEN'), '');
  if (pr.mcp && pr.mcp.bin) {
    const b = path.join(app, pr.mcp.bin);
    fs.mkdirSync(path.dirname(b), { recursive: true });
    fs.writeFileSync(b, `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-mcp.js')}" ${pr.mcp.name} "$@"\n`, { mode: 0o755 });
  }
  return app;
};

test('a new machine: setup --yes installs the verified apps, the skills and every MCP server, then lists the person\'s steps', async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') }); // no Docker: Fabric waits for the person
  const r = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = r.json;
  assert.equal(out.mode, 'new');
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox']) {
    assert.ok(fs.existsSync(path.join(m.apps, catalog.byId(id).app)), `${id} installed`);
  }
  assert.equal(fs.existsSync(path.join(m.apps, 'Fabric.app')), false, 'Fabric needs Docker, which is missing');
  assert.ok(out.plan.some((i) => i.product === 'fabric' && !i.selected && /Docker/.test(i.note)));
  const claudeJson = JSON.parse(fs.readFileSync(path.join(m.home, '.claude.json'), 'utf8')).mcpServers;
  assert.deepEqual(Object.keys(claudeJson).sort(), ['fabric-dashboards', 'switchboard']);
  assert.deepEqual(claudeJson.switchboard.args, ['mcp']);
  assert.match(fs.readFileSync(path.join(m.home, '.codex/config.toml'), 'utf8'), /\["mcp_servers"\."switchboard"\]/);
  assert.equal(fs.readlinkSync(path.join(m.home, '.passioncode/current')), path.join(m.home, '.passioncode/releases/0.1.0'));
  // Every MCP server it registered answered its proving call afterwards.
  const proved = out.after.checks.filter((c) => c.area === 'mcp' && c.state === 'ok');
  assert.ok(proved.some((c) => /switchboard — switchboard_accounts answered/.test(c.detail)), JSON.stringify(out.after.checks.filter((c) => c.area === 'mcp')));
  assert.ok(proved.some((c) => /fabric-dashboards — list_services answered/.test(c.detail)));
  assert.ok(toolLog(m).some((l) => l.startsWith(`open ${path.join(m.apps, 'Fabric Dashboards.app')}`)), 'opened for its first run');
  assert.ok(out.humanSteps.some((s) => /Fabric Inbox: your agent follows its onboard guide/.test(s)));
  assert.ok(out.humanSteps.some((s) => /Fabric: needs Docker/.test(s)), out.humanSteps.join('\n'));
  assert.ok(out.humanSteps.some((s) => /Restart your coding agents/.test(s)));
  assert.equal(fs.existsSync(path.join(m.home, '.passioncode/downloads/dashboards-1.2.0')), false, 'downloads are removed');
  assert.ok(!JSON.stringify(out).includes('BEGIN PGP'), 'no key material in the output');

  // The same command again: nothing to do, nothing changes, exit 0.
  const before = toolLog(m).length;
  const again = await cli(m, api, 'setup', '--yes');
  assert.equal(again.status, 0, again.stderr + again.stdout);
  assert.match(again.stdout, /nothing was changed/);
  const calls = toolLog(m).slice(before);
  assert.ok(!calls.some((l) => /^(ditto|open|launchctl|hdiutil)/.test(l)), calls.join('\n'));
});

test('an existing broken setup: setup repairs, checks again and prints before → after', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const dash = installApp(m, catalog.byId('dashboards'), { version: '1.0.0' }); // outdated, idle → reinstalled
  installApp(m, catalog.byId('switchboard'), { broken: true }); // damaged signature, idle → reinstalled
  const inbox = installApp(m, catalog.byId('inbox'), { version: '1.0.0', running: true }); // outdated but in use → left
  installApp(m, catalog.byId('observatory'));
  installApp(m, catalog.byId('fabric'));
  // A launchd service of a family product that does not answer.
  fs.writeFileSync(path.join(m.home, 'services', 'project-observatory.default.json'), JSON.stringify({
    protocol: 'fabric-service/0.1', id: 'project-observatory', instance: 'default', name: 'Project Observatory',
    origin: 'http://127.0.0.1:9', lifecycle: { manager: 'launchd', label: 'org.example.observatory' },
  }));
  const r = await cli(m, api, 'setup', '--yes');
  assert.equal(r.status, 1, 'the service still does not answer, so a problem remains'); // fake launchctl starts nothing
  assert.match(r.stdout, /an existing setup/);
  assert.match(r.stdout, /before \(ok\/warn\/fail\)\s+after \(ok\/warn\/fail\)/);
  assert.match(r.stdout, /reinstalled Fabric Dashboards 1\.2\.0/);
  assert.match(r.stdout, /reinstalled Fabric Switchboard 1\.2\.0/);
  assert.match(r.stdout, /fail → ok: Fabric Switchboard: signature ok/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dash, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString, '1.2.0');
  const trash = fs.readdirSync(path.join(m.home, '.Trash'));
  assert.ok(trash.some((n) => n.startsWith('Fabric Dashboards 1.0.0')), `the old bundle is in the Trash: ${trash}`);
  assert.equal(JSON.parse(fs.readFileSync(path.join(inbox, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString, '1.0.0', 'a running app is never replaced');
  assert.match(r.stdout, /quit Fabric Inbox, then run/);
  assert.ok(toolLog(m).includes(`launchctl kickstart gui/${process.getuid()}/org.example.observatory`), toolLog(m).join('\n'));
  assert.ok(!toolLog(m).some((l) => /^launchctl (kill|stop|bootout)|kickstart -k/.test(l)), 'never a kill');
  assert.ok(!toolLog(m).some((l) => l.startsWith('open ')), 'nothing installed this run, nothing opened');
  assert.ok(JSON.parse(fs.readFileSync(path.join(m.home, '.claude.json'), 'utf8')).mcpServers.fabric, 'fabric registered by the repair');
});

test('doctor is read-only and exits 1 on a problem; doctor --fix repairs but installs and opens nothing', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const dash = installApp(m, catalog.byId('dashboards'), { version: '1.0.0' });
  const r = await cli(m, api, 'doctor', '--json');
  assert.equal(r.status, 1, r.stderr);
  const failed = r.json.checks.filter((c) => c.state === 'fail').map((c) => c.id);
  assert.ok(failed.includes('skills.installed') && failed.includes('mcp.claude.fabric-dashboards'), failed.join(', '));
  assert.ok(r.json.checks.some((c) => c.id === 'app.dashboards' && c.state === 'warn' && /1\.2\.0 is out/.test(c.detail)));
  assert.ok(!toolLog(m).some((l) => /^(ditto|open|launchctl|hdiutil)/.test(l)), 'doctor changed nothing');
  assert.equal(fs.existsSync(path.join(m.home, '.passioncode/current')), false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8')).summary.fail, failed.length);

  const fix = await cli(m, api, 'doctor', '--fix');
  assert.equal(fix.status, 0, fix.stdout + fix.stderr);
  assert.match(fix.stdout, /doctor --fix/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(dash, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString, '1.2.0', 'the outdated idle app was reinstalled');
  assert.equal(fs.existsSync(path.join(m.apps, 'Fabric Switchboard.app')), false, '--fix installs no new app');
  assert.ok(!toolLog(m).some((l) => l.startsWith('open ')), '--fix opens nothing');
  assert.equal((await cli(m, api, 'doctor')).status, 0, 'healthy now');
});

for (const [name, opts, why] of [
  ['a changed byte in the download', { tamper: 'dashboards' }, /is not the signed/],
  ['SHA256SUMS signed by another key', { foreign: 'dashboards' }, /not the PassionCode\.ai release key/],
  ['an app signed by another team', { team: 'dashboards' }, /failed team/],
  ['an app Gatekeeper rejects', { broken: 'dashboards' }, /failed signature, team|failed signature/],
]) {
  test(`setup refuses ${name}: nothing is installed and the download is removed`, async (t) => {
    // `team: <id>` stamps that product's app with a foreign team identifier (its id).
    const api = await releaseServer(t, opts);
    const m = machine();
    const r = await cli(m, api, 'setup', '--yes', '--with', 'dashboards', '--json');
    assert.equal(r.status, 1, r.stdout);
    const a = r.json.actions.find((x) => x.product === 'dashboards');
    assert.equal(a.outcome, 'failed');
    assert.match(a.error, why);
    assert.equal(fs.existsSync(path.join(m.apps, 'Fabric Dashboards.app')), false);
    assert.equal(fs.existsSync(path.join(m.home, '.passioncode/downloads/dashboards-1.2.0')), false);
  });
}

test('without a terminal and without --yes, setup prints the plan and changes nothing', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const r = await cli(m, api, 'setup');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Plan \(nothing was changed\)/);
  assert.match(r.stdout, /install Fabric Dashboards/);
  assert.equal(fs.readdirSync(m.apps).length, 0);
  assert.equal(fs.existsSync(path.join(m.home, '.passioncode/current')), false);
});

test('a proving call that fails is a failed check that names the fix', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0' });
  assert.equal((await cli(m, api, 'setup', '--yes', '--no-apps')).status, 0);
  process.env.FAKE_MCP_BROKEN = 'fabric-dashboards';
  try {
    const r = await cli(m, api, 'doctor', '--json');
    assert.equal(r.status, 1);
    const c = r.json.checks.find((x) => x.id === 'mcp.claude.fabric-dashboards');
    assert.equal(c.state, 'fail');
    assert.match(c.detail, /list_services answered with an error: broken on purpose/);
    assert.match(c.fix, /open Fabric Dashboards/);
  } finally { delete process.env.FAKE_MCP_BROKEN; }
});

test('a bundle that comes into use while its release downloads is not moved', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const dash = installApp(m, catalog.byId('dashboards'), { version: '1.0.0' });
  process.env.FAKE_BUSY_DURING_DOWNLOAD = dash;
  try {
    const r = await cli(m, api, 'setup', '--yes', '--with', 'dashboards', '--json');
    assert.equal(r.status, 1);
    assert.match(r.json.actions.find((a) => a.product === 'dashboards').error, /came into use while it downloaded/);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dash, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString, '1.0.0');
    assert.equal(fs.existsSync(path.join(m.home, '.Trash')), false);
  } finally { delete process.env.FAKE_BUSY_DURING_DOWNLOAD; }
});

test('a copy cut off halfway leaves the old app in place and no partial bundle', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const dash = installApp(m, catalog.byId('dashboards'), { version: '1.0.0' });
  process.env.FAKE_DITTO_COPY_FAIL = '1';
  try {
    const r = await cli(m, api, 'setup', '--yes', '--with', 'dashboards', '--json');
    assert.equal(r.status, 1);
    assert.equal(JSON.parse(fs.readFileSync(path.join(dash, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString, '1.0.0', 'the old bundle never moved');
    assert.deepEqual(fs.readdirSync(m.apps), ['Fabric Dashboards.app'], 'no .partial copy is left in Applications');
  } finally { delete process.env.FAKE_DITTO_COPY_FAIL; }
});

test('doctor never starts Fabric\'s MCP server: starting it enrols a session', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  installApp(m, catalog.byId('fabric'));
  assert.equal((await cli(m, api, 'setup', '--yes', '--no-apps')).status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(m.home, '.claude.json'), 'utf8')).mcpServers.fabric.args, ['--runner', 'claude-code'], 'setup registers the preview server');
  try { fs.rmSync(path.join(m.home, 'fake-mcp.log')); } catch (_) { /* none yet */ }
  const r = await cli(m, api, 'doctor', '--json');
  const c = r.json.checks.find((x) => x.id === 'mcp.claude.fabric');
  assert.equal(c.state, 'ok');
  assert.match(c.detail, /doctor does not start it/);
  const started = (() => { try { return fs.readFileSync(path.join(m.home, 'fake-mcp.log'), 'utf8'); } catch (_) { return ''; } })();
  assert.doesNotMatch(started, /^fabric /m, 'fabric-mcp was never started');
});

test('setup saves its after-check later than the release it installed, so the session hook shows what still fails', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0' });
  process.env.FAKE_MCP_BROKEN = 'fabric-dashboards';
  try {
    assert.equal((await cli(m, api, 'setup', '--yes', '--no-apps')).status, 1);
  } finally { delete process.env.FAKE_MCP_BROKEN; }
  const saved = JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8'));
  const state = JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8'));
  assert.ok(Date.parse(saved.at) >= Date.parse(state.installedAt), `${saved.at} vs installedAt ${state.installedAt}`);
  assert.ok(saved.failed.includes('mcp.claude.fabric-dashboards'));
  const hook = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '../plugin/passioncode/hooks/session-start.js')], { encoding: 'utf8', cwd: os.tmpdir(), input: '', env: { ...process.env, HOME: m.home, PASSIONCODE_HOME: path.join(m.home, '.passioncode'), PATH: m.bin } });
  assert.match(hook.stdout, /the setup check of .* found 2 problem\(s\) \(mcp\.claude\.fabric-dashboards, mcp\.codex\.fabric-dashboards\)/);
});

test('a staged copy left by a killed run is removed before the next install', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const leftover = path.join(m.apps, 'Fabric Dashboards.app.passioncode-999999.partial');
  fs.mkdirSync(path.join(leftover, 'Contents'), { recursive: true });
  const r = await cli(m, api, 'setup', '--yes', '--with', 'dashboards', '--no-open');
  assert.equal(fs.existsSync(leftover), false, r.stdout);
  assert.ok(fs.existsSync(path.join(m.apps, 'Fabric Dashboards.app')));
});

// PC-89 (organization R1, N-12): a release train pins every app at one version. A machine on a train
// installs and reinstalls to the pinned release, never the latest; doctor compares with the pin and
// never asks to go back to an older one (an app's data may not open in an older release).
function onTrain(m, apps = { switchboard: '1.1.0', dashboards: '1.1.0', observatory: '1.1.0', inbox: '1.1.0', fabric: '1.1.0' }) {
  m.trains = path.join(m.home, 'trains');
  fs.mkdirSync(m.trains, { recursive: true });
  fs.writeFileSync(path.join(m.trains, 'org-test.json'), JSON.stringify({ train: 'org-test', title: 'Org Test', pinned: '2026-10-28', apps }));
  return m;
}

test('PC-89: setup --train installs the pinned release, not the latest, and doctor reports the train', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  const r = await cli(m, api, 'setup', '--yes', '--json', '--train', 'org-test');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(r.json.plan.some((i) => i.product === 'switchboard' && /pinned by release train org-test/.test(i.detail)));
  const plist = JSON.parse(fs.readFileSync(path.join(m.apps, 'Fabric Switchboard.app/Contents/Info.plist'), 'utf8'));
  assert.equal(plist.CFBundleShortVersionString, '1.1.0');
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, 'org-test');
  const d = await cli(m, api, 'doctor', '--json', '--offline');
  const row = (id) => d.json.checks.find((c) => c.id === id);
  assert.equal(row('train').state, 'ok');
  assert.match(row('train').detail, /^release train org-test \(Org Test, pinned 2026-10-28\): 4 of 5 apps at their pinned version; Fabric Switchboard 1\.1\.0/);
  assert.equal(row('app.switchboard').state, 'ok');
  assert.match(row('app.switchboard').detail, /^Fabric Switchboard 1\.1\.0 \(pinned by release train org-test\)$/);
});

test('PC-89: on a train an older app is reinstalled at the pin; a newer one is left alone, never downgraded', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine());
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' });
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0' });
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const d = await cli(m, api, 'doctor', '--json', '--offline');
  const row = (id) => d.json.checks.find((c) => c.id === id);
  assert.equal(row('app.switchboard').state, 'warn');
  assert.match(row('app.switchboard').detail, /1\.0\.0; release train org-test pins 1\.1\.0$/);
  assert.equal(row('app.dashboards').state, 'warn');
  assert.match(row('app.dashboards').detail, /1\.2\.0, ahead of release train org-test \(1\.1\.0\)/);
  assert.equal(row('app.dashboards').repair, null, 'no repair takes an app back');
  assert.equal(row('train').state, 'warn');
  const r = await cli(m, api, 'setup', '--yes', '--json', '--no-open');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.deepEqual(r.json.plan.filter((i) => i.kind === 'replace').map((i) => i.product), ['switchboard']);
  const v = (app) => JSON.parse(fs.readFileSync(path.join(m.apps, app, 'Contents/Info.plist'), 'utf8')).CFBundleShortVersionString;
  assert.equal(v('Fabric Switchboard.app'), '1.1.0');
  assert.equal(v('Fabric Dashboards.app'), '1.2.0');
});

test('PC-89: an unknown train is refused by setup and named by doctor; --train none leaves the train', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  const bad = await cli(m, api, 'setup', '--json', '--train', 'no-such-train');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /no release train "no-such-train" in this launcher \(known: org-test\)/);
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const d = await cli(m, api, 'doctor', '--json', '--offline');
  const row = d.json.checks.find((c) => c.id === 'train');
  assert.equal(row.state, 'fail');
  assert.equal(row.fix, 'npx @passioncode-ai/passioncode@latest setup --train none (or update the launcher)');
  const plan = await cli(m, api, 'setup', '--json', '--dry-run', '--offline', '--train', 'none');
  assert.equal(plan.status, 0, plan.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, 'gone', 'a dry run changes nothing');
  assert.ok(!plan.json.before.checks.some((c) => c.id === 'train'), 'the plan is made without the train');
  await cli(m, api, 'setup', '--json', '--yes', '--no-apps', '--no-open', '--offline', '--train', 'none');
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, undefined);
});

test('PC-89: every train this launcher ships is valid and pins only known apps', () => {
  const trains = require('../lib/trains');
  delete process.env.PASSIONCODE_TRAINS;
  assert.ok(trains.list().includes('organization-r1'));
  for (const id of trains.list()) {
    const tr = trains.load(id);
    assert.ok(Object.keys(tr.apps).every((a) => catalog.byId(a)), id);
  }
  assert.throws(() => trains.load('../etc'), /not a release train name/);
});

// The unit reading of PC-89: an app ahead of its pin whose signature fails is reinstalled, but from the
// latest release; the train's pin would take it back to an older one.
test('PC-89: a damaged app ahead of its pin is reinstalled from the latest release, never the older pin', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine());
  for (const id of ['switchboard', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0', broken: true });
  const r = await cli(m, api, 'setup', '--yes', '--json', '--no-open', '--train', 'org-test');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const item = r.json.plan.find((i) => i.kind === 'replace' && i.product === 'dashboards');
  assert.ok(item && /from its latest signed release/.test(item.detail), JSON.stringify(r.json.plan));
  const v = JSON.parse(fs.readFileSync(path.join(m.apps, 'Fabric Dashboards.app/Contents/Info.plist'), 'utf8')).CFBundleShortVersionString;
  assert.equal(v, '1.2.0');
});

test('PC-89: a plan shown and not acted on saves no train', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  const r = await cli(m, api, 'setup', '--json', '--offline', '--train', 'org-test');
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.json.planOnly, true);
  assert.equal(fs.existsSync(path.join(m.home, '.passioncode/state.json')) && JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, false);
});

// The seam reading of PC-89: a saved train this launcher no longer ships (renamed or retired in a later
// release) must not move every app to its latest release; apps wait for the person's choice.
test('PC-89: an unusable saved train touches no app until a train or none is named', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine());
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const r = await cli(m, api, 'setup', '--yes', '--json', '--no-open');
  assert.deepEqual(r.json.plan.filter((i) => i.kind === 'replace' || i.kind === 'install'), []);
  const v = JSON.parse(fs.readFileSync(path.join(m.apps, 'Fabric Switchboard.app/Contents/Info.plist'), 'utf8')).CFBundleShortVersionString;
  assert.equal(v, '1.1.0');
  assert.ok(r.json.humanSteps.includes('npx @passioncode-ai/passioncode@latest setup --train none (or update the launcher)'), JSON.stringify(r.json.humanSteps));
});

// The second seam reading of PC-89: a bundle whose version cannot be read (its Info.plist is sealed by
// the signature, so a damaged one often breaks both) may be ahead of the pin; it is never taken back.
test('PC-89: a damaged app whose version cannot be read is reinstalled from the latest, never the pin', async (t) => {
  const api = await releaseServer(t, { version: '1.3.0', also: ['1.1.0', '1.2.0'] });
  const m = onTrain(machine());
  for (const id of ['switchboard', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0', broken: true });
  fs.writeFileSync(path.join(m.apps, 'Fabric Dashboards.app/Contents/Info.plist'), 'not a plist');
  const save = await cli(m, api, 'setup', '--json', '--yes', '--no-apps', '--no-open', '--offline', '--train', 'org-test');
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, 'org-test', save.stderr + save.stdout);
  const doc = await cli(m, api, 'doctor', '--json', '--offline');
  const row = doc.json.checks.find((c) => c.id === 'app.dashboards');
  assert.match(row.detail, /version unknown/);
  assert.doesNotMatch(row.fix, /github\.com/, 'macOS never sends a person to download an app by hand');
  const r = await cli(m, api, 'doctor', '--fix', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const item = r.json.plan.find((i) => i.kind === 'replace' && i.product === 'dashboards');
  assert.ok(item && !/pinned by release train/.test(item.detail), JSON.stringify(r.json.plan));
  const v = JSON.parse(fs.readFileSync(path.join(m.apps, 'Fabric Dashboards.app/Contents/Info.plist'), 'utf8')).CFBundleShortVersionString;
  assert.equal(v, '1.3.0');
});

test('PC-89: with an unusable saved train doctor promises no app reinstall', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine());
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const doc = await cli(m, api, 'doctor', '--json');
  const apps = doc.json.checks.filter((c) => /^app\.[^.]+(\.signature)?$/.test(c.id));
  assert.ok(apps.length);
  assert.ok(apps.every((c) => !c.repair), JSON.stringify(apps.filter((c) => c.repair)));
  const out = apps.find((c) => c.id === 'app.switchboard');
  assert.match(out.fix, /^first make the release train usable: .*setup --train none/);
});

test('PC-89: declining every offer in an interactive run saves no train', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' });
  // An interactive run, in a child so the launcher reads this machine's environment: every answer is no.
  const script = `require(${JSON.stringify(path.join(__dirname, '../lib/setup'))}).setup({ online: false, noApps: true, train: 'org-test', ask: async () => 'n' })
    .then((r) => process.stdout.write(JSON.stringify(r.plan)), (e) => { console.error(e); process.exit(1); });`;
  const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const plan = JSON.parse(r.stdout);
  assert.ok(plan.length && plan.every((i) => !i.selected), r.stdout);
  assert.equal(fs.existsSync(path.join(m.home, '.passioncode/state.json')) && JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, false);
});

test('PC-89: versions that are not x.y.z[-pre] are neither newer nor older; Windows 1.2.3.0 reads as 1.2.3', () => {
  const D = require('../lib/doctor');
  assert.equal(D.newer('1.1.0', 'undefined'), false);
  assert.equal(D.newer('1.2.1', '1.2'), false);
  assert.equal(D.newer('0.2.50', '0.2.50-rc.1'), true);
  assert.equal(D.normVersion('1.2.3.0'), '1.2.3');
  assert.equal(D.normVersion('1.2'), null);
});

// The third seam reading of PC-89: a run that goes ahead saves the train even when its plan holds only
// offers that default to no, and `--train none` always clears a saved one (the way out of an unusable train).
test('PC-89: a run that goes ahead saves the train; --train none always clears one', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'supabase') }));
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  await cli(m, api, 'setup', '--json', '--yes', '--no-apps', '--no-open', '--offline');
  const state = () => { try { return JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train; } catch (_) { return undefined; } };
  const r = await cli(m, api, 'setup', '--yes', '--json', '--no-open', '--offline', '--train', 'org-test');
  assert.ok(r.json.plan.every((i) => !i.selected), JSON.stringify(r.json.plan));
  assert.equal(state(), 'org-test', r.stderr);
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')), train: 'gone' }));
  await cli(m, api, 'setup', '--yes', '--json', '--no-open', '--offline', '--train', 'none');
  assert.equal(state(), undefined);
  const doc = await cli(m, api, 'doctor', '--json', '--offline');
  assert.ok(!doc.json.checks.some((c) => c.id === 'train'));
  // Interactive: answering no to an unrelated install still forgets the train.
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ ...JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')), train: 'gone' }));
  const script = `require(${JSON.stringify(path.join(__dirname, '../lib/setup'))}).setup({ online: false, train: null, ask: async () => 'n' })
    .then(() => {}, (e) => { console.error(e); process.exit(1); });`;
  const i = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(i.status, 0, i.stderr);
  assert.equal(state(), undefined);
});

test('PC-89: an unusable saved train leaves the update repair and Windows downloads; no app install is promised', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  installApp(m, catalog.byId('dashboards'), { version: '1.1.0' });
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const switchboard = catalog.byId('switchboard');
  fs.writeFileSync(path.join(m.home, '.claude.json'), JSON.stringify({ mcpServers: { [switchboard.mcp.name]: { command: path.join(m.apps, switchboard.app, switchboard.mcp.bin), args: [] } } }));
  const doc = await cli(m, api, 'doctor', '--json', '--offline');
  assert.ok(!doc.json.checks.some((c) => c.fix && /setup --with/.test(c.fix)), JSON.stringify(doc.json.checks.filter((c) => c.fix && /setup --with/.test(c.fix))));
  const stale = doc.json.checks.find((c) => c.id === 'mcp.claude.switchboard');
  assert.ok(stale && stale.state === 'fail' && /first make the release train usable/.test(stale.fix), JSON.stringify(stale));
  assert.ok(doc.json.checks.some((c) => c.repair && c.repair.kind === 'update'), 'the update repair still runs');
});

test('PC-89: an app version that is not x.y.z is never reported as the latest', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0' });
  const m = machine();
  installApp(m, catalog.byId('switchboard'), { version: '1.1' });
  const doc = await cli(m, api, 'doctor', '--json');
  const row = doc.json.checks.find((c) => c.id === 'app.switchboard');
  assert.equal(row.state, 'warn');
  assert.doesNotMatch(row.detail, /\(latest\)/);
  assert.match(row.detail, /the latest is 1\.2\.0/);
});
