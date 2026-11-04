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

// A home folder whose own bin holds the agents' commands the PC-119 tests name, as an agent installs them.
const OWN = ['own-cli', 'own-agent-exempt', 'own-app', 'b-cli', 'a-agent-sync', 'a-cli'];
const CTX = (() => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-home-'));
  const bin = path.join(home, '.local', 'bin');
  fs.mkdirSync(bin, { recursive: true });
  for (const name of OWN) fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n', { mode: 0o755 });
  return { home, pathEnv: [bin, ...String(process.env.PATH).split(path.delimiter)].join(path.delimiter), platform: process.platform };
})();

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

test('PC-119: the launcher carries only rules any person may want, each saying what it allows', () => {
  assert.deepEqual(P.COMMANDS.map((r) => r.rule), ['Bash(gh pr merge:*)']);
  for (const r of P.COMMANDS) assert.ok(r.why.length > 10 && r.why.length <= 200, r.rule);
  assert.match(P.COMMANDS[0].why, /cannot be limited to your repositories/);
});

test('PC-119: a declared rule is offered only when it allows no more than it says', () => {
  for (const ok of ['Bash(make deploy)', 'Bash(own-cli status *)', 'Bash(own-agent-exempt:*)', 'Bash(python3 tool.py sync)', 'Bash(bash -c ls)', 'Bash(git log --oneline)']) {
    assert.equal(P.refusal(ok, CTX), null, ok);
  }
  for (const [no, why] of [
    ['Bash(*)', /any command$/], ['Bash(:*)', /any command$/], ['Bash(python3 *)', /wildcard over python could run any code/], ['Bash(uv run *)', /wildcard over uv could run/],
    ['Bash(npx:*)', /wildcard over npx could run/], ['Bash(python3 tool.py:*)', /wildcard over python/], ['Bash(gh:*)', /any command of gh/], ['Bash(rm:*)', /any command of rm/], ['Bash(curl *)', /any command of curl/],
    ['Bash(gh *pr)', /only at the end/], ['Bash(own-cli status*)', /needs :\* or a space before it/],
    // A runner or a wrapper written another way, or given an option, could run any code.
    ['Bash(/bin/bash -c:*)', /plain name/], ['Bash(Bash -c:*)', /plain name/], ['Bash(/usr/bin/env bash:*)', /plain name/],
    ['Bash(env -i bash:*)', /env runs another program/], ['Bash(sudo -u root:*)', /sudo runs another program/],
    ['Bash(command bash:*)', /command runs another program/], ['Bash(nohup sh:*)', /nohup runs another program/],
    ['Bash(cmd.exe /c:*)', /wildcard over cmd/], ['Bash(osascript -e:*)', /wildcard over osascript/],
    ['Bash(bash -c ls:*)', /wildcard over bash/], ['Bash(python3 -m pip:*)', /wildcard over python/],
    ['Bash(uv run app sync:*)', /wildcard over uv/], ['Bash(find src docs:*)', /wildcard over find/], ['Bash(ssh myhost uptime:*)', /wildcard over ssh/], ['Bash(perl5.34 -e:*)', /wildcard over perl/], ['Bash(python3.12 -c:*)', /wildcard over python/], ['Bash(node22 -e:*)', /wildcard over node/], ['Bash(xcrun python3:*)', /xcrun runs another program/], ['Bash(tmux new-session:*)', /tmux runs another program/], ['Bash(poetry run app:*)', /wildcard over poetry/], ['Bash(gdb -batch:*)', /gdb runs another/], ['Bash(gtimeout 5:*)', /gtimeout runs another/], ['Bash(git grep foo src:*)', /wildcard over git/], ['Bash(own-cli\u00a0x sync:*)', /not plain text/], ['Bash(own-cli \u202esync:*)', /not plain text/],
    ['Bash(sh -c "echo:*)', /quote/], ["Bash(bash -c 'ls:*)", /quote/], ['Bash(a\\b)', /escape/], ['Bash(a (b))', /substitution/],
    ['Bash(a $(b))', /substitution/], ['Bash(a `b`)', /substitution/], ['Bash(ls && rm x)', /separator/], ['Bash(a | b)', /separator/], ['Bash(a\nb)', /separator/],
    ['Bash(a > f)', /redirection/], ['Read(**)', /names a command, as Bash/], ['mcp__a__b c', /MCP server's tools are not offered/], [42, /not text/],
  ]) assert.match(P.refusal(no, CTX) || '', why, String(no));
});

test('PC-119: rules agents declare on the machine are read, and what is not offered is named', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  assert.deepEqual(P.declared(dir, CTX), { rules: [], refused: [], sources: {} }, 'no folder: nothing declared');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'b-agent.json'), JSON.stringify({ by: 'B Agent', rules: [
    { rule: 'Bash(b-cli sync:*)', why: 'let B Agent sync its data' },
    { rule: 'Bash(python3 *)', why: 'anything' },
    { rule: 'Bash(b-cli list)' },
    { rule: 'Bash(b-cli show)', why: 'x'.repeat(201) },
    'Bash(b-cli raw)',
  ] }));
  fs.writeFileSync(path.join(dir, 'a-agent.json'), JSON.stringify({ by: ' A Agent ', rules: [{ rule: 'Bash(a-agent-sync:*)', why: ' sync A Agent ' }] }));
  fs.writeFileSync(path.join(dir, 'broken.json'), '{ no');
  fs.writeFileSync(path.join(dir, 'nobody.json'), JSON.stringify({ rules: [] }));
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ignored');
  const got = P.declared(dir, CTX);
  assert.deepEqual(got.rules, [
    { rule: 'Bash(a-agent-sync:*)', why: 'sync A Agent', by: 'A Agent' },
    { rule: 'Bash(b-cli sync:*)', why: 'let B Agent sync its data', by: 'B Agent' },
  ]);
  assert.equal(got.refused.length, 6, got.refused.join('\n'));
  assert.match(got.refused.join('\n'), /b-agent\.json: Bash\(python3 \*\): a wildcard over python could run any code/);
  assert.match(got.refused.join('\n'), /b-agent\.json: Bash\(b-cli list\): "why" says what it allows, in 1 to 200 characters/);
  assert.match(got.refused.join('\n'), /b-agent\.json: Bash\(b-cli show\): "why"/);
  assert.match(got.refused.join('\n'), /b-agent\.json: a rule is not an object/);
  assert.match(got.refused.join('\n'), /broken\.json cannot be read/);
  assert.match(got.refused.join('\n'), /nobody\.json does not say who declares it/);
});

