#!/usr/bin/env node
// Detached: asks npm for the published version and records it with the time.
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
execFile('npm', ['view', 'passioncode', 'version'], { timeout: 30000 }, (error, stdout) => {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { /* first run */ }
  state.checkedAt = new Date().toISOString();
  if (!error && /^\d+\.\d+\.\d+/.test(String(stdout).trim())) state.latest = String(stdout).trim();
  else state.checkError = error ? String(error.message).slice(0, 200) : 'no version in the answer';
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${STATE}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STATE);
});
