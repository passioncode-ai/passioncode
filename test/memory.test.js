'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-178, round 4: the launcher never relays obsidian-wiki's own hints. Every hint obsidian-wiki 2026.11.4 can give
// (test/fixtures/obsidian-wiki-2026.11.4-hints.json, copied from its cli.py doctor and hooks.py) becomes one of the
// commands on the allowlist or a fixed text, which names obsidian-wiki setup, a bare hooks install and the wiki-setup
// skill only to say never.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const M = require('../lib/memory');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'obsidian-wiki-2026.11.4-hints.json'), 'utf8'));
const NPX = 'npx @passioncode-ai/passioncode@latest';
// The prohibition the fixed texts carry, and what follows it, is taken off before the forbidden words are looked for.
const withoutProhibition = (s) => s.replace(/; never `obsidian-wiki setup`.*$/, '');

test('PC-178: no hint of obsidian-wiki 2026.11.4 comes out as a step that runs its setup, its setup skill or a bare hooks install', () => {
  const out = [];
  for (const check of FIXTURE.checks) {
    for (const hint of FIXTURE.hints) {
      for (const status of ['warn', 'fail']) out.push(M.fixFor({ name: check, status, hint, detail: 'sample detail' }, NPX));
    }
  }
  out.push(M.fixFor({ name: 'session-hooks', status: 'warn', hint: FIXTURE.hints[FIXTURE.hints.length - 1], detail: 'registered, but hooks cannot reach the package' }, NPX));
  assert.ok(out.length > 500);
  for (const fix of out) {
    assert.equal(typeof fix, 'string');
    const said = withoutProhibition(fix);
    for (const word of ['obsidian-wiki setup', 'wiki-setup', 'setup skill']) assert.ok(!said.includes(word), `${word}: ${fix}`);
    const install = said.match(/obsidian-wiki hooks install(.{0,22})/);
    assert.ok(!install || install[1].startsWith(' --only SessionStart'), fix);
    assert.ok(!/`obsidian-wiki doctor`|`obsidian-wiki hooks status`/.test(fix), `never a bare doctor or hooks status: ${fix}`);
    // Every command it names is on the allowlist.
    for (const [, cmd] of fix.matchAll(/`([^`]+)`/g)) {
      if (/^obsidian-wiki setup$|^obsidian-wiki hooks install$/.test(cmd)) continue; // named only after "never"
      assert.ok(M.ALLOWED.some((a) => cmd === a || cmd.startsWith(`${a} `)) || cmd === `${NPX} setup --with wiki`, `${cmd} in ${fix}`);
    }
  }
});

test('PC-178: the fixed texts: setup-version, missing files, the SessionStart hook, and every other check', () => {
  assert.equal(M.fixFor({ name: 'setup-version', status: 'warn', hint: 'run: obsidian-wiki setup', detail: 'x' }, NPX), M.REFRESH);
  assert.equal(M.fixFor({ name: 'vault-core-files', status: 'warn', hint: 'run the wiki setup skill or create the missing files', detail: 'missing: index.md' }, NPX),
    `create the missing files by hand (missing: index.md); ${M.NEVER}`);
  assert.equal(M.fixFor({ name: 'vault-path', status: 'fail', hint: 'fix OBSIDIAN_VAULT_PATH or re-run setup', detail: 'vault directory missing' }, NPX),
    `obsidian-wiki reports vault-path fail: vault directory missing; read \`obsidian-wiki doctor --json\` (its session-hooks hint asking for a bare hooks install is expected: the launcher registers only SessionStart); ${M.NEVER}`);
});

test('PC-178: versions are compared by their leading x.y.z; a suffix the launcher cannot order is unknown, never a reinstall', () => {
  const pin = M.PIN;
  assert.equal(M.versionAgainstPin('2026.12.0.post1'), 'ahead');
  assert.equal(M.versionAgainstPin('2026.12.0rc1'), 'ahead');
  assert.equal(M.versionAgainstPin('2026.10.2.post1'), 'behind');
  assert.equal(M.versionAgainstPin('2026.10.2'), 'behind');
  assert.equal(M.versionAgainstPin(pin), 'equal');
  assert.equal(M.versionAgainstPin(`${pin}.post1`), 'unknown');
  assert.equal(M.versionAgainstPin(`${pin}rc1`), 'unknown');
  assert.equal(M.versionAgainstPin(null), 'unknown');
  assert.equal(M.versionAgainstPin('nightly'), 'unknown');
});

// Round 5: the rows doctor builds, in-process, over the fake obsidian-wiki (test/fake-tools.js) in a home of their own.
const os = require('node:os');
// The fake obsidian-wiki and uv are shell-script stand-ins Windows cannot start (as in test/setup.test.js, PC-135).
const SH = process.platform === 'win32' && 'shell-script stand-ins Windows cannot start';
const SCRIPTS = { SessionStart: 'wiki-session-recap.sh', Stop: 'wiki-stop-capture.sh' };
function sandbox(t, { version = M.PIN, vault = true, hooks = ['SessionStart'], env = {} } = {}) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-memory-'));
  const bin = path.join(home, 'bin');
  fs.mkdirSync(bin);
  for (const name of ['obsidian-wiki', 'uv']) fs.writeFileSync(path.join(bin, name), `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-tools.js')}" ${name} "$@"\n`, { mode: 0o755 });
  const state = path.join(home, 'fake-wiki');
  fs.mkdirSync(state);
  fs.writeFileSync(path.join(state, 'version'), version);
  const saved = { ...process.env };
  for (const k of Object.keys(process.env)) if (/^(XDG_|UV_|OBSIDIAN_|FAKE_)/.test(k)) delete process.env[k];
  Object.assign(process.env, { HOME: home, PATH: `${bin}:${path.dirname(process.execPath)}:/usr/bin:/bin`, UV_TOOL_BIN_DIR: bin, FAKE_WIKI_STATE: state, FAKE_TOOLS_QUIET: '1' }, env);
  t.after(() => { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); fs.rmSync(home, { recursive: true, force: true }); });
  const settings = path.join(home, '.claude', 'settings.json');
  fs.mkdirSync(path.dirname(settings), { recursive: true });
  const doc = { hooks: {} };
  // The fake's package holds the scripts (made on its first call); the command names them where they are.
  for (const ev of hooks) doc.hooks[ev] = [{ matcher: '', hooks: [{ type: 'command', command: `bash "${path.join(state, 'uv-tools', 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data', 'hooks', SCRIPTS[ev])}"` }] }];
  fs.writeFileSync(settings, JSON.stringify(doc));
  const vaultDir = path.join(home, 'Wiki');
  if (vault) {
    fs.mkdirSync(vaultDir);
    fs.mkdirSync(path.join(home, '.config', 'obsidian-wiki'), { recursive: true });
    fs.writeFileSync(path.join(home, '.config', 'obsidian-wiki', 'config'), `OBSIDIAN_VAULT_PATH="${vaultDir}"\nOBSIDIAN_WIKI_VERSION="${version}"\n`);
  }
  const rows = (launcherVault = null) => M.checks({ home, NPX, newer: () => false, launcherVault, claude: { here: true, settings } });
  return { home, bin, state, settings, vaultDir, rows };
}
const WRITES = []; // round 6: obsidian-wiki never writes Claude Code's settings file, so no fix hands out its hooks writers
const NAMES_COMMAND = /obsidian-wiki (setup|list|hooks|doctor|memory|info)\b/;

test('PC-178: every memory fix that names an obsidian-wiki command carries the prohibition, unless it is exactly an allowed write', { skip: SH }, (t) => {
  const fixes = [];
  const take = (rows) => { for (const r of rows) if (r.fix) fixes.push(r.fix); };
  for (const check of FIXTURE.checks) for (const hint of FIXTURE.hints) fixes.push(M.fixFor({ name: check, status: 'warn', hint, detail: 'd' }, NPX));
  fixes.push(M.REFRESH);
  {
    const s = sandbox(t, { hooks: [] }); // the intended state's opposite: no SessionStart, no Stop (hooks status exits 1)
    take(s.rows()); take(s.rows(s.vaultDir));
  }
  {
    const s = sandbox(t, { hooks: ['SessionStart', 'Stop'] }); take(s.rows());
  }
  {
    const s = sandbox(t, { env: { FAKE_WIKI_HOOKS_BROKEN: '1' } });
    const rows = s.rows(); take(rows);
    assert.ok(rows.some((r) => r.id === 'memory.hooks' && /could not be read/.test(r.detail)), JSON.stringify(rows));
  }
  {
    const s = sandbox(t);
    const garbage = path.join(s.home, 'garbage');
    fs.writeFileSync(garbage, 'not json');
    process.env.FAKE_WIKI_DOCTOR = garbage;
    const rows = s.rows(); take(rows);
    assert.ok(rows.some((r) => r.id === 'memory.vault' && /could not be read/.test(r.detail)), JSON.stringify(rows));
  }
  {
    const s = sandbox(t, { hooks: [] });
    const target = path.join(s.home, 'dotfiles', 'settings.json');
    fs.mkdirSync(path.dirname(target));
    fs.renameSync(s.settings, target);
    fs.symlinkSync(target, s.settings);
    take(s.rows()); take(s.rows(s.vaultDir));
  }
  assert.ok(fixes.length > 300);
  for (const fix of fixes) {
    if (!NAMES_COMMAND.test(fix)) continue;
    assert.ok(fix.includes(M.NEVER) || WRITES.includes(fix.replace(/^run: /, '')), fix);
  }
});