test('PC-119: command rules merge like the tool rules, keeping what is there', () => {
  const file = tmp();
  write(file, { permissions: { allow: ['mcp__fabric'], ask: ['Bash(b-cli sync:*)'] } });
  const wanted = ['Bash(gh pr merge:*)', 'Bash(b-cli sync:*)'];
  assert.deepEqual(P.missing(file, wanted).rules, ['Bash(gh pr merge:*)']);
  assert.deepEqual(P.apply(file, wanted), ['Bash(gh pr merge:*)']);
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).permissions, { allow: ['mcp__fabric', 'Bash(gh pr merge:*)'], ask: ['Bash(b-cli sync:*)'] });
  assert.deepEqual(P.apply(file, wanted), []);
});

test('PC-119: a declaration whose name or reason holds a control or format character is not offered', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A', rules: [{ rule: 'Bash(a-cli sync:*)', why: 'sync\u001b[2K the data' }] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ by: 'B\rPassionCode', rules: [{ rule: 'Bash(b-cli sync:*)', why: 'sync' }] }));
  const got = P.declared(dir, CTX);
  assert.deepEqual(got.rules, []);
  assert.equal(got.refused.length, 2, got.refused.join('\n'));
});

test('PC-119: an invisible or line-breaking character in a rule is refused, so the plan shows what is allowed', () => {
  for (const rule of ['Bash(gh pr \u009b2J:*)', 'Bash(gh pr merge:*)', 'Bash(gh pr\u0085merge:*)', 'Bash(gh pr merge:*)']) {
    assert.match(P.refusal(rule, CTX) || '', /quote, an escape|not plain text/, JSON.stringify(rule));
  }
  assert.equal(P.refusal('Bash(bash -c ls)', CTX), null, 'an exact rule allows only its own text');
});

