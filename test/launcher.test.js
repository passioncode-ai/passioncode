'use strict';
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

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
    { name: 'fabric-agent-adapter', version: '0.4.0', skills: ['building-fabric-services', 'creating-fabric-agents'], legacyPluginIds: ['fabric-agent-adapter@fabric-agent-adapter'] },
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
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_CLAUDE: FAKE, PASSIONCODE_HOME: '', ...(env.extra || {}) } });
}
const calls = (home) => { try { return fs.readFileSync(path.join(home, 'claude-calls.log'), 'utf8').trim().split('\n'); } catch (_) { return []; } };

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

test('a second update is idempotent: updates plugins, moves nothing', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  fs.rmSync(path.join(env.home, 'claude-calls.log'));
  const r = run(env, 'update', '--json');
  assert.equal(r.status, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.moved.length, 0);
  assert.deepEqual(out.steps.filter((s) => ['hub', 'channel', 'shadow', 'legacy'].includes(s.kind)), []);
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
  assert.ok(JSON.parse(r.stdout).steps.every((s) => s.outcome === 'planned'));
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

test('the session-start hook reports a newer set and starts one background update', () => {
  const env = setup();
  const state = path.join(env.home, '.passioncode');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'state.json'), JSON.stringify({ installed: '0.1.0', latest: '0.2.0', checkedAt: new Date().toISOString(), config: { auto: false } }));
  const hook = path.join(ROOT, 'plugin/passioncode/hooks/session-start.js');
  const r = spawnSync(process.execPath, [hook], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_HOME: state } });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /0\.2\.0 is out \(you have 0\.1\.0\): npx passioncode@latest update/);
  fs.writeFileSync(path.join(state, 'state.json'), JSON.stringify({ installed: '0.2.0', latest: '0.2.0', checkedAt: new Date().toISOString() }));
  assert.equal(spawnSync(process.execPath, [hook], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_HOME: state } }).stdout, '');
  fs.writeFileSync(path.join(state, 'state.json'), '{broken');
  assert.equal(spawnSync(process.execPath, [hook], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_HOME: state } }).status, 0, 'a damaged state never fails a session');
});

test('vendor refuses credential-shaped strings', async () => {
  const { scanForSecrets } = await import(path.join(ROOT, 'scripts/vendor.mjs'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-scan-'));
  fs.writeFileSync(path.join(dir, 'SKILL.md'), 'Use sk-or-v1-' + 'a'.repeat(40) + ' to call the model.');
  fs.writeFileSync(path.join(dir, 'ok.md'), 'Read the key from the vault by name.');
  const hits = scanForSecrets(dir);
  assert.equal(hits.length, 1);
  assert.match(hits[0], /SKILL\.md/);
});
