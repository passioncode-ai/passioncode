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
 * its stale check, which records the installed version and package path and refreshes the skills it linked, keeping
 * every other key beside the version and package path of the config (obsidian-wiki 2026.11.4, `_check_stale`). `list` is the one that does nothing else.
 */
const NEVER = "never `obsidian-wiki setup`, a bare `obsidian-wiki hooks install`, or obsidian-wiki's wiki-setup skill";
/** What obsidian-wiki's refresh may change in a config the launcher otherwise leaves as it is (round 18, 3; ADR-0006 decision 16). */
const KEPT_APART = "the version and package path obsidian-wiki's refresh records, and, with the same meaning, quotes around a bare value or an empty vault line where there was none";
const REFRESH = `run: obsidian-wiki list (an ordinary command: it records the installed version and package path and refreshes the skills, keeping every other key of the config); ${NEVER}`;

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
  const xdgDir = path.join(xdg ? path.resolve(home, expandHome(xdg, home)) : path.join(home, '.config'), 'obsidian-wiki');
  const legacy = path.join(home, '.obsidian-wiki');
  let legacyDir = false;
  try { legacyDir = fs.statSync(legacy).isDirectory(); } catch (_) { legacyDir = false; }
  // Path.exists() follows a link, so an XDG folder that is a link to nothing does not exist (round 5, U1).
  return legacyDir && !fs.existsSync(xdgDir) ? legacy : xdgDir;
}
/**
 * Why the vault step cannot run here, or null: an XDG_CONFIG_HOME that is not absolute (after `~`), which obsidian-wiki
 * reads from the folder it runs in, so the config it would write is not the one the launcher reads (round 8, R5).
 */
function xdgProblem() {
  const v = (process.env.XDG_CONFIG_HOME || '').trim();
  if (!v || path.isAbsolute(v)) return null;
  // A leading ~: obsidian-wiki's commands expand it, its SessionStart recap reads it as written, a relative folder (round 21, 12).
  if (v.startsWith('~')) return `XDG_CONFIG_HOME starts with ~ (${v}), which obsidian-wiki's SessionStart recap reads as a relative folder while its commands read your home; set it to an absolute folder, or unset it, then run setup again`;
  return `XDG_CONFIG_HOME is a relative path (${v}), which obsidian-wiki reads from the folder it runs in; set it to an absolute folder, or unset it, then run setup again`;
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
function versionOf(bin, home) {
  const r = releases.run(bin, ['--version'], { timeout: 20000, input: '', env: wenv(home) });
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
    // Exactly obsidian-wiki (round 13, R2: `\b` matched obsidian-wiki-mcp).
    if (listed === undefined) { const u = uv(home); listed = !!u && /^obsidian-wiki\s/m.test(releases.run(u, ['tool', 'list'], { timeout: 30000, input: '' }).out || ''); }
    return listed;
  };
  const inDir = (bin) => path.dirname(bin) === uvDir;
  // And, where uv's record names the command it installed, that command (round 13, R2).
  const inUv = (bin) => inDir(bin) && uvLists() && receiptBinIs(home, bin);
  const first = onPath('obsidian-wiki')[0];
  let active = null;
  if (first) {
    const version = versionOf(first, home);
    if (version !== undefined) active = { bin: first, version, onPath: true };
  }
  const uvBin = path.join(uvDir, exe('obsidian-wiki'));
  const uvVersion = fs.existsSync(uvBin) && (!active || active.bin !== uvBin) ? versionOf(uvBin, home) : undefined;
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

// A hidden folder at the home's root (the operator, 2026-11-12: «в документы не кладем ничего, у нас папка DATA»; «для лайнчера
// надо папка в root какая-то может даже скрытая»): never ~/Documents, which iCloud may sync (Git in a synced folder breaks), and
// outside ~/.passioncode, so uninstall never reaches it.
const defaultVault = (home) => path.join(home, '.wiki');

/**
 * The characters obsidian-wiki's config cannot hold in a value (round 17, 1): it writes a value between double quotes on
 * one line and reads its lines with Python's splitlines(), which breaks at \n, \r, \v, \f, \x1c-\x1e, \x85, U+2028 and
 * U+2029. So any C0 control but tab, \x85, U+2028 and U+2029 (CONFIG_BREAKS, which a whole config is held to as well),
 * and in a value the double quote too. The vault path and configForm both read this one rule.
 */
const CONFIG_BREAKS = /[\x00-\x08\x0a-\x1f\x85\u2028\u2029]/;
const cannotHold = (value) => String(value).includes('"') || CONFIG_BREAKS.test(String(value));
const CHARS_PROBLEM = 'has a double quote, a line break or a control character in its path';
// obsidian-wiki's recap reads a value with one apostrophe at either end stripped (read_var), so it would read another folder.
const APOS_PROBLEM = "starts or ends with an apostrophe, which obsidian-wiki's recap strips";
/** ~ at the start of a value as the home: followed by / (and on Windows by \\ too), or alone (round 19, R5). */
const expandHome = (v, home, platform = process.platform) => String(v).replace(platform === 'win32' ? /^~(?=$|[\\/])/ : /^~(?=$|\/)/, home);
/** Why `dir` cannot become a new vault, or null: something other than a folder is there, or a folder that holds anything. */
function vaultProblem(dir) {
  if (cannotHold(dir)) return CHARS_PROBLEM; // obsidian-wiki writes the path into its config (round 16, R8; round 17, 1)
  if (/^'|'$/.test(dir)) return APOS_PROBLEM; // round 19, R7

  let st;
  try { st = fs.statSync(dir); } catch (_) { return null; }
  if (!st.isDirectory()) return 'is not a folder';
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n !== '.DS_Store'); } catch (error) { return `cannot be read (${error.code || error.message})`; }
  return names.length ? 'already holds files' : null;
}
/** The sentence setup prints for a folder vaultProblem refuses, with the one step that clears it (round 17, 1). */
const vaultNote = (dir, problem) => `${dir} ${problem}; ${problem === CHARS_PROBLEM || problem === APOS_PROBLEM ? 'choose another folder' : 'choose an empty or new folder'} with --wiki-vault <dir>`;

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
  return `obsidian-wiki reports ${name} ${check.status || 'warn'}: ${detail}; ${READ_DOCTOR}; ${NEVER}`;
}
const READ_DOCTOR = "read `obsidian-wiki doctor --json` (its session-hooks hint asking for a bare hooks install is expected: the launcher registers only SessionStart)";
/** Several hints, with the shared step to read obsidian-wiki's doctor named once, at the end (round 13, R5). */
const joinHints = (hints) => {
  const shared = hints.some((h) => h.includes(`; ${READ_DOCTOR}`));
  const parts = hints.map((h) => h.split(`; ${READ_DOCTOR}`).join(''));
  return `${parts.join('; ')}${shared ? `; ${READ_DOCTOR}` : ''}`;
};

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
function bundledSkills(bin, home) {
  if (bin) {
    const r = releases.run(bin, ['hooks', 'status', '--json'], { timeout: 30000, input: '', env: wenv(home) });
    try {
      const at = (JSON.parse(r.out).hooks || []).map((h) => h && h.bundled).find(Boolean);
      const dir = at ? path.join(path.dirname(path.dirname(at)), 'skills') : null;
      if (dir) return { dir, names: fs.readdirSync(dir).filter((n) => { try { return fs.statSync(path.join(dir, n)).isDirectory(); } catch (_) { return false; } }) };
    } catch (_) { /* below */ }
  }
  return { dir: null, names: catalog.WIKI.skills };
}

/** obsidian-wiki's global skills folders (cli.py GLOBAL_AGENT_DIRS), with the Hermes profiles its setup also fills. */
/**
 * lstat, or null where nothing is: absent, or a file where a folder of the path would be (ENOTDIR, round 9, S1). Any
 * other error (a looped link, ELOOP; a folder it may not read, EACCES) is `{ unreadable: <code> }`, never a throw
 * (round 11, S1): the caller counts it as a clash, since obsidian-wiki's setup would meet it too.
 */
function lstatOrNull(p) {
  try { return fs.lstatSync(p); } catch (error) { if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null; return { unreadable: error.code || error.message }; }
}
/** How an entry that could not be read is named in a clash list. */
const unreadable = (at, code) => `${at} could not be read (${code})`;
const UNREADABLE = / could not be read \([^)]*\)$/;

function skillFolders(home) {
  const dirs = catalog.WIKI.skillDirs.map((rel) => path.join(home, rel));
  if (process.env.HERMES_HOME) dirs.push(path.join(expandHome(process.env.HERMES_HOME, home), 'skills'));
  // Only folders, as obsidian-wiki does (cli.py: `p.is_dir()`, which follows a link; round 11, U1): a .DS_Store there is
  // no profile (round 9, S1), a link to a folder is one, a link to nothing is skipped as Python skips it.
  const profiles = path.join(home, '.hermes', 'profiles');
  const isDir = (at) => { try { return fs.statSync(at).isDirectory(); } catch (_) { return false; } };
  try {
    for (const p of fs.readdirSync(profiles, { withFileTypes: true })) {
      if (p.isDirectory() || (p.isSymbolicLink() && isDir(path.join(profiles, p.name)))) dirs.push(path.join(profiles, p.name, 'skills'));
    }
  } catch (_) { /* none, or one clashes() names as unreadable */ }
  return [...new Set(dirs.map((d) => path.resolve(d)))];
}
/** The Hermes profiles folder when it is there and cannot be listed (round 11, S1): obsidian-wiki's setup would stop on it. */
function profilesUnreadable(home) {
  try { fs.readdirSync(path.join(home, '.hermes', 'profiles')); return null; } catch (error) {
    return error.code === 'ENOENT' || error.code === 'ENOTDIR' ? null : unreadable(path.join(home, '.hermes', 'profiles'), error.code || error.message);
  }
}

/**
 * The entries obsidian-wiki's setup or its version refresh would delete or replace (round 6, S1): in each of its global
 * skills folders, an entry with a bundled skill's name that is not obsidian-wiki's own: a link or a file (it unlinks
 * them), a folder holding SKILL.md (it removes it with everything in it). Only a link into its package is its own
 * (a copy mode install, as on Windows without link rights, reads as a clash: the safe side). A folder without SKILL.md
 * it skips, so that is no clash.
 */
