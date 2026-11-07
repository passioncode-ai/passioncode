'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
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
const TOOLS = ['codesign', 'xcrun', 'spctl', 'plutil', 'pgrep', 'ditto', 'hdiutil', 'launchctl', 'open', 'supabase', 'docker', 'netstat', 'ps'];

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
function releaseServer(t, { version = '1.2.0', also = [], tamper = null, foreign = null, team = null, broken = null, nested = null } = {}) {
  const files = new Map(); // `${repo}/${name}` → bytes
  const releasesOf = new Map();
  const tagged = new Map(); // `${repo}@v${version}` → release, `also` holds older releases a train may pin
  let base;
  for (const v of [...also, version]) for (const pr of catalog.PRODUCTS) {
    const version = v;
    const asset = pr.asset(version);
    const bytes = Buffer.from(JSON.stringify({ app: pr.app, version, ...(team === pr.id ? { team } : {}), ...(broken === pr.id ? { broken: true } : {}), ...(nested === pr.id ? { folder: asset.replace(/\.zip$/, '') } : {}) }));
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

// PC-135: these cases simulate macOS (PASSIONCODE_PLATFORM darwin) with shell-script stand-ins for ditto, codesign,
// hdiutil and the rest, which Windows cannot start; Windows installs are proved in test/windows.test.js.
const MAC_SIM = process.platform === 'win32' && 'simulates macOS with shell-script stand-ins Windows cannot start';

// toolRules: PassionCode's Claude Code tool rules already in place (PC-117), so other tests see no such offer.
function machine({ tools = TOOLS, toolRules = true, commandRules = true } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-setup-'));
  const payload = path.join(home, 'payload'); makePayload(payload);
  const bin = path.join(home, 'fakebin'); fs.mkdirSync(bin);
  for (const name of tools) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-tools.js')}" ${name} "$@"\n`, { mode: 0o755 });
  // A tool left out is "not found" even where the host has one in /usr/bin (CI runners carry docker).
  for (const name of TOOLS.filter((x) => !tools.includes(x))) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\nexit 127\n', { mode: 0o755 });
  fs.writeFileSync(path.join(home, 'key.asc'), KEY.publicArmour);
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: {} }));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true }); // Claude Code is here
  // commandRules: the launcher's own command rules already in place too (PC-119).
  const P = require('../lib/permissions');
  const allow = [...(toolRules ? P.RULES : []), ...(commandRules ? P.COMMANDS.map((r) => r.rule) : [])];
  if (allow.length) fs.writeFileSync(path.join(home, '.claude', 'settings.json'), JSON.stringify({ permissions: { allow } }));
  fs.mkdirSync(path.join(home, '.codex'), { recursive: true });
  fs.mkdirSync(path.join(home, 'Applications'));
  fs.mkdirSync(path.join(home, 'services'));
  return { home, payload, bin, apps: path.join(home, 'Applications') };
}

function cliEnv(m, api) {
  const env = {
    ...process.env, HOME: m.home, USERPROFILE: m.home, PATH: `${m.bin}:${path.dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, PASSIONCODE_PAYLOAD: m.payload, PASSIONCODE_HOME: '',
    PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_APPLICATIONS: m.apps, PASSIONCODE_GITHUB_API: api,
    PASSIONCODE_RELEASE_KEY: path.join(m.home, 'key.asc'), PASSIONCODE_PLATFORM: 'darwin', PASSIONCODE_SERVICES_DIR: path.join(m.home, 'services'),
    KIMI_CODE_HOME: path.join(m.home, '.kimi-code'), PASSIONCODE_FABRIC_DASHBOARDS_MCP: '', FABRIC_SERVICES_DIR: '',
  };
  delete env.PASSIONCODE_FABRIC_DASHBOARDS_MCP;
  if (m.trains) env.PASSIONCODE_TRAINS = m.trains; else delete env.PASSIONCODE_TRAINS;
  if (m.configDir) env.CLAUDE_CONFIG_DIR = m.configDir;
  // PC-145: a per-user run names no folder; the shared one is this machine's stand-in for /Applications.
  if (m.perUser) { delete env.PASSIONCODE_APPLICATIONS; env.PASSIONCODE_SHARED_APPLICATIONS = m.shared; }
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

test('a new machine: setup --yes installs the verified apps, the skills and every MCP server, then lists the person\'s steps', { skip: MAC_SIM }, async (t) => {
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
  assert.ok(proved.some((c) => /switchboard, switchboard_accounts answered/.test(c.detail)), JSON.stringify(out.after.checks.filter((c) => c.area === 'mcp')));
  assert.ok(proved.some((c) => /fabric-dashboards, list_services answered/.test(c.detail)));
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
  // Fabric waits for Docker, so the re-run names it rather than calling everything in place (PC-101).
  assert.match(again.stdout, /Nothing was changed: Fabric was not installed \(see your steps below\)\./);
  assert.doesNotMatch(again.stdout, /in place/);
  const calls = toolLog(m).slice(before);
  assert.ok(!calls.some((l) => /^(ditto|open|launchctl|hdiutil)/.test(l)), calls.join('\n'));
});

test('an existing broken setup: setup repairs, checks again and prints before → after', { skip: MAC_SIM }, async (t) => {
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

test('PC-152, PC-163: doctor names a service whose connection another OS account accepted, and sends it nothing', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  let reads = 0;
  const server = http.createServer((req, res) => { reads += 1; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ status: 'ok', service: { id: 'project-observatory', version: '9.9.9' } })); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const m = machine();
  installApp(m, catalog.byId('observatory'));
  fs.writeFileSync(path.join(m.home, 'services', 'project-observatory.default.json'), JSON.stringify({
    protocol: 'fabric-service/0.1', id: 'project-observatory', instance: 'default', name: 'Project Observatory',
    origin: `http://127.0.0.1:${port}`, lifecycle: { manager: 'launchd', label: 'org.example.observatory' },
  }));
  // macOS's socket table names process 4242 as the listener on the service's port.
  const table = path.join(m.home, 'netstat.txt');
  fs.writeFileSync(table, 'Active Internet connections (including servers)\n'
    + 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options\n'
    + `tcp4       0      0  127.0.0.1.${port}        127.0.0.1.{PEER}        ESTABLISHED            0            0  408300  146988   python3.12:4242  00102 00000100 0000000011712df7 00000081 04000900      2      0 000000\n`
    + `tcp4       0      0  127.0.0.1.${port}        *.*                    LISTEN                 0            0  131072  131072   python3.12:4242  00000 00000006 000000000ffc7886 00000000 00000800      1      0 000000\n`);
  // The server end of doctor's own connection: the test's server tells the stand-in netstat the client's port.
  server.on('connection', (sock) => fs.writeFileSync(`${table}.peer`, String(sock.remotePort)));
  const uid = process.getuid();
  const row = async (owner) => {
    fs.rmSync(`${table}.peer`, { force: true });
    process.env.FAKE_NETSTAT = table;
    if (owner === null) delete process.env.FAKE_PS_UIDS; else process.env.FAKE_PS_UIDS = `4242=${owner}`;
    try { return (await cli(m, api, 'doctor', '--json')).json.checks.find((c) => c.id === 'service.project-observatory.default'); }
    finally { delete process.env.FAKE_NETSTAT; delete process.env.FAKE_PS_UIDS; }
  };
  const foreign = await row(uid + 1);
  assert.equal(foreign.state, 'fail', JSON.stringify(foreign));
  assert.match(foreign.detail, new RegExp(`Project Observatory: port ${port} belongs to another OS account \\(uid ${uid + 1}\\); doctor sent it nothing and did not read its answer`));
  assert.match(foreign.fix, new RegExp(`another OS account's program holds port ${port}`));
  assert.equal(foreign.repair, null, 'a kickstart cannot free a port another account holds');
  const untold = await row(null);
  assert.equal(untold.state, 'fail', JSON.stringify(untold));
  assert.match(untold.detail, new RegExp(`the owner of port ${port} cannot be told \\(the owner of process 4242 could not be read\\)`));
  assert.equal(reads, 0, 'nothing went to a listener whose owner is not this account');
  // PC-163: a socket table this system cuts short (some macOS releases give an ad-hoc signed reader only its own
  // sockets) tells no owner: never healthy, never another account, and never a kickstart.
  const full = fs.readFileSync(table, 'utf8');
  fs.writeFileSync(table, '');
  const restricted = await row(uid);
  fs.writeFileSync(table, full);
  assert.equal(restricted.state, 'warn', JSON.stringify(restricted));
  assert.match(restricted.detail, new RegExp(`the owner of port ${port} cannot be told \\(table-restricted`));
  assert.match(restricted.fix, new RegExp(`shows doctor only its own sockets, so it cannot tell who answers on port ${port}; check the service in Fabric Dashboards`));
  assert.equal(restricted.repair, null);
  assert.equal(reads, 0, 'nothing went to a listener whose owner cannot be told');
  // PC-163: the owner is the process that accepted doctor's connection, not the listener a table names beside it.
  fs.writeFileSync(table, full.replace(/(ESTABLISHED\s+0\s+0\s+\d+\s+\d+\s+)python3\.12:4242/, '$1python3.12:4343'));
  process.env.FAKE_PS_UIDS_EXTRA = `4343=${uid + 1}`;
  const accepted = await row(uid);
  delete process.env.FAKE_PS_UIDS_EXTRA;
  fs.writeFileSync(table, full);
  assert.equal(accepted.state, 'fail', JSON.stringify(accepted));
  assert.match(accepted.detail, new RegExp(`port ${port} belongs to another OS account \\(uid ${uid + 1}\\)`));
  assert.equal(reads, 0, 'nothing went to a connection another account accepted');
  const own = await row(uid);
  assert.equal(own.state, 'ok', JSON.stringify(own));
  assert.match(own.detail, /answers at http:\/\/127\.0\.0\.1:\d+ \(9\.9\.9\), status ok/);
  assert.equal(reads, 1, 'this account\'s listener is read once');
});

test('PC-164: a service degraded only by slots waiting for setup reads "waits for setup", not a failure', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  let answer = {};
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(answer)); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { port } = server.address();
  const m = machine();
  installApp(m, catalog.byId('observatory'));
  fs.writeFileSync(path.join(m.home, 'services', 'project-observatory.default.json'), JSON.stringify({
    protocol: 'fabric-service/0.1', id: 'project-observatory', instance: 'default', name: 'Project Observatory',
    origin: `http://127.0.0.1:${port}`, lifecycle: { manager: 'launchd', label: 'org.example.observatory' },
    commands: { doctor: ['project-observatory', 'doctor'] },
  }));
  // The listener is this account's own process (PC-152).
  const table = path.join(m.home, 'netstat.txt');
  fs.writeFileSync(table, 'Active Internet connections (including servers)\n'
    + 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options\n'
    + `tcp4       0      0  127.0.0.1.${port}        127.0.0.1.{PEER}        ESTABLISHED            0            0  408300  146988   python3.12:4242  00102 00000100 0000000011712df7 00000081 04000900      2      0 000000\n`
    + `tcp4       0      0  127.0.0.1.${port}        *.*                    LISTEN                 0            0  131072  131072   python3.12:4242  00000 00000006 000000000ffc7886 00000000 00000800      1      0 000000\n`);
  // The server end of doctor's own connection: the test's server tells the stand-in netstat the client's port.
  server.on('connection', (sock) => fs.writeFileSync(`${table}.peer`, String(sock.remotePort)));
  const row = async (doc) => {
    answer = doc;
    fs.rmSync(`${table}.peer`, { force: true });
    process.env.FAKE_NETSTAT = table; process.env.FAKE_PS_UIDS = `4242=${process.getuid()}`;
    try { return (await cli(m, api, 'doctor', '--json')).json.checks.find((c) => c.id === 'service.project-observatory.default'); }
    finally { delete process.env.FAKE_NETSTAT; delete process.env.FAKE_PS_UIDS; }
  };
  const setup = await row({ status: 'degraded', service: { version: '1.0.0' }, degraded: [{ source: 'OPENROUTER_KEY', setup: true }, { source: 'workspace', setup: true }] });
  assert.equal(setup.state, 'warn', JSON.stringify(setup));
  assert.match(setup.detail, /answers at http:\/\/127\.0\.0\.1:\d+ \(1\.0\.0\), waits for setup: OPENROUTER_KEY, workspace$/);
  assert.doesNotMatch(setup.detail, /status degraded/);
  assert.equal(setup.fix, 'finish its setup: a person fills OPENROUTER_KEY, workspace; project-observatory doctor names the steps');
  assert.equal(setup.repair, null);
  // A failure beside a setup entry is a degradation: the failure first, the setup named after it.
  const mixed = await row({ status: 'degraded', degraded: [{ source: 'store', reason: 'cannot write' }, { source: 'OPENROUTER_KEY', setup: true }] });
  assert.match(mixed.detail, /status degraded; degraded: store; waits for setup: OPENROUTER_KEY$/);
  assert.equal(mixed.fix, 'project-observatory doctor');
  const failing = await row({ status: 'degraded', degraded: [{ source: 'upstream' }, 'odd entry'] });
  assert.match(failing.detail, /status degraded; degraded: upstream, unnamed$/);
  // «waits for setup» needs a degraded answer whose every entry waits for setup: not an empty list, not another status.
  const empty = await row({ status: 'degraded', degraded: [] });
  assert.match(empty.detail, /status degraded$/);
  const starting = await row({ status: 'starting', degraded: [{ source: 'OPENROUTER_KEY', setup: true }] });
  assert.match(starting.detail, /status starting; waits for setup: OPENROUTER_KEY$/);
  assert.equal(starting.fix, 'project-observatory doctor');
});