test('PC-178: hooks status exiting 1 while Stop is not registered still reads (obsidian-wiki does that in the intended state)', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: ['SessionStart'] });
  const h = M.hookState(path.join(s.bin, 'obsidian-wiki'));
  assert.deepEqual([h.error, h.start, h.stop], [undefined, true, false]);
  const fix = s.rows().find((r) => r.id === 'memory.hooks');
  assert.equal(fix.state, 'ok', JSON.stringify(fix));
});

test('PC-178: the config folder is found as obsidian-wiki finds it: an XDG folder that is a link to nothing does not exist', (t) => {
  const s = sandbox(t, { vault: false });
  const legacy = path.join(s.home, '.obsidian-wiki');
  fs.mkdirSync(legacy);
  fs.writeFileSync(path.join(legacy, 'config'), 'OBSIDIAN_VAULT_PATH="/theirs"\n');
  fs.mkdirSync(path.join(s.home, '.config'));
  fs.symlinkSync(path.join(s.home, 'gone'), path.join(s.home, '.config', 'obsidian-wiki'));
  assert.equal(M.configOf(s.home), path.join(legacy, 'config'));
  assert.equal(M.needs(s.home, path.join(s.home, 'Wiki')).vault, false);
});

test('PC-178: the refresh step and a uv copy uv does not list', { skip: SH }, (t) => {
  assert.ok(M.REFRESH.endsWith(M.NEVER), M.REFRESH);
  const s = sandbox(t, { version: '2026.10.2', env: { FAKE_UV_LIST_EMPTY: '1' } });
  const w = s.rows().find((r) => r.id === 'memory.wiki');
  assert.deepEqual([w.repair, w.gate], [null, 'consent']);
  assert.equal(w.fix, `bring it to ${M.PIN} with the tool that installed it (uv does not list it)`);
  delete process.env.FAKE_UV_LIST_EMPTY;
  const u = s.rows().find((r) => r.id === 'memory.wiki');
  assert.deepEqual(u.repair, { kind: 'tool', product: 'wiki' });
});

// Round 6: obsidian-wiki never writes Claude Code's settings file; the launcher's writer does, from the entry obsidian-wiki
// writes in a throwaway home. Its failures leave the file, the link and the temporary folder as they were.
test('PC-178: the hook route refuses a settings file of an unexpected shape, and leaves it as it was', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: [] });
  process.env.TMPDIR = path.join(s.home, 'tmp');
  fs.mkdirSync(process.env.TMPDIR);
  const bin = path.join(s.bin, 'obsidian-wiki');
  for (const doc of ['{"hooks":[]}', '{"hooks":{"SessionStart":{}}}', '{"hooks":{"SessionStart":[{"hooks":{}}]}}', '{"hooks":null}']) {
    fs.writeFileSync(s.settings, doc);
    assert.throws(() => M.hook({ home: s.home, bin }), /hooks/, doc);
    assert.equal(fs.readFileSync(s.settings, 'utf8'), doc);
  }
  assert.deepEqual(fs.readdirSync(process.env.TMPDIR), []);
});

test('PC-178: the hook route\'s failures change nothing: obsidian-wiki fails, writes nothing, half a file, or no SessionStart', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: [] });
  process.env.TMPDIR = path.join(s.home, 'tmp');
  fs.mkdirSync(process.env.TMPDIR);
  const target = path.join(s.home, 'dotfiles', 'settings.json');
  fs.mkdirSync(path.dirname(target));
  fs.renameSync(s.settings, target);
  fs.symlinkSync(target, s.settings);
  const bytes = fs.readFileSync(target);
  const bin = path.join(s.bin, 'obsidian-wiki');
  for (const mode of ['fail', 'nofile', 'partial', 'nostart']) {
    process.env.FAKE_WIKI_HOOKS_INSTALL = mode;
    assert.throws(() => M.hook({ home: s.home, bin }), /obsidian-wiki hooks install --only SessionStart/, mode);
    assert.ok(fs.lstatSync(s.settings).isSymbolicLink(), mode);
    assert.deepEqual(fs.readFileSync(target), bytes, mode);
    assert.deepEqual(fs.readdirSync(process.env.TMPDIR), [], mode);
  }
  delete process.env.FAKE_WIKI_HOOKS_INSTALL;
  // A link to nothing: the entry is written where it points (the launcher's rule for its settings writes), the link kept.
  fs.rmSync(target);
  M.hook({ home: s.home, bin });
  assert.ok(fs.lstatSync(s.settings).isSymbolicLink());
  assert.ok(JSON.stringify(JSON.parse(fs.readFileSync(target, 'utf8')).hooks.SessionStart).includes('wiki-session-recap.sh'));
  assert.equal(fs.statSync(target).mode & 0o777, 0o600);
});

test('PC-178: a clash is any entry of a bundled skill name in obsidian-wiki\'s global folders that is not its own', { skip: SH }, (t) => {
  const s = sandbox(t);
  const bin = path.join(s.bin, 'obsidian-wiki');
  M.hookState(bin); // the fake makes its package on first use
  const pkgSkills = path.join(s.state, 'uv-tools', 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data', 'skills');
  const agents = path.join(s.home, '.agents', 'skills');
  fs.mkdirSync(path.join(agents, 'skill-creator'), { recursive: true });
  fs.writeFileSync(path.join(agents, 'skill-creator', 'SKILL.md'), 'mine');
  fs.mkdirSync(path.join(agents, 'wiki-query')); // a folder without SKILL.md: obsidian-wiki skips it
  fs.symlinkSync(path.join(pkgSkills, 'wiki-update'), path.join(agents, 'wiki-update')); // its own
  fs.writeFileSync(path.join(agents, 'llm-wiki'), 'a file');
  // A folder whose SKILL.md is the package's own is still the person's (the operator's skill-creator was such a copy).
  fs.mkdirSync(path.join(agents, 'wiki-lint'));
  fs.copyFileSync(path.join(pkgSkills, 'wiki-lint', 'SKILL.md'), path.join(agents, 'wiki-lint', 'SKILL.md'));
  fs.mkdirSync(path.join(s.home, '.codex', 'skills'), { recursive: true });
  fs.symlinkSync(path.join(s.home, 'gone'), path.join(s.home, '.codex', 'skills', 'wiki-lint')); // a link to nothing
  assert.deepEqual(M.clashes(s.home, bin).sort(), [path.join(agents, 'llm-wiki'), path.join(agents, 'skill-creator'), path.join(agents, 'wiki-lint'), path.join(s.home, '.codex', 'skills', 'wiki-lint')].sort());
  // Before obsidian-wiki is installed, the pinned list stands in (and only a link into an obsidian_wiki package is its own).
  const withBin = M.clashes(s.home, bin).sort();
  // The fake package sits in an obsidian_wiki/_data folder as the real one does (round 15, R14): the link into it is its own.
  assert.deepEqual(M.clashes(s.home, null).sort(), withBin);
});

// Round 7.
const RECEIPT_ONE = '[tool]\nrequirements = [{ name = "obsidian-wiki", specifier = "==2026.10.2" }]\nentrypoints = [\n    { name = "obsidian-wiki", install-path = "/x/obsidian-wiki", from = "obsidian-wiki" },\n]\n';
function receipt(s, text) {
  const at = path.join(s.state, 'uv-tools', 'obsidian-wiki', 'uv-receipt.toml');
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.writeFileSync(at, text);
}
test('PC-178: uv\'s receipt is read whatever its layout: one line, extras, several lines, the Python; constraints stop it', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  assert.deepEqual(M.receiptSpec(uvBin), { requirement: `obsidian-wiki==${M.PIN}`, with: [], python: null }, 'no receipt');
  receipt(s, RECEIPT_ONE);
  assert.deepEqual(M.receiptSpec(uvBin), { requirement: `obsidian-wiki==${M.PIN}`, with: [], python: null });
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki", extras = ["ast"] }]\npython = "3.12"\n');
  assert.deepEqual(M.receiptSpec(uvBin), { requirement: `obsidian-wiki[ast]==${M.PIN}`, with: [], python: '3.12' });
  receipt(s, '[tool]\nrequirements = [\n    { name = "obsidian-wiki", extras = ["ast", "graph"] },\n    { name = "tree-sitter", specifier = "<0.22" },\n]\npython = "3.12"\n');
  assert.deepEqual(M.receiptSpec(uvBin), { requirement: `obsidian-wiki[ast,graph]==${M.PIN}`, with: ['tree-sitter<0.22'], python: '3.12' });
  for (const key of ['constraints', 'overrides', 'build-constraints']) {
    receipt(s, `[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n${key} = [{ name = "numpy", specifier = "<2" }]\n`);
    assert.throws(() => M.receiptSpec(uvBin), new RegExp(key), key);
  }
});