function clashes(home, bin) {
  const { dir, names: bundled } = bundledSkills(bin, home);
  // The installed package's names and the pin's (round 7, R1): an older obsidian-wiki may lack one the upgrade brings.
  const names = [...new Set([...bundled, ...catalog.WIKI.skills])];
  const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return null; } };
  const own = (n) => (dir ? real(path.join(dir, n)) : null);
  const found = [];
  const listing = profilesUnreadable(home);
  if (listing) found.push(listing);
  for (const folder of skillFolders(home)) {
    for (const n of names) {
      const at = path.join(folder, n);
      const st = lstatOrNull(at);
      if (!st) continue;
      if (st.unreadable) { if (!found.includes(unreadable(path.dirname(at), st.unreadable))) found.push(unreadable(path.dirname(at), st.unreadable)); continue; }
      if (st.isSymbolicLink()) {
        const to = real(at);
        const pkg = /[\\/]obsidian_wiki[\\/]_data[\\/]skills[\\/][^\\/]+$/;
        // A link to nothing whose text points into an obsidian_wiki package (a removed or moved install) is its own too
        // (round 8, R3): its setup replaces a link, and this one holds nothing of the person's.
        const text = () => { try { return path.resolve(path.dirname(at), fs.readlinkSync(at)); } catch (_) { return ''; } };
        const ours = to ? (own(n) ? to === own(n) : pkg.test(to)) : pkg.test(text());
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
// A folder that could not be read is named on its own, never as a skill of the person's to move (round 12, P1).
const clashNote = (all) => {
  const list = all.filter((e) => !UNREADABLE.test(e));
  const bad = all.filter((e) => UNREADABLE.test(e));
  const parts = [];
  if (list.length) parts.push(`obsidian-wiki's setup and its version refresh would replace ${list.length === 1 ? 'a skill of yours that shares a name with one of its own' : `${list.length} skills of yours that share a name with its own`} (${capped(list)}); move or rename ${list.length === 1 ? 'it' : 'them'}`);
  if (bad.length) parts.push(`${capped(bad)}: repair the link or the permissions`);
  return `${parts.join('; ')}, then run setup again`;
};
/** doctor's memory.wiki.clash row: the skills to move and the folders to repair, each in its own words (round 12, P1). */
const clashRow = (all, then) => {
  const list = all.filter((e) => !UNREADABLE.test(e));
  const bad = all.filter((e) => UNREADABLE.test(e));
  const detail = [
    ...(list.length ? [`${list.length === 1 ? 'a skill of yours shares a name' : `${list.length} skills of yours share a name`} with one of obsidian-wiki's, which its setup and its version refresh would replace: ${capped(list)}`] : []),
    ...(bad.length ? [`${capped(bad)}, where obsidian-wiki's setup links its skills`] : []),
  ].join('; ');
  const fix = [...(list.length ? [`move or rename ${list.length === 1 ? 'it' : 'them'}`] : []), ...(bad.length ? ['repair the link or the permissions'] : [])].join(' and ');
  // The detail names the first five and how many more; `entries` keeps every one for a reader of doctor --json (round 14, C5).
  return { id: 'memory.wiki.clash', state: 'warn', detail, fix: `${fix}, then ${then}`, gate: 'consent', entries: all.map(clashEntry) };
};

/** `obsidian-wiki hooks status --json`: { start, stop, reachable, hint } or { error }. */
function hookState(bin, home) {
  const r = releases.run(bin, ['hooks', 'status', '--json'], { timeout: 30000, input: '', env: wenv(home) });
  let doc;
  try { doc = JSON.parse(r.out); } catch (_) { return { error: (r.err || r.out || `exit ${r.code}`).trim().split('\n')[0] }; }
  const hooks = Array.isArray(doc.hooks) ? doc.hooks : [];
  const on = (event) => hooks.some((h) => h && h.event === event && h.registered === true);
  const reach = doc.reachability || {};
  return { start: on('SessionStart'), stop: on('Stop'), reachable: reach.reachable !== false, hint: reach.hint || null };
}

/** The only Claude Code settings file obsidian-wiki writes its hooks to: the literal ~/.claude/settings.json. */
const hooksFile = (home) => path.join(home, '.claude', 'settings.json');
/** The path of the SessionStart script a registered command runs when that file is not there, else null (round 8, R3). */
function missingScript(home) {
  // Decided only on a POSIX system and for an absolute path with no `~` or `$` (round 9, U2): on Windows obsidian-wiki
  // writes a Git Bash path (/c/Users/...), and a shell expansion is the shell's to resolve. Otherwise: not decided.
  if ((process.env.PASSIONCODE_PLATFORM || process.platform) === 'win32') return null;
  let doc;
  try { doc = JSON.parse(fs.readFileSync(hooksFile(home), 'utf8')); } catch (_) { return null; }
  const start = doc && doc.hooks && Array.isArray(doc.hooks.SessionStart) ? doc.hooks.SessionStart : [];
  for (const g of start) for (const e of (g && Array.isArray(g.hooks) ? g.hooks : [])) {
    if (!isHookEntry(e, HOOK_SCRIPTS.SessionStart)) continue; // round 13, R6
    const m = /"([^"]*wiki-session-recap\.sh)"|(\S*wiki-session-recap\.sh)/.exec(String((e && e.command) || ''));
    const at = m && (m[1] || m[2]);
    if (at && path.posix.isAbsolute(at) && !/[~$]/.test(at) && !fs.existsSync(at)) return at;
  }
  return null;
}
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
/** What an older ~/.obsidian-wiki does, and the person's step: the one text doctor and setup print (round 20, 1). */
// The older folder goes; the config the commands read stays: moving the old files in would overwrite it (the same names:
// config, WRITING.md, update-check.json) and switch the vault, so only files the XDG folder lacks are copied (round 22, 1).
// Copy first, then remove (round 23, 1); "which stays" only where the XDG config is a readable file.
const legacyWhy = (home, legacy) => {
  const xdg = configDir(home);
  const cfg = path.join(xdg, 'config');
  let readable = false;
  try { readable = fs.statSync(cfg).isFile(); fs.accessSync(cfg, fs.constants.R_OK); } catch (_) { readable = false; }
  return { kind: 'legacy', why: `obsidian-wiki's SessionStart recap reads ${legacy} while its commands read ${xdg}, so it would recap another vault`,
    step: `copy into ${xdg} the files of ${legacy} it lacks (never ${path.join(legacy, 'config')} over ${cfg}), then remove ${legacy}${readable ? `; obsidian-wiki's commands read ${cfg}, which stays` : ''}` };
};
/**
 * Why obsidian-wiki's config names no vault the launcher can use, and the person's step, or null (round 20, 1): the one
 * explanation setup's Obsidian step prints and a doctor row carries in every branch. { kind, why, step, form? }: a relative
 * XDG_CONFIG_HOME, an older ~/.obsidian-wiki, a config that is a link to nothing, a folder or a file that cannot be read,
 * a line memory.vault.config-form names, or an empty or missing vault line. Null with no config (nothing to explain).
 */
/**
 * The vault obsidian-wiki 2026.11.4's SessionStart recap reads (wiki-session-recap.sh), or null (round 23, 2): find_vault
 * takes ~/.obsidian-wiki when it is a folder, else ${XDG_CONFIG_HOME:-$HOME/.config}/obsidian-wiki as written (no ~);
 * read_var takes the LAST line matching ^[[:space:]]*OBSIDIAN_VAULT_PATH=, strips one " then one ' at each end, and a
 * leading ~ becomes $HOME. Null when the file is not a readable regular file or the value is empty. (The recap first walks
 * up from the session's folder for a .env naming the vault; that is the session's, not the launcher's.)
 */
function recapVault(home) {
  const legacy = path.join(home, '.obsidian-wiki');
  let dir = null;
  try { dir = fs.statSync(legacy).isDirectory() ? legacy : null; } catch (_) { dir = null; }
  if (!dir) dir = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian-wiki');
  const file = path.join(dir, 'config');
  let text;
  try { if (!fs.statSync(file).isFile()) return null; text = fs.readFileSync(file).toString('utf8'); } catch (_) { return null; }
  const lines = text.split('\n').filter((l) => /^[ \t\v\f\r]*OBSIDIAN_VAULT_PATH=/.test(l));
  if (!lines.length) return null;
  let v = lines[lines.length - 1];
  v = v.slice(v.indexOf('=') + 1);
  if (v.endsWith('"')) v = v.slice(0, -1);
  if (v.startsWith('"')) v = v.slice(1);
  if (v.endsWith("'")) v = v.slice(0, -1);
  if (v.startsWith("'")) v = v.slice(1);
  if (!v) return null;
  return { file, vault: v.startsWith('~') ? `${home}${v.slice(1)}` : v };
}
/** Whether the recap reads the vault obsidian-wiki's commands read, and if not why, in words (round 23, 2). */
function recapCheck(home) {
  const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
  const r = recapVault(home);
  const cmd = vaultIdentity(home);
  const lead = "obsidian-wiki's SessionStart hook is registered, but";
  if (!r) return { ok: false, why: `${lead} its recap finds no vault in the config it reads` };
  if (!path.isAbsolute(r.vault)) return { ok: false, why: `${lead} its recap reads ${r.vault}, a relative path, against each session's folder` };
  let dir = false;
  try { dir = fs.statSync(r.vault).isDirectory(); } catch (_) { dir = false; }
  if (!dir) return { ok: false, why: `${lead} its recap reads ${r.vault}, which is not a folder` };
  if (!cmd || real(cmd) !== real(r.vault)) return { ok: false, why: `${lead} its recap reads ${r.vault} while obsidian-wiki's commands read ${cmd || 'no vault'}` };
  return { ok: true };
}
function vaultWhy(home, NPX) {
  const config = configOf(home);
  if (!config) return null;
  const xdg = xdgProblem();
  if (xdg) return { kind: 'xdg', why: xdg.replace(/; set it to .*$/, ''), step: 'set XDG_CONFIG_HOME to an absolute folder, or unset it' };
  const legacy = legacyShadow(home);
  if (legacy) return legacyWhy(home, legacy);
  const unread = (error) => ({ kind: 'unread', why: `obsidian-wiki's config ${config} cannot be read (${error.code || error.message})`, step: `repair or remove ${config}` });
  let st;
  try { st = fs.statSync(config); } catch (error) { return unread(error); }
  if (st.isDirectory()) return { kind: 'folder', why: `obsidian-wiki's config ${config} is a folder, not a file`, step: `remove the folder ${config}, or replace that folder with obsidian-wiki's config file` };
  try { fs.readFileSync(config); } catch (error) { return unread(error); }
  const form = configForm(home);
  if (form) {
    // The row's fix without its literal setup tail (round 21, 2: a tag such as @latest never matched \S+ there).
    const row = configFormRow(form, NPX);
    const tail = `, then ${NPX} setup`;
    return { kind: 'form', form, why: row.detail, step: row.fix.endsWith(tail) ? row.fix.slice(0, -tail.length) : row.fix };
  }
  if (!configuredVault(home)) {
    // An empty line is replaced; a missing one is written once (round 21, 9).
    let line = false; // a config that went between the reads: as a missing line (round 22, 9)
    try { line = fs.readFileSync(config, 'utf8').split('\n').some((l) => /^\s*OBSIDIAN_VAULT_PATH\s*=/.test(l)); } catch (_) { line = false; }
    return { kind: 'empty', why: `obsidian-wiki's config ${config} names no vault (its OBSIDIAN_VAULT_PATH line is empty or missing)`,
      step: line ? `replace the empty OBSIDIAN_VAULT_PATH line in ${config} with ${VAULT_ABS}` : `write ${VAULT_ABS} once in ${config}` };
  }
  return null;
}
function checks({ home, NPX, newer, claude, launcherVault = null }) {
  const rows = [];
  // obsidian-wiki reads a relative XDG_CONFIG_HOME from the folder it runs in: while it is relative no repair runs, since
  // the upgrade and the hook would act on another config than the one found here (ADR-0006 decision 12).
  const xdg = xdgProblem();
  // While it is relative, no other row sends the person to setup before it is fixed (round 11, R3).
  const XDG_FIRST = 'set XDG_CONFIG_HOME to an absolute folder, or unset it';
  let formNow = null; // the config line the refresh would rewrite, once known (round 15, R10)
  const why = vaultWhy(home, NPX); // before add(), which reads its order (round 21, 11)
  const add = (c) => {
    const row = { area: 'memory', product: 'wiki', fix: null, repair: null, gate: null, ...c, ...(xdg ? { repair: null } : {}) };
    // While a config line is one the refresh would rewrite, a hooks row asks for that first, whoever made the vault.
    // An older ~/.obsidian-wiki comes first, as in vaultWhy's order (round 21, 11): its row keeps its own step first.
    if (formNow && row.id === 'memory.hooks' && row.fix && !row.fix.includes(formStep(formNow)) && !(why && why.kind === 'legacy' && row.detail === why.why)) { row.fix = `first ${formStep(formNow)}; then ${row.fix}`; row.repair = null; row.gate = 'consent'; }
    // The XDG step itself only in memory.config; the others point at it, so it is printed once (round 22, 3).
    if (xdg && row.id !== 'memory.config' && row.fix && /\bsetup\b/.test(row.fix) && !/obsidian-wiki setup/.test(row.fix.split(NEVER).join(''))) row.fix = `first the XDG_CONFIG_HOME step above; then ${row.fix}`;
    // The prohibition once, at the start, so a reader that cuts a long fix never drops it (round 13, R5).
    if (row.fix && row.fix.includes(NEVER)) row.fix = `${NEVER}; ${row.fix.split(NEVER).map((x) => x.replace(/^[;,.\s]+|[;,\s]+$/g, '')).filter(Boolean).join('; ')}`;
    rows.push(row);
  };
  // Doctor names it in a row of its own (round 9, R3).
  if (xdg) add({ id: 'memory.config', state: 'warn', detail: xdg, fix: `${XDG_FIRST}, then ${NPX} setup --with wiki`, gate: 'consent' });
  // Every branch ends here (round 20, 1): the reason setup's Obsidian step prints is a doctor row's detail, whatever the
  // branch (installed, not installed, a copy uv holds that does not run, the person's own copy).
  const explain = (state = 'warn', extra = {}) => {
    if (!why || why.kind === 'xdg') return; // memory.config names it
    if (why.kind === 'form') { if (!rows.some((r) => r.id === 'memory.vault.config-form')) add(configFormRow(why.form, NPX)); return; }
    if (why.kind === 'legacy') return;
    if (!rows.some((r) => r.id === 'memory.vault' && r.detail.includes(why.why))) add({ id: 'memory.vault', state, detail: why.why, fix: `${why.step}, then ${NPX} setup --with wiki`, gate: 'consent', ...extra });
  };
  const done = () => {
    explain();
    // An older ~/.obsidian-wiki, through add() like every row (round 20, 2): a warning, since it misleads the recap; only
    // memory.hooks with the very same text stands in for it.
    const legacy = configOf(home) ? legacyShadow(home) : null;
    if (legacy) {
      const l = legacyWhy(home, legacy);
      if (!rows.some((r) => r.id === 'memory.hooks' && r.detail === l.why)) add({ id: 'memory.legacy', state: 'warn', detail: l.why, fix: `${l.step}, then ${NPX} setup`, gate: 'consent' });
    }
    return rows;
  };
  const t = tool(home);
  if (!t) {
    const u = uv(home);
    // uv holds one that does not run (round 11, S2): the person reinstalls it with what uv recorded; no repair.
    if (u && uvHolds(home, u)) {
      add({ id: 'memory.wiki', state: 'warn', detail: BROKEN, fix: reinstallFix(u), gate: 'consent' });
      return done();
    }
    // The person's own obsidian-wiki, off this PATH (a venv, pip --user, pipx): never installed over (round 14, B2).
    const own = personalCopy(home, u);
    if (own) {
      add({ id: 'memory.wiki', state: 'warn', detail: ownNote(own).replace(/; put its .*$/, ''), fix: `put the folder of that obsidian-wiki's command on your PATH, then ${NPX} doctor; the launcher never installs another copy over it`, gate: 'consent' });
      return done();
    }
    const route = u ? null : uvRoute();
    // An install over a config runs obsidian-wiki's refresh: a config line it would rewrite comes first (round 13, S2).
    const form = configOf(home) ? configForm(home) : null;
    const unreadCfg = why && why.kind === 'unread'; // round 23, 3: no install over a config obsidian-wiki cannot read
    const fix = u ? `${NPX} setup --with wiki` : `${route.step}, then ${NPX} setup --with wiki`;
    add({ id: 'memory.wiki', state: 'info', detail: `${catalog.WIKI.name} (the agents' wiki memory): not installed`, fix: form ? `first ${formStep(form)}; then ${fix}` : unreadCfg ? `first make obsidian-wiki's config readable, or remove it, as the wiki vault step says; then ${fix}` : fix, gate: form || unreadCfg ? 'consent' : route ? route.gate : null });
    if (form) add(configFormRow(form, NPX));
    // Config or not (round 8, S1): with a config, obsidian-wiki's first ordinary command after an install refreshes its skills.
    const clashed = clashes(home, null);
    if (clashed.length) add(clashRow(clashed, `${NPX} setup --with wiki`));
    return done();
  }
  // The leading x.y.z decides; the pin's own x.y.z with a suffix the launcher cannot order, or no version, is unknown:
  // a warning naming the pin, never a forced reinstall (it could take back a newer build).
  const clashed = clashes(home, t.bin);
  if (clashed.length) add(clashRow(clashed, `${NPX} setup`));
  // A managed key written with spaces around = would be emptied by the upgrade's `list` (round 12, R1).
  const spaced = configForm(home);
  formNow = spaced;
  if (spaced) add(configFormRow(spaced, NPX));
  const stand = versionAgainstPin(t.version);
  if (stand === 'unknown') {
    add({ id: 'memory.wiki', state: 'warn', detail: !t.version ? `${catalog.WIKI.name} at ${t.bin}: its version could not be read; this launcher pins ${PIN}`
      : `${catalog.WIKI.name} ${t.version} (not a version this launcher compares); this launcher pins ${PIN}` });
  } else if (stand === 'behind') {
    // uv's own copy (in uv's folder, and uv lists it) is brought up by setup. One in uv's folder where uv is missing:
    // uv first (setup then brings it up if uv lists it). Any other is the person's to bring up (pipx, pip --user).
    const route = !t.uvs && t.inUvDir && !uv(home) ? uvRoute() : null;
    // The upgrade's `list` runs obsidian-wiki's version refresh, which would replace a clashing skill: no repair then.
    // An unreadable config stops obsidian-wiki's own `list` (PermissionError), as a config form would be rewritten by it (round 23, 3).
    const unreadCfg = why && why.kind === 'unread';
    const blocked = t.uvs && (clashed.length || spaced || unreadCfg);
    add({
      id: 'memory.wiki', state: 'warn', detail: `${catalog.WIKI.name} ${t.version}; this launcher pins ${PIN}`,
      fix: blocked ? (clashed.length ? clashNote(clashed) : spaced ? configFormNote(spaced) : UNREAD_FIRST(NPX)) : t.uvs ? `${NPX} setup` : route ? `${route.step}, then ${NPX} setup` : `bring it to ${PIN} with the tool that installed it (uv does not list it)`,
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
  configured = configuredVault(home); // the one reader (round 17, 2)
  let broken = null;
  if (config) { try { fs.statSync(config); } catch (error) { broken = error.code || error.message; } }
  if (!config) {
    add({ id: 'memory.vault', state: 'info', detail: 'no wiki vault yet (obsidian-wiki has no config)', fix: `${NPX} setup --with wiki` });
  } else if (broken) {
    // A config that is a link to nothing is still a config: setup makes no vault over it and removes nothing.
    // obsidian-wiki's own doctor fails a config that is a link to nothing (global-config): a failure here too (round 22, 2).
    add({ id: 'memory.vault', state: 'fail', manual: true, detail: `obsidian-wiki's config ${config} cannot be read (${broken}); setup makes no vault while it is there`, fix: `repair or remove ${config}, then ${NPX} setup --with wiki`, gate: 'consent' }); // one gate per reason (round 21, 5)
  } else if (why && (why.kind === 'folder' || why.kind === 'unread' || why.kind === 'empty')) {
    // Its own why and step, never only "read obsidian-wiki doctor --json" (round 20, 9). Where obsidian-wiki's own doctor
    // fails it (a config that is a folder, no vault set) it stays a failure setup cannot repair (round 21, 3).
    // An unreadable config ends obsidian-wiki's doctor with a traceback: its crash on the config counts as its failure (round 22, 2).
    explain('fail', { manual: true });
  } else {
    const r = releases.run(t.bin, ['doctor', '--json'], { timeout: 60000, input: '', env: wenv(home) });
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
      // Below the pin (or a version the launcher cannot order) the upgrade comes first (round 7, R6): it records the version.
      const refreshable = stand === 'equal' || stand === 'ahead';
      const hints = [...new Set(bad.map((c) => {
        const f = fixFor(c, NPX);
        if (f !== REFRESH) return f;
        if (stand === 'unknown') return `obsidian-wiki ${t.version || '(its version could not be read)'} is installed, a version this launcher cannot order against its pin ${PIN}, so it leaves the recorded version to you; ${NEVER}`;
        if (!refreshable) return `bring obsidian-wiki up to ${PIN} first, by the obsidian-wiki step above; its upgrade records the version`;
        if (spaced) return `first ${formStep(spaced)}; then ${REFRESH}`; // round 12, R1; round 14, C4
        return clashed.length ? `first ${clashVerb(clashed)} the clash step above names; then ${REFRESH}` : f;
      }))];
      add({
        id: 'memory.vault', state,
        detail: `wiki vault ${where}: ${state === 'ok' ? 'obsidian-wiki doctor passes' : bad.map((c) => `${c.name} ${c.status} (${c.detail})`).join('; ')}`,
        fix: state === 'ok' ? null : joinHints(hints),
        // setup repairs none of this: the session-start line sends the person to doctor (doctor.json `manual`).
        ...(state === 'fail' ? { manual: true } : {}),
      });
    }
  }

  // The hooks of a set-up wiki where Claude Code is installed: a tool with no vault yet has nothing to recap.
  if (claude && claude.here && config && !broken) {
    const h = hookState(t.bin, home);
    const same = path.resolve(claude.settings) === path.resolve(hooksFile(home));
    const linked = settingsLink(home);
    const gone = missingScript(home); // once (round 9, U2)
    const shadow = legacyShadow(home);
    if (same && shadow) {
      // obsidian-wiki's recap script reads ~/.obsidian-wiki whenever it exists, its commands the XDG folder (round 13, S1):
      // the recap would bring another vault into every session. No hook repair while both are there.
      const l = legacyWhy(home, shadow); // the one text, which memory.legacy then leaves to this row (round 20, 2)
      add({ id: 'memory.hooks', state: 'warn', detail: l.why, fix: `${l.step}, then ${NPX} setup`, gate: 'consent' });
    } else if (h.error) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's hooks could not be read (${h.error})`, fix: `run: obsidian-wiki hooks status --json (it exits 1 while the Stop hook is not registered, which is expected: the launcher never registers it); ${NEVER}` });
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
        // Which vault is the launcher's is an identity read of the raw line, whatever its form (round 18, 2): never printed.
        const ours = !!launcherVault && [vaultIdentity(home), configured].some((v) => !!v && real(launcherVault) === real(v));
        const form = spaced; // round 14, B3: no hook repair while a config line is one the refresh would rewrite (computed once, round 15)
        // A settings file that is a link: obsidian-wiki's writer would replace the link with a plain file (os.replace), so
        // the launcher adds the entry where the link points (round 5, S1); for another vault the person does it by hand.
        // obsidian-wiki's own writer drops the file's permission bits and replaces a link (round 6, S2): never handed out.
        const where = linked || hooksFile(home);
        const fix = ours && form ? `first ${formStep(form)}; then ${NPX} setup` : ours ? `${NPX} setup (the launcher adds the entry to ${where}${linked ? `, where the link ${hooksFile(home)} points, keeping the link` : ''})`
          : `add obsidian-wiki's SessionStart entry (its command for ${HOOK_SCRIPTS.SessionStart}) to ${where} by hand, keeping the file's permissions; never \`obsidian-wiki hooks install\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER}`;
        add({ id: 'memory.hooks', state: 'info', detail: `Claude Code starts a session without a recap of the wiki (obsidian-wiki's SessionStart hook is not registered)`, fix,
          repair: ours && !form ? { kind: 'hook', product: 'wiki' } : null, gate: ours && !form ? null : 'consent' });
      } else if (gone) {
        // Registered, but the script its command runs is not there (obsidian-wiki moved or reinstalled): it ends silently.
        add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's SessionStart hook is registered, but the script its command runs is not there: ${gone}`,
          fix: `remove that entry from ${linked || hooksFile(home)} by hand, keeping the file's permissions; then ${NPX} setup --with wiki registers it again for the vault the launcher made; ${NEVER}`, gate: 'consent' });
      } else if (!h.reachable) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's SessionStart hook is registered but cannot reach the package, so it ends silently`, fix: fixFor({ name: 'session-hooks', status: 'warn', hint: h.hint, detail: 'registered, but it cannot reach the package' }, NPX) });
      // ok only when the recap, as its script reads the config, reads the vault the commands read (round 23, 2).
      else {
        const rc = recapCheck(home);
        if (rc.ok) add({ id: 'memory.hooks', state: 'ok', detail: `Claude Code starts each session with a recap of the wiki (obsidian-wiki's SessionStart hook)` });
        else add({ id: 'memory.hooks', state: 'info', detail: rc.why });
      }
      // The Stop hook is never the launcher's: named as information, with its effect, for the person to keep or remove.
      if (h.stop) {
        add({ id: 'memory.hooks.stop', state: 'info', detail: `obsidian-wiki's Stop hook is registered: after every turn of every Claude Code session, in every project, it asks the agent to write into the wiki; the launcher never registers it`,
          fix: `remove obsidian-wiki's Stop entry (its command for ${HOOK_SCRIPTS.Stop}) from ${linked || hooksFile(home)} by hand, keeping the file's permissions; never \`obsidian-wiki hooks uninstall\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER}`, gate: 'consent' });
      }
    }
  }
  return done();
}

