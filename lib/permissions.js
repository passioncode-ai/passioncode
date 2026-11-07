'use strict';
// PC-117: the standard Claude Code permission rules for PassionCode's own MCP tools, which setup installs on
// the person's yes (fabric-workspace knowledge/agents-first.md, "When Claude Code's auto mode refuses...").
// A rule names a whole server (`mcp__<server>` allows every tool of it). Rules are merged into the user's
// settings.json: every other key, rule and ordering is kept, and a file that cannot be read is never written.
const fs = require('fs');
const os = require('os');
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
  'rsync', 'tar', 'zip', 'vim', 'vi', 'nvim', 'emacs', 'less', 'man', 'r', 'rscript', 'julia', 'octave', 'scala', 'kotlin', 'groovy',
  'elixir', 'erl', 'ghci', 'runghc', 'racket', 'guile', 'sbcl', 'clojure', 'poetry', 'pipenv', 'conda', 'mamba', 'nix', 'nix-shell',
  'devbox', 'mise', 'asdf', 'direnv', 'bundle', 'rake', 'gem', 'composer', 'just', 'task', 'ansible', 'ansible-playbook',
  'nodejs', 'mawk', 'nawk', 'dc', 'ed', 'concurrently', 'nodemon', 'npm-run-all', 'run-s', 'run-p', 'zx', 'jiti', 'vite-node',
  'pdm', 'hatch', 'rye', 'pixi', 'volta', 'fnm', 'ipython', 'jupyter', 'tox', 'nox', 'rustup', 'pm2', 'proto', 'aqua', 'goenv', 'jenv', 'pypy', 'pypy3', 'python3-intel64', 'tsx', 'ts-node', 'sqlite3', 'psql', 'mysql', 'scp', 'sftp', 'rg', 'fd',
  'cmake', 'xcodebuild', 'go', 'cargo', 'regsvr32', 'msiexec', 'wmic', 'forfiles', 'certutil', 'bitsadmin', 'claude', 'codex',
  'launchctl', 'ex', 'view', 'vimdiff', 'rview', 'rvim', 'rbash', 'prove', 'm4', 'more', 'luajit', 'corepack', 'brew', 'mongosh',
  'mvn', 'gradle', 'xonsh', 'nu', 'elvish', 'mksh', 'yash', 'op', 'aws-vault', 'doppler', 'gemini', 'aider', 'opencode', 'goose',
  'infisical', 'chamber', 'sops', 'summon', 'envchain', 'teller', 'pulumi', 'pre-commit']);
const WRAPPERS = new Set(['env', 'sudo', 'doas', 'su', 'command', 'builtin', 'exec', 'eval', 'source', 'nohup', 'nice', 'time',
  'timeout', 'stdbuf', 'xargs', 'watch', 'script', 'caffeinate', 'arch', 'open', 'start', 'xcrun', 'setsid', 'chroot',
  'unshare', 'flock', 'ionice', 'taskset', 'parallel', 'genv', 'gnice', 'gtimeout', 'gstdbuf', 'gtime', 'gxargs', 'tmux', 'screen',
  'at', 'batch', 'runuser', 'pkexec', 'gosu', 'nsenter', 'strace', 'ltrace', 'gdb', 'lldb', 'valgrind', 'entr', 'hyperfine', 'dtruss',
  'ssh-agent', 'sandbox-exec', 'systemd-run', 'pyenv', 'rbenv', 'nodenv', 'proxychains', 'firejail', 'fakeroot', 'apply',
  'taskpolicy', 'lockf', 'leaks', 'dtrace', 'chrt', 'setpriv', 'prlimit', 'setarch', 'linux32', 'linux64', 'sg', 'newgrp', 'run0',
  'systemd-inhibit', 'bwrap', 'conhost', 'explorer', 'pcalua', 'runas', 'wt', 'schtasks', 'coproc', 'noglob', 'nocorrect', 'repeat',
  'cross-env', 'env-cmd', 'dotenv', 'unbuffer', 'winpty', 'trap', 'enable', 'watchexec', 'rlwrap', 'faketime', 'torsocks', 'numactl', 'cpulimit', 'runcon', 'dotenvx',
  'gsudo', 'sshpass', 'chronic', 'ifne', 'xvfb-run', 'autossh']);
