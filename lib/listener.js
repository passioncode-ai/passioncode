'use strict';
/**
 * PC-152: who owns the listener on a loopback port. The contract's HA-2 (fabric-agent-contract DEC-0154,
 * `docs/specification/service.md#ha-2` at tag `v0.1.0+2026-11-07.1`): before a client calls a local service
 * healthy, or sends it any credential, it establishes from the computer's socket table that the listener is a
 * process of its own OS account. A listener of another account, or one whose owner cannot be told, is
 * `foreign-user`: nothing is sent to it and nothing it answers is read as the service's. The well-known
 * `process.pid` is never proof.
 *
 * Sources, per system, read only:
 *   macOS    `netstat -anv -p tcp` names the owning process even for another account's socket; `ps -o uid= -p`
 *            gives that process's uid.
 *   Linux    the `uid` column of `/proc/net/tcp` and `/proc/net/tcp6`.
 *   Windows  `Get-NetTCPConnection` for the owning process, then that process's owner SID against the
 *            current user's; a process whose owner cannot be read is an owner that cannot be told.
 * Only listeners that take a connection to loopback count: 127.0.0.0/8, ::1 and the wildcard addresses.
 */
const fs = require('fs');
const path = require('path');

const LISTEN_TIMEOUT = 15000;

/** One verdict: `none` (no listener on the port), `own`, or `foreign-user` with what was seen. */
const none = () => ({ state: 'none' });
const own = () => ({ state: 'own' });
const foreign = (owner) => ({ state: 'foreign-user', owner });
const untold = (reason) => ({ state: 'foreign-user', owner: null, reason });

const LOOP4 = /^(?:127(?:\.\d{1,3}){3}|0\.0\.0\.0|\*)$/;
const LOOP6 = /^(?:::1|::|\*|::ffff:127(?:\.\d{1,3}){3})$/i;
const takesLoopback = (addr) => LOOP4.test(addr) || LOOP6.test(addr);

/** macOS: the listeners on `port` and their pids, from `netstat -anv -p tcp`; null when the table is not readable. */
function parseNetstat(text, port) {
  const lines = String(text || '').split('\n');
  const header = lines.find((l) => /Local Address/.test(l));
  if (!header) return null;
  // macOS 13 and later print `process:pid` after rxbytes, txbytes, rhiwat and shiwat; earlier ones print
  // rhiwat, shiwat, pid and epid. A process name may hold spaces, so the pid is read from the right of it.
  const modern = /process:pid/.test(header);
  const found = [];
  for (const line of lines) {
    const f = line.trim().split(/\s+/);
    if (!/^tcp(?:4|6|46)?$/.test(f[0]) || f[5] !== 'LISTEN') continue;
    const at = f[3].lastIndexOf('.');
    if (at < 0 || Number(f[3].slice(at + 1)) !== port || !takesLoopback(f[3].slice(0, at))) continue;
    const m = modern ? /LISTEN\s+\d+\s+\d+\s+\d+\s+\d+\s+.*:(\d+)\s+[0-9a-f]+\s+[0-9a-f]+\s/.exec(line) : /LISTEN\s+\d+\s+\d+\s+(\d+)\s+\d+\s/.exec(line);
    found.push(m ? Number(m[1]) : null);
  }
  return found;
}

function darwin(port, run, uid) {
  const r = run('netstat', ['-anv', '-p', 'tcp'], { timeout: LISTEN_TIMEOUT, maxBuffer: 32 * 1024 * 1024 });
  const pids = r.code === 0 ? parseNetstat(r.out, port) : null;
  if (!pids) return untold(`netstat did not list the sockets (${(r.err || `exit ${r.code}`).trim().split('\n')[0]})`);
  if (!pids.length) return none();
  for (const pid of pids) {
    if (pid === null) return untold(`netstat named no process for port ${port}`);
    const p = run('ps', ['-o', 'uid=', '-p', String(pid)], { timeout: LISTEN_TIMEOUT });
    const owner = p.code === 0 && /^\s*\d+\s*$/.test(p.out) ? Number(p.out.trim()) : null;
    if (owner === null) return untold(`the owner of process ${pid} could not be read`);
    if (owner !== uid) return foreign(`uid ${owner}`);
  }
  return own();
}

