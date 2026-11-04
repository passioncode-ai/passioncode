'use strict';
// PC-125: the ledger of Claude Code permission rules PassionCode installed, and the `permissions` command that reads
// and changes them for Fabric's permissions screen. The ledger (`<state>/permissions.json`) is written by setup when it
// adds rules and by `permissions allow`, `remove` and `mode`; it is never the truth about what Claude Code allows, the
// settings file is: `view` joins the two. Only rules PassionCode offers are allowed or removed here; every other rule
// in the settings file is listed as foreign and never touched. Writes to the settings file go through
// permissions.write (a link is written where it points, its permission bits kept).
const fs = require('fs');
const os = require('os');
const path = require('path');
const permissions = require('./permissions');

const SCHEMA = 'passioncode-permissions/1';
const MODES = Object.freeze(['default', 'acceptEdits', 'plan', 'auto', 'dontAsk', 'bypassPermissions']); // Claude Code's permission modes (its permissions docs)
const LAUNCHER = 'PassionCode setup';
// What each of PassionCode's own tool rules allows, in the words setup's plan uses for the set.
const TOOL_WHY = "let Claude Code use this PassionCode server's tools without asking";

function ledgerFile(state) { return path.join(state, 'permissions.json'); }

// The ledger, or an empty one when there is none yet; a ledger that cannot be read is an error, never overwritten.
function read(state) {
  const file = ledgerFile(state);
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { doc: { schema: SCHEMA, rules: [], mode: null } }; return { error: `${file} cannot be read: ${error.message}` }; }
  let doc;
  try { doc = JSON.parse(text); } catch (error) { return { error: `${file} is not valid JSON: ${error.message}` }; }
  if (!doc || typeof doc !== 'object' || doc.schema !== SCHEMA || !Array.isArray(doc.rules)) return { error: `${file} is not a ${SCHEMA} ledger` };
  return { doc: { schema: SCHEMA, rules: doc.rules, mode: doc.mode || null } };
}

function save(state, doc) {
  fs.mkdirSync(state, { recursive: true });
  permissions.write(ledgerFile(state), doc); // the launcher's own file: private, a link kept like any other
}

// Every rule PassionCode offers now, with what it allows, who declared it and where it came from.
function known(state, home) {
  const tools = permissions.RULES.map((rule) => ({ rule, set: 'tools', why: TOOL_WHY, by: LAUNCHER, source: 'launcher' }));
  const cmds = permissions.commandSet(state, home);
  const commands = cmds.rules.map((r) => ({ rule: r.rule, set: 'commands', why: r.why, by: r.by || LAUNCHER, source: cmds.sources[r.rule] || 'launcher' }));
  return { rules: [...tools, ...commands], refused: cmds.refused };
}

// Records rules setup or `permissions allow` just added. `by` is who asked: setup itself, or Fabric's words.
function record(state, settingsFile, added, { by, version, now = new Date() } = {}) {
  if (!added.length) return;
  const { doc, error } = read(state);
  if (error) throw new Error(error);
  const at = now.toISOString();
  for (const r of added) {
    const entry = { rule: r.rule, set: r.set, why: r.why, by: by || r.by || LAUNCHER, source: r.source || 'launcher', installedAt: at, version: version || null };
    const n = doc.rules.findIndex((x) => x.rule === r.rule);
    if (n === -1) doc.rules.push(entry); else doc.rules[n] = entry; // installed again: the newest act is the one shown
  }
  save(state, { ...doc, settingsFile });
}

// The state of one rule in the settings document.
function stateOf(perms, rule) {
  if ((perms.deny || []).includes(rule)) return 'denied';
  if ((perms.ask || []).includes(rule)) return 'asked';
  if ((perms.allow || []).includes(rule)) return 'allowed';
  return 'missing';
}