test('PC-178: the hook entry is merged into the settings file as it is after obsidian-wiki ran, never into a copy read before', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: [] });
  process.env.TMPDIR = path.join(s.home, 'tmp');
  fs.mkdirSync(process.env.TMPDIR);
  process.env.FAKE_WIKI_HOOKS_INSTALL_TOUCH = s.settings; // the fake adds a key to the real file while it runs
  M.hook({ home: s.home, bin: path.join(s.bin, 'obsidian-wiki') });
  const doc = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
  assert.equal(doc.touched, true, 'the key written during the install is kept');
  assert.ok(JSON.stringify(doc.hooks.SessionStart).includes('wiki-session-recap.sh'));
});

test('PC-178: a clash that appears after git init stops the vault step before obsidian-wiki setup, and the step is undone', { skip: SH }, (t) => {
  const s = sandbox(t, { vault: false });
  // git that, as it runs, leaves a skill of the person's with a bundled name (a sync tool, another agent).
  fs.writeFileSync(path.join(s.bin, 'git'), `#!/bin/sh\n/usr/bin/git "$@" || exit $?\nmkdir -p "$HOME/.agents/skills/skill-creator" && echo mine > "$HOME/.agents/skills/skill-creator/SKILL.md"\n`, { mode: 0o755 });
  process.env.FAKE_TOOLS_QUIET = '';
  delete process.env.FAKE_TOOLS_QUIET;
  const vault = path.join(s.home, 'Wiki');
  assert.throws(() => M.install({ home: s.home, vault, claude: { here: false } }), /skill-creator/);
  assert.ok(!fs.existsSync(vault), 'the vault folder it made is gone');
  assert.equal(M.configOf(s.home), null);
  let log = '';
  try { log = fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8'); } catch (_) { /* none */ }
  assert.ok(!/obsidian-wiki setup/.test(log), log);
  assert.equal(fs.readFileSync(path.join(s.home, '.agents', 'skills', 'skill-creator', 'SKILL.md'), 'utf8'), 'mine\n');
});

// Round 8.
test('PC-178: a registered SessionStart hook whose script is not there is not ok, and names the path', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: ['SessionStart'] });
  const gone = path.join(s.home, 'old-venv', 'obsidian_wiki', '_data', 'hooks', 'wiki-session-recap.sh');
  fs.writeFileSync(s.settings, JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command: `PATH="/x:$PATH" bash "${gone}"` }] }] } }));
  const h = s.rows().find((r) => r.id === 'memory.hooks');
  assert.equal(h.state, 'warn', JSON.stringify(h));
  assert.ok(h.detail.includes(gone), h.detail);
  assert.ok(h.fix.includes(M.NEVER), h.fix);
});

test('PC-178: a link to nothing whose text points into an obsidian_wiki package is obsidian-wiki\'s own, not a clash', { skip: SH }, (t) => {
  const s = sandbox(t);
  const dir = path.join(s.home, '.agents', 'skills');
  fs.mkdirSync(dir, { recursive: true });
  fs.symlinkSync(path.join(s.home, 'removed-venv', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data', 'skills', 'wiki-lint'), path.join(dir, 'wiki-lint'));
  fs.symlinkSync(path.join(s.home, 'elsewhere', 'wiki-query'), path.join(dir, 'wiki-query'));
  assert.deepEqual(M.clashes(s.home, path.join(s.bin, 'obsidian-wiki')), [path.join(dir, 'wiki-query')]);
});

test('PC-178: uv\'s receipt fails closed: a comment, an unterminated or escaped string, options that change resolution', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  for (const text of [
    '[tool]\nrequirements = [\n    { name = "obsidian-wiki" }, # pinned by hand\n]\n',
    '[tool]\nrequirements = [{ name = "obsidian-wiki }]\n',
    '[tool]\nrequirements = [{ name = "obsidian-wiki", marker = "python_version >= \\"3.8\\"" }]\n',
    '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[tool.options]\nindex-url = "https://example.com/simple"\n',
    '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[tool.options]\nprerelease = "allow"\n',
  ]) {
    receipt(s, text);
    assert.throws(() => M.receiptSpec(uvBin), /cannot carry/, text);
  }
  // A table the launcher does not know is refused too (round 9: refusing over parsing).
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[other]\npython = "3.9"\n');
  assert.throws(() => M.receiptSpec(uvBin), /cannot carry/);
});

// Round 9.
test('PC-178: any [tool.options] key but link-mode and compile-bytecode stops the upgrade, and so does an unknown [tool] key', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  for (const [text, name] of [
    ['[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[tool.options]\nindex = [{ url = "https://example.com/simple" }]\n', 'index'],
    ['[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[tool.options]\nfind-links = ["/wheels"]\n', 'find-links'],
    ['[tool] # written by uv\nrequirements = [{ name = "obsidian-wiki" }]\nconstraints = [{ name = "numpy", specifier = "<2" }]\n', 'constraints'],
    ['[tool]\nrequirements = [{ name = "obsidian-wiki" }]\nsomething-new = true\n', 'something-new'],
    ['stray = 1\n[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n', 'before'],
  ]) {
    receipt(s, text);
    assert.throws(() => M.receiptSpec(uvBin), new RegExp(name), text);
  }
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\npython = "3.12"\nentrypoints = [{ name = "obsidian-wiki", install-path = "/x", from = "obsidian-wiki" }]\n\n[tool.options]\nlink-mode = "copy"\ncompile-bytecode = true\n');
  assert.deepEqual(M.receiptSpec(uvBin), { requirement: `obsidian-wiki==${M.PIN}`, with: [], python: '3.12' });
});

test('PC-178: a hook script path is checked only where it can be: never a Git Bash path on Windows, never one with ~ or $', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: ['SessionStart'] });
  for (const [command, env] of [
    ['PATH="/c/Users/ada/.local/bin:$PATH" bash "/c/Users/ada/AppData/Roaming/uv/tools/obsidian-wiki/Lib/site-packages/obsidian_wiki/_data/hooks/wiki-session-recap.sh"', { PASSIONCODE_PLATFORM: 'win32' }],
    ['bash "$HOME/gone/obsidian_wiki/_data/hooks/wiki-session-recap.sh"', {}],
    ['bash "~/gone/obsidian_wiki/_data/hooks/wiki-session-recap.sh"', {}],
  ]) {
    Object.assign(process.env, env);
    fs.writeFileSync(s.settings, JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [{ type: 'command', command }] }] } }));
    const h = s.rows().find((r) => r.id === 'memory.hooks');
    assert.equal(h.state, 'ok', `${command}: ${JSON.stringify(h)}`);
    delete process.env.PASSIONCODE_PLATFORM;
  }
});

// Round 11 (PC-178).
test('PC-178: a Hermes profile that is a link to a folder is one obsidian-wiki fills; a link to nothing is skipped', { skip: SH }, (t) => {
  const s = sandbox(t);
  const profiles = path.join(s.home, '.hermes', 'profiles');
  const real = path.join(s.home, 'elsewhere', 'work');
  const name = require('../lib/catalog').WIKI.skills[0];
  fs.mkdirSync(path.join(real, 'skills', name), { recursive: true });
  fs.writeFileSync(path.join(real, 'skills', name, 'SKILL.md'), '---\nname: mine\n---\n');
  fs.mkdirSync(profiles, { recursive: true });
  fs.symlinkSync(real, path.join(profiles, 'work'));
  fs.symlinkSync(path.join(s.home, 'nowhere'), path.join(profiles, 'gone'));
  assert.ok(M.skillFolders(s.home).includes(path.join(profiles, 'work', 'skills')), M.skillFolders(s.home).join('\n'));
  assert.ok(!M.skillFolders(s.home).includes(path.join(profiles, 'gone', 'skills')));
  assert.ok(M.clashes(s.home, null).includes(path.join(profiles, 'work', 'skills', name)), M.clashes(s.home, null).join('\n'));
});

test('PC-178: a skills folder that cannot be read is a clash that names its code, never a throw', { skip: SH }, (t) => {
  const s = sandbox(t);
  fs.symlinkSync(path.join(s.home, '.codex'), path.join(s.home, '.codex')); // a link to itself: ELOOP
  let found;
  assert.doesNotThrow(() => { found = M.clashes(s.home, null); });
  assert.ok(found.some((e) => /\.codex.* could not be read \(ELOOP\)/.test(e)), found.join('\n'));
});

