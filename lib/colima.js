'use strict';
/**
 * PC-231: Colima as this Mac's Docker, recommended from onboarding. Where Colima is installed, doctor
 * reads three things and names each as a recommendation (`warn`, never a failure):
 *
 * - `prereq.colima.context`: the Docker CLI's current context is `colima`. A stopped Docker Desktop
 *   behind the `default` context sent backups, tests and agents to a socket nobody answered.
 * - `prereq.colima.autostart`: Colima starts at login, so the databases agents keep in it come back
 *   after a restart. The launcher's LaunchAgent runs `colima start` once (RunAtLoad, no KeepAlive:
 *   `colima start` exits 0 on a running VM, and Homebrew's service relaunches on every exit 0).
 * - `prereq.colima.socket`: `/var/run/docker.sock` leads to Colima's socket, for tools that read no
 *   Docker context (SDKs, testcontainers). Changing it takes an administrator's password, so it stays
 *   the person's step (gate `secret`), with Docker Desktop's socket helper switched off so a restart
 *   does not put its link back.
 *
 * setup and doctor --fix apply the first two (`{ kind: 'colima', label }`); nothing here needs sudo.
 *
 * A Mac shared by several macOS users (studio-agent's DEC-0068, board c3b51cc0): one system link would send
 * every user's Docker to one user's Colima, so there each user exports `DOCKER_HOST` to their own Colima in
 * `~/.zshenv`, which setup writes (`label: 'shell'`, no administrator rights), and the socket row reads that
 * line instead. The current context is read from Docker's config, since `docker context show` answers
 * `default` while `DOCKER_HOST` is set. An autostart another launchd job already holds (studio-agent's
 * `ai.passioncode.studio-agent.colima`, Homebrew's) counts, and setup adds none beside it.
 */
const fs = require('fs');
const path = require('path');

const LABEL = 'ai.passioncode.colima-autostart';
/** Autostarts another tool or person already installed count: Homebrew's service, or a LaunchAgent by hand. */
const OTHER_LABELS = ['homebrew.mxcl.colima', 'com.sshlg.colima-autostart', 'ai.passioncode.studio-agent.colima'];
/** Where launchd jobs live: the user's agents, then the machine's (PASSIONCODE_LAUNCHD_DIRS, colon separated, for tests). */
const launchdDirs = (home) => (process.env.PASSIONCODE_LAUNCHD_DIRS
  ? process.env.PASSIONCODE_LAUNCHD_DIRS.split(':').filter(Boolean)
  : [path.join(home, 'Library', 'LaunchAgents'), '/Library/LaunchAgents', '/Library/LaunchDaemons']);
/** The folder of the Mac's user homes (PASSIONCODE_USERS_DIR for tests). */
const usersDir = () => process.env.PASSIONCODE_USERS_DIR || '/Users';
/** More than one person's home: Shared, Guest and hidden folders do not count. */
function sharedMac() {
  try { return fs.readdirSync(usersDir()).filter((n) => !n.startsWith('.') && !['Shared', 'Guest'].includes(n)).length > 1; } catch (_) { return false; }
}
/** The line a user's ~/.zshenv carries on a shared Mac. */
const SHELL_LINE = 'export DOCKER_HOST=unix://$HOME/.colima/default/docker.sock';
/** Whether ~/.zshenv exports DOCKER_HOST to this user's own Colima ($HOME, ~ or the home written out). */
function shellLine(home) {
  let text = '';
  try { text = fs.readFileSync(path.join(home, '.zshenv'), 'utf8'); } catch (_) { return false; }
  const own = `(\\$HOME|\\$\\{HOME\\}|~|${home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`;
  return new RegExp(`^\\s*export\\s+DOCKER_HOST=["']?unix://${own}/\\.colima/default/docker\\.sock["']?\\s*$`, 'm').test(text);
}
/** Docker's current context as its config records it, else what `docker context show` answers. */
function currentContext(home, run) {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(home, '.docker', 'config.json'), 'utf8'));
    if (cfg && typeof cfg.currentContext === 'string' && cfg.currentContext) return cfg.currentContext;
  } catch (_) { /* no config: ask the CLI */ }
  const ctx = run('docker', ['context', 'show'], { timeout: 15000 });
  return ctx.code === 0 ? ctx.out.trim() : '';
}
/** A launchd job that starts Colima: one of the known labels, or a plist that runs `colima start`. */
function autostartJob(home) {
  for (const dir of launchdDirs(home)) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.plist')); } catch (_) { continue; }
    for (const n of names) {
      const label = n.slice(0, -'.plist'.length);
      if (label === LABEL || OTHER_LABELS.includes(label)) return label;
      let text = '';
      try { text = fs.readFileSync(path.join(dir, n), 'utf8'); } catch (_) { continue; }
      if (/\/colima<\/string>\s*<string>start<\/string>/.test(text)) return label;
    }
  }
  return null;
}
const systemSocket = () => process.env.PASSIONCODE_DOCKER_SOCKET || '/var/run/docker.sock';
const colimaSocket = (home) => path.join(home, '.colima', 'default', 'docker.sock');
const agentsDir = (home) => path.join(home, 'Library', 'LaunchAgents');
const plistPath = (home) => path.join(agentsDir(home), `${LABEL}.plist`);

