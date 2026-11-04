'use strict';
// #region usage-analytics — docs: docs/analytics-events.md#what-is-sent
// PC-123: anonymous usage and error counts, the PassionCode way (Fabric Dashboards FD-136, Fabric Switchboard SB-246):
// on by default, told once in a notice, turned off for this product alone (the operator, 2026-11-04). Fixed words and
// counts only, never a path, a name, a rule, an argument, a key or a message. One batch at the end of a command, to the
// organization's Aptabase, and only from a build that carries an App Key: the publish job writes `analytics-key.json`
// beside this file from the release secret; a checkout, a test or a fork carries none, so it sends nothing.
//
// - One installation id for every PassionCode app on the machine, in the shared `installation.json`, created once by
//   whichever app starts first (a temporary file hard-linked into place) and never repaired. Its `analytics` field is
//   not read: the switch is this product's own (`<state>/analytics.json`).
// - Off is off: `analytics off`, `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK` send nothing and store nothing new.
// - A command never waits on it for more than two seconds; a failed send is dropped, never kept for a later run.
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOST = 'https://analytics.passioncode.ai';
const SDK_VERSION = 'passioncode-analytics@1';
const KEY_FILE = path.join(__dirname, 'analytics-key.json');
const APP_KEY = /^A-[A-Z]{2,4}-\d{10}$/;
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SEND_MS = 2000;
// The words a property may carry; anything else is dropped (a free string could hold a name or a path).
const COMMANDS = new Set(['setup', 'doctor', 'update', 'status', 'restore', 'config', 'uninstall', 'permissions', 'analytics', 'help']);
const OUTCOMES = new Set(['ok', 'failed', 'usage']);
const NOTICE = 'PassionCode sends anonymous usage and error counts to improve it. Turn them off: npx @passioncode-ai/passioncode@latest analytics off';

// The App Key a release build carries, or null: then nothing is sent.
function appKey(file = KEY_FILE) {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8'));
    return v && typeof v.appKey === 'string' && APP_KEY.test(v.appKey) ? v.appKey : null;
  } catch (_) { return null; }
}

// Where every PassionCode app keeps the shared installation file (the same rule as Fabric Dashboards').
function installationPath(platform = process.platform, env = process.env, home = os.homedir()) {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'PassionCode', 'installation.json');
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'PassionCode', 'installation.json');
  return path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'PassionCode', 'installation.json');
}

// Read the shared file, or create it once. Never overwrites a file another app made; never repairs one.
function installId(file, now = new Date()) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let text = null;
    try { text = fs.readFileSync(file, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') return null; }
    if (text !== null) {
      try { const o = JSON.parse(text); return o && o.version === 1 && typeof o.id === 'string' && UUID_V4.test(o.id) ? o.id : null; } catch (_) { return null; }
    }
    const fresh = { version: 1, id: crypto.randomUUID(), analytics: true, created_at: Math.floor(now.getTime() / 1000) };
    const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(tmp, JSON.stringify(fresh) + '\n', { mode: 0o600 });
      try { fs.linkSync(tmp, file); return fresh.id; } catch (error) { if (error.code !== 'EEXIST') return null; } // another app made it: read theirs
    } catch (_) { return null; } finally { fs.rmSync(tmp, { force: true }); }
  }
  return null;
}

function stateFile(state) { return path.join(state, 'analytics.json'); }
function readState(state) { try { const v = JSON.parse(fs.readFileSync(stateFile(state), 'utf8')); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; } }
function writeState(state, doc) {
  fs.mkdirSync(state, { recursive: true });
  const file = stateFile(state);
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}

// Why nothing is sent, or null when it is on. `off` (the person's switch) wins over everything else.
function blocked({ state, env = process.env, key }) {
  if (readState(state).enabled === false) return 'off';
  if (String(env.PASSIONCODE_ANALYTICS || '').toLowerCase() === 'off') return 'env';
  if (env.DO_NOT_TRACK && env.DO_NOT_TRACK !== '0') return 'do-not-track';
  if (!key) return 'no-key';
  return null;
}

