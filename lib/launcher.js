'use strict';
/**
 * The PassionCode.ai launcher: installs the vendored payload as one release,
 * gives Claude Code the plugins through a local marketplace, gives every other
 * agent the same skills through the ~/.agents/skills hub, registers the Fabric
 * Dashboards MCP server for every agent that is present, and removes what would
 * shadow them — reversibly. Every step is recorded; nothing is deleted.
 *
 * One channel per agent: Claude Code reads plugins, so nothing is written to
 * ~/.claude/skills (a plain copy there shadows the plugin and serves its frozen
 * version forever); every other agent reads the hub through its own channel.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const PAYLOAD = () => process.env.PASSIONCODE_PAYLOAD || path.join(PACKAGE_ROOT, 'payload');
const MARKETPLACE = 'passioncode';

/** Agent channels read from the hub, and the path each keeps its skills in. */
const CHANNELS = [
  '.cursor/skills', '.codex/skills', '.gemini/skills', '.gemini/antigravity/skills', '.config/opencode/skills',
  '.kiro/skills', '.openclaw/skills', '.codeium/windsurf/skills', '.config/goose/skills', '.hermes/skills',
  '.kilocode/skills', '.openhands/skills',
];

function paths(home = os.homedir()) {
  const state = process.env.PASSIONCODE_HOME || path.join(home, '.passioncode');
  return {
    home, state,
    releases: path.join(state, 'releases'),
    current: path.join(state, 'current'),
    stateFile: path.join(state, 'state.json'),
    quarantine: path.join(state, 'quarantine'),
    hub: path.join(home, '.agents', 'skills'),
    claudeSkills: path.join(home, '.claude', 'skills'),
    claudePlugins: path.join(home, '.claude', 'plugins'),
    claudeSettings: path.join(home, '.claude', 'settings.json'),
  };
}

function readJson(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
function writeText(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}
function lstat(p) { try { return fs.lstatSync(p); } catch (_) { return null; } }
function linkTarget(p) { try { return fs.readlinkSync(p); } catch (_) { return null; } }
function pointsTo(at, target) { const link = linkTarget(at); return link !== null && path.resolve(path.dirname(at), link) === target; }
function isDirectory(at) { try { return fs.statSync(at).isDirectory(); } catch (_) { return false; } }
function readState(file, { tolerant = false } = {}) {
  try { return readSettings(file).doc; } catch (error) {
    if (tolerant) return {};
    throw new Error(`Cannot read state ${file}: ${error.message}. Preserve the file and repair it before retrying.`);
  }
}

/** Replace a symlink atomically (create beside it, rename over it). */
function symlinkAtomic(target, at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  const tmp = `${at}.${process.pid}.lnk`;
  try { fs.unlinkSync(tmp); } catch (_) { /* none */ }
  fs.symlinkSync(target, tmp);
  fs.renameSync(tmp, at);
}

// --- one update at a time (lifecycle contract LC-03) ---------------------------------------
// update, restore and uninstall all write installed_plugins.json, the hub and state.json. A
// background update (started by the session hook) and a manual one used to interleave their
// `claude plugin` writes. They now take one lock; the second refuses and names the holder.
const O_EXLOCK = 0x20; // BSD/macOS open(2) flag: take flock(LOCK_EX); absent from fs.constants

class UpdateRunning extends Error {
  constructor(pid, file) {
    super(`Another PassionCode update is already running (${pid ? `process ${pid}` : 'another process'} holds ${file}); let it finish, then retry.`);
    this.pid = pid;
  }
}

function readPid(file) {
  try { const text = fs.readFileSync(file, 'utf8').trim(); return /^\d{1,10}$/.test(text) ? Number(text) : null; } catch (_) { return null; }
}

function alive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; }
}

/**
 * Take ~/.passioncode/update.lock. On macOS it is a kernel flock (released when the holder dies,
 * so it is never stale); elsewhere an exclusively created pid file whose holder must be alive.
 * Returns `{ release() }`; throws UpdateRunning when another process holds it.
 */
function acquireUpdateLock(p) {
  fs.mkdirSync(p.state, { recursive: true });
  const file = path.join(p.state, 'update.lock');
  if (process.platform === 'darwin') {
    let fd;
    try {
      fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_CREAT | O_EXLOCK | fs.constants.O_NONBLOCK, 0o600);
    } catch (error) {
      if (error.code === 'EAGAIN' || error.code === 'EWOULDBLOCK') throw new UpdateRunning(readPid(file), file);
      throw error;
    }
    fs.ftruncateSync(fd, 0);
    fs.writeSync(fd, String(process.pid));
    return { release() { if (fd !== null) { fs.closeSync(fd); fd = null; } } };
  }
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      fs.writeFileSync(file, String(process.pid), { flag: 'wx', mode: 0o600 });
      return { release() { if (readPid(file) === process.pid) fs.rmSync(file, { force: true }); } };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const pid = readPid(file);
      if (pid && pid !== process.pid && alive(pid)) throw new UpdateRunning(pid, file);
      // The holder is gone: move its file aside atomically, so two takers cannot both steal it.
      try { fs.renameSync(file, `${file}.stale.${process.pid}`); fs.rmSync(`${file}.stale.${process.pid}`, { force: true }); } catch (_) { /* another taker moved it */ }
    }
  }
  throw new UpdateRunning(readPid(file), file);
}