test('PC-178: uv\'s receipt refuses a \'literal\' key it does not know and an array of tables', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  receipt(s, "[tool]\nrequirements = [{ name = \"obsidian-wiki\" }]\n'constraints' = [{ name = \"numpy\", specifier = \"<2\" }]\n");
  assert.throws(() => M.receiptSpec(uvBin), /constraints/);
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[[tool.extra]]\nname = "x"\n');
  assert.throws(() => M.receiptSpec(uvBin), /array of tables/);
});

test('PC-178: a memory check that throws is one warning row in doctor, never a crash', { skip: SH }, async (t) => {
  const s = sandbox(t);
  const D = require('../lib/doctor');
  const real = M.checks;
  M.checks = () => { throw new Error('EPERM: operation not permitted, lstat \'/x\''); };
  t.after(() => { M.checks = real; });
  const checks = await D.collect({ home: s.home, platform: 'linux', claude: { available: () => false }, online: false });
  const e = checks.find((c) => c.id === 'memory.error');
  assert.ok(e && e.state === 'warn' && /could not be checked: EPERM/.test(e.detail) && /doctor$/.test(e.fix) && e.gate === null && !e.repair, JSON.stringify(e));
});

// Round 12 (PC-178).
test('PC-178: the reinstall of a uv-held copy keeps its own specifier, never the pin, and every value is single-quoted', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki", extras = ["ast", "graph"], specifier = "==2026.12.0" }, { name = "tree-sitter", specifier = "<0.22" }]\npython = "3.12"\n');
  const fix = M.reinstallFix(uvBin);
  assert.ok(fix.includes("'obsidian-wiki[ast,graph]==2026.12.0'") && !fix.includes(`==${M.PIN}`), fix);
  assert.ok(fix.includes("--with 'tree-sitter<0.22'") && fix.includes("--python '3.12'"), fix);
  const zsh = require('node:child_process').spawnSync('zsh', ['-n', '-c', fix.split(': ').slice(1).join(': ')]);
  if (!zsh.error) assert.equal(zsh.status, 0, String(zsh.stderr));
  // With no specifier recorded, none is named; the upgrade still pins.
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n');
  assert.ok(M.reinstallFix(uvBin).includes("'obsidian-wiki'") && !M.reinstallFix(uvBin).includes('=='), M.reinstallFix(uvBin));
  assert.equal(M.receiptSpec(uvBin).requirement, `obsidian-wiki==${M.PIN}`);
});

test('PC-178: uv\'s receipt refuses a quoted key even when the launcher knows it', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  for (const text of ["[tool]\n'requirements' = [{ name = \"obsidian-wiki\" }]\n", '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n"python" = "3.12"\n']) {
    receipt(s, text);
    assert.throws(() => M.receiptSpec(uvBin), /a quoted key/, text);
  }
});

test('PC-178: an entry without type "command" is not a registered SessionStart hook', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: [] });
  const cmd = `bash "${path.join(s.state, 'uv-tools', 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data', 'hooks', 'wiki-session-recap.sh')}"`;
  fs.writeFileSync(s.settings, JSON.stringify({ hooks: { SessionStart: [{ matcher: '', hooks: [{ command: cmd }] }] } }));
  assert.equal(M.present(s.home).hook, false);
  M.hook({ home: s.home });
  const groups = JSON.parse(fs.readFileSync(s.settings, 'utf8')).hooks.SessionStart;
  assert.ok(groups.some((g) => g.hooks.some((e) => e.type === 'command' && e.command.includes('wiki-session-recap.sh'))), JSON.stringify(groups));
  assert.equal(M.present(s.home).hook, true);
});

