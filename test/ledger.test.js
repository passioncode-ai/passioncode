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

const homes = [];
test.after(() => { for (const home of homes) fs.rmSync(home, { recursive: true, force: true }); }); // a temp home never outlives the run

function machine() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-ledger-'));
  homes.push(home);
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
  assert.equal(merge.by, 'PassionCode setup', 'who declared it stays');
  assert.equal(merge.installedBy, 'Fabric (operator)', 'who asked is its own field');
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
  assert.match(foreign.stderr, /not a rule PassionCode offers now or has in its ledger: Bash\(ls\)/);
  const removed = m.json('remove', 'Bash(gh pr merge:*)', '--by', "Fabric (agent on operator's words)");
  assert.deepEqual(removed.removed, ['Bash(gh pr merge:*)']);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.settings, 'utf8')).permissions.allow, ['Bash(ls)', 'mcp__fabric']);
  const gone = removed.rules.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.equal(gone.state, 'missing');
  assert.equal(gone.removedBy, "Fabric (agent on operator's words)");
  assert.equal(gone.installedBy, 'Fabric (operator)', 'who installed it is kept');
  const again = removed.offered.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.ok(again, 'a rule taken out is offered again, as setup offers it');
  assert.ok(!m.json().foreign.includes('mcp__fabric'), "a rule the ledger names is never foreign");
  const back = m.json('allow', 'Bash(gh pr merge:*)');
  const entry = back.rules.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.equal(entry.installedBy, 'permissions command', 'without --by the command names itself');
  assert.equal(entry.lastRemoved.by, "Fabric (agent on operator's words)", 'the last removal stays beside the new install');
  assert.equal(entry.removedAt, undefined, 'an allowed rule carries no removal of its own');
  // Taken out by hand and allowed again: the last removal through the command is still kept.
  const handDoc = JSON.parse(fs.readFileSync(m.settings, 'utf8'));
  handDoc.permissions.allow = handDoc.permissions.allow.filter((r) => r !== 'Bash(gh pr merge:*)');
  fs.writeFileSync(m.settings, JSON.stringify(handDoc));
  const third = m.json('allow', 'Bash(gh pr merge:*)').rules.find((r) => r.rule === 'Bash(gh pr merge:*)');
  assert.equal(third.lastRemoved.by, "Fabric (agent on operator's words)");
  assert.deepEqual(m.json('remove', 'mcp__fabric', 'mcp__fabric').removed, ['mcp__fabric'], 'a rule named twice is removed once');
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
  const same = [fs.readFileSync(m.settings, 'utf8'), fs.readFileSync(path.join(m.state, 'permissions.json'), 'utf8')];
  assert.equal(m.json('mode', 'bypassPermissions').changed, false);
  assert.deepEqual([fs.readFileSync(m.settings, 'utf8'), fs.readFileSync(path.join(m.state, 'permissions.json'), 'utf8')], same, 'the same mode writes nothing');
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
  assert.match(m.run().stdout, /Default mode: unknown \(the settings file cannot be read\)/);
});

test('PC-125: a removed rule read while the settings cannot be read is unknown, never "set again"', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { allow: [] } }));
  m.json('allow', 'mcp__fabric');
  m.json('remove', 'mcp__fabric');
  fs.writeFileSync(m.settings, '{bad');
  const v = JSON.parse(m.run('--json').stdout);
  assert.equal(v.rules.find((r) => r.rule === 'mcp__fabric').state, 'unknown');
  assert.deepEqual(v.offered, []);
  const text = m.run().stdout;
  assert.match(text, /unknown +mcp__fabric \(.*removed [^)]* by permissions command\)/);
  assert.doesNotMatch(text, /set again by hand/);
});

test('PC-125: a rule the ledger names stays PassionCode\'s after its declaration is gone, listed once', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { allow: [] } }));
  declare(m, { by: 'Own Agent', rules: [{ rule: 'Bash(own-cli sync:*)', why: 'sync its data' }] });
  m.json('allow', 'Bash(own-cli sync:*)');
  fs.rmSync(path.join(m.state, 'rules.d'), { recursive: true });
  const v = m.json();
  assert.equal(v.rules.filter((r) => r.rule === 'Bash(own-cli sync:*)').length, 1);
  assert.deepEqual(v.foreign, []);
  assert.deepEqual(m.json('remove', 'Bash(own-cli sync:*)').removed, ['Bash(own-cli sync:*)']);
});

