'use strict';
// PC-125: the ledger of Claude Code permission rules PassionCode installed, and the `permissions` command Fabric's
// permissions screen reads and changes them through.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'passioncode.js');

function machine() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ledger-'));
  fs.mkdirSync(path.join(home, '.claude'), { recursive: true });
  const bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(path.join(bin, 'own-cli'), '#!/bin/sh\n', { mode: 0o755 });
  const env = { ...process.env, HOME: home, USERPROFILE: home, PATH: [bin, process.env.PATH].join(path.delimiter) };
  delete env.PASSIONCODE_HOME;
  const settings = path.join(home, '.claude', 'settings.json');
  const state = path.join(home, '.passioncode');
  const run = (...args) => spawnSync(process.execPath, [BIN, 'permissions', ...args], { env, encoding: 'utf8' });
  const json = (...args) => { const r = run(...args, '--json'); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };
  return { home, settings, state, run, json };
}
const declare = (m, doc) => { fs.mkdirSync(path.join(m.state, 'rules.d'), { recursive: true }); fs.writeFileSync(path.join(m.state, 'rules.d', 'own.json'), JSON.stringify(doc)); };

test('PC-125: the view lists offered rules, foreign rules and the mode, and changes nothing', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ theme: 'dark', permissions: { allow: ['Bash(ls)', 'mcp__fabric'], defaultMode: 'acceptEdits' } }));
  declare(m, { by: 'Own Agent', rules: [{ rule: 'Bash(own-cli sync:*)', why: 'sync its data' }, { rule: 'Bash(env x)', why: 'x' }] });
  const before = fs.readFileSync(m.settings, 'utf8');
  const v = m.json();
  assert.equal(v.schema, 'passioncode-permissions/1');
  assert.equal(v.settingsFile, m.settings);
  assert.deepEqual(v.mode, { value: 'acceptEdits', file: m.settings });
  assert.deepEqual(v.foreign, ['Bash(ls)'], 'a rule PassionCode does not offer is foreign');
  const fabric = v.rules.find((r) => r.rule === 'mcp__fabric');
  assert.equal(fabric.state, 'allowed');
  assert.equal(fabric.installedAt, null, 'allowed before the ledger existed');
  assert.ok(v.offered.some((r) => r.rule === 'Bash(gh pr merge:*)' && r.set === 'commands' && r.source === 'launcher'));
  assert.ok(v.offered.some((r) => r.rule === 'Bash(own-cli sync:*)' && r.by === 'Own Agent' && r.source === 'rules.d/own.json'));
  assert.ok(v.refused.some((line) => /env runs another program/.test(line)));
  assert.equal(fs.readFileSync(m.settings, 'utf8'), before, 'reading changes nothing');
  assert.equal(fs.existsSync(path.join(m.state, 'permissions.json')), false, 'nor writes a ledger');
  const text = m.run();
  assert.equal(text.status, 0);
  assert.match(text.stdout, /Default mode: acceptEdits/);
  assert.match(text.stdout, /Other allow rules \(not PassionCode's; never changed here\):\n  Bash\(ls\)/);
});

