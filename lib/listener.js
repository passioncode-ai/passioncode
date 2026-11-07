'use strict';
/**
 * PC-152, PC-163: who owns the server end of a loopback connection. The contract's HA-2 (fabric-agent-contract
 * DEC-0154, `docs/specification/service.md#ha-2`, CT-254 at tag `v0.1.0+2026-11-07.3`): before a client calls a local
 * service healthy, or sends it any credential, it establishes from the computer's socket table that the server end of
 * its own open connection is a process of its own OS account. Another account's, or one whose owner cannot be told,
 * is `foreign-user`: nothing is sent to it and nothing it answers is read as the service's. The well-known
 * `process.pid` is never proof, and a list of listeners read before connecting says nothing about who accepted the
 * connection, so the table is read after the connection is open (`peerPort` is the client's own port).
 *
 * Sources, per system, read only:
 *   macOS    `netstat -anv -p tcp` names the owning process even for another account's socket; `ps -o uid= -p`
 *            gives that process's uid. A table that cannot be read, comes back empty or with only its header, or
 *            lacks the connection is `table-restricted` (DEC-0155 RT-1: some macOS releases show an ad-hoc signed
 *            process only its own sockets): an owner that cannot be told.
 *   Linux    the `uid` column of `/proc/net/tcp` and `/proc/net/tcp6`: the connection's server end when its inode is
 *            not 0, else the listener on the port.
 *   Windows  `Get-NetTCPConnection` for the owning process, then that process's owner SID against the current
 *            user's; a process whose owner cannot be read is an owner that cannot be told.
 * Where a listener is chosen (Linux's row with inode 0, or a look without a connection), the listener on the
 * connection's own address (`127.0.0.1` or `::1`) counts; a wildcard one only when none listens there; listeners of
 * different accounts on the address that counts are an owner that cannot be told.
 */
const fs = require('fs');
const path = require('path');

const LISTEN_TIMEOUT = 15000;

/** One verdict: `none` (nothing listens; only without a connection), `own`, or `foreign-user` with what was seen. */
const none = () => ({ state: 'none' });
const own = () => ({ state: 'own' });
const foreign = (owner) => ({ state: 'foreign-user', owner });
const untold = (reason) => ({ state: 'foreign-user', owner: null, reason });
const RESTRICTED = 'table-restricted: the socket table does not show the server end of this connection';

/** The listener rule: the ones on the connection's address, else the wildcard ones; one owner, or none can be told. */
function decide(listeners, me, port) {
  const exact = listeners.filter((l) => l.at === 'exact');
  const chosen = exact.length ? exact : listeners.filter((l) => l.at === 'wildcard');
  if (!chosen.length) return null;
  const owners = [...new Set(chosen.map((l) => l.owner))];
  if (owners.some((o) => o === null)) return untold(chosen.find((l) => l.owner === null).why || `the owner of a listener on port ${port} could not be read`);
  if (owners.length > 1) return untold(`listeners of different OS accounts hold port ${port}`);
  return owners[0] === me ? own() : foreign(owners[0]);
}

/** macOS: `<address>.<port>` split at its last dot. */
const splitAddr = (a) => { const at = a.lastIndexOf('.'); return at < 0 ? [a, NaN] : [a.slice(0, at), Number(a.slice(at + 1))]; };

/**
 * macOS: the socket rows of `netstat -anv -p tcp` as { proto, local, foreign, state, pid }, or null when the text has
 * no table. macOS 13 and later print `process:pid` after rxbytes, txbytes, rhiwat and shiwat; earlier ones print
 * rhiwat, shiwat, pid and epid. A process name may hold spaces, so the pid is read from the right of it.
 */
function parseNetstat(text) {
  const lines = String(text || '').split('\n');
  const header = lines.find((l) => /Local Address/.test(l));
  if (!header) return null;
  const modern = /process:pid/.test(header);
  const rows = [];
  for (const line of lines) {
    const f = line.trim().split(/\s+/);
    if (!/^tcp(?:4|6|46)?$/.test(f[0]) || f.length < 7) continue;
    const rest = line.slice(line.indexOf(` ${f[5]} `) + f[5].length + 2);
    const m = modern ? /^\s*\d+\s+\d+\s+\d+\s+\d+\s+.*:(\d+)\s+[0-9a-f]{5}\s+[0-9a-f]{8}\s/.exec(rest) : /^\s*\d+\s+\d+\s+(\d+)\s+\d+\s/.exec(rest);
    rows.push({ proto: f[0], local: f[3], foreign: f[4], state: f[5], pid: m ? Number(m[1]) : null });
  }
  return rows;
}

