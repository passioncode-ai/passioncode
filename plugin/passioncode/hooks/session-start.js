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
const { decide, loadTrust, claimProbe, releaseProbe } = require('./update-check');
const { rulesLine } = require('./repo-rules');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
const DAY = 24 * 60 * 60 * 1000;

function read(file, fallback) {
  try { const doc = JSON.parse(fs.readFileSync(file, 'utf8')); return doc && typeof doc === 'object' && !Array.isArray(doc) ? doc : fallback; }
  catch (_) { return fallback; }
}
function detached(cmd, args, logName) {
  return new Promise((resolve) => {
    let out;
    try {
      fs.mkdirSync(path.join(DIR, 'logs'), { recursive: true });
      out = fs.openSync(path.join(DIR, 'logs', logName), 'a');
      const child = spawn(cmd, args, { detached: true, stdio: ['ignore', out, out], env: process.env });
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
  if ((!Number.isFinite(age) || age < 0 || age > DAY) && claimProbe(DIR, now)) {
    if (!await detached(process.execPath, [path.join(__dirname, 'probe.js')], 'probe.log')) releaseProbe(DIR);
  }
  const { lines, spawn: args, stateChanges } = decide(state, loadTrust(), now);
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
  if (args && !await detached('npx', args, 'update.log')) {
    const fresh = read(STATE, {});
    if (fresh.updatingSince === stateChanges.updatingSince) {
      delete fresh.updatingSince;
      const tmp = `${STATE}.${process.pid}.hook`;
      fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
      fs.renameSync(tmp, STATE);
    }
    lines.pop(); // decide appends the update-start notice last when it returns args
    lines.push('[passioncode] could not start the background update; check that npx is on PATH and retry next session.');
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
    lines.push(`[passioncode] the setup check of ${when} found ${fails} problem(s)${ids.length ? ` (${ids.join(', ')}${last.failed.length > 3 ? ', …' : ''})` : ''}; \`npx @passioncode-ai/passioncode@latest setup\` repairs them, \`doctor\` shows them.`);
  }
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
}
main().catch(() => { /* never fail a session start */ });