/** Where a chain of links ends (at most 8 hops), without requiring the end to exist. */
function linkEnd(p) {
  let at = p;
  for (let hop = 0; hop < 8; hop++) {
    let to;
    try { to = fs.readlinkSync(at); } catch (_) { return at; }
    at = path.resolve(path.dirname(at), to);
  }
  return at;
}

const SOCKET_FIX = (home) => `run once as an administrator: sudo ln -sfn ${colimaSocket(home)} ${systemSocket()} && sudo launchctl disable system/com.docker.socket`;

/** The rows doctor adds; none on a system other than macOS or where Colima is not installed. */
function checks({ home, platform, run, setupCmd = 'npx @passioncode-ai/passioncode@latest setup' }) {
  if (platform !== 'darwin') return [];
  const version = run('colima', ['version'], { timeout: 15000 });
  if (version.code !== 0) return [];
  const rows = [];
  const current = currentContext(home, run);
  rows.push(current === 'colima'
    ? { id: 'prereq.colima.context', area: 'prerequisites', state: 'ok', detail: 'Docker\'s current context is colima' }
    : { id: 'prereq.colima.context', area: 'prerequisites', state: 'warn', detail: `Docker's current context is ${current || 'unknown'}; Colima is installed and is recommended as the default`, fix: 'docker context use colima', repair: { kind: 'colima', label: 'context' } });
  const found = autostartJob(home);
  rows.push(found
    ? { id: 'prereq.colima.autostart', area: 'prerequisites', state: 'ok', detail: `Colima starts at login (${found})` }
    : { id: 'prereq.colima.autostart', area: 'prerequisites', state: 'warn', detail: 'Colima does not start at login, so what runs in it stays down after a restart', fix: `${setupCmd} (it installs the LaunchAgent ${LABEL})`, repair: { kind: 'colima', label: 'autostart' } });
  const end = linkEnd(systemSocket());
  const shared = sharedMac();
  if (end === colimaSocket(home) || end === linkEnd(colimaSocket(home))) {
    rows.push({ id: 'prereq.colima.socket', area: 'prerequisites', state: 'ok', detail: `${systemSocket()} leads to Colima` });
  } else if (shellLine(home)) {
    rows.push({ id: 'prereq.colima.socket', area: 'prerequisites', state: 'ok', detail: 'DOCKER_HOST in ~/.zshenv leads to this user\'s Colima' });
  } else if (shared) {
    rows.push({ id: 'prereq.colima.socket', area: 'prerequisites', state: 'warn', detail: 'on a Mac several people use, tools that read no Docker context need DOCKER_HOST to lead to this user\'s own Colima', fix: `add to ~/.zshenv: ${SHELL_LINE}`, repair: { kind: 'colima', label: 'shell' } });
  } else {
    rows.push({ id: 'prereq.colima.socket', area: 'prerequisites', state: 'warn', detail: `${systemSocket()} leads to ${end === systemSocket() && !fs.existsSync(end) ? 'nothing' : end}, not Colima; tools that read no Docker context miss it`, fix: SOCKET_FIX(home), gate: 'secret' });
  }
  return rows;
}

function plist(colimaBin, logPath) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${colimaBin}</string><string>start</string></array>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${path.dirname(colimaBin)}:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${logPath}</string>
  <key>StandardErrorPath</key><string>${logPath}</string>
</dict>
</plist>
`;
}

/** setup's repair: `context` switches Docker's context, `autostart` writes and loads the LaunchAgent. Throws on failure. */
function apply({ home, label, run }) {
  if (label === 'context') {
    const r = run('docker', ['context', 'use', 'colima'], { timeout: 30000 });
    if (r.code !== 0) throw new Error((r.err || r.out || `exit ${r.code}`).trim());
    return;
  }
  if (label === 'shell') {
    if (shellLine(home)) return;
    const file = path.join(home, '.zshenv');
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) { text = ''; }
    fs.writeFileSync(file, `${text}${text && !text.endsWith('\n') ? '\n' : ''}# PassionCode (PC-231): Docker tools reach this user's own Colima\n${SHELL_LINE}\n`, { mode: text ? undefined : 0o644 });
    return;
  }
  if (label !== 'autostart') throw new Error(`no Colima repair ${label}`);
  const which = run('/bin/sh', ['-c', 'command -v colima'], { timeout: 15000 });
  const bin = which.code === 0 && which.out.trim() ? which.out.trim() : '/opt/homebrew/bin/colima';
  fs.mkdirSync(agentsDir(home), { recursive: true });
  const logs = path.join(home, 'Library', 'Logs');
  fs.mkdirSync(logs, { recursive: true });
  fs.writeFileSync(plistPath(home), plist(bin, path.join(logs, 'colima-autostart.log')), { mode: 0o644 });
  const uid = process.getuid ? process.getuid() : 0;
  run('launchctl', ['bootout', `gui/${uid}/${LABEL}`], { timeout: 30000 }); // a copy loaded before is replaced; absent is fine
  const r = run('launchctl', ['bootstrap', `gui/${uid}`, plistPath(home)], { timeout: 30000 });
  if (r.code !== 0) throw new Error((r.err || r.out || `exit ${r.code}`).trim());
}

module.exports = { checks, apply, LABEL, OTHER_LABELS, SHELL_LINE, plistPath, colimaSocket, systemSocket, linkEnd, shellLine };
