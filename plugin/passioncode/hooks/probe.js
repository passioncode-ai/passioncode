#!/usr/bin/env node
// Detached: asks npm for the published version AND who publishes it, and records
// both with the time. The session-start hook decides from this record alone.
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PACKAGE, parseView, recordProbe, releaseProbe } = require('./update-check');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
execFile('npm', ['view', PACKAGE, 'version', 'maintainers', '_npmUser', '--json'], { timeout: 30000 }, (error, stdout) => {
  try { record(error, stdout); } finally { releaseProbe(DIR); } // the hook claimed probe.pending before it started us
});

function record(error, stdout) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { /* first run */ }
  const result = parseView(stdout, error);
  const next = recordProbe(state, result);
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${STATE}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATE);
  process.stdout.write(`${next.checkedAt} ${result.checkError ? `check failed: ${result.checkError}` : result.published ? `latest ${result.latest} by ${result.maintainers.join(', ') || '(unreadable maintainers)'}` : `${PACKAGE} is not published`}\n`);
}
