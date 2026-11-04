'use strict';
// PC-117: the standard Claude Code permission rules for PassionCode's own MCP tools, which setup installs on
// the person's yes (fabric-workspace knowledge/agents-first.md, "When Claude Code's auto mode refuses...").
// A rule names a whole server (`mcp__<server>` allows every tool of it). Rules are merged into the user's
// settings.json: every other key, rule and ordering is kept, and a file that cannot be read is never written.
const fs = require('fs');
const path = require('path');

// Switchboard reaches Claude Code either as its own server or through its plugin (lib/launcher.js), named apart.
const RULES = Object.freeze(['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard', 'mcp__observatory']);

// The settings document, or why it cannot be merged into. A missing file is an empty document.
function load(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return { doc: {} }; return { error: `${file} cannot be read: ${error.message}` }; }
  let doc;
  try { doc = JSON.parse(text); }
  catch (error) { return { error: `${file} is not valid JSON: ${error.message}` }; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return { error: `${file} does not hold a settings object` };
  const perms = doc.permissions;
  if (perms !== undefined && (!perms || typeof perms !== 'object' || Array.isArray(perms))) return { error: `${file}: "permissions" is not an object` };
  for (const list of ['allow', 'deny']) {
    if (perms && perms[list] !== undefined && !Array.isArray(perms[list])) return { error: `${file}: "permissions.${list}" is not a list` };
  }
  return { doc };
}

// The rules a settings document lacks, leaving out one the person denies or wants asked about (deny and ask rules
// win over allow in Claude Code).
function lacking(doc) {
  const perms = doc.permissions || {};
  const have = new Set([...(perms.allow || []), ...(perms.deny || []), ...(Array.isArray(perms.ask) ? perms.ask : [])]);
  return RULES.filter((rule) => !have.has(rule));
}

function missing(file) {
  const { doc, error } = load(file);
  return error ? { rules: [], error } : { rules: lacking(doc), error: null };
}

// Adds the missing rules to permissions.allow, after the ones there; answers the rules added. A settings file that
// is a link is written where it points, and keeps its permission bits (it can hold secrets under `env`).
function apply(file) {
  const { doc, error } = load(file);
  if (error) throw new Error(error);
  const rules = lacking(doc);
  if (!rules.length) return [];
  doc.permissions = doc.permissions || {};
  doc.permissions.allow = [...(doc.permissions.allow || []), ...rules];
  // A link, even one whose target is missing, is written where it points.
  const link = fs.lstatSync(file, { throwIfNoEntry: false });
  const target = link && link.isSymbolicLink() ? path.resolve(path.dirname(file), fs.readlinkSync(file)) : file;
  const mode = fs.existsSync(target) ? fs.statSync(target).mode & 0o777 : 0o600;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n', { mode });
    fs.chmodSync(tmp, mode); // the umask does not narrow it
    fs.renameSync(tmp, target);
  } catch (writeError) {
    fs.rmSync(tmp, { force: true });
    throw writeError;
  }
  return rules;
}

module.exports = { RULES, missing, apply };
