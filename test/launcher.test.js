'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

// No test reads the machine's own /Applications: an app installed there would add MCP steps.
process.env.PASSIONCODE_APPLICATIONS = require('node:path').join(require('node:os').tmpdir(), 'pc-no-applications');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin/passioncode.js');
const FAKE = path.join(__dirname, 'fake-claude.js');

function makePayload(dir, version, members) {
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  for (const m of members) {
    fs.mkdirSync(path.join(dir, 'plugins', m.name, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'plugins', m.name, '.claude-plugin/plugin.json'), JSON.stringify({ name: m.name, version: m.version }));
    for (const s of m.skills) {
      fs.mkdirSync(path.join(dir, 'plugins', m.name, 'skills', s), { recursive: true });
      fs.writeFileSync(path.join(dir, 'plugins', m.name, 'skills', s, 'SKILL.md'), `---\nname: ${s}\n---\n${m.version}\n`);
    }
  }
  fs.writeFileSync(path.join(dir, '.claude-plugin/marketplace.json'), JSON.stringify({ name: 'passioncode', plugins: members.map((m) => ({ name: m.name, source: `./plugins/${m.name}` })) }));
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({ family: 'passioncode', version, members }));
}

function setup() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-home-'));
  const payload = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-payload-'));
  const members = [
    { name: 'fabric-agent-adapter', version: '0.4.0', skills: ['building-fabric-services', 'creating-fabric-agents'], legacyPluginIds: ['fabric-agent-adapter@fabric-agent-adapter'], legacyMarketplaces: ['fabric-agent-adapter'] },
    { name: 'example-agent', version: '0.1.0', skills: ['example-agent'], legacyPluginIds: [] },
  ];
  makePayload(payload, '0.1.0', members);
  // What this machine looked like on 2026-09-28: a legacy plugin, working-tree links in the hub, a shadowing link in ~/.claude/skills.
  fs.mkdirSync(path.join(home, '.claude/plugins'), { recursive: true });
  fs.writeFileSync(path.join(home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: { 'fabric-agent-adapter@fabric-agent-adapter': [{ installPath: '/old' }] } }));
  const tree = path.join(home, 'DATA/example-agent-agent/skills/example-agent');
  fs.mkdirSync(tree, { recursive: true });
  fs.mkdirSync(path.join(home, '.agents/skills'), { recursive: true });
  fs.symlinkSync(tree, path.join(home, '.agents/skills/example-agent'));
  fs.mkdirSync(path.join(home, '.claude/skills'), { recursive: true });
  fs.symlinkSync(path.join(home, '.agents/skills/example-agent'), path.join(home, '.claude/skills/example-agent'));
  fs.mkdirSync(path.join(home, '.cursor/skills'), { recursive: true });
  fs.mkdirSync(path.join(home, '.codex/skills/creating-fabric-agents'), { recursive: true }); // a plain copy
  return { home, payload, members };
}

function run(env, ...args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, HOME: env.home, USERPROFILE: env.home, PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_CLAUDE: FAKE, PASSIONCODE_HOME: '', PASSIONCODE_FABRIC_DASHBOARDS_MCP: path.join(env.home, 'no-fabric-dashboards-mcp'), KIMI_CODE_HOME: '', ...(env.extra || {}) } });
}
const calls = (home) => { try { return fs.readFileSync(path.join(home, 'claude-calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };

test('PC-131: an install, a background download and the update switch go into the update log, codes only (LC-16)', () => {
  const env = setup();
  const events = () => { try { return fs.readFileSync(path.join(env.home, '.passioncode/logs/update-events.log'), 'utf8').trim().split('\n').map((l) => l.split(' ').slice(1).join(' ')); } catch (_) { return []; } };
  assert.equal(run(env, 'update', '--dry-run').status, 0);
  assert.deepEqual(events(), [], 'a plan installs nothing and logs nothing');
  assert.equal(run(env, 'update').status, 0);
  assert.deepEqual(events(), ['update_install installed']);
  env.extra = { PASSIONCODE_UPDATE_FROM: 'session-start' };
  assert.equal(run(env, 'update', '--quiet').status, 0);
  assert.deepEqual(events().slice(1), ['update_download done', 'update_install installed'], 'the update the hook started');
  env.extra = {};
  assert.equal(run(env, 'config', 'set', 'update.auto', 'off').status, 0);
  assert.equal(run(env, 'config', 'set', 'update.auto', 'on').status, 0);
  assert.deepEqual(events().slice(3), ['auto_update off', 'auto_update on']);
  const line = fs.readFileSync(path.join(env.home, '.passioncode/logs/update-events.log'), 'utf8').split('\n')[0];
  assert.match(line, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z update_install installed$/);
  if (process.platform !== 'win32') assert.equal(fs.statSync(path.join(env.home, '.passioncode/logs/update-events.log')).mode & 0o777, 0o600);
});

test('update installs the release, the plugins, the hub and channels, and moves shadows aside', () => {
  const env = setup();
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const home = env.home;
  const current = path.join(home, '.passioncode/current');
  assert.equal(fs.readlinkSync(current), path.join(home, '.passioncode/releases/0.1.0'));
  const c = calls(home);
  assert.ok(c.includes(`plugin marketplace add ${current}`));
  assert.ok(c.includes('plugin install fabric-agent-adapter@passioncode'));
  assert.ok(c.includes('plugin install example-agent@passioncode'));
  assert.ok(c.includes('plugin uninstall fabric-agent-adapter@fabric-agent-adapter'), 'the legacy single-member plugin is replaced');
  assert.equal(fs.readlinkSync(path.join(home, '.agents/skills/example-agent')), path.join(current, 'plugins/example-agent/skills/example-agent'), 'the hub no longer follows a working tree');
  assert.equal(fs.readlinkSync(path.join(home, '.cursor/skills/building-fabric-services')), path.join(home, '.agents/skills/building-fabric-services'));
  assert.equal(fs.readlinkSync(path.join(home, '.codex/skills/creating-fabric-agents')), path.join(home, '.agents/skills/creating-fabric-agents'), 'a plain channel copy is replaced by a link');
  assert.equal(fs.existsSync(path.join(home, '.claude/skills/example-agent')), false, 'the shadowing plain entry is gone');
  assert.equal(fs.existsSync(path.join(home, '.gemini/skills')), false, 'a channel that does not exist is not invented');
  const state = JSON.parse(fs.readFileSync(path.join(home, '.passioncode/state.json'), 'utf8'));
  assert.equal(state.installed, '0.1.0');
  const moved = JSON.parse(fs.readFileSync(path.join(state.quarantines[0], 'moved.json'), 'utf8'));
  assert.equal(moved.length, 3);
});

test('PC-129: with CLAUDE_CONFIG_DIR set, update installs, checks shadows and keeps state in that folder, not ~/.claude', () => {
  const env = setup();
  const cfg = path.join(env.home, 'claude-config');
  fs.renameSync(path.join(env.home, '.claude'), cfg); // where Claude Code keeps everything when the variable is set
  env.extra = { ...(env.extra || {}), CLAUDE_CONFIG_DIR: cfg };
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal(fs.existsSync(path.join(env.home, '.claude')), false, 'nothing is written under ~/.claude');
  const installed = Object.keys(JSON.parse(fs.readFileSync(path.join(cfg, 'plugins/installed_plugins.json'), 'utf8')).plugins);
  assert.ok(installed.includes('example-agent@passioncode'), installed.join(', '));
  assert.equal(fs.existsSync(path.join(cfg, 'skills/example-agent')), false, 'the shadowing entry in that folder is moved aside');
  const status = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(status.members.find((m) => m.name === 'example-agent').claude, 'plugin', 'status reads the plugins from that folder');
});

test('PC-129: a relative CLAUDE_CONFIG_DIR means one folder to the launcher and the CLI: MCP, doctor and uninstall agree', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const cfg = path.join(env.home, 'claude-config');
  fs.renameSync(path.join(env.home, '.claude'), cfg);
  fs.renameSync(path.join(env.home, '.claude.json'), path.join(cfg, '.claude.json'));
  env.extra = { ...env.extra, CLAUDE_CONFIG_DIR: 'claude-config' }; // relative: the CLI runs from ~/.passioncode, the launcher from home
  const at = (...args) => spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', cwd: env.home, env: { ...process.env, HOME: env.home, USERPROFILE: env.home, PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_CLAUDE: FAKE, PASSIONCODE_HOME: '', KIMI_CODE_HOME: '', ...env.extra } });
  const up = at('update', '--json');
  assert.equal(up.status, 0, up.stderr + up.stdout);
  const servers = () => JSON.parse(fs.readFileSync(path.join(cfg, '.claude.json'), 'utf8')).mcpServers;
  assert.ok(servers()['fabric-dashboards'], 'registered in the folder the variable names');
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode', 'claude-config')), false, 'no stray folder where the CLI runs');
  assert.equal(fs.existsSync(path.join(env.home, '.claude.json')), false);
  fs.mkdirSync(path.join(cfg, 'skills', 'example-agent'), { recursive: true }); // a plain copy that shadows the plugin
  const doc = JSON.parse(at('doctor', '--json', '--offline').stdout);
  const row = doc.checks.find((c) => c.id === 'skills.example-agent');
  assert.match(row.detail, /shadowed by \S*claude-config[\\/]skills[\\/]example-agent/, row.detail); // the folder it checked
  const mcpRow = doc.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards');
  assert.ok(mcpRow && !/is not registered/.test(mcpRow.detail), `doctor reads the folder's .claude.json: ${JSON.stringify(mcpRow)}`);
  const un = at('uninstall', '--json');
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.equal(servers()['fabric-dashboards'], undefined, 'uninstall removes it from the same file');
  assert.ok(servers().someone, "the person's own entry stays");
});

test('PC-129: uninstall without the variable removes the entry from the folder it was written to, never a same-named one in ~/.claude.json', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const cfg = path.join(env.home, 'claude-config');
  fs.renameSync(path.join(env.home, '.claude'), cfg);
  fs.renameSync(path.join(env.home, '.claude.json'), path.join(cfg, '.claude.json'));
  env.extra = { ...env.extra, CLAUDE_CONFIG_DIR: cfg };
  assert.equal(run(env, 'update', '--json').status, 0);
  const servers = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers;
  assert.ok(servers(path.join(cfg, '.claude.json'))['fabric-dashboards']);
  // The person's own entry of the same name in the default file.
  fs.writeFileSync(path.join(env.home, '.claude.json'), JSON.stringify({ mcpServers: { 'fabric-dashboards': { command: '/their/own' } } }));
  delete env.extra.CLAUDE_CONFIG_DIR;
  const un = run(env, 'uninstall', '--json');
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.equal(servers(path.join(cfg, '.claude.json'))['fabric-dashboards'], undefined, 'removed from the folder it was written to');
  assert.deepEqual(servers(path.join(env.home, '.claude.json'))['fabric-dashboards'], { command: '/their/own' }, "the person's entry stays");
});

test('PC-129: an entry claude mcp remove answers for but leaves is named in the uninstall output', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update', '--json').status, 0);
  assert.ok(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers['fabric-dashboards']);
  env.extra = { ...env.extra, FAKE_CLAUDE_KEEP_MCP: '1' };
  const un = run(env, 'uninstall');
  assert.match(un.stdout + un.stderr, /is still there after claude mcp remove/, un.stdout + un.stderr);
});

test('PC-143 (LC-12): uninstall removes the session hook\'s update folders and their record, unless an update may still run', () => {
  const env = setup();
  assert.equal(run(env, 'update', '--json').status, 0);
  const state = path.join(env.home, '.passioncode');
  const stateFile = path.join(state, 'state.json');
  const cache = path.join(state, 'run', 'cache-abc');
  const seed = (extra) => {
    fs.mkdirSync(cache, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(stateFile, 'utf8')), updateCache: cache, updateCaches: [cache], ...extra }));
  };
  // An update recorded a minute ago may still run from its folder: the folder stays, the record goes.
  seed({ updatingSince: new Date(Date.now() - 60 * 1000).toISOString() });
  const busy = run(env, 'uninstall', '--json');
  assert.equal(busy.status, 0, busy.stderr + busy.stdout);
  assert.ok(fs.existsSync(cache), 'an update in flight keeps its folder');
  const after = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  assert.equal(after.updateCache, undefined);
  assert.equal(after.updateCaches, undefined);
  assert.equal(after.updatingSince, undefined);
  // No update in flight: the whole run folder goes, and the output names it.
  assert.equal(run(env, 'update', '--json').status, 0);
  seed({});
  const done = run(env, 'uninstall', '--json');
  assert.equal(done.status, 0, done.stderr + done.stdout);
  assert.equal(fs.existsSync(path.join(state, 'run')), false);
  assert.ok(JSON.parse(done.stdout).includes(path.join(state, 'run')), done.stdout);
  // A stale record (over an hour old) is not an update in flight.
  assert.equal(run(env, 'update', '--json').status, 0);
  seed({ updatingSince: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() });
  assert.equal(run(env, 'uninstall', '--json').status, 0);
  assert.equal(fs.existsSync(path.join(state, 'run')), false);
});