test('PC-119: every program on the lists is refused as the lists say, and a declared MCP rule is not offered', () => {
  for (const name of P.RUNNERS) assert.match(P.refusal(`Bash(${name} a b:*)`, CTX) || '', /could run any code/, name);
  for (const name of P.WRAPPERS) assert.match(P.refusal(`Bash(${name} a b:*)`, CTX) || '', /runs another program/, name);
  for (const name of P.BROAD) assert.match(P.refusal(`Bash(${name}:*)`, CTX) || '', /any command of|could run any code|runs another/, name);
  for (const rule of ['Bash(rundll32 shell32.dll,ShellExec_RunDLL:*)', 'Bash(sqlite3 app.db:*)', 'Bash(ssh-agent:*)', 'Bash(sandbox-exec:*)', 'Bash(scp -r:*)', 'Bash(nodejs:*)']) {
    assert.ok(P.refusal(rule, CTX), rule);
  }
  assert.match(P.refusal('mcp__ide', CTX) || '', /an MCP server's tools are not offered here/);
});

test('PC-119: a wildcard is offered only over a command installed in the home folder; an exact rule over a wrapper never', { skip: process.platform === 'win32' && 'POSIX links and modes' }, () => {
  const bin = path.join(CTX.home, '.local', 'bin');
  fs.symlinkSync('/bin/sh', path.join(bin, 'own-sh')); // a link in the home folder to a program the system ships
  fs.writeFileSync(path.join(bin, 'own-noexec'), 'x', { mode: 0o644 });
  assert.match(P.refusal('Bash(own-sh x y:*)', CTX) || '', /own-sh is installed outside your home folder/);
  assert.match(P.refusal('Bash(own-missing sync:*)', CTX) || '', /own-missing is not found on PATH/);
  assert.match(P.refusal('Bash(own-noexec sync:*)', CTX) || '', /own-noexec is not found on PATH/);
  assert.match(P.refusal('Bash(ls -la *)', CTX) || '', /ls is installed outside your home folder/);
  assert.equal(P.refusal('Bash(ls -la)', CTX), null, 'an exact rule over a system program allows only its own text');
  for (const exact of ['Bash(sudo make install)', 'Bash(env foo)', 'Bash(apply echo x)']) assert.match(P.refusal(exact, CTX) || '', /runs another program/, exact);
  for (const rule of ['Bash(pip3 install x:*)', 'Bash(claude -p:*)', 'Bash(launchctl asuser:*)', 'Bash(codex exec:*)', 'Bash(view -c:*)', 'Bash(python3.13t -c:*)', 'Bash(python3.12-intel64 -c:*)']) {
    assert.match(P.refusal(rule, CTX) || '', /could run any code/, rule);
  }
  for (const rule of ['Bash(lockf f:*)', 'Bash(taskpolicy -b:*)', 'Bash(chrt -o 0:*)', 'Bash(coproc:*)', 'Bash(noglob:*)', 'Bash(pcalua -a:*)']) {
    assert.match(P.refusal(rule, CTX) || '', /runs another program/, rule);
  }
});

test('PC-119: PATH is read as a shell in any folder reads it, so a name cannot resolve one way for setup and another for Claude Code', { skip: process.platform === 'win32' && 'POSIX paths and modes' }, () => {
  const bin = path.join(CTX.home, '.local', 'bin');
  const at = (pathEnv, home = CTX.home) => ({ home, pathEnv, platform: process.platform });
  // An empty or relative entry is the shell's folder, not setup's.
  for (const pathEnv of [`:${bin}:/usr/bin`, `bin${path.delimiter}${bin}`, `.${path.delimiter}${bin}`]) {
    assert.match(P.refusal('Bash(own-cli status *)', at(pathEnv)) || '', /empty or relative folder/, pathEnv);
  }
  // `..` after a link is resolved by the kernel, physically.
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-out-'));
  fs.mkdirSync(path.join(out, 'a'));
  fs.mkdirSync(path.join(out, 'bin'));
  fs.writeFileSync(path.join(out, 'bin', 'own-c'), '#!/bin/sh\n', { mode: 0o755 });
  fs.mkdirSync(path.join(CTX.home, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(CTX.home, 'bin', 'own-c'), '#!/bin/sh\n', { mode: 0o755 });
  fs.symlinkSync(path.join(out, 'a'), path.join(CTX.home, 'link'));
  assert.match(P.refusal('Bash(own-c x:*)', at(`${CTX.home}/link/../bin`)) || '', /outside your home folder/);
  // A file the user cannot execute is skipped, as the shell skips it, so the system's program is the one found.
  if (process.getuid?.() !== 0) {
    const shadow = path.join(CTX.home, 'bin4');
    fs.mkdirSync(shadow);
    fs.writeFileSync(path.join(shadow, 'ls'), '#!/bin/sh\n', { mode: 0o645 });
    fs.chmodSync(path.join(shadow, 'ls'), 0o645);
    assert.match(P.refusal('Bash(ls -la *)', at(`${shadow}${path.delimiter}/bin`)) || '', /outside your home folder/);
  }
  // A home folder at the root holds every program, so it holds none for this check.
  assert.match(P.refusal('Bash(ls -la *)', at('/bin', '/')) || '', /your home folder is the root folder/);
  fs.rmSync(out, { recursive: true, force: true });
});

test('PC-119: a control character in a declaration is named as the reason', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A\tB', rules: [] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ by: 'B', rules: [{ rule: 'Bash(b-cli sync:*)', why: 'sync\tall' }, { rule: 'Bash(a-cli sync:*)', why: 'sync\n' }] }));
  const { refused } = P.declared(dir, CTX);
  assert.match(refused.join('\n'), /a\.json: "by" holds a control or format character/);
  assert.match(refused.join('\n'), /b\.json: Bash\(b-cli sync:\*\): "why" holds a control or format character/);
  assert.match(refused.join('\n'), /b\.json: Bash\(a-cli sync:\*\): "why" holds a control or format character/, 'a line break at the end counts too');
});

test('PC-119: a refusal line never carries a control character from the declaration it repeats', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A', rules: [{ rule: 'Bash(x\u001b[3A\u001b[2K:*)', why: 'x' }] }));
  fs.writeFileSync(path.join(dir, 'b.json'), '\u001b[3A\r\n\t\u009b\u2028\u202e\u001b[2Kgarbage');
  if (process.platform !== 'win32') fs.writeFileSync(path.join(dir, 'c\u001b[2K.json'), JSON.stringify({ by: 'C', rules: 1 }));
  const { refused } = P.declared(dir, CTX);
  assert.equal(refused.length, process.platform === 'win32' ? 2 : 3);
  for (const line of refused) assert.doesNotMatch(line, /[\u0000-\u001f\u007f-\u009f]/, JSON.stringify(line));
  assert.match(refused.join('\n'), /\\u001b\[3A/, 'the character is written as its escape');
});

test('PC-119: the programs added to the lists in this release are refused as their list says', () => {
  for (const name of ['trap', 'enable', 'watchexec', 'rlwrap', 'faketime', 'torsocks', 'numactl', 'cpulimit', 'runcon', 'dotenvx']) {
    assert.match(P.refusal(`Bash(${name} x)`, CTX) || '', /runs another program/, name);
  }
  for (const name of ['rustup', 'pm2', 'proto', 'aqua', 'goenv', 'jenv', 'xonsh', 'nu', 'elvish', 'mksh', 'yash', 'op', 'aws-vault', 'doppler']) {
    assert.match(P.refusal(`Bash(${name} run:*)`, CTX) || '', /could run any code/, name);
  }
});

test('PC-119: a format character that reorders text is refused like a control character, and repeating the launcher rule changes nothing', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A', rules: [{ rule: 'Bash(own-cli sync:*)', why: 'sync \u202eall' }, { rule: 'Bash(gh pr merge:*)' }] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ by: 'B\u200b', rules: [] }));
  const { rules, refused } = P.declared(dir, CTX);
  assert.deepEqual(rules, []);
  assert.equal(refused.length, 2, refused.join('\n'));
  assert.match(refused.join('\n'), /a\.json: Bash\(own-cli sync:\*\): "why" holds a control or format character/);
  assert.match(refused.join('\n'), /b\.json: "by" holds a control or format character/);
  assert.doesNotMatch(refused.join('\n'), /gh pr merge/, 'the launcher rule declared again is not refused');
});

test('PC-119: shown() writes every control and format character as its escape, and "by" is at most 80 characters', () => {
  assert.equal(P.shown('a\r\n\t\u001b\u009b\u2028\u202eb'), 'a\\u000d\\u000a\\u0009\\u001b\\u009b\\u2028\\u202eb');
  assert.equal(P.shown(P.shown('a\u001bb')), P.shown('a\u001bb'), 'escaping twice changes nothing');
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A'.repeat(81), rules: [{ rule: 'Bash(own-cli sync:*)', why: 'sync' }] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ by: 'B\u2028', rules: [] }));
  const { rules, refused } = P.declared(dir, CTX);
  assert.deepEqual(rules, []);
  assert.match(refused.join('\n'), /a\.json does not say who declares it \("by", 1 to 80 characters\)/);
  assert.match(refused.join('\n'), /b\.json: "by" holds a control or format character/);
});

test('PC-119: on Windows a name is looked up as Git Bash runs it, itself or .exe, never a .cmd of that name', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-'));
  const own = path.join(home, 'bin'), sys = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-sys-'));
  fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, 'tool.cmd'), '@echo off\n', { mode: 0o755 });
  fs.writeFileSync(path.join(sys, 'tool.exe'), 'MZ', { mode: 0o755 });
  fs.writeFileSync(path.join(own, 'mine.exe'), 'MZ', { mode: 0o755 });
  const ctx = { home, pathEnv: [own, sys].join(path.delimiter), platform: 'win32' };
  assert.match(P.refusal('Bash(tool run:*)', ctx) || '', /tool is installed outside your home folder/);
  assert.equal(P.refusal('Bash(mine run:*)', ctx), null);
});