test('PC-178: a config key written with spaces around = stops every obsidian-wiki list, and the config stays byte for byte', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2', env: { FAKE_TOOLS_QUIET: '' } });
  delete process.env.FAKE_TOOLS_QUIET;
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const text = `OBSIDIAN_VAULT_PATH = "${s.vaultDir}"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`;
  fs.writeFileSync(config, text);
  assert.throws(() => M.upgrade({ home: s.home, NPX }), /writes OBSIDIAN_VAULT_PATH with spaces around =, which obsidian-wiki's version refresh would rewrite; write it once as OBSIDIAN_VAULT_PATH="\.\.\.", then run setup again; nothing was upgraded/);
  const log = (() => { try { return fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8'); } catch (_) { return ''; } })();
  assert.ok(!/uv tool install|obsidian-wiki list/.test(log), log);
  assert.equal(fs.readFileSync(config, 'utf8'), text);
  const rows = s.rows();
  const sp = rows.find((r) => r.id === 'memory.vault.config-form');
  assert.ok(sp && sp.state === 'warn' && sp.gate === 'consent', JSON.stringify(rows));
  assert.equal(rows.find((r) => r.id === 'memory.wiki').repair, null);
});

test('PC-178: the upgrade keeps the Python obsidian-wiki\'s venv was made with when uv\'s record names none', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  delete process.env.FAKE_TOOLS_QUIET;
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n');
  fs.writeFileSync(path.join(s.state, 'uv-tools', 'obsidian-wiki', 'pyvenv.cfg'), 'home = /opt/python/bin\ninclude-system-site-packages = false\nversion_info = 3.12.4.final.0\n');
  assert.equal(M.venvPython(path.join(s.bin, 'uv')), '3.12');
  M.upgrade({ home: s.home, NPX });
  const log = fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8');
  assert.ok(log.includes(`uv tool install --force obsidian-wiki==${M.PIN} --python 3.12`), log);
});

test('PC-178: setup names a memory that could not be checked in neutral words', { skip: SH }, (t) => {
  const s = sandbox(t);
  const S = require('../lib/setup');
  const real = M.needs;
  M.needs = () => { throw new Error('EPERM: operation not permitted'); };
  t.after(() => { M.needs = real; });
  const item = S.plan([], { platform: 'linux', home: s.home }).find((i) => i.kind === 'memory');
  assert.ok(item && item.unavailable && item.detail === "the agents' wiki memory could not be checked: EPERM: operation not permitted", JSON.stringify(item));
});

test('PC-178: a clash that is only a folder it could not read says so, never a skill to move', { skip: SH }, (t) => {
  const s = sandbox(t);
  fs.symlinkSync(path.join(s.home, '.codex'), path.join(s.home, '.codex'));
  const note = require('../lib/memory').needs(s.home, path.join(s.home, 'New'), 'linux').note || '';
  const clash = s.rows().find((r) => r.id === 'memory.wiki.clash');
  for (const text of [clash.detail, clash.fix]) assert.ok(!/skills? of yours|move or rename/.test(text), text);
  assert.ok(/could not be read \(ELOOP\)/.test(clash.detail) && /repair the link or the permissions/.test(clash.fix), JSON.stringify(clash));
  assert.ok(!/skills? of yours|move or rename/.test(note), note);
});

// Round 13 (PC-178).
test('PC-178: a config line obsidian-wiki\'s refresh would rewrite stops every list, in each form, and the config stays byte for byte', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  delete process.env.FAKE_TOOLS_QUIET;
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const v = s.vaultDir;
  for (const [text, form] of [
    [`OBSIDIAN_VAULT_PATH='${v}'\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /in single quotes/],
    [`export OBSIDIAN_VAULT_PATH="${v}"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /after export/],
    [`OBSIDIAN_VAULT_PATH="${v}" # mine\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /with text after its value/],
    [`OBSIDIAN_VAULT_PATH="${v}"\nOBSIDIAN_VAULT_PATH="${v}"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /more than once/],
    [`OBSIDIAN_VAULT_PATH="${v}"\nOBSIDIAN_WIKI_REPO="/home/me/obsidian-wiki"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /outside obsidian-wiki's package/],
    [`OBSIDIAN_VAULT_PATH = "${v}"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, /with spaces around =/],
  ]) {
    fs.writeFileSync(config, text);
    fs.rmSync(path.join(s.home, 'fake-tools.log'), { force: true });
    assert.throws(() => M.upgrade({ home: s.home, NPX }), form, text);
    const log = (() => { try { return fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8'); } catch (_) { return ''; } })();
    assert.ok(!/uv tool install|obsidian-wiki list/.test(log), `${text}: ${log}`);
    assert.equal(fs.readFileSync(config, 'utf8'), text);
    const row = s.rows().find((r) => r.id === 'memory.vault.config-form');
    assert.ok(row && row.gate === 'consent' && form.test(row.detail), JSON.stringify(row));
  }
  // The forms obsidian-wiki keeps as they are pass.
  for (const text of [`OBSIDIAN_VAULT_PATH="${v}"\n`, `OBSIDIAN_VAULT_PATH=${v}\nOBSIDIAN_WIKI_REPO="/x/site-packages/obsidian_wiki/_data"\n`]) {
    fs.writeFileSync(config, text);
    assert.equal(M.configForm(s.home), null, text);
  }
});

test('PC-178: with obsidian-wiki not installed, a config line its refresh would rewrite shows its row and routes memory.wiki\'s fix', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  fs.rmSync(path.join(s.state, 'version'));
  fs.writeFileSync(path.join(s.home, '.config', 'obsidian-wiki', 'config'), `export OBSIDIAN_VAULT_PATH="${s.vaultDir}"\n`);
  const rows = s.rows();
  const w = rows.find((r) => r.id === 'memory.wiki');
  assert.ok(rows.some((r) => r.id === 'memory.vault.config-form'), JSON.stringify(rows));
  assert.ok(/^first rewrite the OBSIDIAN_VAULT_PATH line memory\.vault\.config-form names; then /.test(w.fix) && w.gate === 'consent', JSON.stringify(w));
  const need = M.needs(s.home, path.join(s.home, 'New'), 'linux');
  assert.ok(/after export/.test(need.note || ''), JSON.stringify(need));
});

test('PC-178: the refresh step after a clash of unreadable folders asks to repair them, never to move skills', { skip: SH }, (t) => {
  const s = sandbox(t);
  const report = path.join(s.home, 'doctor.json');
  fs.writeFileSync(report, JSON.stringify({ checks: [{ name: 'setup-version', status: 'warn', detail: 'recorded 2026.10.2' }] }));
  process.env.FAKE_WIKI_DOCTOR = report;
  fs.symlinkSync(path.join(s.home, '.codex'), path.join(s.home, '.codex'));
  const v = s.rows().find((r) => r.id === 'memory.vault');
  assert.ok(/first repair the folders memory\.wiki\.clash names; then run: obsidian-wiki list/.test(v.fix) && !/move or rename/.test(v.fix), v.fix);
});

test('PC-178: a long memory fix keeps the prohibition first and stays under 1000 characters; a long clash list is capped', { skip: SH }, (t) => {
  const s = sandbox(t);
  const report = path.join(s.home, 'doctor.json');
  const long = 'x'.repeat(60);
  fs.writeFileSync(report, JSON.stringify({ checks: ['one', 'two', 'three', 'four'].map((n) => ({ name: `check-${n}`, status: 'warn', detail: long, hint: 'run obsidian-wiki setup' })) }));
  process.env.FAKE_WIKI_DOCTOR = report;
  const v = s.rows().find((r) => r.id === 'memory.vault');
  assert.ok(v.fix.startsWith(M.NEVER) && v.fix.split(M.NEVER).length === 2, v.fix);
  assert.ok(v.fix.length <= 1000, `${v.fix.length}: ${v.fix}`);
  delete process.env.FAKE_WIKI_DOCTOR;
  const names = require('../lib/catalog').WIKI.skills.slice(0, 8);
  for (const n of names) { fs.mkdirSync(path.join(s.home, '.agents', 'skills', n), { recursive: true }); fs.writeFileSync(path.join(s.home, '.agents', 'skills', n, 'SKILL.md'), 'mine'); }
  const c = s.rows().find((r) => r.id === 'memory.wiki.clash');
  assert.ok(/, and 3 more$/.test(c.detail), c.detail);
});

test('PC-178: an entry that is not a command hook is not judged for a missing script', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: ['SessionStart'] });
  const doc = JSON.parse(fs.readFileSync(s.settings, 'utf8'));
  doc.hooks.SessionStart.push({ matcher: '', hooks: [{ command: 'bash "/gone/obsidian_wiki/_data/hooks/wiki-session-recap.sh"' }] });
  fs.writeFileSync(s.settings, JSON.stringify(doc));
  const h = s.rows().find((r) => r.id === 'memory.hooks');
  assert.ok(!/\/gone\//.test(h.detail), JSON.stringify(h));
});

test('PC-178: uv\'s receipt refuses a quoted or dotted key inside a requirement', { skip: SH }, (t) => {
  const s = sandbox(t);
  const uvBin = path.join(s.bin, 'uv');
  for (const text of ['[tool]\nrequirements = [{ "name" = "obsidian-wiki" }]\n', '[tool]\nrequirements = [{ name = "obsidian-wiki", extras.x = "y" }]\n']) {
    receipt(s, text);
    assert.throws(() => M.receiptSpec(uvBin), /quoted or dotted key/, text);
  }
});

test('PC-178: a copy uv\'s record does not name as the command it installed gets no upgrade repair', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\nentrypoints = [{ name = "obsidian-wiki", install-path = "/elsewhere/bin/obsidian-wiki", from = "obsidian-wiki" }]\n');
  assert.equal(s.rows().find((r) => r.id === 'memory.wiki').repair, null);
  receipt(s, `[tool]\nrequirements = [{ name = "obsidian-wiki" }]\nentrypoints = [{ name = "obsidian-wiki", install-path = "${path.join(s.bin, 'obsidian-wiki')}", from = "obsidian-wiki" }]\n`);
  assert.deepEqual(s.rows().find((r) => r.id === 'memory.wiki').repair, { kind: 'tool', product: 'wiki' });
});

test('PC-178: an upgrade whose refresh refuses after the reinstall puts the previous version back', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  const name = require('../lib/catalog').WIKI.skills[0];
  process.env.FAKE_UV_INSTALL_ADDS_SKILL = path.join(s.home, '.agents', 'skills', name);
  assert.throws(() => M.upgrade({ home: s.home, NPX }), /obsidian-wiki was put back to 2026\.10\.2 \(uv tool install --force obsidian-wiki==2026\.10\.2\)/);
  assert.equal(fs.readFileSync(path.join(s.state, 'version'), 'utf8'), '2026.10.2');
});

test('PC-178: a done tool upgrade, a hook repair and a memory action each add the restart step', { skip: SH }, (t) => {
  const s = sandbox(t);
  const S = require('../lib/setup');
  for (const a of [{ kind: 'tool', outcome: 'done' }, { kind: 'hook', outcome: 'done' }, { kind: 'memory', outcome: 'done' }]) {
    const steps = S.humanSteps({ actions: [{ detail: '', product: 'wiki', ...a }], platform: 'linux', home: s.home }, [], [], [], false);
    assert.ok(steps.some((x) => /^Restart your coding agents/.test(x)), `${a.kind}: ${JSON.stringify(steps)}`);
  }
});