/**
 * What setup would do for the memory: { tool, vault } (whether each is still to do) and why it cannot now: `note`
 * (uv missing, git missing, a folder that holds files), `problem` for the folder alone.
 */
function needs(home, vault, platform = process.platform) {
  const t = tool(home);
  const config = configOf(home);
  const need = { tool: !t, vault: !config, problem: config ? null : vaultProblem(vault), note: null };
  // A relative XDG_CONFIG_HOME leaves the whole memory out, the install over a config too (ADR-0006 decision 12).
  const xdg = (need.tool || need.vault) ? xdgProblem() : null;
  if (xdg) need.note = xdg;
  // One order with checks() and install(): uv's record first, then the person's own copy (round 15, R9).
  else if (need.tool && uv(home) && uvHolds(home, uv(home))) need.note = `${BROKEN}; ${reinstallFix(uv(home))}`; // round 11, S2
  else if (need.tool && config && personalCopy(home, uv(home))) need.tool = false; // round 14, B2: the person's own copy, no install item
  else if (need.tool && !uv(home)) need.note = uvRoute().note;
  else if (need.tool && config && configForm(home)) need.note = configFormNote(configForm(home)); // round 12, R1
  else if (need.tool && config && unreadConfig(home)) need.note = unreadConfig(home); // round 23, 3
  else if (need.tool || (need.vault && !need.problem)) {
    // obsidian-wiki's setup, and its version refresh (its first ordinary command after an install over a config), replace
    // a same-named skill in every agent's global folder (round 6, S1; round 8, S1): never run over one.
    need.clashes = clashes(home, t ? t.bin : null);
    need.note = need.clashes.length ? clashNote(need.clashes) : need.vault && !need.problem ? (xdgProblem() || gitNote(platform)) : null;
  }
  return need;
}

