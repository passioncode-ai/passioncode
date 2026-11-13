'use strict';
/**
 * PC-223: MCP servers across the Claude Code homes of this machine. Claude Code keeps each MCP server's OAuth sign-in
 * in the keychain item of the home it runs in (`Claude Code-credentials` for the default home,
 * `Claude Code-credentials-<hash>` for each home Fabric Switchboard launches), so a server signed in in one home
 * reads "needs authentication" in another, and a second name for the same URL in one home is a second sign-in.
 * doctor warns (never fails) on both:
 *  - `mcp.homes.duplicate`: two server names with one URL in one home, read from the home's `.claude.json`
 *    (`mcpServers`, user and per-project) and the `.mcp.json` of the plugins its `settings.json` enables;
 *  - `mcp.homes.signin`: a server signed in in some homes and not in others, read from Switchboard's read-only
 *    report (`switchboard mcp-homes --json`, SB-359: names, URLs and `signed_in`, no token). Until a Switchboard
 *    answers it, the row is `info` and says so. The keychain is never read.
 * It reads files and runs that one read-only command; it changes nothing.
 */
const fs = require('fs');
const path = require('path');

const SWITCHBOARD_DATA = 'ai.passioncode.fabric-switchboard';
const ADVICE = 'add each MCP server once under one name (the one its plugin brings where the plugin is enabled, else one `claude mcp add` entry); before reporting that a server needs authentication, read `switchboard_status` → `session.mode` to see which home the session runs in, and sign in there once';

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; }
}

/** Switchboard's data folder: PASSIONCODE_SWITCHBOARD_DATA, else the app's own place on each system. */
function switchboardData(home, platform) {
  if (process.env.PASSIONCODE_SWITCHBOARD_DATA) return process.env.PASSIONCODE_SWITCHBOARD_DATA;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', SWITCHBOARD_DATA);
  if (platform === 'win32') return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), SWITCHBOARD_DATA);
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), SWITCHBOARD_DATA);
}

/**
 * The Claude Code homes: the default one (`claudeDir` with `claudeJson`, as the launcher finds them) and every home
 * under Switchboard's `homes/` that holds a `.claude.json`. { id, label, dir, claudeJson }.
 */
function claudeHomes({ home, platform, claudeDir, claudeJson }) {
  const homes = [{ id: 'default', label: 'the default home', dir: claudeDir, claudeJson }];
  const root = path.join(switchboardData(home, platform), 'homes');
  let names = [];
  try { names = fs.readdirSync(root).sort(); } catch (_) { /* no Switchboard homes */ }
  for (const name of names) {
    const dir = path.join(root, name);
    const file = path.join(dir, '.claude.json');
    if (!fs.existsSync(file)) continue;
    homes.push({ id: name, label: `Switchboard home ${name.slice(0, 8)}`, dir, claudeJson: file });
  }
  return homes;
}

/** A URL as one server is told from another: scheme and host in lower case, no trailing slash, no fragment. */
function normUrl(u) {
  try {
    const x = new URL(u);
    return `${x.protocol}//${x.host.toLowerCase()}${x.pathname.replace(/\/+$/, '')}${x.search}`;
  } catch (_) { return String(u).trim().replace(/\/+$/, ''); }
}

const urlOf = (e) => (e && typeof e === 'object' && typeof (e.url || e.httpUrl) === 'string' ? e.url || e.httpUrl : null);

/** The MCP servers a plugin declares: its `.mcp.json` (flat or under `mcpServers`), else `mcpServers` in plugin.json. */
function pluginServers(installPath) {
  const mcp = readJson(path.join(installPath, '.mcp.json'));
  if (mcp && typeof mcp === 'object') return mcp.mcpServers && typeof mcp.mcpServers === 'object' ? mcp.mcpServers : mcp;
  const manifest = readJson(path.join(installPath, '.claude-plugin', 'plugin.json'));
  return manifest && manifest.mcpServers && typeof manifest.mcpServers === 'object' ? manifest.mcpServers : {};
}