test('PC-119: every invisible or reordering character is refused by its Unicode class, and shown() escapes it whole', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  const hidden = ['\u061c', '\u2066', '\u2069', '\ufeff', '\u00ad', '\u180e', '\ufff9', '\u206a', '\u{E0049}', '\u3164', '\ufe0f', '\u034f', '\u2029'];
  hidden.forEach((c, n) => fs.writeFileSync(path.join(dir, `w${String(n).padStart(2, '0')}.json`), JSON.stringify({ by: 'W', rules: [{ rule: `Bash(own-cli w${n}:*)`, why: `sync${c}` }] })));
  fs.writeFileSync(path.join(dir, 'x.json'), JSON.stringify({ by: `X\u{E0041}`, rules: [] }));
  fs.writeFileSync(path.join(dir, 'y.json'), JSON.stringify({ by: 'Y'.repeat(80), rules: [{ rule: 'Bash(own-cli y:*)', why: 'sync' }] }));
  fs.writeFileSync(path.join(dir, 'z.json'), JSON.stringify({ by: '\u{1F600}'.repeat(41), rules: [] }));
  const { rules, refused } = P.declared(dir, CTX);
  assert.deepEqual(rules.map((r) => r.rule), ['Bash(own-cli y:*)'], 'a by of 80 characters is offered');
  assert.equal(refused.filter((l) => /"why" holds a control or format character/.test(l)).length, hidden.length);
  assert.match(refused.join('\n'), /x\.json: "by" holds a control or format character/);
  assert.doesNotMatch(refused.join('\n'), /z\.json/, '41 emoji are 41 characters, within 80');
  assert.equal(P.shown('a\u{E0049}b'), 'a\\u{e0049}b');
  assert.equal(P.shown(P.shown('a\u{E0049}\u202eb')), P.shown('a\u{E0049}\u202eb'));
});