function withUpdateLock(home, fn) {
  const lock = acquireUpdateLock(paths(home));
  try { return fn(); } finally { lock.release(); }
}

// --- release retention (LC-11, LC-15) -----------------------------------------------------------
const semver = (v) => v.split('.').map(Number);
function newerVersion(a, b) {
  const pa = semver(a), pb = semver(b);
  for (let i = 0; i < 3; i += 1) if (pa[i] !== pb[i]) return pa[i] > pb[i];
  return false;
}

/**
 * The release directories an update may remove: every one except the release it installed and
 * the one it replaced (the rollback; the newest other release when it replaced none), plus any
 * `*.partial` copy a killed update left behind (safe: the caller holds the update lock).
 * Files, symlinks and anything not named like a release are never touched.
 */
function staleReleases(p, version, previous) {
  let entries;
  try { entries = fs.readdirSync(p.releases, { withFileTypes: true }); } catch (_) { return []; }
  const dirs = entries.filter((e) => e.isDirectory() && !e.isSymbolicLink()).map((e) => e.name);
  const partial = dirs.filter((n) => /^\d+\.\d+\.\d+\.\d+\.partial$/.test(n));
  const versions = dirs.filter((n) => /^\d+\.\d+\.\d+$/.test(n));
  let keep = previous && versions.includes(previous) && previous !== version ? previous : null;
  if (!keep) {
    for (const v of versions) if (v !== version && (!keep || newerVersion(v, keep))) keep = v;
  }
  return [...versions.filter((v) => v !== version && v !== keep), ...partial].map((n) => path.join(p.releases, n));
}

/** Claude Code's plugin CLI, overridable for tests. */
function claudeRunner() {
  const bin = process.env.PASSIONCODE_CLAUDE || 'claude';
  let found;
  const available = () => found ?? (found = spawnSync(bin, ['--version'], { encoding: 'utf8', timeout: 5000 }).status === 0);
  const run = (args, { cwd } = {}) => {
    const r = spawnSync(bin, args, { encoding: 'utf8', timeout: 180000, ...(cwd ? { cwd } : {}) });
    return { code: r.status === null ? 1 : r.status, out: `${r.stdout || ''}${r.stderr || ''}`.trim() };
  };
  return { available, run };
}

/**
 * Claude Code's user settings. A missing file is empty; a file that does not parse is
 * an error — rewriting it would drop whatever the person keeps there.
 */
function readSettings(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code === 'ENOENT') return { exists: false, doc: {} }; throw error; }
  const doc = JSON.parse(text);
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error(`${file} is not a JSON object`);
  return { exists: true, doc };
}

/** The argument `claude plugin marketplace add` takes for a recorded marketplace source. */
function marketplaceAddArg(source) {
  if (!source || typeof source !== 'object') return null;
  if (source.source === 'github') return source.repo || null;
  if (source.source === 'directory' || source.source === 'file') return source.path || null;
  return source.url || source.repo || source.path || null;
}

const MCP_NAME = 'fabric-dashboards';
const MCP_COMMAND = () => process.env.PASSIONCODE_FABRIC_DASHBOARDS_MCP
  || '/Applications/Fabric Dashboards.app/Contents/Resources/bin/fabric-dashboards-mcp';

/**
 * The agents besides Claude Code the Fabric Dashboards MCP server is registered for, and
 * the file each keeps its MCP configuration in. An agent is present when its directory
 * is; a missing file under a present agent is created. Claude Code is registered through
 * its own CLI instead: every running session rewrites ~/.claude.json, so a second writer
 * there would lose one side's change.
 */
function mcpFileTargets(home) {
  const kimiHome = process.env.KIMI_CODE_HOME || path.join(home, '.kimi-code');
  return [
    { agent: 'Codex CLI', dir: path.join(home, '.codex'), file: path.join(home, '.codex', 'config.toml'), kind: 'toml' },
    { agent: 'Gemini CLI', dir: path.join(home, '.gemini'), file: path.join(home, '.gemini', 'settings.json'), kind: 'json' },
    { agent: 'Kimi Code', dir: kimiHome, file: path.join(kimiHome, 'mcp.json'), kind: 'json' },
  ];
}

