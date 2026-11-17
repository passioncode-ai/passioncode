'use strict';
/**
 * PC-229: Colima as this Mac's Docker, recommended from onboarding. Where Colima is installed, doctor
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
 */
const fs = require('fs');
const path = require('path');

const LABEL = 'ai.passioncode.colima-autostart';
/** Autostarts another tool or person already installed count: Homebrew's service, or a LaunchAgent by hand. */
const OTHER_LABELS = ['homebrew.mxcl.colima', 'com.sshlg.colima-autostart'];
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
  const ctx = run('docker', ['context', 'show'], { timeout: 15000 });
  const current = ctx.code === 0 ? ctx.out.trim() : '';
  rows.push(current === 'colima'
    ? { id: 'prereq.colima.context', area: 'prerequisites', state: 'ok', detail: 'Docker\'s current context is colima' }
    : { id: 'prereq.colima.context', area: 'prerequisites', state: 'warn', detail: `Docker's current context is ${current || 'unknown'}; Colima is installed and is recommended as the default`, fix: 'docker context use colima', repair: { kind: 'colima', label: 'context' } });
  const dir = agentsDir(home);
  const found = [LABEL, ...OTHER_LABELS].find((l) => fs.existsSync(path.join(dir, `${l}.plist`)));
  rows.push(found
    ? { id: 'prereq.colima.autostart', area: 'prerequisites', state: 'ok', detail: `Colima starts at login (${found})` }
    : { id: 'prereq.colima.autostart', area: 'prerequisites', state: 'warn', detail: 'Colima does not start at login, so what runs in it stays down after a restart', fix: `${setupCmd} (it installs the LaunchAgent ${LABEL})`, repair: { kind: 'colima', label: 'autostart' } });
  const end = linkEnd(systemSocket());
  rows.push(end === colimaSocket(home) || end === linkEnd(colimaSocket(home))
    ? { id: 'prereq.colima.socket', area: 'prerequisites', state: 'ok', detail: `${systemSocket()} leads to Colima` }
    : { id: 'prereq.colima.socket', area: 'prerequisites', state: 'warn', detail: `${systemSocket()} leads to ${end === systemSocket() && !fs.existsSync(end) ? 'nothing' : end}, not Colima; tools that read no Docker context miss it`, fix: SOCKET_FIX(home), gate: 'secret' });
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

module.exports = { checks, apply, LABEL, OTHER_LABELS, plistPath, colimaSocket, systemSocket, linkEnd };
