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
//   read once, at the first run of a counting version, to keep a "no" the person already gave; never again: the switch
//   is this product's own (`<state>/analytics.json`).
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
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i; // an app may write it upper case: sent as written
const SEND_MS = 2000;
// The words a property may carry; anything else is dropped (a free string could hold a name or a path).
const COMMANDS = new Set(['setup', 'doctor', 'update', 'status', 'restore', 'config', 'uninstall', 'permissions', 'analytics', 'help']);
const OUTCOMES = new Set(['ok', 'failed', 'usage']);
const NOTICE = 'The PassionCode launcher sends anonymous usage and error counts to improve it. Turn them off for the launcher: npx @passioncode-ai/passioncode@latest analytics off (each PassionCode app has its own switch).';

// The App Key a release build carries, or null: then nothing is sent.
function appKey(file = process.env.PASSIONCODE_ANALYTICS_KEY_FILE || KEY_FILE) { // the variable is for tests: a key file of their own
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
  try { fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode: 0o600 }); fs.renameSync(tmp, file); }
  finally { fs.rmSync(tmp, { force: true }); }
}

// The notice is said once per machine even when several commands start together: the first to create this marker says it.
// The marker is a lock, not the record (`noticeAt` is): one older than a minute with no record behind it (the state file
// removed, or a run killed between the two) is stale, and is claimed again.
const NOTICE_LOCK_MS = 60_000;
function claimNotice(state, now = Date.now()) {
  const marker = path.join(state, 'analytics-notice');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try { fs.mkdirSync(state, { recursive: true }); fs.writeFileSync(marker, '', { flag: 'wx', mode: 0o600 }); return true; }
    catch (error) {
      if (error.code !== 'EEXIST' || attempt) return false;
      try { if (now - fs.statSync(marker).mtimeMs < NOTICE_LOCK_MS) return false; fs.rmSync(marker, { force: true }); } catch (_) { return false; }
    }
  }
  return false;
}

// Why nothing is sent, or null when it is on. `off` (the person's switch) wins over everything else.
// A switch file that is there but cannot be read may hold the person's off: it reads as off for this run and is never
// rewritten by a count (the same rule as Fabric Switchboard's); `analytics on` or `off` writes it again.
function unreadable(state) {
  try { const v = JSON.parse(fs.readFileSync(stateFile(state), 'utf8')); return !v || typeof v !== 'object'; }
  catch (error) { return error.code !== 'ENOENT'; }
}

function blocked({ state, env = process.env, key }) {
  if (unreadable(state)) return 'unreadable';
  const st = readState(state);
  if (st.enabled === false) return st.offBy === 'shared' ? 'off-elsewhere' : 'off';
  if (String(env.PASSIONCODE_ANALYTICS || '').toLowerCase() === 'off') return 'env';
  if (env.DO_NOT_TRACK && env.DO_NOT_TRACK !== '0') return 'do-not-track';
  if (!key) return 'no-key';
  return null;
}

function status({ state, env = process.env, key = appKey(), home = os.homedir(), platform = process.platform } = {}) {
  const pending = !blocked({ state, env, key }) && readState(state).sharedChecked !== true && sharedAnswer({ env, home, platform }) === 'unreadable';
  const why = blocked({ state, env, key }) || (pending ? 'shared-unreadable' : null) || (readState(state).noticeAt ? null : 'notice'); // on, but nothing goes before the notice
  // An unreadable switch may hold the person's off: never report it as on.
  return { enabled: why !== 'unreadable' && readState(state).enabled !== false, sending: why === null, reason: why, host: HOST };
}

function setEnabled(state, enabled) {
  const doc = readState(state);
  doc.enabled = enabled;
  delete doc.offBy; // the person's own word for the launcher, from now on
  doc.sharedChecked = true; // and final: an earlier "no" in another app is not read over it
  writeState(state, doc);
}

