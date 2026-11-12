'use strict';
/**
 * The agents' wiki memory (PC-178, ADR-0006): obsidian-wiki, an open-source tool (MIT, PyPI `obsidian-wiki`,
 * github.com/Ar9av/obsidian-wiki) agents read and write a vault with, pinned by this launcher release and installed with
 * uv; and the vault it keeps, made once for a user who has none. Obsidian, where a person reads the vault, is an app
 * (catalog.OBSIDIAN) and installs like one. Only the mechanics: the launcher never reads or writes what a vault holds,
 * never runs `obsidian-wiki setup` over an existing config (the operator's decision of 2026-11-12: setup rewrites the
 * config), and never registers obsidian-wiki's Stop hook: from 2026.11 its setup registers one that wakes every editing
 * session in every project, after every turn, to write into the vault.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const catalog = require('./catalog');
const releases = require('./releases');
const permissions = require('./permissions');

const PIN = catalog.WIKI.pin;
const UV_PAGE = 'https://docs.astral.sh/uv/getting-started/installation/';
const GIT_PAGE = 'https://git-scm.com/downloads';
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);
const lastLine = (r) => (r.err || r.out || `exit ${r.code}`).trim().split('\n').pop();

/**
 * The step that refreshes what obsidian-wiki recorded at setup without rewriting the config: any ordinary command runs
 * its stale check, which records the installed version and refreshes the skills it linked, keeping every other key of
 * the config (obsidian-wiki 2026.11.4, `_check_stale`). `list` is the one that does nothing else.
 */
const NEVER = "never `obsidian-wiki setup`, a bare `obsidian-wiki hooks install`, or obsidian-wiki's wiki-setup skill";
const REFRESH = `run: obsidian-wiki list (an ordinary command: it records the installed version and refreshes the skills, keeping every other key of the config); ${NEVER}`;

/** An XDG folder variable's value when it is absolute; uv ignores a relative one, and so does the launcher. */
const xdgAbs = (name) => { const v = process.env[name]; return v && path.isAbsolute(v) ? v : null; };

/** Where uv puts a tool's command, in uv's own order: UV_TOOL_BIN_DIR, XDG_BIN_HOME, XDG_DATA_HOME/../bin, ~/.local/bin. */
function toolBinDir(home) {
  const data = xdgAbs('XDG_DATA_HOME') ? path.join(xdgAbs('XDG_DATA_HOME'), '..', 'bin') : null;
  return path.resolve(process.env.UV_TOOL_BIN_DIR || xdgAbs('XDG_BIN_HOME') || data || path.join(home, '.local', 'bin'));
}

/**
 * obsidian-wiki's config folder, found as obsidian-wiki 2026.11.4 finds it (`_resolve_global_config_dir`): the older
 * ~/.obsidian-wiki only while it is a folder and $XDG_CONFIG_HOME/obsidian-wiki (default ~/.config/obsidian-wiki) does
 * not exist, as Path.exists() sees it (a link to nothing does not); else the latter. Only the config file itself counts
 * when it is a link to nothing (configOf).
 */
function configDir(home) {
  const xdg = (process.env.XDG_CONFIG_HOME || '').trim();
  const xdgDir = path.join(xdg ? path.resolve(home, xdg.replace(/^~(?=$|\/)/, home)) : path.join(home, '.config'), 'obsidian-wiki');
  const legacy = path.join(home, '.obsidian-wiki');
  let legacyDir = false;
  try { legacyDir = fs.statSync(legacy).isDirectory(); } catch (_) { legacyDir = false; }
  // Path.exists() follows a link, so an XDG folder that is a link to nothing does not exist (round 5, U1).
  return legacyDir && !fs.existsSync(xdgDir) ? legacy : xdgDir;
}
/** The one config file obsidian-wiki reads. */
function configFiles(home) { return [path.join(configDir(home), 'config')]; }
/** The config this user has, or null; an entry that is there at all counts (a link to nothing too): nothing of theirs is set up again. */
function configOf(home) { return configFiles(home).find((f) => { try { fs.lstatSync(f); return true; } catch (_) { return false; } }) || null; }

/** Every file named `name` on PATH, in PATH's order. */
function onPath(name) {
  const names = process.platform === 'win32' ? [`${name}.exe`, `${name}.cmd`, name] : [name];
  const found = [];
  for (const dir of String(process.env.PATH || '').split(path.delimiter).filter(Boolean)) {
    for (const n of names) {
      const at = path.resolve(dir, n);
      try { if (fs.statSync(at).isFile() && !found.includes(at)) found.push(at); } catch (_) { /* not here */ }
    }
  }
  return found;
}

/** `bin --version`: its version, or null when it does not answer (127, a stand-in for an absent command). */
function versionOf(bin) {
  const r = releases.run(bin, ['--version'], { timeout: 20000, input: '' });
  if (r.code === 127) return undefined;
  const m = /obsidian-wiki\s+(\S+)/.exec(`${r.out}\n${r.err}`);
  return r.code === 0 && m ? m[1] : null;
}

/**
 * The obsidian-wiki an agent runs by name (the first on PATH), else the copy where uv puts it; null when none answers.
 * `onPath` false: agents and its hooks cannot run it by name. `uvs`: it is the copy in uv's tool folder that `uv tool
 * list` names, the only one `uv tool install --force` replaces. `uvCopy`: uv's copy, when another is found before it on PATH.
 */