test('PC-125: allow records who asked and when; remove takes out only PassionCode\'s rules and keeps the history', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { allow: ['Bash(ls)'] } }));
  const added = m.json('allow', 'Bash(gh pr merge:*)', 'mcp__fabric', '--by', 'Fabric (operator)');
  assert.deepEqual(added.added, ['Bash(gh pr merge:*)', 'mcp__fabric']);
  const doc = JSON.parse(fs.readFileSync(m.settings, 'utf8'));
  assert.deepEqual(doc.permissions.allow, ['Bash(ls)', 'Bash(gh pr merge:*)', 'mcp__fabric']);
  const merge = added.rules.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.equal(merge.by, 'Fabric (operator)');
  assert.equal(merge.state, 'allowed');
  assert.ok(Date.parse(merge.installedAt));
  const ledger = JSON.parse(fs.readFileSync(path.join(m.state, 'permissions.json'), 'utf8'));
  assert.equal(ledger.schema, 'passioncode-permissions/1');
  assert.equal(ledger.rules.length, 2);
  const refused = m.run('allow', 'Bash(rm -rf:*)', '--json');
  assert.equal(refused.status, 2, 'a rule PassionCode does not offer is refused');
  assert.match(refused.stderr, /not a rule PassionCode offers: Bash\(rm -rf:\*\)/);
  const foreign = m.run('remove', 'Bash(ls)');
  assert.equal(foreign.status, 2);
  assert.match(foreign.stderr, /not a rule PassionCode installed: Bash\(ls\)/);
  const removed = m.json('remove', 'Bash(gh pr merge:*)', '--by', "Fabric (agent on operator's words)");
  assert.deepEqual(removed.removed, ['Bash(gh pr merge:*)']);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.settings, 'utf8')).permissions.allow, ['Bash(ls)', 'mcp__fabric']);
  const gone = removed.rules.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.equal(gone.state, 'missing');
  assert.equal(gone.removedBy, "Fabric (agent on operator's words)");
  assert.equal(gone.by, 'Fabric (operator)', 'who installed it is kept');
});

test('PC-125: mode writes permissions.defaultMode only, and refuses a mode Claude Code does not have', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ theme: 'dark', permissions: { allow: ['Bash(ls)'] } }));
  const r = m.json('mode', 'bypassPermissions', '--by', 'Fabric (operator)');
  assert.equal(r.changed, true);
  assert.equal(r.from, null);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.settings, 'utf8')), { theme: 'dark', permissions: { allow: ['Bash(ls)'], defaultMode: 'bypassPermissions' } });
  assert.equal(r.mode.value, 'bypassPermissions');
  assert.equal(r.mode.changed.by, 'Fabric (operator)');
  assert.equal(m.json('mode', 'bypassPermissions').changed, false);
  const bad = m.run('mode', 'yolo');
  assert.equal(bad.status, 2);
  assert.match(bad.stderr, /mode must be one of default, acceptEdits, plan, auto, dontAsk, bypassPermissions/);
});

test('PC-125: settings that cannot be read are named, exit 1, and never written', () => {
  const m = machine();
  fs.writeFileSync(m.settings, '{bad');
  const v = m.run('--json');
  assert.equal(v.status, 1);
  assert.equal(JSON.parse(v.stdout).readable, false);
  assert.equal(m.run('allow', 'mcp__fabric').status, 1);
  assert.equal(m.run('mode', 'plan').status, 1);
  assert.equal(fs.readFileSync(m.settings, 'utf8'), '{bad');
});

test('PC-125: usage errors exit 2', () => {
  const m = machine();
  for (const args of [['allow'], ['mode'], ['mode', 'plan', 'auto'], ['frob'], ['--by'], ['allow', 'mcp__fabric', '--by', 'x\ny'], ['--nope']]) {
    assert.equal(m.run(...args).status, 2, args.join(' '));
  }
});

test('PC-125: a linked settings file stays a link with its mode through allow, remove and mode', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const m = machine();
  const real = path.join(m.home, 'dotfiles', 'claude.json');
  fs.mkdirSync(path.dirname(real), { recursive: true });
  fs.writeFileSync(real, JSON.stringify({ permissions: { allow: [] } }));
  fs.chmodSync(real, 0o600);
  fs.symlinkSync(real, m.settings);
  m.json('allow', 'mcp__fabric');
  m.json('mode', 'plan');
  m.json('remove', 'mcp__fabric');
  assert.ok(fs.lstatSync(m.settings).isSymbolicLink());
  assert.equal(fs.statSync(real).mode & 0o777, 0o600);
  assert.equal(fs.statSync(path.join(m.state, 'permissions.json')).mode & 0o777, 0o600, 'the ledger is private');
});