/** The line range of the `["mcp_servers"."<name>"]` table in a TOML text, or null. */
function tomlTableRange(text, name) {
  const lines = text.split('\n');
  const header = new RegExp(`^\\s*\\[\\s*["']?mcp_servers["']?\\s*\\.\\s*["']?${name}["']?\\s*\\]\\s*(?:#.*)?$`);
  for (let i = 0; i < lines.length; i++) {
    if (!header.test(lines[i])) continue;
    let end = lines.length;
    for (let j = i + 1; j < lines.length; j++) {
      if (/^\s*\[/.test(lines[j])) { end = j; break; }
    }
    return { start: i, end, lines };
  }
  return null;
}

/**
 * Any other way a TOML text can already define the server — a sub-table such as
 * `[mcp_servers.<name>.env]` or an inline `<name> = { … }` under `[mcp_servers]`.
 * Appending a table then would declare the key twice and Codex would refuse the file.
 */
function tomlMentions(text, name) {
  return new RegExp(`^\\s*\\[\\s*["']?mcp_servers["']?\\s*\\.\\s*["']?${name}["']?\\s*\\.`, 'm').test(text)
    || new RegExp(`^\\s*["']?${name}["']?\\s*=`, 'm').test(text);
}

/** The `command` of a TOML table range: the string, null when absent, undefined when unreadable. */
function tomlTableCommand(range) {
  for (let i = range.start + 1; i < range.end; i++) {
    const m = /^\s*command\s*=\s*("(?:[^"\\]|\\.)*")\s*(?:#.*)?$/.exec(range.lines[i]);
    if (m) { try { return JSON.parse(m[1]); } catch (_) { return undefined; } }
  }
  return null;
}

function mcpTomlTable(command) {
  return `["mcp_servers"."${MCP_NAME}"]\ncommand = ${JSON.stringify(command)}\nargs = []\n`;
}

/** Two MCP entries are the same when their JSON lines up at every depth, key order aside. */
function sameEntry(a, b) {
  const canon = (v) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])]))
    : Array.isArray(v) ? v.map(canon) : v);
  return JSON.stringify(canon(a)) === JSON.stringify(canon(b));
}

/**
 * Remove an MCP entry the launcher added, only while it is still exactly that entry.
 * Returns a note, or null when the entry is already gone. Never deletes the file.
 */
function removeMcpRegistration(record, claude) {
  const kept = (why) => `${record.file}: ${record.name} for ${record.agent} ${why}; kept`;
  const removed = `${record.name} for ${record.agent} removed from ${record.file}`;
  if (record.file.endsWith('.toml')) {
    let text;
    try { text = fs.readFileSync(record.file, 'utf8'); } catch (_) { return null; }
    const range = tomlTableRange(text, record.name);
    if (!range) return null;
    if (tomlTableCommand(range) !== record.entry.command) return kept('was changed');
    writeText(record.file, range.lines.slice(0, range.start).concat(range.lines.slice(range.end)).join('\n'));
    return removed;
  }
  let cfg;
  try { cfg = readSettings(record.file); } catch (error) { return kept(`could not be read (${error.message})`); }
  const servers = cfg.doc.mcpServers;
  if (!servers || !Object.prototype.hasOwnProperty.call(servers, record.name)) return null;
  if (!sameEntry(servers[record.name], record.entry)) return kept('was changed');
  if (record.via === 'claude') {
    if (!claude.available()) return kept('is registered with Claude Code, whose CLI was not found');
    const r = claude.run(['mcp', 'remove', '--scope', 'user', record.name]);
    return r.code === 0 ? removed : kept(`could not be removed (${r.out || 'claude mcp remove failed'})`);
  }
  delete servers[record.name];
  writeJson(record.file, cfg.doc);
  return removed;
}

function payloadManifest(dir = PAYLOAD()) {
  const m = readJson(path.join(dir, 'manifest.json'), null);
  if (!m || !Array.isArray(m.members)) throw new Error(`No payload in ${dir}: the package is incomplete (run scripts/vendor.mjs).`);
  const name = (value) => typeof value === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(value);
  const version = (value) => typeof value === 'string' && /^\d+\.\d+\.\d+$/.test(value);
  const names = new Set(), skills = new Set();
  if (!version(m.version)) throw new Error(`Invalid payload version in ${dir}.`);
  for (const member of m.members) {
    if (!member || !name(member.name) || names.has(member.name) || !version(member.version) || !Array.isArray(member.skills)) {
      throw new Error(`Invalid or duplicate payload member in ${dir}.`);
    }
    names.add(member.name);
    for (const skill of member.skills) {
      if (!name(skill) || skills.has(skill)) throw new Error(`Invalid or duplicate skill in ${dir}.`);
      skills.add(skill);
    }
  }
  return m;
}

function verifyPayload(dir, manifest) {
  for (const m of manifest.members) {
    const root = path.join(dir, 'plugins', m.name);
    const plugin = readJson(path.join(root, '.claude-plugin/plugin.json'), null);
    if (!plugin || plugin.name !== m.name || plugin.version !== m.version) throw new Error(`Payload plugin mismatch: ${m.name}.`);
    for (const skill of m.skills) {
      if (!fs.existsSync(path.join(root, 'skills', skill, 'SKILL.md'))) throw new Error(`Payload skill missing: ${m.name}/${skill}.`);
    }
  }
}