function darwin({ port, peerPort, host }, run, uid) {
  const r = run('netstat', ['-anv', '-p', 'tcp'], { timeout: LISTEN_TIMEOUT, maxBuffer: 32 * 1024 * 1024 });
  const rows = r.code === 0 ? parseNetstat(r.out) : null;
  // DEC-0155 RT-1: a table that cannot be read, has no rows or ends in an error is a cut-short one, never another account.
  if (!rows) return untold(r.code === 0 ? `${RESTRICTED} (netstat printed no table)` : `${RESTRICTED} (netstat did not list the sockets: ${(r.err || `exit ${r.code}`).trim().split('\n')[0]})`);
  if (!rows.length) return untold(`${RESTRICTED} (netstat printed only its header)`);
  const uids = new Map();
  const ownerOf = (pid) => {
    if (pid === null) return { owner: null, why: `netstat named no process for port ${port}` };
    if (!uids.has(pid)) {
      const p = run('ps', ['-o', 'uid=', '-p', String(pid)], { timeout: LISTEN_TIMEOUT });
      uids.set(pid, p.code === 0 && /^\s*\d+\s*$/.test(p.out) ? Number(p.out.trim()) : null);
    }
    const u = uids.get(pid);
    return u === null ? { owner: null, why: `the owner of process ${pid} could not be read` } : { owner: u };
  };
  const verdict = (o) => (o.owner === null ? untold(o.why) : o.owner === uid ? own() : foreign(`uid ${o.owner}`));
  if (peerPort !== null) {
    const conn = rows.find((x) => x.state !== 'LISTEN' && x.local === `${host}.${port}` && x.foreign === `${host}.${peerPort}`);
    // The table lists connections, so the server end of an open one is there unless the table is cut short.
    return conn ? verdict(ownerOf(conn.pid)) : untold(RESTRICTED);
  }
  const wild = host === '::1' ? ['*', '::'] : ['*', '0.0.0.0'];
  const listeners = [];
  for (const x of rows) {
    if (x.state !== 'LISTEN') continue;
    const [addr, p] = splitAddr(x.local);
    if (p !== port) continue;
    const at = addr === host ? 'exact' : wild.includes(addr) && (host === '::1' ? x.proto !== 'tcp4' : x.proto !== 'tcp6') ? 'wildcard' : null;
    if (at) { const o = ownerOf(x.pid); listeners.push({ at, owner: o.owner === null ? null : `uid ${o.owner}`, why: o.why }); }
  }
  return decide(listeners, `uid ${uid}`, port) || none();
}

/** Linux: `/proc/net` addresses in their file form (little-endian words), as the connection's address names them. */
const HEX = {
  '127.0.0.1': { v4: ['0100007F'], v6: ['0000000000000000FFFF00000100007F'] },
  '::1': { v4: [], v6: ['00000000000000000000000001000000'] },
};
const WILD = { '127.0.0.1': { v4: ['00000000'], v6: ['00000000000000000000000000000000'] }, '::1': { v4: [], v6: ['00000000000000000000000000000000'] } };

/** Linux: the rows of one `/proc/net/tcp*` file as { local, localPort, remote, remotePort, state, uid, inode }. */
function parseProcNet(text) {
  const rows = [];
  for (const line of String(text || '').split('\n').slice(1)) {
    const f = line.trim().split(/\s+/);
    if (f.length < 10) continue;
    const [local, lp] = f[1].split(':');
    const [remote, rp] = f[2].split(':');
    rows.push({ local: local.toUpperCase(), localPort: parseInt(lp, 16), remote: remote.toUpperCase(), remotePort: parseInt(rp, 16), state: f[3], uid: Number(f[7]), inode: f[9] });
  }
  return rows;
}

function linux({ port, peerPort, host }, uid, procNet) {
  const tables = [];
  for (const [file, v6] of [['tcp', false], ['tcp6', true]]) {
    try { tables.push({ v6, rows: parseProcNet(fs.readFileSync(path.join(procNet, file), 'utf8')) }); } catch (_) { /* absent: IPv6 off */ }
  }
  if (!tables.length) return untold(`${procNet}/tcp could not be read`);
  const forms = HEX[host] || HEX['127.0.0.1'];
  const wild = WILD[host] || WILD['127.0.0.1'];
  if (peerPort !== null) {
    let conn = null;
    for (const t of tables) {
      const mine = t.v6 ? forms.v6 : forms.v4;
      conn = conn || t.rows.find((x) => x.state === '01' && x.localPort === port && x.remotePort === peerPort && mine.includes(x.local) && mine.includes(x.remote));
    }
    if (!conn) return untold(`${RESTRICTED} (no row for it in ${procNet})`);
    if (conn.inode !== '0') return conn.uid === uid ? own() : foreign(`uid ${conn.uid}`);
    // Not accepted yet: the uid there may read 0, so the listener decides.
  }
  const listeners = [];
  for (const t of tables) {
    for (const x of t.rows) {
      if (x.state !== '0A' || x.localPort !== port) continue;
      const at = (t.v6 ? forms.v6 : forms.v4).includes(x.local) ? 'exact' : (t.v6 ? wild.v6 : wild.v4).includes(x.local) ? 'wildcard' : null;
      if (at) listeners.push({ at, owner: `uid ${x.uid}` });
    }
  }
  const d = decide(listeners, `uid ${uid}`, port);
  if (d) return d;
  return peerPort === null ? none() : untold(`no listener on port ${port} for a connection not yet accepted`);
}

