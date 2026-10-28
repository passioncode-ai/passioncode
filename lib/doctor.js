'use strict';
/**
 * `passioncode doctor`: reads the whole PassionCode.ai setup of this machine and names, for every
 * check, its state, the exact fix and what setup may repair (ADR-0004). It changes nothing: the only
 * processes it starts are the registered stdio MCP servers for one proving call each (never Fabric's,
 * which enrols a session when it starts), stopped when the call returns, and on Windows three
 * read-only `reg query` calls for the apps' uninstall entries (PC-86). `doctor --fix` is setup's
 * repair half (lib/setup.js), not this module.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const L = require('./launcher');
const catalog = require('./catalog');
const releases = require('./releases');
const W = require('./windows-apps');
const { probe } = require('./mcp-probe');

const PKG = (() => { try { return require('../package.json').version; } catch (_) { return '0.0.0'; } })();
const NPX = 'npx @passioncode-ai/passioncode@latest';

function servicesDir(home, platform) {
  if (process.env.PASSIONCODE_SERVICES_DIR) return process.env.PASSIONCODE_SERVICES_DIR;
  if (process.env.FABRIC_SERVICES_DIR) return process.env.FABRIC_SERVICES_DIR;
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'ai.passioncode.fabric', 'services');
  if (platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'passioncode-fabric', 'services');
  return path.join(process.env.XDG_DATA_HOME || path.join(home, '.local', 'share'), 'passioncode-fabric', 'services');
}

/** Agents present on this machine: Claude Code by its CLI, the rest by their config directory. */
function presentAgents(home, claude) {
  const files = Object.fromEntries(L.mcpFileTargets(home).map((t) => [t.id, t]));
  return catalog.AGENTS.filter((a) => (a.id === 'claude' ? claude.available() : fs.existsSync(files[a.id].dir)))
    .map((a) => ({ ...a, target: files[a.id] || null }));
}