test('PC-131: doctor says, as information, when automatic updates are off, and how to turn them on', async (t) => {
  const api = await releaseServer(t);
  const on = machine();
  const quiet = await cli(on, api, 'doctor', '--json');
  assert.ok(!quiet.json.checks.some((c) => c.id === 'skills.auto-update'), 'nothing to say while the switch is on');
  const off = machine();
  fs.mkdirSync(path.join(off.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(off.home, '.passioncode', 'state.json'), JSON.stringify({ installed: null, config: { auto: false } }));
  const r = await cli(off, api, 'doctor', '--json');
  const row = r.json.checks.find((c) => c.id === 'skills.auto-update');
  assert.ok(row, JSON.stringify(r.json.checks.map((c) => c.id)));
  assert.equal(row.state, 'info', 'information, never a failure or a repair');
  assert.equal(row.fix, 'npx @passioncode-ai/passioncode@latest config set update.auto on');
  assert.ok(!row.repair, 'no repair: doctor --fix leaves the switch alone');
  const saved = JSON.parse(fs.readFileSync(path.join(off.home, '.passioncode', 'doctor.json'), 'utf8'));
  assert.ok(!saved.failed.includes('skills.auto-update'), 'the saved check never counts it as a failure');
  const fixed = await cli(off, api, 'doctor', '--fix', '--json');
  assert.ok(!fixed.json.humanSteps.some((step) => /update\.auto on/.test(step)), 'never one of the steps setup or --fix asks for');
  assert.ok(!fixed.json.actions.some((a) => /update\.auto|config set/.test(JSON.stringify(a))), 'no action touches the switch');
  // --fix installed the set: the row is still there, information only, after the set's own rows.
  const after = fixed.json.after.checks.map((c) => c.id).filter((id) => id.startsWith('skills.'));
  assert.equal(fixed.json.after.checks.find((c) => c.id === 'skills.installed').state, 'ok', after.join(' '));
  assert.equal(after[after.length - 1], 'skills.auto-update', after.join(' '));
  assert.equal(fixed.json.after.checks.find((c) => c.id === 'skills.auto-update').state, 'info');
  assert.equal(JSON.parse(fs.readFileSync(path.join(off.home, '.passioncode', 'state.json'), 'utf8')).config.auto, false, 'doctor never turns it on');
});

test('doctor is read-only and exits 1 on a problem; doctor --fix repairs but installs and opens nothing', { skip: MAC_SIM }, async (t) => {
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
  test(`setup refuses ${name}: nothing is installed and the download is removed`, { skip: (opts.team || opts.broken) && MAC_SIM }, async (t) => {
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

test('a proving call that fails is a failed check that names the fix', { skip: MAC_SIM }, async (t) => {
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

// PC-104: with a check failing that setup cannot repair, a run that has nothing to change neither
// says "nothing to do" nor calls the machine set up without pointing at the checks; it exits by them.
test('PC-104: nothing to change above a failing check points at the checks and exits by them', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0' });
  assert.equal((await cli(m, api, 'setup', '--yes', '--no-apps')).status, 0);
  process.env.FAKE_MCP_BROKEN = 'fabric-dashboards';
  try {
    const run = await cli(m, api, 'setup', '--no-apps', '--json'); // no terminal, nothing to change
    const out = JSON.parse(run.stdout);
    assert.equal(out.planOnly, false, run.stdout);
    assert.deepEqual(out.actions, [], run.stdout);
    assert.ok(out.after.summary.fail > 0, run.stdout);
    assert.equal(run.status, 1, run.stdout);
    assert.match(require('../lib/setup').render(out), /in place; nothing was changed\. The checks below still stand\./);
    const dry = await cli(m, api, 'setup', '--no-apps', '--dry-run');
    assert.equal(dry.status, 0, dry.stdout);
    assert.match(dry.stdout, /Nothing to do\. The checks below still stand\./);
  } finally { delete process.env.FAKE_MCP_BROKEN; }
  // Through the CLI too: a plan that would leave Fabric names it and points at the failing check,
  // and a plan whose only change is a train is shown as a plan.
  const n = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  assert.equal((await cli(n, api, 'setup', '--yes')).status, 0);
  process.env.FAKE_MCP_BROKEN = 'fabric-dashboards';
  try {
    const would = await cli(n, api, 'setup', '--dry-run');
    assert.equal(would.status, 0, would.stdout);
    assert.match(would.stdout, /Nothing would change: Fabric would not be installed \(see the plan below\)\. The checks below still stand\./);
  } finally { delete process.env.FAKE_MCP_BROKEN; }
  // PC-107: the JSON result says a --dry-run was one; a run that applies does not carry the key.
  assert.equal((await cli(n, api, 'setup', '--dry-run', '--no-apps', '--json')).json.dryRun, true);
  assert.equal((await cli(n, api, 'setup', '--yes', '--no-apps', '--json')).json.dryRun, undefined);
  const train = await cli(n, api, 'setup', '--dry-run', '--no-apps', '--train', 'org-test');
  assert.equal(train.status, 0, train.stdout);
  assert.match(train.stdout, /Plan \(nothing was changed\):\n  • save release train org-test\n/);
  // PC-107: the train line says what was not saved; the footer says how to apply, and after a
  // --dry-run that is to run it without --dry-run.
  assert.match(train.stdout, /\nThe release train \(org-test\) was not saved\.\n\nRun it without --dry-run \(with --yes, or in a terminal\) to apply\.\n/);
  assert.doesNotMatch(train.stdout, /Nothing to do|Run it with --yes|answer in a terminal/);
});

// PC-105: one rule for "The checks below still stand.": every headline that says nothing changed adds
// it when a check is still open (FAIL or WARN) and only then; a plan's train is one of its lines.
test('PC-105: the checks are pointed at when one fails or warns, and a train is a plan line', { skip: MAC_SIM }, async (t) => {
  const { render } = require('../lib/setup');
  const sum = (warn, fail) => ({ ok: 1, warn, fail, info: 0 });
  const run = (over, warn = 0, fail = 0) => {
    const checks = [{ id: 'x', area: 'mcp', state: fail ? 'fail' : warn ? 'warn' : 'ok', detail: 'x' }];
    return render({ mode: 'existing', platform: 'darwin', plan: [], actions: [], humanSteps: [], planOnly: false,
      before: { checks, summary: sum(warn, fail) }, after: { checks, summary: sum(warn, fail) }, ...over });
  };
  const fabric = { kind: 'install', product: 'fabric', selected: false, detail: 'install Fabric', note: null };
  const cases = [
    [{ planOnly: true }, 'Nothing to do.'],
    [{}, 'Everything this command can set up is in place; nothing was changed.'],
    [{ planOnly: true, plan: [fabric] }, 'Nothing would change: Fabric would not be installed (see the plan below).'],
    [{ declined: true }, 'You declined every offer; nothing was changed.'],
    [{ planOnly: true, declined: true, trainNotSaved: 'org-test' }, 'You declined every offer; nothing was changed.'],
    [{ declined: true, notTaken: ['Fabric'] }, 'You declined every other offer, and Fabric was not installed; nothing was changed.'],
    [{ notTaken: ['Fabric'] }, 'Nothing was changed: Fabric was offered and not installed.'],
    [{ skipped: ['Fabric'] }, 'Nothing was changed: Fabric was not installed (see your steps below).'],
  ];
  for (const [over, headline] of cases) {
    const bare = run(over).split('\n');
    assert.ok(bare.includes(headline), `${headline} stands bare above passing checks:\n${bare.join('\n')}`);
    for (const [warn, fail] of [[1, 0], [0, 1]]) {
      assert.ok(run(over, warn, fail).split('\n').includes(`${headline} The checks below still stand.`), `${headline} with warn ${warn}, fail ${fail}`);
    }
  }
  // A plan whose only change is a train lists it; forgetting one names no train.
  const train = run({ planOnly: true, trainNotSaved: 'org-test' }).split('\n');
  assert.deepEqual(train.slice(train.indexOf('Plan (nothing was changed):'), train.indexOf('Plan (nothing was changed):') + 2), ['Plan (nothing was changed):', '  • save release train org-test']);
  assert.ok(train.includes('The release train (org-test) was not saved.'));
  // PC-110: an offer that defaults to no is still asked about in a terminal, so its plan keeps the questions.
  const offered = run({ planOnly: true, trainNotSaved: 'org-test', plan: [{ kind: 'install', product: 'fabric', detail: 'install Fabric', selected: false, checks: [] }] }).split('\n');
  assert.ok(offered.includes('Run it with --yes to apply, or in a terminal to answer its questions.'), offered.join('\n'));
  // PC-110: a terminal asks nothing about a train alone and saves it at once: no questions are promised.
  assert.ok(train.includes('Run it with --yes, or in a terminal, to apply.'), train.join('\n'));
  assert.ok(!train.some((l) => /answer its questions/.test(l)));
  const none = run({ planOnly: true, trainNotSaved: 'none' });
  assert.match(none, /\n  • forget the saved release train\n/);
  assert.match(none, /\nThe saved release train was not forgotten\.\n\nRun it with --yes, or in a terminal, to apply\.\n/);
  assert.match(run({ planOnly: true, dryRun: true, trainNotSaved: 'none' }), /\nRun it without --dry-run \(with --yes, or in a terminal\) to apply\.\n/);
  assert.doesNotMatch(none, /\(none\)/);
  // A declined named train is no plan line: it was the person's answer, not what a run would do.
  const declinedTrain = run({ planOnly: true, declined: true, trainNotSaved: 'org-test' });
  assert.doesNotMatch(declinedTrain, /save release train/);
  assert.match(declinedTrain, /The release train \(org-test\) was not saved\./);
  assert.doesNotMatch(declinedTrain, /Run it/); // PC-107: a declined run is no plan to apply
  assert.doesNotMatch(run({ planOnly: true, dryRun: true }), /Run it/); // nothing to apply, no footer
  // doctor --fix in text above a failing check it cannot repair: the pointer, and exit 1.
  const api = await releaseServer(t);
  const m = machine();
  installApp(m, catalog.byId('dashboards'), { version: '1.2.0' });
  assert.equal((await cli(m, api, 'setup', '--yes', '--no-apps')).status, 0);
  process.env.FAKE_MCP_BROKEN = 'fabric-dashboards';
  try {
    const fix = await cli(m, api, 'doctor', '--fix');
    assert.equal(fix.status, 1, fix.stdout);
    assert.match(fix.stdout, /^doctor --fix · /m);
    assert.match(fix.stdout, /\. The checks below still stand\.$/m);
  } finally { delete process.env.FAKE_MCP_BROKEN; }
});

// PC-107: the closing line names warnings beside the problems; a declined run's open checks are
// "Still open" (it is a run, as its exit code says); `none` is no train's name.
test('PC-107: warnings in the closing line, the declined label, and none reserved', () => {
  const { render } = require('../lib/setup');
  const sum = (warn, fail) => ({ ok: 1, warn, fail, info: 0 });
  const run = (over, warn = 0, fail = 0) => {
    const checks = [{ id: 'x', area: 'mcp', state: fail ? 'fail' : warn ? 'warn' : 'ok', detail: 'x' }];
    return render({ mode: 'existing', platform: 'darwin', plan: [], actions: [], humanSteps: [], planOnly: false,
      before: { checks, summary: sum(warn, fail) }, after: { checks, summary: sum(warn, fail) }, ...over }).split('\n');
  };
  const doctor = 'Check again any time: npx @passioncode-ai/passioncode@latest doctor';
  assert.ok(run({}).includes(`No problems. ${doctor}`));
  assert.ok(run({}, 1).includes(`No problems, 1 warning(s). ${doctor}`));
  assert.ok(run({}, 0, 2).includes(`2 problem(s). ${doctor}`));
  const done = { actions: [{ kind: 'update', detail: 'u', outcome: 'done' }] };
  assert.ok(run(done, 1).includes(`No problems remain (before: 0), 1 warning(s). ${doctor}`));
  assert.ok(run({ planOnly: true }, 1).includes('Open now:'));
  assert.ok(run({ planOnly: true, trainNotSaved: 'org-test' }, 1).includes('Open now:')); // a train plan, not declined
  assert.ok(run({}, 2).includes(`No problems, 2 warning(s). ${doctor}`));
  assert.ok(run({ planOnly: true, declined: true, trainNotSaved: 'org-test' }, 1).includes('Still open:'));
  assert.ok(run({ declined: true }, 1).includes('Still open:'));
  assert.ok(run({}, 1).includes('Still open:') && run(done, 1).includes('Still open:')); // any run that is not a plan
  // The warnings counted are the ones still open after the run, not the ones before it.
  const moved = (bw, aw) => {
    const at = (w) => ({ checks: [{ id: 'x', area: 'mcp', state: w ? 'warn' : 'ok', detail: 'x' }], summary: sum(w, 0) });
    return render({ mode: 'existing', platform: 'darwin', plan: [], humanSteps: [], planOnly: false, ...done, before: at(bw), after: at(aw) }).split('\n');
  };
  assert.ok(moved(2, 0).includes(`No problems remain (before: 0). ${doctor}`));
  assert.ok(moved(0, 1).includes(`No problems remain (before: 0), 1 warning(s). ${doctor}`));
  const trains = require('../lib/trains');
  assert.throws(() => trains.load('none'), /"none" is not a release train name/);
  // A launcher that ships no train says so, rather than "known: none".
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-trains-'));
  const was = process.env.PASSIONCODE_TRAINS;
  process.env.PASSIONCODE_TRAINS = empty;
  try {
    fs.writeFileSync(path.join(empty, 'none.json'), '{}');
    assert.deepEqual(trains.list(), []);
    assert.throws(() => trains.load('org-test'), /^Error: no release train "org-test": this launcher ships no release train$/);
  } finally {
    if (was === undefined) delete process.env.PASSIONCODE_TRAINS; else process.env.PASSIONCODE_TRAINS = was;
    fs.rmSync(empty, { recursive: true, force: true });
  }
});

test('a bundle that comes into use while its release downloads is not moved', { skip: MAC_SIM }, async (t) => {
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

test('doctor never starts Fabric\'s MCP server: starting it enrols a session', { skip: MAC_SIM }, async (t) => {
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
  // PC-124: the sessions-on-demand row names what a session Fabric starts still lacks (Switchboard is not installed here).
  const on = r.json.checks.find((x) => x.id === 'sessions.on-demand');
  assert.equal(on.state, 'warn');
  assert.match(on.detail, /missing Fabric Switchboard \(it starts the session\)$/);
  assert.equal(on.fix, 'npx @passioncode-ai/passioncode@latest setup --with switchboard', 'each part names what repairs it');
  installApp(m, catalog.byId('switchboard'));
  assert.equal((await cli(m, api, 'doctor', '--json')).json.checks.find((x) => x.id === 'sessions.on-demand').state, 'ok');
  // Claude Code's tool rules taken out: the row says so and names --allow-tools.
  const settingsFile = path.join(m.home, '.claude', 'settings.json');
  const doc = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
  doc.permissions.allow = doc.permissions.allow.filter((rule) => !rule.startsWith('mcp__'));
  fs.writeFileSync(settingsFile, JSON.stringify(doc));
  const noRules = (await cli(m, api, 'doctor', '--json')).json.checks.find((x) => x.id === 'sessions.on-demand');
  assert.deepEqual([noRules.state, noRules.fix], ['info', 'npx @passioncode-ai/passioncode@latest setup --allow-tools'], 'declined rules alone are the person\'s choice: information');
  assert.match(noRules.detail, /missing Claude Code's rules for PassionCode's own tools$/);
  // A Fabric entry Claude Code has but cannot use: the row reuses that entry's own repair (setup leaves it alone).
  const cj = path.join(m.home, '.claude.json'); const keep = fs.readFileSync(cj, 'utf8');
  const cdoc = JSON.parse(keep); cdoc.mcpServers = { ...(cdoc.mcpServers || {}), fabric: { command: '/bin/echo', args: [] } }; fs.writeFileSync(cj, JSON.stringify(cdoc));
  const broken = (await cli(m, api, 'doctor', '--json')).json.checks;
  const fabRow = broken.find((x) => x.id === 'mcp.claude.fabric');
  const bs = broken.find((x) => x.id === 'sessions.on-demand');
  assert.ok(fabRow && fabRow.state !== 'ok' && fabRow.fix, JSON.stringify(fabRow));
  assert.match(bs.detail, /a usable Fabric MCP server in Claude Code/);
  assert.ok(bs.fix.includes(fabRow.fix), bs.fix);
  // An entry in a form doctor does not read: a note, never 'missing' with a setup that would leave it alone.
  const odd = JSON.parse(keep); odd.mcpServers = { ...(odd.mcpServers || {}), fabric: { weird: true } }; fs.writeFileSync(cj, JSON.stringify(odd));
  const oddRow = (await cli(m, api, 'doctor', '--json')).json.checks.find((x) => x.id === 'sessions.on-demand');
  assert.doesNotMatch(oddRow.detail, /missing Fabric's MCP server/);
  assert.match(oddRow.detail, /a Fabric MCP entry in Claude Code that doctor can read/);
  assert.ok(!oddRow.fix || !oddRow.fix.endsWith('passioncode@latest setup'), String(oddRow.fix));
  fs.writeFileSync(cj, keep);
  // No Claude Code at all: the default agent may be another, so the row is information too.
  const noClaude = require('child_process').spawnSync(process.execPath, [BIN, 'doctor', '--json'], { env: { ...cliEnv(m, api), PASSIONCODE_CLAUDE: path.join(m.home, 'no-claude') }, encoding: 'utf8' });
  const nc = JSON.parse(noClaude.stdout).checks.find((x) => x.id === 'sessions.on-demand');
  assert.deepEqual([nc.state, nc.detail], ['info', 'sessions Fabric starts on a board request, with Claude Code as the default agent: missing Claude Code']);
  // Without Fabric the row is information, never a warning.
  const bare = await cli(machine(), api, 'doctor', '--json');
  assert.deepEqual((({ state, detail }) => ({ state, detail }))(bare.json.checks.find((x) => x.id === 'sessions.on-demand')),
    { state: 'info', detail: 'sessions Fabric starts on a board request: Fabric is not installed here' });
});

test('setup saves its after-check later than the release it installed, so the session hook shows what still fails', { skip: MAC_SIM }, async (t) => {
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
  const hook = require('node:child_process').spawnSync(process.execPath, [path.join(__dirname, '../plugin/passioncode/hooks/session-start.js')], { encoding: 'utf8', cwd: os.tmpdir(), input: '', env: { ...process.env, HOME: m.home, USERPROFILE: m.home, PASSIONCODE_HOME: path.join(m.home, '.passioncode'), PATH: m.bin } });
  assert.match(hook.stdout, /the setup check of .* found 2 problem\(s\) \(mcp\.claude\.fabric-dashboards, mcp\.codex\.fabric-dashboards\)/);
});

test('a staged copy left by a killed run is removed before the next install', { skip: MAC_SIM }, async (t) => {
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

test('PC-145, PC-146: a second user gets the apps in ~/Applications, made when absent; another user\'s copies are left byte for byte (SCN-017)', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  m.perUser = true;
  m.shared = path.join(m.home, 'shared-Applications');
  fs.rmdirSync(m.apps); // machine() made ~/Applications; this user has none yet
  // The first user's Dashboards in the shared folder, which this user cannot write (a standard user's /Applications).
  const theirs = path.join(m.shared, 'Fabric Dashboards.app');
  fs.mkdirSync(path.join(theirs, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(theirs, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: '0.0.1' }));
  const before = fs.readFileSync(path.join(theirs, 'Contents', 'Info.plist'));
  fs.chmodSync(m.shared, 0o555);
  t.after(() => fs.chmodSync(m.shared, 0o755));
  const own = path.join(m.home, 'Applications');
  assert.equal(fs.existsSync(own), false);
  // The plan names the folder each app goes into.
  const plan = await cli(m, api, 'setup', '--dry-run', '--json');
  assert.ok(plan.json.plan.some((i) => i.kind === 'install' && i.product === 'switchboard' && i.detail.includes(`into ${own} from`)), JSON.stringify(plan.json.plan));
  const r = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox']) {
    assert.ok(fs.existsSync(path.join(own, catalog.byId(id).app)), `${id} in ~/Applications`);
  }
  assert.deepEqual(fs.readdirSync(m.shared), ['Fabric Dashboards.app'], 'nothing added to the shared folder');
  assert.deepEqual(fs.readFileSync(path.join(theirs, 'Contents', 'Info.plist')), before, "the other user's copy is unchanged");
  assert.equal(fs.existsSync(path.join(m.home, '.Trash')) && fs.readdirSync(path.join(m.home, '.Trash')).length, false, 'nothing went to the Trash');
  const claudeJson = JSON.parse(fs.readFileSync(path.join(m.home, '.claude.json'), 'utf8')).mcpServers;
  assert.ok(claudeJson['fabric-dashboards'].command.startsWith(path.join(own, 'Fabric Dashboards.app')), claudeJson['fabric-dashboards'].command);
  const shared = r.json.after.checks.find((c) => c.id === 'app.dashboards.shared');
  assert.ok(shared && shared.state === 'info', JSON.stringify(r.json.after.checks.filter((c) => c.area === 'apps')));
  assert.equal(shared.detail, `Fabric Dashboards: the copy in ${theirs} is one you cannot replace, left as it is; macOS may open fabric-dashboards:// links with it instead of yours`);
  // An app with no links (Switchboard) gets no links clause; with no copy of its own, no "instead of yours".
  const sb = path.join(m.shared, 'Fabric Switchboard.app');
  fs.chmodSync(m.shared, 0o755);
  fs.mkdirSync(path.join(sb, 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(sb, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: '0.0.1' }));
  fs.renameSync(path.join(own, 'Fabric Inbox.app'), path.join(m.home, 'inbox-aside.app'));
  fs.mkdirSync(path.join(m.shared, 'Fabric Inbox.app', 'Contents'), { recursive: true });
  fs.writeFileSync(path.join(m.shared, 'Fabric Inbox.app', 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: '0.0.1' }));
  fs.chmodSync(m.shared, 0o555);
  const again = await cli(m, api, 'doctor', '--offline', '--json');
  const row = (id) => again.json.checks.find((c) => c.id === id);
  assert.equal(row('app.switchboard.shared').detail, `Fabric Switchboard: the copy in ${sb} is one you cannot replace, left as it is`);
  assert.equal(row('app.inbox.shared').detail, `Fabric Inbox: the copy in ${path.join(m.shared, 'Fabric Inbox.app')} is one you cannot replace, left as it is; macOS may open fabric-inbox:// links with it`);
  // A plain doctor afterwards reads this user's copies.
  const d = await cli(m, api, 'doctor', '--offline', '--json');
  assert.ok(d.json.checks.some((c) => c.id === 'app.dashboards' && c.state !== 'info'), JSON.stringify(d.json.checks.filter((c) => c.area === 'apps')));
  // An entry an earlier launcher registered from the other user's copy is named, with the step that moves it to this user's.
  const dash = catalog.byId('dashboards');
  const theirBin = path.join(theirs, dash.mcp.bin);
  fs.chmodSync(m.shared, 0o755);
  fs.mkdirSync(path.dirname(theirBin), { recursive: true });
  fs.writeFileSync(theirBin, '#!/bin/sh\n', { mode: 0o755 });
  fs.chmodSync(m.shared, 0o555);
  const cj = path.join(m.home, '.claude.json');
  const conf = JSON.parse(fs.readFileSync(cj, 'utf8'));
  conf.mcpServers['fabric-dashboards'] = { ...conf.mcpServers['fabric-dashboards'], command: theirBin };
  fs.writeFileSync(cj, JSON.stringify(conf));
  const stale = (await cli(m, api, 'doctor', '--offline', '--json')).json.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards');
  assert.equal(stale.state, 'warn', JSON.stringify(stale));
  // Edited by hand: the person's entry, never rewritten; doctor names the exact step.
  assert.equal(stale.detail, `Claude Code: fabric-dashboards runs from ${theirs}, not from your copy in ${own}; the launcher did not set this entry`);
  assert.equal(stale.fix, 'claude mcp remove --scope user fabric-dashboards, then npx @passioncode-ai/passioncode@latest doctor --fix');
  assert.equal(stale.repair, null);
  // PC-149: one an earlier launcher set from that copy (recorded, unchanged since) is re-pointed by setup.
  const stateFile = path.join(m.home, '.passioncode', 'state.json');
  const st = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  const recordAs = (entry) => fs.writeFileSync(stateFile, JSON.stringify({ ...st, mcpRegistrations: st.mcpRegistrations.map((x) => (x.agent === 'Claude Code' && x.name === 'fabric-dashboards' ? { ...x, entry } : x)) }));
  // The same command with other arguments than the launcher recorded: changed since, so the person's.
  recordAs({ ...conf.mcpServers['fabric-dashboards'], args: ['--other'] });
  const changed = (await cli(m, api, 'doctor', '--offline', '--json')).json.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards');
  assert.match(changed.detail, /the launcher did not set this entry$/, JSON.stringify(changed));
  recordAs(conf.mcpServers['fabric-dashboards']);
  const ours = (await cli(m, api, 'doctor', '--offline', '--json')).json.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards');
  assert.equal(ours.detail, `Claude Code: fabric-dashboards runs from ${theirs}, not from your copy in ${own}; setup points it at yours`);
  assert.equal(ours.fix, 'npx @passioncode-ai/passioncode@latest setup');
  const fixed = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(fixed.status, 0, fixed.stdout + fixed.stderr);
  assert.equal(JSON.parse(fs.readFileSync(cj, 'utf8')).mcpServers['fabric-dashboards'].command, path.join(own, 'Fabric Dashboards.app', dash.mcp.bin));
  assert.equal(fixed.json.after.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards').state, 'ok', JSON.stringify(fixed.json.after.checks.filter((c) => c.area === 'mcp')));
});

test('PC-160: another user\'s copy in the PASSIONCODE_APPLICATIONS folder is named, never used, replaced or registered from', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root owns every copy') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const dash = catalog.byId('dashboards');
  const theirs = path.join(m.apps, dash.app);
  fs.mkdirSync(path.dirname(path.join(theirs, dash.mcp.bin)), { recursive: true });
  fs.writeFileSync(path.join(theirs, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: '0.0.1' }));
  fs.writeFileSync(path.join(theirs, dash.mcp.bin), '#!/bin/sh\n', { mode: 0o755 });
  const before = fs.readFileSync(path.join(theirs, 'Contents', 'Info.plist'));
  // The bundle is this process's; under another uid it is another user's copy in the one folder the variable names.
  const asOther = (...args) => new Promise((resolve) => {
    const child = spawn(process.execPath, [BIN, ...args], { env: { ...cliEnv(m, api), PASSIONCODE_UID: String(process.getuid() + 1) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr, json: (() => { try { return JSON.parse(stdout); } catch (_) { return null; } })() }));
  });
  const note = `${theirs} is another user's copy, left as it is, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or set it to a folder of your own`;
  const d = await asOther('doctor', '--offline', '--json');
  const row = (id) => d.json.checks.find((c) => c.id === id);
  assert.equal(row('app.dashboards.shared').detail, `Fabric Dashboards: the copy in ${theirs} is another user's, left as it is; macOS may open fabric-dashboards:// links with it`);
  assert.deepEqual([row('app.dashboards').state, row('app.dashboards').detail, row('app.dashboards').fix, row('app.dashboards').blocked], ['info', 'Fabric Dashboards: not installed', note, true]);
  const r = await asOther('setup', '--yes', '--with', 'dashboards', '--json');
  const item = r.json.plan.find((i) => i.kind === 'install' && i.product === 'dashboards');
  assert.ok(item && item.blocked && !item.selected && item.note === note, JSON.stringify(r.json.plan));
  assert.deepEqual(fs.readFileSync(path.join(theirs, 'Contents', 'Info.plist')), before, "the other user's copy is unchanged");
  assert.deepEqual(fs.readdirSync(m.apps), [dash.app], 'nothing else installed');
  const servers = JSON.parse(fs.readFileSync(path.join(m.home, '.claude.json'), 'utf8')).mcpServers || {};
  assert.equal(servers['fabric-dashboards'], undefined, 'no MCP server registered from another user\'s copy');
  const u = await asOther('update', '--json');
  const step = u.json.steps.find((x) => x.kind === 'mcp' && x.detail.includes('fabric-dashboards'));
  assert.deepEqual(step, { kind: 'mcp', detail: `${theirs} is another user's copy of Fabric Dashboards; fabric-dashboards was not registered from it`, outcome: 'skipped' });
});

test('PC-147: a folder the user cannot write is named in the plan and nothing is downloaded', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  fs.chmodSync(m.apps, 0o555); // PASSIONCODE_APPLICATIONS names it, as a standard user's /Applications would be
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const r = await cli(m, api, 'setup', '--yes', '--json');
  const installs = r.json.plan.filter((i) => i.kind === 'install');
  assert.ok(installs.length && installs.every((i) => !i.selected && i.note.startsWith(`${m.apps} is not writable for you, so nothing is downloaded`)), JSON.stringify(installs));
  assert.deepEqual(fs.readdirSync(m.apps), [], 'nothing installed');
  assert.ok(!toolLog(m).some((l) => l.startsWith('ditto') || l.startsWith('hdiutil')), 'nothing unpacked');
  // Blocked apps are named as blocked, never as offers skipped or declined; doctor's fix names the folder, not --with.
  assert.deepEqual(r.json.blocked, installs.map((i) => catalog.byId(i.product).name));
  assert.equal(r.json.skipped, undefined, JSON.stringify(r.json.skipped));
  assert.equal(r.json.notTaken, undefined, JSON.stringify(r.json.notTaken));
  // Once the skills are in, a run changes nothing: its line names the blocked apps, never as offers not installed.
  const again = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(again.json.actions.length, 0, JSON.stringify(again.json.actions));
  assert.equal(again.json.skipped, undefined, JSON.stringify(again.json.skipped));
  const text = await cli(m, api, 'setup', '--yes');
  assert.match(text.stdout, /Nothing was changed: Fabric Switchboard, Fabric Dashboards, [^\n]* and [^,\n]* need a folder you can write; the steps below say which\./, text.stdout);
  const d = await cli(m, api, 'doctor', '--json', '--offline');
  const row = d.json.checks.find((c) => c.id === 'app.switchboard');
  assert.equal(row.fix, `${m.apps} is not writable for you, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or make it writable (in Finder, Get Info: untick Locked, and under Sharing & Permissions give yourself Read & Write)`);
});

test('PC-147: a blocked app is named and never asked about, in a terminal and with --yes; a blocked reinstall stays out of the repairs question', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' }); // outdated: setup would reinstall it
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ online: true, noOpen: true, withIds: ['dashboards', 'switchboard'], ask: async (q) => { asked.push(q); return 'y'; } })
      .then((r) => process.stdout.write(JSON.stringify({ actions: r.actions, steps: r.humanSteps, asked })), (e) => { console.error(e); process.exit(1); });`;
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.ok(!out.asked.some((q) => /^Install /.test(q)), JSON.stringify(out.asked));
  assert.ok(!out.asked.some((q) => /reinstall Fabric Switchboard/.test(q)), JSON.stringify(out.asked));
  assert.ok(!out.actions.some((a) => a.kind === 'install' || a.kind === 'replace'), JSON.stringify(out.actions));
  assert.ok(out.steps.includes(`Fabric Switchboard: ${m.apps} is not writable for you, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or make it writable (in Finder, Get Info: untick Locked, and under Sharing & Permissions give yourself Read & Write)`), JSON.stringify(out.steps));
  assert.ok(!toolLog(m).some((l) => l.startsWith('ditto') || l.startsWith('hdiutil')), 'nothing unpacked');
  // --yes says the same, and never calls the machine set up.
  const yes = await cli(m, api, 'setup', '--yes');
  assert.match(yes.stdout, /Fabric Switchboard: .* is not writable for you/, yes.stdout);
  assert.doesNotMatch(yes.stdout, /is in place/, yes.stdout);
  assert.doesNotMatch(yes.stdout, /\n\s*\d+\. npx @passioncode-ai\/passioncode@latest setup\n/, yes.stdout);
});

test('PC-147: blocked names its apps in every run: a dry run, a run that changed something else, and doctor offers no setup for them', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' }); // outdated: a replace this user cannot make
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  // The doctor rows for the outdated copy name the folder, never a setup that cannot replace it.
  const d = await cli(m, api, 'doctor', '--json');
  const row = d.json.checks.find((c) => c.id === 'app.switchboard');
  assert.equal(row.state, 'warn', JSON.stringify(row));
  assert.ok(row.fix.startsWith(`${m.apps} is not writable for you, so nothing is downloaded`), row.fix);
  // A first run sets up the skills and MCP (it changes something) and still names the blocked apps, two of them in plural.
  const first = await cli(m, api, 'setup', '--yes', '--with', 'dashboards,switchboard');
  assert.match(first.stdout, /\nDone:\n/, first.stdout);
  assert.match(first.stdout, /Not installed or replaced: Fabric Dashboards and Fabric Switchboard need a folder you can write; the steps below say which\./, first.stdout);
  const json = await cli(m, api, 'setup', '--yes', '--json', '--with', 'dashboards,switchboard');
  assert.deepEqual(json.json.blocked, ['Fabric Dashboards', 'Fabric Switchboard']);
  const note = `${m.apps} is not writable for you, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or make it writable (in Finder, Get Info: untick Locked, and under Sharing & Permissions give yourself Read & Write)`;
  assert.deepEqual(json.json.humanSteps, [`Fabric Dashboards: ${note}`, `Fabric Switchboard: ${note}`], JSON.stringify(json.json.humanSteps));
  // doctor --fix makes the same repairs without the blocked one, and names it.
  const fix = await cli(m, api, 'doctor', '--fix', '--json');
  assert.ok(!fix.json.actions.some((x) => x.kind === 'replace'), JSON.stringify(fix.json.actions));
  assert.deepEqual(fix.json.blocked, ['Fabric Switchboard']);
  assert.deepEqual(fix.json.humanSteps.filter((x) => x.includes('is not writable')), [`Fabric Switchboard: ${note}`]);
  // A dry run once the skills are in: nothing selected, so its headline names the apps that need a folder, and its JSON carries them.
  const dry = await cli(m, api, 'setup', '--dry-run', '--json', '--without', 'dashboards,observatory,inbox,fabric');
  assert.deepEqual(dry.json.blocked, ['Fabric Switchboard'], JSON.stringify(dry.json.plan));
  const dryText = await cli(m, api, 'setup', '--dry-run', '--without', 'dashboards,observatory,inbox,fabric');
  assert.match(dryText.stdout, /Nothing would change: Fabric Switchboard needs a folder you can write \(see the plan below\)\./, dryText.stdout);
});

test('PC-147: a terminal run answered no names the blocked apps as never asked, not as offers it left; doctor names the folder for Switchboard everywhere', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  installApp(m, catalog.byId('fabric'));
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ online: true, noOpen: true, ask: async (q) => { asked.push(q); return 'n'; } })
      .then((r) => process.stdout.write(JSON.stringify({ asked, declined: r.declined, notTaken: r.notTaken, blocked: r.blocked, text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.ok(out.asked.length && !out.asked.some((q) => /^Install /.test(q)), JSON.stringify(out.asked));
  assert.equal(out.declined, true);
  assert.equal(out.notTaken, undefined, JSON.stringify(out.notTaken));
  assert.ok(out.blocked.includes('Fabric Switchboard'), JSON.stringify(out.blocked));
  assert.match(out.text, /You declined every offer; nothing was changed\. Not asked about: Fabric Switchboard, [^\n]* need a folder you can write; the steps below say which\./, out.text);
  // doctor: the sessions row and a stale MCP entry for the absent, blocked Switchboard name the folder, never setup --with.
  const stale = path.join(m.apps, 'Fabric Switchboard.app/Contents/MacOS/switchboard-mcp');
  const cj = path.join(m.home, '.claude.json');
  const json = fs.existsSync(cj) ? JSON.parse(fs.readFileSync(cj, 'utf8')) : {};
  json.mcpServers = { ...(json.mcpServers || {}), switchboard: { type: 'stdio', command: stale, args: [] } };
  fs.writeFileSync(cj, JSON.stringify(json));
  const d = await cli(m, api, 'doctor', '--json');
  const note = `${m.apps} is not writable for you, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or make it writable (in Finder, Get Info: untick Locked, and under Sharing & Permissions give yourself Read & Write)`;
  const on = d.json.checks.find((x) => x.id === 'sessions.on-demand');
  assert.ok(on.fix.includes(note) && !on.fix.includes('setup --with switchboard'), on.fix);
  const entry = d.json.checks.find((x) => x.id === 'mcp.claude.switchboard');
  assert.equal(entry.state, 'fail', JSON.stringify(entry));
  assert.equal(entry.fix, note);
  const saved = JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8'));
  assert.ok(saved.blocked.includes('mcp.claude.switchboard'), JSON.stringify(saved));
  // setup's steps name the app once, the stale entry's row and the blocked install sharing one line.
  const steps = (await cli(m, api, 'setup', '--yes', '--json')).json.humanSteps;
  assert.deepEqual(steps.filter((x) => x.includes('Switchboard') && x.includes('is not writable')), [`Fabric Switchboard: ${note}`], JSON.stringify(steps));
  assert.ok(!steps.includes(note), 'no step without its app');
});

test('PC-147: an outdated app in use, in a folder the user cannot write, is named in blocked, never called in place; a damaged one is a blocked failure', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  for (const id of ['dashboards', 'observatory', 'inbox']) installApp(m, catalog.byId(id));
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0', running: true });
  assert.equal((await cli(m, api, 'setup', '--yes', '--without', 'fabric')).status, 0); // skills and MCP settled
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const r = await cli(m, api, 'setup', '--yes', '--json', '--without', 'fabric');
  assert.deepEqual(r.json.blocked, ['Fabric Switchboard'], JSON.stringify(r.json.after.checks.filter((c) => c.area === 'apps')));
  const text = await cli(m, api, 'setup', '--yes', '--without', 'fabric');
  assert.doesNotMatch(text.stdout, /is in place/, text.stdout);
  assert.match(text.stdout, /Nothing was changed: Fabric Switchboard needs a folder you can write/, text.stdout);
  // With Fabric in the run too (a blocked install item), each app is one step: Switchboard by its row, Fabric by its note.
  const both = await cli(m, api, 'setup', '--yes', '--json');
  const named = (app) => both.json.humanSteps.filter((x) => x.startsWith(`${app}: `) && x.includes('is not writable'));
  assert.equal(named('Fabric Switchboard').length, 1, JSON.stringify(both.json.humanSteps));
  assert.equal(named('Fabric').length, 1, JSON.stringify(both.json.humanSteps));
  assert.match(named('Fabric')[0], /it also needs Docker/);
  // A plan names it under its items with the folder, since the plan has no item of its own for it.
  const dry = await cli(m, api, 'setup', '--dry-run', '--without', 'fabric');
  assert.match(dry.stdout, /Nothing would change: Fabric Switchboard needs a folder you can write \(see the plan below\)\.[\s\S]*\n  – Fabric Switchboard: .* is not writable for you/, dry.stdout);
  const dryJson = await cli(m, api, 'setup', '--dry-run', '--json', '--without', 'fabric');
  assert.ok(dryJson.json.before.checks.some((c) => c.product === 'switchboard' && c.blocked && /is not writable for you/.test(c.fix)), 'the reason is in the check');
  // A damaged bundle there fails its signature check: doctor.json lists it as blocked, so the hook sends the person to doctor.
  fs.chmodSync(m.apps, 0o755);
  installApp(m, catalog.byId('inbox'), { broken: true });
  fs.chmodSync(m.apps, 0o555);
  await cli(m, api, 'doctor', '--json', '--offline');
  const saved = JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8'));
  assert.ok(saved.failed.includes('app.inbox.signature'), JSON.stringify(saved));
  assert.deepEqual(saved.blocked, saved.failed.filter((id) => ['app.inbox.signature', 'app.switchboard.signature'].includes(id)), JSON.stringify(saved));
  // The damaged, idle Inbox has a reinstall item of its own: the plan names it on that one line, never again below it.
  const dryDamaged = await cli(m, api, 'setup', '--dry-run', '--without', 'fabric');
  const inboxLines = dryDamaged.stdout.split('\n').filter((l) => /^\s+– /.test(l) && l.includes('Fabric Inbox'));
  assert.equal(inboxLines.length, 1, dryDamaged.stdout);
  assert.match(inboxLines[0], /reinstall Fabric Inbox/, dryDamaged.stdout);
});

test('PC-145, PC-147: setup plans from the home it is given, as doctor and the install do', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') }); // HOME, with a ~/Applications this user may write
  m.perUser = true;
  m.shared = path.join(m.home, 'shared-Applications');
  fs.mkdirSync(m.shared);
  const other = machine({ tools: TOOLS.filter((x) => x !== 'docker') }); // the home passed in, whose Applications is locked
  fs.chmodSync(other.apps, 0o555);
  t.after(() => fs.chmodSync(other.apps, 0o755));
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ home: ${JSON.stringify(other.home)}, online: false, noOpen: true, dryRun: true })
      .then((r) => process.stdout.write(JSON.stringify({ plan: r.plan, blocked: r.blocked })), (e) => { console.error(e); process.exit(1); });`;
  const run = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  const installs = out.plan.filter((i) => i.kind === 'install');
  assert.equal(installs.length, catalog.PRODUCTS.length, JSON.stringify(out.plan));
  for (const i of installs) {
    assert.ok(i.blocked && i.detail.includes(`into ${other.apps} from`), JSON.stringify(i));
    assert.ok(i.note.startsWith(`${other.apps} is not writable for you`), JSON.stringify(i));
  }
  assert.deepEqual([...out.blocked].sort(), catalog.PRODUCTS.map((p) => p.name).sort());
  // The other way round: the home passed in may be written, HOME's may not. On a release train, its damaged Switchboard
  // ahead of its pin is reinstalled from the latest and its Inbox behind its pin from the pin; the Install question names
  // its folder; none of them is worked out from HOME, where no app is.
  fs.chmodSync(other.apps, 0o755);
  installApp(other, catalog.byId('switchboard'), { version: '1.0.0', broken: true });
  installApp(other, catalog.byId('inbox'), { version: '1.0.0' });
  onTrain(m, { switchboard: '0.9.0', dashboards: '1.1.0', observatory: '1.1.0', inbox: '1.1.0', fabric: '1.1.0' });
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const asking = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ home: ${JSON.stringify(other.home)}, online: true, noOpen: true, train: 'org-test', withIds: ['dashboards', 'switchboard', 'inbox'], ask: async (q) => { asked.push(q); return 'n'; } })
      .then((r) => process.stdout.write(JSON.stringify({ plan: r.plan, asked })), (e) => { console.error(e); process.exit(1); });`;
  const second = await new Promise((resolve) => { // async: the release server answers from this process
    const child = spawn(process.execPath, ['-e', asking], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(second.status, 0, second.stderr);
  const back = JSON.parse(second.stdout);
  assert.ok(back.asked.some((q) => q.startsWith(`Install Fabric Dashboards into ${other.apps}?`)), JSON.stringify(back.asked));
  const item = (id) => back.plan.find((i) => i.kind === 'replace' && i.product === id) || {};
  assert.ok(!item('switchboard').blocked && /from its latest signed release/.test(item('switchboard').detail), JSON.stringify(back.plan));
  assert.ok(!item('inbox').blocked && /from its release 1\.1\.0, pinned by release train org-test/.test(item('inbox').detail), JSON.stringify(back.plan));
  assert.ok(!back.plan.some((i) => i.kind === 'install' && ['switchboard', 'inbox'].includes(i.product)), JSON.stringify(back.plan));
  assert.ok(back.asked.some((q) => /reinstall Fabric Switchboard/.test(q)), JSON.stringify(back.asked));
});

test('PC-147: on a release train, an app behind its pin, in use, in a locked folder is blocked once; an unreadable version is not', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  for (const id of ['dashboards', 'observatory', 'inbox']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0', running: true });
  assert.equal((await cli(m, api, 'setup', '--yes', '--train', 'org-test', '--without', 'fabric')).status, 0);
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const r = await cli(m, api, 'setup', '--yes', '--json', '--without', 'fabric');
  assert.deepEqual(r.json.blocked, ['Fabric Switchboard'], JSON.stringify(r.json.after.checks.filter((c) => c.area === 'apps')));
  const dry = await cli(m, api, 'setup', '--dry-run', '--without', 'fabric');
  assert.equal(dry.stdout.split('\n').filter((l) => l.startsWith('  – Fabric Switchboard: ')).length, 1, dry.stdout);
  // A version the launcher cannot read, its signature fine: no replace, so not blocked, and no step asks for the folder alone.
  fs.chmodSync(m.apps, 0o755);
  const plist = path.join(m.apps, 'Fabric Switchboard.app/Contents/Info.plist');
  fs.writeFileSync(plist, JSON.stringify({ ...JSON.parse(fs.readFileSync(plist, 'utf8')), CFBundleShortVersionString: 'nightly' }));
  fs.chmodSync(m.apps, 0o555);
  const odd = await cli(m, api, 'setup', '--yes', '--json', '--without', 'fabric');
  assert.equal(odd.json.blocked, undefined, JSON.stringify(odd.json.blocked));
  assert.ok(odd.json.humanSteps.every((x) => !/is not writable/.test(x) || /if its signature check fails too, setup cannot reinstall it/.test(x)), JSON.stringify(odd.json.humanSteps));
});

test('PC-147: a blocked Fabric without Docker, with a stale MCP entry, is one step that says both', { skip: MAC_SIM || (process.getuid?.() === 0 && 'root writes anyway') }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  fs.chmodSync(m.apps, 0o555);
  t.after(() => fs.chmodSync(m.apps, 0o755));
  const cj = path.join(m.home, '.claude.json');
  const conf = fs.existsSync(cj) ? JSON.parse(fs.readFileSync(cj, 'utf8')) : {};
  conf.mcpServers = { ...(conf.mcpServers || {}), fabric: { type: 'stdio', command: path.join(m.apps, 'Fabric.app/Contents/MacOS/fabric-mcp'), args: ['--runner', 'claude-code'] } };
  fs.writeFileSync(cj, JSON.stringify(conf));
  const r = await cli(m, api, 'setup', '--yes', '--json');
  const fabric = r.json.humanSteps.filter((x) => x.startsWith('Fabric: '));
  assert.equal(fabric.length, 1, JSON.stringify(r.json.humanSteps));
  assert.match(fabric[0], /it also needs Docker/);
  // With no blocked item for Fabric (left out, or doctor --fix), the stale entry is still its step, once.
  for (const args of [['setup', '--yes', '--json', '--without', 'fabric'], ['doctor', '--fix', '--json']]) {
    const run = await cli(m, api, ...args);
    const steps = run.json.humanSteps.filter((x) => x.startsWith('Fabric: '));
    assert.equal(steps.length, 1, `${args.join(' ')}: ${JSON.stringify(run.json.humanSteps)}`);
    assert.match(steps[0], /is not writable for you/);
  }
});

test('PC-89: setup --train installs the pinned release, not the latest, and doctor reports the train', { skip: MAC_SIM }, async (t) => {
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

test('PC-89: on a train an older app is reinstalled at the pin; a newer one is left alone, never downgraded', { skip: MAC_SIM }, async (t) => {
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
  assert.equal(row.fix, 'npx @passioncode-ai/passioncode@latest setup --yes --no-apps --train none (or update the launcher)');
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
test('PC-89: a damaged app ahead of its pin is reinstalled from the latest release, never the older pin', { skip: MAC_SIM }, async (t) => {
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
  assert.ok(r.json.humanSteps.includes('npx @passioncode-ai/passioncode@latest setup --yes --no-apps --train none (or update the launcher)'), JSON.stringify(r.json.humanSteps));
});

// The second seam reading of PC-89: a bundle whose version cannot be read (its Info.plist is sealed by
// the signature, so a damaged one often breaks both) may be ahead of the pin; it is never taken back.
test('PC-89: a damaged app whose version cannot be read is reinstalled from the latest, never the pin', { skip: MAC_SIM }, async (t) => {
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
  for (const id of ['dashboards', 'observatory', 'inbox', 'fabric']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  installApp(m, catalog.byId('switchboard'), { version: '1.1.0', broken: true }); // its fix names setup with or without the network
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const doc = await cli(m, api, 'doctor', '--json');
  const apps = doc.json.checks.filter((c) => /^app\.[^.]+(\.signature)?$/.test(c.id));
  assert.ok(apps.length);
  assert.ok(apps.every((c) => !c.repair), JSON.stringify(apps.filter((c) => c.repair)));
  const out = apps.find((c) => c.id === 'app.switchboard.signature');
  assert.match(out.fix, /^first make the release train usable: .*setup --yes --no-apps --train none/);
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

// PC-91: "no" to every offer is reported as declined, never as a machine with nothing left to set up.
test('PC-91: declining every offer says so, with and without a train', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' });
  const run = (opts) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      let asked = 0;
      S.setup(Object.assign({ online: false, noApps: true, ask: async () => { asked++; return 'n'; } }, ${JSON.stringify(opts)}))
        .then((r) => process.stdout.write(JSON.stringify({ asked, declined: r.declined, ok: r.ok, exit: S.exitCode(r), actions: r.actions, steps: r.humanSteps, text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const opts of [{}, { train: 'org-test' }, { noApps: false }, { noApps: false, train: 'org-test' }]) {
    const r = run(opts);
    assert.equal(r.declined, true, r.text);
    // PC-93: a declined run exits by its checks, with or without a named train (not 0 as a plan).
    assert.equal(r.exit, r.ok ? 0 : 1, r.text);
    // A declined run still names the command that would fix what it left: it was not that command.
    // After a declined train, the step is setup with that train: plain setup would not follow it.
    if (opts.noApps === false || opts.train) assert.ok(r.steps.some((s) => (opts.train ? / setup --train org-test$/ : / setup$/).test(s)), JSON.stringify(r.steps));
    assert.match(r.text, /You declined every offer; nothing was changed/, r.text);
    assert.doesNotMatch(r.text, /in place|Nothing to do|run it with --yes/, r.text);
    if (opts.train) assert.match(r.text, /The release train \(org-test\) was not saved\./, r.text);
    assert.doesNotMatch(r.text, /^ {2}[•–] /m, r.text); // PC-94: a declined run lists no plan lines
  }
  // Forgetting a saved train is a change on any answer, so that run is not reported as declined.
  // A running app behind its pin: its fix ("quit it, then run setup") names the declined train too.
  fs.writeFileSync(path.join(m.apps, 'Fabric Switchboard.app', 'RUNNING'), '');
  const running = run({ train: 'org-test' });
  const named = running.steps.filter((s) => / setup/.test(s));
  assert.ok(named.some((s) => /^quit /.test(s)) && named.every((s) => /setup --train org-test/.test(s)), JSON.stringify(running.steps));
  fs.rmSync(path.join(m.apps, 'Fabric Switchboard.app', 'RUNNING'));
  // The train is saved without the repairs, so the run below still declines offers that default to yes.
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const none = run({ train: null });
  assert.ok(none.asked > 0, none.text);
  assert.equal(none.declined, undefined, none.text);
  assert.deepEqual(none.actions.map((a) => a.kind), ['train'], none.text);
  assert.match(none.text, /forgot release train org-test/, none.text);
});

// PC-94: the edges PC-91 left. A run that forgets a train but answers no to its repairs was not
// `setup`; after a declined train, asking for an app is setup with that train; a declined run lists no plan.
test('PC-94: steps after declined repairs and a declined train, and no plan under a declined headline', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const run = (m, opts) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      S.setup(Object.assign({ online: false, ask: async () => 'n' }, ${JSON.stringify(opts)}))
        .then((r) => process.stdout.write(JSON.stringify({ declined: r.declined, actions: r.actions, plan: r.plan, steps: r.humanSteps, exit: S.exitCode(r), text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  // A saved train and an app behind its pin: forgetting the train saves it on any answer, and the
  // repairs answered no still leave `setup` among the steps (it used to read as "this run was setup").
  const m = onTrain(machine());
  installApp(m, catalog.byId('switchboard'), { version: '1.0.0' });
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const none = run(m, { train: null, noApps: false });
  assert.equal(none.declined, undefined, none.text);
  assert.deepEqual(none.actions.map((a) => a.kind), ['train'], none.text);
  assert.ok(none.plan.some((i) => i.kind !== 'install' && !i.selected), JSON.stringify(none.plan));
  assert.ok(none.steps.some((s) => / setup$/.test(s)), JSON.stringify(none.steps));
  // A declined train on a Mac without Docker: Fabric's note asks for it with that train, and the
  // declined headline stands above the checks with no plan lines under it.
  const n = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  installApp(n, catalog.byId('switchboard'), { version: '1.0.0' });
  const declined = run(n, { train: 'org-test', noApps: false });
  assert.equal(declined.declined, true, declined.text);
  assert.ok(declined.steps.some((s) => /^Fabric: .*\(npx @passioncode-ai\/passioncode@latest setup --train org-test --with fabric\)$/.test(s)), JSON.stringify(declined.steps));
  assert.doesNotMatch(declined.text, /^ {2}[•–] /m, declined.text);
  assert.match(declined.text, /You declined every other offer, and Fabric was not installed; nothing was changed\./, declined.text);
  // Without a train, the note keeps its own words (`--with fabric` is plain setup's flag).
  const plain = run(n, { noApps: false });
  assert.ok(plain.steps.some((s) => /^Fabric: .*\(--with fabric\)$/.test(s)), JSON.stringify(plain.steps));
  // Fabric named with --with and then answered no was not installed, with or without a train.
  for (const [opts, step] of [[{}, '--with fabric'], [{ train: 'org-test' }, 'npx @passioncode-ai/passioncode@latest setup --train org-test --with fabric']]) {
    const asked = run(n, { noApps: false, withIds: ['fabric', 'switchboard'], ...opts });
    assert.ok(asked.steps.every((s) => !/installed because you asked/.test(s)), JSON.stringify(asked.steps));
    assert.ok(asked.steps.includes(`Fabric: needs Docker (OrbStack or Docker Desktop); not installed (${step})`), JSON.stringify(asked.steps));
  }
  // The only repair a replace (the skill set already in place): answered no, `setup` stays a step.
  const r = onTrain(machine());
  installApp(r, catalog.byId('switchboard'), { version: '1.0.0' });
  assert.equal((await cli(r, api, 'setup', '--yes', '--no-apps')).status, 0);
  fs.writeFileSync(path.join(r.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const replace = run(r, { train: null, noApps: false, online: true });
  assert.deepEqual([...new Set(replace.plan.filter((i) => i.kind !== 'install').map((i) => i.kind))], ['replace'], JSON.stringify(replace.plan));
  assert.ok(replace.steps.some((s) => / setup$/.test(s)), JSON.stringify(replace.steps));
  // An install taken and the repairs answered no: the run changed something, and `setup` stays a step.
  const mixed = onTrain(machine());
  installApp(mixed, catalog.byId('switchboard'), { version: '1.0.0' });
  const mixedScript = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ online: true, noOpen: true, withIds: ['dashboards', 'switchboard'], ask: async (q) => { asked.push(q); return /^Install /.test(q) ? 'y' : 'n'; } })
      .then((r) => process.stdout.write(JSON.stringify({ actions: r.actions, plan: r.plan, steps: r.humanSteps, asked })), (e) => { console.error(e); process.exit(1); });`;
  // Asynchronous: the release server answers from this process, which spawnSync would block.
  const mixedRun = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', mixedScript], { env: cliEnv(mixed, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(mixedRun.status, 0, mixedRun.stderr);
  const took = JSON.parse(mixedRun.stdout);
  assert.ok(took.actions.some((a) => a.kind === 'install' && a.outcome === 'done'), mixedRun.stdout);
  assert.ok(took.plan.some((i) => i.kind !== 'install' && !i.selected), mixedRun.stdout);
  assert.ok(took.steps.some((s) => / setup$/.test(s)), mixedRun.stdout);
  // PC-108: an app it installs still gets its MCP server registered, so the update runs though the repairs were declined.
  const registers = took.actions.filter((a) => a.kind === 'install' && a.outcome === 'done').some((a) => { const pr = catalog.byId(a.product); return pr.mcp && !pr.mcp.external; });
  assert.ok(registers, `an installed app here registers an MCP server: ${mixedRun.stdout}`);
  assert.ok(took.actions.some((a) => a.kind === 'update'), mixedRun.stdout);
  // PC-112: so the repairs question names only what a no stops (the reinstall), not the update the install runs.
  const repairQ = took.asked.filter((q) => /^Apply /.test(q));
  assert.equal(repairQ.length, 1, mixedRun.stdout);
  assert.match(repairQ[0], /^Apply 1 repair\(s\): reinstall Fabric Switchboard /, repairQ[0]);
  assert.doesNotMatch(repairQ[0], /skill set/, repairQ[0]);
  // The other direction: a run that took its repairs was that command. Here the person left
  // Switchboard's reinstall out with --without, so its check stays open with the fix `setup`, and
  // the step is not repeated (it does not carry the run's --without either, PC-94).
  const yesRepairs = onTrain(machine());
  installApp(yesRepairs, catalog.byId('switchboard'), { version: '1.0.0' });
  fs.mkdirSync(path.join(yesRepairs.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(yesRepairs.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const yesScript = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ online: false, noOpen: true, withoutIds: ['switchboard'], ask: async (q) => (/^Install /.test(q) ? 'n' : 'y') })
      .then((r) => process.stdout.write(JSON.stringify({ plan: r.plan, actions: r.actions.map((a) => a.kind + ':' + a.outcome), steps: r.humanSteps, open: r.after.checks.filter((c) => c.state === 'fail' || c.state === 'warn') })), (e) => { console.error(e); process.exit(1); });`;
  const yesRun = require('child_process').spawnSync(process.execPath, ['-e', yesScript], { env: cliEnv(yesRepairs, api), encoding: 'utf8' });
  assert.equal(yesRun.status, 0, yesRun.stderr);
  const yes = JSON.parse(yesRun.stdout);
  assert.ok(yes.plan.every((i) => i.kind === 'install' || i.selected), yesRun.stdout);
  assert.ok(yes.actions.includes('update:done'), yesRun.stdout); // PC-112: repairs answered yes run the update, no install needed
  assert.ok(yes.open.some((c) => c.fix === 'npx @passioncode-ai/passioncode@latest setup'), yesRun.stdout);
  assert.ok(!yes.steps.some((s) => / setup$/.test(s)), yesRun.stdout);
  // But a declined run is never that command (PC-91), --without or not: with no repair offered at all
  // (the skill set in place, Switchboard's reinstall left out), declining every install keeps `setup`.
  const noRepairs = onTrain(machine());
  installApp(noRepairs, catalog.byId('switchboard'), { version: '1.0.0' });
  assert.equal((await cli(noRepairs, api, 'setup', '--yes', '--no-apps', '--without', 'switchboard')).status, 0);
  fs.writeFileSync(path.join(noRepairs.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const declinedScript = yesScript.replace("ask: async (q) => (/^Install /.test(q) ? 'n' : 'y')", "ask: async () => 'n'")
    .replace('.then((r) => process.stdout.write(JSON.stringify({ plan', '.then((r) => process.stdout.write(JSON.stringify({ declined: r.declined, plan');
  const declinedRun = require('child_process').spawnSync(process.execPath, ['-e', declinedScript], { env: cliEnv(noRepairs, api), encoding: 'utf8' });
  assert.equal(declinedRun.status, 0, declinedRun.stderr);
  const declinedOut = JSON.parse(declinedRun.stdout);
  assert.equal(declinedOut.declined, true, declinedRun.stdout);
  assert.ok(declinedOut.plan.every((i) => i.kind === 'install'), declinedRun.stdout);
  assert.ok(declinedOut.steps.some((s) => / setup$/.test(s)), declinedRun.stdout);
  // A declined train is judged by its own checks: the unusable saved train's fail row does not count,
  // so the run exits 0 where plain doctor (on the saved train) exits 1.
  const g = onTrain(machine());
  assert.equal((await cli(g, api, 'setup', '--yes', '--no-apps')).status, 0);
  fs.writeFileSync(path.join(g.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const gone = run(g, { train: 'org-test', noApps: false });
  assert.equal(gone.declined, true, gone.text);
  assert.equal(gone.exit, 0, gone.text);
  assert.equal((await cli(g, api, 'doctor', '--json', '--offline')).status, 1);
});

// PC-92: after everything else is set up, a terminal run whose only offer defaults to no (Fabric
// without Docker) and is not taken names it, rather than calling the machine set up.
test('PC-92: an untaken default-no offer is named, not reported as everything in place', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  const first = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(first.status, 0, first.stderr + first.stdout);
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ online: false, ask: async (q) => { asked.push(q); return 'n'; } })
      .then((r) => process.stdout.write(JSON.stringify({ asked, declined: r.declined, notTaken: r.notTaken, actions: r.actions, text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
  const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.deepEqual(out.asked.map((q) => /^Install Fabric /.test(q)), [true], JSON.stringify(out.asked));
  assert.equal(out.declined, undefined, out.text);
  assert.deepEqual(out.actions, [], out.text);
  assert.deepEqual(out.notTaken, ['Fabric'], out.text);
  assert.match(out.text, /Nothing was changed: Fabric was offered and not installed\./, out.text);
  assert.doesNotMatch(out.text, /in place|You declined/, out.text);
});

// PC-92: a run that took other offers and left Fabric is not "nothing was changed".
test('PC-92: a run that takes some offers does not mark the others as not taken', async (t) => {
  const api = await releaseServer(t);
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ online: false, ask: async (q) => (/^Install Fabric /.test(q) ? 'n' : 'y') })
      .then((r) => process.stdout.write(JSON.stringify({ notTaken: r.notTaken, actions: r.actions.length, text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
  const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.ok(out.actions > 0, out.text);
  assert.equal(out.notTaken, undefined, out.text);
  assert.doesNotMatch(out.text, /offered and not installed/, out.text);
});

// PC-101: a run that asked nothing (--yes, or no terminal) and changed nothing names the app it
// skipped by default, whose note is among the person's steps, rather than calling the machine set up.
test('PC-101: a re-run that asks nothing names the app it skipped, with and without --yes', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  const first = await cli(m, api, 'setup', '--yes', '--json');
  assert.equal(first.status, 0, first.stderr + first.stdout);
  // A run that installed the other apps changed something: Fabric's note is a step, not "skipped".
  assert.ok(JSON.parse(first.stdout).actions.length > 0, first.stdout);
  assert.equal(JSON.parse(first.stdout).skipped, undefined, first.stdout);
  for (const args of [['--yes'], []]) {
    const r = await cli(m, api, 'setup', ...args, '--json');
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.actions, [], r.stdout);
    assert.deepEqual(out.skipped, ['Fabric'], r.stdout);
    assert.equal(out.notTaken, undefined, r.stdout);
    assert.equal(out.declined, undefined, r.stdout);
    // Not a plan: nothing would change, so the run exits by its checks (all pass here; a failing check is PC-104).
    assert.equal(out.planOnly, false, r.stdout);
    assert.equal(r.status, out.ok ? 0 : 1, r.stdout);
    assert.ok(out.humanSteps.some((x) => /^Fabric: needs Docker/.test(x)), JSON.stringify(out.humanSteps));
    const text = require('../lib/setup').render(out);
    assert.match(text, /Nothing was changed: Fabric was not installed \(see your steps below\)\./, text);
    assert.doesNotMatch(text, /in place|You declined|offered and not installed/, text);
  }
  // A run whose only change is a train changed something too.
  const train = JSON.parse((await cli(m, api, 'setup', '--yes', '--train', 'org-test', '--json')).stdout);
  assert.ok(train.actions.some((a) => a.kind === 'train'), JSON.stringify(train.actions));
  assert.equal(train.skipped, undefined, JSON.stringify(train.actions));
});

// PC-101: Enter on Fabric's default-no offer is not declining it, so a run that answered no to the
// rest names Fabric as not installed instead of counting it among the declined offers.
test('PC-101: a declined run names the default-no offer as not installed', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'docker') }));
  const run = (opts) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      S.setup(Object.assign({ online: false, ask: async () => 'n' }, ${JSON.stringify(opts)}))
        .then((r) => process.stdout.write(JSON.stringify({ declined: r.declined, notTaken: r.notTaken, skipped: r.skipped, actions: r.actions, text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const opts of [{}, { train: 'org-test' }]) {
    const out = run(opts);
    assert.equal(out.declined, true, out.text);
    assert.deepEqual(out.actions, [], out.text);
    assert.deepEqual(out.notTaken, ['Fabric'], out.text);
    assert.equal(out.skipped, undefined, out.text);
    assert.match(out.text, /You declined every other offer, and Fabric was not installed; nothing was changed\./, out.text);
    assert.doesNotMatch(out.text, /You declined every offer;|in place/, out.text);
  }
  // With no default-no offer (no apps offered), a declined run carries no notTaken.
  const plain = run({ noApps: true });
  assert.equal(plain.declined, true, plain.text);
  assert.equal(plain.notTaken, undefined, plain.text);
  assert.match(plain.text, /You declined every offer; nothing was changed/, plain.text);
});

// PC-108: an offer answered no that carries no note (its prerequisites are there) is not a step of its own:
// the person said no to it, and the run's own `setup` step offers it again.
test('PC-108: an install answered no without a note adds no step of its own', async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ online: false, ask: async () => 'n' })
      .then((r) => process.stdout.write(JSON.stringify({ declined: r.declined, plan: r.plan, steps: r.humanSteps })), (e) => { console.error(e); process.exit(1); });`;
  const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.declined, true);
  const quiet = out.plan.filter((i) => i.kind === 'install' && !i.note).map((i) => catalog.byId(i.product).name);
  assert.ok(quiet.length >= 1, JSON.stringify(out.plan));
  for (const name of quiet) assert.ok(!out.steps.some((s) => s.startsWith(`${name}: `)), `${name}: ${JSON.stringify(out.steps)}`);
  assert.ok(out.steps.includes('npx @passioncode-ai/passioncode@latest setup'), JSON.stringify(out.steps));
});

// PC-108: only an app that bundles an MCP server forces the update after declined repairs; one whose
// server is external (Project Observatory) is installed without refreshing the skill set.
test('PC-108: an app with an external MCP server forces no update after declined repairs; a bundled one does', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const m = machine();
  assert.ok(catalog.byId('observatory').mcp.external);
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ online: true, noOpen: true, withIds: ['observatory'], ask: async (q) => (/^Install /.test(q) ? 'y' : 'n') })
      .then((r) => process.stdout.write(JSON.stringify({ actions: r.actions, plan: r.plan })), (e) => { console.error(e); process.exit(1); });`;
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.ok(out.plan.some((i) => i.kind === 'update' && !i.selected), run.stdout); // the repairs were answered no
  assert.deepEqual(out.actions.map((a) => `${a.kind}:${a.product}:${a.outcome}`), ['install:observatory:done'], run.stdout);
  // A bundled one forces it (PC-112): the repairs question leaves that update out, the update runs and makes the
  // skill-set and MCP-registration repairs, so their checks pass and no `setup` step is left.
  const b = machine();
  const bundledScript = script.replace("['observatory']", "['switchboard']").replace('ask: async (q) =>', 'ask: async (q) => (asked.push(q), 0) ||')
    .replace('S.setup(', 'const asked = []; S.setup(').replace('plan: r.plan', 'plan: r.plan, steps: r.humanSteps, asked');
  const bundled = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', bundledScript], { env: cliEnv(b, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(bundled.status, 0, bundled.stderr);
  const took = JSON.parse(bundled.stdout);
  assert.ok(took.plan.some((i) => i.kind === 'update' && i.selected), bundled.stdout);
  assert.ok(took.asked.length >= 1 && !took.asked.some((q) => /^Apply /.test(q)), bundled.stdout); // nothing else to repair here
  assert.deepEqual(took.actions.map((a) => `${a.kind}:${a.outcome}`), ['install:done', 'update:done'], bundled.stdout);
  assert.ok(!took.steps.some((st) => / setup$/.test(st)), bundled.stdout);
  // A reinstall (replace) of a bundled one forces no update: only an install registers a new server.
  const r = onTrain(machine());
  installApp(r, catalog.byId('switchboard'), { version: '1.0.0' });
  assert.equal((await cli(r, api, 'setup', '--yes', '--no-apps')).status, 0);
  fs.writeFileSync(path.join(r.home, '.passioncode/state.json'), JSON.stringify({ train: 'org-test' }));
  const rs = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    S.setup({ online: true, noOpen: true, withIds: ['switchboard'], ask: async () => 'y' })
      .then((x) => process.stdout.write(JSON.stringify({ actions: x.actions, plan: x.plan })), (e) => { console.error(e); process.exit(1); });`;
  const replaced = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', rs], { env: cliEnv(r, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(replaced.status, 0, replaced.stderr);
  const rr = JSON.parse(replaced.stdout);
  assert.deepEqual(rr.plan.map((i) => i.kind), ['replace'], replaced.stdout);
  assert.deepEqual(rr.actions.map((a) => `${a.kind}:${a.outcome}`), ['replace:done'], replaced.stdout);
});

