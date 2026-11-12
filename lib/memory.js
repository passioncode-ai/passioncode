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
const ALLOWED = ['obsidian-wiki list', 'obsidian-wiki hooks install --only SessionStart', 'obsidian-wiki hooks status --json', 'obsidian-wiki doctor --json', 'uv tool update-shell', 'brew install uv',
  // The person's own choice on a Stop hook someone else registered (decision 4 of ADR-0006), gate consent.
  'obsidian-wiki hooks uninstall --only Stop'];
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
  if (name === 'session-hooks' && /^run: obsidian-wiki hooks install$/.test(String(check.hint || '').trim())) return 'run: obsidian-wiki hooks install --only SessionStart';
  return `obsidian-wiki reports ${name} ${check.status || 'warn'}: ${detail}; read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; ${NEVER}`;
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
    return rows;
  }
  // The leading x.y.z decides; the pin's own x.y.z with a suffix the launcher cannot order, or no version, is unknown:
  // a warning naming the pin, never a forced reinstall (it could take back a newer build).
  const stand = versionAgainstPin(t.version);
  if (stand === 'unknown') {
    add({ id: 'memory.wiki', state: 'warn', detail: !t.version ? `${catalog.WIKI.name} at ${t.bin}: its version could not be read; this launcher pins ${PIN}`
      : `${catalog.WIKI.name} ${t.version} (not a version this launcher compares); this launcher pins ${PIN}` });
  } else if (stand === 'behind') {
    // uv's own copy (in uv's folder, and uv lists it) is brought up by setup. One in uv's folder where uv is missing:
    // uv first (setup then brings it up if uv lists it). Any other is the person's to bring up (pipx, pip --user).
    const route = !t.uvs && t.inUvDir && !uv(home) ? uvRoute() : null;
    add({
      id: 'memory.wiki', state: 'warn', detail: `${catalog.WIKI.name} ${t.version}; this launcher pins ${PIN}`,
      fix: t.uvs ? `${NPX} setup` : route ? `${route.step}, then ${NPX} setup` : `bring it to ${PIN} with the tool that installed it (uv does not list it)`,
      gate: t.uvs ? null : route ? route.gate : 'consent',
      repair: t.uvs ? { kind: 'tool', product: 'wiki' } : null,
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
      const hints = [...new Set(bad.map((c) => fixFor(c, NPX)))]; // never obsidian-wiki's own hint (round 4)
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
        const fix = !linked ? 'obsidian-wiki hooks install --only SessionStart'
          : ours ? `${NPX} setup (it adds the entry in ${linked}, where the link ${hooksFile(home)} points, and keeps the link)`
            : `add obsidian-wiki's SessionStart entry (its command for ${HOOK_SCRIPTS.SessionStart}) to ${linked} by hand: ${hooksFile(home)} is a link there, which obsidian-wiki's own writer would replace with a plain file; ${NEVER}`;
        add({ id: 'memory.hooks', state: 'info', detail: `Claude Code starts a session without a recap of the wiki (obsidian-wiki's SessionStart hook is not registered)`, fix,
          repair: ours ? { kind: 'hook', product: 'wiki' } : null, gate: ours ? null : 'consent' });
      } else if (!h.reachable) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's SessionStart hook is registered but cannot reach the package, so it ends silently`, fix: fixFor({ name: 'session-hooks', status: 'warn', hint: h.hint, detail: 'registered, but it cannot reach the package' }, NPX) });
      else add({ id: 'memory.hooks', state: 'ok', detail: `Claude Code starts each session with a recap of the wiki (obsidian-wiki's SessionStart hook)` });
      // The Stop hook is never the launcher's: named as information, with its effect, for the person to keep or remove.
      if (h.stop) {
        add({ id: 'memory.hooks.stop', state: 'info', detail: `obsidian-wiki's Stop hook is registered: after every turn of every Claude Code session, in every project, it asks the agent to write into the wiki; the launcher never registers it`,
          fix: !linked ? 'obsidian-wiki hooks uninstall --only Stop' : `remove obsidian-wiki's Stop entry (its command for ${HOOK_SCRIPTS.Stop}) from ${linked} by hand: ${hooksFile(home)} is a link there, which obsidian-wiki's own writer would replace with a plain file; ${NEVER}`, gate: 'consent' });
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
  else if (need.vault && !need.problem) need.note = gitNote(platform);
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
  if (!linked) {
    const h = releases.run(b, ['hooks', 'install', '--only', 'SessionStart'], { timeout: 60000, input: '' });
    if (h.code !== 0) throw new Error(`obsidian-wiki hooks install --only SessionStart: ${lastLine(h)}`);
    return `registered obsidian-wiki's SessionStart recap for Claude Code`;
  }
  const file = hooksFile(home);
  const { doc, error } = permissions.load(file);
  if (error) throw new Error(error);
  const has = (d) => (((d.hooks || {}).SessionStart) || []).some((g) => ((g && g.hooks) || []).some((e) => String((e && e.command) || '').includes(HOOK_SCRIPTS.SessionStart)));
  if (has(doc)) return `obsidian-wiki's SessionStart recap is registered already in ${linked}`;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-hook-'));
  try {
    const h = releases.run(b, ['hooks', 'install', '--only', 'SessionStart'], { timeout: 60000, input: '', env: { ...process.env, HOME: scratch, USERPROFILE: scratch } });
    if (h.code !== 0) throw new Error(`obsidian-wiki hooks install --only SessionStart: ${lastLine(h)}`);
    let made;
    try { made = JSON.parse(fs.readFileSync(hooksFile(scratch), 'utf8')); } catch (e) { throw new Error(`obsidian-wiki hooks install --only SessionStart wrote no settings the launcher could read (${e.code || e.message})`); }
    const groups = (((made.hooks || {}).SessionStart) || []).filter((g) => has({ hooks: { SessionStart: [g] } }));
    if (!groups.length) throw new Error('obsidian-wiki hooks install --only SessionStart wrote no SessionStart entry');
    doc.hooks = doc.hooks && typeof doc.hooks === 'object' ? doc.hooks : {};
    doc.hooks.SessionStart = [...(Array.isArray(doc.hooks.SessionStart) ? doc.hooks.SessionStart : []), ...groups];
    permissions.write(file, doc);
  } finally { fs.rmSync(scratch, { recursive: true, force: true }); }
  return `registered obsidian-wiki's SessionStart recap for Claude Code in ${linked}, where the link ${file} points (the link stays)`;
}

/**
 * Bring obsidian-wiki up to the pin: `uv tool install --force obsidian-wiki==<pin>`, then the stale refresh (`obsidian-wiki
 * list`), which records the new version where setup did, keeping every other key of the config; the vault is not touched.
 */
function upgrade({ home, NPX = 'npx @passioncode-ai/passioncode@latest' }) {
  const u = uv(home);
  if (!u) throw new Error(`uv is not installed (${UV_PAGE})`);
  const before = tool(home);
  const r = releases.run(u, ['tool', 'install', '--force', `obsidian-wiki==${PIN}`], { timeout: 10 * 60 * 1000, input: '' });
  if (r.code !== 0) throw new Error(`uv tool install --force obsidian-wiki==${PIN}: ${lastLine(r)}`);
  const after = tool(home);
  if (!after || after.version !== PIN) throw new Error(`uv installed obsidian-wiki ${PIN}, but it reads ${after ? after.version || 'no version' : 'nothing'}`);
  if (configOf(home)) {
    // Its update check off: the run reaches no network for a notice nobody reads (OBSIDIAN_WIKI_NO_UPDATE_CHECK).
    const l = releases.run(after.bin, ['list'], { timeout: 120000, input: '', env: { ...process.env, OBSIDIAN_WIKI_NO_UPDATE_CHECK: '1' } });
    if (l.code !== 0) throw new Error(`obsidian-wiki list (it records the new version): ${lastLine(l)}`);
    // Its stale check could not refresh and asks for setup: never done, never followed (R2).
    if (/Run: obsidian-wiki setup/.test(l.err || '')) {
      throw new Error(`obsidian-wiki list did not record ${PIN} (it asks for obsidian-wiki setup); read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; ${NEVER}`);
    }
  }
  return before && versionAgainstPin(before.version) === 'behind'
    ? `brought ${catalog.WIKI.name} ${before.version} up to ${PIN}; the vault is as it was, and the config's other keys too`
    : `installed ${catalog.WIKI.name} ${PIN} with uv tool install --force; the vault is as it was, and the config's other keys too`;
}

/** Whether anything of the wiki memory is on this machine: obsidian-wiki answers, or an Obsidian.app is there (uninstall's line). */
function present(home) {
  if (tool(home)) return true;
  const ob = catalog.OBSIDIAN;
  return [catalog.appPath(ob, { home }), catalog.adminCopy(ob, { home })].some((p) => !!p && fs.existsSync(p));
}

module.exports = { PIN, UV_PAGE, REFRESH, NEVER, HOOK_SCRIPTS, settingsLink, present, ALLOWED, toolBinDir, configDir, configFiles, configOf, onPath, tool, uv, uvRoute, gitNote, defaultVault, vaultProblem, fixFor, versionAgainstPin, hookState, hooksFile, checks, needs, install, hook, upgrade };
