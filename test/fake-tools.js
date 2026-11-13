#!/usr/bin/env node
// Stand-ins for the macOS tools setup and doctor call, so the tests run on any OS and never touch
// a real app. Each call is appended to $HOME/fake-tools.log. An app bundle's state lives in files:
//   Contents/Info.plist   JSON { CFBundleShortVersionString }
//   BROKEN                codesign, stapler and Gatekeeper reject it
//   TEAM                  the team identifier codesign reports (default KJ35UYYL22)
//   RUNNING               pgrep finds a process running from it
// netstat prints the file $FAKE_NETSTAT (a socket table in macOS's `netstat -anv -p tcp` form), or a table
// with no listeners; `{PEER}` in it is the client port the test's server saw last, read from $FAKE_NETSTAT.peer;
// ps answers `-o uid= -p <pid>` from $FAKE_PS_UIDS and $FAKE_PS_UIDS_EXTRA (`pid=uid,pid=uid`), else fails.
// A release "archive" is JSON { app, version, broken?, team? }; ditto and hdiutil unpack it into a
// bundle whose MCP binary (catalog `mcp.bin`) is test/fake-mcp.js.
// PC-178: uv and obsidian-wiki keep their state in $FAKE_WIKI_STATE (else $HOME/fake-wiki): `version` (what `uv tool
// install` installed, its command written into $UV_TOOL_BIN_DIR). Like obsidian-wiki 2026.11.4's hooks.py, the hooks
// live in $HOME/.claude/settings.json (a command per script, matched by its name), written to a temporary file that
// then replaces the settings file (so a link there becomes a plain file), and `hooks status` exits 1 while SessionStart
// or Stop is not registered. obsidian-wiki's config is $XDG_CONFIG_HOME (else $HOME/.config)/obsidian-wiki/config;
// `doctor --json` prints $FAKE_WIKI_DOCTOR's file when set. $FAKE_UV_LIST_EMPTY: `uv tool list` names nothing.
// $FAKE_WIKI_LIST_ASKS_SETUP: `list` says on stderr what obsidian-wiki's stale check says when it cannot refresh.
// $FAKE_WIKI_HOOKS_BROKEN: `hooks status` answers no report. `setup` and the version refresh of `list` link the bundled
// skills (catalog.WIKI.skills, kept in $FAKE_WIKI_STATE/pkg) into every global skills folder as install_skills does.
// $FAKE_WIKI_LIST_MISSING_SKILLS: `list` also prints obsidian-wiki's missing-skills line. `uv tool dir` names
// $FAKE_WIKI_STATE/uv-tools, where a test may put a uv-receipt.toml. $FAKE_TOOLS_QUIET: nothing is logged (a test's arrangement).
// $FAKE_UV_FAIL and $FAKE_WIKI_SETUP_FAIL make those commands fail ($FAKE_WIKI_SETUP_FAIL=late writes the config, then
// fails; =quiet exits 0 without a config). Like obsidian-wiki 2026.11.4, an ordinary command (`list`) whose config
// records another version runs its stale refresh, write_config (test/fake-wiki-config.js): every managed line written as
// KEY="value", a repeated one dropped, a missing one appended (an empty vault line too), every other line kept. `uv tool
// install` records `specifier = "==<version>"`, each --with and --python as uv 0.12.13 does; `doctor` checks vault-config as
// _read_config reads it and ends with a traceback over a config that is not UTF-8. brew and xcode-select answer as installed ones do.
const fs = require('fs');
const path = require('path');
const catalog = require('../lib/catalog');
const { refreshConfig, doctorVault } = require('./fake-wiki-config');

const [tool, ...args] = process.argv.slice(2);
const home = process.env.HOME;
if (!process.env.FAKE_TOOLS_QUIET) { try { fs.appendFileSync(path.join(home, 'fake-tools.log'), `${tool} ${args.join(' ')}\n`); } catch (_) { /* no home */ } } // a test's own arrangement is not logged
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);
const has = (app, f) => fs.existsSync(path.join(app, f));