test('PC-129: paths() puts every Claude Code file under CLAUDE_CONFIG_DIR when it is set, and an empty one counts as unset', () => {
  const L = require('../lib/launcher');
  const saved = process.env.CLAUDE_CONFIG_DIR;
  try {
    process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'cc');
    const p = L.paths(path.join(os.tmpdir(), 'h'));
    const cc = path.resolve(path.join(os.tmpdir(), 'cc'));
    assert.deepEqual([p.claudeSkills, p.claudePlugins, p.claudeSettings, p.claudeJson],
      [path.join(cc, 'skills'), path.join(cc, 'plugins'), path.join(cc, 'settings.json'), path.join(cc, '.claude.json')]);
    process.env.CLAUDE_CONFIG_DIR = '';
    const d = L.paths(path.join(os.tmpdir(), 'h'));
    assert.equal(d.claudeSettings, path.join(os.tmpdir(), 'h', '.claude', 'settings.json'));
    assert.equal(d.claudeJson, path.join(os.tmpdir(), 'h', '.claude.json'));
    // SB-259: with SWITCHBOARD_CLAUDE_SOURCE_DIR, settings and .claude.json are the operator folder's, plugins and skills the home's.
    process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'cc');
    process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR = path.join(os.tmpdir(), 'own');
    const s = L.paths(path.join(os.tmpdir(), 'h'));
    const own = path.resolve(path.join(os.tmpdir(), 'own'));
    assert.deepEqual([s.claudeSkills, s.claudePlugins, s.claudeSettings, s.claudeJson],
      [path.join(cc, 'skills'), path.join(own, 'plugins'), path.join(own, 'settings.json'), path.join(own, '.claude.json')]);
    process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR = path.join(os.tmpdir(), 'h', '.claude'); // the default folder: ~/.claude.json
    const o = L.paths(path.join(os.tmpdir(), 'h'));
    assert.deepEqual([o.claudeSettings, o.claudeJson], [path.join(os.tmpdir(), 'h', '.claude', 'settings.json'), path.join(os.tmpdir(), 'h', '.claude.json')]);
    process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR = 'own'; // not absolute: not Switchboard's, ignored
    assert.equal(L.paths(path.join(os.tmpdir(), 'h')).claudeSettings, path.join(cc, 'settings.json'));
    // A home of a Switchboard before 0.7.14 (no source named) lies in its data folder: ~/.claude, as 0.2.75 wrote.
    delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR;
    process.env.CLAUDE_CONFIG_DIR = path.join(os.tmpdir(), 'ai.passioncode.fabric-switchboard', 'shell', 'claude-p1');
    const old = L.paths(path.join(os.tmpdir(), 'h'));
    assert.deepEqual([old.claudeSettings, old.claudeJson, old.claudePlugins],
      [path.join(os.tmpdir(), 'h', '.claude', 'settings.json'), path.join(os.tmpdir(), 'h', '.claude.json'), path.join(os.tmpdir(), 'h', '.claude', 'plugins')]);
    process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR = path.join(os.tmpdir(), 'own');
    process.env.CLAUDE_CONFIG_DIR = ''; // without a home the session is not Switchboard's: ~/.claude
    assert.equal(L.paths(path.join(os.tmpdir(), 'h')).claudeSettings, path.join(os.tmpdir(), 'h', '.claude', 'settings.json'));
  } finally {
    if (saved === undefined) delete process.env.CLAUDE_CONFIG_DIR; else process.env.CLAUDE_CONFIG_DIR = saved;
    delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR;
  }
});

test('PC-129: inside a Switchboard home the launcher writes settings and MCP to the operator folder and reads plugins from the home (SB-259)', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const operator = path.join(env.home, '.claude');
  fs.writeFileSync(path.join(operator, 'settings.json'), JSON.stringify({ theme: 'dark' }));
  // The home Switchboard builds: plugins and skills lead to the operator folder, settings.json is a copy rebuilt per launch.
  const sb = path.join(env.home, 'switchboard', 'claude-home');
  fs.mkdirSync(sb, { recursive: true });
  fs.symlinkSync(path.join(operator, 'plugins'), path.join(sb, 'plugins'), 'junction');
  fs.symlinkSync(path.join(operator, 'skills'), path.join(sb, 'skills'), 'junction');
  fs.copyFileSync(path.join(operator, 'settings.json'), path.join(sb, 'settings.json'));
  fs.writeFileSync(path.join(sb, '.claude.json'), JSON.stringify({ hasCompletedOnboarding: true }));
  env.extra = { ...env.extra, CLAUDE_CONFIG_DIR: sb, SWITCHBOARD_CLAUDE_SOURCE_DIR: operator };
  const up = run(env, 'update', '--json');
  assert.equal(up.status, 0, up.stderr + up.stdout);
  assert.ok(mcpEntry(path.join(env.home, '.claude.json')), "registered in the operator's ~/.claude.json");
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb, '.claude.json'), 'utf8')).mcpServers, undefined, "the home's own file is left alone");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(sb, 'settings.json'), 'utf8')), { theme: 'dark' }, 'the rebuilt copy is not written');
  const installed = Object.keys(JSON.parse(fs.readFileSync(path.join(operator, 'plugins/installed_plugins.json'), 'utf8')).plugins);
  assert.ok(installed.includes('example-agent@passioncode'), installed.join(', '));
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).members.find((m) => m.name === 'example-agent').claude, 'plugin', 'status reads them through the home');
  const doc = JSON.parse(run(env, 'doctor', '--json', '--offline').stdout);
  const mcpRow = doc.checks.find((c) => c.id === 'mcp.claude.fabric-dashboards');
  // The stand-in server does not answer its proving call; what matters is that doctor found the entry where it was written.
  assert.ok(mcpRow && !/is not registered/.test(mcpRow.detail), `doctor reads the person's ~/.claude.json: ${JSON.stringify(mcpRow)}`);
  const mode = run(env, 'permissions', 'mode', 'acceptEdits', '--json');
  assert.equal(mode.status, 0, mode.stderr + mode.stdout);
  assert.equal(JSON.parse(fs.readFileSync(path.join(operator, 'settings.json'), 'utf8')).permissions.defaultMode, 'acceptEdits', "the mode lands in the operator's settings");
  assert.equal(JSON.parse(fs.readFileSync(path.join(sb, 'settings.json'), 'utf8')).permissions, undefined);
  const un = run(env, 'uninstall', '--json');
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.equal(mcpEntry(path.join(env.home, '.claude.json')), undefined, 'uninstall removes it from the same file');
});

test('PC-129: a Switchboard home with a plugins folder of its own still updates: the registry is checked where the CLI installs', () => {
  const env = setup();
  const operator = path.join(env.home, '.claude');
  const sb = path.join(env.home, 'switchboard', 'claude-home');
  fs.mkdirSync(path.join(sb, 'plugins'), { recursive: true }); // a real folder, which Switchboard before 0.7.15 (on Windows before 0.7.17) never replaces with a link
  env.extra = { ...(env.extra || {}), CLAUDE_CONFIG_DIR: sb, SWITCHBOARD_CLAUDE_SOURCE_DIR: operator };
  const up = run(env, 'update', '--json');
  assert.equal(up.status, 0, up.stderr + up.stdout);
  assert.ok(Object.keys(JSON.parse(fs.readFileSync(path.join(operator, 'plugins/installed_plugins.json'), 'utf8')).plugins).includes('example-agent@passioncode'));
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).members.find((m) => m.name === 'example-agent').claude, 'plugin');
  fs.rmSync(path.join(env.home, 'claude-calls.log'));
  assert.equal(run(env, 'update', '--json').status, 0);
  assert.ok(!calls(env.home).some((c) => c.startsWith('plugin marketplace add')), 'the marketplace is not added again: ' + calls(env.home).join('; '));
});

test('PC-129: uninstall with the variable set removes an entry written without it from ~/.claude.json, never a same-named one in that folder', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const up = run(env, 'update', '--json');
  assert.equal(up.status, 0, up.stderr + up.stdout);
  const cfg = path.join(env.home, 'claude-config');
  fs.mkdirSync(cfg, { recursive: true });
  fs.writeFileSync(path.join(cfg, '.claude.json'), JSON.stringify({ mcpServers: { 'fabric-dashboards': { command: '/their/own' } } }));
  env.extra = { ...env.extra, CLAUDE_CONFIG_DIR: cfg };
  const un = run(env, 'uninstall', '--json');
  assert.equal(un.status, 0, un.stderr + un.stdout);
  assert.equal(mcpEntry(path.join(env.home, '.claude.json')), undefined, 'removed from the file it was written to');
  assert.equal(mcpEntry(path.join(cfg, '.claude.json')).command, '/their/own', "the person's own entry stays");
});

const isLink = (p) => { try { return fs.lstatSync(p).isSymbolicLink(); } catch (_) { return false; } };
for (const relative of [false, true]) test(`PC-129: a shadow moved aside through a Switchboard home goes back into the person's skills folder, even once the home is gone${relative ? ' (relative link)' : ''}`, { skip: relative && process.platform === 'win32' && 'a junction is absolute' }, () => {
  const env = setup(); // ~/.claude/skills/example-agent shadows the plugin
  const operator = path.join(env.home, '.claude');
  const sb = path.join(env.home, 'switchboard', 'claude-home');
  fs.mkdirSync(sb, { recursive: true });
  fs.symlinkSync(relative ? path.relative(sb, path.join(operator, 'skills')) : path.join(operator, 'skills'), path.join(sb, 'skills'), relative ? 'dir' : 'junction');
  fs.symlinkSync(path.join(operator, 'plugins'), path.join(sb, 'plugins'), 'junction');
  env.extra = { ...(env.extra || {}), CLAUDE_CONFIG_DIR: sb, SWITCHBOARD_CLAUDE_SOURCE_DIR: operator };
  const up = run(env, 'update', '--json');
  assert.equal(up.status, 0, up.stderr + up.stdout);
  assert.equal(fs.existsSync(path.join(operator, 'skills', 'example-agent')) || isLink(path.join(operator, 'skills', 'example-agent')), false, 'moved aside');
  fs.rmSync(sb, { recursive: true, force: true }); // the account or Switchboard is removed
  env.extra = {};
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(isLink(path.join(operator, 'skills', 'example-agent')), "back in the person's folder");
  assert.equal(fs.existsSync(sb), false, 'no folder is made where the home was');
});

test('PC-129: a person\'s own linked skills folder keeps its path: restore follows wherever the link points then', () => {
  const env = setup(); // ~/.claude/skills/example-agent shadows the plugin
  const skills = path.join(env.home, '.claude', 'skills');
  const dots = path.join(env.home, 'dots', 'skills');
  fs.mkdirSync(path.dirname(dots), { recursive: true });
  fs.renameSync(skills, dots);
  fs.symlinkSync(dots, skills, 'junction');
  assert.equal(run(env, 'update', '--json').status, 0);
  assert.equal(isLink(path.join(skills, 'example-agent')), false, 'moved aside');
  const dots2 = path.join(env.home, 'dots2', 'skills');
  fs.mkdirSync(path.dirname(dots2), { recursive: true });
  fs.renameSync(dots, dots2);
  fs.unlinkSync(skills);
  fs.symlinkSync(dots2, skills, 'junction');
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(isLink(path.join(skills, 'example-agent')), 'back in ~/.claude/skills');
  assert.equal(fs.existsSync(dots), false, 'the old target is not made again');
});

test('PC-129: through a Switchboard home, a person\'s own linked skills folder still keeps its path', () => {
  const env = setup();
  const operator = path.join(env.home, '.claude');
  const skills = path.join(operator, 'skills');
  const dots = path.join(env.home, 'dots', 'skills');
  fs.mkdirSync(path.dirname(dots), { recursive: true });
  fs.renameSync(skills, dots);
  fs.symlinkSync(dots, skills, 'junction');
  const sb = path.join(env.home, 'switchboard', 'claude-home');
  fs.mkdirSync(sb, { recursive: true });
  fs.symlinkSync(skills, path.join(sb, 'skills'), 'junction');
  fs.symlinkSync(path.join(operator, 'plugins'), path.join(sb, 'plugins'), 'junction');
  env.extra = { ...(env.extra || {}), CLAUDE_CONFIG_DIR: sb, SWITCHBOARD_CLAUDE_SOURCE_DIR: operator };
  assert.equal(run(env, 'update', '--json').status, 0);
  assert.equal(isLink(path.join(skills, 'example-agent')), false, 'moved aside');
  fs.rmSync(sb, { recursive: true, force: true });
  const dots2 = path.join(env.home, 'dots2', 'skills');
  fs.mkdirSync(path.dirname(dots2), { recursive: true });
  fs.renameSync(dots, dots2);
  fs.unlinkSync(skills);
  fs.symlinkSync(dots2, skills, 'junction');
  env.extra = {};
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(isLink(path.join(skills, 'example-agent')), 'back in ~/.claude/skills');
  assert.equal(fs.existsSync(dots), false, 'the old target is not made again');
});