function tool(home) {
  const uvDir = toolBinDir(home);
  // A copy counts as uv's only when it sits in uv's tool folder AND `uv tool list` names obsidian-wiki: pipx and
  // pip --user put theirs in ~/.local/bin too (round 5, P4).
  let listed;
  const uvLists = () => {
    if (listed === undefined) { const u = uv(home); listed = !!u && /^obsidian-wiki\b/m.test(releases.run(u, ['tool', 'list'], { timeout: 30000, input: '' }).out); }
    return listed;
  };
  const inDir = (bin) => path.dirname(bin) === uvDir;
  const inUv = (bin) => inDir(bin) && uvLists();
  const first = onPath('obsidian-wiki')[0];
  let active = null;
  if (first) {
    const version = versionOf(first);
    if (version !== undefined) active = { bin: first, version, onPath: true };
  }
  const uvBin = path.join(uvDir, exe('obsidian-wiki'));
  const uvVersion = fs.existsSync(uvBin) && (!active || active.bin !== uvBin) ? versionOf(uvBin) : undefined;
  if (!active) return uvVersion === undefined ? null : { bin: uvBin, version: uvVersion, onPath: false, uvs: inUv(uvBin), inUvDir: true, uvCopy: null };
  return { ...active, uvs: inUv(active.bin), inUvDir: inDir(active.bin), uvCopy: uvVersion === undefined ? null : uvBin };
}

/** The uv command, or null: by name on PATH, else where uv's installer puts it (UV_INSTALL_DIR, XDG_BIN_HOME, ~/.local/bin, ~/.cargo/bin). */
function uv(home) {
  if (releases.run('uv', ['--version'], { timeout: 15000 }).code === 0) return 'uv';
  // The installer's order: UV_INSTALL_DIR, XDG_BIN_HOME, XDG_DATA_HOME/../bin, ~/.local/bin (and ~/.cargo/bin, older installers).
  const data = xdgAbs('XDG_DATA_HOME') ? path.join(xdgAbs('XDG_DATA_HOME'), '..', 'bin') : null;
  const dirs = [process.env.UV_INSTALL_DIR, xdgAbs('XDG_BIN_HOME'), data, path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin')].filter(Boolean);
  for (const dir of dirs) {
    const at = path.join(dir, exe('uv'));
    if (fs.existsSync(at) && releases.run(at, ['--version'], { timeout: 15000 }).code === 0) return at;
  }
  return null;
}

/**
 * How uv gets onto this machine when it is missing: with Homebrew, `brew install uv` (an agent runs it; the launcher
 * names it and never runs it); without, a person runs the installer uv's page names (never piped into a shell by an
 * agent), so the step is theirs (`consent`).
 */
function uvRoute() {
  // Homebrew counts only where this user can write its prefix's bin (a second user on a Mac usually cannot; Intel's
  // /usr/local itself is root's while Homebrew's bin in it is the installing user's).
  const b = releases.run('brew', ['--prefix'], { timeout: 15000 });
  let brew = false;
  if (b.code === 0 && b.out.trim()) { try { fs.accessSync(path.join(b.out.trim(), 'bin'), fs.constants.W_OK); brew = true; } catch (_) { brew = false; } }
  return brew
    ? { step: 'brew install uv', gate: null, note: 'needs uv: brew install uv, then run setup again' }
    : { step: `a person installs uv with the installer its page names (${UV_PAGE})`, gate: 'consent', note: `needs uv: a person installs it with the installer its page names (${UV_PAGE}), then runs setup again` };
}

/**
 * Why git cannot make the vault a repository here, or null. On macOS `xcode-select -p` is asked first: running git
 * without Apple's command line tools opens their install dialog.
 */
function gitNote(platform) {
  if (platform === 'darwin' && releases.run('xcode-select', ['-p'], { timeout: 15000 }).code !== 0) {
    return `needs git: install Apple's command line tools (xcode-select --install), then run setup again`;
  }
  return releases.run('git', ['--version'], { timeout: 15000 }).code === 0 ? null : `needs git: install it (${GIT_PAGE}), then run setup again`;
}

const defaultVault = (home) => path.join(home, 'Documents', 'Wiki');

/** Why `dir` cannot become a new vault, or null: something other than a folder is there, or a folder that holds anything. */
function vaultProblem(dir) {
  let st;
  try { st = fs.statSync(dir); } catch (_) { return null; }
  if (!st.isDirectory()) return 'is not a folder';
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n !== '.DS_Store'); } catch (error) { return `cannot be read (${error.code || error.message})`; }
  return names.length ? 'already holds files' : null;
}

/**
 * The only commands a memory row's fix may name (round 4: the launcher never relays obsidian-wiki's own hints). Besides
 * these: the launcher's own `setup --with wiki` and `doctor`, and the pip/pipx note for a copy uv did not install.
 */
const ALLOWED = ['obsidian-wiki list', 'obsidian-wiki hooks status --json', 'obsidian-wiki doctor --json', 'uv tool update-shell', 'brew install uv'];
// Round 6: neither `hooks install --only SessionStart` nor `hooks uninstall --only Stop` is handed out any more:
// obsidian-wiki's writer rewrites ~/.claude/settings.json without its permission bits (and replaces a link). The launcher
// writes the SessionStart entry itself (`hook`), and a Stop entry is removed by hand.
/**
 * The fix for one of obsidian-wiki doctor's checks: never its own hint (which may run `obsidian-wiki setup`, a bare
 * `hooks install` or its wiki-setup skill), but a step on the allowlist or a fixed text. The recorded version: the stale
 * refresh; missing vault files: made by hand; the SessionStart hook: `hooks install --only SessionStart`; anything else:
 * what obsidian-wiki reports, where to read it, and the launcher's own route.
 */