/** Linux: the `/proc/net/tcp*` rows in LISTEN (`0A`) on `port` that take loopback, with their uids. */
function parseProcNet(text, port, v6) {
  const found = [];
  for (const line of String(text || '').split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 8 || f[3] !== '0A') continue;
    const [ip, hexPort] = f[1].split(':');
    if (parseInt(hexPort, 16) !== port) continue;
    const loop = v6
      ? /^0{32}$/.test(ip) || ip.toUpperCase() === '00000000000000000000000001000000' || /^0000000000000000FFFF0000[0-9A-F]{6}7F$/i.test(ip)
      : ip === '00000000' || /7F$/i.test(ip);
    if (loop) found.push(Number(f[7]));
  }
  return found;
}

function linux(port, uid, procNet) {
  const uids = [];
  let read = 0;
  for (const [file, v6] of [['tcp', false], ['tcp6', true]]) {
    let text;
    try { text = fs.readFileSync(path.join(procNet, file), 'utf8'); read += 1; } catch (_) { continue; }
    uids.push(...parseProcNet(text, port, v6));
  }
  if (!read) return untold(`${procNet}/tcp could not be read`);
  if (!uids.length) return none();
  const other = uids.find((u) => u !== uid);
  return other === undefined ? own() : foreign(`uid ${other}`);
}

// Windows: one PowerShell call prints `me <sid>` and one `<address> <pid> <sid or ?>` line per listener on the port.
// A port nobody listens on is an error Get-NetTCPConnection reports (no object found), so it is silenced and the
// script ends with exit 0; a computer without the cmdlet exits 3, an owner that cannot be told.
const PS_SCRIPT = (port) => [
  '"me " + [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  'if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { exit 3 }',
  `foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue)) {`,
  '  $sid = "?"',
  '  try { $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess) -ErrorAction Stop; $o = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction Stop; if ($o.ReturnValue -eq 0 -and $o.Sid) { $sid = $o.Sid } } catch { }',
  '  $c.LocalAddress + " " + $c.OwningProcess + " " + $sid',
  '}',
  'exit 0',
].join('\n');

function parsePowerShell(text) {
  let me = null;
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f[0] === 'me' && f[1]) me = f[1];
    else if (f.length === 3 && /^\d+$/.test(f[1])) rows.push({ address: f[0], pid: Number(f[1]), sid: f[2] });
  }
  return me ? { me, rows } : null;
}

function win32(port, run) {
  const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT(port)], { timeout: 30000 });
  const t = r.code === 0 ? parsePowerShell(r.out) : null;
  if (!t) return untold(`PowerShell did not list the sockets (${(r.err || `exit ${r.code}`).trim().split('\n')[0]})`);
  const rows = t.rows.filter((x) => takesLoopback(x.address));
  if (!rows.length) return none();
  for (const x of rows) {
    if (x.sid === '?') return untold(`the owner of process ${x.pid} could not be read`);
    if (x.sid !== t.me) return foreign(`SID ${x.sid}`);
  }
  return own();
}

/**
 * The owner of the listener on loopback `port`. `run` is releases.run (injected for tests); `uid` this process's
 * uid; `procNet` the folder of Linux's tcp tables (PASSIONCODE_PROC_NET in tests).
 */
function listenerOwner(port, { platform = process.platform, run, uid = process.getuid ? process.getuid() : null, procNet = process.env.PASSIONCODE_PROC_NET || '/proc/net' } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return untold(`port ${port} is not a TCP port`);
  if (platform === 'win32') return win32(port, run);
  if (platform === 'linux') return linux(port, uid, procNet);
  if (platform === 'darwin') return darwin(port, run, uid);
  return untold(`doctor cannot read the socket table on ${platform}`);
}

module.exports = { listenerOwner, parseNetstat, parseProcNet, parsePowerShell, takesLoopback };