test('PC-129: a person\'s own CLAUDE_CONFIG_DIR with a linked skills folder keeps its path too', () => {
  const env = setup();
  const cfg = path.join(env.home, 'claude-config');
  fs.renameSync(path.join(env.home, '.claude'), cfg);
  const skills = path.join(cfg, 'skills');
  const dots = path.join(env.home, 'dots', 'skills');
  fs.mkdirSync(path.dirname(dots), { recursive: true });
  fs.renameSync(skills, dots);
  fs.symlinkSync(dots, skills, 'junction');
  env.extra = { ...(env.extra || {}), CLAUDE_CONFIG_DIR: cfg };
  assert.equal(run(env, 'update', '--json').status, 0);
  const dots2 = path.join(env.home, 'dots2', 'skills');
  fs.mkdirSync(path.dirname(dots2), { recursive: true });
  fs.renameSync(dots, dots2);
  fs.unlinkSync(skills);
  fs.symlinkSync(dots2, skills, 'junction');
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(isLink(path.join(skills, 'example-agent')), 'back in its skills folder');
  assert.equal(fs.existsSync(dots), false, 'the old target is not made again');
});

test('a second update is idempotent: updates plugins, moves nothing', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  fs.rmSync(path.join(env.home, 'claude-calls.log'));
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.moved.length, 0);
  assert.deepEqual(out.steps.filter((s) => ['hub', 'channel', 'shadow', 'legacy', 'legacy-marketplace'].includes(s.kind)), []);
  assert.ok(calls(env.home).includes('plugin marketplace update passioncode'));
  assert.ok(calls(env.home).includes('plugin update fabric-agent-adapter@passioncode'));
});

test('restore puts back what the last update moved aside', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0);
  assert.equal(fs.readlinkSync(path.join(env.home, '.agents/skills/example-agent')), path.join(env.home, 'DATA/example-agent-agent/skills/example-agent'));
  assert.ok(fs.lstatSync(path.join(env.home, '.claude/skills/example-agent')).isSymbolicLink());
  assert.ok(fs.statSync(path.join(env.home, '.codex/skills/creating-fabric-agents')).isDirectory());
});

test('restore is repeatable and does not remove restored or newly replaced links', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  assert.equal(run(env, 'restore').status, 0);
  const hub = path.join(env.home, '.agents/skills/example-agent');
  const original = fs.readlinkSync(hub);
  const again = run(env, 'restore', '--json');
  assert.equal(again.status, 0, again.stderr);
  assert.equal(fs.readlinkSync(hub), original);
  assert.deepEqual(JSON.parse(again.stdout), []);
});

test('restore reports a conflicting user replacement and can be retried', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const hub = path.join(env.home, '.agents/skills/example-agent');
  fs.unlinkSync(hub);
  const replacement = path.resolve('/user-replacement'); // Windows reads the link back with its drive
  fs.symlinkSync(replacement, hub);
  const conflict = run(env, 'restore');
  assert.equal(conflict.status, 1);
  assert.equal(fs.readlinkSync(hub), replacement);
  assert.match(conflict.stderr, /conflict/i);
  fs.unlinkSync(hub);
  assert.equal(run(env, 'restore').status, 0);
  assert.equal(fs.readlinkSync(hub), path.join(env.home, 'DATA/example-agent-agent/skills/example-agent'));
});

test('a failure immediately after a quarantine move still leaves a recovery journal', () => {
  const env = setup();
  const L = require('../lib/launcher');
  const previous = process.env.PASSIONCODE_PAYLOAD;
  const rename = fs.renameSync;
  let injected = false;
  process.env.PASSIONCODE_PAYLOAD = env.payload;
  fs.renameSync = (from, to) => {
    const result = rename(from, to);
    if (!injected && String(to).includes(`${path.sep}quarantine${path.sep}`) && !String(to).endsWith('moved.json')) {
      injected = true;
      throw new Error('simulated interruption after move');
    }
    return result;
  };
  try {
    const r = L.update({ home: env.home, claude: { available: () => false } });
    assert.ok(r.steps.some((s) => s.error === 'simulated interruption after move'));
    const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode/state.json')));
    assert.equal(state.quarantines.length, 1);
  } finally {
    fs.renameSync = rename;
    if (previous === undefined) delete process.env.PASSIONCODE_PAYLOAD;
    else process.env.PASSIONCODE_PAYLOAD = previous;
  }
  assert.equal(run(env, 'restore').status, 0);
  assert.ok(fs.lstatSync(path.join(env.home, '.codex/skills/creating-fabric-agents')).isDirectory(), 'the entry moved when the failure occurred is recoverable');
  assert.equal(fs.readlinkSync(path.join(env.home, '.agents/skills/example-agent')), path.join(env.home, 'DATA/example-agent-agent/skills/example-agent'));
});

test('a failed release copy leaves the old release and state active', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const stateFile = path.join(env.home, '.passioncode/state.json');
  const before = fs.readFileSync(stateFile, 'utf8');
  makePayload(env.payload, '0.2.0', env.members);
  // A folder in the way that holds no manifest: the rename onto it fails on every OS (Windows replaces a plain file).
  fs.mkdirSync(path.join(env.home, '.passioncode/releases/0.2.0/stray'), { recursive: true });
  fs.writeFileSync(path.join(env.home, 'claude-calls.log'), '');
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 1);
  assert.equal(fs.readlinkSync(path.join(env.home, '.passioncode/current')), path.join(env.home, '.passioncode/releases/0.1.0'));
  assert.equal(fs.readFileSync(stateFile, 'utf8'), before);
  assert.deepEqual(calls(env.home), [], 'no plugin action after release failure');
});

test('invalid or incomplete payloads are refused before installation changes', () => {
  const cases = [
    (manifest) => { manifest.version = '../escaped'; },
    (manifest) => { manifest.members[0].name = '../outside'; },
    (manifest) => { manifest.members[1].skills = ['creating-fabric-agents']; },
    (manifest) => { manifest.members[0].skills.push('missing-skill'); },
    (manifest) => { manifest.members[0].version = '9.9.9'; },
  ];
  for (const change of cases) {
    const env = setup();
    const file = path.join(env.payload, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(file));
    change(manifest);
    fs.writeFileSync(file, JSON.stringify(manifest));
    const r = run(env, 'update');
    assert.equal(r.status, 1);
    assert.equal(fs.existsSync(path.join(env.home, '.passioncode')), false, 'no partial install from invalid payload');
    assert.deepEqual(calls(env.home), []);
  }
});

test('an existing different release is not silently reused under the same version', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  makePayload(env.payload, '0.1.0', [{ ...env.members[0], version: '0.9.0' }]);
  const r = run(env, 'update');
  assert.equal(r.status, 1);
  assert.match(r.stdout + r.stderr, /different|mismatch/i);
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).members[0].version, '0.4.0');
});

test('marketplace failure prevents legacy removal and shadow cleanup', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  fs.mkdirSync(path.join(env.home, '.claude/skills/example-agent'));
  env.extra = { FAKE_CLAUDE_FAIL: 'marketplace update passioncode' };
  fs.writeFileSync(path.join(env.home, 'claude-calls.log'), '');
  const r = run(env, 'update');
  assert.equal(r.status, 1);
  assert.ok(fs.existsSync(path.join(env.home, '.claude/skills/example-agent')));
  assert.ok(!calls(env.home).some((line) => line.startsWith('plugin update ')));
});

test('a successful plugin command must register the requested version before cleanup', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  makePayload(env.payload, '0.2.0', [{ ...env.members[0], version: '0.5.0' }, env.members[1]]);
  const shadow = path.join(env.home, '.claude/skills/creating-fabric-agents');
  fs.mkdirSync(shadow);
  env.extra = { FAKE_CLAUDE_SKIP_PLUGIN: '1' };
  const r = run(env, 'update');
  assert.equal(r.status, 1);
  assert.match(r.stdout, /did not register.*0\.5\.0/);
  assert.ok(fs.existsSync(shadow));
});

test('PC-131: an update switch turned off stays off through uninstall and a reinstall', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  assert.equal(run(env, 'config', 'set', 'update.auto', 'off').status, 0);
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).auto, false);
  assert.equal(run(env, 'update').status, 0);
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).auto, false, 'a reinstall keeps the choice (LC-14, LC-16)');
});

test('uninstall clears installed state, never reinstalls itself, keeps the update switch and is repeatable', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const channel = path.join(env.home, '.cursor/skills/example-agent');
  fs.unlinkSync(channel);
  fs.symlinkSync(path.relative(path.dirname(channel), path.join(env.home, '.agents/skills/example-agent')), channel);
  assert.equal(run(env, 'uninstall').status, 0);
  const status = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(status.installed, null);
  assert.equal(status.auto, true, 'uninstall never writes the switch (LC-16, PC-131)');
  const { decide } = require('../plugin/passioncode/hooks/update-check');
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  const after = decide({ ...state, published: true, latest: '9.9.9', maintainers: ['passioncode-ai'], publisher: 'passioncode-ai' }, ['passioncode-ai']);
  assert.equal(after.spawn, null, 'with nothing installed the session hook installs nothing');
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode/current')), false);
  assert.throws(() => fs.lstatSync(channel), { code: 'ENOENT' });
  assert.deepEqual(JSON.parse(run(env, 'uninstall', '--json').stdout), []);
  assert.equal(run(env, 'restore').status, 0, 'quarantine remains usable');
});

test('uninstall reports plugin failure and keeps the marketplace for a retry', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  env.extra = { FAKE_CLAUDE_FAIL: 'uninstall example-agent@passioncode' };
  const r = run(env, 'uninstall');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /simulated failure/);
  assert.ok(JSON.parse(fs.readFileSync(path.join(env.home, '.claude/plugins/known_marketplaces.json'))).passioncode);
  env.extra = {};
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).installed, null);
});

test('uninstall refuses a successful CLI result that leaves the plugin registered', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  env.extra = { FAKE_CLAUDE_SKIP_UNINSTALL: '1' };
  const r = run(env, 'uninstall');
  assert.equal(r.status, 1);
  assert.match(r.stderr, /remains registered/);
  assert.ok(fs.existsSync(path.join(env.home, '.passioncode/current')));
});

test('invalid state is not overwritten by mutating commands', () => {
  const env = setup();
  const file = path.join(env.home, '.passioncode/state.json');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (const bytes of ['{broken', 'null', '[]']) {
    fs.writeFileSync(file, bytes);
    for (const args of [['update'], ['restore'], ['uninstall'], ['config', 'set', 'update.auto', 'off']]) {
      const r = run(env, ...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.equal(fs.readFileSync(file, 'utf8'), bytes);
    }
    assert.equal(run(env, 'status').status, 0, 'read-only status tolerates a damaged cache');
  }
});

test('unsupported flags are rejected before uninstall or restore can mutate anything', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const before = fs.readFileSync(path.join(env.home, '.passioncode/state.json'), 'utf8');
  for (const args of [['uninstall', '--dry-run'], ['restore', '--dry-run'], ['doctor', '--dry-run'], ['update', '--dryrun'], ['status', 'extra'], ['config', 'set', 'update.auto', 'off', 'extra']]) {
    const r = run(env, ...args);
    assert.equal(r.status, 2, args.join(' '));
    assert.match(r.stderr, /arguments/i);
  }
  assert.equal(fs.readFileSync(path.join(env.home, '.passioncode/state.json'), 'utf8'), before);
  assert.ok(fs.existsSync(path.join(env.home, '.passioncode/current')));
});

test('a failed current switch never changes plugins or installation state', () => {
  const env = setup();
  fs.mkdirSync(path.join(env.home, '.passioncode/current'), { recursive: true });
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'current' && s.outcome === 'failed'));
  assert.deepEqual(calls(env.home), []);
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode/state.json')), false);
});

test('update preserves config and registry observations written while plugins run', () => {
  const env = setup();
  const L = require('../lib/launcher');
  const previous = process.env.PASSIONCODE_PAYLOAD;
  process.env.PASSIONCODE_PAYLOAD = env.payload;
  const stateFile = path.join(env.home, '.passioncode/state.json');
  try {
    const r = L.update({ home: env.home, claude: {
      available: () => true,
      run: () => {
        fs.writeFileSync(stateFile, JSON.stringify({ config: { auto: false }, latest: '0.3.0', checkedAt: '2026-10-01T12:00:00Z' }));
        return { code: 1, out: 'simulated plugin failure' };
      },
    } });
    assert.ok(r.steps.some((s) => s.outcome === 'failed'));
    const state = JSON.parse(fs.readFileSync(stateFile));
    assert.equal(state.config.auto, false);
    assert.equal(state.latest, '0.3.0');
    assert.equal(state.installed, '0.1.0');
  } finally {
    if (previous === undefined) delete process.env.PASSIONCODE_PAYLOAD;
    else process.env.PASSIONCODE_PAYLOAD = previous;
  }
});

test('status prefers the active release over stale bookkeeping', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const file = path.join(env.home, '.passioncode/state.json');
  fs.writeFileSync(file, JSON.stringify({ installed: '0.0.1' }));
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).installed, '0.1.0');
});

test('update follows an existing symlinked agent channel', () => {
  const env = setup();
  fs.rmdirSync(path.join(env.home, '.cursor/skills'));
  const target = path.join(env.home, 'shared-skills');
  fs.mkdirSync(target);
  fs.symlinkSync(target, path.join(env.home, '.cursor/skills'));
  assert.equal(run(env, 'update').status, 0);
  assert.equal(fs.readlinkSync(path.join(target, 'example-agent')), path.join(env.home, '.agents/skills/example-agent'));
});