function fixFor(check, NPX) {
  const name = String(check.name || 'check'), detail = String(check.detail || '').trim();
  if (name === 'setup-version') return REFRESH;
  if (name === 'vault-core-files') return `create the missing files by hand (${detail}); ${NEVER}`;
  // Setup has no repair for any obsidian-wiki doctor check: the text names where to read it and what never to run.
  return `obsidian-wiki reports ${name} ${check.status || 'warn'}: ${detail}; read \`obsidian-wiki doctor --json\` (its session-hooks hint asking for a bare hooks install is expected: the launcher registers only SessionStart); ${NEVER}`;
}

/**
 * Where obsidian-wiki's version stands against the pin: its leading x.y.z decides (`ahead`, `behind`, `equal`); the same
 * x.y.z with a suffix the launcher cannot order (`.post1`, `rc1`), or no version, is `unknown`: never a forced reinstall.
 */
function versionAgainstPin(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)(.*)$/.exec(String(v || ''));
  if (!m) return 'unknown';
  const p = PIN.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (Number(m[i + 1]) !== p[i]) return Number(m[i + 1]) > p[i] ? 'ahead' : 'behind';
  return m[4] ? 'unknown' : 'equal';
}

/**
 * The bundled skills of the obsidian-wiki package `bin` belongs to: { dir, names }, read from that package's
 * `_data/skills` (found through the hook scripts `hooks status --json` names, a read that runs no stale refresh); else the
 * pinned list with no folder (before obsidian-wiki is installed, or when it answers no report).
 */
function bundledSkills(bin) {
  if (bin) {
    const r = releases.run(bin, ['hooks', 'status', '--json'], { timeout: 30000, input: '' });
    try {
      const at = (JSON.parse(r.out).hooks || []).map((h) => h && h.bundled).find(Boolean);
      const dir = at ? path.join(path.dirname(path.dirname(at)), 'skills') : null;
      if (dir) return { dir, names: fs.readdirSync(dir).filter((n) => { try { return fs.statSync(path.join(dir, n)).isDirectory(); } catch (_) { return false; } }) };
    } catch (_) { /* below */ }
  }
  return { dir: null, names: catalog.WIKI.skills };
}

/** obsidian-wiki's global skills folders (cli.py GLOBAL_AGENT_DIRS), with the Hermes profiles its setup also fills. */
function skillFolders(home) {
  const dirs = catalog.WIKI.skillDirs.map((rel) => path.join(home, rel));
  if (process.env.HERMES_HOME) dirs.push(path.join(process.env.HERMES_HOME.replace(/^~(?=$|\/)/, home), 'skills'));
  try { for (const p of fs.readdirSync(path.join(home, '.hermes', 'profiles'))) dirs.push(path.join(home, '.hermes', 'profiles', p, 'skills')); } catch (_) { /* none */ }
  return [...new Set(dirs.map((d) => path.resolve(d)))];
}

/**
 * The entries obsidian-wiki's setup or its version refresh would delete or replace (round 6, S1): in each of its global
 * skills folders, an entry with a bundled skill's name that is not obsidian-wiki's own: a link or a file (it unlinks
 * them), a folder holding SKILL.md (it removes it with everything in it). Only a link into its package is its own
 * (a copy mode install, as on Windows without link rights, reads as a clash: the safe side). A folder without SKILL.md
 * it skips, so that is no clash.
 */
function clashes(home, bin) {
  const { dir, names } = bundledSkills(bin);
  const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return null; } };
  const own = (n) => (dir ? real(path.join(dir, n)) : null);
  const found = [];
  for (const folder of skillFolders(home)) {
    for (const n of names) {
      const at = path.join(folder, n);
      const st = fs.lstatSync(at, { throwIfNoEntry: false });
      if (!st) continue;
      if (st.isSymbolicLink()) {
        const to = real(at);
        const ours = to && (own(n) ? to === own(n) : /[\\/]obsidian_wiki[\\/]_data[\\/]skills[\\/][^\\/]+$/.test(to));
        if (!ours) found.push(at);
      } else if (st.isDirectory()) {
        // Any real folder holding SKILL.md, even one whose SKILL.md is the package's: obsidian-wiki 2026.11.4 bundles
        // anthropics' skill-creator, and the operator's own copy of it carried the same SKILL.md and another LICENSE.txt.
        if (fs.existsSync(path.join(at, 'SKILL.md'))) found.push(at);
      } else found.push(at);
    }
  }
  return found;
}
/** The note for a clash: each entry, and that it is the person's to move. */
const clashNote = (list) => `obsidian-wiki's setup would replace ${list.length === 1 ? 'a skill of yours that shares a name with one of its own' : `${list.length} skills of yours that share a name with its own`} (${list.join(', ')}); move or rename ${list.length === 1 ? 'it' : 'them'}, then run setup again`;