/**
 * One home's URL servers: { global: [{ name, url, from }], projects: { <folder>: [...] }, unreadable }. Global ones load in
 * every session of the home (user scope and enabled plugins); a project's load only in sessions in that folder.
 */
function homeServers(h) {
  const out = { global: [], projects: {}, unreadable: null };
  const doc = readJson(h.claudeJson);
  if (!doc) { out.unreadable = h.claudeJson; return out; }
  for (const [name, e] of Object.entries(doc.mcpServers || {})) {
    const url = urlOf(e);
    if (url) out.global.push({ name, url: normUrl(url), from: 'user' });
  }
  for (const [folder, p] of Object.entries(doc.projects || {})) {
    for (const [name, e] of Object.entries((p && p.mcpServers) || {})) {
      const url = urlOf(e);
      if (url) (out.projects[folder] = out.projects[folder] || []).push({ name, url: normUrl(url), from: 'local' });
    }
  }
  const settings = readJson(path.join(h.dir, 'settings.json')) || {};
  const installed = (readJson(path.join(h.dir, 'plugins', 'installed_plugins.json')) || {}).plugins || {};
  for (const [key, on] of Object.entries(settings.enabledPlugins || {})) {
    if (on !== true || !Array.isArray(installed[key])) continue;
    const entry = installed[key].find((x) => x && x.scope === 'user') || installed[key][0];
    if (!entry || typeof entry.installPath !== 'string') continue;
    const plugin = key.split('@')[0];
    for (const [server, e] of Object.entries(pluginServers(entry.installPath))) {
      const url = urlOf(e);
      if (url) out.global.push({ name: `plugin:${plugin}:${server}`, url: normUrl(url), from: 'plugin' });
    }
  }
  return out;
}

/** URLs with two or more names among `servers`, each as { url, names }; `must` keeps only groups holding one of those names. */
function sameUrl(servers, must) {
  const by = new Map();
  for (const s of servers) {
    if (!by.has(s.url)) by.set(s.url, new Set());
    by.get(s.url).add(s.name);
  }
  return [...by].filter(([, names]) => names.size > 1 && (!must || [...names].some((n) => must.has(n))))
    .map(([url, names]) => ({ url, names: [...names].sort() }));
}

/** Every home's duplicates: [{ home, label, url, names, folder? }]; a project's only where its own entry is one of them. */
function duplicates(homes) {
  const found = [];
  const unreadable = [];
  for (const h of homes) {
    const s = homeServers(h);
    if (s.unreadable) { if (h.id === 'default' && fs.existsSync(h.claudeJson)) unreadable.push(h.claudeJson); continue; }
    for (const d of sameUrl(s.global)) found.push({ home: h.id, label: h.label, ...d });
    for (const [folder, list] of Object.entries(s.projects)) {
      for (const d of sameUrl([...s.global, ...list], new Set(list.map((x) => x.name)))) found.push({ home: h.id, label: h.label, folder, ...d });
    }
  }
  return { found, unreadable };
}

const listed = (items, n = 5) => (items.length > n ? `${items.slice(0, n).join('; ')} and ${items.length - n} more` : items.join('; '));

/**
 * Switchboard's sign-in report, read tolerantly: { homes: [{ id, label?, servers: [{ name, url?, signed_in }] }] }.
 * null when it does not have that shape.
 */
function readReport(doc) {
  const homes = doc && Array.isArray(doc.homes) ? doc.homes : null;
  if (!homes) return null;
  const out = [];
  for (const h of homes) {
    if (!h || typeof h !== 'object' || !Array.isArray(h.servers)) return null;
    const id = String(h.id || h.home || h.label || out.length);
    out.push({
      id, label: h.default === true || id === 'default' ? 'the default home' : String(h.label || `home ${id.slice(0, 8)}`),
      servers: h.servers.filter((s) => s && typeof s.name === 'string' && typeof s.signed_in === 'boolean')
        .map((s) => ({ name: s.name, key: typeof s.url === 'string' ? normUrl(s.url) : s.name, signedIn: s.signed_in })),
    });
  }
  return out;
}