test('a failed plugin install keeps the legacy plugin and the shadow, and reports the failure', () => {
  const env = setup();
  env.extra = { FAKE_CLAUDE_FAIL: 'install fabric-agent-adapter@passioncode' };
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 1);
  const out = JSON.parse(r.stdout);
  assert.ok(out.steps.some((s) => s.outcome === 'failed' && s.detail.includes('fabric-agent-adapter@passioncode')));
  assert.ok(!calls(env.home).includes('plugin uninstall fabric-agent-adapter@fabric-agent-adapter'), 'the only working copy is not removed');
  assert.equal(fs.existsSync(path.join(env.home, '.claude/skills/example-agent')), false, 'the other member still proceeds');
});

test('dry run changes nothing', () => {
  const env = setup();
  const r = run(env, 'update', '--dry-run', '--json');
  assert.equal(r.status, 0);
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode')), false);
  assert.ok(fs.lstatSync(path.join(env.home, '.claude/skills/example-agent')).isSymbolicLink());
  assert.ok(JSON.parse(r.stdout).steps.every((s) => s.outcome === 'planned' || (s.kind === 'mcp' && s.outcome === 'skipped')), 'nothing to apply is planned; a missing Fabric Dashboards MCP is only reported');
  const text = run(env, 'update', '--dry-run');
  assert.match(text.stdout, /nothing was changed/);
  assert.doesNotMatch(text.stdout, /: done\./);
});

test('without Claude Code the other agents are still served', () => {
  const env = setup();
  env.extra = { PASSIONCODE_CLAUDE: path.join(env.home, 'no-such-claude') };
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stdout);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'claude' && s.outcome === 'skipped'));
  assert.ok(fs.lstatSync(path.join(env.home, '.cursor/skills/example-agent')).isSymbolicLink());
  assert.ok(fs.lstatSync(path.join(env.home, '.claude/skills/example-agent')).isSymbolicLink(), 'no plugin was verified, so the entry Claude reads is kept');
});

test('status and config', () => {
  const env = setup();
  run(env, 'update');
  const s = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(s.installed, '0.1.0');
  assert.deepEqual(s.members.map((m) => [m.name, m.claude, m.shadows.length]), [['fabric-agent-adapter', 'plugin', 0], ['example-agent', 'plugin', 0]]);
  assert.equal(run(env, 'config', 'set', 'update.auto', 'off').status, 0);
  assert.equal(JSON.parse(run(env, 'status', '--json').stdout).auto, false);
  assert.equal(run(env, 'config', 'set', 'update.auto', 'maybe').status, 1);
});

test('status reads the installed release, not the package payload it is run from', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  // The CLI now runs from a checkout whose payload/ is older and lists other members.
  const stale = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-stale-'));
  makePayload(stale, '0.0.9', [{ name: 'fabric-agent-adapter', version: '0.3.0', skills: ['creating-fabric-agents'] }]);
  env.payload = stale;
  const s = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(s.installed, '0.1.0');
  assert.equal(s.package, '0.0.9', 'the payload this CLI would install is still reported, as the package');
  assert.equal(s.source, 'installed');
  assert.deepEqual(s.members.map((m) => [m.name, m.version, m.hub.filter((h) => h.ok).length, m.hub.length]),
    [['fabric-agent-adapter', '0.4.0', 2, 2], ['example-agent', '0.1.0', 1, 1]], 'members, versions and hub links of what is installed');
  const text = run(env, 'status').stdout;
  assert.match(text, /installed 0\.1\.0 · package 0\.0\.9/);
  assert.match(text, /example-agent\s+0\.1\.0\s+claude: plugin · hub: 1\/1/);
});

test('status before any install describes the package payload', () => {
  const env = setup();
  const s = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(s.installed, null);
  assert.equal(s.source, 'package');
  assert.deepEqual(s.members.map((m) => m.name), ['fabric-agent-adapter', 'example-agent']);
});

test('status labels cached npm observations without changing state or probing npm', () => {
  const env = setup();
  const stateFile = path.join(env.home, '.passioncode/state.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  const fakeBin = path.join(env.home, 'bin');
  fs.mkdirSync(fakeBin);
  fs.writeFileSync(path.join(fakeBin, 'npm'), '#!/bin/sh\necho called > "$HOME/npm-called"\nexit 1\n', { mode: 0o755 });
  env.extra = { PATH: `${fakeBin}${path.delimiter}${process.env.PATH}` };
  const checkedAt = '2026-09-30T13:22:11.000Z';
  const cases = [
    { latest: '0.1.10', checkedAt, expected: `npm latest (cached) 0.1.10 (checked ${checkedAt}; stale: older than installed)` },
    { latest: '0.1.9', checkedAt, expected: `npm latest (cached) 0.1.9 (checked ${checkedAt}; stale: older than installed)` },
    { latest: '0.1.14', checkedAt, expected: `npm latest (cached) 0.1.14 (checked ${checkedAt})` },
    { latest: '0.1.15', checkedAt, expected: `npm latest (cached) 0.1.15 (checked ${checkedAt})` },
    { latest: '0.1.14', expected: 'npm latest (cached) 0.1.14 (check time unknown)' },
    { latest: '0.1.14', checkedAt: 'invalid', expected: 'npm latest (cached) 0.1.14 (check time unknown)' },
    // PC-131: the hook refused the cached latest; a refusal of an earlier version is not news.
    { latest: '0.1.15', checkedAt, refusalLogged: '0.1.15 registry_signature', refused: 'registry_signature', expected: `npm latest (cached) 0.1.15 (checked ${checkedAt}; not installed automatically: its signature does not verify)` },
    { latest: '0.1.15', checkedAt, refusalLogged: '0.1.15 provenance', refused: 'provenance', expected: `npm latest (cached) 0.1.15 (checked ${checkedAt}; not installed automatically: no build provenance)` },
    { latest: '0.1.14', checkedAt, refusalLogged: '0.1.14 provenance', expected: `npm latest (cached) 0.1.14 (checked ${checkedAt})`, note: 'installed by hand since: no longer refused' },
    // A newer latest than the refused version: that refusal is not this version's.
    { latest: '0.1.16', checkedAt, refusalLogged: '0.1.15 provenance', expected: `npm latest (cached) 0.1.16 (checked ${checkedAt})` },
    // The last check failed (no latest): the standing refusal is still shown.
    { latest: undefined, refusalLogged: '0.1.15 provenance', expected: 'npm latest: not checked', note: 'an unpublished name answered: not a failed check' },
    { latest: undefined, checkError: 'ETIMEDOUT', refusalLogged: '0.1.15 provenance', refused: 'provenance', expected: 'npm latest: not checked (last check failed; 0.1.15 not installed automatically: no build provenance)' },
    { latest: '0.1.15', checkedAt, refusalLogged: '0.1.10 provenance', expected: `npm latest (cached) 0.1.15 (checked ${checkedAt})` },
    // PC-143: a check that found no npm beside this Node names that cause.
    { latest: undefined, checkError: 'npm-missing', expected: 'npm latest: not checked (no npm beside this Node)' },
    { latest: undefined, checkError: 'npm-missing', refusalLogged: '0.1.15 provenance', refused: 'provenance', expected: 'npm latest: not checked (no npm beside this Node; 0.1.15 not installed automatically: no build provenance)' },
  ];
  for (const c of cases) {
    const state = { installed: '0.1.14', latest: c.latest, checkedAt: c.checkedAt, config: { auto: false }, ...(c.refusalLogged ? { refusalLogged: c.refusalLogged } : {}), ...(c.checkError ? { checkError: c.checkError } : {}) };
    const bytes = JSON.stringify(state, null, 2) + '\n';
    fs.writeFileSync(stateFile, bytes);
    const text = run(env, 'status');
    assert.equal(text.status, 0, text.stderr);
    assert.equal(text.stdout.split('\n')[0], `installed 0.1.14 · package 0.1.0 · ${c.expected} · auto-update off`);
    const json = run(env, 'status', '--json');
    assert.equal(json.status, 0, json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.latest, c.latest === undefined ? null : c.latest);
    assert.equal(parsed.checkedAt, c.checkedAt || null);
    assert.equal(parsed.refused, c.refused || null);
    assert.equal(parsed.npmMissing, c.checkError === 'npm-missing');
    assert.equal(fs.readFileSync(stateFile, 'utf8'), bytes, 'both status formats leave saved state untouched');
    assert.equal(fs.existsSync(path.join(env.home, 'npm-called')), false, 'status must not run an npm probe');
  }
});

test('status reports an absent npm observation without inventing a check time', () => {
  const env = setup();
  const text = run(env, 'status');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /npm latest: not checked/);
  assert.doesNotMatch(text.stdout, /\(cached\)|checked \d{4}/);
  const json = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(json.latest, null);
  assert.equal(json.checkedAt, null);
});

test('vendor refuses credential-shaped strings', async () => {
  const { scanForSecrets } = await import(require('url').pathToFileURL(path.join(ROOT, 'scripts/vendor.mjs')).href);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-scan-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'Use sk-or-v1-' + 'a'.repeat(40) + ' to call the model.');
  fs.writeFileSync(path.join(dir, 'ok.md'), 'Read the key from the vault by name.');
  const hits = scanForSecrets(dir);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /SKILL\.md/);
});

// The legacy marketplace as this machine had it on 2026-09-29: registered, declared in
// settings.json with autoUpdate, beside the person's own settings and marketplaces.
const LEGACY_SOURCE = { source: 'github', repo: 'passioncode-ai/fabric-agent-adapter' };
function withLegacyMarketplace(env, { alsoInstalled = [] } = {}) {
  const plugins = path.join(env.home, '.claude/plugins');
  fs.writeFileSync(path.join(plugins, 'known_marketplaces.json'), JSON.stringify({
    'fabric-agent-adapter': { source: LEGACY_SOURCE, installLocation: path.join(plugins, 'marketplaces/fabric-agent-adapter'), lastUpdated: '2026-08-27T14:19:25.159Z', autoUpdate: true },
    'someone-else': { source: { source: 'github', repo: 'someone/else' }, installLocation: '/x', lastUpdated: '2026-08-01T00:00:00.000Z' },
  }, null, 2));
  const installed = JSON.parse(fs.readFileSync(path.join(plugins, 'installed_plugins.json'), 'utf8'));
  for (const id of alsoInstalled) installed.plugins[id] = [{ installPath: '/other' }];
  fs.writeFileSync(path.join(plugins, 'installed_plugins.json'), JSON.stringify(installed));
  const settings = { theme: 'dark', enabledPlugins: { 'fabric-agent-adapter@fabric-agent-adapter': true }, extraKnownMarketplaces: { 'fabric-agent-adapter': { source: LEGACY_SOURCE, autoUpdate: true }, 'someone-else': { source: { source: 'github', repo: 'someone/else' } } } };
  fs.writeFileSync(path.join(env.home, '.claude/settings.json'), JSON.stringify(settings, null, 2));
  fs.writeFileSync(path.join(env.home, 'fake-marketplace-names.json'), JSON.stringify({ 'passioncode-ai/fabric-agent-adapter': 'fabric-agent-adapter' }));
  return settings;
}
const known = (home) => JSON.parse(fs.readFileSync(path.join(home, '.claude/plugins/known_marketplaces.json'), 'utf8'));
const settingsOf = (home) => JSON.parse(fs.readFileSync(path.join(home, '.claude/settings.json'), 'utf8'));

test('a legacy marketplace is retired only after its replacement is verified, and restore brings it back', () => {
  const env = setup();
  const before = withLegacyMarketplace(env);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const c = calls(env.home);
  const at = (line) => c.indexOf(line);
  assert.ok(at('plugin marketplace remove fabric-agent-adapter') > at('plugin install fabric-agent-adapter@passioncode'), 'removed after the replacement is installed');
  assert.ok(at('plugin marketplace remove fabric-agent-adapter') > at('plugin uninstall fabric-agent-adapter@fabric-agent-adapter'), 'and after the legacy plugin is gone');
  assert.equal(known(env.home)['fabric-agent-adapter'], undefined);
  assert.ok(known(env.home)['someone-else'], 'another marketplace is untouched');
  const after = settingsOf(env.home);
  assert.equal(after.extraKnownMarketplaces['fabric-agent-adapter'], undefined, 'Claude Code will not re-register it from settings');
  assert.deepEqual(after.extraKnownMarketplaces['someone-else'], before.extraKnownMarketplaces['someone-else']);
  assert.equal(after.theme, 'dark', 'the rest of settings.json is kept');
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode/state.json'), 'utf8'));
  const moved = JSON.parse(fs.readFileSync(path.join(state.quarantines[0], 'moved.json'), 'utf8'));
  const record = moved.find((m) => m.kind === 'marketplace');
  assert.deepEqual({ name: record.name, source: record.source, settingsEntry: record.settingsEntry }, { name: 'fabric-agent-adapter', source: LEGACY_SOURCE, settingsEntry: { source: LEGACY_SOURCE, autoUpdate: true } });
  const backup = JSON.parse(fs.readFileSync(record.settingsBackup, 'utf8'));
  assert.deepEqual(backup.extraKnownMarketplaces['fabric-agent-adapter'], before.extraKnownMarketplaces['fabric-agent-adapter'], 'settings.json as it was before the change is kept in the quarantine');
  assert.equal(backup.theme, 'dark');

  const back = run(env, 'restore', '--json');
  assert.equal(back.status, 0, back.stderr);
  assert.ok(JSON.parse(back.stdout).includes('marketplace fabric-agent-adapter'));
  assert.ok(calls(env.home).includes('plugin marketplace add passioncode-ai/fabric-agent-adapter'));
  assert.deepEqual(known(env.home)['fabric-agent-adapter'].source, LEGACY_SOURCE, 'registered again');
  assert.deepEqual(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], { source: LEGACY_SOURCE, autoUpdate: true }, 'declared again as it was, autoUpdate included');
});

