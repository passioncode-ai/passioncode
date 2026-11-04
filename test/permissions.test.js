'use strict';
// PC-117: setup merges PassionCode's permission rules into Claude Code's settings and loses nothing there.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const P = require('../lib/permissions');

const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-perm-')), '.claude', 'settings.json');
const write = (file, doc) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, typeof doc === 'string' ? doc : JSON.stringify(doc, null, 2)); };

test('PC-117: the rule set names the MCP servers PassionCode registers', () => {
  assert.deepEqual([...P.RULES], ['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard', 'mcp__observatory']);
});

test('PC-117: a missing settings file gets the rules, and only them', () => {
  const file = tmp();
  assert.deepEqual(P.missing(file), { rules: [...P.RULES], error: null });
  assert.deepEqual(P.apply(file), [...P.RULES]);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { permissions: { allow: [...P.RULES] } });
});

test('PC-117: every existing key, rule and order is kept; a second run adds nothing and writes nothing', () => {
  const file = tmp();
  const before = {
    model: 'opus', env: { A: '1' }, hooks: { Stop: [] },
    permissions: { allow: ['Bash(npm test)', 'mcp__observatory'], deny: ['Bash(rm -rf:*)'], ask: ['WebFetch'], defaultMode: 'acceptEdits', additionalDirectories: ['/x'] },
  };
  write(file, before);
  assert.deepEqual(P.missing(file).rules, ['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard']);
  assert.deepEqual(P.apply(file), ['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard']);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(after, { ...before, permissions: { ...before.permissions, allow: ['Bash(npm test)', 'mcp__observatory', 'mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard'] } });
  const bytes = fs.readFileSync(file);
  const mtime = fs.statSync(file).mtimeMs;
  assert.deepEqual(P.apply(file), []);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.equal(fs.statSync(file).mtimeMs, mtime, 'nothing was written');
  assert.deepEqual(P.missing(file), { rules: [], error: null });
});

test('PC-117: a rule the person denies is not added', () => {
  const file = tmp();
  write(file, { permissions: { deny: ['mcp__fabric'] } });
  assert.ok(!P.missing(file).rules.includes('mcp__fabric'));
  P.apply(file);
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(doc.permissions.deny, ['mcp__fabric']);
  assert.ok(!doc.permissions.allow.includes('mcp__fabric'));
});

test('PC-117: a settings file that cannot be read is named and never written', () => {
  for (const [body, why] of [
    ['{ not json', /is not valid JSON/],
    ['[]', /does not hold a settings object/],
    [JSON.stringify({ permissions: [] }), /"permissions" is not an object/],
    [JSON.stringify({ permissions: { allow: 'mcp__fabric' } }), /"permissions.allow" is not a list/],
    [JSON.stringify({ permissions: { deny: {} } }), /"permissions.deny" is not a list/],
    ['null', /does not hold a settings object/],
    ['1', /does not hold a settings object/],
    [JSON.stringify({ permissions: null }), /"permissions" is not an object/],
    [JSON.stringify({ permissions: 'x' }), /"permissions" is not an object/],
  ]) {
    const file = tmp();
    write(file, body);
    const m = P.missing(file);
    assert.deepEqual(m.rules, []);
    assert.match(m.error, why);
    assert.throws(() => P.apply(file), why);
    assert.equal(fs.readFileSync(file, 'utf8'), body, 'the file is left as it was');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['settings.json'], 'no temporary file is left');
  }
});

test('PC-117: a settings file that is a link is written where it points, keeping its permission bits', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(dir, { recursive: true });
  const real = path.join(dir, 'dotfiles-settings.json');
  fs.writeFileSync(real, JSON.stringify({ env: { TOKEN_NAME: 'x' } }), { mode: 0o600 });
  fs.chmodSync(real, 0o600);
  const link = path.join(dir, 'settings.json');
  fs.symlinkSync(real, link);
  assert.deepEqual(P.apply(link), [...P.RULES]);
  assert.ok(fs.lstatSync(link).isSymbolicLink(), 'the link is kept');
  assert.equal(fs.statSync(real).mode & 0o777, 0o600, 'the mode is kept');
  const text = fs.readFileSync(real, 'utf8');
  assert.ok(text.endsWith('}\n'), 'one trailing newline');
  assert.deepEqual(JSON.parse(text), { env: { TOKEN_NAME: 'x' }, permissions: { allow: [...P.RULES] } });
  assert.deepEqual(fs.readdirSync(dir).sort(), ['dotfiles-settings.json', 'settings.json']);
});

test('PC-117: a write that fails leaves the settings and no temporary file', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root writes anyway') }, () => {
  const file = tmp();
  write(file, { model: 'opus' });
  fs.chmodSync(path.dirname(file), 0o500);
  try {
    assert.throws(() => P.apply(file), /EACCES|EPERM/);
  } finally {
    fs.chmodSync(path.dirname(file), 0o700);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { model: 'opus' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['settings.json']);
});