/**
 * Install obsidian-wiki at the pin when it is absent and, when this user has no config, make the vault: the folder,
 * `git init -b main` in it unless it is a repository, `obsidian-wiki setup --no-hooks --vault <dir>` with no terminal
 * (never while a skill of the person's shares a name with one of obsidian-wiki's, checked again right before it), then
 * (where Claude Code is installed and reads ~/.claude/settings.json) the SessionStart entry, written by `hook`.
 * `made(vault)` is told once the vault stands. Returns what it did; throws on the first step that fails. A failed vault
 * step leaves nothing the launcher made: a folder it made is removed, a folder that was there is left as it was (it held
 * nothing), what the step added to obsidian-wiki's config folder is removed, and so are the skill links obsidian-wiki's
 * setup made, so the next run starts again.
 */
function install({ home, vault, claude, made = () => {}, report = () => {}, NPX = 'npx @passioncode-ai/passioncode@latest' }) {
  const done = [];
  const xdg = xdgProblem();
  if (xdg) throw new Error(`${xdg}; nothing was installed`);
  let t = tool(home);
  let installedNow = null; // the uv that installed obsidian-wiki in this run, if it did
  if (!t) {
    const u = uv(home);
    // One uv holds that does not run (its Python removed, its command not on this PATH) is the person's to reinstall
    // with what uv recorded: a plain install would drop its extras or take back a newer version (round 11, S2). Checked
    // before the person's own copy, as checks() and needs() do (round 15, R9).
    if (u && uvHolds(home, u)) throw new Error(`${BROKEN}; nothing was installed`);
    const own = personalCopy(home, u);
    if (own) throw new Error(`${ownNote(own)}; nothing was installed`); // round 14, B2, before uv runs
    if (!u) throw new Error(`uv is not installed (${UV_PAGE}); nothing was installed`);
    // Its first command over a config runs `list`, which would empty a key written with spaces (round 12, R1).
    const spaced = configOf(home) ? configForm(home) : null;
    if (spaced) throw new Error(`${configFormNote(spaced)}; nothing was installed`);
    const unreadIns = unreadConfig(home);
    if (unreadIns) throw new Error(`${unreadIns}; nothing was installed`); // round 23, 3
    // Its skills go in with its setup, or with the refresh its first command runs over a config (round 8, S1).
    const before = clashes(home, null);
    if (before.length) throw new Error(`${clashNote(before)}; nothing was installed`);
    const r = releases.run(u, ['tool', 'install', `obsidian-wiki==${PIN}`], { timeout: 10 * 60 * 1000, input: '' });
    if (r.code !== 0) throw new Error(`uv tool install obsidian-wiki==${PIN}: ${lastLine(r)}`);
    installedNow = u; // from uv's exit, so a check that fails below uninstalls it too (round 11, R1)
  }
  // A step that fails in the run that installed obsidian-wiki uninstalls it again (round 9, R1): a tool left with no config,
  // or with an old recorded version, answers every agent's next command with "Run: obsidian-wiki setup".
  let vaultMade = false;
  try {
    if (installedNow) {
      t = tool(home);
      if (!t || t.version !== PIN) throw new Error(`uv installed obsidian-wiki, but ${t ? `it reads ${t.version || 'no version'}` : 'it does not answer'}`);
      report(`installed ${catalog.WIKI.name} ${PIN} with uv`);
      done.push(`installed ${catalog.WIKI.name} ${PIN}`);
    }
    // Over an existing config: the same refresh as the upgrade, so no version mismatch is left for an agent's next command.
    if (installedNow && configOf(home)) refresh(home, t.bin, NPX);
    vaultStep();
  } catch (error) {
    if (!installedNow || vaultMade) throw error;
    const un = releases.run(installedNow, ['tool', 'uninstall', 'obsidian-wiki'], { timeout: 120000, input: '' });
    throw new Error(un.code === 0 ? `${error.message}; obsidian-wiki was uninstalled again (uv tool uninstall obsidian-wiki)`
      : `${error.message}; uv tool uninstall obsidian-wiki failed (${lastLine(un)}): run it yourself`);
  }
  return done.join(', ');

  function vaultStep() {
  if (!configOf(home)) {
    const xdg = xdgProblem();
    if (xdg) throw new Error(`${xdg}; no vault was made`);
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
    // The entries of obsidian-wiki's skill names in its global folders before the step (round 7, R7): a link into its
    // package that was not there is one its setup made, and the undo removes exactly those.
    const names = [...new Set([...bundledSkills(t.bin, home).names, ...catalog.WIKI.skills])];
    // An entry that cannot be read is no entry here (round 11, S1): clashes() refused the step before such a folder.
    const entries = () => skillFolders(home).flatMap((d) => names.map((n) => path.join(d, n))).filter((p) => { const st = lstatOrNull(p); return st && !st.unreadable; });
    const entriesBefore = new Set(entries());
    // The skills folders (and their parents under the home folder) that are not there yet: a failed step's undo removes
    // the ones obsidian-wiki's setup made for agents that are not installed, when they hold nothing (round 8, R6).
    const missingDirs = [];
    for (const d of skillFolders(home)) {
      for (let at = d; at.startsWith(home + path.sep) && !fs.existsSync(at) && !missingDirs.includes(at); at = path.dirname(at)) missingDirs.push(at);
    }
    fs.mkdirSync(vault, { recursive: true });
    // Returns what could not be removed, or null.
    const undo = () => {
      const lefts = []; // every part that could not be removed (round 13, R8)
      try {
        if (!existed) fs.rmSync(vault, { recursive: true, force: true });
        else for (const n of fs.readdirSync(vault)) if (!before.includes(n)) fs.rmSync(path.join(vault, n), { recursive: true, force: true });
      } catch (error) { lefts.push(`removing ${vault} failed (${error.code || error.message}): remove it, then run setup again`); }
      let added = [];
      try { added = !fs.existsSync(cdir) ? [] : !cdirExisted ? [cdir] : fs.readdirSync(cdir).filter((n) => !cdirBefore.includes(n)).map((n) => path.join(cdir, n)); } catch (error) {
        lefts.push(`reading ${cdir} failed (${error.code || error.message}): remove the files obsidian-wiki setup wrote there, then run setup again`); // round 12, R5
      }
      for (const f of added) {
        try { fs.rmSync(f, { recursive: true, force: true }); } catch (error) { lefts.push(`removing ${f} failed (${error.code || error.message}): remove it, then run setup again`); }
      }
      // Only links into obsidian-wiki's package that were not there before: a skill of the person's is never touched.
      const pkg = /[\\/]obsidian_wiki[\\/]_data[\\/]skills[\\/][^\\/]+$/;
      const own = bundledSkills(t.bin, home).dir;
      const ours = (p) => { try { const to = fs.realpathSync(p); return pkg.test(to) || (!!own && path.dirname(to) === fs.realpathSync(own)); } catch (_) { return false; } };
      let linked = [];
      try { linked = entries().filter((p) => !entriesBefore.has(p) && fs.lstatSync(p).isSymbolicLink() && ours(p)); } catch (error) {
        lefts.push(`reading obsidian-wiki's skills folders failed (${error.code || error.message}): remove the skill links its setup made, then run setup again`);
      }
      for (const p of linked) {
        try { fs.unlinkSync(p); } catch (error) { lefts.push(`removing ${p} failed (${error.code || error.message}): remove it, then run setup again`); }
      }
      unlinked = linked.length;
      // Deepest first, and only a folder left empty.
      for (const d of [...missingDirs].sort((a, b) => b.length - a.length)) {
        try { if (fs.existsSync(d) && !fs.readdirSync(d).length) { fs.rmdirSync(d); removedDirs += 1; } } catch (_) { /* left, and harmless */ }
      }
      return lefts.length ? lefts.join('; ') : null;
    };
    let unlinked = 0, removedDirs = 0;
    const fail = (message) => {
      const left = undo();
      const links = unlinked ? `, and the ${unlinked} skill links obsidian-wiki's setup made were removed${removedDirs ? `, with the empty skills folders it made` : ''}` : '';
      throw new Error(left ? `${message}; ${left}` : `${message}; nothing of the vault step was kept${links}`);
    };
    if (!fs.existsSync(path.join(vault, '.git'))) {
      const g = releases.run('git', ['init', '-b', 'main', vault], { timeout: 60000, input: '' });
      if (g.code !== 0) fail(`git init -b main ${vault}: ${(g.err || g.out || `exit ${g.code}`).trim().split('\n')[0]}`);
    }
    // Checked again right before obsidian-wiki setup (round 7, R4): a skill may have come since the plan.
    const late = clashes(home, t.bin);
    if (late.length) fail(`${clashNote(late)}; no vault was made`);
    const s = releases.run(t.bin, ['setup', '--no-hooks', '--vault', vault], { timeout: 5 * 60 * 1000, input: '', env: wenv(home) });
    if (s.code !== 0) fail(`obsidian-wiki setup --no-hooks --vault ${vault}: ${lastLine(s)}`);
    if (!configOf(home)) fail(`obsidian-wiki setup --no-hooks --vault ${vault} wrote no config`);
    report(`made the wiki vault ${vault} (a Git repository) with obsidian-wiki setup --no-hooks`);
    done.push(`made the wiki vault ${vault}`);
    vaultMade = true;
    made(vault);
    const shadow = legacyShadow(home);
    const readsHere = claude && claude.here && path.resolve(claude.settings) === path.resolve(hooksFile(home));
    if (shadow && readsHere) {
      // The recap would read the older ~/.obsidian-wiki, another vault (round 13, S1): not registered; doctor names it.
      done.push(`its SessionStart recap was not registered: ${shadowNote(home, shadow)}`);
    } else if (claude && claude.here && path.resolve(claude.settings) === path.resolve(hooksFile(home))) {
      // The vault stands: a hook that fails now names what was kept and what the next setup does (round 11, P2).
      try { hook({ home, bin: t.bin }); } catch (error) {
        const reason = error.message.replace(/; nothing was changed$/, "; Claude Code's settings file was not changed");
        const e = new Error(`${done.join(', ')} (kept); its SessionStart recap was not registered: ${reason}; fix that, then run setup again, which registers it`);
        e.vaultKept = vault;
        throw e;
      }
      done.push('registered its SessionStart recap for Claude Code');
    }
  }
  }
}