test('PC-120: retiring and restoring a legacy marketplace writes a linked settings.json where it points, keeping its mode', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const env = setup();
  withLegacyMarketplace(env);
  const file = path.join(env.home, '.claude/settings.json');
  const real = path.join(env.home, 'dotfiles', 'claude-settings.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.renameSync(file, real);
  fs.chmodSync(real, 0o600);
  fs.symlinkSync(path.relative(path.dirname(file), real), file);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'the link is kept');
  assert.equal(fs.statSync(real).mode & 0o777, 0o600, 'the file it points at keeps its mode');
  assert.equal(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], undefined, 'the change reached the file the link points at');
  assert.deepEqual(fs.readdirSync(path.dirname(real)), ['claude-settings.json'], 'no temporary file is left');
  assert.equal(run(env, 'restore', '--json').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'restore keeps the link too');
  assert.equal(fs.statSync(real).mode & 0o777, 0o600);
  assert.deepEqual(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], { source: LEGACY_SOURCE, autoUpdate: true });
});

test('PC-120: a linked settings.json whose folder cannot be written fails the retirement and keeps everything', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root writes anyway') }, () => {
  const env = setup();
  withLegacyMarketplace(env);
  const file = path.join(env.home, '.claude/settings.json');
  const dir = path.join(env.home, 'locked');
  fs.mkdirSync(dir);
  fs.renameSync(file, path.join(dir, 'settings.json'));
  fs.symlinkSync(path.join(dir, 'settings.json'), file);
  fs.chmodSync(dir, 0o555);
  try {
    const r = run(env, 'update', '--json');
    assert.equal(r.status, 1, r.stdout);
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.deepEqual(fs.readdirSync(dir), ['settings.json'], 'no temporary file is left');
    assert.ok(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], 'the entry stays declared');
    assert.ok(known(env.home)['fabric-agent-adapter'], 'and registered');
  } finally { fs.chmodSync(dir, 0o755); }
});

test('a machine that already lost the legacy plugin still loses the leftover marketplace', () => {
  const env = setup();
  fs.writeFileSync(path.join(env.home, '.claude/plugins/installed_plugins.json'), JSON.stringify({ version: 2, plugins: {} })); // what 0.1.1 left
  withLegacyMarketplace(env);
  assert.equal(run(env, 'update').status, 0);
  assert.ok(calls(env.home).includes('plugin marketplace remove fabric-agent-adapter'));
  assert.equal(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], undefined);
});

test('a failed install keeps the legacy marketplace registered and declared', () => {
  const env = setup();
  withLegacyMarketplace(env);
  const bytes = fs.readFileSync(path.join(env.home, '.claude/settings.json'), 'utf8');
  env.extra = { FAKE_CLAUDE_FAIL: 'install fabric-agent-adapter@passioncode' };
  assert.equal(run(env, 'update').status, 1);
  assert.ok(!calls(env.home).some((l) => l.startsWith('plugin marketplace remove fabric-agent-adapter')));
  assert.ok(known(env.home)['fabric-agent-adapter']);
  assert.deepEqual(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], JSON.parse(bytes).extraKnownMarketplaces['fabric-agent-adapter']);
});

test('a marketplace still serving another installed plugin is left alone', () => {
  const env = setup();
  withLegacyMarketplace(env, { alsoInstalled: ['fabric-extras@fabric-agent-adapter'] });
  const bytes = fs.readFileSync(path.join(env.home, '.claude/settings.json'), 'utf8');
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stdout);
  assert.ok(!calls(env.home).some((l) => l.startsWith('plugin marketplace remove fabric-agent-adapter')));
  assert.ok(known(env.home)['fabric-agent-adapter']);
  assert.deepEqual(settingsOf(env.home).extraKnownMarketplaces['fabric-agent-adapter'], JSON.parse(bytes).extraKnownMarketplaces['fabric-agent-adapter']);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'legacy-marketplace' && s.outcome === 'skipped' && s.detail.includes('fabric-extras@fabric-agent-adapter')));
  const st = JSON.parse(run(env, 'status', '--json').stdout);
  assert.deepEqual(st.members.find((m) => m.name === 'fabric-agent-adapter').legacyMarketplaces, ['fabric-agent-adapter'], 'status names the leftover');
});

test('an unreadable settings.json keeps the legacy marketplace', () => {
  const env = setup();
  withLegacyMarketplace(env);
  fs.writeFileSync(path.join(env.home, '.claude/settings.json'), '{ "theme": "dark", // a comment\n}');
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'legacy-marketplace' && s.outcome === 'failed'));
  assert.ok(!calls(env.home).some((l) => l.startsWith('plugin marketplace remove fabric-agent-adapter')));
  assert.equal(fs.readFileSync(path.join(env.home, '.claude/settings.json'), 'utf8'), '{ "theme": "dark", // a comment\n}');
});

test('dry run plans the marketplace retirement and changes nothing', () => {
  const env = setup();
  withLegacyMarketplace(env);
  const settingsBytes = fs.readFileSync(path.join(env.home, '.claude/settings.json'), 'utf8');
  const knownBytes = fs.readFileSync(path.join(env.home, '.claude/plugins/known_marketplaces.json'), 'utf8');
  const r = run(env, 'update', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stdout);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'legacy-marketplace' && s.outcome === 'planned'), 'the legacy plugin planned for removal does not count as serving');
  assert.equal(fs.readFileSync(path.join(env.home, '.claude/settings.json'), 'utf8'), settingsBytes);
  assert.equal(fs.readFileSync(path.join(env.home, '.claude/plugins/known_marketplaces.json'), 'utf8'), knownBytes);
  assert.ok(!calls(env.home).some((l) => l.startsWith('plugin marketplace remove') || l.startsWith('plugin uninstall')));
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode')), false);
});

// The Fabric Dashboards MCP registration. `run` points the launcher at a missing binary
// by default, so these tests bring their own; agent presence is a config file or a
// config directory under the temp HOME, the way the launcher detects it.
function withFakeMcp(env) {
  const bin = path.join(env.home, 'fake-app', 'fabric-dashboards-mcp');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, '#!/bin/sh\n');
  env.extra = { ...(env.extra || {}), PASSIONCODE_FABRIC_DASHBOARDS_MCP: bin };
  return bin;
}
const mcpEntry = (file) => JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers['fabric-dashboards'];
const CODEX_CONF = '[model]\nprovider = "openai"\n\n["mcp_servers"."other"]\ncommand = "/bin/other"\nargs = ["--x"]\n';

function withAgents(env, { codexConf = CODEX_CONF } = {}) {
  // Claude Code's ~/.claude.json exists from its first run; the launcher never invents it.
  fs.writeFileSync(path.join(env.home, '.claude.json'), JSON.stringify({ mcpServers: { someone: { command: '/bin/someone' } } }, null, 2));
  if (codexConf !== null) fs.writeFileSync(path.join(env.home, '.codex', 'config.toml'), codexConf); // setup() made ~/.codex
  fs.mkdirSync(path.join(env.home, '.gemini'), { recursive: true });
  fs.mkdirSync(path.join(env.home, '.kimi-code'), { recursive: true });
}

test('update registers the Fabric Dashboards MCP server for every agent that is present', () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const out = JSON.parse(r.stdout);
  assert.equal(out.steps.filter((s) => s.kind === 'mcp' && s.outcome === 'done').length, 4);
  assert.deepEqual(mcpEntry(path.join(env.home, '.claude.json')), { type: 'stdio', command: bin, args: [], env: {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers.someone, { command: '/bin/someone' }, 'other servers are kept');
  const toml = fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.startsWith(CODEX_CONF), 'the rest of config.toml is untouched');
  assert.match(toml, /\["mcp_servers"\."fabric-dashboards"\]\ncommand = "[^"]+"\nargs = \[\]\n$/);
  assert.ok(toml.includes(`command = ${JSON.stringify(bin)}`));
  assert.deepEqual(mcpEntry(path.join(env.home, '.gemini', 'settings.json')), { command: bin, args: [], env: {} }, 'a missing config under a present agent is created');
  assert.deepEqual(mcpEntry(path.join(env.home, '.kimi-code', 'mcp.json')), { command: bin, args: [], env: {} });
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.equal(state.mcpRegistrations.length, 4);
  const moved = JSON.parse(fs.readFileSync(path.join(state.quarantines[0], 'moved.json'), 'utf8'));
  const mcpMoves = moved.filter((m) => m.kind === 'mcp');
  assert.equal(mcpMoves.length, 4);
  const claudeRecord = mcpMoves.find((m) => m.agent === 'Claude Code');
  assert.equal(claudeRecord.via, 'claude', 'Claude Code registers through its own CLI, never by rewriting ~/.claude.json');
  assert.ok(calls(env.home).includes(`mcp add --scope user fabric-dashboards -- ${bin}`), calls(env.home).join('\n'));
  const geminiRecord = mcpMoves.find((m) => m.agent === 'Gemini CLI');
  assert.equal(geminiRecord.backup, null, 'a file the launcher created has nothing to back up');
  const codexRecord = mcpMoves.find((m) => m.agent === 'Codex CLI');
  assert.equal(fs.readFileSync(codexRecord.backup, 'utf8'), CODEX_CONF);
});

test('MCP registration is idempotent: a second update changes nothing', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const files = ['.claude.json', '.codex/config.toml', '.gemini/settings.json', '.kimi-code/mcp.json'].map((f) => path.join(env.home, f));
  const before = files.map((f) => fs.readFileSync(f, 'utf8'));
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const mcp = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.ok(mcp.length === 4 && mcp.every((s) => s.outcome === 'skipped' && s.detail.includes('already runs')), JSON.stringify(mcp));
  assert.deepEqual(files.map((f) => fs.readFileSync(f, 'utf8')), before);
});

test('a foreign fabric-dashboards entry is reported and kept, not rewritten', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const claudeJson = { mcpServers: { 'fabric-dashboards': { command: '/elsewhere/mcp', args: ['--mine'] } } };
  fs.writeFileSync(path.join(env.home, '.claude.json'), JSON.stringify(claudeJson));
  const toml = `${CODEX_CONF}\n["mcp_servers"."fabric-dashboards"]\ncommand = "/elsewhere/mcp"\nargs = []\n`;
  fs.writeFileSync(path.join(env.home, '.codex', 'config.toml'), toml);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const kept = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('it was kept'));
  assert.equal(kept.length, 2, JSON.stringify(JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')), claudeJson);
  assert.equal(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8'), toml);
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.equal(state.mcpRegistrations.length, 2, 'only the two the launcher added are recorded');
});

test('without the Fabric Dashboards binary nothing is registered', () => {
  const env = setup(); // run() points at a missing binary by default
  withAgents(env);
  const before = fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8');
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const mcp = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.equal(mcp.length, 1);
  assert.equal(mcp[0].outcome, 'skipped');
  assert.match(mcp[0].detail, /no Fabric Dashboards MCP/);
  assert.equal(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(env.home, '.gemini', 'settings.json')), false);
});

test('an agent that is not on the machine gets no registration and no invented config', () => {
  const env = setup();
  withFakeMcp(env);
  // Only Codex is present (setup() made ~/.codex); no Claude Code CLI, ~/.gemini or ~/.kimi-code.
  env.extra.PASSIONCODE_CLAUDE = path.join(env.home, 'no-claude');
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const mcp = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.equal(mcp.filter((s) => s.outcome === 'done').length, 1);
  assert.equal(mcp.filter((s) => s.outcome === 'skipped' && s.detail.includes('not found')).length, 3);
  assert.equal(fs.existsSync(path.join(env.home, '.claude.json')), false);
  assert.equal(fs.existsSync(path.join(env.home, '.gemini', 'settings.json')), false);
  assert.equal(fs.existsSync(path.join(env.home, '.kimi-code')), false);
  assert.ok(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8').includes('["mcp_servers"."fabric-dashboards"]'));
});

test('restore removes the MCP registrations the last update added', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const notes = JSON.parse(r.stdout);
  assert.equal(notes.filter((n) => n.includes('fabric-dashboards') && n.includes('removed')).length, 4, JSON.stringify(notes));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')), { mcpServers: { someone: { command: '/bin/someone' } } });
  assert.equal(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8'), CODEX_CONF, 'the added table is gone and the rest is byte-identical');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.gemini', 'settings.json'), 'utf8')).mcpServers, {});
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.kimi-code', 'mcp.json'), 'utf8')).mcpServers, {});
});