/** Servers signed in in some homes and not in others: [{ name, signed: [labels], not: [labels] }]. */
function signinGaps(report) {
  const by = new Map();
  for (const h of report) {
    for (const s of h.servers) {
      if (!by.has(s.key)) by.set(s.key, { names: new Set(), signed: [], not: [] });
      const g = by.get(s.key);
      g.names.add(s.name);
      (s.signedIn ? g.signed : g.not).push(h.label);
    }
  }
  return [...by.values()].filter((g) => g.signed.length && g.not.length)
    .map((g) => ({ name: [...g.names].sort().join(' / '), signed: [...new Set(g.signed)], not: [...new Set(g.not)] }));
}

/**
 * doctor's rows (area `mcp`). `run(bin, args, opts)` runs a command ({ code, out, err }); `switchboardBin` is the CLI to
 * ask, or null when there is none.
 */
function checks({ home, platform, claudeDir, claudeJson, run, switchboardBin }) {
  const rows = [];
  const homes = claudeHomes({ home, platform, claudeDir, claudeJson });
  const where = homes.length > 1 ? `${homes.length} Claude Code homes (the default one and ${homes.length - 1} of Switchboard's)` : 'the default Claude Code home';

  const { found, unreadable } = duplicates(homes);
  if (found.length) {
    const say = found.map((d) => `${d.label}${d.folder ? ` in ${d.folder}` : ''}: ${d.names.join(', ')} (${d.url})`);
    rows.push({
      id: 'mcp.homes.duplicate', area: 'mcp', state: 'warn',
      detail: `one MCP URL under two names in one home, each signed in on its own: ${listed(say)}`,
      fix: `keep one name per URL in each home and remove the other entry there (\`claude mcp remove <name>\` with CLAUDE_CONFIG_DIR set to that home, or turn the plugin off); ${ADVICE}`,
      entries: found.map((d) => ({ home: d.home, folder: d.folder || null, url: d.url, names: d.names })),
    });
  } else {
    rows.push({ id: 'mcp.homes.duplicate', area: 'mcp', state: 'ok', detail: `no MCP URL under two names in ${where}${unreadable.length ? ` (${unreadable.join(', ')} could not be read)` : ''}` });
  }

  if (homes.length < 2) return rows; // one home: a sign-in cannot differ between homes
  const unmeasured = (why) => rows.push({ id: 'mcp.homes.signin', area: 'mcp', state: 'info', detail: `MCP sign-in by home: not measured, ${why}; doctor never reads the keychain`, fix: ADVICE });
  if (!switchboardBin) { unmeasured('no `switchboard` command found'); return rows; }
  const r = run(switchboardBin, ['mcp-homes', '--json'], { timeout: 15000, input: '' });
  if (!r || r.code !== 0) { unmeasured('this Switchboard has no read-only `switchboard mcp-homes --json` report yet, SB-359'); return rows; }
  let doc = null;
  try { doc = JSON.parse(r.out); } catch (_) { /* below */ }
  const report = readReport(doc);
  if (!report) { unmeasured('`switchboard mcp-homes --json` answered a shape doctor does not read'); return rows; }
  const gaps = signinGaps(report);
  if (!gaps.length) {
    rows.push({ id: 'mcp.homes.signin', area: 'mcp', state: 'ok', detail: `every MCP server is signed in in all ${report.length} homes Switchboard reports, or in none` });
    return rows;
  }
  rows.push({
    id: 'mcp.homes.signin', area: 'mcp', state: 'warn',
    detail: `MCP sign-in differs between Claude Code homes: ${listed(gaps.map((g) => `${g.name} signed in in ${g.signed.length} of ${g.signed.length + g.not.length} (not in ${listed(g.not, 3)})`))}`,
    fix: `sign in once in each home where a session needs the server (a sign-in in one home never reaches another); ${ADVICE}`,
    gate: 'sign-in',
    entries: gaps,
  });
  return rows;
}

module.exports = { checks, claudeHomes, homeServers, duplicates, readReport, signinGaps, normUrl, switchboardData, ADVICE };