test('PC-119: a rule two files declare is offered once, as the first says it, and the second is listed', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'First', rules: [{ rule: 'Bash(own-cli dup:*)', why: 'one' }] }));
  fs.writeFileSync(path.join(dir, 'b.json'), JSON.stringify({ by: 'Second', rules: [{ rule: 'Bash(own-cli dup:*)', why: 'two' }] }));
  const { rules, refused } = P.declared(dir, CTX);
  assert.deepEqual(rules, [{ rule: 'Bash(own-cli dup:*)', why: 'one', by: 'First' }]);
  assert.match(refused.join('\n'), /b\.json: Bash\(own-cli dup:\*\) is the same rule First declares; it is counted once/);
  fs.writeFileSync(path.join(dir, 'c.json'), JSON.stringify({ by: 'Third', rules: [{ rule: 'Bash(own-cli two:*)', why: 'a' }, { rule: 'Bash(own-cli two:*)', why: 'b' }] }));
  fs.writeFileSync(path.join(dir, '0.json'), JSON.stringify({ by: 'Zero', rules: [{ rule: 'Bash(own-cli bad:*)', why: '' }] }));
  fs.writeFileSync(path.join(dir, 'd.json'), JSON.stringify({ by: 'Fourth', rules: [{ rule: 'Bash(own-cli bad:*)', why: 'valid' }] }));
  const again = P.declared(dir, CTX);
  assert.match(again.refused.join('\n'), /c\.json: Bash\(own-cli two:\*\) is declared twice in this file; it is counted once/);
  assert.deepEqual(again.rules.find((r) => r.rule === 'Bash(own-cli bad:*)'), { rule: 'Bash(own-cli bad:*)', why: 'valid', by: 'Fourth' }, 'the first file not refused for it says it');
  assert.equal(again.rules.every((r) => !('file' in r)), true);
  fs.writeFileSync(path.join(dir, 'e.json'), JSON.stringify({ by: 'Fifth', rules: [{ rule: 'Bash(own-cli dup:*)', why: 'x' }, { rule: 'Bash(own-cli dup:*)', why: 'y' }] }));
  const lines = P.declared(dir, CTX).refused.filter((l) => /e\.json: Bash\(own-cli dup:\*\)/.test(l));
  assert.equal(lines.length, 1, 'the same line said twice is listed once');
});