// PC-112: the update a bundled install runs is that install's: when the install fails, the update does not run,
// and the person, who was not asked about it, keeps `setup` among the steps.
// PC-114: the two widenings PC-112 left unpinned. An install whose MCP server is external forces nothing, so the
// repairs question still names the skill set and a yes runs it; a failed forced install deselects only the update,
// and a repair the person keeps still runs.
test('PC-114: an external-MCP install asks about the update; a failed forced install keeps the other repairs', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const run = (m, opts) => new Promise((resolve) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      const asked = [];
      S.setup(Object.assign({ online: true, noOpen: true, ask: async (q) => { asked.push(q); return 'y'; } }, ${JSON.stringify(opts)}))
        .then((r) => process.stdout.write(JSON.stringify({ asked, plan: r.plan, actions: r.actions.map((a) => a.kind + ':' + (a.product || '') + ':' + a.outcome) })), (e) => { console.error(e); process.exit(1); });`;
    const child = spawn(process.execPath, ['-e', script], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => { assert.equal(status, 0, stderr); resolve(JSON.parse(stdout)); });
  });
  // Project Observatory, taken, with the repairs answered yes: asked about, and the update runs.
  const external = await run(machine(), { withIds: ['observatory'] });
  const apply = external.asked.filter((q) => /^Apply /.test(q));
  assert.equal(apply.length, 1, JSON.stringify(external.asked));
  assert.match(apply[0], /skill set/, apply[0]);
  assert.ok(external.actions.includes('update::done'), JSON.stringify(external.actions));
  // Switchboard's pinned release is not served, so its install fails; Fabric Dashboards behind its pin is a
  // reinstall the person keeps: it runs, and only the update is left not taken.
  const m = onTrain(machine(), { switchboard: '9.9.9', dashboards: '1.1.0' });
  installApp(m, catalog.byId('dashboards'), { version: '1.0.0' });
  const failed = await run(m, { train: 'org-test', withIds: ['switchboard', 'dashboards'] });
  assert.ok(failed.actions.includes('install:switchboard:failed'), JSON.stringify(failed.actions));
  assert.ok(failed.actions.includes('replace:dashboards:done'), JSON.stringify(failed.actions));
  assert.ok(!failed.actions.some((a) => a.startsWith('update:')), JSON.stringify(failed.actions));
  assert.ok(failed.plan.some((i) => i.kind === 'replace' && i.product === 'dashboards' && i.selected), JSON.stringify(failed.plan));
  assert.ok(failed.plan.some((i) => i.kind === 'update' && !i.selected), JSON.stringify(failed.plan));
});

test('PC-112: a bundled install that fails runs no update and was not asked about it', async (t) => {
  const api = await releaseServer(t); // serves no 9.9.9, so the pinned install fails
  const m = onTrain(machine(), { switchboard: '9.9.9' });
  const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
    const asked = [];
    S.setup({ online: true, noOpen: true, train: 'org-test', withIds: ['switchboard'], ask: async (q) => { asked.push(q); return /^Install /.test(q) ? 'y' : 'n'; } })
      .then((r) => process.stdout.write(JSON.stringify({ asked, actions: r.actions, plan: r.plan, steps: r.humanSteps })), (e) => { console.error(e); process.exit(1); });`;
  const run = await new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', script], { env: cliEnv(m, api), stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', (c) => { stdout += c; });
    child.stderr.on('data', (c) => { stderr += c; });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
  assert.equal(run.status, 0, run.stderr);
  const out = JSON.parse(run.stdout);
  assert.ok(!out.asked.some((q) => /^Apply /.test(q)), run.stdout);
  assert.deepEqual(out.actions.filter((a) => a.kind !== 'train').map((a) => `${a.kind}:${a.outcome}`), ['install:failed'], run.stdout);
  assert.ok(out.steps.includes('npx @passioncode-ai/passioncode@latest setup'), run.stdout);
  assert.ok(out.plan.some((i) => i.kind === 'update' && !i.selected), run.stdout); // the plan says what ran
});