// Round 14 (PC-178).
test('PC-178: a config with a line break obsidian-wiki reads differently, or a byte order mark, is refused and left byte for byte', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  delete process.env.FAKE_TOOLS_QUIET;
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const v = s.vaultDir;
  const breaks = /with Windows line endings, a control character or a line break obsidian-wiki reads differently/;
  for (const [text, form] of [
    [`# a\rOBSIDIAN_VAULT_PATH = "${v}"\r`, breaks],
    [`OBSIDIAN_VAULT_PATH="${v}"\r\nOBSIDIAN_WIKI_VERSION="2026.10.2"\r\n`, breaks],
    [`OBSIDIAN_VAULT_PATH="${v}\u2028x"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`, breaks],
    ...['\v', '\f', '\x1c', '\x1d', '\x1e', '\x85', '\u2029'].map((c) => [`OBSIDIAN_VAULT_PATH="${v}"\n#${c}\n`, breaks]),
    // Round 15: \x1f, which Python's strip() takes for whitespace, before a key or before its =; any other C0 control.
    [`\x1fOBSIDIAN_VAULT_PATH="${v}"\n`, breaks],
    [`OBSIDIAN_VAULT_PATH\x1f="${v}"\n`, breaks],
    [`OBSIDIAN_VAULT_PATH="${v}"\n#\x00\x07\x1b\n`, breaks],
    [`﻿OBSIDIAN_VAULT_PATH="${v}"\n`, /starts with a byte order mark: save it without one/],
  ]) {
    fs.writeFileSync(config, text);
    fs.rmSync(path.join(s.home, 'fake-tools.log'), { force: true });
    assert.throws(() => M.upgrade({ home: s.home, NPX }), form, JSON.stringify(text));
    const log = (() => { try { return fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8'); } catch (_) { return ''; } })();
    assert.ok(!/uv tool install|obsidian-wiki list/.test(log), log);
    assert.equal(fs.readFileSync(config, 'utf8'), text);
    const row = s.rows().find((r) => r.id === 'memory.vault.config-form');
    assert.ok(row && row.gate === 'consent', JSON.stringify(text));
  }
  // install() over the same config: refused before uv runs.
  fs.rmSync(path.join(s.state, 'version'));
  const text = `OBSIDIAN_VAULT_PATH="${v}"\r\n`;
  fs.writeFileSync(config, text);
  fs.rmSync(path.join(s.home, 'fake-tools.log'), { force: true });
  assert.throws(() => M.install({ home: s.home, vault: path.join(s.home, 'New'), claude: { here: false }, NPX }), breaks);
  assert.ok(!fs.existsSync(path.join(s.home, 'fake-tools.log')) || !/uv tool install/.test(fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8')));
  assert.equal(fs.readFileSync(config, 'utf8'), text);
});

test('PC-178: two vault lines keep the hook from being registered and the repair from being offered', { skip: SH }, (t) => {
  const s = sandbox(t, { hooks: [] });
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const text = `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_VAULT_PATH="${path.join(s.home, 'Other')}"\nOBSIDIAN_WIKI_VERSION="${M.PIN}"\n`;
  fs.writeFileSync(config, text);
  const before = fs.readFileSync(s.settings, 'utf8');
  assert.throws(() => M.hook({ home: s.home }), /writes OBSIDIAN_VAULT_PATH more than once.*; nothing was changed$/);
  assert.equal(fs.readFileSync(s.settings, 'utf8'), before);
  const h = s.rows(s.vaultDir).find((r) => r.id === 'memory.hooks');
  assert.ok(h && h.repair === null && h.gate === 'consent' && /^first rewrite the OBSIDIAN_VAULT_PATH line memory\.vault\.config-form names; then /.test(h.fix), JSON.stringify(h));
});

test('PC-178: rows that point at a repo line outside the package say remove it; an empty repo line is accepted', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="/home/me/obsidian-wiki"\nOBSIDIAN_WIKI_VERSION="2026.10.2"\n`);
  const report = path.join(s.home, 'doctor.json');
  fs.writeFileSync(report, JSON.stringify({ checks: [{ name: 'setup-version', status: 'warn', detail: 'recorded 2026.10.2' }] }));
  process.env.FAKE_WIKI_DOCTOR = report;
  const v = s.rows().find((r) => r.id === 'memory.vault');
  assert.ok(/first remove the OBSIDIAN_WIKI_REPO line memory\.vault\.config-form names; then run: obsidian-wiki list/.test(v.fix), v.fix);
  fs.rmSync(path.join(s.state, 'version'));
  const w = s.rows().find((r) => r.id === 'memory.wiki');
  assert.ok(/^first remove the OBSIDIAN_WIKI_REPO line/.test(w.fix), w.fix);
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO=\n`);
  assert.equal(M.configForm(s.home), null);
});

test('PC-178: a ~/.obsidian-wiki that is a link to the XDG folder is that folder, not an older one', { skip: SH }, (t) => {
  const s = sandbox(t);
  fs.symlinkSync(path.join(s.home, '.config', 'obsidian-wiki'), path.join(s.home, '.obsidian-wiki'));
  assert.equal(M.legacyShadow(s.home), null);
});

test('PC-178: doctor --json keeps every clashing entry while the detail names five', { skip: SH }, (t) => {
  const s = sandbox(t);
  for (const n of require('../lib/catalog').WIKI.skills.slice(0, 8)) { fs.mkdirSync(path.join(s.home, '.agents', 'skills', n), { recursive: true }); fs.writeFileSync(path.join(s.home, '.agents', 'skills', n, 'SKILL.md'), 'mine'); }
  const c = s.rows().find((r) => r.id === 'memory.wiki.clash');
  assert.equal(c.entries.length, 8);
  assert.ok(/, and 3 more$/.test(c.detail), c.detail);
});

// Round 15 (PC-178).
test('PC-178: with uv absent, a package in uv\'s own tool folder or beside uv\'s record is uv\'s, not the person\'s', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const tools = path.join(s.home, '.local', 'share', 'uv', 'tools');
  const inUv = path.join(tools, 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
  fs.mkdirSync(inUv, { recursive: true });
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="${inUv}"\n`);
  assert.equal(M.personalCopy(s.home, null), null);
  // Elsewhere, but its tool folder holds uv's record: uv's too.
  const other = path.join(s.home, 'tools', 'obsidian-wiki');
  const pkg = path.join(other, 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(other, 'uv-receipt.toml'), '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n');
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="${pkg}"\n`);
  assert.equal(M.personalCopy(s.home, null), null);
});

test('PC-178: the person\'s package path may start with ~ or end with /; a relative one is a config form', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const pkg = path.join(s.home, 'venv', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
  fs.mkdirSync(pkg, { recursive: true });
  for (const repo of ['~/venv/lib/python3.12/site-packages/obsidian_wiki/_data', `${pkg}/`]) {
    fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="${repo}"\n`);
    assert.equal(M.configForm(s.home), null, repo);
    assert.equal(M.personalCopy(s.home, null), fs.realpathSync(pkg), repo);
  }
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="venv/lib/python3.12/site-packages/obsidian_wiki/_data"\n`);
  assert.equal((M.configForm(s.home) || {}).form, 'as a relative path');
  assert.equal(M.personalCopy(s.home, null), null);
});

test('PC-178: uv\'s record beside the person\'s own package gives the same step in doctor, the plan and the install', { skip: SH }, (t) => {
  const s = sandbox(t);
  fs.rmSync(path.join(s.state, 'version'));
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n');
  const pkg = path.join(s.home, 'venv', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(s.home, '.config', 'obsidian-wiki', 'config'), `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="${pkg}"\n`);
  assert.ok(/installed by uv but does not run/.test(s.rows().find((r) => r.id === 'memory.wiki').detail));
  assert.ok(/installed by uv but does not run/.test(M.needs(s.home, path.join(s.home, 'New'), 'linux').note || ''));
  assert.throws(() => M.install({ home: s.home, vault: path.join(s.home, 'New'), claude: { here: false }, NPX }), /installed by uv but does not run/);
});

test('PC-178: while a config line would be rewritten, every hooks row asks for it first, whoever made the vault', { skip: SH }, (t) => {
  const plainFix = (f) => f.replace(`${M.NEVER}; `, '');
  // A vault the launcher did not make.
  const s = sandbox(t, { hooks: [] });
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_VAULT_PATH="${s.vaultDir}"\n`);
  const h = s.rows().find((r) => r.id === 'memory.hooks');
  assert.ok(/^first rewrite the OBSIDIAN_VAULT_PATH line memory\.vault\.config-form names; then /.test(plainFix(h.fix)), h.fix);
  // A spaced vault line that names the launcher's vault.
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH = "${s.vaultDir}"\n`);
  const k = s.rows(s.vaultDir).find((r) => r.id === 'memory.hooks');
  assert.ok(/^first rewrite the OBSIDIAN_VAULT_PATH line/.test(plainFix(k.fix)) && k.repair === null, JSON.stringify(k));
});

test('PC-178: doctor --json lists each clash entry with its problem; the refresh step names the package path', { skip: SH }, (t) => {
  const s = sandbox(t);
  const name = require('../lib/catalog').WIKI.skills[0];
  fs.mkdirSync(path.join(s.home, '.agents', 'skills', name), { recursive: true });
  fs.writeFileSync(path.join(s.home, '.agents', 'skills', name, 'SKILL.md'), 'mine');
  fs.symlinkSync(path.join(s.home, '.codex'), path.join(s.home, '.codex'));
  const c = s.rows().find((r) => r.id === 'memory.wiki.clash');
  assert.ok(c.entries.some((e) => e.problem === 'clash' && e.path.endsWith(name)), JSON.stringify(c.entries));
  assert.ok(c.entries.some((e) => e.problem === 'unreadable' && e.code === 'ELOOP' && /\.codex/.test(e.path)), JSON.stringify(c.entries));
  assert.match(M.REFRESH, /records the installed version and package path/);
});

// Round 16 (PC-178).
test('PC-178: a relative repo line gets its own step, never the form it already has', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="venv/lib/python3.12/site-packages/obsidian_wiki/_data"\n`);
  const row = s.rows().find((r) => r.id === 'memory.vault.config-form');
  fs.rmSync(path.join(s.state, 'version'));
  const note = M.needs(s.home, path.join(s.home, 'New'), 'linux').note || '';
  let err = '';
  try { M.install({ home: s.home, vault: path.join(s.home, 'New'), claude: { here: false }, NPX }); } catch (e) { err = e.message; }
  for (const text of [row.fix, note, err]) {
    assert.match(text, /remove the OBSIDIAN_WIKI_REPO line|absolute path/);
    assert.doesNotMatch(text, /write .* once as/);
  }
});

test('PC-178: a config not saved as UTF-8 is its own form, and nothing runs over it', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  delete process.env.FAKE_TOOLS_QUIET;
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  const bytes = Buffer.concat([Buffer.from(`OBSIDIAN_VAULT_PATH="${s.vaultDir}`), Buffer.from([0xff, 0xfe]), Buffer.from('"\n')]);
  fs.writeFileSync(config, bytes);
  assert.equal((M.configForm(s.home) || {}).form, 'not saved as UTF-8');
  assert.throws(() => M.upgrade({ home: s.home, NPX }), /is not saved as UTF-8, which obsidian-wiki cannot read; save it as UTF-8/);
  fs.rmSync(path.join(s.state, 'version'));
  assert.throws(() => M.install({ home: s.home, vault: path.join(s.home, 'New'), claude: { here: false }, NPX }), /not saved as UTF-8/);
  const log = (() => { try { return fs.readFileSync(path.join(s.home, 'fake-tools.log'), 'utf8'); } catch (_) { return ''; } })();
  assert.ok(!/uv tool install|obsidian-wiki list/.test(log), log);
  assert.ok(fs.readFileSync(config).equals(bytes));
});