/** The MCP entry an agent has for `name`: { command, args, env } | { url } | { plugin } | null. */
function mcpEntryOf(agent, name, home, { claudePlugin, installedIds }) {
  if (agent.id === 'claude') {
    if (claudePlugin && installedIds.some((id) => id.startsWith(claudePlugin))) return { plugin: claudePlugin.replace(/@$/, '') };
    let doc = {};
    try { doc = L.readSettings(path.join(home, '.claude.json')).doc; } catch (_) { return { unreadable: path.join(home, '.claude.json') }; }
    const e = (doc.mcpServers || {})[name];
    return e ? normalise(e) : null;
  }
  const t = agent.target;
  if (t.kind === 'toml') {
    let text = '';
    try { text = fs.readFileSync(t.file, 'utf8'); } catch (_) { return null; }
    const range = L.tomlTableRange(text, name);
    if (!range) return L.tomlMentions(text, name) ? { unparsed: t.file } : null;
    const command = L.tomlTableCommand(range);
    let args = [];
    for (let i = range.start + 1; i < range.end; i++) {
      const m = /^\s*args\s*=\s*(\[.*\])\s*(?:#.*)?$/.exec(range.lines[i]);
      if (m) { try { args = JSON.parse(m[1].replace(/'/g, '"')); } catch (_) { args = null; } }
      const u = /^\s*url\s*=\s*("(?:[^"\\]|\\.)*")/.exec(range.lines[i]);
      if (u) return { url: JSON.parse(u[1]) };
    }
    return command ? { command, args: args || [], env: {} } : { unparsed: t.file };
  }
  let doc = {};
  try { doc = L.readSettings(t.file).doc; } catch (_) { return fs.existsSync(t.file) ? { unreadable: t.file } : null; }
  const e = (doc.mcpServers || {})[name];
  return e ? normalise(e) : null;
}

function normalise(e) {
  if (!e || typeof e !== 'object') return { unparsed: true };
  if (e.url || e.httpUrl) return { url: e.url || e.httpUrl };
  if (e.command) return { command: e.command, args: Array.isArray(e.args) ? e.args : [], env: e.env && typeof e.env === 'object' ? e.env : {} };
  return { unparsed: true };
}

async function wellKnown(origin) {
  let u;
  try { u = new URL('/.well-known/fabric-service', origin); } catch (_) { return { ok: false, reason: `origin ${origin} is not a URL` }; }
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)) return { ok: null, reason: `remote origin ${u.origin}: not probed` };
  try {
    const res = await fetch(u, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    const doc = await res.json();
    return { ok: true, status: doc.status || 'ok', degraded: Array.isArray(doc.degraded) ? doc.degraded.map((d) => d.source || d.code || 'unnamed').slice(0, 5) : [], version: doc.service && doc.service.version };
  } catch (error) { return { ok: false, reason: error.name === 'TimeoutError' ? 'no answer within 5 s' : error.message }; }
}

const newer = (a, b) => { const pa = a.split(/[.-]/).map(Number), pb = b.split(/[.-]/).map(Number); for (let i = 0; i < 3; i++) if (pa[i] !== pb[i]) return pa[i] > pb[i]; return false; };

async function collect({ home, platform, claude, online }) {
  const checks = [];
  // `repair` is what setup (and doctor --fix) may do about a check: { kind: 'update' } (the skill
  // set and the bundled MCP registrations), { kind: 'replace', product } (a verified reinstall of an
  // app nobody is running), { kind: 'kickstart', label } (launchd starts a stopped service). A check
  // without one leaves its `fix` to the agent or the person.
  const add = (c) => { checks.push({ fix: null, repair: null, product: null, ...c }); };
  const UPDATE = { kind: 'update' };
  const p = L.paths(home);

  // Prerequisites and agents.
  const major = Number(process.versions.node.split('.')[0]);
  add({ id: 'prereq.node', area: 'prerequisites', state: major >= 18 ? 'ok' : 'fail', detail: `Node ${process.versions.node}${major >= 18 ? '' : ' — 18 or newer is needed'}`, fix: major >= 18 ? null : 'install Node 18+ from https://nodejs.org' });
  const agents = presentAgents(home, claude);
  add({ id: 'prereq.agents', area: 'prerequisites', state: agents.length ? 'ok' : 'warn', detail: agents.length ? `coding agents: ${agents.map((a) => a.name).join(', ')}` : 'no coding agent found (Claude Code, Codex CLI, Gemini CLI or Kimi Code)', fix: agents.length ? null : 'install Claude Code: npm install -g @anthropic-ai/claude-code' });

  // The skill set.
  const s = L.status({ home, claude });
  if (!s.installed) {
    add({ id: 'skills.installed', area: 'skills', state: 'fail', detail: 'the PassionCode.ai skill set is not installed', fix: `${NPX} setup`, repair: UPDATE });
  } else {
    const behind = s.package && /^\d+\.\d+\.\d+$/.test(s.package) && newer(s.package, s.installed);
    add({ id: 'skills.installed', area: 'skills', state: behind ? 'warn' : 'ok', detail: `skill set ${s.installed}${behind ? `; this launcher carries ${s.package}` : ''}`, fix: behind ? `${NPX} setup` : null, repair: behind ? UPDATE : null });
    for (const m of s.members) {
      const hubOk = m.hub.filter((h) => h.ok).length;
      const problems = [];
      if (m.claude === 'missing') problems.push('not installed as a Claude Code plugin');
      if (hubOk < m.hub.length) problems.push(`hub ${hubOk}/${m.hub.length}`);
      if (m.shadows.length) problems.push(`shadowed by ~/.claude/skills/${m.shadows.join(', ')}`);
      if (m.legacy.length) problems.push(`a second copy from ${m.legacy.join(', ')}`);
      add({ id: `skills.${m.name}`, area: 'skills', state: problems.length ? 'fail' : 'ok', detail: `${m.name} ${m.version}: ${problems.length ? problems.join('; ') : `claude: ${m.claude}, hub ${hubOk}/${m.hub.length}`}`, fix: problems.length ? `${NPX} setup` : null, repair: problems.length ? UPDATE : null });
    }
  }

  // The apps.
  const installedIds = Object.keys((() => { try { return JSON.parse(fs.readFileSync(path.join(p.claudePlugins, 'installed_plugins.json'), 'utf8')).plugins || {}; } catch (_) { return {}; } })());
  const cacheFile = path.join(p.state, 'releases-cache.json');
  const probes = new Map();
  let docker = null;
  let windowsEntries = null; // the uninstall entries, read once (three `reg query` calls)
  for (const pr of catalog.PRODUCTS) {
    const at = catalog.appPath(pr);
    const installed = platform === 'darwin' && fs.existsSync(at);
    const label = `${pr.name}${pr.preview ? ' (early preview)' : ''}`;
    if (platform === 'win32') {
      // PC-86: presence and version from the installer's own records; setup installs nothing here.
      if (!windowsEntries) {
        windowsEntries = W.readUninstallEntries(releases.run);
        for (const u of windowsEntries.unread) add({ id: `apps.registry.${u.hive.split('\\')[0].toLowerCase()}${u.hive.includes('WOW6432Node') ? '-wow64' : ''}`, area: 'apps', state: 'warn', detail: `could not read ${u.hive} (${u.why}); an app installed for every user may show as not installed` });
      }
      const found = W.findWindowsApp(pr, { entries: windowsEntries.entries, home });
      if (!found) {
        add({ id: `app.${pr.id}`, area: 'apps', product: pr.id, state: 'info', detail: `${label}: not installed`, fix: `download it from ${pr.page}` });
      } else {
        let latest = null, latestErr = null;
        if (online) { try { latest = await releases.latestRelease(pr, { cacheFile }); } catch (error) { latestErr = error.message; } }
        const outdated = latest && found.version && newer(latest.version, found.version);
        add({
          id: `app.${pr.id}`, area: 'apps', product: pr.id, state: outdated || (!latest && online) ? 'warn' : 'ok',
          detail: `${label} ${found.version || '(version unknown)'}${found.at ? ` in ${found.at}` : ''}${latest ? (outdated ? `; ${latest.version} is out` : found.version ? ' (latest)' : `; the latest is ${latest.version}`) : online ? `; latest unknown (${latestErr})` : '; latest not checked (--offline)'}`,
          fix: outdated ? `install ${latest.version} from ${pr.page} (or accept the update ${pr.name} offers)` : null,
        });
      }
    } else if (platform !== 'darwin') {
      add({ id: `app.${pr.id}`, area: 'apps', product: pr.id, state: 'info', detail: `${label}: app checks run on macOS and Windows; on this system download it from ${pr.page}` });
    } else if (!installed) {
      add({ id: `app.${pr.id}`, area: 'apps', product: pr.id, state: 'info', detail: `${label}: not installed`, fix: `${NPX} setup --with ${pr.id}` });
    } else {
      const version = releases.appVersion(at);
      let latest = null, latestErr = null;
      if (online) { try { latest = await releases.latestRelease(pr, { cacheFile }); } catch (error) { latestErr = error.message; } }
      const outdated = latest && version && newer(latest.version, version);
      const running = releases.isRunning(at); // the app, or an agent's MCP server running from its bundle
      add({
        id: `app.${pr.id}`, area: 'apps', product: pr.id, state: outdated || (!latest && online) ? 'warn' : 'ok',
        detail: `${label} ${version || '?'}${latest ? (outdated ? `; ${latest.version} is out` : ' (latest)') : online ? `; latest unknown (${latestErr})` : '; latest not checked (--offline)'}`,
        fix: outdated ? (running ? `quit ${pr.name}, then run \`${NPX} setup\` (or accept the update ${pr.name} offers)` : `${NPX} setup`) : null,
        repair: outdated && !running ? { kind: 'replace', product: pr.id } : null,
      });
      const v = releases.verifyApp(at, { gatekeeper: false });
      add({ id: `app.${pr.id}.signature`, area: 'apps', product: pr.id, state: v.ok ? 'ok' : 'fail', detail: `${pr.name}: ${v.checks.map((c) => `${c.check} ${c.ok ? 'ok' : `FAILED (${c.detail})`}`).join(', ')}`, fix: v.ok ? null : (running ? `quit ${pr.name}, then run \`${NPX} setup\`` : `${NPX} setup`), repair: !v.ok && !running ? { kind: 'replace', product: pr.id } : null });
      add({ id: `app.${pr.id}.running`, area: 'apps', product: pr.id, state: 'info', detail: `${pr.name}: ${running ? 'in use (the app, or an agent\'s MCP server from its bundle)' : 'not running (it starts when opened)'}`, fix: running ? null : `open "${at}" — or ask this machine's app supervisor to start it` });
      if (pr.needs && pr.needs.includes('docker')) {
        docker = docker || releases.run('docker', ['info', '--format', '{{.ServerVersion}}'], { timeout: 15000 });
        const missing = docker.code === 127;
        add({ id: 'prereq.docker', area: 'prerequisites', product: pr.id, state: docker.code === 0 ? 'ok' : missing ? 'fail' : 'warn', detail: docker.code === 0 ? `Docker answers (server ${docker.out.trim()})` : missing ? 'Docker is not installed — Fabric needs it' : 'Docker is installed but not running — Fabric needs it running', fix: docker.code === 0 ? null : missing ? 'install OrbStack (https://orbstack.dev) or Docker Desktop, then start it' : 'start OrbStack or Docker Desktop before you open Fabric' });
      }
      if (pr.needs && pr.needs.includes('supabase')) {
        const sb = releases.run('supabase', ['--version'], { timeout: 15000 });
        add({ id: 'prereq.supabase', area: 'prerequisites', product: pr.id, state: sb.code === 0 ? 'ok' : 'fail', detail: sb.code === 0 ? `Supabase CLI ${sb.out.trim()}` : 'Supabase CLI not found — Fabric needs it', fix: sb.code === 0 ? null : 'brew install supabase/tap/supabase' });
      }
    }

    // MCP: each present agent's entry for this product.
    const m = pr.mcp;
    if (!m) continue;
    for (const agent of agents) {
      const entry = mcpEntryOf(agent, m.name, home, { claudePlugin: m.claudePlugin, installedIds });
      const id = `mcp.${agent.id}.${m.name}`;
      const bundled = catalog.mcpCommand(pr, agent);
      if (!entry) {
        if (!installed) continue;
        // Only the product's own guide can add it (a virtualenv, a remote server): a warning, not a failure.
        if (m.external) add({ id, area: 'mcp', product: pr.id, state: 'warn', detail: `${agent.name}: no ${m.name} MCP server yet`, fix: pr.guide });
        else if (!bundled) add({ id, area: 'mcp', product: pr.id, state: 'info', detail: `${agent.name}: ${pr.name} has no runner for it` });
        else add({ id, area: 'mcp', product: pr.id, state: 'fail', detail: `${agent.name}: ${m.name} is not registered`, fix: `${NPX} setup`, repair: UPDATE });
        continue;
      }
      if (entry.plugin) { add({ id, area: 'mcp', product: pr.id, state: 'ok', detail: `${agent.name}: ${m.name} served by its ${entry.plugin} plugin` }); continue; }
      if (entry.unreadable || entry.unparsed) { add({ id, area: 'mcp', product: pr.id, state: 'warn', detail: `${agent.name}: ${m.name} is declared in a form doctor does not read` }); continue; }
      if (entry.url) {
        add({ id, area: 'mcp', product: pr.id, state: 'info', detail: `${agent.name}: ${m.name} is a remote server; its own guide proves it`, fix: pr.id === 'inbox' ? 'your agent runs the Fabric Inbox onboard guide\'s `prove` step' : null });
        continue;
      }
      if (path.isAbsolute(entry.command) && !fs.existsSync(entry.command)) {
        add({ id, area: 'mcp', product: pr.id, state: 'fail', detail: `${agent.name}: ${m.name} points at ${entry.command}, which does not exist`, fix: installed ? `remove that entry from ${agent.name}, then ${NPX} doctor --fix` : `${NPX} setup --with ${pr.id}` });
        continue;
      }
      if (pr.mcp.spawn === false) {
        const exec = (() => { try { fs.accessSync(entry.command, fs.constants.X_OK); return true; } catch (_) { return !path.isAbsolute(entry.command); } })();
        const runner = entry.args.includes('--runner');
        add({
          id, area: 'mcp', product: pr.id, state: exec && runner ? 'ok' : 'fail',
          detail: `${agent.name}: ${m.name} ${exec && runner ? 'registered; doctor does not start it (it enrols a session) — your agent\'s first fabric_whoami proves it' : !exec ? `points at ${entry.command}, which cannot run` : 'is registered without --runner, so it exits at start'}`,
          fix: exec && runner ? null : `remove that entry from ${agent.name}, then ${NPX} setup`,
        });
        continue;
      }
      const key = JSON.stringify([entry.command, entry.args]);
      if (!probes.has(key)) probes.set(key, { product: pr, entry, agents: [] });
      probes.get(key).agents.push({ agent, id });
    }
  }

  // One proving call per distinct registered command.
  const results = await Promise.all([...probes.values()].map(async (t) => {
    const tool = t.product.mcp.prove ? t.product.mcp.prove.tool : false;
    const r = await probe({ command: t.entry.command, args: t.entry.args, env: t.entry.env, cwd: home, tool, toolArgs: (t.product.mcp.prove || {}).args, version: PKG });
    return { t, r, tool };
  }));
  for (const { t, r, tool } of results) {
    for (const { agent, id } of t.agents) {
      const what = tool ? `${tool} answered` : 'initialize answered (its first real call is the agent\'s)';
      add({
        id, area: 'mcp', product: t.product.id, state: r.ok ? 'ok' : 'fail',
        detail: `${agent.name}: ${t.product.mcp.name} — ${r.ok ? `${what}${r.server ? ` (${r.server.name} ${r.server.version || ''})`.replace(' )', ')') : ''}${r.tools !== null && r.tools !== undefined ? `, ${r.tools} tools` : ''}` : `proving call failed: ${r.reason}`}`,
        fix: r.ok ? null : `open ${t.product.name}, then run doctor again; if it still fails, reinstall it from ${t.product.page}`,
      });
    }
  }

  // Fabric services of the family products: the descriptor and its well-known document.
  const dir = servicesDir(home, platform);
  let descriptors = [];
  try { descriptors = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch (_) { descriptors = []; }
  for (const pr of catalog.PRODUCTS.filter((x) => x.serviceIds)) {
    const mine = descriptors.map((f) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return null; } })
      .filter((d) => d && pr.serviceIds.includes(d.id));
    const installed = platform === 'darwin' ? fs.existsSync(catalog.appPath(pr)) : true;
    if (!mine.length) {
      if (installed && platform === 'darwin') add({ id: `service.${pr.id}`, area: 'services', product: pr.id, state: 'warn', detail: `${pr.name}: no Fabric service descriptor in ${dir}`, fix: pr.guide });
      continue;
    }
    for (const d of mine) {
      const w = await wellKnown(d.origin);
      const supervisor = d.lifecycle ? `${d.lifecycle.manager || 'its supervisor'}${d.lifecycle.label ? ` ${d.lifecycle.label}` : ''}` : 'its supervisor';
      const doctorCmd = d.commands && Array.isArray(d.commands.doctor) ? d.commands.doctor.map((x) => (/\s/.test(x) ? `"${x}"` : x)).join(' ') : null;
      add({
        id: `service.${d.id}.${d.instance || 'default'}`, area: 'services', product: pr.id,
        state: w.ok === true ? (w.status === 'ok' ? 'ok' : 'warn') : w.ok === null ? 'info' : 'fail',
        detail: `${d.name || d.id}: ${w.ok ? `answers at ${d.origin}${w.version ? ` (${w.version})` : ''}, status ${w.status}${w.degraded.length ? ` — degraded: ${w.degraded.join(', ')}` : ''}` : w.reason}`,
        fix: w.ok === false ? `${supervisor} restarts it — never kill it by hand${doctorCmd ? `; diagnose with ${doctorCmd}` : ''}` : (w.ok && w.status !== 'ok' && doctorCmd ? doctorCmd : null),
        repair: w.ok === false && platform === 'darwin' && d.lifecycle && d.lifecycle.manager === 'launchd' && d.lifecycle.label ? { kind: 'kickstart', label: d.lifecycle.label } : null,
      });
    }
  }
  return checks;
}

function summarise(checks) {
  const count = (st) => checks.filter((c) => c.state === st).length;
  return { ok: count('ok'), warn: count('warn'), fail: count('fail'), info: count('info') };
}

/** Run the checks (read-only) and save the summary for the session hook. */
async function doctor({ home = os.homedir(), online = true, platform = process.env.PASSIONCODE_PLATFORM || process.platform, claude } = {}) {
  claude = claude || L.claudeRunner();
  const checks = sortChecks(await collect({ home, platform, claude, online }));
  const result = { version: PKG, platform, at: new Date().toISOString(), checks, summary: summarise(checks) };
  result.ok = result.summary.fail === 0;
  save(home, result);
  return result;
}

const ORDER = ['prerequisites', 'skills', 'apps', 'mcp', 'services'];
function sortChecks(checks) {
  return checks.map((c, i) => [c, i]).sort((a, b) => (ORDER.indexOf(a[0].area) - ORDER.indexOf(b[0].area)) || (a[1] - b[1])).map(([c]) => c);
}

function save(home, result) {
  try {
    const p = L.paths(home);
    fs.mkdirSync(p.state, { recursive: true });
    fs.writeFileSync(path.join(p.state, 'doctor.json'), JSON.stringify({ at: result.at, version: PKG, summary: result.summary, failed: result.checks.filter((c) => c.state === 'fail').map((c) => c.id) }, null, 2) + '\n');
  } catch (_) { /* the saved result is a convenience for the session hook */ }
}

function render(result) {
  const icon = { ok: 'ok  ', warn: 'warn', fail: 'FAIL', info: 'info' };
  const lines = [];
  let area = null;
  for (const c of result.checks) {
    if (c.area !== area) { area = c.area; lines.push('', `${area}`); }
    lines.push(`  ${icon[c.state]}  ${c.detail}`);
    if (c.fix && c.state !== 'ok') lines.push(`        fix: ${c.fix}`);
  }
  const s = result.summary;
  lines.push('', `${s.fail ? `${s.fail} problem(s)` : 'No problems'} · ${s.warn} warning(s) · ${s.ok} ok · ${s.info} note(s). ${s.fail || s.warn ? `\`${NPX} setup\` (or \`doctor --fix\`) repairs what it may; every other line names its fix.` : ''}`.trim());
  return lines.join('\n').replace(/^\n/, '');
}

module.exports = { doctor, render, servicesDir, presentAgents, mcpEntryOf, collect, summarise, sortChecks, save, NPX, PKG };