// PC-117: Claude Code's rules for PassionCode's own tools are added only on the person's yes to that set.
test('PC-129: with CLAUDE_CONFIG_DIR set setup offers and writes the tool rules in that folder, ~/.claude untouched', async (t) => {
  const api = await releaseServer(t);
  const P = require('../lib/permissions');
  const m = machine({ toolRules: false });
  m.configDir = path.join(m.home, 'own-claude');
  fs.mkdirSync(m.configDir); // a folder Claude Code already uses; the real CLI does not make it on --version
  const homeSettings = path.join(m.home, '.claude', 'settings.json');
  const snapshot = () => fs.readdirSync(path.join(m.home, '.claude')).sort().map((n) => [n, fs.statSync(path.join(m.home, '.claude', n)).isFile() ? fs.readFileSync(path.join(m.home, '.claude', n), 'utf8') : 'dir']);
  const before = snapshot();
  const run = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.equal(run.status, 0, run.stderr + run.stdout);
  const doc = JSON.parse(fs.readFileSync(path.join(m.configDir, 'settings.json'), 'utf8'));
  assert.ok(P.RULES.every((rule) => doc.permissions.allow.includes(rule)), 'the rules are in that folder');
  assert.ok(fs.existsSync(homeSettings) && !P.RULES.some((rule) => (JSON.parse(fs.readFileSync(homeSettings, 'utf8')).permissions?.allow || []).includes(rule)), '~/.claude/settings.json gets none of them');
  assert.deepEqual(snapshot(), before, 'nothing in ~/.claude changed');
  // The next run reads the same file: nothing is offered again.
  const again = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--json');
  assert.equal(again.json.permissions, undefined, again.stdout);
});

