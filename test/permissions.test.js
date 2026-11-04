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
    [JSON.stringify({ permissions: { ask: 'mcp__fabric' } }), /"permissions.ask" is not a list/],
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

test('PC-117: the permission bits are kept, whatever the umask; a new file is private', { skip: process.platform === 'win32' && 'POSIX modes' }, () => {
  const old = process.umask(0o077);
  try {
    const file = tmp();
    write(file, { model: 'opus' });
    fs.chmodSync(file, 0o640);
    P.apply(file);
    assert.equal(fs.statSync(file).mode & 0o777, 0o640);
    const fresh = tmp();
    fs.mkdirSync(path.dirname(fresh), { recursive: true });
    P.apply(fresh);
    assert.equal(fs.statSync(fresh).mode & 0o777, 0o600);
  } finally {
    process.umask(old);
  }
  const shared = tmp();
  write(shared, {});
  fs.chmodSync(shared, 0o644);
  const narrow = process.umask(0o077);
  try { P.apply(shared); } finally { process.umask(narrow); }
  assert.equal(fs.statSync(shared).mode & 0o777, 0o644, 'the umask does not narrow it');
});

test('PC-117: a rename that fails leaves the settings and removes the temporary file', () => {
  const file = tmp();
  write(file, { model: 'opus' });
  const rename = fs.renameSync;
  fs.renameSync = () => { throw Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' }); };
  try {
    assert.throws(() => P.apply(file), /ENOSPC/);
  } finally {
    fs.renameSync = rename;
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { model: 'opus' });
  assert.deepEqual(fs.readdirSync(path.dirname(file)), ['settings.json']);
});

test('PC-117: a link to a missing file is kept, and the file is made where it points', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(dir, { recursive: true });
  const link = path.join(dir, 'settings.json');
  fs.symlinkSync(path.join(dir, 'elsewhere.json'), link);
  P.apply(link);
  assert.ok(fs.lstatSync(link).isSymbolicLink());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'elsewhere.json'), 'utf8')), { permissions: { allow: [...P.RULES] } });
});

test('PC-117: a rule the person wants asked about is not added', () => {
  const file = tmp();
  write(file, { permissions: { ask: ['mcp__fabric-dashboards'] } });
  assert.ok(!P.missing(file).rules.includes('mcp__fabric-dashboards'));
  P.apply(file);
  assert.ok(!JSON.parse(fs.readFileSync(file, 'utf8')).permissions.allow.includes('mcp__fabric-dashboards'));
});

test('PC-117: a settings file that exists but cannot be read is named, never treated as empty', () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(path.join(dir, 'settings.json'), { recursive: true }); // a folder where the file should be
  assert.match(P.missing(path.join(dir, 'settings.json')).error, /cannot be read/);
  assert.throws(() => P.apply(path.join(dir, 'settings.json')), /cannot be read/);
  assert.ok(fs.statSync(path.join(dir, 'settings.json')).isDirectory());
});

test('PC-117: a settings file without read permission is named and left as it is', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root reads anyway') }, () => {
  const file = tmp();
  write(file, { model: 'opus' });
  fs.chmodSync(file, 0o000);
  try {
    assert.match(P.missing(file).error, /cannot be read: EACCES/);
    assert.throws(() => P.apply(file), /cannot be read/);
  } finally {
    fs.chmodSync(file, 0o600);
  }
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { model: 'opus' });
});

test('PC-117: a chain of relative links is followed to its end, every link kept', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(path.join(dir, 'dotfiles', 'claude'), { recursive: true });
  const end = path.join(dir, 'dotfiles', 'claude', 'b.json');
  fs.writeFileSync(end, '{}', { mode: 0o600 });
  fs.chmodSync(end, 0o600);
  fs.symlinkSync(path.join('claude', 'b.json'), path.join(dir, 'dotfiles', 'a.json')); // relative to its own folder
  fs.symlinkSync(path.join('dotfiles', 'a.json'), path.join(dir, 'settings.json'));
  const cwd = process.cwd();
  process.chdir(os.tmpdir()); // a relative link resolves from its folder, not from where setup runs
  try { assert.deepEqual(P.apply(path.join(dir, 'settings.json')), [...P.RULES]); } finally { process.chdir(cwd); }
  assert.ok(fs.lstatSync(path.join(dir, 'settings.json')).isSymbolicLink());
  assert.ok(fs.lstatSync(path.join(dir, 'dotfiles', 'a.json')).isSymbolicLink());
  assert.deepEqual(JSON.parse(fs.readFileSync(end, 'utf8')), { permissions: { allow: [...P.RULES] } });
  assert.equal(fs.statSync(end).mode & 0o777, 0o600);
  assert.deepEqual(fs.readdirSync(path.join(dir, 'dotfiles', 'claude')), ['b.json']);
});