// Windows: one PowerShell call prints `me <sid>`, a `conn <address> <pid> <sid or ?>` line for the server end of the
// client's connection, and a `listen <address> <pid> <sid or ?>` line per listener on the port. A port nobody listens
// on is an error Get-NetTCPConnection reports (no object found), so it is silenced and the script ends with exit 0;
// a computer without the cmdlet exits 3, an owner that cannot be told.
const PS_SCRIPT = (port, peerPort) => [
  '"me " + [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value',
  'if (-not (Get-Command Get-NetTCPConnection -ErrorAction SilentlyContinue)) { exit 3 }',
  'function Sid($id) { try { $p = Get-CimInstance Win32_Process -Filter ("ProcessId=" + $id) -ErrorAction Stop; $o = Invoke-CimMethod -InputObject $p -MethodName GetOwnerSid -ErrorAction Stop; if ($o.ReturnValue -eq 0 -and $o.Sid) { return $o.Sid } } catch { }; return "?" }',
  ...(peerPort === null ? [] : [`foreach ($c in @(Get-NetTCPConnection -LocalPort ${port} -RemotePort ${peerPort} -ErrorAction SilentlyContinue)) { "conn " + $c.LocalAddress + " " + $c.OwningProcess + " " + (Sid $c.OwningProcess) }`]),
  `foreach ($c in @(Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue)) { "listen " + $c.LocalAddress + " " + $c.OwningProcess + " " + (Sid $c.OwningProcess) }`,
  'exit 0',
].join('\n');

function parsePowerShell(text) {
  let me = null;
  const rows = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const f = line.trim().split(/\s+/);
    if (f[0] === 'me' && f[1]) me = f[1];
    else if ((f[0] === 'conn' || f[0] === 'listen') && f.length === 4 && /^\d+$/.test(f[2])) rows.push({ kind: f[0], address: f[1], pid: Number(f[2]), sid: f[3] });
  }
  return me ? { me, rows } : null;
}

function win32({ port, peerPort, host }, run) {
  const r = run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS_SCRIPT(port, peerPort)], { timeout: 30000 });
  const t = r.code === 0 ? parsePowerShell(r.out) : null;
  if (!t) return untold(`PowerShell did not list the sockets (${(r.err || `exit ${r.code}`).trim().split('\n')[0]})`);
  const sidOf = (x) => (x.sid === '?' ? null : `SID ${x.sid}`);
  if (peerPort !== null) {
    const conn = t.rows.find((x) => x.kind === 'conn' && x.address === host);
    if (!conn) return untold(RESTRICTED);
    if (conn.sid === '?') return untold(`the owner of process ${conn.pid} could not be read`);
    return conn.sid === t.me ? own() : foreign(`SID ${conn.sid}`);
  }
  const wild = host === '::1' ? ['::'] : ['0.0.0.0', '::'];
  const listeners = t.rows.filter((x) => x.kind === 'listen').map((x) => ({
    at: x.address === host ? 'exact' : wild.includes(x.address) ? 'wildcard' : null, owner: sidOf(x), why: `the owner of process ${x.pid} could not be read`,
  })).filter((x) => x.at);
  return decide(listeners, `SID ${t.me}`, port) || none();
}

const HOSTS = new Set(['127.0.0.1', '::1']);

/**
 * The owner of the server end of this client's connection to `host:port` (`peerPort` the client's own port), or, with
 * `peerPort` null, of the listener on the port. `run` is releases.run (injected for tests); `uid` this process's uid;
 * `procNet` the folder of Linux's tcp tables (PASSIONCODE_PROC_NET in tests).
 */
function connectionOwner({ port, peerPort = null, host = '127.0.0.1' }, { platform = process.platform, run, uid = process.getuid ? process.getuid() : null, procNet = process.env.PASSIONCODE_PROC_NET || '/proc/net' } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return untold(`port ${port} is not a TCP port`);
  if (peerPort !== null && (!Number.isInteger(peerPort) || peerPort < 1 || peerPort > 65535)) return untold(`port ${peerPort} is not a TCP port`);
  if (!HOSTS.has(host)) return untold(`${host} is not a loopback address`);
  const at = { port, peerPort, host };
  if (platform === 'win32') return win32(at, run);
  if (platform === 'linux') return linux(at, uid, procNet);
  if (platform === 'darwin') return darwin(at, run, uid);
  return untold(`doctor cannot read the socket table on ${platform}`);
}

/** The owner of the listener on loopback `port`, without a connection (the listener rule alone). */
const listenerOwner = (port, opts) => connectionOwner({ port, peerPort: null, host: '127.0.0.1' }, opts);

module.exports = { connectionOwner, listenerOwner, parseNetstat, parseProcNet, parsePowerShell, decide };
