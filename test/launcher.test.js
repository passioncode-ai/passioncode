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
  return spawnSync(process.execPath, [BIN, ...args], { encoding: 'utf8', env: { ...process.env, HOME: env.home, PASSIONCODE_PAYLOAD: env.payload, PASSIONCODE_CLAUDE: FAKE, PASSIONCODE_HOME: '', ...(env.extra || {}) } });
}
const calls = (home) => { try { return fs.readFileSync(path.join(home, 'claude-calls.log'), 'utf8').trim().split('\n').filter(Boolean); } catch (_) { return []; } };

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
  fs.symlinkSync('/user-replacement', hub);
  const conflict = run(env, 'restore');
  assert.equal(conflict.status, 1);
  assert.equal(fs.readlinkSync(hub), '/user-replacement');
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
  fs.writeFileSync(path.join(env.home, '.passioncode/releases/0.2.0'), 'not a directory');
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

test('uninstall clears installed state, disables automatic reinstallation and is repeatable', () => {
  const env = setup();
  assert.equal(run(env, 'update').status, 0);
  const channel = path.join(env.home, '.cursor/skills/example-agent');
  fs.unlinkSync(channel);
  fs.symlinkSync(path.relative(path.dirname(channel), path.join(env.home, '.agents/skills/example-agent')), channel);
  assert.equal(run(env, 'uninstall').status, 0);
  const status = JSON.parse(run(env, 'status', '--json').stdout);
  assert.equal(status.installed, null);
  assert.equal(status.auto, false);
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
  for (const args of [['uninstall', '--dry-run'], ['restore', '--dry-run'], ['update', '--dryrun'], ['status', 'extra'], ['config', 'set', 'update.auto', 'off', 'extra']]) {
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
  ];
  for (const c of cases) {
    const state = { installed: '0.1.14', latest: c.latest, checkedAt: c.checkedAt, config: { auto: false } };
    const bytes = JSON.stringify(state, null, 2) + '\n';
    fs.writeFileSync(stateFile, bytes);
    const text = run(env, 'status');
    assert.equal(text.status, 0, text.stderr);
    assert.equal(text.stdout.split('\n')[0], `installed 0.1.14 · package 0.1.0 · ${c.expected} · auto-update off`);
    const json = run(env, 'status', '--json');
    assert.equal(json.status, 0, json.stderr);
    const parsed = JSON.parse(json.stdout);
    assert.equal(parsed.latest, c.latest);
    assert.equal(parsed.checkedAt, c.checkedAt || null);
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
  const { scanForSecrets } = await import(path.join(ROOT, 'scripts/vendor.mjs'));
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