test('PC-178: a vault path with a double quote or a line break is refused', () => {
  for (const dir of ['/tmp/a"b', '/tmp/a\nb']) assert.equal(M.vaultProblem(dir), 'has a double quote, a line break or a control character in its path'); // round 17, 1
});

test('PC-178: after uv installs, sets up and uninstalls obsidian-wiki, nothing reads as the person\'s own copy', { skip: SH }, (t) => {
  const s = sandbox(t, { vault: false });
  fs.rmSync(path.join(s.state, 'version'));
  const uvBin = path.join(s.bin, 'uv');
  M.install({ home: s.home, vault: path.join(s.home, 'Wiki2'), claude: { here: false }, NPX });
  assert.match(fs.readFileSync(path.join(s.home, '.config', 'obsidian-wiki', 'config'), 'utf8'), /OBSIDIAN_WIKI_REPO=".*[\\/]uv-tools[\\/]obsidian-wiki[\\/].*obsidian_wiki[\\/]_data"/);
  require('../lib/releases').run(uvBin, ['tool', 'uninstall', 'obsidian-wiki'], { timeout: 30000, input: '' });
  assert.equal(M.personalCopy(s.home, uvBin), null);
  assert.equal(M.needs(s.home, path.join(s.home, 'Other'), 'linux').tool, true);
});

test('PC-178: a bare managed line passes, and the refresh only quotes it, keeping its meaning', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH=${s.vaultDir}\nOBSIDIAN_WIKI_VERSION=2026.10.2\n`);
  assert.equal(M.configForm(s.home), null);
  M.upgrade({ home: s.home, NPX });
  const text = fs.readFileSync(config, 'utf8');
  assert.ok(text.includes(`OBSIDIAN_VAULT_PATH="${s.vaultDir}"`) && text.includes(`OBSIDIAN_WIKI_VERSION="${M.PIN}"`), text);
});

test('PC-178: an unlistable Hermes profiles folder is its own clash entry; with uv absent, XDG_DATA_HOME places uv\'s tool folder', { skip: SH || (process.getuid && process.getuid() === 0 && 'root lists a folder whatever its mode') }, (t) => {
  const s = sandbox(t);
  const profiles = path.join(s.home, '.hermes', 'profiles');
  fs.mkdirSync(profiles, { recursive: true });
  fs.chmodSync(profiles, 0o000);
  let c;
  try { c = s.rows().find((r) => r.id === 'memory.wiki.clash'); } finally { fs.chmodSync(profiles, 0o755); } // before the sandbox is removed
  assert.ok(c && c.entries.some((e) => e.problem === 'profiles-unreadable' && e.code === 'EACCES'), JSON.stringify(c));
  const data = path.join(s.home, 'data');
  process.env.XDG_DATA_HOME = data;
  const pkg = path.join(data, 'uv', 'tools', 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
  fs.mkdirSync(pkg, { recursive: true });
  fs.writeFileSync(path.join(s.home, '.config', 'obsidian-wiki', 'config'), `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_WIKI_REPO="${pkg}"\n`);
  assert.equal(M.personalCopy(s.home, null), null);
});

// Round 17 (PC-178): one character rule, one vault reader, and every refusal's printed step clears it.
test('PC-178: one rule names the characters obsidian-wiki\'s config cannot hold in a value, for the vault path and the config alike', { skip: SH }, (t) => {
  const breaks = ['"', '\n', '\r', '\x00', '\x0b', '\x0c', '\x1c', '\x1f', '\x85', '\u2028', '\u2029'];
  for (const c of breaks) {
    assert.ok(M.cannotHold(`/a${c}b`), JSON.stringify(c));
    assert.equal(M.vaultProblem(`/a${c}b`), 'has a double quote, a line break or a control character in its path', JSON.stringify(c));
  }
  for (const ok of ['/a\tb', '/a b', "/a'b", '/a#b']) assert.ok(!M.cannotHold(ok), JSON.stringify(ok));
  assert.equal(M.vaultNote('/a"b', M.vaultProblem('/a"b')), '/a"b has a double quote, a line break or a control character in its path; choose another folder with --wiki-vault <dir>');
  assert.equal(M.vaultNote('/x', 'already holds files'), '/x already holds files; choose an empty or new folder with --wiki-vault <dir>');
  // The config reads the same characters: each one in a vault value is refused (the quote by its own form).
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  for (const c of breaks) {
    fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="/a${c}b"\n`);
    const f = M.configForm(s.home);
    assert.ok(f, JSON.stringify(c));
    assert.equal(f.form, c === '"' ? M.CONFIG_FORMS.quote : c === '\n' ? M.CONFIG_FORMS.quote : M.CONFIG_FORMS.breaks, JSON.stringify(c));
  }
});

