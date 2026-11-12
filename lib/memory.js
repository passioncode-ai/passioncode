'use strict';
/**
 * The agents' wiki memory (PC-178, ADR-0006): obsidian-wiki, an open-source tool (MIT, PyPI `obsidian-wiki`,
 * github.com/Ar9av/obsidian-wiki) agents read and write a vault with, pinned by this launcher release and installed with
 * uv; and the vault it keeps, made once for a user who has none. Obsidian, where a person reads the vault, is an app
 * (catalog.OBSIDIAN) and installs like one. Only the mechanics: the launcher never reads or writes what a vault holds,
 * never runs `obsidian-wiki setup` over an existing config (the operator's decision of 2026-11-12: it rewrote a person's
 * config), and never registers obsidian-wiki's Stop hook: from 2026.11 its setup registers one that wakes every editing
 * session in every project, after every turn, to write into the vault.
 */
const fs = require('fs');
const path = require('path');
const catalog = require('./catalog');
const releases = require('./releases');

const PIN = catalog.WIKI.pin;
const UV_PAGE = 'https://docs.astral.sh/uv/getting-started/installation/';
const exe = (name) => (process.platform === 'win32' ? `${name}.exe` : name);

/** Where uv puts a tool's command, in uv's own order: UV_TOOL_BIN_DIR, XDG_BIN_HOME, ~/.local/bin. */
function toolBinDir(home) { return process.env.UV_TOOL_BIN_DIR || process.env.XDG_BIN_HOME || path.join(home, '.local', 'bin'); }

/** obsidian-wiki's config files: the older ~/.obsidian-wiki/config, and ~/.config/obsidian-wiki/config that 2026.11 writes. */
function configFiles(home) {
  const xdg = (process.env.XDG_CONFIG_HOME || '').trim();
  return [path.join(home, '.obsidian-wiki', 'config'), path.join(xdg || path.join(home, '.config'), 'obsidian-wiki', 'config')];
}
/** The config this user has, or null: with one, nothing of theirs is set up again. */
function configOf(home) { return configFiles(home).find((f) => fs.existsSync(f)) || null; }

/**
 * The obsidian-wiki command and its version: by name on PATH first, else where uv puts it; null when neither answers.
 * `onPath` false means agents and its hooks cannot run it by name.
 */
function tool(home) {
  const read = (bin) => {
    const r = releases.run(bin, ['--version'], { timeout: 20000, input: '' });
    if (r.code === 127) return null;
    const m = /obsidian-wiki\s+(\d+\.\d+\.\d+\S*)/.exec(`${r.out}\n${r.err}`);
    return { bin, version: r.code === 0 && m ? m[1] : null };
  };
  const named = read('obsidian-wiki');
  if (named) return { ...named, onPath: true };
  const there = path.join(toolBinDir(home), exe('obsidian-wiki'));
  if (!fs.existsSync(there)) return null;
  const found = read(there);
  return found ? { ...found, onPath: false } : null;
}

/** The uv command, or null: by name on PATH, else where uv's installer puts it (UV_INSTALL_DIR, XDG_BIN_HOME, ~/.local/bin, ~/.cargo/bin). */
function uv(home) {
  if (releases.run('uv', ['--version'], { timeout: 15000 }).code === 0) return 'uv';
  const dirs = [process.env.UV_INSTALL_DIR, process.env.XDG_BIN_HOME, path.join(home, '.local', 'bin'), path.join(home, '.cargo', 'bin')].filter(Boolean);
  for (const dir of dirs) {
    const at = path.join(dir, exe('uv'));
    if (fs.existsSync(at) && releases.run(at, ['--version'], { timeout: 15000 }).code === 0) return at;
  }
  return null;
}