/** `obsidian-wiki hooks status --json`: { start, stop, reachable, hint } or { error }. */
function hookState(bin) {
  const r = releases.run(bin, ['hooks', 'status', '--json'], { timeout: 30000, input: '' });
  let doc;
  try { doc = JSON.parse(r.out); } catch (_) { return { error: (r.err || r.out || `exit ${r.code}`).trim().split('\n')[0] }; }
  const hooks = Array.isArray(doc.hooks) ? doc.hooks : [];
  const on = (event) => hooks.some((h) => h && h.event === event && h.registered === true);
  const reach = doc.reachability || {};
  return { start: on('SessionStart'), stop: on('Stop'), reachable: reach.reachable !== false, hint: reach.hint || null };
}

/** The only Claude Code settings file obsidian-wiki writes its hooks to: the literal ~/.claude/settings.json. */
const hooksFile = (home) => path.join(home, '.claude', 'settings.json');
/** obsidian-wiki 2026.11.4's hook scripts (hooks.py HOOKS), which it matches registrations by. */
const HOOK_SCRIPTS = { SessionStart: 'wiki-session-recap.sh', Stop: 'wiki-stop-capture.sh' };
/**
 * Where ~/.claude/settings.json points when it is a link, else null. obsidian-wiki writes the file through a temporary
 * one and os.replace, which would turn the link into a plain file; the launcher's own writer keeps it (permissions.js).
 */
function settingsLink(home) {
  const file = hooksFile(home);
  try { if (!fs.lstatSync(file).isSymbolicLink()) return null; } catch (_) { return null; }
  try { return permissions.endOf(file); } catch (_) { return file; }
}

/**
 * doctor's rows for the wiki memory (area `memory`). `claude`: { here: Claude Code is installed, settings: the settings
 * file it reads }. `newer(a, b)` is doctor's version order, passed in (doctor requires this module). `launcherVault`:
 * the vault this launcher made, from its state, the only one whose missing SessionStart hook setup registers again.
 */