test('PC-178: one reader gives the vault obsidian-wiki\'s config names, and none for a config form or an empty line', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  assert.equal(M.configuredVault(s.home), s.vaultDir);
  for (const text of [`OBSIDIAN_VAULT_PATH=${s.vaultDir}\n`, `X=1\nOBSIDIAN_VAULT_PATH="${s.vaultDir}"`]) {
    fs.writeFileSync(config, text);
    assert.equal(M.configuredVault(s.home), s.vaultDir, text);
  }
  for (const text of ['OBSIDIAN_VAULT_PATH=\n', 'OBSIDIAN_VAULT_PATH=""\n', 'X=1\n', `OBSIDIAN_VAULT_PATH='${s.vaultDir}'\n`, `OBSIDIAN_VAULT_PATH="${s.vaultDir}"\nOBSIDIAN_VAULT_PATH="${s.vaultDir}"\n`, `OBSIDIAN_VAULT_PATH="${s.vaultDir}" # mine\n`]) {
    fs.writeFileSync(config, text);
    assert.equal(M.configuredVault(s.home), null, text);
  }
  // doctor reads the vault through the same function: no second copy of the line's pattern in the launcher.
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'memory.js'), 'utf8');
  assert.equal((src.match(/OBSIDIAN_VAULT_PATH="\?/g) || []).length, 0, 'a second vault reader');
});

// Every form configForm can return, a config that has it, and each step its printed text offers, applied literally.
const KEYED = ['OBSIDIAN_VAULT_PATH', 'OBSIDIAN_WIKI_REPO', 'OBSIDIAN_WIKI_VERSION'];
const keep = (text, key, line) => text.split('\n').filter((l) => !new RegExp(`^\\s*(export\\s+)?${key}\\s*=`).test(l)).concat(line == null ? [] : [line]).join('\n');
const ABS_PKG = '/opt/venv/lib/python3.12/site-packages/obsidian_wiki/_data';
const FORM_TABLE = {
  utf8: { keys: [null], make: () => Buffer.concat([Buffer.from('OBSIDIAN_VAULT_PATH="/v'), Buffer.from([0xe9]), Buffer.from('"\n')]),
    arms: [{ says: /save it as UTF-8/, fix: /save .* as UTF-8/, apply: (b) => Buffer.from(Buffer.from(b).toString('latin1'), 'utf8') }] },
  bom: { keys: [null], make: () => '﻿OBSIDIAN_VAULT_PATH="/v"\n',
    arms: [{ says: /save it without one/, fix: /without a byte order mark/, apply: (t) => String(t).replace(/^﻿/, '') }] },
  breaks: { keys: [null], make: () => 'OBSIDIAN_VAULT_PATH="/v"\r\nX=a\x0bb\u2028\n',
    arms: [{ says: /plain line endings \(\\n\) and no control characters/, fix: /plain line endings \(\\n\) and no control characters/, apply: (t) => String(t).replace(/\r\n/g, '\n').replace(/[\r\x0b\x0c\x1c-\x1e\x85\u2028\u2029]/g, '\n').replace(/[\x00-\x08\x0e-\x1f]/g, '') }] },
  twice: { keys: KEYED, make: (k) => `${k}="a"\n${k}="b"\n`,
    arms: [{ says: /write it once as/, fix: /once as/, apply: (t, k) => keep(String(t), k, `${k}=""`) }] },
  exported: { keys: KEYED, make: (k) => `export ${k}="a"\n`,
    arms: [{ says: /write it once as/, fix: /once as/, apply: (t, k) => keep(String(t), k, `${k}=""`) }] },
  spaced: { keys: KEYED, make: (k) => `${k} = "a"\n`,
    arms: [{ says: /write it once as/, fix: /once as/, apply: (t, k) => keep(String(t), k, `${k}=""`) }] },
  single: { keys: KEYED, make: (k) => `${k}='a'\n`,
    arms: [{ says: /write it once as/, fix: /once as/, apply: (t, k) => keep(String(t), k, `${k}=""`) }] },
  after: { keys: KEYED, make: (k) => `${k}="a" # mine\n`,
    arms: [{ says: /write it once as/, fix: /once as/, apply: (t, k) => keep(String(t), k, `${k}=""`) }] },
  quote: { keys: KEYED, make: (k) => `${k}=/x/a"b\n`,
    arms: [
      { only: 'OBSIDIAN_VAULT_PATH', says: /move the vault to a folder whose path has no double quote, then write OBSIDIAN_VAULT_PATH="<new path>" once/, fix: /move the vault to a folder whose path has no double quote, then write OBSIDIAN_VAULT_PATH="<new path>" once/, apply: (t, k) => keep(String(t), k, `${k}="/x/ab"`) },
      { except: 'OBSIDIAN_VAULT_PATH', says: /remove that line/, fix: /remove the .* line/, apply: (t, k) => keep(String(t), k, null) },
    ] },
  relative: { keys: ['OBSIDIAN_WIKI_REPO'], make: (k) => `${k}="venv/lib/python3.12/site-packages/obsidian_wiki/_data"\n`,
    arms: [
      { says: /remove that line/, fix: /remove the .* line/, apply: (t, k) => keep(String(t), k, null) },
      { says: /write it as an absolute path to obsidian-wiki's package folder \(\.\.\.\/obsidian_wiki\/_data\)/, fix: /write it as an absolute path to obsidian-wiki's package folder \(\.\.\.\/obsidian_wiki\/_data\)/, apply: (t, k) => keep(String(t), k, `${k}="${ABS_PKG}"`) },
    ] },
  outside: { keys: ['OBSIDIAN_WIKI_REPO'], make: (k) => `${k}="/opt/mine"\n`,
    arms: [{ says: /remove that line/, fix: /remove the .* line/, apply: (t, k) => keep(String(t), k, null) }] },
};
// A relative repo that names no package folder is outside the package: only "remove that line" (round 17, 3).
const OUTSIDE_RELATIVE = 'OBSIDIAN_WIKI_REPO="mine/notes"\n';

test('PC-178: every config form has a row, and each step its note and doctor fix print clears the form', { skip: SH }, (t) => {
  const s = sandbox(t);
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  // The forms are the code's: a new one without a row here fails, and configForm names no form outside CONFIG_FORMS.
  assert.deepEqual(Object.keys(FORM_TABLE).sort(), Object.keys(M.CONFIG_FORMS).sort());
  const src = M.configForm.toString();
  assert.ok(!/form: ['"`]/.test(src), 'a form literal outside CONFIG_FORMS');
  for (const [, name] of src.matchAll(/CONFIG_FORMS\.(\w+)/g)) assert.ok(FORM_TABLE[name], name);
  let applied = 0;
  for (const [name, row] of Object.entries(FORM_TABLE)) {
    for (const key of row.keys) {
      const before = row.make(key);
      fs.writeFileSync(config, before);
      const form = M.configForm(s.home);
      assert.ok(form && form.form === M.CONFIG_FORMS[name] && form.key === key, `${name} ${key}: ${JSON.stringify(form)}`);
      const note = M.configFormNote(form);
      const fix = M.configFormRow(form, NPX).fix;
      for (const arm of row.arms) {
        if ((arm.only && arm.only !== key) || (arm.except && arm.except === key)) continue;
        assert.match(note, arm.says, `${name} ${key}: ${note}`);
        assert.match(fix, arm.fix, `${name} ${key}: ${fix}`);
        fs.writeFileSync(config, arm.apply(before, key));
        assert.equal(M.configForm(s.home), null, `${name} ${key}: ${JSON.stringify(fs.readFileSync(config, 'utf8'))}`);
        applied++;
      }
    }
  }
  assert.equal(applied, 24, "every key of every form, each step it offers");
  fs.writeFileSync(config, OUTSIDE_RELATIVE);
  const f = M.configForm(s.home);
  assert.equal(f.form, M.CONFIG_FORMS.outside);
  assert.doesNotMatch(M.configFormNote(f), /absolute path/);
});

test('PC-178: the refresh quoting a bare managed value, or adding an empty vault line, is the same meaning (ADR-0006 decision 16)', { skip: SH }, (t) => {
  const s = sandbox(t, { version: '2026.10.2' });
  const config = path.join(s.home, '.config', 'obsidian-wiki', 'config');
  fs.writeFileSync(config, 'OBSIDIAN_WIKI_VERSION=2026.10.1\nOTHER=1\n');
  assert.equal(M.configForm(s.home), null);
  assert.equal(M.configuredVault(s.home), null);
  require('node:child_process').execFileSync(path.join(s.bin, 'obsidian-wiki'), ['list'], { env: process.env });
  const text = fs.readFileSync(config, 'utf8');
  assert.match(text, /^OBSIDIAN_VAULT_PATH=""$/m);
  assert.match(text, /^OBSIDIAN_WIKI_VERSION="2026\.10\.2"$|^OBSIDIAN_WIKI_VERSION="[^"]+"$/m);
  assert.equal(M.configForm(s.home), null);
  assert.equal(M.configuredVault(s.home), null);
});

// Recorded with the real obsidian-wiki 2026.11.4 (cli.write_config(cli._read_config_value('OBSIDIAN_VAULT_PATH')), as its
// stale refresh calls it, in a sandbox home; <REPO> is its package's _data folder) on 2026-11-13.
const REAL_REFRESH = [
  ['no vault line', 'OBSIDIAN_WIKI_VERSION="2026.10.1"\nOTHER=1\n', 'OBSIDIAN_WIKI_VERSION="2026.11.4"\nOTHER=1\nOBSIDIAN_VAULT_PATH=""\nOBSIDIAN_WIKI_REPO="<REPO>"\n'],
  ['an empty vault line', 'OBSIDIAN_VAULT_PATH=\nOBSIDIAN_WIKI_VERSION="2026.10.1"\n', 'OBSIDIAN_VAULT_PATH=""\nOBSIDIAN_WIKI_VERSION="2026.11.4"\nOBSIDIAN_WIKI_REPO="<REPO>"\n'],
  ['an empty repo line', 'OBSIDIAN_VAULT_PATH="/v"\nOBSIDIAN_WIKI_REPO=\nOBSIDIAN_WIKI_VERSION=2026.10.1\n', 'OBSIDIAN_VAULT_PATH="/v"\nOBSIDIAN_WIKI_REPO="<REPO>"\nOBSIDIAN_WIKI_VERSION="2026.11.4"\n'],
  ['no final newline', 'OBSIDIAN_VAULT_PATH=/v\nOBSIDIAN_WIKI_VERSION="2026.10.1"\n# note', 'OBSIDIAN_VAULT_PATH="/v"\nOBSIDIAN_WIKI_VERSION="2026.11.4"\n# note\nOBSIDIAN_WIKI_REPO="<REPO>"\n'],
  ['a repeated line', 'OBSIDIAN_VAULT_PATH="/v"\nOBSIDIAN_VAULT_PATH="/w"\nOBSIDIAN_WIKI_VERSION="2026.10.1"\n', 'OBSIDIAN_VAULT_PATH="/v"\nOBSIDIAN_WIKI_VERSION="2026.11.4"\nOBSIDIAN_WIKI_REPO="<REPO>"\n'],
];
test('PC-178: the fake refresh writes the config as the real obsidian-wiki 2026.11.4 does', () => {
  const { refreshConfig } = require('./fake-wiki-config');
  for (const [name, before, after] of REAL_REFRESH) assert.equal(refreshConfig(before, { repo: '<REPO>', version: '2026.11.4' }), after, name);
});

test('PC-178: the fake uv records the version specifier it installed, as uv 0.12.13 does', { skip: SH }, (t) => {
  const s = sandbox(t, { vault: false });
  fs.rmSync(path.join(s.state, 'version'));
  require('node:child_process').execFileSync(path.join(s.bin, 'uv'), ['tool', 'install', `obsidian-wiki==${M.PIN}`], { env: process.env });
  const receipt = fs.readFileSync(path.join(s.state, 'uv-tools', 'obsidian-wiki', 'uv-receipt.toml'), 'utf8');
  assert.match(receipt, new RegExp(`\\{ name = "obsidian-wiki", specifier = "==${M.PIN.replace(/\./g, '\\.')}" \\}`));
});
