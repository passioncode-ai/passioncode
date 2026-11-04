'use strict';
// PC-117: the standard Claude Code permission rules for PassionCode's own MCP tools, which setup installs on
// the person's yes (fabric-workspace knowledge/agents-first.md, "When Claude Code's auto mode refuses...").
// A rule names a whole server (`mcp__<server>` allows every tool of it). Rules are merged into the user's
// settings.json: every other key, rule and ordering is kept, and a file that cannot be read is never written.
const fs = require('fs');
const path = require('path');

const RULES = Object.freeze(['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__observatory']);

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

// The rules this file lacks, leaving out one the person denies (a deny rule wins in Claude Code anyway).
function missing(file) {
  const { doc, error } = load(file);
  if (error) return { rules: [], error };
  const perms = doc.permissions || {};
  const have = new Set([...(perms.allow || []), ...(perms.deny || [])]);
  return { rules: RULES.filter((rule) => !have.has(rule)), error: null };
}

// Adds the missing rules to permissions.allow, after the ones there; answers the rules added.
function apply(file) {
  const { doc, error } = load(file);
  if (error) throw new Error(error);
  const { rules } = missing(file);
  if (!rules.length) return [];
  doc.permissions = doc.permissions || {};
  doc.permissions.allow = [...(doc.permissions.allow || []), ...rules];
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, file);
  return rules;
}

module.exports = { RULES, missing, apply };
