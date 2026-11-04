'use strict';
// PC-117: the standard Claude Code permission rules for PassionCode's own MCP tools, which setup installs on
// the person's yes (fabric-workspace knowledge/agents-first.md, "When Claude Code's auto mode refuses...").
// A rule names a whole server (`mcp__<server>` allows every tool of it). Rules are merged into the user's
// settings.json: every other key, rule and ordering is kept, and a file that cannot be read is never written.
const fs = require('fs');
const path = require('path');

// Switchboard reaches Claude Code either as its own server or through its plugin (lib/launcher.js), named apart.
const RULES = Object.freeze(['mcp__fabric', 'mcp__fabric-dashboards', 'mcp__switchboard', 'mcp__plugin_switchboard_switchboard', 'mcp__observatory']);

// PC-119: shell commands agents need, offered apart from the MCP rules (their own question, or --allow-commands).
// This launcher is public, so it carries only rules any person may want; an agent of the person's own declares its
// rules on the machine (`declared`), never in this repository. Each rule says what it allows and what it cannot limit.
const COMMANDS = Object.freeze([
  Object.freeze({ rule: 'Bash(gh pr merge:*)', why: 'merge a pull request with the GitHub CLI; the rule cannot be limited to your repositories' }),
]);

// Programs that run whatever they are given: a rule that names only them (and one more word) allows everything.
const RUNNERS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'pwsh', 'powershell', 'cmd', 'python', 'python3', 'node', 'deno', 'bun',
  'bunx', 'ruby', 'perl', 'php', 'env', 'sudo', 'xargs', 'eval', 'exec', 'uv', 'uvx', 'npx', 'npm', 'pnpm', 'yarn', 'docker', 'podman']);

// Why a declared rule is not offered, or null. A rule names one MCP server or tool (`mcp__<server>[__<tool>]`) or one
// command (`Bash(<command>)`, `:*` or a trailing ` *` for any arguments); a command with a substitution, a separator or
// a wildcard elsewhere, and a wildcard after a runner alone, are refused, so a rule never allows more than it says.
function refusal(rule) {
  if (typeof rule !== 'string') return 'a rule is not text';
  if (/^mcp__[A-Za-z0-9_-]+$/.test(rule)) return null;
  const m = /^Bash\((.+)\)$/.exec(rule);
  if (!m) return `${rule}: a rule names an MCP server (mcp__<server>) or a command (Bash(<command>))`;
  if (/[$`;&|<>\n]/.test(m[1])) return `${rule}: a command with a substitution, a separator or a redirection is not offered`;
  const wild = /(?::\*| \*)$/.exec(m[1]);
  const head = wild ? m[1].slice(0, wild.index) : m[1];
  if (!head.replace(/\*/g, '').trim()) return `${rule}: it would allow any command`;
  if (head.includes('*')) return `${rule}: a wildcard is allowed only at the end`;
  const words = head.trim().split(/\s+/);
  if (wild && words.length < (RUNNERS.has(words[0]) ? 3 : 2)) return `${rule}: it would allow any command of ${words[0]}`;
  return null;
}

// The rules agents of the person's own declare on this machine: every `*.json` in `dir`, each
// `{ "by": "<agent>", "rules": [{ "rule": "...", "why": "..." }] }`. A file or rule that is not offered is named.
function declared(dir) {
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); }
  catch (error) { return { rules: [], refused: error.code === 'ENOENT' ? [] : [`${dir} cannot be read: ${error.message}`] }; }
  const rules = [], refused = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { refused.push(`${file} cannot be read: ${error.message}`); continue; }
    if (!doc || typeof doc !== 'object' || typeof doc.by !== 'string' || !doc.by.trim() || !Array.isArray(doc.rules)) {
      refused.push(`${file} does not say who declares it ("by") and its rules ("rules")`); continue;
    }
    for (const r of doc.rules) {
      const why = r && typeof r.why === 'string' ? r.why.trim() : '';
      const no = r && typeof r === 'object' ? refusal(r.rule) : 'a rule is not an object';
      if (no) refused.push(`${file}: ${no}`);
      else if (!why || why.length > 200) refused.push(`${file}: ${r.rule}: "why" says what it allows, in 1 to 200 characters`);
      else rules.push({ rule: r.rule, why, by: doc.by.trim() });
    }
  }
  return { rules, refused };
}

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
  for (const list of ['allow', 'deny', 'ask']) {
    if (perms && perms[list] !== undefined && !Array.isArray(perms[list])) return { error: `${file}: "permissions.${list}" is not a list` };
  }
  return { doc };
}

// The rules a settings document lacks, leaving out one the person denies or wants asked about (deny and ask rules
// win over allow in Claude Code).
function lacking(doc, rules = RULES) {
  const perms = doc.permissions || {};
  const have = new Set([...(perms.allow || []), ...(perms.deny || []), ...(perms.ask || [])]);
  return [...new Set(rules)].filter((rule) => !have.has(rule));
}

// Where a settings file that is a link (or a chain of them) ends, as the system resolves it, linked folders and `..`
// included; a link whose target is missing ends at that target, which the write then makes. The links are kept.
function endOf(file) {
  try { return fs.realpathSync(file); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  const real = (dir) => { try { return fs.realpathSync(dir); } catch (_) { return dir; } };
  const seen = new Set();
  let at = file;
  for (let hop = 0; hop < 64; hop += 1) { // the seen-set names a loop; the ceiling only backs it up
    const link = fs.lstatSync(at, { throwIfNoEntry: false });
    if (!link || !link.isSymbolicLink()) return at;
    if (seen.has(at)) throw Object.assign(new Error(`${file}: too many levels of links`), { code: 'ELOOP' });
    seen.add(at);
    at = path.resolve(real(path.dirname(at)), fs.readlinkSync(at)); // each hop from its link's real folder
  }
  throw Object.assign(new Error(`${file}: too many levels of links`), { code: 'ELOOP' });
}

function missing(file, rules = RULES) {
  const { doc, error } = load(file);
  return error ? { rules: [], error } : { rules: lacking(doc, rules), error: null };
}

// Adds the missing rules to permissions.allow, after the ones there; answers the rules added. A settings file that
// is a link is written where it points, and keeps its permission bits (it can hold secrets under `env`).
function apply(file, wanted = RULES) {
  const { doc, error } = load(file);
  if (error) throw new Error(error);
  const rules = lacking(doc, wanted);
  if (!rules.length) return [];
  doc.permissions = doc.permissions || {};
  doc.permissions.allow = [...(doc.permissions.allow || []), ...rules];
  const target = endOf(file);
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

module.exports = { RULES, COMMANDS, refusal, declared, missing, apply, endOf };