function makeApp(archive, destDir) {
  const spec = JSON.parse(fs.readFileSync(archive, 'utf8'));
  const app = path.join(destDir, spec.folder || '', spec.app); // a zip may hold the app inside one folder
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: spec.version }));
  if (spec.broken) fs.writeFileSync(path.join(app, 'BROKEN'), '');
  if (spec.team) fs.writeFileSync(path.join(app, 'TEAM'), spec.team);
  const product = catalog.PRODUCTS.find((p) => p.app === spec.app);
  if (product && product.mcp && product.mcp.bin) {
    const bin = path.join(app, product.mcp.bin);
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-mcp.js')}" ${product.mcp.name} "$@"\n`, { mode: 0o755 });
  }
}

switch (tool) {
  case 'codesign': {
    const app = args[args.length - 1];
    if (args[0] === '--verify') { if (has(app, 'BROKEN')) { err(`${app}: invalid signature (code or signature have been modified)`); process.exit(1); } process.exit(0); }
    if (args[0] === '-dv') { err(`Executable=${app}\nTeamIdentifier=${has(app, 'TEAM') ? fs.readFileSync(path.join(app, 'TEAM'), 'utf8') : catalog.TEAM_ID}`); process.exit(0); }
    process.exit(1);
  }
  case 'xcrun': { const app = args[args.length - 1]; if (has(app, 'BROKEN')) { err('does not have a ticket stapled to it'); process.exit(65); } out('The validate action worked!'); process.exit(0); }
  case 'spctl': { const app = args[args.length - 1]; if (has(app, 'BROKEN')) { err(`${app}: rejected\nsource=no usable signature`); process.exit(3); } err(`${app}: accepted\nsource=Notarized Developer ID`); process.exit(0); }
  case 'plutil': { try { out(JSON.parse(fs.readFileSync(args[args.length - 1], 'utf8')).CFBundleShortVersionString); process.exit(0); } catch (_) { process.exit(1); } }
  case 'pgrep': { const at = args[args.length - 1].replace(/^\(\^\| \)/, '').replace(/\/Contents\/MacOS\/$/, '').replace(/\\(.)/g, '$1'); process.exit(has(at, 'RUNNING') ? 0 : 1); }
  case 'ditto': {
    if (args[0] === '-x') {
      makeApp(args[2], args[3]);
      // An agent session starts the app's MCP server while the release downloads.
      if (process.env.FAKE_BUSY_DURING_DOWNLOAD) fs.writeFileSync(path.join(process.env.FAKE_BUSY_DURING_DOWNLOAD, 'RUNNING'), '');
      process.exit(0);
    }
    // A copy cut off halfway: part of the bundle written, then a failure.
    if (process.env.FAKE_DITTO_COPY_FAIL) { fs.mkdirSync(path.join(args[1], 'Contents'), { recursive: true }); err('ditto: interrupted'); process.exit(1); }
    fs.cpSync(args[0], args[1], { recursive: true }); process.exit(0);
  }
  case 'hdiutil': {
    if (args[0] === 'attach') { makeApp(args[args.length - 1], args[args.indexOf('-mountpoint') + 1]); process.exit(0); }
    process.exit(0); // detach
  }
  case 'docker': if (args[0] === 'info') out('27.0.0'); else out('Docker version 27.0.0'); process.exit(0);
  case 'supabase': out('2.0.0'); process.exit(0);
  case 'launchctl': case 'open': process.exit(0);
  case 'netstat': {
    if (process.env.FAKE_NETSTAT) {
      let text = fs.readFileSync(process.env.FAKE_NETSTAT, 'utf8');
      if (text.includes('{PEER}')) {
        const peerFile = `${process.env.FAKE_NETSTAT}.peer`;
        const until = Date.now() + 3000;
        while (!fs.existsSync(peerFile) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        text = text.split('{PEER}').join(fs.existsSync(peerFile) ? fs.readFileSync(peerFile, 'utf8').trim() : '0');
      }
      process.stdout.write(text); process.exit(0);
    }
    out('Active Internet connections (including servers)');
    out('Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options');
    process.exit(0);
  }
  case 'ps': {
    const pid = args[args.indexOf('-p') + 1];
    const hit = [process.env.FAKE_PS_UIDS, process.env.FAKE_PS_UIDS_EXTRA].filter(Boolean).join(',').split(',').map((x) => x.split('=')).find(([p]) => p === pid);
    if (!hit) { err(`ps: process ${pid} not found`); process.exit(1); }
    out(`  ${hit[1]}`); process.exit(0);
  }
  case 'uv': {
    if (args[0] === '--version') { out('uv 0.9.0'); process.exit(0); }
    const state = process.env.FAKE_WIKI_STATE || path.join(home, 'fake-wiki');
    // $FAKE_UV_LIST_ONLY_MCP: uv holds only obsidian-wiki-mcp, a tool whose name begins like obsidian-wiki's (round 13, R2).
    if (args[0] === 'tool' && args[1] === 'list' && process.env.FAKE_UV_LIST_ONLY_MCP) { out('obsidian-wiki-mcp v1.0.0\n- obsidian-wiki-mcp'); process.exit(0); }
    if (args[0] === 'tool' && args[1] === 'list') { if (fs.existsSync(path.join(state, 'version')) && !process.env.FAKE_UV_LIST_EMPTY) out(`obsidian-wiki v${fs.readFileSync(path.join(state, 'version'), 'utf8').trim()}\n- obsidian-wiki`); process.exit(0); }
    if (args[0] === 'tool' && args[1] === 'dir') { out(path.join(state, 'uv-tools')); process.exit(0); }
    if (args[0] === 'tool' && args[1] === 'uninstall') {
      fs.rmSync(path.join(state, 'version'), { force: true });
      fs.rmSync(path.join(state, 'uv-tools', 'obsidian-wiki'), { recursive: true, force: true }); // its environment and record
      fs.rmSync(path.join(process.env.UV_TOOL_BIN_DIR || path.join(home, '.local', 'bin'), 'obsidian-wiki'), { force: true });
      out('Uninstalled 1 executable: obsidian-wiki'); process.exit(0);
    }
    if (args[0] === 'tool' && args[1] === 'install') {
      if (process.env.FAKE_UV_FAIL) { err('error: Failed to download obsidian-wiki'); process.exit(2); }
      const spec = (args.find((a) => /^obsidian-wiki(\[[^\]]*\])?==/.test(a)) || '').replace(/\[[^\]]*\]/, '');
      if (!spec) { err('fake uv: only obsidian-wiki==<version>'); process.exit(2); }
      const dir = process.env.UV_TOOL_BIN_DIR || path.join(home, '.local', 'bin');
      fs.mkdirSync(state, { recursive: true });
      fs.mkdirSync(dir, { recursive: true });
      // $FAKE_UV_INSTALLS_VERSION: what lands is not what was asked for (round 11, R1).
      fs.writeFileSync(path.join(state, 'version'), process.env.FAKE_UV_INSTALLS_VERSION || spec.split('==')[1]);
      fs.writeFileSync(path.join(dir, 'obsidian-wiki'), `#!/bin/sh\nexec "${process.execPath}" "${__filename}" obsidian-wiki "$@"\n`, { mode: 0o755 });
      // $FAKE_UV_INSTALL_ADDS_SKILL: a folder holding SKILL.md appears with the first install (a clash after the reinstall, round 13, R3).
      const adds = process.env.FAKE_UV_INSTALL_ADDS_SKILL;
      if (adds && !fs.existsSync(path.join(adds, 'SKILL.md'))) { fs.mkdirSync(adds, { recursive: true }); fs.writeFileSync(path.join(adds, 'SKILL.md'), '---\nname: mine\n---\n'); }
      // uv's record of the tool, naming the command it installed (round 16, R6).
      fs.mkdirSync(path.join(state, 'uv-tools', 'obsidian-wiki'), { recursive: true });
      // uv 0.12.13 records the specifier it was given (`==<version>`), and the extras (round 17, R6).
      const extras = (/^obsidian-wiki\[([^\]]*)\]/.exec(args.find((a) => /^obsidian-wiki(\[[^\]]*\])?==/.test(a)) || '') || [])[1];
      const req = `{ name = "obsidian-wiki"${extras ? `, extras = [${extras.split(',').map((e) => `"${e.trim()}"`).join(', ')}]` : ''}, specifier = "==${spec.split('==')[1]}" }`;
      // Each --with as its own requirement and --python as the record's python, as uv 0.12.13 writes them (round 18, R11).
      const withs = args.flatMap((a, i) => (a === '--with' ? [args[i + 1]] : a.startsWith('--with=') ? [a.slice(7)] : [])).map((w) => {
        const m = /^([A-Za-z0-9._-]+)(\[[^\]]*\])?(.*)$/.exec(w);
        return `{ name = "${m[1]}"${m[2] ? `, extras = [${m[2].slice(1, -1).split(',').map((e) => `"${e.trim()}"`).join(', ')}]` : ''}${m[3] ? `, specifier = "${m[3]}"` : ''} }`;
      });
      const py = args.includes('--python') ? args[args.indexOf('--python') + 1] : null;
      fs.writeFileSync(path.join(state, 'uv-tools', 'obsidian-wiki', 'uv-receipt.toml'), `[tool]\nrequirements = [${[req, ...withs].join(', ')}]\n${py ? `python = "${py}"\n` : ''}entrypoints = [{ name = "obsidian-wiki", install-path = "${path.join(dir, 'obsidian-wiki')}", from = "obsidian-wiki" }]\n`);
      out(`Installed 1 executable: obsidian-wiki`); process.exit(0);
    }
    process.exit(2);
  }
  case 'obsidian-wiki': {
    const state = process.env.FAKE_WIKI_STATE || path.join(home, 'fake-wiki');
    const version = (() => { try { return fs.readFileSync(path.join(state, 'version'), 'utf8').trim(); } catch (_) { return null; } })();
    if (!version) process.exit(127); // not installed: the stub on PATH answers as a missing command does
    // $FAKE_WIKI_BROKEN: uv holds it, but it does not run (its Python removed): 127 for every command (round 11, S2).
    if (process.env.FAKE_WIKI_BROKEN) { err('bad interpreter: No such file or directory'); process.exit(127); }
    // As obsidian-wiki 2026.11.4 resolves it (cli.py _resolve_global_config_dir): ~/.obsidian-wiki only while it is a
    // folder and the XDG folder does not exist (Path.exists follows a link: a link to nothing does not exist).
    const xdgDir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian-wiki');
    const legacyDir = path.join(home, '.obsidian-wiki');
    const config = path.join((() => { try { return fs.statSync(legacyDir).isDirectory(); } catch (_) { return false; } })() && !fs.existsSync(xdgDir) ? legacyDir : xdgDir, 'config');
    // The installed package (as obsidian_wiki/_data): its bundled skills and hooks, made on first use.
    // Where uv puts it (round 16, R6): <uv tool dir>/obsidian-wiki/lib/python3.12/site-packages/obsidian_wiki/_data.
    const pkg = path.join(state, 'uv-tools', 'obsidian-wiki', 'lib', 'python3.12', 'site-packages', 'obsidian_wiki', '_data');
    // $FAKE_WIKI_PKG_DROP: a name the package does not bundle (an older release).
    const NAMES = catalog.WIKI.skills.filter((n) => n !== process.env.FAKE_WIKI_PKG_DROP);
    if (!fs.existsSync(pkg)) {
      for (const n of NAMES) { fs.mkdirSync(path.join(pkg, 'skills', n), { recursive: true }); fs.writeFileSync(path.join(pkg, 'skills', n, 'SKILL.md'), `---\nname: ${n}\n---\n`); }
      fs.mkdirSync(path.join(pkg, 'hooks'), { recursive: true });
      for (const sc of ['wiki-session-recap.sh', 'wiki-prompt-recall.sh', 'wiki-stop-capture.sh']) fs.writeFileSync(path.join(pkg, 'hooks', sc), '#!/bin/sh\n', { mode: 0o755 });
    }
    // As cli.py install_skills: a link or file of a bundled name is unlinked, a real folder holding SKILL.md is removed
    // with everything in it (a folder without one is skipped), then the bundled skill is linked in its place.
    const installSkills = (dir) => {
      fs.mkdirSync(dir, { recursive: true });
      for (const n of NAMES) {
        const at = path.join(dir, n);
        const st = fs.lstatSync(at, { throwIfNoEntry: false });
        if (st && (st.isSymbolicLink() || st.isFile())) fs.unlinkSync(at);
        else if (st && st.isDirectory()) { if (fs.existsSync(path.join(at, 'SKILL.md'))) fs.rmSync(at, { recursive: true, force: true }); else continue; }
        fs.symlinkSync(path.join(pkg, 'skills', n), at);
      }
    };
    // As GLOBAL_AGENT_DIRS, with HERMES_HOME's skills and each Hermes profile's (`p.is_dir()` follows a link; round 11, R4).
    const skillDirs = catalog.WIKI.skillDirs.map((rel) => path.join(home, rel));
    if (process.env.HERMES_HOME) skillDirs.push(path.join(process.env.HERMES_HOME, 'skills'));
    try {
      const profiles = path.join(home, '.hermes', 'profiles');
      for (const p of fs.readdirSync(profiles)) { try { if (fs.statSync(path.join(profiles, p)).isDirectory()) skillDirs.push(path.join(profiles, p, 'skills')); } catch (_) { /* a link to nothing */ } }
    } catch (_) { /* none */ }
    // As cli.py _refresh_installed_skills: only folders that already hold a bundled name with SKILL.md.
    const refreshSkills = () => { for (const d of skillDirs) { if (NAMES.some((n) => fs.existsSync(path.join(d, n, 'SKILL.md')))) installSkills(d); } };
    const settings = path.join(home, '.claude', 'settings.json');
    const SCRIPTS = { SessionStart: 'wiki-session-recap.sh', UserPromptSubmit: 'wiki-prompt-recall.sh', Stop: 'wiki-stop-capture.sh' };
    const readSettings = () => { try { return JSON.parse(fs.readFileSync(settings, 'utf8')); } catch (_) { return {}; } };
    const commands = (doc, ev) => (((doc.hooks || {})[ev]) || []).flatMap((g) => (g && g.hooks) || []).map((e) => String((e && e.command) || ''));
    const registered = (doc, ev) => commands(doc, ev).some((c) => c.includes(SCRIPTS[ev]));
    const hooks = Object.keys(SCRIPTS).filter((ev) => registered(readSettings(), ev));
    const writeSettings = (doc) => { // like hooks.py _write: a temporary file, then os.replace over the settings file
      fs.mkdirSync(path.dirname(settings), { recursive: true });
      const tmp = path.join(path.dirname(settings), `.settings.json.${process.pid}.tmp`);
      fs.writeFileSync(tmp, JSON.stringify(doc || {}, null, 2) + '\n');
      fs.renameSync(tmp, settings);
    };
    const saveHooks = (list) => {
      const doc = readSettings();
      doc.hooks = doc.hooks || {};
      for (const ev of Object.keys(SCRIPTS)) {
        const groups = (doc.hooks[ev] || []).map((g) => ({ ...g, hooks: ((g && g.hooks) || []).filter((e) => !String((e && e.command) || '').includes(SCRIPTS[ev])) })).filter((g) => g.hooks.length);
        if (list.includes(ev)) groups.push({ matcher: '', hooks: [{ type: 'command', command: `PATH="${path.join(state, 'bin')}:$PATH" bash "${path.join(pkg, 'hooks', SCRIPTS[ev])}"` }] });
        if (groups.length) doc.hooks[ev] = groups; else delete doc.hooks[ev];
      }
      writeSettings(doc);
    };
    const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
    if (args[0] === '--version') { out(`obsidian-wiki ${version}`); process.exit(0); }
    const recorded = () => { try { return (/^OBSIDIAN_WIKI_VERSION="?([^"\n]*)"?$/m.exec(fs.readFileSync(config, 'utf8')) || [])[1] || null; } catch (_) { return null; } };
    if (args[0] === 'list') {
      if (process.env.OBSIDIAN_WIKI_NO_UPDATE_CHECK) fs.appendFileSync(path.join(home, 'fake-tools.log'), 'obsidian-wiki list ran with its update check off\n');
      if (process.env.FAKE_WIKI_LIST_ASKS_SETUP) { err(`obsidian-wiki upgraded ${recorded()} to ${version} but the skills could not be refreshed (fake).\n   Run: obsidian-wiki setup`); out('wiki-update'); process.exit(0); }
      // As _check_stale and write_config (test/fake-wiki-config.js, compared with real outputs; round 17, R6).
      if (recorded() && recorded() !== version) {
        refreshSkills();
        fs.writeFileSync(config, refreshConfig(fs.readFileSync(config, 'utf8'), { repo: pkg, version }));
      }
      if (process.env.FAKE_WIKI_LIST_MISSING_SKILLS) err(`⚠️  3 skill(s) missing from ~/.claude/skills/ (e.g. wiki-agent).\n   Run: obsidian-wiki setup`);
      out('wiki-update\nwiki-query'); process.exit(0);
    }
    if (args[0] === 'setup') {
      if (process.stdin.isTTY) fs.appendFileSync(path.join(home, 'fake-tools.log'), 'obsidian-wiki setup ran on a terminal\n');
      const vault = args[args.indexOf('--vault') + 1];
      if (process.env.FAKE_WIKI_SETUP_FAIL === 'quiet') process.exit(0);
      fs.mkdirSync(vault, { recursive: true });
      fs.writeFileSync(path.join(vault, 'index.md'), '---\ntitle: Wiki Index\n---\n');
      // $FAKE_WIKI_LOCK_PARENT: the vault's parent folder turns read-only before the failure, so it cannot be removed.
      if (process.env.FAKE_WIKI_LOCK_PARENT) fs.chmodSync(path.dirname(vault), 0o555);
      if (process.env.FAKE_WIKI_SETUP_FAIL && !['late', 'after-skills'].includes(process.env.FAKE_WIKI_SETUP_FAIL)) { err('error: setup failed'); process.exit(1); }
      fs.mkdirSync(path.dirname(config), { recursive: true });
      // As the real write_config: the package's _data folder too (round 15, R14).
      fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${vault}"\nOBSIDIAN_WIKI_REPO="${pkg}"\nOBSIDIAN_WIKI_VERSION="${version}"\n`);
      fs.writeFileSync(path.join(path.dirname(config), 'WRITING.md'), '# Writing profile\n'); // ensure_global_writing_profile
      // $FAKE_WIKI_LOCK_CONFIG: the config folder turns unlistable before the failure (round 13, R8).
      if (process.env.FAKE_WIKI_LOCK_CONFIG) fs.chmodSync(path.dirname(config), 0o300);
      if (process.env.FAKE_WIKI_SETUP_FAIL === 'late') { err('error: setup failed after its config'); process.exit(1); }
      // Like obsidian-wiki's own setup (install_global_skills), its skills go into every agent's global folder.
      for (const d of skillDirs) installSkills(d);
      if (process.env.FAKE_WIKI_SETUP_FAIL === 'after-skills') { err('error: setup failed after linking its skills'); process.exit(1); }
      if (!args.includes('--no-hooks')) saveHooks([...hooks, 'SessionStart', 'Stop']);
      out('Setup complete!'); process.exit(0);
    }
    if (args[0] === 'hooks' && args[1] === 'install') {
      // $FAKE_WIKI_HOOKS_INSTALL: fail (exit 1), nofile (exit 0, nothing written), partial (half a JSON file), nostart (no SessionStart).
      const mode = process.env.FAKE_WIKI_HOOKS_INSTALL;
      if (mode === 'fail') { err(`error: ${settings} could not be written (fake)`); process.exit(1); }
      if (mode === 'nofile') process.exit(0);
      if (mode === 'partial' || mode === 'nostart') { writeSettings(mode === 'partial' ? undefined : { hooks: {} }); if (mode === 'partial') fs.writeFileSync(settings, '{"hooks": {'); process.exit(0); }
      // $FAKE_WIKI_HOOKS_INSTALL_TOUCH: another writer adds a key to that file while this runs.
      if (process.env.FAKE_WIKI_HOOKS_INSTALL_TOUCH) { const f = process.env.FAKE_WIKI_HOOKS_INSTALL_TOUCH; const d = JSON.parse(fs.readFileSync(f, 'utf8')); d.touched = true; fs.writeFileSync(f, JSON.stringify(d)); }
      const add = (only ? [only] : ['SessionStart', 'Stop']).filter((ev) => !hooks.includes(ev));
      if (add.length) saveHooks([...hooks, ...add]);
      out(`settings: ${settings}`); process.exit(0);
    }
    if (args[0] === 'hooks' && args[1] === 'uninstall') { const keep = hooks.filter((h) => only && h !== only); if (keep.length !== hooks.length) saveHooks(keep); process.exit(0); }
    if (args[0] === 'hooks' && args[1] === 'status') {
      if (process.env.FAKE_WIKI_HOOKS_BROKEN) { err(`error: ${settings} is not valid JSON`); process.exit(1); }
      out(JSON.stringify({ hooks: Object.keys(SCRIPTS).map((event) => ({ event, script: SCRIPTS[event], bundled: path.join(pkg, 'hooks', SCRIPTS[event]), registered: hooks.includes(event) })), reachability: { reachable: true, hint: '' } }));
      process.exit(hooks.includes('SessionStart') && hooks.includes('Stop') ? 0 : 1); // as obsidian-wiki: the required hooks are SessionStart and Stop
    }
    if (args[0] === 'doctor') {
      if (process.env.FAKE_WIKI_DOCTOR) { out(fs.readFileSync(process.env.FAKE_WIKI_DOCTOR, 'utf8')); process.exit(0); }
      if (!fs.existsSync(config)) { out(JSON.stringify({ status: 'fail', checks: [{ name: 'global-config', status: 'fail', detail: `${config} missing`, hint: 'run: obsidian-wiki setup --vault /path/to/your/vault' }] })); process.exit(1); }
      // As the real 2026.11.4: a config that is not UTF-8 ends its doctor with a traceback, no report (round 18, 2).
      let text;
      try { text = new TextDecoder('utf-8', { fatal: true }).decode(fs.readFileSync(config)); } catch (_) {
        err(`Traceback (most recent call last):\n  File "<frozen codecs>", line 322, in decode\nUnicodeDecodeError: 'utf-8' codec can't decode byte (fake)`); process.exit(1);
      }
      // Its vault-config check (_read_config: the last line wins; an empty value fails), test/fake-wiki-config.js (round 18, R11).
      const vc = doctorVault(text, { home });
      const lag = recorded() && recorded() !== version
        ? [{ name: 'setup-version', status: 'warn', detail: `setup ran with ${recorded()}; installed package is ${version}`, hint: 'run: obsidian-wiki setup' }] : [];
      out(JSON.stringify({ status: vc.status === 'fail' ? 'fail' : lag.length ? 'warn' : 'pass', checks: [vc, ...lag, { name: 'session-hooks', status: 'info', detail: 'not registered (optional)', hint: 'run: obsidian-wiki hooks install' }] }));
      process.exit(vc.status === 'fail' ? 1 : 0);
    }
    process.exit(2);
  }
  case 'brew': {
    // `brew --prefix`: $FAKE_BREW_PREFIX, else a folder of this home's (made, writable).
    if (args[0] === '--prefix') {
      const at = process.env.FAKE_BREW_PREFIX || path.join(home, 'homebrew');
      fs.mkdirSync(at, { recursive: true });
      try { fs.mkdirSync(path.join(at, 'bin'), { recursive: true }); } catch (_) { /* a prefix this user cannot write */ }
      out(at); process.exit(0);
    }
    out('Homebrew 4.6.0'); process.exit(0);
  }
  case 'xcode-select': out('/Library/Developer/CommandLineTools'); process.exit(0);
  default: err(`fake-tools: unknown ${tool}`); process.exit(127);
}