function status({ state, env = process.env, key = appKey() } = {}) {
  const why = blocked({ state, env, key });
  return { enabled: readState(state).enabled !== false, sending: why === null, reason: why, host: HOST };
}

function setEnabled(state, enabled) {
  const doc = readState(state);
  doc.enabled = enabled;
  writeState(state, doc);
}

const bucket = (ms) => (ms < 1000 ? 'under-1s' : ms < 10_000 ? '1-10s' : ms < 60_000 ? '10-60s' : 'over-60s');

// The events of one finished command, and the state they leave. Pure: no file, no network.
function eventsFor({ command, code, json, durationMs, version, now, st }) {
  const out = [];
  const next = { ...st };
  if (!st.installedAt) { out.push(['app_installed', {}]); next.installedAt = now.toISOString(); }
  else if (st.version && st.version !== version) out.push(['app_updated', { from: String(st.version).slice(0, 30) }]);
  next.version = version;
  const day = now.toISOString().slice(0, 10);
  if (st.activeDay !== day) { out.push(['app_active', {}]); next.activeDay = day; }
  const cmd = COMMANDS.has(command) ? command : 'help';
  const outcome = code === 0 ? 'ok' : code === 2 ? 'usage' : 'failed';
  out.push(['command_run', { command: cmd, outcome: OUTCOMES.has(outcome) ? outcome : 'failed', duration: bucket(durationMs), json: !!json }]);
  if (code === 1) out.push(['app_error', { where: cmd, code: 'other' }]); // fixed codes per failure come with later rows
  return { events: out, next };
}

// After a command: say so once, then send its events. Answers what happened, for tests; never throws.
async function after({ command, code, json, startedAt, version, state, env = process.env, key = appKey(), home = os.homedir(),
  platform = process.platform, now = new Date(), fetchImpl = globalThis.fetch, stderr = process.stderr } = {}) {
  try {
    if (blocked({ state, env, key })) return { sent: 0 };
    const st = readState(state);
    if (!st.noticeAt) {
      if (json) return { sent: 0, waiting: 'notice' }; // a program's run never carries the notice, so it sends nothing yet
      stderr.write(NOTICE + '\n');
      st.noticeAt = now.toISOString();
    }
    const id = installId(installationPath(platform, env, home), now);
    const { events, next } = eventsFor({ command, code, json, durationMs: now.getTime() - startedAt, version, now, st });
    writeState(state, next);
    if (!fetchImpl) return { sent: 0 };
    const environment = /-dev|\+/.test(version) ? 'sandbox' : 'production';
    const sessionId = String(Math.floor(now.getTime() / 1000) * 1e8 + crypto.randomInt(1e8));
    const body = events.map(([eventName, props]) => ({
      timestamp: now.toISOString(), sessionId, eventName,
      systemProps: { isDebug: environment !== 'production', osName: os.type(), osVersion: String(os.release()).slice(0, 100),
        locale: String(Intl.DateTimeFormat().resolvedOptions().locale || '').slice(0, 10), appVersion: String(version).slice(0, 50),
        appBuildNumber: '', sdkVersion: SDK_VERSION, engineName: 'Node', engineVersion: process.versions.node },
      props: { ...props, ...(id ? { install_id: id, iid: id } : {}), environment },
    }));
    const res = await fetchImpl(`${HOST}/api/v0/events`, { method: 'POST', headers: { 'App-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(SEND_MS) });
    return { sent: res && res.ok ? body.length : 0, body };
  } catch (_) { return { sent: 0 }; }
}

module.exports = { HOST, NOTICE, KEY_FILE, COMMANDS, appKey, installationPath, installId, readState, status, setEnabled, eventsFor, after, bucket };
// #endregion usage-analytics