test('PC-120: a linked Gemini settings file stays a link with its mode through MCP registration and its removal', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  const file = path.join(env.home, '.gemini', 'settings.json');
  const real = path.join(env.home, 'dotfiles', 'gemini.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, JSON.stringify({ theme: 'dark', mcpServers: { other: { command: '/bin/other' } } }, null, 2));
  fs.chmodSync(real, 0o600);
  fs.symlinkSync(real, file);
  assert.equal(run(env, 'update').status, 0);
  const quarantine = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8')).quarantines[0];
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(quarantine, 'settings.json.before-mcp-gemini-cli'), 'utf8')).mcpServers, { other: { command: '/bin/other' } }, 'the file as it was is kept first');
  assert.deepEqual(JSON.parse(fs.readFileSync(real, 'utf8')).mcpServers.other, { command: '/bin/other' }, 'another server is kept');
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'registration keeps the link');
  assert.equal(fs.statSync(real).mode & 0o777, 0o600);
  assert.deepEqual(mcpEntry(real), { command: bin, args: [], env: {} });
  assert.equal(JSON.parse(fs.readFileSync(real, 'utf8')).theme, 'dark');
  assert.equal(run(env, 'restore').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'removal keeps the link');
  assert.equal(fs.statSync(real).mode & 0o777, 0o600);
  assert.deepEqual(JSON.parse(fs.readFileSync(real, 'utf8')).mcpServers, { other: { command: '/bin/other' } });
});

test('PC-120: a Gemini settings link to a missing file is kept, and the file is made where it points', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  const file = path.join(env.home, '.gemini', 'settings.json');
  const real = path.join(env.home, 'dotfiles', 'gemini.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.symlinkSync(real, file);
  assert.equal(run(env, 'update').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink());
  assert.equal(fs.statSync(real).mode & 0o777, 0o600);
  assert.deepEqual(mcpEntry(real), { command: bin, args: [], env: {} });
  assert.equal(run(env, 'restore').status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(real, 'utf8')).mcpServers, {});
});

test('PC-126: a linked 0640 Codex config.toml stays a link with its mode through update, restore and uninstall', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const file = path.join(env.home, '.codex', 'config.toml');
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.chmodSync(real, 0o640); // not the 0600 a new file gets, so the kept mode is the file's own
  fs.symlinkSync(real, file);
  const holds = () => fs.readFileSync(real, 'utf8').includes('["mcp_servers"."fabric-dashboards"]');
  assert.equal(run(env, 'update').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'registration keeps the link');
  assert.equal(fs.statSync(real).mode & 0o777, 0o640, 'and the mode');
  assert.ok(holds(), 'the entry lands where the link points');
  assert.equal(run(env, 'restore').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'removal keeps the link');
  assert.equal(fs.statSync(real).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF, 'the entry is gone and the rest is byte-identical');
  assert.equal(run(env, 'update').status, 0);
  assert.ok(holds());
  assert.equal(run(env, 'uninstall').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'uninstall keeps the link');
  assert.equal(fs.statSync(real).mode & 0o777, 0o640);
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF);
});

test('PC-126: a Codex config.toml linked into a folder that cannot be written fails that registration and keeps the link', { skip: process.platform === 'win32' && 'POSIX modes' || (process.getuid && process.getuid() === 0 && 'root writes a locked folder') }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const file = path.join(env.home, '.codex', 'config.toml');
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.symlinkSync(real, file);
  fs.chmodSync(path.dirname(real), 0o555);
  let r;
  try { r = run(env, 'update', '--json'); } finally { fs.chmodSync(path.dirname(real), 0o755); }
  assert.equal(r.status, 1);
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp');
  assert.ok(steps.some((s) => s.outcome === 'failed' && s.detail.includes('Codex CLI')), JSON.stringify(steps));
  assert.equal(steps.filter((s) => s.outcome === 'done').length, 3, 'the other agents are still registered');
  assert.ok(fs.lstatSync(file).isSymbolicLink(), 'the link is kept');
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF);
  assert.deepEqual(fs.readdirSync(path.dirname(real)), ['codex.toml'], 'the folder holds only the original file');
});

test('PC-126: an entry a person declares after a failed registration is never taken out by restore', { skip: process.platform === 'win32' && 'POSIX modes' || (process.getuid && process.getuid() === 0 && 'root writes a locked folder') }, () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.symlinkSync(real, path.join(env.home, '.codex', 'config.toml'));
  fs.chmodSync(path.dirname(real), 0o555);
  try { assert.equal(run(env, 'update').status, 1); } finally { fs.chmodSync(path.dirname(real), 0o755); }
  const mine = `${CODEX_CONF}\n["mcp_servers"."fabric-dashboards"]\ncommand = ${JSON.stringify(bin)}\nargs = []\n`;
  fs.writeFileSync(real, mine);
  const second = run(env, 'update');
  assert.equal(second.status, 0, second.stderr);
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!JSON.parse(r.stdout).some((n) => n.includes('Codex CLI')), r.stdout);
  assert.equal(fs.readFileSync(real, 'utf8'), mine, 'the hand-written table stays');
});

test('PC-126: an update whose only change is a failed registration saves no recovery entry and keeps the batch before it', { skip: process.platform === 'win32' && 'POSIX modes' || (process.getuid && process.getuid() === 0 && 'root writes a locked folder') }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.symlinkSync(real, path.join(env.home, '.codex', 'config.toml'));
  fs.chmodSync(path.dirname(real), 0o555);
  let second;
  try {
    assert.equal(run(env, 'update').status, 1);
    second = run(env, 'update');
  } finally { fs.chmodSync(path.dirname(real), 0o755); }
  assert.equal(second.status, 1);
  assert.doesNotMatch(second.stdout, /recovery entry|passioncode restore/);
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.deepEqual(fs.readdirSync(path.join(env.home, '.passioncode', 'quarantine')).map((d) => path.join(env.home, '.passioncode', 'quarantine', d)), state.quarantines, 'the failed-only batch left no folder (nor its copy of config.toml)');
  assert.equal(run(env, 'restore').status, 0);
  assert.equal(fs.readlinkSync(path.join(env.home, '.agents/skills/example-agent')), path.join(env.home, 'DATA/example-agent-agent/skills/example-agent'), 'the first batch is still the one restore reads');
});

test('PC-126: a failed registration journalled by an earlier version does not take out an entry declared by hand', { skip: process.platform === 'win32' && 'POSIX modes' || (process.getuid && process.getuid() === 0 && 'root writes a locked folder') }, () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.symlinkSync(real, path.join(env.home, '.codex', 'config.toml'));
  fs.chmodSync(path.dirname(real), 0o555);
  try { assert.equal(run(env, 'update').status, 1); } finally { fs.chmodSync(path.dirname(real), 0o755); }
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  const journal = path.join(state.quarantines.at(-1), 'moved.json');
  fs.writeFileSync(journal, JSON.stringify(JSON.parse(fs.readFileSync(journal, 'utf8')).map(({ failedAt, ...e }) => e))); // the 0.2.75 shape
  const mine = `${CODEX_CONF}\n["mcp_servers"."fabric-dashboards"]\ncommand = ${JSON.stringify(bin)}\nargs = []\n`;
  fs.writeFileSync(real, mine);
  assert.equal(run(env, 'update').status, 0);
  assert.equal(run(env, 'restore').status, 0);
  assert.equal(fs.readFileSync(real, 'utf8'), mine, 'restore takes out only what an update recorded as registered');
});

test('PC-126: a registration is recorded as soon as it is written, so an update killed later leaves it removable', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  // Stop the process right after the first state write that follows the Codex write.
  const preload = path.join(env.home, 'die-after-codex.js');
  fs.writeFileSync(preload, `const fs = require('fs'); const rename = fs.renameSync; let codex = false;
fs.renameSync = function (from, to) { rename.call(fs, from, to);
  if (String(to).endsWith('config.toml')) codex = true;
  else if (codex && String(to).endsWith('state.json')) process.exit(9); };\n`);
  env.extra = { ...env.extra, NODE_OPTIONS: `--require ${preload}` };
  assert.equal(run(env, 'update').status, 9);
  delete env.extra.NODE_OPTIONS;
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.ok((state.mcpRegistrations || []).some((r) => r.agent === 'Codex CLI'), JSON.stringify(state.mcpRegistrations));
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8'), CODEX_CONF, 'uninstall still removes it');
});

test('PC-126: a Codex config.toml the launcher creates is private', { skip: process.platform === 'win32' && 'POSIX modes' }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const file = path.join(env.home, '.codex', 'config.toml');
  assert.equal(fs.existsSync(file), false);
  assert.equal(run(env, 'update').status, 0);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

// A Codex config.toml linked into a folder the launcher cannot write: the removal fails for that entry only.
function lockedCodexLink(env) {
  withFakeMcp(env);
  withAgents(env, { codexConf: null });
  const file = path.join(env.home, '.codex', 'config.toml');
  const real = path.join(env.home, 'dotfiles', 'codex.toml');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, CODEX_CONF);
  fs.symlinkSync(real, file);
  assert.equal(run(env, 'update').status, 0);
  fs.chmodSync(path.dirname(real), 0o555);
  return { file, real, unlock: () => fs.chmodSync(path.dirname(real), 0o755) };
}
const lockSkip = (process.platform === 'win32' && 'POSIX modes') || (process.getuid && process.getuid() === 0 && 'root writes a locked folder');

test('PC-127: restore keeps an MCP entry it cannot remove, puts back the rest, and removes it on the next run', { skip: lockSkip }, () => {
  const env = setup();
  const { file, real, unlock } = lockedCodexLink(env);
  try {
    const r = run(env, 'restore', '--json');
    assert.equal(r.status, 1, 'a partial restore is not a success');
    assert.ok(r.stderr.includes(`Restore incomplete: ${file}: fabric-dashboards for Codex CLI could not be removed`), r.stderr);
    assert.match(r.stderr, /folder it points into\) and run restore again; once any update has run since, delete the entry by hand/);
    const notes = JSON.parse(r.stdout);
    assert.ok(notes.some((n) => n.includes('for Gemini CLI removed from')), 'what it did is still shown: ' + JSON.stringify(notes));
    const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
    assert.deepEqual(state.mcpRegistrations.map((m) => m.agent), ['Codex CLI'], 'the kept entry stays recorded');
    const journal = JSON.parse(fs.readFileSync(path.join(state.quarantines.at(-1), 'moved.json'), 'utf8'));
    assert.deepEqual(journal.filter((e) => !e.restoredAt).map((e) => e.agent), ['Codex CLI'], 'and unrestored in the journal');
    assert.equal(mcpEntry(path.join(env.home, '.gemini', 'settings.json')), undefined, 'the other agents are still cleaned');
    assert.equal(fs.readlinkSync(path.join(env.home, '.agents/skills/example-agent')), path.join(env.home, 'DATA/example-agent-agent/skills/example-agent'), 'quarantined skills still come back');
    assert.ok(fs.lstatSync(file).isSymbolicLink());
    assert.ok(fs.readFileSync(real, 'utf8').includes('"fabric-dashboards"'), 'the entry is kept where it was');
  } finally { unlock(); }
  assert.equal(run(env, 'restore').status, 0);
  assert.ok(fs.lstatSync(file).isSymbolicLink());
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF, 'the next restore removes it');
});

test('PC-127: uninstall finishes when an MCP entry cannot be removed, keeps it recorded, and a retry removes it', { skip: lockSkip }, () => {
  const env = setup();
  const { file, real, unlock } = lockedCodexLink(env);
  const stateFile = path.join(env.home, '.passioncode', 'state.json');
  try {
    const r = run(env, 'uninstall');
    assert.equal(r.status, 1);
    assert.match(r.stderr, /Uninstall incomplete: .*; kept\. The rest of uninstall finished\. Make the file and its folder readable and writable \(for a link, the folder it points into\) and retry uninstall\./);
    assert.match(r.stdout, /^Removed:\n/, 'what it did is still shown');
    assert.match(r.stdout, /for Gemini CLI removed from/);
    assert.ok(r.stderr.includes(`${file}: fabric-dashboards for Codex CLI could not be removed`), r.stderr);
    const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert.equal(state.installed, null, 'the rest of uninstall is done');
    assert.notEqual((state.config || {}).auto, false, 'uninstall never writes the update switch');
    assert.deepEqual(state.mcpRegistrations.map((m) => m.agent), ['Codex CLI'], 'only the kept entry stays recorded');
    assert.equal(mcpEntry(path.join(env.home, '.kimi-code', 'mcp.json')), undefined);
  } finally { unlock(); }
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF);
  assert.ok(fs.lstatSync(file).isSymbolicLink());
  assert.equal(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mcpRegistrations, undefined);
});

test('PC-127: after an update starts a new batch, restore no longer reaches a kept MCP entry and uninstall removes it', { skip: lockSkip }, () => {
  const env = setup();
  const { real, unlock } = lockedCodexLink(env);
  try { assert.equal(run(env, 'restore').status, 1); } finally { unlock(); }
  assert.equal(run(env, 'update').status, 0);
  assert.equal(run(env, 'restore').status, 0);
  assert.ok(fs.readFileSync(real, 'utf8').includes('"fabric-dashboards"'), 'the new batch does not hold it, as cli.md says');
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF, 'uninstall removes it');
});