// A "no" the person already gave in a PassionCode app (the shared file's `analytics: false`, which Fabric's switch writes)
// is honoured once, at the first run of a counting version, and by the analytics command before it answers: it becomes the
// launcher's own off. Read only, never created here; after this one look the switch is the launcher's alone. Answers
// true when the launcher is now off because of it.
// What the shared file says about an earlier answer: absent (no file: no earlier answer), no, yes, or unreadable (it is
// there but cannot be read: not known yet, so nothing is sent until it can be, the family's rule).
function sharedAnswer({ env = process.env, home = os.homedir(), platform = process.platform } = {}) {
  let text;
  try { text = fs.readFileSync(installationPath(platform, env, home), 'utf8'); } catch (error) { return error.code === 'ENOENT' ? 'absent' : 'unreadable'; }
  try { const o = JSON.parse(text); return o && typeof o === 'object' ? (o.analytics === false ? 'no' : 'yes') : 'unreadable'; } catch (_) { return 'unreadable'; }
}

function honourSharedNo({ state, env = process.env, home = os.homedir(), platform = process.platform, key = appKey() } = {}) {
  if (blocked({ state, env, key }) || readState(state).sharedChecked === true) return false;
  const answer = sharedAnswer({ env, home, platform });
  if (answer === 'unreadable') return true; // not looked yet: this run sends nothing, a later one looks again
  const no = answer === 'no';
  try { writeState(state, { ...readState(state), sharedChecked: true, ...(no ? { enabled: false, offBy: 'shared' } : {}) }); } catch (_) { /* looked at again next run */ }
  return no;
}

const bucket = (ms) => (ms < 1000 ? 'under-1s' : ms < 10_000 ? '1-10s' : ms < 60_000 ? '10-60s' : 'over-60s');

// The events of one finished command, and the state they leave. Pure: no file, no network.
function eventsFor({ command, code, json, durationMs, version, now, st, existing = false }) {
  const out = [];
  const next = { ...st };
  if (!st.installedAt) { out.push(['app_installed', { existing: String(!!existing) }]); next.installedAt = now.toISOString(); }
  else if (st.version && st.version !== version) out.push(['app_updated', { from: String(st.version).slice(0, 30) }]);
  next.version = version;
  const day = now.toISOString().slice(0, 10);
  if (st.activeDay !== day) { out.push(['app_active', {}]); next.activeDay = day; }
  const cmd = COMMANDS.has(command) ? command : 'other'; // never the word the person typed
  const outcome = code === 0 ? 'ok' : code === 2 ? 'usage' : 'failed';
  out.push(['command_run', { command: cmd, outcome: OUTCOMES.has(outcome) ? outcome : 'failed', duration: bucket(durationMs), json: String(!!json) }]); // strings: growth's where filter reads only string properties
  if (code === 1) out.push(['app_error', { where: cmd, code: cmd === 'doctor' ? 'check-failed' : 'other' }]); // doctor's exit 1 is a check it found failing, not a launcher fault
  return { events: out, next };
}

// Write to a stream and learn whether it arrived. A real stream (an emitter) reports a closed reader (EPIPE) only later, in
// its write callback or an 'error' event, never as a throw; a stream that answers neither within the send ceiling counts
// as failed. A plain object (a test's) is answered by whether its write throws.
function say(stream, text, ms = SEND_MS) {
  if (typeof stream.once !== 'function') { try { stream.write(text); return Promise.resolve(true); } catch (_) { return Promise.resolve(false); } }
  return new Promise((resolve) => {
    let done = false;
    const end = (ok) => { if (done) return; done = true; clearTimeout(timer); stream.removeListener('error', onError); resolve(ok); };
    const onError = () => end(false);
    const timer = setTimeout(() => end(false), ms);
    stream.once('error', onError);
    try { stream.write(text, (error) => end(!error)); } catch (_) { end(false); }
  });
}

