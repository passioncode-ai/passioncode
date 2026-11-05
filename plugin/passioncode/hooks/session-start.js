#!/usr/bin/env node
// SessionStart: never blocks, never fails the session. Reads the cached check,
// starts a detached probe at most once a day, and — only when a newer version is
// out, every one of its npm publishers is in trust.json, and auto-update is on —
// a detached `npx --yes @passioncode-ai/passioncode@<that exact version> update`. What was
// verified is what runs; the update lands for the NEXT session. It also repeats the last saved
// setup check (~/.passioncode/doctor.json) while that has failures; it never runs the check.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide, loadTrust, loadRegistryKeys, needsProbe, claimProbe, releaseProbe, npmCommand } = require('./update-check');
const { rulesLine } = require('./repo-rules');
const { openLog, logEvent } = require('./update-log');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
/** A path as a person types it: the home folder as ~. */
const shown = (p) => (p.startsWith(os.homedir() + path.sep) ? `~${p.slice(os.homedir().length)}` : p);

function read(file, fallback) {
  try { const doc = JSON.parse(fs.readFileSync(file, 'utf8')); return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : fallback; }
  catch (_) { return fallback; }
}
/**
 * The folder the probe and the update run in. Started from the session's folder, npm would take a copy of the
 * package from that project's node_modules (no download, nothing verified) and read that project's .npmrc;
 * here npm finds this empty package.json first and stops (PC-131, ADR-0005).
 */
function runDir() {
  const dir = path.join(DIR, 'run');
  fs.mkdirSync(dir, { recursive: true });
  const manifest = path.join(dir, 'package.json');
  if (!fs.existsSync(manifest)) fs.writeFileSync(manifest, '{ "private": true }\n');
  return dir;
}

function detached(cmd, args, logName) {
  return new Promise((resolve) => {
    let out;
    try {
      out = openLog(path.join(DIR, 'logs', logName)); // rotated at 5 MB, five files, 0600 (LC-12)
      const cwd = runDir();
      // PC-123: the background update sends no counts; PASSIONCODE_UPDATE_FROM lets it log its download as done (LC-16).
      const child = spawn(cmd, args, { cwd, detached: true, windowsHide: true, stdio: ['ignore', out, out], env: { ...process.env, PASSIONCODE_ANALYTICS: 'off', PASSIONCODE_UPDATE_FROM: 'session-start' } });
      child.once('error', () => resolve(false));
      child.once('spawn', () => { child.unref(); resolve(true); });
    } catch (_) { resolve(false); }
    finally { if (out !== undefined) fs.closeSync(out); }
  });
}