// General-purpose programs with many commands, or that change or remove what they are given: a wildcard over one needs
// a subcommand or argument after its name (`gh pr merge:*`, never `gh:*`). A command of an agent's own, made for one
// act, may carry a wildcard after its name alone (`your-agent-sync:*`).
const BROAD = new Set(['gh', 'glab', 'aws', 'gcloud', 'gsutil', 'az', 'doctl', 'flyctl', 'vercel', 'wrangler', 'heroku', 'terraform',
  'helm', 'apt', 'apt-get', 'dnf', 'yum', 'pacman', 'port', 'winget', 'choco', 'scoop', 'cargo', 'go',
  'rm', 'rmdir', 'mv', 'cp', 'dd', 'ln', 'chmod', 'chown', 'chflags', 'mkdir', 'touch', 'tee', 'truncate', 'shred', 'kill',
  'killall', 'pkill', 'systemctl', 'service', 'defaults', 'security', 'diskutil', 'mount', 'umount', 'crontab',
  'curl', 'wget', 'scp', 'sftp', 'nc', 'ncat', 'socat', 'openssl', 'gpg', 'sqlite3', 'psql', 'mysql', 'redis-cli',
  'npm-run']);

// Why a declared rule is not offered, or null. A declared rule names one command (`Bash(<command>)`, `:*` or a trailing
// ` *` for any arguments); Claude Code matches it against the command's text, so only a plain form is offered:
// printable ASCII, the program by its bare lower-case name, no quote, escape, substitution, separator or redirection,
// never a wrapper, and a wildcard only at the end, never over a listed program that runs other code, and only over a
// command installed in the person's home folder (an exact rule allows only its own text). `context` is where programs
// are looked up: { home, pathEnv, platform }.
function refusal(rule, context = { home: os.homedir(), pathEnv: process.env.PATH, platform: process.platform }) {
  if (typeof rule !== 'string') return 'a rule is not text';
  if (/^mcp__/.test(rule)) return `${rule}: a declared rule names a command; an MCP server's tools are not offered here`;
  const m = /^Bash\(([\s\S]+)\)$/.exec(rule); // a line break inside is refused below, never a different reason
  if (!m) return `${rule}: a declared rule names a command, as Bash(<command>)`;
  if (/[^\x20-\x7e]|[$`;&|<>(){}'"\\]/.test(m[1])) return `${rule}: a command with a quote, an escape, a substitution, a separator, a redirection or a character that is not plain text is not offered`;
  const wild = /(?::\*| \*)$/.exec(m[1]);
  const head = wild ? m[1].slice(0, wild.index) : m[1];
  if (!head.replace(/\*/g, '').trim()) return `${rule}: it would allow any command`;
  if (!wild && head.endsWith('*')) return `${rule}: a wildcard at the end needs :* or a space before it`;
  if (head.includes('*')) return `${rule}: a wildcard is allowed only at the end`;
  const words = head.trim().split(/ +/);
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(words[0])) return `${rule}: name the program by its plain name, in lower case, without a path`;
  // perl5.34, python3.12, node22 and python.exe are perl, python, node and python.
  const raw = words[0].replace(/\.(exe|cmd|bat|com|ps1)$/, '');
  const bare = raw.replace(/-(intel64|arm64|x86_64|universal2)$/, '').replace(/([a-z])[0-9][0-9.]*t?$/, '$1');
  // A name is looked up as written and with its version taken off (rundll32 is listed; perl5.34 is perl).
  const listed = (set) => (set.has(raw) ? raw : set.has(bare) ? bare : null);
  const program = listed(WRAPPERS) || listed(RUNNERS) || listed(BROAD) || raw;
  if (WRAPPERS.has(program)) return `${rule}: ${program} runs another program, so the rule could run any code`;
  if (wild && /\.(cmd|bat)$/.test(words[0])) return `${rule}: a .cmd or .bat file runs through cmd, which reads its arguments again; a wildcard is not offered`;
  if (RUNNERS.has(program) && wild) return `${rule}: a wildcard over ${program} could run any code; declare the exact command, or a command of your own`;
  if (wild && words.length < 2 && BROAD.has(program)) return `${rule}: it would allow any command of ${program}`;
  // The lists name known programs only; a wildcard is offered only over a command installed in the person's home
  // folder (an agent's own), which no program the system ships is.
  if (wild) {
    const { file: found, relative } = where(words[0], context);
    if (relative) return `${rule}: PATH holds an empty or relative folder, which a shell reads from wherever it runs; a wildcard is not offered while it does`;
    if (!found) return `${rule}: ${words[0]} is not found on PATH; a wildcard is offered only over a command installed in your home folder`;
    if (atRoot(context.home)) return `${rule}: your home folder is the root folder, so no command there counts as your own; a wildcard is not offered`;
    if (!inside(found, context.home)) return `${rule}: ${words[0]} is installed outside your home folder (${found}); a wildcard is offered only over a command of your own there`;
  }
  return null;
}

// Where a program resolves on PATH, as the kernel would run it (links followed physically, `..` after a link
// included), or why the answer would differ for a shell in another folder: an empty or relative entry ahead of it is
// that folder's, not setup's. Only a file the user may execute counts, as the shell skips the rest. On Windows Claude
// Code runs Git Bash, which runs a bare name as itself or as name.exe, never as a .cmd or .bat of that name.
function where(name, { pathEnv, platform }) {
  const exts = platform === 'win32' ? ['', '.exe'] : [''];
  for (const dir of String(pathEnv || '').split(path.delimiter)) {
    if (!dir || !path.isAbsolute(dir)) return { relative: true };
    for (const ext of exts) {
      const file = `${dir}${dir.endsWith(path.sep) ? '' : path.sep}${name}${ext}`; // as written: no lexical folding of `..`
      try {
        if (!fs.statSync(file).isFile()) continue;
        if (platform !== 'win32') fs.accessSync(file, fs.constants.X_OK);
        else if (!ext && !runnable(file)) continue; // Git Bash skips a file without an .exe, MZ or #! as not executable
        return { file: fs.realpathSync.native(file) };
      } catch (_) { /* not here, or not for this user */ }
    }
  }
  return {};
}
function runnable(file) {
  let fd;
  try { fd = fs.openSync(file, 'r'); const b = Buffer.alloc(2); fs.readSync(fd, b, 0, 2, 0); return ['MZ', '#!'].includes(b.toString('latin1')); }
  catch (_) { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
const realHome = (home) => { try { return fs.realpathSync.native(home); } catch (_) { return path.resolve(home); } };
const atRoot = (home) => { const root = realHome(home); return path.parse(root).root === root; }; // it would hold every program
const inside = (file, home) => {
  const root = realHome(home);
  const rel = path.relative(root, file);
  return !!rel && !rel.startsWith('..') && !path.isAbsolute(rel);
};

// A control character could redraw the line that says what a rule allows; a format character (a bidirectional
// override or isolate, a zero-width or tag character, a line or paragraph separator, any character a terminal does not
// draw) could reorder or hide it.
const CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Default_Ignorable_Code_Point}]/u;
// A refusal line repeats the declaration's own text (a rule, a file name, the parser's quote of the file): each control
// character in it is written as its escape, so the line cannot redraw the plan printed above it.
const shown = (line) => String(line).replace(new RegExp(CONTROL.source, 'gu'), (c) => {
  const n = c.codePointAt(0);
  return n > 0xffff ? `\\u{${n.toString(16)}}` : `\\u${n.toString(16).padStart(4, '0')}`;
});
function declared(dir, context) {
  let names;
  try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.json')).sort(); }
  catch (error) { return { rules: [], refused: error.code === 'ENOENT' ? [] : [shown(`${dir} cannot be read: ${error.message}`)], sources: {} }; }
  const rules = [], refused = [];
  for (const name of names) {
    const file = path.join(dir, name);
    let doc;
    try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); }
    catch (error) { refused.push(`${file} cannot be read: ${error.message}`); continue; }
    if (doc && typeof doc.by === 'string' && CONTROL.test(doc.by)) { refused.push(`${file}: "by" holds a control or format character`); continue; }
    if (!doc || typeof doc !== 'object' || typeof doc.by !== 'string' || !doc.by.trim() || [...doc.by.trim()].length > 80 || !Array.isArray(doc.rules)) {
      refused.push(`${file} does not say who declares it ("by", 1 to 80 characters) and its rules ("rules")`); continue;
    }
    for (const r of doc.rules) {
      const why = r && typeof r.why === 'string' ? r.why.trim() : '';
      // A rule the launcher carries is its own to offer, as it says it: declaring it again changes nothing.
      if (r && typeof r === 'object' && COMMANDS.some((c) => c.rule === r.rule)) continue;
      const no = r && typeof r === 'object' ? refusal(r.rule, context) : 'a rule is not an object';
      if (no) refused.push(`${file}: ${no}`);
      else if (CONTROL.test(r.why || '')) refused.push(`${file}: ${r.rule}: "why" holds a control or format character`);
      else if (!why || [...why].length > 200) refused.push(`${file}: ${r.rule}: "why" says what it allows, in 1 to 200 characters`);
      else if (rules.some((x) => x.rule === r.rule && x.file === file)) refused.push(`${file}: ${r.rule} is declared twice in this file; it is counted once`);
      else if (rules.some((x) => x.rule === r.rule)) refused.push(`${file}: ${r.rule} is the same rule ${rules.find((x) => x.rule === r.rule).by} declares; it is counted once`);
      else rules.push({ rule: r.rule, why, by: doc.by.trim(), file });
    }
  }
  // a line said twice is listed once; `sources` names the file each offered rule came from (the ledger keeps it, PC-125)
  const sources = Object.fromEntries(rules.map((r) => [r.rule, `rules.d/${path.basename(r.file)}`]));
  return { rules: rules.map(({ file: _, ...r }) => r), refused: [...new Set(refused)].map(shown), sources };
}

// PATH as Claude Code's shell sees it: npx and npm exec put node_modules/.bin folders and their own on PATH, which that
// shell has none of; a relative folder stays, and refuses a wildcard when it comes first.
function shellPath(pathEnv = process.env.PATH) {
  return String(pathEnv || '').split(path.delimiter).filter((d) => !(path.isAbsolute(d) && /[\\/](node_modules[\\/]\.bin|node-gyp-bin)[\\/]?$/.test(d))).join(path.delimiter);
}

// The rules for commands setup offers (PC-119): the launcher's own, then those declared in `<state>/rules.d`, a rule
// the launcher carries listed once, as the launcher says it; with the declarations refused and where each came from.
function commandSet(state, home = os.homedir()) {
  const local = declared(path.join(state, 'rules.d'), { home, pathEnv: shellPath(), platform: process.platform });
  const rules = [...COMMANDS, ...local.rules].filter((r, n, all) => all.findIndex((x) => x.rule === r.rule) === n);
  return { rules, refused: local.refused, sources: local.sources };
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
  write(file, doc);
  return rules;
}

// Writes a JSON settings file the launcher shares with an agent, whole: Claude Code's settings.json (the rules merge,
// PC-117; retiring and restoring a marketplace, PC-120), Gemini's settings.json and Kimi's mcp.json (MCP registration
// and its removal, PC-120). A file that is a link is written where it points, keeping its permission bits, since it
// can hold secrets under `env`; a new file is private.
function write(file, doc) {
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
}

module.exports = { CONTROL, RULES, COMMANDS, RUNNERS, WRAPPERS, BROAD, refusal, declared, shellPath, commandSet, load, missing, apply, write, endOf, shown };