test('PC-127: a Codex config.toml that cannot be read is kept recorded, not taken as gone', { skip: lockSkip }, () => {
  const env = setup();
  const { real, unlock } = lockedCodexLink(env);
  fs.chmodSync(path.dirname(real), 0o000);
  const stateFile = path.join(env.home, '.passioncode', 'state.json');
  try {
    const r = run(env, 'uninstall');
    assert.equal(r.status, 1, r.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mcpRegistrations.map((m) => m.agent), ['Codex CLI']);
  } finally { unlock(); }
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(fs.readFileSync(real, 'utf8'), CODEX_CONF);
});

test('PC-127: a Gemini settings file that cannot be read is kept recorded, not dropped', { skip: lockSkip }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const file = path.join(env.home, '.gemini', 'settings.json');
  const real = path.join(env.home, 'dotfiles', 'gemini.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, '{}\n');
  fs.symlinkSync(real, file);
  assert.equal(run(env, 'update').status, 0);
  fs.chmodSync(path.dirname(real), 0o000);
  const stateFile = path.join(env.home, '.passioncode', 'state.json');
  try {
    const r = run(env, 'uninstall');
    assert.equal(r.status, 1, r.stdout);
    assert.ok(r.stderr.includes(`${file}: fabric-dashboards for Gemini CLI could not be removed`), r.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(stateFile, 'utf8')).mcpRegistrations.map((m) => m.agent), ['Gemini CLI']);
  } finally { fs.chmodSync(path.dirname(real), 0o755); }
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(mcpEntry(real), undefined, 'the retry removes it');
});

test('PC-127: an MCP file whose path now runs through a file, or is a folder, does not hold uninstall back', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  fs.rmSync(path.join(env.home, '.gemini'), { recursive: true });
  fs.writeFileSync(path.join(env.home, '.gemini'), 'not a folder\n');
  const kimi = path.join(env.home, '.kimi-code', 'mcp.json');
  fs.rmSync(kimi);
  fs.mkdirSync(kimi);
  const codex = path.join(env.home, '.codex', 'config.toml'); // the TOML branch maps them the same way
  fs.rmSync(codex);
  fs.mkdirSync(codex);
  const r = run(env, 'uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /mcp\.json: fabric-dashboards for Kimi Code is a folder; kept/);
  assert.match(r.stdout, /config\.toml: fabric-dashboards for Codex CLI is a folder; kept/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8')).mcpRegistrations, undefined);
});

test('PC-127: a Codex config.toml whose path now runs through a file is taken as gone', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  fs.rmSync(path.join(env.home, '.codex'), { recursive: true });
  fs.writeFileSync(path.join(env.home, '.codex'), 'not a folder\n');
  const r = run(env, 'uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /Codex CLI/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8')).mcpRegistrations, undefined);
});

test('PC-127: a key a person adds inside the launcher Codex table keeps the table, through restore and uninstall', () => {
  for (const cmd of ['restore', 'uninstall']) {
    const env = setup();
    withFakeMcp(env);
    withAgents(env);
    assert.equal(run(env, 'update').status, 0);
    const file = path.join(env.home, '.codex', 'config.toml');
    const text = fs.readFileSync(file, 'utf8').replace(/(\["mcp_servers"\."fabric-dashboards"\]\ncommand = [^\n]*\nargs = [^\n]*\n)/, '$1env = { K = "v" }\n');
    assert.ok(text.includes('env = { K = "v" }'));
    fs.writeFileSync(file, text);
    const r = run(env, cmd);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /fabric-dashboards for Codex CLI has settings added since; kept/);
    assert.equal(fs.readFileSync(file, 'utf8'), text, `${cmd} leaves the table and its key`);
  }
});

test('PC-127: a Codex server the person declares inline instead of the launcher table is kept, not taken as gone', () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const file = path.join(env.home, '.codex', 'config.toml');
  const inline = fs.readFileSync(file, 'utf8').replace(/\["mcp_servers"\."fabric-dashboards"\]\ncommand = [^\n]*\nargs = [^\n]*\n/, '') + `[mcp_servers]\nfabric-dashboards = { command = ${JSON.stringify(bin)} }\n`;
  fs.writeFileSync(file, inline);
  const r = run(env, 'uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /fabric-dashboards for Codex CLI was changed; kept/);
  assert.equal(fs.readFileSync(file, 'utf8'), inline);
});

test('PC-127: a Codex table with a comment of the person keeps it; a same-named key elsewhere is not a declaration', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const file = path.join(env.home, '.codex', 'config.toml');
  const text = fs.readFileSync(file, 'utf8') + '# my own servers below\n[mcp_servers.mine]\ncommand = "m"\n';
  fs.writeFileSync(file, text);
  const r = run(env, 'restore');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /fabric-dashboards for Codex CLI has settings added since; kept/);
  assert.equal(fs.readFileSync(file, 'utf8'), text, 'the comment stays');

  const other = setup();
  withFakeMcp(other);
  withAgents(other);
  assert.equal(run(other, 'update').status, 0);
  const otherFile = path.join(other.home, '.codex', 'config.toml');
  const gone = fs.readFileSync(otherFile, 'utf8').replace(/\["mcp_servers"\."fabric-dashboards"\]\ncommand = [^\n]*\nargs = [^\n]*\n/, '') + '[projects."/x"]\nfabric-dashboards = "trusted"\n';
  fs.writeFileSync(otherFile, gone);
  const u = run(other, 'uninstall');
  assert.equal(u.status, 0, u.stderr);
  assert.doesNotMatch(u.stdout, /for Codex CLI/, 'a key in another table is not the server');
  assert.equal(fs.readFileSync(otherFile, 'utf8'), gone);
});

test('PC-127: a Codex server the person declares with dotted keys under [mcp_servers] is kept, not taken as gone', () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const file = path.join(env.home, '.codex', 'config.toml');
  const dotted = fs.readFileSync(file, 'utf8').replace(/\["mcp_servers"\."fabric-dashboards"\]\ncommand = [^\n]*\nargs = [^\n]*\n/, '') + `[mcp_servers]\nfabric-dashboards.command = ${JSON.stringify(bin)}\n`;
  fs.writeFileSync(file, dotted);
  const r = run(env, 'uninstall');
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /fabric-dashboards for Codex CLI was changed; kept/);
  assert.equal(fs.readFileSync(file, 'utf8'), dotted);
});

test('PC-127: a trailing comment keeps a Codex table; a root inline declaration counts, a root key in another table does not', () => {
  const fresh = () => {
    const env = setup();
    const bin = withFakeMcp(env);
    withAgents(env);
    assert.equal(run(env, 'update').status, 0);
    return { env, bin, file: path.join(env.home, '.codex', 'config.toml') };
  };
  const table = /\["mcp_servers"\."fabric-dashboards"\]\ncommand = [^\n]*\nargs = [^\n]*\n/;
  for (const edit of [(t) => t.replace(/(args = \[[^\n]*)\n$/, '$1 # mine\n'), (t) => t.replace('["mcp_servers"."fabric-dashboards"]', '["mcp_servers"."fabric-dashboards"] # mine')]) {
    const { env, file } = fresh();
    const text = edit(fs.readFileSync(file, 'utf8'));
    assert.ok(text.includes('# mine'));
    fs.writeFileSync(file, text);
    const r = run(env, 'uninstall');
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /fabric-dashboards for Codex CLI has settings added since; kept/);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  {
    const { env, bin, file } = fresh();
    const text = `mcp_servers.fabric-dashboards = { command = ${JSON.stringify(bin)} }\n` + fs.readFileSync(file, 'utf8').replace(table, '');
    fs.writeFileSync(file, text);
    const r = run(env, 'uninstall');
    assert.match(r.stdout, /fabric-dashboards for Codex CLI was changed; kept/);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
  {
    const { env, file } = fresh();
    const text = fs.readFileSync(file, 'utf8').replace(table, '') + '[profiles.work]\nmcp_servers.fabric-dashboards.enabled = false\n';
    fs.writeFileSync(file, text);
    const r = run(env, 'uninstall');
    assert.doesNotMatch(r.stdout, /for Codex CLI/);
    assert.equal(fs.readFileSync(file, 'utf8'), text);
  }
});

test('PC-120: a Kimi MCP file the launcher creates is private', { skip: process.platform === 'win32' && 'POSIX modes' }, () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const file = path.join(env.home, '.kimi-code', 'mcp.json');
  assert.equal(fs.existsSync(file), false);
  assert.equal(run(env, 'update').status, 0);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('uninstall removes what it registered and keeps an entry it did not add', () => {
  const env = setup();
  const bin = withFakeMcp(env);
  withAgents(env);
  // A hand-set registration, already correct before the launcher ran: never recorded, never removed.
  const kimi = { mcpServers: { 'fabric-dashboards': { command: bin, args: [], env: {} } } };
  fs.writeFileSync(path.join(env.home, '.kimi-code', 'mcp.json'), JSON.stringify(kimi));
  assert.equal(run(env, 'update').status, 0);
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.equal(state.mcpRegistrations.length, 3, 'the hand-set kimi entry was not adopted');
  const r = run(env, 'uninstall', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const removed = JSON.parse(r.stdout);
  assert.equal(removed.filter((n) => typeof n === 'string' && n.includes('fabric-dashboards') && n.includes('removed')).length, 3, JSON.stringify(removed));
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers['fabric-dashboards'], undefined);
  assert.ok(!fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8').includes('fabric-dashboards'));
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.gemini', 'settings.json'), 'utf8')).mcpServers['fabric-dashboards'], undefined);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.kimi-code', 'mcp.json'), 'utf8')), kimi, 'the hand-set entry stays');
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8')).mcpRegistrations, undefined);
});

test('uninstall keeps an MCP entry that was changed after the launcher wrote it', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const changed = { mcpServers: { someone: { command: '/bin/someone' }, 'fabric-dashboards': { command: '/hand-edited/mcp', args: [], env: {} } } };
  fs.writeFileSync(path.join(env.home, '.claude.json'), JSON.stringify(changed));
  const r = run(env, 'uninstall', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(JSON.parse(r.stdout).some((n) => typeof n === 'string' && n.includes('kept')));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')), changed);
});

test('a Codex config that already declares the server another way is left alone', () => {
  const env = setup();
  withFakeMcp(env);
  const toml = `${CODEX_CONF}\n[mcp_servers]\nfabric-dashboards = { command = "/elsewhere/mcp" }\n`;
  withAgents(env, { codexConf: toml });
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const codex = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.startsWith('Codex CLI'));
  assert.equal(codex.length, 1);
  assert.equal(codex[0].outcome, 'skipped');
  assert.match(codex[0].detail, /form the launcher does not edit/);
  assert.equal(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8'), toml, 'no second declaration of the key');
});

test('restore keeps an entry whose nested settings were changed by hand', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const gemini = path.join(env.home, '.gemini', 'settings.json');
  const doc = JSON.parse(fs.readFileSync(gemini, 'utf8'));
  doc.mcpServers['fabric-dashboards'].env = { FD_DEBUG: '1' };
  fs.writeFileSync(gemini, JSON.stringify(doc));
  const r = run(env, 'restore', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.ok(JSON.parse(r.stdout).some((n) => n.includes('Gemini CLI') && n.includes('kept')), r.stdout);
  assert.deepEqual(JSON.parse(fs.readFileSync(gemini, 'utf8')).mcpServers['fabric-dashboards'].env, { FD_DEBUG: '1' });
});

// PC-149: when the app the launcher registered moves (a per-user copy in ~/Applications replaces another user's in
// /Applications), the launcher's own unchanged entries follow it; restore puts the old ones back.
function movedMcp(env) {
  const bin = path.join(env.home, 'own-app', 'fabric-dashboards-mcp');
  fs.mkdirSync(path.dirname(bin), { recursive: true });
  fs.writeFileSync(bin, '#!/bin/sh\n');
  env.extra = { ...env.extra, PASSIONCODE_FABRIC_DASHBOARDS_MCP: bin };
  return bin;
}
const MCP_FILES = ['.claude.json', '.codex/config.toml', '.gemini/settings.json', '.kimi-code/mcp.json'];

