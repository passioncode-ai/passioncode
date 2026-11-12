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
  for (const ev of hooks) doc.hooks[ev] = [{ matcher: '', hooks: [{ type: 'command', command: `bash "${path.join(state, 'pkg', '_data', 'hooks', SCRIPTS[ev])}"` }] }];
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
  const pkgSkills = path.join(s.state, 'pkg', '_data', 'skills');
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
  assert.deepEqual(M.clashes(s.home, null).sort(), [...withBin, path.join(agents, 'wiki-update')].sort());
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
  // `python` is read only from [tool].
  receipt(s, '[tool]\nrequirements = [{ name = "obsidian-wiki" }]\n\n[other]\npython = "3.9"\n');
  assert.equal(M.receiptSpec(uvBin).python, null);
});