test('PC-117: setup offers the tool rules, adds them only on their own yes, and keeps the settings it finds', async (t) => {
  const api = await releaseServer(t);
  const P = require('../lib/permissions');
  const settingsOf = (m) => path.join(m.home, '.claude', 'settings.json');
  const read = (m) => (fs.existsSync(settingsOf(m)) ? JSON.parse(fs.readFileSync(settingsOf(m), 'utf8')) : null);
  // --yes alone does not decide it: nothing is written, the run says how to allow them.
  const plain = machine({ toolRules: false });
  const yes = await cli(plain, api, 'setup', '--yes', '--no-apps', '--offline');
  assert.equal(yes.status, 0, yes.stderr + yes.stdout);
  assert.ok(!(((read(plain) || {}).permissions || {}).allow || []).some((r) => P.RULES.includes(r)), 'no tool rule was written');
  assert.match(yes.stdout, /\nClaude Code still asks before it uses PassionCode's own tools\. To allow them: npx @passioncode-ai\/passioncode@latest setup --allow-tools\n/, yes.stdout);
  // PC-125: a default mode that does not ask makes "still asks" false; the hint names the mode instead.
  const quiet = machine({ toolRules: false, commandRules: false });
  const quietDoc = read(quiet) || {};
  quietDoc.permissions = { ...(quietDoc.permissions || {}), defaultMode: 'bypassPermissions' };
  fs.writeFileSync(settingsOf(quiet), JSON.stringify(quietDoc));
  const bypass = await cli(quiet, api, 'setup', '--yes', '--no-apps', '--offline');
  assert.doesNotMatch(bypass.stdout, /still asks/, bypass.stdout);
  assert.match(bypass.stdout, /\nClaude Code's allow rules do not include PassionCode's own tools; its default mode in your user settings, bypassPermissions, decides what it does without them\. To allow them: npx @passioncode-ai\/passioncode@latest setup --allow-tools\n/, bypass.stdout);
  assert.match(bypass.stdout, /\nClaude Code's allow rules do not include Bash\(gh pr merge:\*\); its default mode in your user settings, bypassPermissions, decides what it does without them\. To allow them: npx @passioncode-ai\/passioncode@latest setup --allow-commands \(a rule ending in \* allows any arguments after its words\)\n/, bypass.stdout);
  // bypassPermissions switched off in the same file asks again: "still asks" is true there.
  const off = machine({ toolRules: false, commandRules: false });
  const offDoc = read(off) || {};
  offDoc.permissions = { ...(offDoc.permissions || {}), defaultMode: 'bypassPermissions', disableBypassPermissionsMode: 'disable' };
  fs.writeFileSync(settingsOf(off), JSON.stringify(offDoc));
  assert.match((await cli(off, api, 'setup', '--yes', '--no-apps', '--offline')).stdout, /\nClaude Code still asks before it uses PassionCode's own tools\./);
  // Run again with nothing else to do: not "everything ... is in place" while the rules are offered.
  const rerun = await cli(plain, api, 'setup', '--yes', '--no-apps', '--offline');
  assert.match(rerun.stdout, /\nEverything else this command can set up is in place; nothing was changed\./, rerun.stdout);
  assert.doesNotMatch(rerun.stdout, /\nEverything this command can set up is in place/, rerun.stdout);
  const json = await cli(plain, api, 'setup', '--yes', '--no-apps', '--offline', '--json');
  assert.deepEqual(json.json.permissions, { rules: [...P.RULES], error: null, taken: false });
  // --allow-tools is that yes: the rules are merged in, every other setting kept.
  const kept = machine({ toolRules: false });
  fs.mkdirSync(path.dirname(settingsOf(kept)), { recursive: true });
  fs.writeFileSync(settingsOf(kept), JSON.stringify({ model: 'opus', permissions: { allow: ['Bash(npm test)'], deny: ['Bash(rm -rf:*)'] } }));
  const allowed = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.equal(allowed.status, 0, allowed.stderr + allowed.stdout);
  const doc = read(kept); // the update adds its own marketplace key beside them
  assert.equal(doc.model, 'opus');
  assert.deepEqual(doc.permissions, { allow: ['Bash(npm test)', ...P.RULES], deny: ['Bash(rm -rf:*)'] });
  // PC-125: the ledger names the tool rules setup added (not the person's own rule).
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(kept.home, '.passioncode', 'permissions.json'), 'utf8')).rules.map((r) => [r.rule, r.set, r.by]), P.RULES.map((rule) => [rule, 'tools', 'PassionCode setup']));
  assert.ok(allowed.json.actions.some((a) => a.kind === 'permissions' && a.outcome === 'done'), allowed.stdout);
  // PC-125: a rule already there is not recorded as setup's; a ledger setup cannot update is a note, the step stays done.
  const partial = machine({ toolRules: false });
  fs.mkdirSync(path.dirname(settingsOf(partial)), { recursive: true });
  fs.writeFileSync(settingsOf(partial), JSON.stringify({ permissions: { allow: [P.RULES[0]] } }));
  fs.mkdirSync(path.join(partial.home, '.passioncode'), { recursive: true });
  await cli(partial, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(partial.home, '.passioncode', 'permissions.json'), 'utf8')).rules.map((r) => r.rule), P.RULES.slice(1));
  const corrupt = machine({ toolRules: false });
  fs.mkdirSync(path.join(corrupt.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(corrupt.home, '.passioncode', 'permissions.json'), '{bad');
  const noted = await cli(corrupt, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.equal(noted.status, 0, noted.stdout);
  const step = noted.json.actions.find((a) => a.kind === 'permissions');
  assert.equal(step.outcome, 'done');
  assert.match(step.detail, /; the permissions ledger was not updated \(.*permissions\.json is not valid JSON/);
  assert.ok(P.RULES.every((rule) => read(corrupt).permissions.allow.includes(rule)), 'the rules stand');
  const allowedText = await cli(machine({ toolRules: false }), api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools');
  assert.doesNotMatch(allowedText.stdout, /still asks/, allowedText.stdout); // they were just added
  // PC-133: a rule the person took out with `permissions remove` stays out; setup names it and how to add it back.
  const removedOne = P.RULES[1];
  const rm = require('child_process').spawnSync(process.execPath, [BIN, 'permissions', 'remove', removedOne, '--by', 'Example Person'], { env: cliEnv(kept, api), encoding: 'utf8' });
  assert.equal(rm.status, 0, rm.stderr);
  const stays = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.ok(!read(kept).permissions.allow.includes(removedOne), 'not added back');
  assert.equal(stays.json.permissions, undefined, 'nothing else lacking, nothing offered');
  assert.deepEqual(stays.json.keptOut.map((k) => [k.rule, k.removedBy]), [[removedOne, 'Example Person']]);
  assert.ok(Date.parse(stays.json.keptOut[0].removedAt));
  const staysText = await cli(kept, api, 'setup', '--no-apps', '--offline', '--dry-run', '--allow-tools');
  const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.ok(staysText.stdout.includes(`\nLeft out, because you removed it with permissions remove: ${removedOne}. To add one back: npx @passioncode-ai/passioncode@latest permissions allow <rule>\n`), staysText.stdout);
  assert.doesNotMatch(staysText.stdout, new RegExp(`allow [^\\n]*${esc(removedOne)}`), 'not in the plan');
  const back = require('child_process').spawnSync(process.execPath, [BIN, 'permissions', 'allow', removedOne], { env: cliEnv(kept, api), encoding: 'utf8' });
  assert.equal(back.status, 0, back.stderr);
  assert.ok(read(kept).permissions.allow.includes(removedOne), 'named again, it is added');
  const after = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.equal(after.json.keptOut, undefined, 'allowed again, nothing is left out');
  const perm = (...args) => require('child_process').spawnSync(process.execPath, [BIN, 'permissions', ...args], { env: cliEnv(kept, api), encoding: 'utf8' });
  const handEdit = (fn) => { const d = read(kept); fn(d.permissions); fs.writeFileSync(settingsOf(kept), JSON.stringify(d)); };
  // Taken out by hand, not through the ledger, a rule allowed again is offered as before.
  handEdit((p) => { p.allow = p.allow.filter((r) => r !== removedOne); });
  const byHand = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.ok(read(kept).permissions.allow.includes(removedOne), 'a hand edit is not a removal the ledger keeps');
  assert.equal(byHand.json.keptOut, undefined);
  // Another rule still lacking runs the step: it adds that one, never the removed one beside it.
  assert.equal(perm('remove', removedOne).status, 0);
  handEdit((p) => { p.allow = p.allow.filter((r) => r !== P.RULES[0]); });
  const mixed = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.ok(read(kept).permissions.allow.includes(P.RULES[0]), 'the lacking rule is added');
  assert.ok(!read(kept).permissions.allow.includes(removedOne), 'the removed one stays out while the step runs');
  assert.deepEqual(mixed.json.keptOut.map((k) => k.rule), [removedOne]);
  // The same for a rule for commands.
  const cmdRule = 'Bash(gh pr merge:*)';
  await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-commands', '--json');
  assert.ok(read(kept).permissions.allow.includes(cmdRule), 'the command rules were added');
  assert.equal(perm('remove', cmdRule).status, 0);
  const cmds = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-commands', '--json');
  assert.ok(!read(kept).permissions.allow.includes(cmdRule), 'a removed command rule stays out');
  assert.ok(!(cmds.json.commands && cmds.json.commands.rules.some((r) => r.rule === cmdRule)), 'and is not offered');
  assert.ok(cmds.json.keptOut.some((k) => k.rule === cmdRule), JSON.stringify(cmds.json.keptOut));
  // Allowed again by hand, it is in place: nothing is left out, and nothing is said about it.
  handEdit((p) => { p.allow.push(cmdRule); });
  const handBack = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-commands', '--json');
  assert.ok(!(handBack.json.keptOut || []).some((k) => k.rule === cmdRule), JSON.stringify(handBack.json.keptOut));
  handEdit((p) => { p.allow = p.allow.filter((r) => r !== cmdRule); });
  assert.equal(perm('allow', cmdRule).status, 0);
  assert.equal(perm('allow', removedOne).status, 0);
  // Run again: nothing is missing, so nothing is offered or written.
  const again = await cli(kept, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools', '--json');
  assert.equal(again.json.permissions, undefined);
  assert.ok(!again.json.actions.some((a) => a.kind === 'permissions'), again.stdout);
  // A plan lists them as a line of its own, not taken.
  const plan = await cli(machine({ toolRules: false }), api, 'setup', '--offline', '--dry-run');
  assert.doesNotMatch(plan.stdout, /still asks/, plan.stdout); // a plan lists them; the hint is for a run
  assert.match(plan.stdout, /\n  – let Claude Code use PassionCode's own tools without asking: allow mcp__fabric, mcp__fabric-dashboards, mcp__switchboard, mcp__plugin_switchboard_switchboard, mcp__observatory \(asked in a terminal, or --allow-tools\)\n/, plan.stdout);
  // A dry run with --allow-tools shows them taken, as the run would take them.
  const dryAllowed = await cli(machine({ toolRules: false }), api, 'setup', '--offline', '--dry-run', '--allow-tools');
  assert.match(dryAllowed.stdout, /\n  • let Claude Code use PassionCode's own tools without asking: /, dryAllowed.stdout);
  // While they are offered, a train-only plan lists them after the train and promises the question they get.
  const { render } = require('../lib/setup');
  const empty = { summary: {}, checks: [] };
  const trainPlan = render({ mode: 'existing', platform: 'darwin', before: empty, after: empty, plan: [], actions: [], humanSteps: [], planOnly: true, trainNotSaved: 'org-test', permissions: { rules: [...P.RULES], error: null, taken: false } });
  assert.match(trainPlan, /\n  • save release train org-test\n  – let Claude Code use PassionCode's own tools without asking: [^\n]*\n/, trainPlan);
  assert.match(trainPlan, /\nRun it with --yes to apply, or in a terminal to answer its questions\.\n/, trainPlan);
  // Taken already (--allow-tools), they ask nothing: a train-only plan keeps the quiet footer.
  const takenPlan = render({ mode: 'existing', platform: 'darwin', before: empty, after: empty, plan: [], actions: [], humanSteps: [], planOnly: true, trainNotSaved: 'org-test', permissions: { rules: [...P.RULES], error: null, taken: true } });
  assert.match(takenPlan, /\n  • let Claude Code use PassionCode's own tools without asking: /, takenPlan);
  assert.match(takenPlan, /\nRun it with --yes, or in a terminal, to apply\.\n/, takenPlan);
  // A dry run whose only changes are questions --yes does not answer names how they are applied; any change --yes
  // does take, or rules taken already, keeps the dry run's own footer.
  const offer = { kind: 'install', product: 'fabric', selected: false, detail: 'install Fabric (early preview)', note: 'needs Docker' };
  const dryOf = (over, taken) => render({ mode: 'existing', platform: 'darwin', before: empty, after: empty, plan: [], actions: [], humanSteps: [], planOnly: true, dryRun: true, ...over, permissions: { rules: [...P.RULES], error: null, taken } });
  const asking = 'Run it without --dry-run, in a terminal or with --allow-tools, to apply.';
  const dryYes = 'Run it without --dry-run (with --yes, or in a terminal) to apply.';
  for (const [over, taken, footer] of [[{}, false, asking], [{ plan: [offer] }, false, asking], [{}, true, dryYes],
    [{ trainNotSaved: 'org-test' }, false, dryYes], [{ plan: [{ ...offer, selected: true }] }, false, dryYes]]) {
    const out = dryOf(over, taken).split('\n');
    assert.ok(out.includes(footer) && !out.includes(footer === dryYes ? asking : dryYes), out.join('\n'));
  }
  // Settings that cannot be read are named and left as they are.
  const broken = machine({ toolRules: false });
  fs.mkdirSync(path.dirname(settingsOf(broken)), { recursive: true });
  fs.writeFileSync(settingsOf(broken), '{ not json');
  // --allow-tools asked for the rules: settings it cannot read make that a failed step (exit 1), not a quiet success.
  const named = await cli(broken, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-tools');
  assert.equal(named.status, 1, named.stdout + named.stderr);
  assert.match(named.stdout, /FAILED allow PassionCode's own tools in .*settings\.json\n.*is not valid JSON/, named.stdout);
  assert.doesNotMatch(named.stdout, /fails until/, named.stdout); // the run failed; the warning is a plan's
  assert.doesNotMatch(named.stdout, /still asks/, named.stdout); // --allow-tools cannot help while the file is unreadable
  const failsPlan = await cli(broken, api, 'setup', '--no-apps', '--offline', '--dry-run', '--allow-tools');
  assert.match(failsPlan.stdout, /is not valid JSON[^\n]*\nA run with --allow-tools fails until that is fixed\.\n/, failsPlan.stdout);
  // PC-121: the headline says the asked step cannot run, never "Nothing to do." above the failure.
  assert.match(failsPlan.stdout, /\nNothing was changed: the step you asked for cannot run until Claude Code's settings are fixed\./, failsPlan.stdout);
  assert.doesNotMatch(failsPlan.stdout, /Nothing to do\./, failsPlan.stdout);
  const brokenPlan = await cli(broken, api, 'setup', '--no-apps', '--offline', '--dry-run');
  assert.doesNotMatch(brokenPlan.stdout, /fails until|cannot run until/, brokenPlan.stdout); // nothing asked, nothing fails
  assert.doesNotMatch(brokenPlan.stdout, /let Claude Code use|still asks/, brokenPlan.stdout);
  assert.match(brokenPlan.stdout, /\nClaude Code's settings were not changed: /, brokenPlan.stdout);
  const brokenRun = await cli(broken, api, 'setup', '--yes', '--no-apps', '--offline');
  assert.match(brokenRun.stdout, /\nEverything else this command can set up is in place; nothing was changed\./, brokenRun.stdout);
  // A set-up machine that lacks only the rules: its plan is the rules, not "Nothing to do".
  const lacking = machine({ toolRules: false });
  assert.equal((await cli(lacking, api, 'setup', '--yes', '--no-apps', '--offline')).status, 0);
  for (const extra of [[], ['--allow-tools']]) {
    const only = await cli(lacking, api, 'setup', '--no-apps', '--offline', '--dry-run', ...extra);
    assert.match(only.stdout, /\nPlan \(nothing was changed\):\n/, only.stdout);
    assert.doesNotMatch(only.stdout, /Nothing to do/, only.stdout);
    // --yes alone never takes the rules, so a plan of nothing else is not applied with it.
    assert.match(only.stdout, extra.length ? /\nRun it without --dry-run \(with --yes, or in a terminal\) to apply\.\n/
      : /\nRun it without --dry-run, in a terminal or with --allow-tools, to apply\.\n/, only.stdout);
    if (!extra.length) assert.doesNotMatch(only.stdout, /with --yes/, only.stdout);
  }
  assert.match(named.stdout, /\nClaude Code's settings were not changed: .*settings\.json is not valid JSON/, named.stdout);
  assert.equal(fs.readFileSync(settingsOf(broken), 'utf8'), '{ not json');
  // Where Claude Code is not (no claude, no ~/.claude), nothing about its rules is offered, said or written.
  const noClaude = machine({ toolRules: false });
  fs.rmSync(path.join(noClaude.home, '.claude'), { recursive: true, force: true });
  const bareRun = (...args) => {
    const r = require('child_process').spawnSync(process.execPath, [BIN, ...args], { env: { ...cliEnv(noClaude, api), PASSIONCODE_CLAUDE: path.join(noClaude.home, 'no-claude') }, encoding: 'utf8' });
    return { stdout: r.stdout, json: (() => { try { return JSON.parse(r.stdout); } catch (_) { return null; } })() };
  };
  const bare = bareRun('setup', '--yes', '--no-apps', '--offline', '--json');
  assert.equal(bare.json.permissions, undefined, bare.stdout);
  assert.ok(!bare.json.actions.some((a) => a.kind === 'permissions'), bare.stdout);
  assert.ok(!fs.existsSync(settingsOf(noClaude)), 'no settings file is made');
  assert.doesNotMatch(bareRun('setup', '--no-apps', '--offline', '--dry-run').stdout, /PassionCode's own tools|allow-tools/);
  // doctor --fix repairs; it never decides the tool rules.
  const fix = await cli(machine({ toolRules: false }), api, 'doctor', '--fix', '--offline', '--json');
  assert.ok(!fix.json.actions.some((a) => a.kind === 'permissions'), fix.stdout);
  assert.equal(fix.json.permissions, undefined);
});

test('PC-117: in a terminal the tool rules are one question of their own, default no', async (t) => {
  const api = await releaseServer(t);
  const run = (m, answer, extra = {}) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      const asked = [];
      S.setup({ online: false, noApps: true, ...${JSON.stringify(extra)}, ask: async (q) => { asked.push(q); return ${JSON.stringify(answer)}(q); } })
        .then((r) => process.stdout.write(JSON.stringify({ asked, declined: r.declined, permissions: r.permissions, actions: r.actions.map((a) => a.kind + ':' + a.outcome), text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`.replace(`${JSON.stringify(answer)}(q)`, `(${answer})(q)`);
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const question = "Let Claude Code use PassionCode's own tools without asking (allow mcp__fabric, mcp__fabric-dashboards, mcp__switchboard, mcp__plugin_switchboard_switchboard, mcp__observatory)? [y/N] ";
  // Enter keeps the default: no; the repairs still run.
  const enter = machine({ toolRules: false });
  const quiet = run(enter, "() => ''");
  assert.ok(quiet.asked.includes(question), JSON.stringify(quiet));
  assert.equal(quiet.permissions.taken, false);
  const after = path.join(enter.home, '.claude', 'settings.json');
  assert.ok(!((JSON.parse(fs.readFileSync(after, 'utf8')).permissions || {}).allow || []).some((r) => require('../lib/permissions').RULES.includes(r)), 'no tool rule was written');
  // Yes to the rules alone, no to the repairs: the rules are added, and the run is not a declined one.
  const only = machine({ toolRules: false });
  const ruled = run(only, '(q) => (/^Let Claude Code/.test(q) ? "y" : "n")');
  assert.equal(ruled.declined, undefined, ruled.text);
  assert.deepEqual(ruled.actions, ['permissions:done'], ruled.text);
  assert.match(ruled.text, /allowed mcp__fabric, mcp__fabric-dashboards, mcp__switchboard, mcp__plugin_switchboard_switchboard, mcp__observatory in .*settings\.json \(an ask or deny rule for them still wins\)/, ruled.text);
  // --allow-tools in a terminal is that yes already: the question is not asked again, and no means no elsewhere.
  const given = machine({ toolRules: false });
  const pre = run(given, '() => "n"', { allowTools: true });
  assert.ok(!pre.asked.some((q) => /^Let Claude Code/.test(q)), JSON.stringify(pre.asked));
  assert.ok(pre.actions.includes('permissions:done'), JSON.stringify(pre.actions));
  // Rules added by someone else between the plan and the write: the step says they were there already.
  const raced = machine({ toolRules: false });
  const racer = `(q) => { if (!/^Let Claude Code/.test(q)) return 'n';
    require('fs').writeFileSync(require('path').join(process.env.HOME, '.claude', 'settings.json'),
      JSON.stringify({ permissions: { allow: [...require(${JSON.stringify(path.join(__dirname, '../lib/permissions'))}).RULES] } }));
    return 'y'; }`;
  const already = run(raced, racer);
  assert.deepEqual(already.actions, ['permissions:done'], already.text);
  assert.match(already.text, /done +nothing to add in .*settings\.json: each rule is already allowed, asked about or denied there\n/, already.text);
  // Settings that become readable before the write (the update writes the file too) are no longer named as unread.
  const mended = machine({ toolRules: false });
  const mendedFile = path.join(mended.home, '.claude', 'settings.json');
  fs.writeFileSync(mendedFile, '{ not json');
  const fixer = `(q) => { require('fs').writeFileSync(require('path').join(process.env.HOME, '.claude', 'settings.json'), '{}'); return 'y'; }`;
  const fixed = run(mended, fixer, { allowTools: true });
  assert.ok(fixed.actions.includes('permissions:done'), fixed.text);
  assert.doesNotMatch(fixed.text, /were not changed/, fixed.text);
  assert.deepEqual(JSON.parse(fs.readFileSync(mendedFile, 'utf8')).permissions.allow, [...require('../lib/permissions').RULES]);
  // A declined named train lists no plan, yet still says how to add the rules.
  const declined = run(onTrain(machine({ toolRules: false })), '() => "n"', { train: 'org-test' });
  assert.equal(declined.declined, true, declined.text);
  assert.match(declined.text, /\nYou declined every offer/, declined.text);
  assert.doesNotMatch(declined.text, /Plan \(nothing was changed\)|let Claude Code use/, declined.text);
  assert.match(declined.text, /setup --allow-tools/, declined.text);
});

// PC-119: rules for shell commands, the launcher's own and those an agent declares on the machine, are a set of
// their own: shown in the plan with what each allows, added only on their own yes.
test('PC-119: setup offers the command rules apart, adds them only on their own yes, and names what it does not offer', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const P = require('../lib/permissions');
  const settingsOf = (m) => path.join(m.home, '.claude', 'settings.json');
  const allowOf = (m) => ((JSON.parse(fs.readFileSync(settingsOf(m), 'utf8')).permissions || {}).allow || []);
  const declare = (m, doc) => {
    // The agent's own command, installed in the home folder, as a wildcard over it needs.
    fs.writeFileSync(path.join(m.bin, 'own-cli'), '#!/bin/sh\n', { mode: 0o755 });
    fs.mkdirSync(path.join(m.home, '.passioncode', 'rules.d'), { recursive: true });
    fs.writeFileSync(path.join(m.home, '.passioncode', 'rules.d', 'own-agent.json'), JSON.stringify(doc));
  };
  // --yes alone takes nothing; the result names the set and the text says how to add it.
  const m = machine({ commandRules: false });
  declare(m, { by: 'Own Agent', rules: [{ rule: 'Bash(own-cli sync:*)', why: 'let Own Agent sync its data' }, { rule: 'Bash(python3 *)', why: 'anything' },
    { rule: 'Bash(gh pr merge:*)', why: 'merge, declared again' }, { rule: 'mcp__fabric', why: 'every Fabric tool' }] });
  // a rule the launcher carries is listed once, as the launcher says it, however it is declared; a declared MCP rule is refused
  const json = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--json');
  assert.equal(json.status, 0, json.stdout);
  assert.deepEqual(json.json.commands.rules, [{ ...P.COMMANDS[0] }, { rule: 'Bash(own-cli sync:*)', why: 'let Own Agent sync its data', by: 'Own Agent' }]);
  assert.equal(json.json.commands.taken, false);
  assert.equal(json.json.commands.refused.length, 2, json.stdout);
  assert.match(json.json.commands.refused.join('\n'), /mcp__fabric: a declared rule names a command; an MCP server's tools are not offered here/);
  assert.ok(!json.json.actions.some((a) => a.kind === 'commands'), json.stdout);
  assert.ok(!allowOf(m).includes('Bash(gh pr merge:*)'), 'nothing was added');
  const text = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline');
  assert.match(text.stdout, /\nEverything else this command can set up is in place; nothing was changed\./, text.stdout);
  assert.match(text.stdout, /\nClaude Code still asks before it runs Bash\(gh pr merge:\*\), Bash\(own-cli sync:\*\)\. To allow them: npx @passioncode-ai\/passioncode@latest setup --allow-commands \(a rule ending in \* allows any arguments after its words\)\n/, text.stdout);
  assert.match(text.stdout, /\nRules declared on this machine and not offered as declared:\n  .*own-agent\.json: Bash\(python3 \*\): a wildcard over python could run any code; declare the exact command, or a command of your own\n/, text.stdout);
  // A dry run lists the set as one line, each rule under it with what it allows and who declared it.
  const plan = await cli(m, api, 'setup', '--no-apps', '--offline', '--dry-run');
  assert.match(plan.stdout, /\n  – let Claude Code run these commands without asking \(asked in a terminal, or --allow-commands\):\n      Bash\(gh pr merge:\*\) \(merge a pull request with the GitHub CLI; the rule cannot be limited to your repositories\)\n      Bash\(own-cli sync:\*\) \(let Own Agent sync its data; declared by Own Agent\)\n      \(a rule ending in \* allows any arguments after its words, options included\)\n/, plan.stdout);
  assert.match(plan.stdout, /\nRun it without --dry-run, in a terminal or with --allow-commands, to apply\.\n/, plan.stdout);
  assert.doesNotMatch(plan.stdout, /still asks before it runs|merge, declared again/, plan.stdout); // a plan names how to take them; the hint is a run's
  const bare = machine({ toolRules: false, commandRules: false });
  assert.equal((await cli(bare, api, 'setup', '--yes', '--no-apps', '--offline')).status, 0); // set up, the rules aside
  const both = await cli(bare, api, 'setup', '--no-apps', '--offline', '--dry-run');
  assert.match(both.stdout, /\nRun it without --dry-run, in a terminal or with --allow-tools and --allow-commands, to apply\.\n/, both.stdout);
  // One set taken already: the footer names the flag of the one still asked about.
  const half = await cli(bare, api, 'setup', '--no-apps', '--offline', '--dry-run', '--allow-tools');
  assert.match(half.stdout, /\nRun it without --dry-run, in a terminal or with --allow-commands, to apply\.\n/, half.stdout);
  // --allow-commands takes the set: the rules are merged, the tool rules and other settings kept.
  const taken = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-commands');
  assert.equal(taken.status, 0, taken.stdout);
  assert.match(taken.stdout, /done +allowed Bash\(gh pr merge:\*\), Bash\(own-cli sync:\*\) in .*settings\.json \(an ask or deny rule for them still wins; a rule ending in \* allows any arguments after its words\)/, taken.stdout);
  assert.deepEqual(allowOf(m), [...P.RULES, 'Bash(gh pr merge:*)', 'Bash(own-cli sync:*)']);
  assert.doesNotMatch(taken.stdout, /still asks before it runs/, taken.stdout);
  // PC-125: the ledger names what setup installed, who declared it, from where, and when.
  const ledgerDoc = JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode', 'permissions.json'), 'utf8'));
  assert.equal(ledgerDoc.schema, 'passioncode-permissions/1');
  assert.deepEqual(ledgerDoc.rules.map(({ installedAt, ...r }) => (assert.ok(Date.parse(installedAt)), r)), [
    { rule: 'Bash(gh pr merge:*)', set: 'commands', why: P.COMMANDS[0].why, by: 'PassionCode setup', source: 'launcher', installedBy: 'PassionCode setup', version: require('../package.json').version },
    { rule: 'Bash(own-cli sync:*)', set: 'commands', why: 'let Own Agent sync its data', by: 'Own Agent', source: 'rules.d/own-agent.json', installedBy: 'PassionCode setup', version: require('../package.json').version },
  ]);
  const again = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--json');
  assert.deepEqual(again.json.commands.rules, [], 'a second run offers nothing');
  // --allow-commands asked for them: settings that cannot be read are a failed step (exit 1), and a dry run says so.
  const broken = machine({ commandRules: false });
  fs.writeFileSync(settingsOf(broken), '{ not json');
  const failed = await cli(broken, api, 'setup', '--yes', '--no-apps', '--offline', '--allow-commands');
  assert.equal(failed.status, 1, failed.stdout);
  assert.match(failed.stdout, /FAILED allow Bash\(gh pr merge:\*\) in .*settings\.json\n.*is not valid JSON/, failed.stdout);
  const failsPlan = await cli(broken, api, 'setup', '--no-apps', '--offline', '--dry-run', '--allow-commands');
  assert.match(failsPlan.stdout, /\nA run with --allow-commands fails until that is fixed\.\n/, failsPlan.stdout);
  assert.match(failsPlan.stdout, /\n  • let Claude Code run these commands without asking \(asked in a terminal, or --allow-commands\):\n      Bash\(gh pr merge:\*\) /, failsPlan.stdout); // the set it would write
  assert.equal(fs.readFileSync(settingsOf(broken), 'utf8'), '{ not json');
  // npx puts node_modules/.bin folders on PATH, which Claude Code's shell does not have: a command found only there is
  // not a command of the person's own.
  const viaNpx = machine({ commandRules: false });
  const proj = path.join(viaNpx.home, 'proj', 'node_modules', '.bin');
  fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'own-npx'), '#!/bin/sh\n', { mode: 0o755 });
  fs.mkdirSync(path.join(viaNpx.home, '.passioncode', 'rules.d'), { recursive: true });
  fs.writeFileSync(path.join(viaNpx.home, '.passioncode', 'rules.d', 'n.json'), JSON.stringify({ by: 'N', rules: [{ rule: 'Bash(own-npx sync:*)', why: 'sync' }] }));
  const npx = require('child_process').spawnSync(process.execPath, [BIN, 'setup', '--yes', '--no-apps', '--offline', '--json'],
    { env: { ...cliEnv(viaNpx, api), PATH: `${proj}${path.delimiter}${cliEnv(viaNpx, api).PATH}` }, encoding: 'utf8' });
  assert.match(JSON.parse(npx.stdout).commands.refused.join('\n'), /own-npx is not found on PATH/, npx.stdout);
  // A relative node_modules/.bin, which a shell reads in each repository, is not left out: it refuses the wildcard.
  const rel = require('child_process').spawnSync(process.execPath, [BIN, 'setup', '--yes', '--no-apps', '--offline', '--json'],
    { env: { ...cliEnv(viaNpx, api), PATH: `./node_modules/.bin${path.delimiter}${cliEnv(viaNpx, api).PATH}` }, encoding: 'utf8' });
  assert.match(JSON.parse(rel.stdout).commands.refused.join('\n'), /empty or relative folder/, rel.stdout);
  // doctor --fix never decides them.
  const fix = await cli(machine({ commandRules: false }), api, 'doctor', '--fix', '--offline', '--json');
  assert.equal(fix.json.commands, undefined, fix.stdout);
  // --allow-commands is setup's alone.
  assert.equal((await cli(m, api, 'doctor', '--allow-commands')).status, 2);
});

test('PC-119: in a terminal the command rules are one question of their own, default no', async (t) => {
  const api = await releaseServer(t);
  const run = (m, answer, extra = {}) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      const asked = [];
      S.setup({ online: false, noApps: true, ...${JSON.stringify(extra)}, ask: async (q) => { asked.push(q); return (${answer})(q); } })
        .then((r) => process.stdout.write(JSON.stringify({ asked, declined: r.declined, commands: r.commands, actions: r.actions.map((a) => a.kind + ':' + a.outcome), text: S.render(r) })), (e) => { console.error(e); process.exit(1); });`;
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  const question = 'Let Claude Code run these commands without asking: Bash(gh pr merge:*) (merge a pull request with the GitHub CLI; the rule cannot be limited to your repositories); a rule ending in * allows any arguments after its words? [y/N] ';
  const enter = run(machine({ commandRules: false }), "() => ''");
  assert.ok(enter.asked.includes(question), JSON.stringify(enter.asked));
  assert.equal(enter.commands.taken, false);
  assert.ok(!enter.actions.some((a) => a.startsWith('commands:')), JSON.stringify(enter.actions));
  // Yes to the commands alone, no to the repairs: added, and not a declined run.
  const lacking = machine({ toolRules: false, commandRules: false });
  fs.mkdirSync(path.join(lacking.home, '.passioncode', 'rules.d'), { recursive: true });
  fs.writeFileSync(path.join(lacking.home, '.passioncode', 'rules.d', 'a.json'), JSON.stringify({ by: 'A', rules: [{ rule: 'mcp__fabric', why: 'every Fabric tool' }] }));
  const only = run(lacking, '(q) => (/^Let Claude Code run/.test(q) ? "y" : "n")');
  assert.equal(only.declined, undefined, only.text);
  assert.deepEqual(only.actions, ['commands:done'], only.text);
  const allow = JSON.parse(fs.readFileSync(path.join(lacking.home, '.claude', 'settings.json'), 'utf8')).permissions.allow;
  assert.deepEqual(allow, ['Bash(gh pr merge:*)'], 'the tool rules, declined, are not written with the commands');
  assert.match(only.text, /mcp__fabric: a declared rule names a command/, only.text);
  // Settings unreadable at the plan and mended before the write: the whole set is added, never "nothing to add".
  const mended = machine({ commandRules: false });
  fs.writeFileSync(path.join(mended.home, '.claude', 'settings.json'), '{ not json');
  const fixer = `(q) => { require('fs').writeFileSync(require('path').join(process.env.HOME, '.claude', 'settings.json'), '{}'); return 'y'; }`;
  const fixed = run(mended, fixer, { allowCommands: true });
  assert.ok(fixed.actions.includes('commands:done'), fixed.text);
  assert.match(fixed.text, /done +allowed Bash\(gh pr merge:\*\) in /, fixed.text);
  // --allow-commands is that yes already.
  const pre = run(machine({ commandRules: false }), '() => "n"', { allowCommands: true });
  assert.ok(!pre.asked.some((q) => /^Let Claude Code run/.test(q)), JSON.stringify(pre.asked));
  assert.ok(pre.actions.includes('commands:done'), JSON.stringify(pre.actions));
});

// PC-110 end to end: the plan's footer matches what a terminal run of the same command asks.
test('PC-110: a train-only plan asks nothing in a terminal; an offer that defaults to no is still asked', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t, { version: '1.2.0', also: ['1.1.0'] });
  const terminal = (m, opts) => {
    const script = `const S = require(${JSON.stringify(path.join(__dirname, '../lib/setup'))});
      const asked = [];
      S.setup(Object.assign({ ask: async (q) => { asked.push(q); return 'n'; } }, ${JSON.stringify(opts)}))
        .then((r) => process.stdout.write(JSON.stringify({ asked, actions: r.actions.map((a) => a.detail) })), (e) => { console.error(e); process.exit(1); });`;
    const r = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    return JSON.parse(r.stdout);
  };
  for (const [tools, offer] of [[TOOLS, false], [TOOLS.filter((x) => x !== 'docker'), true]]) {
    const m = onTrain(machine({ tools }));
    const first = await cli(m, api, 'setup', '--yes', '--json', '--train', 'org-test');
    assert.equal(first.status, 0, first.stderr + first.stdout);
    fs.copyFileSync(path.join(m.trains, 'org-test.json'), path.join(m.trains, 'org-two.json'));
    const doc = JSON.parse(fs.readFileSync(path.join(m.trains, 'org-two.json'), 'utf8'));
    fs.writeFileSync(path.join(m.trains, 'org-two.json'), JSON.stringify({ ...doc, train: 'org-two' }));
    const plan = await cli(m, api, 'setup', '--train', 'org-two'); // no terminal: the plan
    assert.equal(plan.status, 0, plan.stderr + plan.stdout);
    assert.match(plan.stdout, /  • save release train org-two\n/, plan.stdout);
    const run = terminal(m, { train: 'org-two' });
    assert.deepEqual(run.actions, ['saved release train org-two (it was org-test)'], JSON.stringify(run));
    if (offer) {
      assert.match(plan.stdout, /  – install Fabric/, plan.stdout);
      assert.match(plan.stdout, /\nRun it with --yes to apply, or in a terminal to answer its questions\.\n/, plan.stdout);
      assert.equal(run.asked.length, 1, JSON.stringify(run.asked));
      assert.match(run.asked[0], /^Install Fabric \(early preview\) into \S/); // PC-145: the question names the folder
    } else {
      assert.doesNotMatch(plan.stdout, /^ {2}– /m, plan.stdout);
      assert.match(plan.stdout, /\nRun it with --yes, or in a terminal, to apply\.\n/, plan.stdout);
      assert.deepEqual(run.asked, [], JSON.stringify(run.asked));
    }
  }
});

test('PC-110: a plan with nothing to ask promises no questions; any offer or repair keeps them', () => {
  const { render } = require('../lib/setup');
  const empty = { summary: {}, checks: [] };
  const base = { mode: 'existing', platform: 'darwin', before: empty, after: empty, plan: [], actions: [], humanSteps: [], planOnly: true };
  const asks = 'Run it with --yes to apply, or in a terminal to answer its questions.';
  const quiet = 'Run it with --yes, or in a terminal, to apply.';
  const lines = (over) => render({ ...base, ...over }).split('\n');
  assert.ok(lines({ trainNotSaved: 'org-test' }).includes(quiet));
  assert.ok(lines({ trainNotSaved: 'none' }).includes(quiet));
  const offer = { kind: 'install', product: 'fabric', selected: false, detail: 'install Fabric (early preview)', note: 'needs Docker' };
  const repair = { kind: 'update', product: 'fabric', selected: true, detail: 'update Fabric' };
  for (const plan of [[offer], [repair], [{ ...offer, selected: true }]]) {
    const out = lines({ trainNotSaved: 'org-test', plan });
    assert.ok(out.includes(asks) && !out.includes(quiet), out.join('\n'));
  }
  assert.ok(lines({ plan: [repair] }).includes(asks));
  // A --dry-run only plans, with --yes or in a terminal too: its own line, whatever the plan holds.
  const dry = 'Run it without --dry-run (with --yes, or in a terminal) to apply.';
  for (const over of [{ trainNotSaved: 'org-test' }, { plan: [repair] }, { plan: [offer], trainNotSaved: 'org-test' }]) {
    const out = lines({ dryRun: true, ...over });
    assert.ok(out.includes(dry) && !out.includes(asks) && !out.includes(quiet), out.join('\n'));
  }
});

test('PC-91: runs that declined nothing keep their old report', () => {
  const { render } = require('../lib/setup');
  const empty = { summary: {}, checks: [] };
  const base = { mode: 'existing', platform: 'darwin', before: empty, after: empty, plan: [], actions: [], humanSteps: [] };
  assert.match(render({ ...base }), /Everything this command can set up is in place; nothing was changed\./);
  // PC-104: the checks are pointed at only when one fails or warns (PC-105); an empty plan names the apps it would leave,
  // and a plan whose only change is a train is a plan.
  const failing = { summary: { fail: 1 }, checks: [] };
  assert.doesNotMatch(render({ ...base }), /still stand/);
  assert.match(render({ ...base, after: failing }), /in place; nothing was changed\. The checks below still stand\./);
  assert.match(render({ ...base, planOnly: true, after: failing }), /Nothing to do\. The checks below still stand\./);
  const fabric = { kind: 'install', product: 'fabric', selected: false, detail: 'install Fabric (early preview)', note: 'needs Docker' };
  const would = render({ ...base, planOnly: true, plan: [fabric] });
  assert.match(would, /Nothing would change: Fabric would not be installed \(see the plan below\)\./);
  assert.doesNotMatch(would, /Nothing to do|still stand/);
  assert.match(render({ ...base, planOnly: true, plan: [fabric], after: failing }), /would not be installed \(see the plan below\)\. The checks below still stand\./);
  const trainOnly = render({ ...base, planOnly: true, trainNotSaved: 'org-test' });
  assert.match(trainOnly, /Plan \(nothing was changed\):/);
  assert.doesNotMatch(trainOnly, /Nothing to do/);
  assert.match(render({ ...base, planOnly: true, plan: [{ ...fabric, selected: true }] }), /Run it with --yes to apply, or in a terminal to answer its questions\./);
  // PC-93: a plan exits 0; a declined run, plan-shaped or not, exits by its checks.
  const { exitCode } = require('../lib/setup');
  assert.match(fs.readFileSync(path.join(__dirname, '../bin/passioncode.js'), 'utf8'), /return S\.exitCode\(r\);/, 'setup and doctor --fix exit through exitCode');
  assert.equal(exitCode({ planOnly: true, ok: false }), 0);
  assert.equal(exitCode({ planOnly: true, declined: true, ok: false }), 1);
  assert.equal(exitCode({ declined: true, ok: false }), 1);
  assert.equal(exitCode({ planOnly: true, declined: true, ok: true }), 0);
  assert.match(render({ ...base, planOnly: true }), /Nothing to do\./);
  assert.match(render({ ...base, humanSteps: ['open it once'] }), /\nYour steps \(sign-ins, consents and secrets in hidden prompts need you in person\):\n  1\. open it once/);
  // PC-92: an untaken default-no offer is named, neither "in place" nor "declined".
  const one = render({ ...base, notTaken: ['Fabric'] });
  assert.match(one, /Nothing was changed: Fabric was offered and not installed\.\n/); // no check open: no pointer (PC-105)
  assert.doesNotMatch(one, /in place|You declined/);
  assert.match(render({ ...base, notTaken: ['Fabric', 'Fabric Inbox'] }), /Fabric and Fabric Inbox were offered and not installed/);
  // PC-101: skipped by a run that asked nothing; a declined run that left a default-no offer.
  const skip = render({ ...base, skipped: ['Fabric'] });
  assert.match(skip, /Nothing was changed: Fabric was not installed \(see your steps below\)\./);
  assert.doesNotMatch(skip, /in place|You declined|offered/);
  assert.match(render({ ...base, declined: true, notTaken: ['Fabric', 'Fabric Inbox'] }), /You declined every other offer, and Fabric and Fabric Inbox were not installed; nothing was changed\./);
  assert.match(render({ ...base, planOnly: true, declined: true, notTaken: ['Fabric'], plan: [] }), /You declined every other offer, and Fabric was not installed/);
  const train = render({ ...base, planOnly: true, trainNotSaved: 'org-test' });
  assert.match(train, /The release train \(org-test\) was not saved\.\n\nRun it with --yes, or in a terminal, to apply\./); // PC-110
  assert.doesNotMatch(train, /You declined/);
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

// The fourth seam reading of PC-89: without --yes and without a terminal nothing changes, train
// included; in a terminal, pressing Enter on an offer that defaults to no is not declining the train.
test('PC-89: a run nobody agreed to saves no train; Enter on a default-no offer keeps the named one', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine({ tools: TOOLS.filter((x) => x !== 'supabase') }));
  for (const id of ['switchboard', 'dashboards', 'observatory', 'inbox']) installApp(m, catalog.byId(id), { version: '1.1.0' });
  await cli(m, api, 'setup', '--json', '--yes', '--no-apps', '--no-open', '--offline');
  const state = () => { try { return JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train; } catch (_) { return undefined; } };
  const r = await cli(m, api, 'setup', '--json', '--no-open', '--offline', '--train', 'org-test');
  assert.ok(r.json.plan.length && r.json.plan.every((i) => !i.selected), JSON.stringify(r.json.plan));
  assert.equal(state(), undefined, 'no --yes and no terminal: nothing changes');
  const script = `require(${JSON.stringify(path.join(__dirname, '../lib/setup'))}).setup({ online: false, noOpen: true, train: 'org-test', ask: async () => '' })
    .then(() => {}, (e) => { console.error(e); process.exit(1); });`;
  const i = require('child_process').spawnSync(process.execPath, ['-e', script], { env: cliEnv(m, api), encoding: 'utf8' });
  assert.equal(i.status, 0, i.stderr);
  assert.equal(state(), 'org-test');
});

test('PC-89: a macOS app whose version cannot be read is never reported as the latest', async (t) => {
  const api = await releaseServer(t, { version: '1.2.0' });
  const m = machine();
  installApp(m, catalog.byId('switchboard'), { version: '1.1.0' });
  fs.writeFileSync(path.join(m.apps, 'Fabric Switchboard.app/Contents/Info.plist'), 'not a plist');
  const doc = await cli(m, api, 'doctor', '--json');
  const row = doc.json.checks.find((c) => c.id === 'app.switchboard');
  assert.equal(row.state, 'warn');
  assert.match(row.detail, /\(version unknown\); the latest is 1\.2\.0/);
});

// The fifth seam reading of PC-89: a train change nobody agreed to is a plan only; it never saves its
// checks as this machine's state, so the session hook keeps naming an unusable train.
test('PC-89: setup --train without --yes or a terminal is a plan; doctor.json keeps the failing train', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const doc = await cli(m, api, 'doctor', '--json', '--offline');
  assert.equal(doc.json.checks.find((c) => c.id === 'train').state, 'fail');
  const saved = fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8');
  const r = await cli(m, api, 'setup', '--json', '--offline', '--train', 'none');
  assert.equal(r.json.planOnly, true);
  assert.equal(fs.readFileSync(path.join(m.home, '.passioncode/doctor.json'), 'utf8'), saved, 'the plan saves no checks');
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, 'gone');
  // A fresh check time: the hook starts no detached npm probe that would outlive the test run (PC-115).
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone', checkedAt: new Date().toISOString() }));
  const hook = require('child_process').spawnSync(process.execPath, [path.join(__dirname, '../plugin/passioncode/hooks/session-start.js')], { env: cliEnv(m, api), input: '{}', encoding: 'utf8' });
  assert.ok(!fs.existsSync(path.join(m.home, '.passioncode/logs/probe.log')), 'no probe was started');
  assert.match(hook.stdout, /setup --yes --no-apps --train none/, hook.stdout + hook.stderr);
});

// The sixth seam reading of PC-89: the way out of an unusable train installs nothing, and a text run
// that withheld a train change says so.
test('PC-89: the unusable-train fix plans no install; a withheld train is named in text output', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const doc = await cli(m, api, 'doctor', '--json', '--offline');
  const fix = doc.json.checks.find((c) => c.id === 'train').fix;
  const args = fix.replace(/ \(or update the launcher\)$/, '').split(' ').slice(2); // after `npx <package>`
  const r = await cli(m, api, ...args, '--json', '--offline', '--no-open');
  assert.ok(!r.json.plan.some((i) => i.kind === 'install' && i.selected), JSON.stringify(r.json.plan));
  assert.equal(JSON.parse(fs.readFileSync(path.join(m.home, '.passioncode/state.json'), 'utf8')).train, undefined);
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const text = await cli(m, api, 'setup', '--offline', '--train', 'none');
  assert.match(text.stdout, /  • forget the saved release train\n\nThe saved release train was not forgotten\.\n\nRun it with --yes to apply, or in a terminal to answer its questions\./);
  // PC-105: a plan with installs lists its train change under them, as one of its lines.
  assert.match(text.stdout, /\n  • install [^\n]*\n  • forget the saved release train\n/);
});

// The seventh seam reading of PC-89: changing the saved train is a change, reported in actions and text.
test('PC-89: a run that only changes the saved train reports it', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  fs.mkdirSync(path.join(m.home, '.passioncode'), { recursive: true });
  fs.writeFileSync(path.join(m.home, '.passioncode/state.json'), JSON.stringify({ train: 'gone' }));
  const text = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--no-open', '--train', 'none');
  assert.doesNotMatch(text.stdout, /nothing was changed/);
  assert.match(text.stdout, /forgot release train gone/);
  const j = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--no-open', '--json', '--train', 'org-test');
  assert.ok(j.json.actions.some((a) => a.kind === 'train' && /saved release train org-test/.test(a.detail)), JSON.stringify(j.json.actions));
  const again = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--no-open', '--json', '--train', 'org-test');
  assert.ok(!again.json.actions.some((a) => a.kind === 'train'), 'the same train again changes nothing');
  const healthy = await cli(m, api, 'setup', '--yes', '--no-apps', '--offline', '--no-open', '--json', '--train', 'org-test');
  assert.deepEqual(healthy.json.actions, [], 'a healthy machine on its train: empty actions');
  const named = await cli(m, api, 'setup', '--json', '--no-apps', '--offline', '--train', 'org-test');
  assert.equal(named.json.trainNotSaved, undefined, 'naming the saved train without --yes is not a pending change');
  const dry = await cli(m, api, 'setup', '--dry-run', '--json', '--offline', '--train', 'none');
  assert.equal(dry.json.trainNotSaved, 'none');
});

// The ninth seam reading of PC-89: naming the train already saved writes nothing, so a run nobody
// agreed to never creates or rewrites state.json, and a corrupt one fails no harder than plain setup.
test('PC-89: naming the saved train (or none with none saved) writes no state', async (t) => {
  const api = await releaseServer(t);
  const m = onTrain(machine());
  const file = path.join(m.home, '.passioncode/state.json');
  await cli(m, api, 'setup', '--json', '--offline', '--train', 'none');
  assert.equal(fs.existsSync(file), false, 'no state.json created');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{bad');
  const plain = await cli(m, api, 'setup', '--json', '--offline');
  const named = await cli(m, api, 'setup', '--json', '--offline', '--train', 'none');
  assert.equal(named.status, plain.status, named.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), '{bad', 'the corrupt file is preserved');
});

// Fabric Switchboard's zip holds its app one folder down
// (`Fabric-Switchboard-<v>-macos-universal/Fabric Switchboard.app`, 0.6.83 to 0.7.1, checked with unzip -l).
test('an app one folder down in its zip is found and installed', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t, { nested: 'switchboard' });
  const m = machine({ tools: TOOLS.filter((x) => x !== 'docker') });
  const r = await cli(m, api, 'setup', '--yes', '--json', '--no-open', '--with', 'switchboard');
  const a = r.json.actions.find((x) => x.product === 'switchboard');
  assert.ok(a && a.outcome === 'done', JSON.stringify(r.json.actions));
  const plist = JSON.parse(fs.readFileSync(path.join(m.apps, 'Fabric Switchboard.app/Contents/Info.plist'), 'utf8'));
  assert.equal(plist.CFBundleShortVersionString, '1.2.0');
});

test('findBundle: the root, one folder down, none, and two copies refused', () => {
  const { findBundle } = require('../lib/releases');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-bundle-'));
  assert.equal(findBundle(root, 'X.app'), null);
  fs.mkdirSync(path.join(root, 'X-1.0-macos', 'X.app'), { recursive: true });
  fs.mkdirSync(path.join(root, '__MACOSX', 'X.app'), { recursive: true });
  assert.equal(findBundle(root, 'X.app'), path.join(root, 'X-1.0-macos', 'X.app'));
  fs.mkdirSync(path.join(root, 'other', 'X.app'), { recursive: true });
  assert.throws(() => findBundle(root, 'X.app'), /2 copies of X\.app/);
  fs.mkdirSync(path.join(root, 'X.app'));
  assert.equal(findBundle(root, 'X.app'), path.join(root, 'X.app'));
});

test('a connection dropped before any answer is tried once more', async (t) => {
  const http = require('http');
  let calls = 0;
  const server = http.createServer((req, res) => { calls += 1; if (calls === 1) { req.socket.destroy(); return; } res.end('ok'); });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  const { download } = require('../lib/releases');
  const dest = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-dl-')), 'f');
  await download(`http://127.0.0.1:${server.address().port}/f`, dest);
  assert.equal(fs.readFileSync(dest, 'utf8'), 'ok');
  assert.equal(calls, 2);
});

test('PC-159: setup and doctor --fix refuse to run as root, and plain doctor still reads', { skip: MAC_SIM }, async (t) => {
  const api = await releaseServer(t);
  const m = machine();
  const asRoot = (...args) => require('child_process').spawnSync(process.execPath, [BIN, ...args], { env: { ...cliEnv(m, api), PASSIONCODE_UID: '0' }, encoding: 'utf8' });
  const setup = asRoot('setup', '--yes', '--no-apps', '--offline');
  assert.equal(setup.status, 2, setup.stdout + setup.stderr);
  assert.match(setup.stderr, /run setup as yourself, without sudo: it installs into your own home folder, and what root installs there you could not replace\./);
  assert.equal(setup.stdout, '');
  assert.ok(!fs.existsSync(path.join(m.home, '.passioncode', 'state.json')), 'nothing was written');
  const fix = asRoot('doctor', '--fix', '--offline');
  assert.equal(fix.status, 2);
  assert.match(fix.stderr, /run doctor --fix as yourself, without sudo/);
  const read = asRoot('doctor', '--offline', '--json');
  assert.notEqual(read.status, 2, read.stderr);
  assert.ok(JSON.parse(read.stdout).checks, 'plain doctor only reads, so it runs');
});