test('PC-149: the launcher\'s own MCP entries follow the app to its new place; restore puts the old ones back', () => {
  const env = setup();
  const old = withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const own = movedMcp(env);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.equal(steps.filter((s) => s.outcome === 'done' && s.detail.startsWith('re-point fabric-dashboards')).length, 4, JSON.stringify(steps));
  assert.ok(steps.every((s) => !s.detail.startsWith('re-point') || s.detail.includes(`from ${old}`)), JSON.stringify(steps));
  assert.deepEqual(mcpEntry(path.join(env.home, '.claude.json')), { type: 'stdio', command: own, args: [], env: {} });
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers.someone, { command: '/bin/someone' });
  const toml = fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8');
  assert.ok(toml.startsWith(CODEX_CONF) && toml.includes(`command = ${JSON.stringify(own)}`) && !toml.includes(old), toml);
  assert.deepEqual(mcpEntry(path.join(env.home, '.gemini', 'settings.json')), { command: own, args: [], env: {} });
  assert.deepEqual(mcpEntry(path.join(env.home, '.kimi-code', 'mcp.json')), { command: own, args: [], env: {} });
  assert.ok(calls(env.home).includes('mcp remove --scope user fabric-dashboards'), calls(env.home).join('\n'));
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.equal(state.mcpRegistrations.length, 4);
  assert.ok(state.mcpRegistrations.every((x) => x.entry.command === own), JSON.stringify(state.mcpRegistrations));
  // Again: nothing to do.
  const again = JSON.parse(run(env, 'update', '--json').stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.ok(again.every((s) => s.outcome === 'skipped' && s.detail.includes('already runs')), JSON.stringify(again));
  // restore takes the last batch back: each entry runs the old command again, and the launcher still owns it.
  const r2 = run(env, 'restore', '--json');
  assert.equal(r2.status, 0, r2.stderr + r2.stdout);
  const notes = JSON.parse(r2.stdout);
  assert.equal(notes.filter((n) => n.includes('fabric-dashboards') && n.includes('put back')).length, 4, JSON.stringify(notes));
  assert.deepEqual(mcpEntry(path.join(env.home, '.claude.json')), { type: 'stdio', command: old, args: [], env: {} });
  assert.ok(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8').includes(`command = ${JSON.stringify(old)}`));
  assert.deepEqual(mcpEntry(path.join(env.home, '.gemini', 'settings.json')), { command: old, args: [], env: {} });
  assert.deepEqual(mcpEntry(path.join(env.home, '.kimi-code', 'mcp.json')), { command: old, args: [], env: {} });
  const back = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.ok(back.mcpRegistrations.length === 4 && back.mcpRegistrations.every((x) => x.entry.command === old), JSON.stringify(back.mcpRegistrations));
  // And uninstall then takes the restored entries out, as the launcher's.
  assert.equal(run(env, 'uninstall').status, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers, { someone: { command: '/bin/someone' } });
});

test('PC-149: an entry changed since the launcher wrote it, or one a person set, stays where it points', () => {
  const env = setup();
  const old = withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  // The person changed the Gemini entry's arguments and wrote their own Kimi entry over the launcher's.
  const gemini = path.join(env.home, '.gemini', 'settings.json');
  const g = JSON.parse(fs.readFileSync(gemini, 'utf8'));
  g.mcpServers['fabric-dashboards'].args = ['--mine'];
  fs.writeFileSync(gemini, JSON.stringify(g, null, 2));
  const kimi = path.join(env.home, '.kimi-code', 'mcp.json');
  const k = JSON.parse(fs.readFileSync(kimi, 'utf8'));
  k.mcpServers['fabric-dashboards'] = { command: '/elsewhere/mcp', args: [], env: {} };
  fs.writeFileSync(kimi, JSON.stringify(k, null, 2));
  // And the Claude Code and Codex entries' arguments.
  const cj = path.join(env.home, '.claude.json');
  const c = JSON.parse(fs.readFileSync(cj, 'utf8'));
  c.mcpServers['fabric-dashboards'].args = ['--mine'];
  fs.writeFileSync(cj, JSON.stringify(c, null, 2));
  const codex = path.join(env.home, '.codex', 'config.toml');
  fs.writeFileSync(codex, fs.readFileSync(codex, 'utf8').replace(/(\["mcp_servers"\."fabric-dashboards"\]\ncommand = "[^"]+"\n)args = \[\]/, '$1args = ["--mine"]'));
  const before = MCP_FILES.map((f) => fs.readFileSync(path.join(env.home, f), 'utf8'));
  assert.ok(before[1].includes('args = ["--mine"]'), before[1]);
  const own = movedMcp(env);
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.equal(steps.filter((s) => s.detail.startsWith('re-point')).length, 0, JSON.stringify(steps));
  assert.equal(steps.filter((s) => s.detail.includes('it was kept')).length, 4, JSON.stringify(steps));
  assert.deepEqual(MCP_FILES.map((f) => fs.readFileSync(path.join(env.home, f), 'utf8')), before);
  assert.ok(!old.startsWith(own));
});

test('PC-149: when Claude Code cannot register the new command, the old entry is put back and the step fails', () => {
  const env = setup();
  const old = withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const own = movedMcp(env);
  env.extra.FAKE_CLAUDE_FAIL = `mcp add --scope user fabric-dashboards -- ${own}`;
  const r = run(env, 'update', '--json');
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.startsWith('re-point fabric-dashboards for Claude Code'));
  assert.equal(steps.length, 1, r.stdout);
  assert.equal(steps[0].outcome, 'failed', JSON.stringify(steps));
  assert.match(steps[0].error, /did not register fabric-dashboards/);
  assert.equal(mcpEntry(path.join(env.home, '.claude.json')).command, old, 'the old entry is back, not none');
  const state = JSON.parse(fs.readFileSync(path.join(env.home, '.passioncode', 'state.json'), 'utf8'));
  assert.equal(state.mcpRegistrations.find((x) => x.agent === 'Claude Code').entry.command, old, 'still recorded as it is');
});

test('PC-149: a dry run plans the re-point and writes nothing', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  assert.equal(run(env, 'update').status, 0);
  const before = MCP_FILES.map((f) => fs.readFileSync(path.join(env.home, f), 'utf8'));
  movedMcp(env);
  const r = run(env, 'update', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.startsWith('re-point fabric-dashboards'));
  assert.equal(steps.length, 4, JSON.stringify(JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp')));
  assert.deepEqual(MCP_FILES.map((f) => fs.readFileSync(path.join(env.home, f), 'utf8')), before);
});

test('a dry run plans the MCP registrations and writes no agent config', () => {
  const env = setup();
  withFakeMcp(env);
  withAgents(env);
  const before = fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8');
  const r = run(env, 'update', '--dry-run', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  const mcp = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric-dashboards'));
  assert.equal(mcp.filter((s) => s.outcome === 'planned').length, 4, JSON.stringify(mcp));
  assert.equal(fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8'), before);
  assert.equal(fs.existsSync(path.join(env.home, '.gemini', 'settings.json')), false);
  assert.ok(!calls(env.home).some((l) => l.startsWith('mcp ')));
});

// ADR-0004: every stdio server inside an installed app bundle, with each agent's own arguments.
function withApps(env, names) {
  const apps = path.join(env.home, 'Applications');
  const bins = {
    fabric: path.join(apps, 'Fabric.app/Contents/Resources/bin/fabric-mcp'),
    switchboard: path.join(apps, 'Fabric Switchboard.app/Contents/MacOS/switchboard'),
  };
  for (const n of names) { fs.mkdirSync(path.dirname(bins[n]), { recursive: true }); fs.writeFileSync(bins[n], '#!/bin/sh\n'); }
  env.extra = { ...(env.extra || {}), PASSIONCODE_APPLICATIONS: apps };
  return bins;
}

// In-process update with setup's includePreview, the fake claude CLI and this test's env.
function updateInProcess(env, opts) {
  const keys = { PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_APPLICATIONS: env.extra.PASSIONCODE_APPLICATIONS, PASSIONCODE_HOME: '', KIMI_CODE_HOME: '', PASSIONCODE_FABRIC_DASHBOARDS_MCP: path.join(env.home, 'no-fabric-dashboards-mcp') };
  const saved = Object.fromEntries(Object.keys(keys).map((k) => [k, process.env[k]]));
  Object.assign(process.env, keys);
  const claude = { available: () => true, run: (args, o = {}) => { const r = spawnSync(process.execPath, [FAKE, ...args], { encoding: 'utf8', cwd: o.cwd, env: { ...process.env, HOME: env.home, USERPROFILE: env.home } }); return { code: r.status, out: `${r.stdout}${r.stderr}`.trim() }; } };
  try { return require('../lib/launcher').update({ home: env.home, claude, ...opts }); } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }
}

test('fabric (an early preview) is registered by setup with each agent its own runner, never by a plain update, and no Gemini entry', () => {
  const env = setup();
  withAgents(env);
  const bins = withApps(env, ['fabric']);
  const plain = run(env, 'update', '--json');
  assert.equal(plain.status, 0, plain.stderr + plain.stdout);
  assert.ok(JSON.parse(plain.stdout).steps.some((s) => s.kind === 'mcp' && /Fabric is an early preview: fabric is registered by `passioncode setup`/.test(s.detail)));
  assert.equal(JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers.fabric, undefined, 'the background update registers no preview server');
  const r = { status: 0, stdout: JSON.stringify(updateInProcess(env, { includePreview: true })), stderr: '' };
  const fabric = (file) => JSON.parse(fs.readFileSync(path.join(env.home, file), 'utf8')).mcpServers.fabric;
  assert.deepEqual(fabric('.claude.json'), { type: 'stdio', command: bins.fabric, args: ['--runner', 'claude-code'], env: {} });
  assert.ok(calls(env.home).includes(`mcp add --scope user fabric -- ${bins.fabric} --runner claude-code`));
  assert.deepEqual(fabric('.kimi-code/mcp.json'), { command: bins.fabric, args: ['--runner', 'kimi-code'], env: {} });
  assert.match(fs.readFileSync(path.join(env.home, '.codex/config.toml'), 'utf8'), /\["mcp_servers"\."fabric"\]\ncommand = "[^"]+fabric-mcp"\nargs = \["--runner", "codex"\]\n/);
  assert.equal(fs.existsSync(path.join(env.home, '.gemini/settings.json')), false, 'nothing was written for Gemini');
  const steps = JSON.parse(r.stdout).steps.filter((s) => s.kind === 'mcp' && s.detail.includes('fabric '));
  assert.ok(steps.some((s) => s.outcome === 'skipped' && /no Gemini CLI runner/.test(s.detail)), JSON.stringify(steps));
  // A second run changes nothing and uninstall takes out exactly what was added.
  const again = updateInProcess(env, { includePreview: true }).steps.filter((s) => s.kind === 'mcp' && s.outcome === 'done');
  assert.equal(again.length, 0, JSON.stringify(again));
  assert.equal(run(env, 'uninstall').status, 0);
  assert.equal(fabric('.kimi-code/mcp.json'), undefined);
  assert.doesNotMatch(fs.readFileSync(path.join(env.home, '.codex/config.toml'), 'utf8'), /"fabric"/);
});

test('switchboard is not added for Claude Code when its plugin already serves it', () => {
  const env = setup();
  withAgents(env);
  const bins = withApps(env, ['switchboard']);
  const plugins = path.join(env.home, '.claude/plugins/installed_plugins.json');
  const doc = JSON.parse(fs.readFileSync(plugins, 'utf8'));
  doc.plugins['switchboard@switchboard'] = [{ scope: 'user', installPath: '/x', version: '0.6.0' }];
  fs.writeFileSync(plugins, JSON.stringify(doc));
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal((JSON.parse(fs.readFileSync(path.join(env.home, '.claude.json'), 'utf8')).mcpServers || {}).switchboard, undefined);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => s.kind === 'mcp' && /from its switchboard plugin/.test(s.detail)));
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(env.home, '.gemini/settings.json'), 'utf8')).mcpServers.switchboard, { command: bins.switchboard, args: ['mcp'], env: {} });
});

test('a dry run copies no agent config into a quarantine', () => {
  const env = setup();
  withAgents(env);
  withFakeMcp(env);
  assert.equal(run(env, 'update', '--dry-run', '--json').status, 0);
  assert.equal(fs.existsSync(path.join(env.home, '.passioncode', 'quarantine')), false);
});

test('an entry with the same command but other arguments is the person\'s and is kept', () => {
  const env = setup();
  withAgents(env);
  const bins = withApps(env, ['switchboard']);
  const gemini = path.join(env.home, '.gemini', 'settings.json');
  fs.writeFileSync(gemini, JSON.stringify({ mcpServers: { switchboard: { command: bins.switchboard, args: ['mcp', '--mine'] } } }));
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0, r.stderr);
  assert.ok(JSON.parse(r.stdout).steps.some((s) => /Gemini CLI has its own switchboard entry .*with arguments \["mcp","--mine"\]\); it was kept/.test(s.detail)));
  assert.deepEqual(JSON.parse(fs.readFileSync(gemini, 'utf8')).mcpServers.switchboard.args, ['mcp', '--mine']);
});

test('uninstall keeps a Codex entry that gained a sub-table or other arguments since the launcher wrote it', () => {
  const env = setup();
  withAgents(env);
  withApps(env, ['switchboard']);
  assert.equal(run(env, 'update').status, 0);
  const conf = path.join(env.home, '.codex', 'config.toml');
  fs.appendFileSync(conf, '\n[mcp_servers.switchboard.env]\nDEBUG = "1"\n');
  assert.equal(run(env, 'uninstall').status, 0);
  const text = fs.readFileSync(conf, 'utf8');
  assert.match(text, /\["mcp_servers"\."switchboard"\]\ncommand = /, 'the entry stays with its sub-table');
  assert.match(text, /\[mcp_servers\.switchboard\.env\]/);
});

test('a key of the same name in another TOML table does not keep the launcher\'s entry on uninstall', () => {
  const env = setup();
  withAgents(env, { codexConf: '[profiles.work]\nswitchboard = true\n' });
  withApps(env, ['switchboard']);
  assert.equal(run(env, 'update').status, 0);
  assert.equal(run(env, 'uninstall').status, 0);
  const text = fs.readFileSync(path.join(env.home, '.codex', 'config.toml'), 'utf8');
  assert.doesNotMatch(text, /\["mcp_servers"\."switchboard"\]/, 'removed');
  assert.match(text, /\[profiles\.work\]\nswitchboard = true/, 'the other table is untouched');
});
