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
function releaseServer(t, { version = '1.2.0', tamper = null, foreign = null, team = null, broken = null } = {}) {
  const files = new Map(); // `${repo}/${name}` → bytes
  const releasesOf = new Map();
  let base;
  for (const pr of catalog.PRODUCTS) {
    const asset = pr.asset(version);
    const bytes = Buffer.from(JSON.stringify({ app: pr.app, version, ...(team === pr.id ? { team } : {}), ...(broken === pr.id ? { broken: true } : {}) }));
    const sums = `${crypto.createHash('sha256').update(bytes).digest('hex')}  ${asset}\n`;
    const served = tamper === pr.id ? Buffer.from(`${bytes}x`) : bytes;
    const signer = foreign === pr.id ? makeKey() : KEY;
    files.set(`${pr.repo}/${asset}`, served);
    files.set(`${pr.repo}/SHA256SUMS`, Buffer.from(sums));
    files.set(`${pr.repo}/SHA256SUMS.asc`, Buffer.from(signer.sign(Buffer.from(sums))));
    releasesOf.set(pr.repo, () => ({
      tag_name: `v${version}`, draft: false, prerelease: !!pr.prerelease, html_url: `https://example.invalid/${pr.repo}`,
      assets: [asset, 'SHA256SUMS', 'SHA256SUMS.asc'].map((name) => ({
        name, size: files.get(`${pr.repo}/${name}`).length, browser_download_url: `${base}/dl/${pr.repo}/${name}`,
        // GitHub's digest is of the published bytes; a tampered upload still differs from the signed sums.
        digest: `sha256:${crypto.createHash('sha256').update(files.get(`${pr.repo}/${name}`)).digest('hex')}`,
      })),
    }));
  }
  const server = http.createServer((req, res) => {
    const u = new URL(req.url, base);
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

function cli(m, api, ...args) {
  const env = {
    ...process.env, HOME: m.home, PATH: `${m.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, PASSIONCODE_PAYLOAD: m.payload, PASSIONCODE_HOME: '',
    PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_APPLICATIONS: m.apps, PASSIONCODE_GITHUB_API: api,
    PASSIONCODE_RELEASE_KEY: path.join(m.home, 'key.asc'), PASSIONCODE_PLATFORM: 'darwin', PASSIONCODE_SERVICES_DIR: path.join(m.home, 'services'),
    KIMI_CODE_HOME: path.join(m.home, '.kimi-code'), PASSIONCODE_FABRIC_DASHBOARDS_MCP: '', FABRIC_SERVICES_DIR: '',
  };
  delete env.PASSIONCODE_FABRIC_DASHBOARDS_MCP;
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