// After a command: say so once, then send its events. Answers what happened, for tests; never throws.
async function after({ command, code, json, quiet = false, existing, startedAt, version, state, env = process.env, key = appKey(), home = os.homedir(),
  platform = process.platform, now = new Date(), fetchImpl = globalThis.fetch, stderr = process.stderr } = {}) {
  try {
    if (blocked({ state, env, key })) return { sent: 0 };
    const st = readState(state);
    if (st.sharedChecked !== true) {
      if (honourSharedNo({ state, env, home, platform, key })) return { sent: 0 };
      st.sharedChecked = true;
    }
    // Whether the launcher was here before the counts, decided by the first run of a counting version whatever its flags
    // (an agent's `setup --json` writes the launcher state before any run may count): a local fact, never sent by itself.
    if (typeof st.existing !== 'boolean') {
      st.existing = existing === undefined ? fs.existsSync(path.join(state, 'state.json')) : !!existing;
      try { writeState(state, { ...readState(state), existing: st.existing }); } catch (_) { /* decided again next run */ }
    }
    let tell = false;
    if (!st.noticeAt) {
      // A program's run (--json) or a quiet one (--quiet) never carries the notice, so it sends nothing yet.
      if (json || quiet) return { sent: 0, waiting: 'notice' };
      if (!claimNotice(state, now.getTime())) return { sent: 0, waiting: 'notice' }; // another command is saying it right now
      st.noticeAt = now.toISOString();
      tell = true;
    }
    const { events, next } = eventsFor({ command, code, json, durationMs: now.getTime() - startedAt, version, now, st, existing: st.existing });
    const release = () => { if (tell) fs.rmSync(path.join(state, 'analytics-notice'), { force: true }); };
    // `analytics off` given while this command ran wins: read the switch again just before writing anything.
    const fresh = readState(state);
    if (fresh.enabled === false) { release(); return { sent: 0 }; }
    if (tell) {
      // The notice is recorded only once it is known to have been printed, so no other run can count on a notice nobody
      // saw (it finds the claim and waits). First learn, changing nothing, that the state can be written: a state that
      // cannot be written says nothing.
      try { writeState(state, fresh); } catch (error) { release(); throw error; }
      if (!(await say(stderr, NOTICE + '\n'))) { release(); return { sent: 0 }; } // not shown: nothing stored, nothing sent
    }
    // Read once more just before the write (an off saved meanwhile wins, the notice's wait included) and keep what another
    // process saved since: only this run's own keys change.
    const latest = readState(state);
    if (latest.enabled === false) {
      if (tell) { try { writeState(state, { ...latest, noticeAt: st.noticeAt }); } catch (_) { /* shown again next time */ } }
      return { sent: 0 };
    }
    const id = installId(installationPath(platform, env, home), now);
    if (!id && sharedAnswer({ env, home, platform }) !== 'absent') {
      // The shared file is there but cannot be read: send nothing this run (the family's rule), keep only the notice's record.
      if (tell) { try { writeState(state, { ...latest, noticeAt: st.noticeAt }); } catch (_) { /* shown again next time */ } }
      return { sent: 0 };
    }
    try { writeState(state, { ...latest, ...next, ...('enabled' in latest ? { enabled: latest.enabled } : {}) }); } catch (error) { release(); throw error; } // nothing sent; the next run tries again
    if (!fetchImpl) return { sent: 0 };
    const environment = /^\d+\.\d+\.\d+$/.test(version) ? 'production' : 'sandbox'; // any pre-release or build tag is sandbox
    const sessionId = String(Math.floor(now.getTime() / 1000)) + String(crypto.randomInt(1e8)).padStart(8, '0'); // a string: a number this long loses digits
    const body = events.map(([eventName, props]) => ({
      timestamp: now.toISOString(), sessionId, eventName,
      systemProps: { isDebug: environment !== 'production', osName: os.type(), osVersion: String(os.release()).slice(0, 100),
        locale: String(Intl.DateTimeFormat().resolvedOptions().locale || '').slice(0, 10), appVersion: String(version).slice(0, 50),
        appBuildNumber: '', sdkVersion: SDK_VERSION, engineName: 'Node', engineVersion: process.versions.node },
      props: { ...props, surface: 'cli', ...(id ? { iid: id, install_id: id } : {}), environment }, // install_id: the family's join key, always iid
    }));
    const res = await fetchImpl(`${HOST}/api/v0/events`, { method: 'POST', headers: { 'App-Key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(SEND_MS) });
    return { sent: res && res.ok ? body.length : 0, body };
  } catch (_) { return { sent: 0 }; }
}

module.exports = { HOST, NOTICE, KEY_FILE, COMMANDS, appKey, installationPath, installId, readState, status, setEnabled, honourSharedNo, eventsFor, after, bucket };
// #endregion usage-analytics
