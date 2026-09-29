#!/usr/bin/env node
// SessionStart: never blocks, never fails the session. Reads the cached check,
// starts a detached probe at most once a day, and — only when a newer version is
// out, every one of its npm publishers is in trust.json, and auto-update is on —
// a detached `npx --yes @passioncode-ai/passioncode@<that exact version> update`. What was
// verified is what runs; the update lands for the NEXT session.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { decide, loadTrust } = require('./update-check');
const { rulesLine } = require('./repo-rules');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
const DAY = 24 * 60 * 60 * 1000;

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function detached(cmd, args, logName) {
  try {
    fs.mkdirSync(path.join(DIR, 'logs'), { recursive: true });
    const out = fs.openSync(path.join(DIR, 'logs', logName), 'a');
    spawn(cmd, args, { detached: true, stdio: ['ignore', out, out], env: process.env }).unref();
    return true;
  } catch (_) { return false; /* a missing npm must not break the session */ }
}

try {
  const state = read(STATE, {});
  const now = Date.now();
  if (!state.checkedAt || !(now - Date.parse(state.checkedAt) <= DAY)) {
    detached(process.execPath, [path.join(__dirname, 'probe.js')], 'probe.log');
  }
  const { lines, spawn: args, stateChanges } = decide(state, loadTrust(), now);
  if (args && !detached('npx', args, 'update.log')) delete stateChanges.updatingSince;
  if (Object.keys(stateChanges).length) {
    // Re-read: the probe may have written meanwhile; only our own keys change.
    const fresh = { ...read(STATE, {}), ...stateChanges };
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${STATE}.${process.pid}.hook`;
    fs.writeFileSync(tmp, JSON.stringify(fresh, null, 2));
    fs.renameSync(tmp, STATE);
  }
  // Claude Code passes the session's directory on stdin; the process cwd is the fallback.
  let cwd = process.cwd();
  try { const input = JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); if (input && typeof input.cwd === 'string') cwd = input.cwd; } catch (_) { /* no stdin */ }
  const rules = rulesLine(cwd);
  if (rules) lines.unshift(rules);
  if (lines.length) process.stdout.write(lines.join('\n') + '\n');
} catch (_) { /* never fail a session start */ }
