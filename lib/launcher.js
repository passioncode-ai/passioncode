'use strict';
/**
 * The PassionCode.ai launcher: installs the vendored payload as one release,
 * gives Claude Code the plugins through a local marketplace, gives every other
 * agent the same skills through the ~/.agents/skills hub, and removes what
 * would shadow them — reversibly. Every step is recorded; nothing is deleted.
 *
 * One channel per agent: Claude Code reads plugins, so nothing is written to
 * ~/.claude/skills (a plain copy there shadows the plugin and serves its frozen
 * version forever); every other agent reads the hub through its own channel.
 */
const { execFileSync, spawnSync } = require('child_process');
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
function lstat(p) { try { return fs.lstatSync(p); } catch (_) { return null; } }
function linkTarget(p) { try { return fs.readlinkSync(p); } catch (_) { return null; } }

/** Replace a symlink atomically (create beside it, rename over it). */
function symlinkAtomic(target, at) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  const tmp = `${at}.${process.pid}.lnk`;
  try { fs.unlinkSync(tmp); } catch (_) { /* none */ }
  fs.symlinkSync(target, tmp);
  fs.renameSync(tmp, at);
}

/** Claude Code's plugin CLI, overridable for tests. */
function claudeRunner() {
  const bin = process.env.PASSIONCODE_CLAUDE || 'claude';
  const available = () => spawnSync(bin, ['--version'], { encoding: 'utf8' }).status === 0;
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

function payloadManifest(dir = PAYLOAD()) {
  const m = readJson(path.join(dir, 'manifest.json'), null);
  if (!m || !Array.isArray(m.members)) throw new Error(`No payload in ${dir}: the package is incomplete (run scripts/vendor.mjs).`);
  return m;
}

/** Plan and apply an update. Returns the steps with their outcomes. */
function update({ home, dryRun = false, claude = claudeRunner(), log = () => {} } = {}) {
  const p = paths(home);
  const manifest = payloadManifest();
  const version = manifest.version;
  const state = readJson(p.stateFile, {});
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
  const quarantineDir = path.join(p.quarantine, new Date().toISOString().replace(/[:.]/g, '-'));
  const quarantine = (target, why) => {
    const dest = path.join(quarantineDir, target.replace(/^\//, '').replace(/\//g, '__'));
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.renameSync(target, dest);
    moved.push({ from: target, to: dest, why });
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
        const doc = settings.doc;
        delete doc.extraKnownMarketplaces[name];
        writeJson(p.claudeSettings, doc);
      }
      moved.push(record); // recorded before the CLI runs, so restore can undo a half-finished step
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
    if (lstat(path.join(release, 'manifest.json'))) return false;
    const tmp = `${release}.${process.pid}.partial`;
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.cpSync(PAYLOAD(), tmp, { recursive: true });
    fs.renameSync(tmp, release);
    return true;
  });
  step('current', `point ${p.current} at ${version}`, () => { symlinkAtomic(release, p.current); });

  // 2. Claude Code: one local marketplace, one plugin per member.
  const hasClaude = claude.available();
  const installedIds = () => Object.keys(readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins || {});
  const verified = new Set();
  if (!hasClaude) {
    steps.push({ kind: 'claude', detail: 'Claude Code CLI not found; its plugins were not installed', outcome: 'skipped' });
  } else {
    const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
    step('marketplace', known[MARKETPLACE] ? `update the ${MARKETPLACE} marketplace` : `add ${p.current} as the ${MARKETPLACE} marketplace`, () => {
      const r = known[MARKETPLACE] ? claude.run(['plugin', 'marketplace', 'update', MARKETPLACE]) : claude.run(['plugin', 'marketplace', 'add', p.current]);
      if (r.code !== 0) throw new Error(r.out || 'marketplace command failed');
    });
    for (const m of manifest.members) {
      const id = `${m.name}@${MARKETPLACE}`;
      const present = installedIds().includes(id);
      const ok = step('plugin', `${present ? 'update' : 'install'} ${id} ${m.version}`, () => {
        const r = claude.run(['plugin', present ? 'update' : 'install', id]);
        if (r.code !== 0 && !/already (installed|at the latest)/i.test(r.out)) throw new Error(r.out || `plugin ${present ? 'update' : 'install'} failed`);
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
  const channels = CHANNELS.map((c) => path.join(p.home, c)).filter((c) => lstat(c) && lstat(c).isDirectory());
  for (const m of manifest.members) {
    for (const skill of m.skills) {
      const source = path.join(p.current, 'plugins', m.name, 'skills', skill);
      const hubLink = path.join(p.hub, skill);
      const existing = lstat(hubLink);
      if (!existing || linkTarget(hubLink) !== source) {
        step('hub', `${hubLink} → ${source}`, () => {
          if (lstat(hubLink)) quarantine(hubLink, existing.isSymbolicLink() ? `pointed at ${linkTarget(hubLink)}` : 'a plain copy');
          symlinkAtomic(source, hubLink);
        });
      }
      for (const channel of channels) {
        const at = path.join(channel, skill);
        const cur = lstat(at);
        if (cur && cur.isSymbolicLink() && (linkTarget(at) === hubLink || path.resolve(channel, linkTarget(at) || '') === hubLink)) continue;
        step('channel', `${at} → ${hubLink}`, () => {
          if (lstat(at)) quarantine(at, cur.isSymbolicLink() ? `pointed at ${linkTarget(at)}` : 'a plain copy');
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

  if (!dryRun) {
    if (moved.length) writeJson(path.join(quarantineDir, 'moved.json'), moved);
    state.installed = version;
    state.installedAt = new Date().toISOString();
    state.members = manifest.members.map((m) => ({ name: m.name, version: m.version, ref: m.ref, commit: m.commit }));
    state.quarantines = [...(state.quarantines || []), ...(moved.length ? [quarantineDir] : [])];
    delete state.updatingSince;
    writeJson(p.stateFile, state);
  }
  log(`${dryRun ? 'Plan' : 'Updated'}: PassionCode.ai ${version}`);
  return { version, steps, moved };
}

/** Put back everything a run moved aside (newest run first unless one is named). */
function restore({ home, which, claude = claudeRunner() } = {}) {
  const p = paths(home);
  const state = readJson(p.stateFile, {});
  const dirs = which ? [which] : (state.quarantines || []).slice(-1);
  const restored = [];
  for (const dir of dirs) {
    for (const entry of readJson(path.join(dir, 'moved.json'), []).reverse()) {
      if (entry.kind === 'marketplace') { restored.push(restoreMarketplace(p, entry, claude)); continue; }
      if (lstat(entry.from) && lstat(entry.from).isSymbolicLink()) fs.unlinkSync(entry.from);
      if (lstat(entry.from)) continue;
      fs.mkdirSync(path.dirname(entry.from), { recursive: true });
      fs.renameSync(entry.to, entry.from);
      restored.push(entry.from);
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
  return `marketplace ${entry.name}${notes.length ? ` (${notes.join('; ')})` : ''}`;
}

function status({ home, claude = claudeRunner() } = {}) {
  const p = paths(home);
  const state = readJson(p.stateFile, {});
  let payload = null;
  try { payload = payloadManifest(); } catch (_) { /* reported as unknown */ }
  const installed = Object.keys(readJson(path.join(p.claudePlugins, 'installed_plugins.json'), { plugins: {} }).plugins || {});
  const known = readJson(path.join(p.claudePlugins, 'known_marketplaces.json'), {});
  let declared = {};
  try { declared = readSettings(p.claudeSettings).doc.extraKnownMarketplaces || {}; } catch (_) { /* reported by update */ }
  const members = (payload ? payload.members : []).map((m) => ({
    name: m.name, version: m.version,
    claude: installed.includes(`${m.name}@${MARKETPLACE}`) ? 'plugin' : (claude.available() ? 'missing' : 'no Claude Code'),
    legacy: (m.legacyPluginIds || []).filter((id) => installed.includes(id)),
    legacyMarketplaces: (m.legacyMarketplaces || []).filter((n) => n !== MARKETPLACE && (known[n] || declared[n])),
    hub: m.skills.map((s) => ({ skill: s, ok: linkTarget(path.join(p.hub, s)) === path.join(p.current, 'plugins', m.name, 'skills', s) })),
    shadows: m.skills.filter((s) => lstat(path.join(p.claudeSkills, s))),
  }));
  return { installed: state.installed || null, latest: state.latest || null, checkedAt: state.checkedAt || null, package: payload ? payload.version : null, auto: (state.config || {}).auto !== false, members };
}

function setConfig({ home, key, value }) {
  if (key !== 'update.auto' || !['on', 'off'].includes(value)) throw new Error('Only `config set update.auto on|off` is supported.');
  const p = paths(home);
  const state = readJson(p.stateFile, {});
  state.config = { ...(state.config || {}), auto: value === 'on' };
  writeJson(p.stateFile, state);
  return state.config;
}

function uninstall({ home, claude = claudeRunner() } = {}) {
  const p = paths(home);
  let manifest;
  try { manifest = payloadManifest(p.current); } catch (_) { manifest = { members: [] }; }
  const removed = [];
  for (const m of manifest.members) {
    for (const skill of m.skills) {
      const hubLink = path.join(p.hub, skill);
      if (linkTarget(hubLink) === path.join(p.current, 'plugins', m.name, 'skills', skill)) { fs.unlinkSync(hubLink); removed.push(hubLink); }
      for (const c of CHANNELS) {
        const at = path.join(p.home, c, skill);
        if (linkTarget(at) === hubLink) { fs.unlinkSync(at); removed.push(at); }
      }
    }
    if (claude.available()) {
      const r = claude.run(['plugin', 'uninstall', `${m.name}@${MARKETPLACE}`]);
      if (r.code === 0) removed.push(`${m.name}@${MARKETPLACE}`);
    }
  }
  if (claude.available()) claude.run(['plugin', 'marketplace', 'remove', MARKETPLACE]);
  return removed;
}

module.exports = { update, restore, status, setConfig, uninstall, paths, CHANNELS, MARKETPLACE, payloadManifest, marketplaceAddArg };