test('PC-125: the text view escapes control characters a settings rule carries', () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { allow: ['Bash(a\u001b[2Jb)'] } }));
  const out = m.run().stdout;
  assert.ok(!out.includes('\u001b'), 'no raw escape reaches the terminal');
  assert.match(out, /Bash\(a\\u001b\[2Jb\)/);
  // The headline of an act prints what it read from the file escaped too.
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { defaultMode: 'x\u001b[2Jy' } }));
  const mode = m.run('mode', 'plan').stdout;
  assert.ok(!mode.includes('\u001b'));
  assert.match(mode, /Default mode: plan \(was x\\u001b\[2Jy\)\./);
  assert.match(m.run('allow', 'mcp__fabric').stdout, /To allow them: npx @passioncode-ai\/passioncode@latest permissions allow <rule>/);
});

test('PC-125: a ledger that cannot be read stops allow, remove and mode before the settings change', () => {
  for (const bad of ['{bad', JSON.stringify({ schema: 'x', rules: [] }), JSON.stringify({ schema: 'passioncode-permissions/1', rules: [null] })]) {
    const m = machine();
    const settings = JSON.stringify({ permissions: { allow: ['Bash(ls)', 'mcp__observatory'] } });
    fs.writeFileSync(m.settings, settings);
    fs.mkdirSync(m.state, { recursive: true });
    fs.writeFileSync(path.join(m.state, 'permissions.json'), bad);
    for (const args of [['allow', 'mcp__fabric'], ['remove', 'mcp__observatory'], ['mode', 'plan']]) {
      const r = m.run(...args);
      assert.equal(r.status, 1, `${bad} ${args.join(' ')}`);
      assert.match(r.stderr, /permissions\.json (is not valid JSON|is not a passioncode-permissions\/1 ledger)/);
      assert.equal(fs.readFileSync(m.settings, 'utf8'), settings, 'the settings are unchanged');
    }
    const v = m.run('--json');
    assert.equal(v.status, 1);
    assert.ok(JSON.parse(v.stdout).ledgerError);
  }
});

test('PC-125: a ledger that cannot be written stops the act before the settings change', { skip: (process.platform === 'win32' || process.getuid() === 0) && 'POSIX folder modes' }, () => {
  const m = machine();
  const settings = JSON.stringify({ permissions: { allow: ['mcp__observatory'] } });
  fs.writeFileSync(m.settings, settings);
  fs.mkdirSync(m.state, { recursive: true });
  fs.chmodSync(m.state, 0o500);
  try {
    for (const args of [['allow', 'mcp__fabric'], ['remove', 'mcp__observatory'], ['mode', 'plan']]) {
      const r = m.run(...args);
      assert.equal(r.status, 1, args.join(' '));
      assert.match(r.stderr, /permissions\.json cannot be written/);
      assert.equal(fs.readFileSync(m.settings, 'utf8'), settings);
    }
  } finally { fs.chmodSync(m.state, 0o700); }
});

test("PC-125: a set rule the person denies is shown as theirs, never as installed by PassionCode", () => {
  const m = machine();
  fs.writeFileSync(m.settings, JSON.stringify({ permissions: { deny: ['mcp__fabric'] } }));
  const text = m.run().stdout;
  assert.match(text, /PassionCode's rules:\n {2}denied {3}mcp__fabric \(.*; not in the ledger \(set before it, or by hand\)\)/);
  assert.doesNotMatch(text, /Installed by PassionCode/);
});

test('PC-125: usage errors exit 2', () => {
  const m = machine();
  for (const args of [['allow'], ['mode'], ['mode', 'plan', 'auto'], ['frob'], ['--by'], ['allow', 'mcp__fabric', '--by', 'x\ny'], ['allow', 'mcp__fabric', '--by', 'a\u202eb'], ['allow', 'mcp__fabric', '--by', '   '], ['--by', 'x'], ['--nope']]) {
    assert.equal(m.run(...args).status, 2, args.join(' '));
  }
  assert.equal(m.run('mode', 'plan', '--by', '\u{1F600}'.repeat(80)).status, 0, '80 characters are counted as characters');
  assert.equal(m.run('mode', 'plan', '--by', '\u{1F600}'.repeat(81)).status, 2, '81 are refused');
  assert.equal(m.json('mode', 'auto', '--by', '  X  ').mode.changed.by, 'X', 'who asked is trimmed');
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
  fs.chmodSync(path.join(m.state, 'permissions.json'), 0o644);
  m.json('allow', 'mcp__fabric');
  assert.equal(fs.statSync(path.join(m.state, 'permissions.json')).mode & 0o777, 0o600, 'and private again after it was opened up');
});