/** Whether uv installed obsidian-wiki (`uv tool list` names it): only then does `uv tool install --force` replace that copy. */
function managedByUv(uvBin) {
  const r = releases.run(uvBin, ['tool', 'list'], { timeout: 30000 });
  return r.code === 0 && /^obsidian-wiki v/m.test(r.out);
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
 * obsidian-wiki's own hint, made safe to follow: `obsidian-wiki setup` gains `--no-hooks` and `hooks install` gains
 * `--only SessionStart`, so following a hint never registers the Stop hook.
 */
function safeHint(hint) {
  let h = String(hint || '').trim();
  if (!h) return null;
  if (/obsidian-wiki setup\b/.test(h) && !/--no-hooks/.test(h)) h = h.replace(/obsidian-wiki setup\b/, 'obsidian-wiki setup --no-hooks');
  if (/obsidian-wiki hooks install\b/.test(h) && !/--only/.test(h)) h = h.replace(/obsidian-wiki hooks install\b/, 'obsidian-wiki hooks install --only SessionStart');
  return h;
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

/**
 * doctor's rows for the wiki memory (area `memory`). `claudeHere`: Claude Code's folder exists, the only agent whose
 * hooks obsidian-wiki registers. `newer(a, b)` is doctor's version order, passed in (doctor requires this module).
 */
function checks({ home, NPX, newer, claudeHere }) {
  const rows = [];
  const add = (c) => rows.push({ area: 'memory', product: 'wiki', fix: null, repair: null, gate: null, ...c });
  const t = tool(home);
  if (!t) {
    const u = uv(home);
    add({ id: 'memory.wiki', state: 'info', detail: `${catalog.WIKI.name} (the agents' wiki memory): not installed`, fix: u ? `${NPX} setup --with wiki` : `install uv (${UV_PAGE}), then ${NPX} setup --with wiki` });
    return rows;
  }
  const behind = !t.version || newer(PIN, t.version);
  if (behind) {
    const u = uv(home);
    const mine = !!u && managedByUv(u);
    const what = t.version ? `${catalog.WIKI.name} ${t.version}; this launcher pins ${PIN}` : `${catalog.WIKI.name} at ${t.bin}: its version could not be read; this launcher pins ${PIN}`;
    add({
      id: 'memory.wiki', state: 'warn', detail: what,
      fix: mine ? `${NPX} setup` : u ? `bring it to ${PIN} with the tool that installed it (uv did not)` : `install uv (${UV_PAGE}), then ${NPX} setup`,
      repair: mine ? { kind: 'tool', product: 'wiki' } : null,
    });
  } else {
    add({ id: 'memory.wiki', state: 'ok', detail: t.version === PIN ? `${catalog.WIKI.name} ${t.version} (pinned by this launcher)` : `${catalog.WIKI.name} ${t.version}, ahead of this launcher's pin ${PIN}; never taken back` });
  }
  if (!t.onPath) {
    add({ id: 'memory.wiki.path', state: 'warn', detail: `${catalog.WIKI.name} is in ${path.dirname(t.bin)}, which is not on your PATH, so agents and its hooks cannot run it by name`, fix: 'uv tool update-shell, then open a new terminal' });
  }

  const config = configOf(home);
  if (!config) {
    add({ id: 'memory.vault', state: 'info', detail: 'no wiki vault yet (obsidian-wiki has no config)', fix: `${NPX} setup --with wiki` });
  } else {
    const r = releases.run(t.bin, ['doctor', '--json'], { timeout: 60000, input: '' });
    let rep = null;
    try { rep = JSON.parse(r.out); } catch (_) { rep = null; }
    if (!rep || !Array.isArray(rep.checks)) {
      add({ id: 'memory.vault', state: 'warn', detail: `wiki vault: obsidian-wiki doctor could not be read (${(r.err || r.out || `exit ${r.code}`).trim().split('\n')[0]})`, fix: 'obsidian-wiki doctor' });
    } else {
      const bad = rep.checks.filter((c) => c && (c.status === 'fail' || c.status === 'warn'));
      const state = bad.some((c) => c.status === 'fail') ? 'fail' : bad.length ? 'warn' : 'ok';
      const vc = rep.checks.find((c) => c && c.name === 'vault-config' && c.status === 'pass');
      const where = vc && vc.detail ? vc.detail : config;
      const hints = [...new Set(bad.map((c) => safeHint(c.hint)).filter(Boolean))];
      add({
        id: 'memory.vault', state,
        detail: `wiki vault ${where}: ${state === 'ok' ? 'obsidian-wiki doctor passes' : bad.map((c) => `${c.name} ${c.status} (${c.detail})`).join('; ')}`,
        fix: state === 'ok' ? null : hints.join('; ') || 'obsidian-wiki doctor',
      });
    }
  }

  // The hooks of a set-up wiki (a config): a tool with no vault yet has nothing to recap.
  if (claudeHere && config) {
    const h = hookState(t.bin);
    if (h.error) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's hooks could not be read (${h.error})`, fix: 'obsidian-wiki hooks status' });
    else {
      if (!h.start) add({ id: 'memory.hooks', state: 'info', detail: `Claude Code starts a session without a recap of the wiki (obsidian-wiki's SessionStart hook is not registered)`, fix: 'obsidian-wiki hooks install --only SessionStart' });
      else if (!h.reachable) add({ id: 'memory.hooks', state: 'warn', detail: `obsidian-wiki's SessionStart hook is registered but cannot reach the package, so it ends silently`, fix: safeHint(h.hint) || 'obsidian-wiki hooks status' });
      else add({ id: 'memory.hooks', state: 'ok', detail: `Claude Code starts each session with a recap of the wiki (obsidian-wiki's SessionStart hook)` });
      // The Stop hook is never the launcher's: named as information, with its effect, for the person to keep or remove.
      if (h.stop) add({ id: 'memory.hooks.stop', state: 'info', detail: `obsidian-wiki's Stop hook is registered: after every turn of every Claude Code session, in every project, it asks the agent to write into the wiki; the launcher never registers it`, fix: 'obsidian-wiki hooks uninstall --only Stop', gate: 'consent' });
    }
  }
  return rows;
}

/** What setup would do for the memory: { tool, vault, uv, config, problem } (tool and vault: whether each is still to do). */
function needs(home, vault) {
  const t = tool(home);
  const config = configOf(home);
  return { tool: !t, vault: !config, uv: t ? null : uv(home), problem: config ? null : vaultProblem(vault) };
}

/**
 * Install obsidian-wiki at the pin when it is absent and, when this user has no config, make the vault: the folder,
 * `git init -b main` in it unless it is a repository, `obsidian-wiki setup --no-hooks --vault <dir>` with no terminal,
 * then (where Claude Code is) `obsidian-wiki hooks install --only SessionStart`. Returns what it did; throws on the
 * first step that fails, leaving the folder only when it held something before.
 */
function install({ home, vault, claudeHere, report = () => {} }) {
  const done = [];
  let t = tool(home);
  if (!t) {
    const u = uv(home);
    if (!u) throw new Error(`uv is not installed (${UV_PAGE}); nothing was installed`);
    const r = releases.run(u, ['tool', 'install', `obsidian-wiki==${PIN}`], { timeout: 10 * 60 * 1000, input: '' });
    if (r.code !== 0) throw new Error(`uv tool install obsidian-wiki==${PIN}: ${(r.err || r.out || `exit ${r.code}`).trim().split('\n').pop()}`);
    t = tool(home);
    if (!t || t.version !== PIN) throw new Error(`uv installed obsidian-wiki, but ${t ? `it reads ${t.version || 'no version'}` : 'it does not answer'}`);
    report(`installed ${catalog.WIKI.name} ${PIN} with uv`);
    done.push(`installed ${catalog.WIKI.name} ${PIN}`);
  }
  if (!configOf(home)) {
    const problem = vaultProblem(vault);
    if (problem) throw new Error(`${vault} ${problem}; no vault was made (choose another folder with --wiki-vault <dir>)`);
    const made = !fs.existsSync(vault);
    fs.mkdirSync(vault, { recursive: true });
    const undo = () => { if (made) { try { fs.rmdirSync(vault); } catch (_) { /* it holds what a step wrote: kept */ } } };
    if (!fs.existsSync(path.join(vault, '.git'))) {
      const g = releases.run('git', ['init', '-b', 'main', vault], { timeout: 60000, input: '' });
      if (g.code !== 0) { undo(); throw new Error(`git init -b main ${vault}: ${(g.err || g.out || `exit ${g.code}`).trim().split('\n')[0]}`); }
    }
    const s = releases.run(t.bin, ['setup', '--no-hooks', '--vault', vault], { timeout: 5 * 60 * 1000, input: '' });
    if (s.code !== 0 || !configOf(home)) throw new Error(`obsidian-wiki setup --no-hooks --vault ${vault}: ${(s.err || s.out || `exit ${s.code}`).trim().split('\n').pop()}`);
    report(`made the wiki vault ${vault} (a Git repository) with obsidian-wiki setup --no-hooks`);
    done.push(`made the wiki vault ${vault}`);
    if (claudeHere) {
      const h = releases.run(t.bin, ['hooks', 'install', '--only', 'SessionStart'], { timeout: 60000, input: '' });
      if (h.code !== 0) throw new Error(`obsidian-wiki hooks install --only SessionStart: ${(h.err || h.out || `exit ${h.code}`).trim().split('\n').pop()}`);
      done.push('registered its SessionStart recap for Claude Code');
    }
  }
  return done.join(', ');
}

/** Bring obsidian-wiki up to the pin: `uv tool install --force obsidian-wiki==<pin>`; its config and vault are not touched. */
function upgrade({ home }) {
  const u = uv(home);
  if (!u) throw new Error(`uv is not installed (${UV_PAGE})`);
  const before = tool(home);
  const r = releases.run(u, ['tool', 'install', '--force', `obsidian-wiki==${PIN}`], { timeout: 10 * 60 * 1000, input: '' });
  if (r.code !== 0) throw new Error(`uv tool install --force obsidian-wiki==${PIN}: ${(r.err || r.out || `exit ${r.code}`).trim().split('\n').pop()}`);
  const after = tool(home);
  if (!after || after.version !== PIN) throw new Error(`uv installed obsidian-wiki ${PIN}, but it reads ${after ? after.version || 'no version' : 'nothing'}`);
  return `brought ${catalog.WIKI.name} ${before && before.version ? `${before.version} ` : ''}up to ${PIN}; its config and vault are as they were`;
}

module.exports = { PIN, UV_PAGE, toolBinDir, configFiles, configOf, tool, uv, managedByUv, defaultVault, vaultProblem, safeHint, hookState, checks, needs, install, upgrade };