async function main() {
  const state = read(STATE, {});
  const now = Date.now();
  const age = now - Date.parse(state.checkedAt);
  // The marker is claimed before the spawn: sessions restored together start one probe.
  if ((!Number.isFinite(age) || age < 0 || age > DAY || needsProbe(state)) && claimProbe(DIR, now)) {
    if (!await detached(process.execPath, [path.join(__dirname, 'probe.js')], 'probe.log')) releaseProbe(DIR);
  }
  const { lines, spawn: args, stateChanges, events, refused } = decide(state, loadTrust(), now, loadRegistryKeys());
  for (const e of events) logEvent(DIR, e.event, e.outcome, e.reason);
  if (Object.keys(stateChanges).length) {
    // Re-read: the probe may have written meanwhile; only our own keys change.
    const fresh = { ...read(STATE, {}), ...stateChanges };
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${STATE}.${process.pid}.hook`;
    fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
    fs.renameSync(tmp, STATE);
  }
  // Record the attempt before spawning: a fast update must not finish and then
  // have this hook put the old "running" marker back.
  // A new, empty cache folder for each update, so npx downloads the verified version and npm checks it, instead of
  // reusing a copy an earlier `npx` cached under other settings (the global npm tree is still npm's own, PC-142).
  // Without one the update does not start. Every session start removes cache folders older than an hour except the
  // one the last update recorded (`updateCache`): an update runs from its folder, npx keeps the package inside it.
  try {
    const run = path.join(DIR, 'run');
    const keep = read(STATE, {}).updateCache;
    for (const name of fs.existsSync(run) ? fs.readdirSync(run) : []) {
      if (!/^cache(-|$)/.test(name)) continue;
      const folder = path.join(run, name);
      if (folder === keep) continue;
      try { if (now - fs.statSync(folder).mtimeMs > HOUR) fs.rmSync(folder, { recursive: true, force: true }); } catch (_) { /* in use or gone */ }
    }
  } catch (_) { /* the next session tries again */ }
  let updateArgs = null;
  let cacheDir = null;
  let failure = 'spawn';
  let earlierCache; // the folder an earlier update recorded, put back if this one does not start
  if (args) {
    try {
      cacheDir = fs.mkdtempSync(path.join(runDir(), 'cache-'));
      updateArgs = [args[0], `--cache=${cacheDir}`, ...args.slice(1)];
    } catch (_) {
      failure = 'cache';
    }
    if (updateArgs) {
      // npm's own debug logs go beside the update log (0700, five kept); without that folder npm keeps its default
      // place, inside this cache folder (swept with it), and the update still runs.
      try {
        const npmLogs = path.join(DIR, 'logs', 'npm');
        fs.mkdirSync(npmLogs, { recursive: true, mode: 0o700 });
        try { fs.chmodSync(npmLogs, 0o700); } catch (_) { /* Windows keeps its own ACLs */ }
        updateArgs.splice(2, 0, `--logs-dir=${npmLogs}`, '--logs-max=5');
      } catch (_) { /* default npm logs */ }
      // The folder the update runs from: kept by later sweeps until another update records its own.
      // A write that fails moments after the one above succeeded (a full disk, a race) does not stop the update; its
      // folder is then kept by its age alone. An unwritable state.json already stopped the hook above (PC-143).
      try {
        const current = read(STATE, {});
        earlierCache = current.updateCache;
        const fresh = { ...current, updateCache: cacheDir };
        const tmp = `${STATE}.${process.pid}.hook`;
        fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
        fs.renameSync(tmp, STATE);
      } catch (_) { /* the sweep's one-hour age protects it */ }
    }
  }
  const [npx, npxPre] = npmCommand('npx'); // npm's own npx through this Node on Windows (PC-135)
  if (args && (!updateArgs || !await detached(npx, [...npxPre, ...updateArgs], 'update.log'))) {
    const fresh = read(STATE, {});
    if (fresh.updatingSince === stateChanges.updatingSince) {
      delete fresh.updatingSince;
      if (fresh.updateCache === cacheDir) {
        if (typeof earlierCache === 'string') fresh.updateCache = earlierCache;
        else delete fresh.updateCache;
      }
      const tmp = `${STATE}.${process.pid}.hook`;
      fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
      fs.renameSync(tmp, STATE);
    }
    logEvent(DIR, 'update_install', 'failed', failure);
    if (cacheDir) try { fs.rmSync(cacheDir, { recursive: true, force: true }); } catch (_) { /* nothing ran from it; the hourly sweep removes it */ }
    lines.pop(); // decide appends the update-start notice last when it returns args
    lines.push(failure === 'cache'
      ? `[passioncode] could not start the background update: its folder ${shown(path.join(DIR, 'run'))} cannot be written; make it writable (or remove it) and it is tried again next session.`
      : '[passioncode] could not start the background update; check that npx is on PATH and retry next session.');
  }
  // Claude Code passes the session's directory on stdin; the process cwd is the fallback.
  let cwd = process.cwd();
  try { const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (input && typeof input.cwd === 'string') cwd = input.cwd; } catch (_) { /* no stdin */ }
  const rules = rulesLine(cwd);
  if (rules) lines.unshift(rules);
  // The last saved setup check (ADR-0004): one line while it has failures. Doctor itself never runs here.
  const last = read(path.join(DIR, 'doctor.json'), null);
  const fails = last && last.summary && Number(last.summary.fail);
  // An update since that check may have fixed what it found: a result older than the installed
  // release is not repeated (the next doctor or setup writes a fresh one).
  const stale = last && Date.parse(state.installedAt) > Date.parse(last.at);
  if (fails > 0 && !stale) {
    const ids = Array.isArray(last.failed) ? last.failed.filter((x) => typeof x === 'string').slice(0, 3) : [];
    const when = typeof last.at === 'string' ? last.at.slice(0, 10) : 'an earlier session';
    // A release train this launcher cannot use is not repaired by plain setup (PC-89).
    const how = Array.isArray(last.failed) && last.failed.includes('train') ? 'setup --yes --no-apps --train none` (or a train this launcher ships) clears the unusable release train, `doctor' : 'setup` repairs them, `doctor';
    // While the latest version is refused, or not yet checked, `@latest` would run it: name the installed one instead.
    const pin = (refused || needsProbe(state)) && /^\d+\.\d+\.\d+$/.test(String(state.installed)) ? state.installed : 'latest';
    lines.push(`[passioncode] the setup check of ${when} found ${fails} problem(s)${ids.length ? ` (${ids.join(', ')}${last.failed.length > 3 ? ', …' : ''})` : ''}; \`npx @passioncode-ai/passioncode@${pin} ${how}\` shows them.`);
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
}
main().catch(() => { /* never fail a session start */ });