/**
 * Register obsidian-wiki's SessionStart recap for Claude Code. obsidian-wiki never writes ~/.claude/settings.json (its
 * writer drops the file's permission bits and replaces a link): `obsidian-wiki hooks install --only SessionStart` runs
 * with a throwaway home, so its entry is exactly the one it writes, and the launcher then reads the real file, checks its
 * shape, adds the entry and writes it back with its own writer (through a link, keeping the permission bits, a new file
 * private), those last steps back to back so nothing written meanwhile is lost.
 */
function hook({ home, bin = null }) {
  const xdg = xdgProblem();
  if (xdg) throw new Error(`${xdg}; nothing was changed`);
  const shadow = legacyShadow(home);
  if (shadow) throw new Error(`${shadowNote(home, shadow)}; nothing was changed`); // round 13, S1
  // Two vault lines would send the recap (the last) and the commands (the first) to different vaults (round 14, B3).
  const form = configForm(home);
  if (form) throw new Error(`${configFormNote(form)}; nothing was changed`);
  const b = bin || (tool(home) || {}).bin;
  if (!b) throw new Error('obsidian-wiki is not installed');
  const linked = settingsLink(home);
  const file = hooksFile(home);
  const isObject = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  // A command entry, as obsidian-wiki's is_registered reads it (round 12, R3).
  const has = (d) => (((d.hooks || {}).SessionStart) || []).some((g) => ((g && g.hooks) || []).some((e) => isHookEntry(e, HOOK_SCRIPTS.SessionStart)));
  // The real file as it is now: read, checked and written back to back (round 7, R2), with no run between.
  const current = () => {
    const { doc, error } = permissions.load(file);
    if (error) throw new Error(error);
    // The shapes obsidian-wiki's entry goes into (round 6, R4): otherwise the file stays as it is.
    if ('hooks' in doc && !isObject(doc.hooks)) throw new Error(`${file}: "hooks" is not an object; nothing was changed`);
    const start = doc.hooks && doc.hooks.SessionStart;
    if (start !== undefined && (!Array.isArray(start) || start.some((g) => !isObject(g) || ('hooks' in g && !Array.isArray(g.hooks))))) {
      throw new Error(`${file}: "hooks.SessionStart" is not a list of groups, each with a "hooks" list; nothing was changed`);
    }
    return doc;
  };
  if (has(current())) return `obsidian-wiki's SessionStart recap is registered already in ${linked || file}`;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-hook-'));
  try {
    const h = releases.run(b, ['hooks', 'install', '--only', 'SessionStart'], { timeout: 60000, input: '', env: { ...process.env, HOME: scratch, USERPROFILE: scratch } });
    if (h.code !== 0) throw new Error(`obsidian-wiki hooks install --only SessionStart: ${lastLine(h)}`);
    let made;
    try { made = JSON.parse(fs.readFileSync(hooksFile(scratch), 'utf8')); } catch (e) { throw new Error(`obsidian-wiki hooks install --only SessionStart wrote no settings the launcher could read (${e.code || e.name})`); }
    const groups = (Array.isArray(((made || {}).hooks || {}).SessionStart) ? made.hooks.SessionStart : []).filter((g) => has({ hooks: { SessionStart: [g] } }));
    if (!groups.length) throw new Error('obsidian-wiki hooks install --only SessionStart wrote no SessionStart entry');
    const doc = current();
    if (has(doc)) return `obsidian-wiki's SessionStart recap is registered already in ${linked || file}`;
    doc.hooks = doc.hooks || {};
    doc.hooks.SessionStart = [...(doc.hooks.SessionStart || []), ...groups];
    permissions.write(file, doc); // follows a link, keeps the permission bits, makes a new file private
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  return linked ? `registered obsidian-wiki's SessionStart recap for Claude Code in ${linked}, where the link ${file} points (the link stays)`
    : `registered obsidian-wiki's SessionStart recap for Claude Code`;
}

/**
 * obsidian-wiki's stale refresh over an existing config, run by `obsidian-wiki list` with its update check off: it records
 * the installed version and package path and refreshes the skills, keeping every other key beside the package path. Never over a clash, checked again right before
 * it with the installed package's names (round 8, R1). The version the config records decides (round 6, R3): a refresh
 * that could not run leaves the old one, and obsidian-wiki then asks for setup, which is never followed.
 */
function refresh(home, bin, NPX) {
  const spaced = configForm(home);
  if (spaced) throw new Error(`${configFormNote(spaced)}; its version was not recorded`);
  const clashed = clashes(home, bin);
  if (clashed.length) throw new Error(`${clashNote(clashed)}; its version was not recorded`);
  const l = releases.run(bin, ['list'], { timeout: 120000, input: '', env: wenv(home, { OBSIDIAN_WIKI_NO_UPDATE_CHECK: '1' }) });
  if (l.code !== 0) throw new Error(`obsidian-wiki list (it records the new version): ${lastLine(l)}`);
  let recorded = null;
  try { recorded = (/^OBSIDIAN_WIKI_VERSION="?([^"\n]*)"?/m.exec(fs.readFileSync(configOf(home), 'utf8')) || [])[1] || null; } catch (_) { recorded = null; }
  if (recorded && recorded !== PIN) {
    throw new Error(`obsidian-wiki list did not record ${PIN} (it asks for obsidian-wiki setup); read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; ${NEVER}`);
  }
}

/**
 * Bring obsidian-wiki up to the pin: `uv tool install --force obsidian-wiki==<pin>`, then the stale refresh (`obsidian-wiki
 * list`), which records the new version and package path where setup did, keeping every other key beside the package path; the vault is not touched.
 */
function upgrade({ home, NPX = 'npx @passioncode-ai/passioncode@latest' }) {
  const xdg = xdgProblem();
  if (xdg) throw new Error(`${xdg}; nothing was changed`);
  const u = uv(home);
  if (!u) throw new Error(`uv is not installed (${UV_PAGE})`);
  const before = tool(home);
  // obsidian-wiki's version refresh (run by `list` below) would replace a clashing skill (round 6, S1).
  const clashed = configOf(home) ? clashes(home, before ? before.bin : null) : [];
  if (clashed.length) throw new Error(`${clashNote(clashed)}; nothing was upgraded`);
  // Its `list` would empty a key written with spaces around = (round 12, R1): checked before the reinstall.
  const spaced = configOf(home) ? configForm(home) : null;
  if (spaced) throw new Error(`${configFormNote(spaced)}; nothing was upgraded`);
  const unreadUp = unreadConfig(home);
  if (unreadUp) throw new Error(`${unreadUp}; nothing was upgraded`); // round 23, 3
  // What uv recorded for this tool (extras, --with requirements) goes into the reinstall too (round 6, R1).
  const spec = receiptSpec(u);
  // With no Python in the receipt, the venv's own (round 12, R2): the registered SessionStart script path stays valid.
  const python = spec.python || venvPython(u);
  const args = ['tool', 'install', '--force', spec.requirement, ...spec.with.flatMap((w) => ['--with', w]), ...(python ? ['--python', python] : [])];
  // The version it had, with what uv recorded, to put back if the refresh refuses after the reinstall (round 13, R3).
  const back = before && before.version ? ['tool', 'install', '--force', spec.requirement.replace(`==${PIN}`, `==${before.version}`), ...args.slice(4)] : null;
  const r = releases.run(u, args, { timeout: 10 * 60 * 1000, input: '' });
  if (r.code !== 0) throw new Error(`uv ${args.join(' ')}: ${lastLine(r)}`);
  const after = tool(home);
  if (!after || after.version !== PIN) throw new Error(`uv installed obsidian-wiki ${PIN}, but it reads ${after ? after.version || 'no version' : 'nothing'}`);
  if (configOf(home)) {
    try { refresh(home, after.bin, NPX); } catch (error) {
      if (!back) throw new Error(`${error.message}; obsidian-wiki ${PIN} stays installed while its config records another version, so its next command asks for obsidian-wiki setup`);
      const b = releases.run(u, back, { timeout: 10 * 60 * 1000, input: '' });
      throw new Error(b.code === 0 ? `${error.message}; obsidian-wiki was put back to ${before.version} (uv ${back.join(' ')})`
        : `${error.message}; putting obsidian-wiki back to ${before.version} failed (${lastLine(b)}): obsidian-wiki ${PIN} stays installed while its config records ${before.version}, so its next command asks for obsidian-wiki setup; run uv ${back.join(' ')} yourself`);
    }
  }
  return before && versionAgainstPin(before.version) === 'behind'
    ? `brought ${catalog.WIKI.name} ${before.version} up to ${PIN}; the vault is as it was, and the config's keys too apart from ${KEPT_APART}`
    : `installed ${catalog.WIKI.name} ${PIN} with uv tool install --force; the vault is as it was, and the config's keys too apart from ${KEPT_APART}`;
}

/**
 * The text inside the TOML array `key = [ ... ]`, bounded by bracket depth with quoted strings skipped (round 7, U1: uv
 * writes a one-requirement array on one line, `requirements = [{ name = "obsidian-wiki" }]`); '' when there is none.
 */
function arrayOf(text, key) {
  const m = new RegExp(`^\\s*${key}\\s*=\\s*\\[`, 'm').exec(text);
  if (!m) return '';
  const start = m.index + m[0].length;
  // What this scan cannot read is refused, never guessed (round 8, R7): a comment, an escaped quote, an open string.
  const refuse = (why) => { throw new Error(`uv's record for obsidian-wiki has a ${key} list with ${why}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself)`); };
  let depth = 1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      const end = text.indexOf(c, i + 1);
      const body = end < 0 ? null : text.slice(i + 1, end);
      if (body === null || body.includes('\n')) refuse('a string that does not end on its line');
      if (body.includes('\\')) refuse('an escaped character');
      i = end; continue;
    }
    if (c === '#') refuse('a comment');
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) return text.slice(start, i); }
  }
  return refuse('no end');
}
/** The tables of a TOML text by name (`tool`, `tool.options`), each its own text; the part before any header is ''. */
function tablesOf(text) {
  const out = {};
  let name = '';
  for (const line of text.split('\n')) {
    const h = /^\s*\[([^\[\]]+)\]\s*(#.*)?$/.exec(line); // a header may carry a trailing comment
    if (h) { name = h[1].trim(); out[name] = out[name] || ''; continue; }
    out[name] = `${out[name] || ''}${line}\n`;
  }
  return out;
}
/** The keys a table's text sets at its top level (a line that starts with a key and `=`). */
const keysOf = (table) => [...table.matchAll(/^\s*(["']?)([A-Za-z0-9_.-]+)\1\s*=/gm)].map((m) => m[2]); // a bare, "quoted" or 'literal' key (round 11, R2)
/** The bodies of the inline tables `{ ... }` at the top level of an array's text, quoted strings skipped. */
function inlineTables(arr) {
  const out = [];
  let depth = 0, from = -1;
  for (let i = 0; i < arr.length; i++) {
    const c = arr[i];
    if (c === '"' || c === "'") { const end = arr.indexOf(c, i + 1); if (end < 0) break; i = end; continue; }
    if (c === '{' || c === '[') { if (depth === 0 && c === '{') from = i + 1; depth++; }
    else if (c === '}' || c === ']') { depth--; if (depth === 0 && c === '}' && from >= 0) { out.push(arr.slice(from, i)); from = -1; } }
  }
  return out;
}

/**
 * The requirement and `--with` list uv recorded for obsidian-wiki (its tool folder's uv-receipt.toml), so a reinstall at
 * the pin keeps a person's extras and added requirements; no receipt: the plain pin. A requirement given as a URL, a
 * path, a Git source or editable cannot be carried by name: the upgrade stops and names it.
 */
function receiptSpec(u, { pin = true } = {}) {
  const plain = { requirement: pin ? `obsidian-wiki==${PIN}` : 'obsidian-wiki', with: [], python: null };
  const dir = (releases.run(u, ['tool', 'dir'], { timeout: 15000, input: '' }).out || '').trim();
  if (!dir) return plain;
  let text;
  try { text = fs.readFileSync(path.join(dir, 'obsidian-wiki', 'uv-receipt.toml'), 'utf8'); } catch (_) { return plain; }
  const tables = tablesOf(text);
  const toolTable = tables.tool || '';
  // Refusing over parsing (round 9, U1): anything the launcher does not know stops the upgrade, named. In [tool] only
  // requirements, entrypoints and python; in [tool.options] only link-mode and compile-bytecode, which change nothing
  // that resolves; no other table; nothing before the first table.
  const held = [
    ...((tables[''] || '').trim() ? ['text before its first table'] : []),
    ...(/^\s*\[\[/m.test(text) ? ['an array of tables ([[...]])'] : []), // round 11, R2
    ...Object.keys(tables).filter((n) => n && !['tool', 'tool.options'].includes(n)).map((n) => `a [${n}] table`),
    // A quoted key, even an allowed one, is refused: refusal over parsing (round 12, R4).
    ...[...text.matchAll(/^\s*(["'])([^"'\n]*)\1\s*=/gm)].map((m) => `a quoted key (${m[2]})`),
    ...keysOf(toolTable).filter((k) => !['requirements', 'entrypoints', 'python'].includes(k)),
    ...keysOf(tables['tool.options'] || '').filter((k) => !['link-mode', 'compile-bytecode'].includes(k)),
  ];
  if (held.length) throw new Error(`uv's record for obsidian-wiki has ${held.join(', ')}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself)`);
  const out = { requirement: plain.requirement, with: [], python: (/^\s*python\s*=\s*"([^"]*)"/m.exec(toolTable) || [])[1] || null };
  for (const body of inlineTables(arrayOf(toolTable, 'requirements'))) {
    const field = (k) => (new RegExp(`(?:^|,)\\s*${k}\\s*=\\s*"([^"]*)"`).exec(body) || [])[1];
    // A quoted or dotted key inside the table is refused, never parsed (round 13, R7).
    const bare = body.replace(/=\s*"[^"]*"/g, '= ""');
    if (/["']\s*=/.test(bare) || /[A-Za-z0-9_"'-]\.[A-Za-z0-9_"'-]+\s*=/.test(bare)) throw new Error(`uv's record for obsidian-wiki has a quoted or dotted key in a requirement, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself)`);
    const name = field('name');
    if (!name) continue;
    const extras = ((/extras\s*=\s*\[([^\]]*)\]/.exec(body) || [])[1] || '').split(',').map((x) => x.trim().replace(/^"|"$/g, '')).filter(Boolean);
    const keys = [...body.replace(/"[^"]*"/g, '""').matchAll(/([A-Za-z-]+)\s*=/g)].map((m) => m[1]);
    const other = keys.filter((k) => !['name', 'extras', 'specifier', 'marker'].includes(k));
    if (other.length) throw new Error(`uv's record for obsidian-wiki has ${name} as ${other.join(', ')}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself)`);
    const marker = field('marker');
    const req = `${name}${extras.length ? `[${extras.join(',')}]` : ''}`;
    // The pin for the upgrade; the person's own specifier (none when there is none) for their reinstall (round 12, U1).
    if (name === 'obsidian-wiki') out.requirement = `${req}${pin ? `==${PIN}` : field('specifier') || ''}${marker ? ` ; ${marker}` : ''}`;
    else out.with.push(`${req}${field('specifier') || ''}${marker ? ` ; ${marker}` : ''}`);
  }
  return out;
}

/** Whether anything of the wiki memory is on this machine: obsidian-wiki answers, or an Obsidian.app is there (uninstall's line). */
function present(home) {
  const ob = catalog.OBSIDIAN;
  let hook = false; // read from the file, no command run: an entry for obsidian-wiki's SessionStart script
  try {
    const start = ((JSON.parse(fs.readFileSync(hooksFile(home), 'utf8')).hooks) || {}).SessionStart;
    hook = Array.isArray(start) && start.some((g) => Array.isArray(g && g.hooks) && g.hooks.some((e) => isHookEntry(e, HOOK_SCRIPTS.SessionStart)));
  } catch (_) { hook = false; }
  return { wiki: !!tool(home), vault: !!configOf(home), hook, obsidian: [catalog.appPath(ob, { home }), catalog.adminCopy(ob, { home })].some((p) => !!p && fs.existsSync(p)) };
}

/** What setup and doctor say of an obsidian-wiki uv holds that does not run (round 11, S2). */
const BROKEN = 'obsidian-wiki is installed by uv but does not run (its Python may be gone, or its command is not on this PATH)';
/**
 * Whether uv holds an obsidian-wiki (`uv tool list` names it, or uv's tool folder has its receipt): then a plain
 * `uv tool install` is never run over it, and it is never uninstalled as this run's own (round 11, S2).
 */
function uvHolds(home, u) {
  if (!u) return false;
  if (/^obsidian-wiki\s/m.test(releases.run(u, ['tool', 'list'], { timeout: 30000, input: '' }).out || '')) return true;
  const dir = (releases.run(u, ['tool', 'dir'], { timeout: 15000, input: '' }).out || '').trim();
  return !!dir && fs.existsSync(path.join(dir, 'obsidian-wiki', 'uv-receipt.toml'));
}
/**
 * The person's reinstall of the obsidian-wiki uv holds: its recorded requirement as it was (never the pin: a newer copy
 * stays newer), its --with requirements and its Python, each single-quoted for the shell (round 12, U1).
 */
function reinstallFix(u) {
  const q = (v) => `'${String(v).replace(/'/g, `'\\''`)}'`;
  try {
    const spec = receiptSpec(u, { pin: false });
    const python = spec.python || venvPython(u);
    const args = ['uv tool install --force', q(spec.requirement), ...spec.with.map((w) => `--with ${q(w)}`), ...(python ? [`--python ${q(python)}`] : [])];
    return `reinstall it with uv, with what uv recorded: ${args.join(' ')}`;
  } catch (_) { return 'reinstall it with uv (uv tool install --force obsidian-wiki, with the extras and requirements you gave it)'; }
}
/** uv's tool folder, or null. */
const uvToolDir = (u) => (releases.run(u, ['tool', 'dir'], { timeout: 15000, input: '' }).out || '').trim() || null;
/** The major.minor of the Python obsidian-wiki's venv was made with (its pyvenv.cfg), or null (round 12, R2). */
function venvPython(u) {
  const dir = uvToolDir(u);
  if (!dir) return null;
  let text;
  try { text = fs.readFileSync(path.join(dir, 'obsidian-wiki', 'pyvenv.cfg'), 'utf8'); } catch (_) { return null; }
  const m = /^\s*version_info\s*=\s*(\d+)\.(\d+)/m.exec(text) || /^\s*version\s*=\s*(\d+)\.(\d+)/m.exec(text);
  return m ? `${m[1]}.${m[2]}` : null;
}
/** The keys of obsidian-wiki's config its version refresh rewrites with a bare KEY= match (round 12, R1). */
const MANAGED_KEYS = ['OBSIDIAN_VAULT_PATH', 'OBSIDIAN_WIKI_REPO', 'OBSIDIAN_WIKI_VERSION'];
/** Every form configForm can return (round 17, 3): a test applies each printed step to each and finds the form gone. */
const CONFIG_FORMS = Object.freeze({
  utf8: 'not saved as UTF-8',
  bom: 'starts with a byte order mark',
  breaks: 'with Windows line endings, a control character or a line break obsidian-wiki reads differently',
  twice: 'more than once',
  exported: 'after export',
  spaced: 'with spaces around =',
  single: 'in single quotes',
  after: 'with text after its value',
  quote: 'with a double quote, a line break or a control character in its value',
  relative: 'as a relative path',
  outside: "outside obsidian-wiki's package",
  apostrophe: 'with an apostrophe at the start or end of its value',
});
/**
 * { config, key, form } when the config holds a managed key obsidian-wiki's version refresh would not keep as it is, else
 * null (round 13, S2; measured with the real 2026.11.4: a spaced key is emptied, a single-quoted value gets its quotes
 * wrapped, an `export` line gets an empty key appended, a trailing comment is absorbed, a person's OBSIDIAN_WIKI_REPO is
 * replaced by the package path). Each managed key present must be exactly KEY="..." (no inner quote, nothing after it)
 * or KEY=value (no quote, space or #), once, never after `export`; OBSIDIAN_WIKI_REPO must point into obsidian_wiki/_data.
 */
function configForm(home) {
  const config = configOf(home);
  if (!config) return null;
  let text;
  // A config that is not UTF-8 stops obsidian-wiki's own `list` (UnicodeDecodeError): its own form (round 16, R7).
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(fs.readFileSync(config)); } catch (error) {
    return error && error.code === 'ERR_ENCODING_INVALID_ENCODED_DATA' || error instanceof TypeError ? { config, key: null, form: CONFIG_FORMS.utf8 } : null;
  }
  // obsidian-wiki splits with Python's splitlines(), which also breaks at \r, \v, \f, \x1c-\x1e, \x85, U+2028 and U+2029,
  // and its refresh converts every line ending: such a config is refused as a whole (round 14, B1; measured with the
  // real 2026.11.4). A leading byte order mark is its own form.
  if (text.charCodeAt(0) === 0xfeff) return { config, key: null, form: CONFIG_FORMS.bom };
  // Any C0 control but \t too (round 15, B1: Python's strip() takes \x1f for whitespace, JS's \s does not): the one rule.
  const lines = text.split('\n');
  // A break or control character inside the vault's value (a trailing \r is a line ending) is the vault's own form: saving the
  // file without it would change the path, so its step moves the vault (round 18, R9).
  const vaultLine = lines.find((l) => l.startsWith('OBSIDIAN_VAULT_PATH='));
  // Only a break inside the value: one after the closing quote is the whole config's form (round 19, R7).
  const vaultValue = vaultLine ? (/^OBSIDIAN_VAULT_PATH="([^"]*)"/.exec(vaultLine) || [null, vaultLine.slice('OBSIDIAN_VAULT_PATH='.length).replace(/\r$/, '')])[1] : null;
  if (vaultValue && CONFIG_BREAKS.test(vaultValue)) return { config, key: 'OBSIDIAN_VAULT_PATH', form: CONFIG_FORMS.quote };
  if (lines.some((l) => CONFIG_BREAKS.test(l))) return { config, key: null, form: CONFIG_FORMS.breaks };
  for (const key of MANAGED_KEYS) {
    const mine = lines.filter((l) => new RegExp(`^\\s*(export\\s+)?${key}\\s*=`).test(l));
    if (!mine.length) continue;
    if (mine.length > 1) return { config, key, form: CONFIG_FORMS.twice };
    const l = mine[0];
    if (/^\s*export\s/.test(l)) return { config, key, form: CONFIG_FORMS.exported };
    const quoted = new RegExp(`^${key}="([^"]*)"$`).exec(l);
    const bare = new RegExp(`^${key}=([^"'\\s#]*)$`).exec(l);
    if (!quoted && !bare) {
      const rest = l.slice(l.indexOf('=') + 1);
      const form = new RegExp(`^\\s*${key}\\s+=|^\\s*${key}=\\s`).test(l) || /^\s/.test(l) ? CONFIG_FORMS.spaced : rest.startsWith("'") ? CONFIG_FORMS.single
        // A double quote inside the value, which the config cannot hold (round 17, 3), not a quoted value with text after it.
        : !/^"[^"]*"[\s#]/.test(rest) && cannotHold(rest.replace(/^"([^]*)"$/, '$1')) ? CONFIG_FORMS.quote : CONFIG_FORMS.after;
      return { config, key, form };
    }
    const value = quoted ? quoted[1] : bare[1];
    if (key === 'OBSIDIAN_WIKI_REPO' && value) {
      // The package check first (round 17, 3): a value naming no obsidian_wiki/_data folder is outside it, relative or not;
      // only a relative one naming it keeps the step to write it as an absolute path. A relative repo would be read against
      // whatever folder a command runs in (round 15, R8): refused, never resolved.
      if (!/(^|[\\/])obsidian_wiki[\\/]_data([\\/]|$)/.test(value)) return { config, key, form: CONFIG_FORMS.outside };
      if (!path.isAbsolute(expandHome(value, home))) return { config, key, form: CONFIG_FORMS.relative };
    }
    // A relative vault: obsidian-wiki's recap resolves it against each session's folder (round 18, R8). ~/ is the home's.
    if (key === 'OBSIDIAN_VAULT_PATH' && /^'|'$/.test(value)) return { config, key, form: CONFIG_FORMS.apostrophe }; // round 19, R7
    if (key === 'OBSIDIAN_VAULT_PATH' && value && !path.isAbsolute(expandHome(value, home))) return { config, key, form: CONFIG_FORMS.relative, value };
  }
  return null;
}
const PKG_PATH = "an absolute path to obsidian-wiki's package folder (.../obsidian_wiki/_data)";
const MOVE_VAULT = 'move the vault to a folder whose path has no double quote, line break or control character, then write OBSIDIAN_VAULT_PATH="<new path>" once';
const VAULT_ABS = 'OBSIDIAN_VAULT_PATH="<absolute path>"';
const MOVE_APOS = 'move the vault to a folder whose path neither starts nor ends with an apostrophe, then write OBSIDIAN_VAULT_PATH="<new path>" once';
/**
 * Whether a form's step is to remove the line: every form of OBSIDIAN_WIKI_REPO but a relative path naming the package
 * (obsidian-wiki writes the package path back, so following "write it once" could land in a second form; round 18, R9),
 * and a double quote in another key than the vault.
 */
const removesLine = (f) => (f.key === 'OBSIDIAN_WIKI_REPO' && f.form !== CONFIG_FORMS.relative) || (f.form === CONFIG_FORMS.quote && f.key === 'OBSIDIAN_WIKI_VERSION');
const vaultRelative = (f) => f.form === CONFIG_FORMS.relative && f.key === 'OBSIDIAN_VAULT_PATH';
/** The step for a relative vault line, which carries its value; a ~user value names no folder it was made against (round 20, 3, 4). */
const vaultAbsStep = (value) => (value.startsWith('~') ? `write the vault's absolute path (${value} with its home spelled out) once as ${VAULT_ABS}`
  : `write the vault's absolute path (the folder \`obsidian-wiki setup\` ran in, joined with ${value}) once as ${VAULT_ABS}`);
const configFormNote = ({ config, key, form, value }) => form === CONFIG_FORMS.outside
  ? `${config} points ${key} outside obsidian-wiki's package, which its version refresh would replace with the package path; remove that line, then run setup again`
  : vaultRelative({ key, form }) ? `${config} writes ${key} as a relative path (${value}), which obsidian-wiki's recap would read against each session's folder; ${vaultAbsStep(value)}, then run setup again`
  : form === CONFIG_FORMS.apostrophe ? `${config} writes ${key} with an apostrophe at the start or end of its value, which obsidian-wiki's recap strips, so it would read another folder; ${MOVE_APOS}, and run setup again`
  : form === CONFIG_FORMS.relative ? `${config} writes ${key} as a relative path, which obsidian-wiki would read against whatever folder it runs in; remove that line, or write it as ${PKG_PATH}, then run setup again`
  : form === CONFIG_FORMS.quote && key === 'OBSIDIAN_VAULT_PATH' ? `${config} writes ${key} with a double quote, a line break or a control character in its value, which obsidian-wiki's config cannot hold; ${MOVE_VAULT}, and run setup again`
  : removesLine({ key, form }) ? `${config} writes ${key} ${form}, which obsidian-wiki's version refresh would rewrite; remove that line, then run setup again`
  : form === CONFIG_FORMS.utf8 ? `${config} is not saved as UTF-8, which obsidian-wiki cannot read; save it as UTF-8, then run setup again`
  : form === CONFIG_FORMS.bom ? `${config} starts with a byte order mark: save it without one, then run setup again`
    : !key ? `${config} is written ${form}, which obsidian-wiki's version refresh would rewrite; save it with plain line endings (\\n) and no control characters, then run setup again`
      : `${config} writes ${key} ${form}, which obsidian-wiki's version refresh would rewrite; write it once as ${key}="...", then run setup again`;
/** The step a config-form row asks for, as other rows point at it (round 14, C4). */
// Words, never a row id, in text a person reads (round 23, 4).
const formStep = (form) => (form.form === CONFIG_FORMS.outside || removesLine(form) ? `remove the ${form.key} line, as the config line step above says`
  : form.form === CONFIG_FORMS.relative && !vaultRelative(form) ? `remove the ${form.key} line, or write it as ${PKG_PATH}, as the config line step above says`
  : form.form === CONFIG_FORMS.quote || form.form === CONFIG_FORMS.apostrophe ? 'move the vault, as the config line step above says'
  : !form.key ? 'save the config, as the config line step above says' : `rewrite the ${form.key} line, as the config line step above says`);
/** A hook entry as obsidian-wiki's is_registered reads it: type "command", its command naming the script (round 12, R3). */
const isHookEntry = (e, script) => !!e && e.type === 'command' && String(e.command || '').includes(script);

/** The environment every obsidian-wiki run gets: the launcher's home, so its decisions and actions read one home (round 13, R4). */
const wenv = (home, extra = {}) => ({ ...process.env, ...(home ? { HOME: home, USERPROFILE: home } : {}), ...extra });
/**
 * The older ~/.obsidian-wiki when it is a folder and obsidian-wiki's commands read another config folder, else null:
 * its SessionStart recap script reads ~/.obsidian-wiki whenever that folder exists (wiki-session-recap.sh), so it would
 * recap another vault (round 13, S1).
 */
function legacyShadow(home) {
  const legacy = path.join(home, '.obsidian-wiki');
  let dir = false;
  try { dir = fs.statSync(legacy).isDirectory(); } catch (_) { dir = false; }
  const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
  return dir && real(configDir(home)) !== real(legacy) ? legacy : null; // a link to the XDG folder is that folder (round 14)
}
const shadowNote = (home, legacy) => { const l = legacyWhy(home, legacy); return `${l.why}; ${l.step}, then run setup again`; };
/** Whether uv's record names `bin` as the command it installed, or names none (round 13, R2). */
function receiptBinIs(home, bin) {
  const u = uv(home);
  const dir = u ? uvToolDir(u) : null;
  let text = '';
  try { text = fs.readFileSync(path.join(dir || '', 'obsidian-wiki', 'uv-receipt.toml'), 'utf8'); } catch (_) { return true; }
  const at = /install-path\s*=\s*"([^"]*obsidian-wiki(?:\.exe)?)"/.exec(text);
  return !at || path.resolve(at[1]) === path.resolve(bin);
}
/**
 * One entry of doctor's memory.wiki.clash row for a reader of doctor --json (round 15, R13): { path, problem, code? }, where
 * problem is `clash` (a skill of the person's that shares a name), `unreadable` (a skills folder or entry that cannot be
 * read) or `profiles-unreadable` (the Hermes profiles folder itself cannot be listed).
 */
function clashEntry(e) {
  const m = / could not be read \(([^)]*)\)$/.exec(e);
  if (!m) return { path: e, problem: 'clash' };
  const at = e.slice(0, m.index);
  return { path: at, problem: /[\\/]\.hermes[\\/]profiles$/.test(at) ? 'profiles-unreadable' : 'unreadable', code: m[1] };
}
/** The first five entries of a list and how many more, so a long list never pushes the rest of a fix out (round 13, R5). */
const capped = (list) => `${list.slice(0, 5).join(', ')}${list.length > 5 ? `, and ${list.length - 5} more` : ''}`;
/** What a clash asks for, the skills to move and the folders to repair each in their own words (round 13, P2). */
const clashVerb = (all) => {
  const skills = all.some((e) => !UNREADABLE.test(e));
  const bad = all.some((e) => UNREADABLE.test(e));
  return [skills ? 'move or rename the skills' : null, bad ? 'repair the folders' : null].filter(Boolean).join(' and ');
};
/** doctor's row for a config line obsidian-wiki's refresh would rewrite (round 13, S2). */
/** memory.wiki's fix while obsidian-wiki's config cannot be read: the wiki vault step first, never its text again (round 23, 3). */
const UNREAD_FIRST = (NPX) => `first make obsidian-wiki's config readable, or remove it, as the wiki vault step says; then ${NPX} setup`;
/** The reason an unreadable config gives for refusing an install or an upgrade, or null (round 23, 3). */
function unreadConfig(home) {
  const config = configOf(home);
  if (!config) return null;
  try { if (fs.statSync(config).isFile()) fs.readFileSync(config); else return null; } catch (error) { return error.code === 'ENOENT' ? null : `obsidian-wiki's config ${config} cannot be read (${error.code || error.message}), which stops obsidian-wiki's own commands; repair or remove it, then run setup again`; }
  return null;
}
const configFormRow = (form, NPX) => ({ id: 'memory.vault.config-form', state: 'warn', detail: configFormNote(form).replace(/(; (write it once|write the vault's|remove that line|save it with|save it as UTF-8|move the vault)|: save it without).*$/, ''),
  fix: form.form === CONFIG_FORMS.outside || removesLine(form) ? `remove the ${form.key} line from ${form.config}, then ${NPX} setup`
    : vaultRelative(form) ? `${vaultAbsStep(form.value)} in ${form.config}, then ${NPX} setup`
    : form.form === CONFIG_FORMS.apostrophe ? `${MOVE_APOS} in ${form.config}, then ${NPX} setup`
    : form.form === CONFIG_FORMS.relative ? `remove the ${form.key} line from ${form.config}, or write it as ${PKG_PATH}, then ${NPX} setup`
    : form.form === CONFIG_FORMS.quote ? `${MOVE_VAULT} in ${form.config}, then ${NPX} setup`
    : form.form === CONFIG_FORMS.utf8 ? `save ${form.config} as UTF-8, then ${NPX} setup`
    : form.form === CONFIG_FORMS.bom ? `save ${form.config} without a byte order mark, then ${NPX} setup`
      : !form.key ? `save ${form.config} with plain line endings (\\n) and no control characters, then ${NPX} setup`
        : `write ${form.key} once as ${form.key}="..." in ${form.config}, then ${NPX} setup`, gate: 'consent' });

/**
 * The package folder of the person's own obsidian-wiki, or null: the config's OBSIDIAN_WIKI_REPO names an existing
 * obsidian_wiki/_data folder outside uv's tool folder (a venv, pip --user, pipx), whose command is not on this PATH.
 * Installing uv's copy beside it would rewrite their config and relink every skill, and the two would fight (round 14, B2).
 */
function personalCopy(home, u) {
  const config = configOf(home);
  if (!config) return null;
  let text = '';
  try { text = fs.readFileSync(config, 'utf8'); } catch (_) { return null; }
  const m = /^OBSIDIAN_WIKI_REPO="?([^"\n]*)"?$/m.exec(text);
  const raw = m && expandHome(m[1].trim(), home); // ~ is this home (round 15, R8; round 19, R5)
  if (!raw || !path.isAbsolute(raw) || !/[\\/]obsidian_wiki[\\/]_data[\\/]?$/.test(raw)) return null; // a relative one is a config form
  const real = (p) => { try { return fs.realpathSync(p); } catch (_) { return path.resolve(p); } };
  const at = real(raw);
  try { if (!fs.statSync(at).isDirectory()) return null; } catch (_) { return null; }
  const inside = (dir) => !!dir && (at + path.sep).startsWith(real(dir) + path.sep);
  if (u ? inside(uvToolDir(u)) : inside(defaultUvToolDir(home))) return null;
  // uv's own copy wherever its tool folder is: the tool folder beside the package holds uv's record (round 15, R7).
  for (let d = path.dirname(at), n = 0; n < 8 && d !== path.dirname(d); d = path.dirname(d), n++) {
    if (path.basename(d) === 'obsidian-wiki' && fs.existsSync(path.join(d, 'uv-receipt.toml'))) return null;
  }
  return at;
}
/** uv's tool folder when uv is not there to say: UV_TOOL_DIR, else $XDG_DATA_HOME/uv/tools, else ~/.local/share/uv/tools. */
const defaultUvToolDir = (home) => process.env.UV_TOOL_DIR || (xdgAbs('XDG_DATA_HOME') ? path.join(xdgAbs('XDG_DATA_HOME'), 'uv', 'tools') : path.join(home, '.local', 'share', 'uv', 'tools'));
const ownNote = (at) => `your own obsidian-wiki (its package ${at}) is installed outside uv, and its command is not on this PATH; put its command folder on PATH: the launcher never installs another copy over it`;

/**
 * The vault obsidian-wiki's config names, or null: the one reader, for doctor and for the step that opens the vault in
 * Obsidian (round 16; round 17, 2). It reads OBSIDIAN_VAULT_PATH as obsidian-wiki's _read_config_value does (the first line
 * that starts with the key and =, the rest stripped of whitespace and double quotes), and gives null for an empty value and
 * whenever configForm names a form (then no path from that line is ever printed).
 */
function configuredVault(home) {
  const config = configOf(home);
  if (!config || configForm(home)) return null;
  let text;
  try { text = fs.readFileSync(config, 'utf8'); } catch (_) { return null; }
  const line = text.split('\n').find((l) => l.startsWith('OBSIDIAN_VAULT_PATH='));
  const value = line ? pyStrip(line.slice('OBSIDIAN_VAULT_PATH='.length)).replace(/^"+|"+$/g, '') : '';
  return value ? expandHome(value, home) : null; // ~ as obsidian-wiki's recap and doctor read it (round 18; round 19, R5)
}
// Python's str.strip(): the characters str.isspace() names, never JS's trim() (round 18, R11).
const PY_SPACE = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const pyStrip = (v) => String(v).replace(new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, 'g'), '');
/**
 * The vault the config's first OBSIDIAN_VAULT_PATH line names, whatever its form (spaced, exported, quoted, repeated, in a
 * file that is not UTF-8), or null: only to tell whether it is the vault the launcher made, never printed (round 18, 2).
 */
function vaultIdentity(home) {
  const config = configOf(home);
  if (!config) return null;
  let text;
  try { text = fs.readFileSync(config).toString('utf8'); } catch (_) { return null; }
  const m = text.split(/\r?\n/).map((l) => /^\s*(?:export\s+)?OBSIDIAN_VAULT_PATH\s*=(.*)$/.exec(l)).find(Boolean);
  const value = m ? pyStrip(m[1]).replace(/^["']+|["']+$/g, '') : '';
  return value ? expandHome(value, home) : null;
}

module.exports = { recapVault, recapCheck, xdgProblem, vaultWhy, expandHome, KEPT_APART, CONFIG_BREAKS, CONFIG_FORMS, cannotHold, vaultNote, configFormNote, configFormRow, configuredVault, personalCopy, PIN, UV_PAGE, REFRESH, NEVER, BROKEN, uvHolds, reinstallFix, configForm, venvPython, legacyShadow, HOOK_SCRIPTS, settingsLink, present, clashes, bundledSkills, skillFolders, receiptSpec, ALLOWED, toolBinDir, configDir, configFiles, configOf, onPath, tool, uv, uvRoute, gitNote, defaultVault, vaultProblem, fixFor, versionAgainstPin, hookState, hooksFile, checks, needs, install, hook, upgrade };
