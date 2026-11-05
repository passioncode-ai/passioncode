'use strict';
/**
 * The self-update's log (LC-12, LC-16): one line per event, codes only, in
 * `<state>/logs/update-events.log`; and the size cap every update log keeps. A log reaches
 * MAX_BYTES, then moves to `.1` (`.1` to `.2`, up to KEEP files in all) and starts again,
 * mode 0600. `lib/update-log.js` is a byte-for-byte copy for the CLI, which ships without
 * the plugin's folder; test/self-update.test.js holds the two equal.
 */
const fs = require('fs');
const path = require('path');

const EVENTS = 'update-events.log';
const MAX_BYTES = 5 * 1024 * 1024;
const KEEP = 5;
const CODE = /^[a-z0-9_.-]{1,40}$/;

/** Moves a log that reached the cap aside, keeping KEEP files in all. Never throws. */
function rotateLog(file, max = MAX_BYTES, keep = KEEP) {
  try {
    if (fs.statSync(file).size < max) return false;
    fs.rmSync(`${file}.${keep - 1}`, { force: true });
    for (let i = keep - 2; i >= 1; i -= 1) {
      try { fs.renameSync(`${file}.${i}`, `${file}.${i + 1}`); } catch (_) { /* a gap in the series */ }
    }
    fs.renameSync(file, `${file}.1`);
    return true;
  } catch (_) {
    return false;
  }
}

/** Opens a log for appending after rotating it: created 0600, an older file made 0600. */
function openLog(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  rotateLog(file);
  const fd = fs.openSync(file, 'a', 0o600);
  try { fs.fchmodSync(fd, 0o600); } catch (_) { /* Windows keeps its own ACLs */ }
  return fd;
}

/** Appends `<ISO time> <event> <outcome>[ <reason>]`. Only codes are written; anything else is dropped. Never throws. */
function logEvent(dir, event, outcome, reason, now = new Date()) {
  if (!CODE.test(String(event)) || !CODE.test(String(outcome)) || (reason !== undefined && !CODE.test(String(reason)))) return false;
  let fd;
  try {
    fd = openLog(path.join(dir, 'logs', EVENTS));
    fs.writeSync(fd, `${now.toISOString()} ${event} ${outcome}${reason === undefined ? '' : ` ${reason}`}\n`);
    return true;
  } catch (_) {
    return false;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (_) { /* already closed */ }
  }
}

module.exports = { EVENTS, MAX_BYTES, KEEP, rotateLog, openLog, logEvent };