function checks({ home, NPX, newer, claude, launcherVault = null }) {
  const rows = [];
  const add = (c) => rows.push({ area: 'memory', product: 'wiki', fix: null, repair: null, gate: null, ...c });
  const t = tool(home);
  if (!t) {
    const u = uv(home);
    const route = u ? null : uvRoute();
    add({ id: 'memory.wiki', state: 'info', detail: `${catalog.WIKI.name} (the agents' wiki memory): not installed`, fix: u ? `${NPX} setup --with wiki` : `${route.step}, then ${NPX} setup --with wiki`, gate: route ? route.gate : null });
    const clashed = configOf(home) ? [] : clashes(home, null);
    if (clashed.length) add({ id: 'memory.wiki.clash', state: 'warn', detail: `${clashed.length === 1 ? 'a skill of yours shares a name' : `${clashed.length} skills of yours share a name`} with one of obsidian-wiki's, which its setup would replace: ${clashed.join(', ')}`, fix: `move or rename ${clashed.length === 1 ? 'it' : 'them'}, then ${NPX} setup --with wiki`, gate: 'consent' });
    return rows;
  }
  // The leading x.y.z decides; the pin's own x.y.z with a suffix the launcher cannot order, or no version, is unknown:
  // a warning naming the pin, never a forced reinstall (it could take back a newer build).
  const clashed = clashes(home, t.bin);
  if (clashed.length) {
    add({ id: 'memory.wiki.clash', state: 'warn', detail: `${clashed.length === 1 ? 'a skill of yours shares a name' : `${clashed.length} skills of yours share a name`} with one of obsidian-wiki's, which its setup and its version refresh replace: ${clashed.join(', ')}`,
      fix: `move or rename ${clashed.length === 1 ? 'it' : 'them'}, then ${NPX} setup`, gate: 'consent' });
  }
  const stand = versionAgainstPin(t.version);
  if (stand === 'unknown') {
    add({ id: 'memory.wiki', state: 'warn', detail: !t.version ? `${catalog.WIKI.name} at ${t.bin}: its version could not be read; this launcher pins ${PIN}`
      : `${catalog.WIKI.name} ${t.version} (not a version this launcher compares); this launcher pins ${PIN}` });
  } else if (stand === 'behind') {
    // uv's own copy (in uv's folder, and uv lists it) is brought up by setup. One in uv's folder where uv is missing:
    // uv first (setup then brings it up if uv lists it). Any other is the person's to bring up (pipx, pip --user).
    const route = !t.uvs && t.inUvDir && !uv(home) ? uvRoute() : null;
    // The upgrade's `list` runs obsidian-wiki's version refresh, which would replace a clashing skill: no repair then.
    const blocked = t.uvs && clashed.length;
    add({
      id: 'memory.wiki', state: 'warn', detail: `${catalog.WIKI.name} ${t.version}; this launcher pins ${PIN}`,
      fix: blocked ? clashNote(clashed) : t.uvs ? `${NPX} setup` : route ? `${route.step}, then ${NPX} setup` : `bring it to ${PIN} with the tool that installed it (uv does not list it)`,
      gate: t.uvs && !blocked ? null : route ? route.gate : 'consent',
      repair: t.uvs && !blocked ? { kind: 'tool', product: 'wiki' } : null,
    });
  } else {
    add({ id: 'memory.wiki', state: 'ok', detail: t.version === PIN ? `${catalog.WIKI.name} ${t.version} (pinned by this launcher)` : `${catalog.WIKI.name} ${t.version}, ahead of this launcher's pin ${PIN}; never taken back` });
  }
  if (t.uvCopy) {
    add({ id: 'memory.wiki.shadow', state: 'warn', detail: `${t.bin} is found on PATH before uv's copy in ${path.dirname(t.uvCopy)}, so agents run that one`, fix: 'remove it with the tool that installed it (pip uninstall obsidian-wiki, or pipx uninstall obsidian-wiki)', gate: 'consent' }); // not the launcher's copy
  }
  if (!t.onPath) {
    add({ id: 'memory.wiki.path', state: 'warn', detail: `${catalog.WIKI.name} is in ${path.dirname(t.bin)}, which is not on your PATH, so agents and its hooks cannot run it by name`, fix: 'uv tool update-shell, then open a new terminal' });
  }

  const config = configOf(home);
  let configured = null; // the vault obsidian-wiki is set up with, as its doctor (else its config) says
  try { configured = (/OBSIDIAN_VAULT_PATH="?([^"\n]*)"?/.exec(fs.readFileSync(config, 'utf8')) || [])[1] || null; } catch (_) { configured = null; }
  let broken = null;
  if (config) { try { fs.statSync(config); } catch (error) { broken = error.code || error.message; } }
  if (!config) {
    add({ id: 'memory.vault', state: 'info', detail: 'no wiki vault yet (obsidian-wiki has no config)', fix: `${NPX} setup --with wiki` });
  } else if (broken) {
    // A config that is a link to nothing is still a config: setup makes no vault over it and removes nothing.
    add({ id: 'memory.vault', state: 'warn', detail: `obsidian-wiki's config ${config} cannot be read (${broken}); setup makes no vault while it is there`, fix: `repair or remove ${config}, then ${NPX} setup --with wiki` });
  } else {
    const r = releases.run(t.bin, ['doctor', '--json'], { timeout: 60000, input: '' });
    let rep = null;
    try { rep = JSON.parse(r.out); } catch (_) { rep = null; }
    if (!rep || !Array.isArray(rep.checks)) {
      add({ id: 'memory.vault', state: 'warn', detail: `wiki vault: obsidian-wiki doctor could not be read (${(r.err || r.out || `exit ${r.code}`).trim().split('\n')[0]})`, fix: `run: obsidian-wiki doctor --json (it answered no report); repair through ${NPX} setup --with wiki where it offers one; its session-hooks line asking for a hooks install is expected, since the launcher registers only SessionStart; ${NEVER}` });
    } else {
      const bad = rep.checks.filter((c) => c && (c.status === 'fail' || c.status === 'warn'));
      const state = bad.some((c) => c.status === 'fail') ? 'fail' : bad.length ? 'warn' : 'ok';
      const vc = rep.checks.find((c) => c && c.name === 'vault-config' && c.status === 'pass');
      const where = vc && vc.detail ? vc.detail : config;
      if (vc && vc.detail) configured = vc.detail;
      // Never obsidian-wiki's own hint (round 4); the refresh step waits for a clash to be moved (round 6).
      const hints = [...new Set(bad.map((c) => { const f = fixFor(c, NPX); return f === REFRESH && clashed.length ? `first move or rename the skills memory.wiki.clash names; then ${REFRESH}` : f; }))];
      add({
        id: 'memory.vault', state,
        detail: `wiki vault ${where}: ${state === 'ok' ? 'obsidian-wiki doctor passes' : bad.map((c) => `${c.name} ${c.status} (${c.detail})`).join('; ')}`,
        fix: state === 'ok' ? null : hints.join('; '),
        // setup repairs none of this: the session-start line sends the person to doctor (doctor.json `manual`).
        ...(state === 'fail' ? { manual: true } : {}),
      });
    }
  }

  // The hooks of a set-up wiki where Claude Code is installed: a tool with no vault yet has nothing to recap.
  if (claude && claude.here && config && !broken) {
    const h = hookState(t.bin);
    const same = path.resolve(claude.settings) === path.resolve(hooksFile(home));
    const linked = settingsLink(home);
    if (h.error) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's hooks could not be read (${h.error})`, fix: `run: obsidian-wiki hooks status --json (it exits 1 while the Stop hook is not registered, which is expected: the launcher never registers it); ${NEVER}` });
    else {
      if (!same) {
        // CLAUDE_CONFIG_DIR: obsidian-wiki writes only the literal ~/.claude/settings.json, which this Claude Code does not read.
        add({ id: 'memory.hooks', state: 'info', detail: (h.start
          ? `obsidian-wiki's SessionStart hook is registered where this Claude Code does not read it: obsidian-wiki writes its hooks only to ${hooksFile(home)}; this Claude Code reads ${claude.settings}`
          : `obsidian-wiki writes its hooks only to ${hooksFile(home)}; this Claude Code reads ${claude.settings}, so it starts sessions without a recap of the wiki`)
          + `; obsidian-wiki's skills are likewise only in ${path.join(home, '.claude', 'skills')}` });
      } else if (!h.start) {
        // A repair only for the vault this launcher made, while the config still names it; any other vault's hooks are
        // the person's choice (some remove them on purpose).
        const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
        const ours = !!launcherVault && !!configured && real(launcherVault) === real(configured);
        // A settings file that is a link: obsidian-wiki's writer would replace the link with a plain file (os.replace), so
        // the launcher adds the entry where the link points (round 5, S1); for another vault the person does it by hand.
        // obsidian-wiki's own writer drops the file's permission bits and replaces a link (round 6, S2): never handed out.
        const where = linked || hooksFile(home);
        const fix = ours ? `${NPX} setup (the launcher adds the entry to ${where}${linked ? `, where the link ${hooksFile(home)} points, keeping the link` : ''})`
          : `add obsidian-wiki's SessionStart entry (its command for ${HOOK_SCRIPTS.SessionStart}) to ${where} by hand, keeping the file's permissions; never \`obsidian-wiki hooks install\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER}`;
        add({ id: 'memory.hooks', state: 'info', detail: `Claude Code starts a session without a recap of the wiki (obsidian-wiki's SessionStart hook is not registered)`, fix,
          repair: ours ? { kind: 'hook', product: 'wiki' } : null, gate: ours ? null : 'consent' });
      } else if (!h.reachable) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's SessionStart hook is registered but cannot reach the package, so it ends silently`, fix: fixFor({ name: 'session-hooks', status: 'warn', hint: h.hint, detail: 'registered, but it cannot reach the package' }, NPX) });
      else add({ id: 'memory.hooks', state: 'ok', detail: `Claude Code starts each session with a recap of the wiki (obsidian-wiki's SessionStart hook)` });
      // The Stop hook is never the launcher's: named as information, with its effect, for the person to keep or remove.
      if (h.stop) {
        add({ id: 'memory.hooks.stop', state: 'info', detail: `obsidian-wiki's Stop hook is registered: after every turn of every Claude Code session, in every project, it asks the agent to write into the wiki; the launcher never registers it`,
          fix: `remove obsidian-wiki's Stop entry (its command for ${HOOK_SCRIPTS.Stop}) from ${linked || hooksFile(home)} by hand, keeping the file's permissions; never \`obsidian-wiki hooks uninstall\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER}`, gate: 'consent' });
      }
    }
  }
  return rows;
}