test('PC-119: on Windows a .cmd or .bat takes no wildcard, and a file Git Bash would not run is skipped', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-'));
  const own = path.join(home, 'bin'), sys = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-sys-'));
  fs.mkdirSync(own);
  fs.writeFileSync(path.join(own, 'tool.cmd'), '@echo off\n');
  fs.writeFileSync(path.join(own, 'data'), 'plain text');
  fs.writeFileSync(path.join(sys, 'data.exe'), 'MZ');
  fs.writeFileSync(path.join(own, 'own-script'), '#!/bin/sh\n');
  const ctx = { home, pathEnv: [own, sys].join(path.delimiter), platform: 'win32' };
  assert.match(P.refusal('Bash(tool.cmd run:*)', ctx) || '', /runs through cmd/);
  assert.match(P.refusal('Bash(tool.bat run:*)', ctx) || '', /runs through cmd/);
  fs.writeFileSync(path.join(sys, 'native'), 'MZ');
  fs.writeFileSync(path.join(own, 'native'), '#!/bin/sh\n');
  assert.match(P.refusal('Bash(native run:*)', { ...ctx, pathEnv: [sys, own].join(path.delimiter) }) || '', /native is installed outside your home folder/, 'a bare MZ file is a program');
  assert.equal(P.refusal('Bash(tool.cmd run)', ctx), null, 'an exact rule allows only its own text');
  assert.match(P.refusal('Bash(data run:*)', ctx) || '', /data is installed outside your home folder/);
  assert.equal(P.refusal('Bash(own-script run:*)', ctx), null);
});

test('PC-119: "why" is counted in code points, 200 at most', () => {
  const dir = path.join(path.dirname(tmp()), 'rules.d');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify({ by: 'A', rules: [{ rule: 'Bash(own-cli a:*)', why: '\u{1F600}'.repeat(200) }, { rule: 'Bash(own-cli b:*)', why: '\u{1F600}'.repeat(201) }] }));
  const { rules, refused } = P.declared(dir, CTX);
  assert.deepEqual(rules.map((r) => r.rule), ['Bash(own-cli a:*)']);
  assert.match(refused.join('\n'), /Bash\(own-cli b:\*\): "why" says what it allows, in 1 to 200 characters/);
});
