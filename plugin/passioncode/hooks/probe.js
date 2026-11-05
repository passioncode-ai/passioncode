#!/usr/bin/env node
// Detached: asks npm for the published version, who publishes it and its signed integrity
// and provenance, and records them with the time. The session-start hook decides from this record alone.
'use strict';
const { execFile } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PACKAGE, REGISTRY_ARGS, parseView, recordProbe, releaseProbe, checkEvent, npmCommand } = require('./update-check');
const { logEvent } = require('./update-log');

const DIR = process.env.PASSIONCODE_HOME || path.join(os.homedir(), '.passioncode');
const STATE = path.join(DIR, 'state.json');
const [npm, npmPre] = npmCommand('npm'); // npm's own script through this Node on Windows (PC-135)
execFile(npm, [...npmPre, 'view', ...REGISTRY_ARGS, PACKAGE, 'version', 'maintainers', '_npmUser', 'dist', '--json'], { timeout: 30000, windowsHide: true }, (error, stdout) => {
  try { record(error, stdout); } finally { releaseProbe(DIR); } // the hook claimed probe.pending before it started us
});

function record(error, stdout) {
  let state = {};
  try { state = JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (_) { /* first run */ }
  const result = parseView(stdout, error);
  const next = recordProbe(state, result);
  const event = checkEvent(next);
  if (event) {
    logEvent(DIR, 'update_check', event.outcome);
    next.lastCheckEvent = event.key;
  }
  fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${STATE}.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2));
  fs.renameSync(tmp, STATE);
  process.stdout.write(`${next.checkedAt} ${result.checkError ? `check failed: ${result.checkError}` : result.published ? `latest ${result.latest} by ${result.maintainers.join(', ') || '(unreadable maintainers)'}` : `${PACKAGE} is not published`}\n`);
}