/**
 * What setup would do for the memory: { tool, vault } (whether each is still to do) and why it cannot now: `note`
 * (uv missing, git missing, a folder that holds files), `problem` for the folder alone.
 */
function needs(home, vault, platform = process.platform) {
  const t = tool(home);
  const config = configOf(home);
  const need = { tool: !t, vault: !config, problem: config ? null : vaultProblem(vault), note: null };
  if (need.tool && !uv(home)) need.note = uvRoute().note;
  else if (need.vault && !need.problem) {
    // obsidian-wiki setup replaces a same-named skill in every agent's global folder (round 6, S1): never run over one.
    need.clashes = clashes(home, t ? t.bin : null);
    need.note = need.clashes.length ? clashNote(need.clashes) : gitNote(platform);
  }
  return need;
}

/**
 * Install obsidian-wiki at the pin when it is absent and, when this user has no config, make the vault: the folder,
 * `git init -b main` in it unless it is a repository, `obsidian-wiki setup --no-hooks --vault <dir>` with no terminal,
 * then (where Claude Code is installed and reads ~/.claude/settings.json) `obsidian-wiki hooks install --only
 * SessionStart`. `made(vault)` is told once the vault stands. Returns what it did; throws on the first step that fails.
 * A failed vault step leaves nothing the launcher made: a folder it made is removed, a folder that was there is left as it
 * was (it held nothing), and a config the failed step wrote is removed, so the next run starts again.
 */
function install({ home, vault, claude, made = () => {}, report = () => {} }) {
  const done = [];
  let t = tool(home);
  if (!t) {
    const u = uv(home);
    if (!u) throw new Error(`uv is not installed (${UV_PAGE}); nothing was installed`);
    const r = releases.run(u, ['tool', 'install', `obsidian-wiki==${PIN}`], { timeout: 10 * 60 * 1000, input: '' });
    if (r.code !== 0) throw new Error(`uv tool install obsidian-wiki==${PIN}: ${lastLine(r)}`);
    t = tool(home);
    if (!t || t.version !== PIN) throw new Error(`uv installed obsidian-wiki, but ${t ? `it reads ${t.version || 'no version'}` : 'it does not answer'}`);
    report(`installed ${catalog.WIKI.name} ${PIN} with uv`);
    done.push(`installed ${catalog.WIKI.name} ${PIN}`);
  }
  if (!configOf(home)) {
    const clashed = clashes(home, t.bin);
    if (clashed.length) throw new Error(`${clashNote(clashed)}; no vault was made`);
    const problem = vaultProblem(vault);
    if (problem) throw new Error(`${vault} ${problem}; no vault was made (choose another folder with --wiki-vault <dir>)`);
    const existed = fs.existsSync(vault);
    const before = existed ? fs.readdirSync(vault) : [];
    // obsidian-wiki setup writes its config and WRITING.md (its writing profile) in its config folder: what was there
    // before the step stays; what the failed step added there goes, and the folder too when the step made it (R5).
    const cdir = configDir(home);
    const cdirExisted = fs.existsSync(cdir);
    const cdirBefore = cdirExisted ? fs.readdirSync(cdir) : [];
    fs.mkdirSync(vault, { recursive: true });
    // Returns what could not be removed, or null.
    const undo = () => {
      let left = null;
      try {
        if (!existed) fs.rmSync(vault, { recursive: true, force: true });
        else for (const n of fs.readdirSync(vault)) if (!before.includes(n)) fs.rmSync(path.join(vault, n), { recursive: true, force: true });
      } catch (error) { left = `removing ${vault} failed (${error.code || error.message}): remove it, then run setup again`; }
      const added = !fs.existsSync(cdir) ? [] : !cdirExisted ? [cdir] : fs.readdirSync(cdir).filter((n) => !cdirBefore.includes(n)).map((n) => path.join(cdir, n));
      for (const f of added) {
        try { fs.rmSync(f, { recursive: true, force: true }); } catch (error) { left = left || `removing ${f} failed (${error.code || error.message}): remove it, then run setup again`; }
      }
      return left;
    };
    const fail = (message) => { const left = undo(); throw new Error(left ? `${message}; ${left}` : `${message}; nothing of the vault step was kept`); };
    if (!fs.existsSync(path.join(vault, '.git'))) {
      const g = releases.run('git', ['init', '-b', 'main', vault], { timeout: 60000, input: '' });
      if (g.code !== 0) fail(`git init -b main ${vault}: ${(g.err || g.out || `exit ${g.code}`).trim().split('\n')[0]}`);
    }
    const s = releases.run(t.bin, ['setup', '--no-hooks', '--vault', vault], { timeout: 5 * 60 * 1000, input: '' });
    if (s.code !== 0) fail(`obsidian-wiki setup --no-hooks --vault ${vault}: ${lastLine(s)}`);
    if (!configOf(home)) fail(`obsidian-wiki setup --no-hooks --vault ${vault} wrote no config`);
    report(`made the wiki vault ${vault} (a Git repository) with obsidian-wiki setup --no-hooks`);
    done.push(`made the wiki vault ${vault}`);
    made(vault);
    if (claude && claude.here && path.resolve(claude.settings) === path.resolve(hooksFile(home))) {
      hook({ home, bin: t.bin });
      done.push('registered its SessionStart recap for Claude Code');
    }
  }
  return done.join(', ');
}

