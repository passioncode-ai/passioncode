#!/usr/bin/env node
// SessionStart: never blocks, never fails the session. Reads the cached check,
// starts a detached `npm view` at most once a day, and — when a newer set is
// out and auto-update is on — a detached `npx passioncode@latest update`.
// The update lands for the NEXT session; nothing changes mid-work.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
const DAY = 24 * 60 * 60 * 1000;

function read(file, fallback) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return fallback; } }
function newer(a, b) {
  const pa = String(a || '').split('.').map(Number); const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}
function detached(cmd, args, logName) {
  try {
    fs.mkdirSync(path.join(DIR, 'logs'), { recursive: true });
    const out = fs.openSync(path.join(DIR, 'logs', logName), 'a');
    spawn(cmd, args, { detached: true, stdio: ['ignore', out, out], env: process.env }).unref();
  } catch (_) { /* a missing npm must not break the session */ }
}

try {
  const state = read(STATE, {});
  const now = Date.now();
  if (!state.checkedAt || now - Date.parse(state.checkedAt) > DAY) {
    detached(process.execPath, [path.join(__dirname, 'probe.js')], 'probe.log');
  }
  if (state.installed && state.latest && newer(state.latest, state.installed)) {
    const auto = (state.config && state.config.auto) !== false;
    const running = state.updatingSince && now - Date.parse(state.updatingSince) < 10 * 60 * 1000;
    if (auto && !running) {
      detached('npx', ['--yes', 'passioncode@latest', 'update', '--quiet'], 'update.log');
      process.stdout.write(`[passioncode] ${state.latest} is out (you have ${state.installed}); updating in the background — it takes effect next session.\n`);
    } else if (!auto) {
      process.stdout.write(`[passioncode] ${state.latest} is out (you have ${state.installed}): npx passioncode@latest update\n`);
    }
  }
} catch (_) { /* never fail a session start */ }
