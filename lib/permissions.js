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

// Programs that run whatever they are given, or take options after their fixed words that run other code (find -exec,
// ssh's remote command, make, sed, git): a rule over one is offered only exact, never with a wildcard. Programs that
// run another program (wrappers) are never offered. Both are lists of known names, not a proof: the person's yes on
// the rules shown is the gate, and the plan says a wildcard allows any arguments after the rule's words.
const RUNNERS = new Set(['sh', 'bash', 'zsh', 'fish', 'dash', 'ksh', 'csh', 'tcsh', 'busybox', 'pwsh', 'powershell', 'cmd', 'wsl',
  'python', 'pythonw', 'py', 'node', 'deno', 'bun', 'bunx', 'ruby', 'irb', 'perl', 'php', 'lua', 'tclsh', 'wish', 'expect', 'java',
  'jshell', 'dotnet', 'swift', 'osascript', 'cscript', 'wscript', 'mshta', 'rundll32', 'uv', 'uvx', 'npx', 'npm', 'pnpm', 'pnpx',
  'yarn', 'pip', 'pipx', 'docker', 'podman', 'kubectl', 'ssh', 'make', 'awk', 'gawk', 'sed', 'gsed', 'find', 'gfind', 'git',
  'rsync', 'tar', 'zip', 'vim', 'vi', 'emacs', 'less', 'man']);
const WRAPPERS = new Set(['env', 'sudo', 'doas', 'su', 'command', 'builtin', 'exec', 'eval', 'source', 'nohup', 'nice', 'time',
  'timeout', 'stdbuf', 'xargs', 'watch', 'script', 'caffeinate', 'arch', 'open', 'start', 'xcrun', 'setsid', 'chroot',
  'unshare', 'flock', 'ionice', 'taskset', 'parallel', 'genv', 'gnice', 'gtimeout', 'gstdbuf', 'gtime', 'gxargs']);
// General-purpose programs with many commands, or that change or remove what they are given: a wildcard over one needs
// a subcommand or argument after its name (`gh pr merge:*`, never `gh:*`). A command of an agent's own, made for one
// act, may carry a wildcard after its name alone (`your-agent-sync:*`).
const BROAD = new Set(['gh', 'glab', 'aws', 'gcloud', 'gsutil', 'az', 'doctl', 'flyctl', 'vercel', 'wrangler', 'heroku', 'terraform',
  'helm', 'brew', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'port', 'winget', 'choco', 'scoop', 'cargo', 'go', 'mvn', 'gradle',
  'rm', 'rmdir', 'mv', 'cp', 'dd', 'ln', 'chmod', 'chown', 'chflags', 'mkdir', 'touch', 'tee', 'truncate', 'shred', 'kill',
  'killall', 'pkill', 'launchctl', 'systemctl', 'service', 'defaults', 'security', 'diskutil', 'mount', 'umount', 'crontab',
  'curl', 'wget', 'scp', 'sftp', 'nc', 'ncat', 'socat', 'openssl', 'gpg', 'sqlite3', 'psql', 'mysql', 'redis-cli', 'mongosh',
  'claude', 'codex', 'npm-run', 'pip3']);

// Why a declared rule is not offered, or null. A rule names one MCP server or tool (`mcp__<server>[__<tool>]`) or one
// command (`Bash(<command>)`, `:*` or a trailing ` *` for any arguments). Claude Code matches a rule against the
// command's text, so only a plain form is offered: printable ASCII, the program by its bare lower-case name, no quote,
// escape, substitution, separator or redirection, a wildcard only at the end (after two words over a general-purpose
// program), never a wrapper, and no wildcard over a program that runs whatever it is given (an exact rule allows only its own text).
function refusal(rule) {
  if (typeof rule !== 'string') return 'a rule is not text';
  if (/^mcp__[A-Za-z0-9_-]+$/.test(rule)) return null;
  const m = /^Bash\(([\s\S]+)\)$/.exec(rule); // a line break inside is refused below, never a different reason
  if (!m) return `${rule}: a rule names an MCP server (mcp__<server>) or a command (Bash(<command>))`;
  if (/[^\x20-\x7e]|[$`;&|<>(){}'"\\]/.test(m[1])) return `${rule}: a command with a quote, an escape, a substitution, a separator, a redirection or a character that is not plain text is not offered`;
  const wild = /(?::\*| \*)$/.exec(m[1]);
  const head = wild ? m[1].slice(0, wild.index) : m[1];
  if (!head.replace(/\*/g, '').trim()) return `${rule}: it would allow any command`;
  if (!wild && head.endsWith('*')) return `${rule}: a wildcard at the end needs :* or a space before it`;
  if (head.includes('*')) return `${rule}: a wildcard is allowed only at the end`;
  const words = head.trim().split(/ +/);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(words[0])) return `${rule}: name the program by its plain name, in lower case, without a path`;
  // perl5.34, python3.12, node22 and python.exe are perl, python, node and python.
  const program = words[0].replace(/\.(exe|cmd|bat|com|ps1)$/, '').replace(/([a-z])[0-9][0-9.]*$/, '$1');
  if (WRAPPERS.has(program)) return `${rule}: ${program} runs another program, so the rule could run any code`;
  if (RUNNERS.has(program) && wild) return `${rule}: a wildcard over ${program} could run any code; declare the exact command, or a command of your own`;
  if (wild && words.length < 2 && BROAD.has(program)) return `${rule}: it would allow any command of ${program}`;
  return null;
}

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/; // a control character could redraw the line that says what a rule allows
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
    if (!doc || typeof doc !== 'object' || typeof doc.by !== 'string' || !doc.by.trim() || CONTROL.test(doc.by) || !Array.isArray(doc.rules)) {
      refused.push(`${file} does not say who declares it ("by") and its rules ("rules")`); continue;
    }
    for (const r of doc.rules) {
      const why = r && typeof r.why === 'string' ? r.why.trim() : '';
      const no = r && typeof r === 'object' ? refusal(r.rule) : 'a rule is not an object';
      if (no) refused.push(`${file}: ${no}`);
      else if (!why || why.length > 200 || CONTROL.test(why)) refused.push(`${file}: ${r.rule}: "why" says what it allows, in 1 to 200 characters`);
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