// What Fabric's screen shows: the rules PassionCode installed (from the ledger, and those of its sets the person allowed
// before the ledger existed, `installedAt: null`), each with its state now; what setup would offer now; the declarations
// it refuses; every other allow rule (foreign); and the default mode.
function view(home, settingsFile, state) {
  const settings = permissions.load(settingsFile);
  const ledger = read(state);
  const sets = known(state, home);
  const result = { schema: SCHEMA, settingsFile, readable: !settings.error, mode: { value: null, file: settingsFile }, rules: [], offered: [], refused: sets.refused, foreign: [] };
  if (settings.error) result.error = settings.error;
  if (ledger.error) result.ledgerError = ledger.error;
  const perms = (settings.doc && settings.doc.permissions) || {};
  if (settings.doc && perms.defaultMode !== undefined) result.mode.value = perms.defaultMode;
  const recorded = ledger.doc ? ledger.doc.rules : [];
  const seen = new Set();
  for (const r of recorded) {
    seen.add(r.rule);
    result.rules.push({ ...r, state: settings.error ? 'unknown' : stateOf(perms, r.rule) });
  }
  if (!settings.error) {
    for (const r of sets.rules) {
      if (seen.has(r.rule)) continue;
      const st = stateOf(perms, r.rule);
      if (st === 'missing') result.offered.push(r);
      else { seen.add(r.rule); result.rules.push({ ...r, installedAt: null, version: null, state: st }); }
    }
    result.foreign = (perms.allow || []).filter((rule) => !seen.has(rule));
  }
  if (ledger.doc && ledger.doc.mode) result.mode.changed = ledger.doc.mode;
  return result;
}

// Adds rules PassionCode offers; a rule it does not offer is refused before anything is written.
function allow(home, settingsFile, state, wanted, { by, version } = {}) {
  const sets = known(state, home);
  const unknown = wanted.filter((rule) => !sets.rules.some((r) => r.rule === rule));
  if (unknown.length) throw Object.assign(new Error(`not a rule PassionCode offers: ${unknown.join(', ')}`), { code: 'EUSAGE' });
  const added = permissions.apply(settingsFile, wanted);
  record(state, settingsFile, sets.rules.filter((r) => added.includes(r.rule)), { by, version });
  return { added, view: view(home, settingsFile, state) };
}

// Takes rules PassionCode installed or offers out of permissions.allow; any other rule is refused.
function remove(home, settingsFile, state, rules, { by, now = new Date() } = {}) {
  const sets = known(state, home);
  const ledger = read(state);
  if (ledger.error) throw new Error(ledger.error);
  const ours = (rule) => sets.rules.some((r) => r.rule === rule) || ledger.doc.rules.some((r) => r.rule === rule);
  const foreign = rules.filter((rule) => !ours(rule));
  if (foreign.length) throw Object.assign(new Error(`not a rule PassionCode installed: ${foreign.join(', ')}; remove it in ${settingsFile} yourself`), { code: 'EUSAGE' });
  const { doc, error } = permissions.load(settingsFile);
  if (error) throw new Error(error);
  const allowList = (doc.permissions && doc.permissions.allow) || [];
  const removed = rules.filter((rule) => allowList.includes(rule));
  if (removed.length) {
    doc.permissions.allow = allowList.filter((rule) => !removed.includes(rule));
    permissions.write(settingsFile, doc);
  }
  const at = now.toISOString();
  for (const rule of removed) {
    const n = ledger.doc.rules.findIndex((r) => r.rule === rule);
    const base = n === -1 ? { ...sets.rules.find((r) => r.rule === rule), installedAt: null, version: null } : ledger.doc.rules[n];
    const entry = { ...base, removedAt: at, removedBy: by || LAUNCHER };
    if (n === -1) ledger.doc.rules.push(entry); else ledger.doc.rules[n] = entry;
  }
  if (removed.length) save(state, { ...ledger.doc, settingsFile });
  return { removed, view: view(home, settingsFile, state) };
}

// Sets Claude Code's default permission mode (permissions.defaultMode), one of MODES; nothing else changes.
function mode(home, settingsFile, state, value, { by, now = new Date() } = {}) {
  if (!MODES.includes(value)) throw Object.assign(new Error(`mode must be one of ${MODES.join(', ')}`), { code: 'EUSAGE' });
  const ledger = read(state);
  if (ledger.error) throw new Error(ledger.error);
  const { doc, error } = permissions.load(settingsFile);
  if (error) throw new Error(error);
  doc.permissions = doc.permissions || {};
  const before = doc.permissions.defaultMode === undefined ? null : doc.permissions.defaultMode;
  if (before !== value) {
    doc.permissions.defaultMode = value;
    permissions.write(settingsFile, doc);
    save(state, { ...ledger.doc, settingsFile, mode: { value, from: before, by: by || LAUNCHER, changedAt: now.toISOString() } });
  }
  return { changed: before !== value, from: before, view: view(home, settingsFile, state) };
}

module.exports = { SCHEMA, MODES, LAUNCHER, ledgerFile, read, record, view, allow, remove, mode, known };