test('PC-117: a loop of links is named, never written', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync('b.json', path.join(dir, 'settings.json'));
  fs.symlinkSync('settings.json', path.join(dir, 'b.json'));
  assert.ok(P.missing(path.join(dir, 'settings.json')).error, 'a loop cannot be read');
  assert.throws(() => P.apply(path.join(dir, 'settings.json')));
  assert.ok(fs.lstatSync(path.join(dir, 'settings.json')).isSymbolicLink());
});

test('PC-117: a link in a linked folder whose target climbs with .. is written where the system says it ends', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const root = path.dirname(path.dirname(tmp()));
  fs.mkdirSync(path.join(root, 'dotfiles', 'claude-config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dotfiles', 'shared'), { recursive: true });
  const real = path.join(root, 'dotfiles', 'shared', 'settings.json');
  fs.writeFileSync(real, JSON.stringify({ model: 'opus' }));
  fs.symlinkSync(path.join(root, 'dotfiles', 'claude-config'), path.join(root, '.claude')); // the folder is a link
  fs.symlinkSync(path.join('..', 'shared', 'settings.json'), path.join(root, 'dotfiles', 'claude-config', 'settings.json'));
  const file = path.join(root, '.claude', 'settings.json');
  assert.deepEqual(P.missing(file).rules, [...P.RULES]);
  assert.deepEqual(P.apply(file), [...P.RULES]);
  assert.deepEqual(JSON.parse(fs.readFileSync(real, 'utf8')), { model: 'opus', permissions: { allow: [...P.RULES] } });
  assert.ok(!fs.existsSync(path.join(root, 'shared')), 'no stray copy beside the linked folder');
  assert.deepEqual(P.apply(file), [], 'a second run adds nothing');
});

test('PC-117: a loop of links met while walking to a missing end is named', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const dir = path.dirname(tmp());
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync('b.json', path.join(dir, 'settings.json'));
  fs.symlinkSync('settings.json', path.join(dir, 'b.json'));
  const realpath = fs.realpathSync;
  // The system names a loop itself; a file changed under the walk could still make one, which the walk names too.
  fs.realpathSync = (p) => { if (p === path.join(dir, 'settings.json')) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }); return realpath(p); };
  try {
    assert.throws(() => P.endOf(path.join(dir, 'settings.json')), /too many levels of links/);
  } finally {
    fs.realpathSync = realpath;
  }
});

test('PC-117: a link in a linked folder to a missing file that climbs with .. makes the file where the system says', { skip: process.platform === 'win32' && 'POSIX links' }, () => {
  const root = path.dirname(path.dirname(tmp()));
  fs.mkdirSync(path.join(root, 'dotfiles', 'claude-config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'dotfiles', 'shared'), { recursive: true });
  fs.symlinkSync(path.join(root, 'dotfiles', 'claude-config'), path.join(root, '.claude'));
  fs.symlinkSync(path.join('..', 'shared', 'settings.json'), path.join(root, 'dotfiles', 'claude-config', 'settings.json'));
  const file = path.join(root, '.claude', 'settings.json');
  assert.deepEqual(P.apply(file), [...P.RULES]);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'dotfiles', 'shared', 'settings.json'), 'utf8')), { permissions: { allow: [...P.RULES] } });
  assert.ok(!fs.existsSync(path.join(root, 'shared')), 'no stray file beside the linked folder');
  assert.ok(fs.lstatSync(path.join(root, 'dotfiles', 'claude-config', 'settings.json')).isSymbolicLink());
  assert.deepEqual(P.apply(file), []);
});