/**
 * Register obsidian-wiki's SessionStart recap for Claude Code: `obsidian-wiki hooks install --only SessionStart`. When
 * ~/.claude/settings.json is a link, obsidian-wiki's writer would replace it with a plain file (os.replace): the entry
 * is then written by obsidian-wiki into a settings file of a throwaway home (so it is exactly the entry it writes),
 * and the launcher adds that entry where the link points, keeping the link and the file's permission bits.
 */
function hook({ home, bin = null }) {
  const b = bin || (tool(home) || {}).bin;
  if (!b) throw new Error('obsidian-wiki is not installed');
  const linked = settingsLink(home);
  const file = hooksFile(home);
  const { doc, error } = permissions.load(file);
  if (error) throw new Error(error);
  // The shapes obsidian-wiki's entry goes into, checked before anything runs (round 6, R4): the file stays as it is.
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  if ('hooks' in doc && !isObject(doc.hooks)) throw new Error(`${file}: "hooks" is not an object; nothing was changed`);
  const start = doc.hooks && doc.hooks.SessionStart;
  if (start !== undefined && (!Array.isArray(start) || start.some((g) => !isObject(g) || ('hooks' in g && !Array.isArray(g.hooks))))) {
    throw new Error(`${file}: "hooks.SessionStart" is not a list of groups, each with a "hooks" list; nothing was changed`);
  }
  const has = (d) => (((d.hooks || {}).SessionStart) || []).some((g) => ((g && g.hooks) || []).some((e) => String((e && e.command) || '').includes(HOOK_SCRIPTS.SessionStart)));
  if (has(doc)) return `obsidian-wiki's SessionStart recap is registered already in ${linked || file}`;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-hook-'));
  try {
    const h = releases.run(b, ['hooks', 'install', '--only', 'SessionStart'], { timeout: 60000, input: '', env: { ...process.env, HOME: scratch, USERPROFILE: scratch } });
    if (h.code !== 0) throw new Error(`obsidian-wiki hooks install --only SessionStart: ${lastLine(h)}`);
    let made;
    try { made = JSON.parse(fs.readFileSync(hooksFile(scratch), 'utf8')); } catch (e) { throw new Error(`obsidian-wiki hooks install --only SessionStart wrote no settings the launcher could read (${e.code || e.name})`); }
    const groups = (Array.isArray(((made || {}).hooks || {}).SessionStart) ? made.hooks.SessionStart : []).filter((g) => has({ hooks: { SessionStart: [g] } }));
    if (!groups.length) throw new Error('obsidian-wiki hooks install --only SessionStart wrote no SessionStart entry');
    doc.hooks = doc.hooks || {};
    doc.hooks.SessionStart = [...(doc.hooks.SessionStart || []), ...groups];
    permissions.write(file, doc); // follows a link, keeps the permission bits, makes a new file private
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  return linked ? `registered obsidian-wiki's SessionStart recap for Claude Code in ${linked}, where the link ${file} points (the link stays)`
    : `registered obsidian-wiki's SessionStart recap for Claude Code`;
}

/**
 * Bring obsidian-wiki up to the pin: `uv tool install --force obsidian-wiki==<pin>`, then the stale refresh (`obsidian-wiki
 * list`), which records the new version where setup did, keeping every other key of the config; the vault is not touched.
 */
function upgrade({ home, NPX = 'npx @passioncode-ai/passioncode@latest' }) {
  const u = uv(home);
  if (!u) throw new Error(`uv is not installed (${UV_PAGE})`);
  const before = tool(home);
  // obsidian-wiki's version refresh (run by `list` below) would replace a clashing skill (round 6, S1).
  const clashed = configOf(home) ? clashes(home, before ? before.bin : null) : [];
  if (clashed.length) throw new Error(`${clashNote(clashed)}; nothing was upgraded`);
  // What uv recorded for this tool (extras, --with requirements) goes into the reinstall too (round 6, R1).
  const spec = receiptSpec(u);
  const args = ['tool', 'install', '--force', spec.requirement, ...spec.with.flatMap((w) => ['--with', w])];
  const r = releases.run(u, args, { timeout: 10 * 60 * 1000, input: '' });
  if (r.code !== 0) throw new Error(`uv ${args.join(' ')}: ${lastLine(r)}`);
  const after = tool(home);
  if (!after || after.version !== PIN) throw new Error(`uv installed obsidian-wiki ${PIN}, but it reads ${after ? after.version || 'no version' : 'nothing'}`);
  if (configOf(home)) {
    // Its update check off: the run reaches no network for a notice nobody reads (OBSIDIAN_WIKI_NO_UPDATE_CHECK).
    const l = releases.run(after.bin, ['list'], { timeout: 120000, input: '', env: { ...process.env, OBSIDIAN_WIKI_NO_UPDATE_CHECK: '1' } });
    if (l.code !== 0) throw new Error(`obsidian-wiki list (it records the new version): ${lastLine(l)}`);
    // The version the config records decides (round 6, R3): a refresh that could not run leaves the old one, and
    // obsidian-wiki then asks for setup, which is never followed. Its missing-skills line is no failure.
    let recorded = null;
    try { recorded = (/OBSIDIAN_WIKI_VERSION="?([^"\n]*)"?/.exec(fs.readFileSync(configOf(home), 'utf8')) || [])[1] || null; } catch (_) { recorded = null; }
    if (recorded && recorded !== PIN) {
      throw new Error(`obsidian-wiki list did not record ${PIN} (it asks for obsidian-wiki setup); read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; ${NEVER}`);
    }
  }
  return before && versionAgainstPin(before.version) === 'behind'
    ? `brought ${catalog.WIKI.name} ${before.version} up to ${PIN}; the vault is as it was, and the config's other keys too`
    : `installed ${catalog.WIKI.name} ${PIN} with uv tool install --force; the vault is as it was, and the config's other keys too`;
}

/**
 * The requirement and `--with` list uv recorded for obsidian-wiki (its tool folder's uv-receipt.toml), so a reinstall at
 * the pin keeps a person's extras and added requirements; no receipt: the plain pin. A requirement given as a URL, a
 * path, a Git source or editable cannot be carried by name: the upgrade stops and names it.
 */
function receiptSpec(u) {
  const plain = { requirement: `obsidian-wiki==${PIN}`, with: [] };
  const dir = (releases.run(u, ['tool', 'dir'], { timeout: 15000, input: '' }).out || '').trim();
  if (!dir) return plain;
  let text;
  try { text = fs.readFileSync(path.join(dir, 'obsidian-wiki', 'uv-receipt.toml'), 'utf8'); } catch (_) { return plain; }
  const block = (/requirements\s*=\s*\[([\s\S]*?)\n\s*\]/.exec(text) || [])[1] || '';
  const out = { requirement: plain.requirement, with: [] };
  for (const [, body] of block.matchAll(/\{([^}]*)\}/g)) {
    const field = (k) => (new RegExp(`(?:^|,)\\s*${k}\\s*=\\s*"([^"]*)"`).exec(body) || [])[1];
    const name = field('name');
    if (!name) continue;
    const extras = ((/extras\s*=\s*\[([^\]]*)\]/.exec(body) || [])[1] || '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    const keys = [...body.replace(/"[^"]*"/g, '""').matchAll(/([A-Za-z-]+)\s*=/g)].map((m) => m[1]);
    const other = keys.filter((k) => !['name', 'extras', 'specifier', 'marker'].includes(k));
    if (other.length) throw new Error(`uv's record for obsidian-wiki has ${name} as ${other.join(', ')}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself)`);
    const marker = field('marker');
    const req = `${name}${extras.length ? `[${extras.join(',')}]` : ''}`;
    if (name === 'obsidian-wiki') out.requirement = `${req}==${PIN}${marker ? ` ; ${marker}` : ''}`;
    else out.with.push(`${req}${field('specifier') || ''}${marker ? ` ; ${marker}` : ''}`);
  }
  return out;
}

/** Whether anything of the wiki memory is on this machine: obsidian-wiki answers, or an Obsidian.app is there (uninstall's line). */
function present(home) {
  const ob = catalog.OBSIDIAN;
  return { wiki: !!tool(home), obsidian: [catalog.appPath(ob, { home }), catalog.adminCopy(ob, { home })].some((p) => !!p && fs.existsSync(p)) };
}

module.exports = { PIN, UV_PAGE, REFRESH, NEVER, HOOK_SCRIPTS, settingsLink, present, clashes, bundledSkills, skillFolders, receiptSpec, ALLOWED, toolBinDir, configDir, configFiles, configOf, onPath, tool, uv, uvRoute, gitNote, defaultVault, vaultProblem, fixFor, versionAgainstPin, hookState, hooksFile, checks, needs, install, hook, upgrade };