/** Plan and apply an update. Returns the steps with their outcomes. */
function update({ home, dryRun = false, claude = claudeRunner(), log = () => {} } = {}) {
  const p = paths(home);
  const manifest = payloadManifest();
  verifyPayload(PAYLOAD(), manifest);
  const version = manifest.version;
  const state = readState(p.stateFile);
  const steps = [];
  const step = (kind, detail, fn) => {
    if (dryRun) { steps.push({ kind, detail, outcome: 'planned' }); return true; }
    try {
      const result = fn();
      steps.push({ kind, detail, outcome: result === false ? 'skipped' : 'done' });
      return result !== false;
    } catch (error) {
      steps.push({ kind, detail, outcome: 'failed', error: error.message });
      return false;
    }
  };
  const moved = [];
  const quarantineDir = path.join(p.quarantine, `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}`);
  const recordMove = (entry) => {
    writeJson(path.join(quarantineDir, 'moved.json'), [...moved, entry]);
    const fresh = readState(p.stateFile);
    fresh.quarantines = [...new Set([...(fresh.quarantines || []), quarantineDir])];
    writeJson(p.stateFile, fresh);
    moved.push(entry);
  };
  const quarantine = (target, why, replacement = null) => {
    const dest = path.join(quarantineDir, target.replace(/^\//, '').replace(/\//g, '__'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    recordMove({ from: target, to: dest, why, replacement });
    fs.renameSync(target, dest);
  };

  /** Move a legacy marketplace out of settings.json and the registry, recorded for restore. */
  const retireMarketplace = (name, member, uninstalling) => {
    const knownNow = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
    let settings;
    try { settings = readSettings(p.claudeSettings); } catch (error) {
      steps.push({ kind: 'legacy-marketplace', detail: `keep the ${name} marketplace: ${p.claudeSettings} could not be read`, outcome: 'failed', error: error.message });
      return;
    }
    const declared = settings.doc.extraKnownMarketplaces && Object.prototype.hasOwnProperty.call(settings.doc.extraKnownMarketplaces, name)
      ? settings.doc.extraKnownMarketplaces[name] : undefined;
    const registered = Object.prototype.hasOwnProperty.call(knownNow, name);
    if (!registered && declared === undefined) return;
    const serving = installedIds().filter((pid) => pid.endsWith(`@${name}`) && !uninstalling.has(pid));
    if (serving.length) {
      steps.push({ kind: 'legacy-marketplace', detail: `keep the ${name} marketplace: it still serves ${serving.join(', ')}`, outcome: 'skipped' });
      return;
    }
    step('legacy-marketplace', `remove the ${name} marketplace; ${MARKETPLACE} serves ${member}`, () => {
      const record = {
        kind: 'marketplace', name,
        source: (registered && knownNow[name].source) || (declared && declared.source) || null,
        why: `legacy marketplace of ${member}, replaced by ${member}@${MARKETPLACE}`,
      };
      if (declared !== undefined) {
        fs.mkdirSync(quarantineDir, { recursive: true });
        record.settingsBackup = path.join(quarantineDir, `settings.json.before-${name}`);
        fs.copyFileSync(p.claudeSettings, record.settingsBackup);
        record.settingsEntry = declared;
      }
      recordMove(record); // durable before settings or the registry changes
      if (declared !== undefined) {
        const doc = settings.doc;
        delete doc.extraKnownMarketplaces[name];
        writeJson(p.claudeSettings, doc);
      }
      if (registered) {
        // No --scope: with the user entry already moved it would refuse. From ~/.passioncode
        // "every scope" is the user one — no project's .claude/settings.json is touched.
        const r = claude.run(['plugin', 'marketplace', 'remove', name], { cwd: p.state });
        if (r.code !== 0 && !/not found/i.test(r.out)) throw new Error(r.out || 'marketplace remove failed');
      }
    });
  };

  // 1. The release: an immutable copy of the payload, then `current` points at it.
  const release = path.join(p.releases, version);
  step('release', `install ${version} at ${release}`, () => {
    if (lstat(path.join(release, 'manifest.json'))) {
      const existing = payloadManifest(release);
      verifyPayload(release, existing);
      const identity = (m) => JSON.stringify([m.version, m.members.map(({ via, ...member }) => member)]);
      if (identity(existing) !== identity(manifest)) throw new Error(`Release ${version} has a different manifest; use a new version instead of overwriting an immutable release.`);
      return false;
    }
    const tmp = `${release}.${process.pid}.partial`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(PAYLOAD(), tmp, { recursive: true });
    fs.renameSync(tmp, release);
    return true;
  });
  if (steps.at(-1).outcome === 'failed') return { version, steps, moved };
  step('current', `point ${p.current} at ${version}`, () => { symlinkAtomic(release, p.current); });
  if (steps.at(-1).outcome === 'failed') return { version, steps, moved };

  // 2. Claude Code: one local marketplace, one plugin per member.
  const hasClaude = claude.available();
  const installedIds = () => Object.keys(readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins || {});
  const verified = new Set();
  if (!hasClaude) {
    steps.push({ kind: 'claude', detail: 'Claude Code CLI not found; its plugins were not installed', outcome: 'skipped' });
  } else {
    const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
    const marketplaceReady = step('marketplace', known[MARKETPLACE] ? `update the ${MARKETPLACE} marketplace` : `add ${p.current} as the ${MARKETPLACE} marketplace`, () => {
      const r = known[MARKETPLACE] ? claude.run(['plugin', 'marketplace', 'update', MARKETPLACE]) : claude.run(['plugin', 'marketplace', 'add', p.current]);
      if (r.code !== 0) throw new Error(r.out || 'marketplace command failed');
    });
    for (const m of marketplaceReady ? manifest.members : []) {
      const id = `${m.name}@${MARKETPLACE}`;
      const present = installedIds().includes(id);
      const ok = step('plugin', `${present ? 'update' : 'install'} ${id} ${m.version}`, () => {
        const r = claude.run(['plugin', present ? 'update' : 'install', id]);
        if (r.code !== 0 && !/already (installed|at the latest)/i.test(r.out)) throw new Error(r.out || `plugin ${present ? 'update' : 'install'} failed`);
        const entries = readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins?.[id];
        if (!Array.isArray(entries) || !entries.some((entry) => entry.version === m.version)) {
          throw new Error(`Claude Code did not register ${id} at version ${m.version}; legacy entries were kept.`);
        }
      });
      if (ok && (dryRun || installedIds().includes(id))) verified.add(m.name);
      // The same plugin from its old single-member marketplace is a second copy of every skill.
      const uninstalling = new Set();
      for (const legacy of m.legacyPluginIds || []) {
        if (!installedIds().includes(legacy) || !verified.has(m.name)) continue;
        const gone = step('legacy', `uninstall ${legacy}; ${id} replaces it`, () => {
          const r = claude.run(['plugin', 'uninstall', legacy]);
          if (r.code !== 0) throw new Error(r.out || 'uninstall failed');
          (state.legacyRemoved = state.legacyRemoved || []).push({ id: legacy, at: new Date().toISOString() });
        });
        if (gone && dryRun) uninstalling.add(legacy);
      }
      // ...and its old marketplace, left registered, would install it again: Claude Code
      // re-registers whatever settings.json declares, with autoUpdate if it was on.
      for (const name of m.legacyMarketplaces || []) {
        if (name === MARKETPLACE || !verified.has(m.name)) continue;
        retireMarketplace(name, m.name, uninstalling);
      }
    }
  }

  // 3. Every other agent: hub link → the release, channel link → the hub.
  const channels = CHANNELS.map((c) => path.join(p.home, c)).filter(isDirectory);
  for (const m of manifest.members) {
    for (const skill of m.skills) {
      const source = path.join(p.current, 'plugins', m.name, 'skills', skill);
      const hubLink = path.join(p.hub, skill);
      const existing = lstat(hubLink);
      if (!existing || linkTarget(hubLink) !== source) {
        step('hub', `${hubLink} → ${source}`, () => {
          if (lstat(hubLink)) quarantine(hubLink, existing.isSymbolicLink() ? `pointed at ${linkTarget(hubLink)}` : 'a plain copy', source);
          symlinkAtomic(source, hubLink);
        });
      }
      for (const channel of channels) {
        const at = path.join(channel, skill);
        const cur = lstat(at);
        if (cur && cur.isSymbolicLink() && (linkTarget(at) === hubLink || path.resolve(channel, linkTarget(at) || '') === hubLink)) continue;
        step('channel', `${at} → ${hubLink}`, () => {
          if (lstat(at)) quarantine(at, cur.isSymbolicLink() ? `pointed at ${linkTarget(at)}` : 'a plain copy', hubLink);
          symlinkAtomic(hubLink, at);
        });
      }
      // 4. Claude Code reads the plugin; a plain ~/.claude/skills entry would shadow it.
      const shadow = path.join(p.claudeSkills, skill);
      if (lstat(shadow) && verified.has(m.name)) {
        step('shadow', `move aside ${shadow}; the ${m.name} plugin serves it`, () => quarantine(shadow, 'shadowed the plugin'));
      }
    }
  }

  // 5. The Fabric Dashboards MCP server, for every agent that is present. Entries a
  //    person or another tool set are never rewritten: a matching entry is left, a
  //    different one is reported. What the launcher adds is journalled before it is
  //    written, so restore and uninstall can take it out again.
  const registered = [];
  const mcpCommand = MCP_COMMAND();
  const mcpBackup = (file, agent) => {
    if (!lstat(file)) return null;
    fs.mkdirSync(quarantineDir, { recursive: true });
    const backup = path.join(quarantineDir, `${path.basename(file)}.before-mcp-${agent.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
    fs.copyFileSync(file, backup);
    return backup;
  };
  const register = (record, write) => step('mcp', `register ${MCP_NAME} for ${record.agent} in ${record.file}`, () => {
    recordMove(record);
    write();
    registered.push({ agent: record.agent, file: record.file, name: record.name, entry: record.entry, ...(record.via ? { via: record.via } : {}) });
  });
  const existingNote = (agent, existing) => existing === mcpCommand
    ? { kind: 'mcp', detail: `${agent} already runs ${MCP_NAME} from ${mcpCommand}`, outcome: 'skipped' }
    : { kind: 'mcp', detail: `${agent} has its own ${MCP_NAME} entry (${existing || 'not a stdio server'}); it was kept`, outcome: 'skipped' };
  if (!lstat(mcpCommand)) {
    steps.push({ kind: 'mcp', detail: `no Fabric Dashboards MCP at ${mcpCommand}; nothing was registered`, outcome: 'skipped' });
  } else {
    const claudeJson = path.join(p.home, '.claude.json');
    if (!hasClaude) {
      steps.push({ kind: 'mcp', detail: `Claude Code CLI not found; ${MCP_NAME} was not registered for it`, outcome: 'skipped' });
    } else {
      let servers = null;
      try { servers = readSettings(claudeJson).doc.mcpServers || {}; } catch (error) {
        steps.push({ kind: 'mcp', detail: `keep ${claudeJson}: it could not be read`, outcome: 'failed', error: error.message });
      }
      const existing = servers && servers[MCP_NAME];
      if (existing) steps.push(existingNote('Claude Code', typeof existing === 'object' ? existing.command || existing.url : null));
      else if (servers) {
        const entry = { type: 'stdio', command: mcpCommand, args: [], env: {} };
        register({ kind: 'mcp', via: 'claude', agent: 'Claude Code', file: claudeJson, name: MCP_NAME, entry, backup: null }, () => {
          const r = claude.run(['mcp', 'add', '--scope', 'user', MCP_NAME, '--', mcpCommand], { cwd: p.state });
          if (r.code !== 0) throw new Error(r.out || 'claude mcp add failed');
          const now = readSettings(claudeJson).doc.mcpServers || {};
          if (!now[MCP_NAME] || now[MCP_NAME].command !== mcpCommand) throw new Error(`Claude Code did not register ${MCP_NAME} in ${claudeJson}`);
          // What the CLI wrote is what restore and uninstall compare against.
          entry.type = now[MCP_NAME].type; entry.args = now[MCP_NAME].args; entry.env = now[MCP_NAME].env;
        });
      }
    }
    for (const target of mcpFileTargets(p.home)) {
      if (!isDirectory(target.dir)) {
        steps.push({ kind: 'mcp', detail: `${target.agent} not found; ${MCP_NAME} was not registered for it`, outcome: 'skipped' });
        continue;
      }
      if (target.kind === 'json') {
        let cfg;
        try { cfg = readSettings(target.file); } catch (error) {
          steps.push({ kind: 'mcp', detail: `keep ${target.file}: it could not be read`, outcome: 'failed', error: error.message });
          continue;
        }
        const existing = (cfg.doc.mcpServers || {})[MCP_NAME];
        if (existing) { steps.push(existingNote(target.agent, typeof existing === 'object' ? existing.command || existing.url : null)); continue; }
        const entry = { command: mcpCommand, args: [], env: {} };
        register({ kind: 'mcp', agent: target.agent, file: target.file, name: MCP_NAME, entry, backup: mcpBackup(target.file, target.agent) }, () => {
          cfg.doc.mcpServers = { ...(cfg.doc.mcpServers || {}), [MCP_NAME]: entry };
          writeJson(target.file, cfg.doc);
        });
      } else {
        let text = '';
        try { text = fs.readFileSync(target.file, 'utf8'); } catch (error) {
          if (error.code !== 'ENOENT') {
            steps.push({ kind: 'mcp', detail: `keep ${target.file}: it could not be read`, outcome: 'failed', error: error.message });
            continue;
          }
        }
        const range = tomlTableRange(text, MCP_NAME);
        if (range) { const c = tomlTableCommand(range); steps.push(existingNote(target.agent, c == null ? null : c)); continue; }
        if (tomlMentions(text, MCP_NAME)) {
          steps.push({ kind: 'mcp', detail: `${target.agent} declares ${MCP_NAME} in ${target.file} in a form the launcher does not edit; it was kept`, outcome: 'skipped' });
          continue;
        }
        const entry = { command: mcpCommand, args: [] };
        register({ kind: 'mcp', agent: target.agent, file: target.file, name: MCP_NAME, entry, backup: mcpBackup(target.file, target.agent) }, () => {
          writeText(target.file, text ? `${text.endsWith('\n') ? text : `${text}\n`}\n${mcpTomlTable(mcpCommand)}` : mcpTomlTable(mcpCommand));
        });
      }
    }
  }

  // 6. The launcher's own releases: keep this one and the one it replaced, remove the rest.
  //    They are its own output, reinstallable from npm — not the person's files, which are
  //    only ever moved to the quarantine.
  const stale = staleReleases(p, version, state.installed || null);
  if (stale.length) {
    step('prune', `remove ${stale.map((d) => path.basename(d)).join(', ')} from ${p.releases}; keep ${version} and the release before it`, () => {
      for (const dir of stale) fs.rmSync(dir, { recursive: true, force: true });
    });
  }

  if (!dryRun) {
    if (moved.length) writeJson(path.join(quarantineDir, 'moved.json'), moved);
    // A probe or config command may have written while the plugin CLI ran.
    const fresh = readState(p.stateFile);
    fresh.installed = version;
    fresh.installedAt = new Date().toISOString();
    fresh.members = manifest.members.map((m) => ({ name: m.name, version: m.version, ref: m.ref, commit: m.commit }));
    fresh.quarantines = [...new Set([...(fresh.quarantines || []), ...(moved.length ? [quarantineDir] : [])])];
    if (state.legacyRemoved) fresh.legacyRemoved = state.legacyRemoved;
    if (registered.length) {
      fresh.mcpRegistrations = [...(fresh.mcpRegistrations || []).filter((r) => !registered.some((n) => n.file === r.file && n.name === r.name)), ...registered];
    }
    delete fresh.updatingSince;
    writeJson(p.stateFile, fresh);
  }
  log(`${dryRun ? 'Plan' : 'Updated'}: PassionCode.ai ${version}`);
  return { version, steps, moved };
}

/** Put back everything a run moved aside (newest run first unless one is named). */
function restore({ home, which, claude = claudeRunner() } = {}) {
  const p = paths(home);
  const state = readState(p.stateFile);
  const dirs = which ? [which] : (state.quarantines || []).slice(-1);
  const restored = [];
  for (const dir of dirs) {
    const journal = path.join(dir, 'moved.json');
    const entries = JSON.parse(fs.readFileSync(journal, 'utf8'));
    for (const entry of [...entries].reverse()) {
      if (entry.restoredAt) continue;
      if (entry.kind === 'marketplace') {
        restored.push(restoreMarketplace(p, entry, claude));
      } else if (entry.kind === 'mcp') {
        const note = removeMcpRegistration(entry, claude);
        if (note) restored.push(note);
        const state = readState(p.stateFile);
        if (state.mcpRegistrations) {
          state.mcpRegistrations = state.mcpRegistrations.filter((r) => !(r.file === entry.file && r.name === entry.name));
          if (!state.mcpRegistrations.length) delete state.mcpRegistrations;
          writeJson(p.stateFile, state);
        }
      } else if (lstat(entry.to)) {
        if (lstat(entry.from)) {
          // Old journals did not record the replacement. Only recognise a link
          // into this launcher's hub/current tree; never erase an arbitrary link.
          const target = linkTarget(entry.from);
          const resolved = target === null ? null : path.resolve(path.dirname(entry.from), target);
          const owned = entry.replacement !== undefined ? resolved === entry.replacement && resolved !== null
            : resolved && (resolved.startsWith(p.current + path.sep) || resolved.startsWith(p.hub + path.sep));
          if (!owned) throw new Error(`Restore conflict at ${entry.from}; move the replacement aside and retry.`);
          fs.unlinkSync(entry.from);
        }
        fs.mkdirSync(path.dirname(entry.from), { recursive: true });
        fs.renameSync(entry.to, entry.from);
        restored.push(entry.from);
      } else if (!lstat(entry.from)) {
        throw new Error(`Restore source missing: ${entry.to}; preserve the quarantine for recovery.`);
      }
      // Also recognise already-restored entries from releases with no checkpoint.
      entry.restoredAt = new Date().toISOString();
      writeJson(journal, entries);
    }
  }
  return restored;
}

/** Re-register a retired marketplace and put its settings.json declaration back as it was. */
function restoreMarketplace(p, entry, claude) {
  const notes = [];
  const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
  const arg = marketplaceAddArg(entry.source);
  if (!Object.prototype.hasOwnProperty.call(known, entry.name)) {
    if (!arg) notes.push('no recorded source to re-add from');
    else if (!claude.available()) notes.push('Claude Code CLI not found; it re-registers from settings.json at its next start');
    else {
      fs.mkdirSync(p.state, { recursive: true });
      const r = claude.run(['plugin', 'marketplace', 'add', arg], { cwd: p.state });
      if (r.code !== 0) notes.push(`re-add failed: ${r.out || 'marketplace add failed'}`);
    }
  }
  if (entry.settingsEntry !== undefined) {
    // After `marketplace add`, which declares a bare { source }: the recorded entry keeps autoUpdate.
    try {
      const { doc } = readSettings(p.claudeSettings);
      doc.extraKnownMarketplaces = { ...(doc.extraKnownMarketplaces || {}), [entry.name]: entry.settingsEntry };
      writeJson(p.claudeSettings, doc);
    } catch (error) {
      notes.push(`settings.json not restored (${error.message}); the original is at ${entry.settingsBackup}`);
    }
  }
  if (notes.length) throw new Error(`Could not fully restore marketplace ${entry.name}: ${notes.join('; ')}. Retry restore after fixing it.`);
  return `marketplace ${entry.name}`;
}

function status({ home, claude = claudeRunner() } = {}) {
  const p = paths(home);
  const state = readState(p.stateFile, { tolerant: true });
  let payload = null;
  try { payload = payloadManifest(); } catch (_) { /* reported as unknown */ }
  // What is installed is the release `current` points at. The payload beside this CLI is
  // only what an update would install — from a checkout it is whatever was last vendored
  // there, so reading members from it described a set that is not on the machine.
  let release = null;
  try { release = payloadManifest(p.current); } catch (_) { /* nothing installed yet */ }
  const described = release || payload;
  const installed = Object.keys(readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins || {});
  const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
  let declared = {};
  try { declared = readSettings(p.claudeSettings).doc.extraKnownMarketplaces || {}; } catch (_) { /* reported by update */ }
  const members = (described ? described.members : []).map((m) => ({
    name: m.name, version: m.version,
    claude: installed.includes(`${m.name}@${MARKETPLACE}`) ? 'plugin' : (claude.available() ? 'missing' : 'no Claude Code'),
    legacy: (m.legacyPluginIds || []).filter((id) => installed.includes(id)),
    legacyMarketplaces: (m.legacyMarketplaces || []).filter((n) => n !== MARKETPLACE && (known[n] || declared[n])),
    hub: m.skills.map((s) => ({ skill: s, ok: linkTarget(path.join(p.hub, s)) === path.join(p.current, 'plugins', m.name, 'skills', s) })),
    shadows: m.skills.filter((s) => lstat(path.join(p.claudeSkills, s))),
  }));
  return {
    installed: release ? release.version : (state.installed || null), latest: state.latest || null, checkedAt: state.checkedAt || null,
    package: payload ? payload.version : null, source: release ? 'installed' : (payload ? 'package' : null),
    auto: (state.config || {}).auto !== false, members,
  };
}

function setConfig({ home, key, value }) {
  if (key !== 'update.auto' || !['on', 'off'].includes(value)) throw new Error('Only `config set update.auto on|off` is supported.');
  const p = paths(home);
  const state = readState(p.stateFile);
  state.config = { ...(state.config || {}), auto: value === 'on' };
  writeJson(p.stateFile, state);
  return state.config;
}

function uninstall({ home, claude = claudeRunner() } = {}) {
  const p = paths(home);
  readState(p.stateFile); // refuse to overwrite a damaged recovery record
  const manifest = lstat(p.current) ? payloadManifest(p.current) : { members: [] };
  const removed = [];
  const failures = [];
  const hasClaude = claude.available();
  const installedIds = () => Object.keys(readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins || {});
  for (const m of manifest.members) {
    for (const skill of m.skills) {
      const hubLink = path.join(p.hub, skill);
      if (pointsTo(hubLink, path.join(p.current, 'plugins', m.name, 'skills', skill))) { fs.unlinkSync(hubLink); removed.push(hubLink); }
      for (const c of CHANNELS) {
        const at = path.join(p.home, c, skill);
        if (pointsTo(at, hubLink)) { fs.unlinkSync(at); removed.push(at); }
      }
    }
    const id = `${m.name}@${MARKETPLACE}`;
    if (installedIds().includes(id)) {
      if (!hasClaude) { failures.push(`${id}: Claude Code CLI not found`); continue; }
      const r = claude.run(['plugin', 'uninstall', id]);
      if (r.code === 0 && !installedIds().includes(id)) removed.push(id);
      else failures.push(`${id}: ${r.out || 'plugin remains registered after uninstall'}`);
    }
  }
  const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
  if (!failures.length && known[MARKETPLACE] && !installedIds().some((id) => id.endsWith(`@${MARKETPLACE}`))) {
    if (!hasClaude) failures.push('Claude Code CLI not found; marketplace remains registered');
    else {
      const r = claude.run(['plugin', 'marketplace', 'remove', MARKETPLACE]);
      if (r.code !== 0) failures.push(r.out || 'marketplace remove failed');
    }
  }
  if (failures.length) throw new Error(`Uninstall incomplete: ${failures.join('; ')}. Fix the error and retry uninstall.`);
  if (lstat(p.current)) {
    if (!lstat(p.current).isSymbolicLink()) throw new Error(`Refusing to remove non-symlink ${p.current}.`);
    fs.unlinkSync(p.current);
  }
  const state = readState(p.stateFile);
  // The MCP registrations this launcher added — only while they are still exactly what
  // it wrote; an entry a person changed since stays.
  for (const record of state.mcpRegistrations || []) {
    const note = removeMcpRegistration(record, claude);
    if (note) removed.push(note);
  }
  delete state.mcpRegistrations;
  state.installed = null;
  state.members = [];
  state.config = { ...(state.config || {}), auto: false };
  delete state.installedAt;
  delete state.updatingSince;
  writeJson(p.stateFile, state);
  return removed;
}

module.exports = {
  // An invalid payload is refused before the lock creates anything under ~/.passioncode.
  update: (opts = {}) => {
    if (opts.dryRun) return update(opts);
    verifyPayload(PAYLOAD(), payloadManifest());
    return withUpdateLock(opts.home, () => update(opts));
  },
  restore: (opts = {}) => withUpdateLock(opts.home, () => restore(opts)),
  uninstall: (opts = {}) => withUpdateLock(opts.home, () => uninstall(opts)),
  status, setConfig, paths, CHANNELS, MARKETPLACE, payloadManifest, marketplaceAddArg,
  acquireUpdateLock, UpdateRunning, staleReleases,
};
