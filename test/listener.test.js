'use strict';
// PC-152, PC-163: who owns the server end of a loopback connection, by the contract's HA-2 (fabric-agent-contract
// DEC-0154, CT-254 at tag v0.1.0+2026-11-07.3).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const L = require('../lib/listener');
const releases = require('../lib/releases');

const HEADER = 'Active Internet connections (including servers)\n'
  + 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options\n';
const row = (proto, local, proc, foreign = '*.*', state = 'LISTEN') => `${proto}       0      0  ${local}         ${foreign}                    ${state}                 0            0  131072  131072  ${proc}  00000 00000006 000000000ffc7886 00000000 00000800      1      0 000000\n`;

test('PC-163: the server end of this account\'s own connection reads `own` from the real socket table', async (t) => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const sock = await new Promise((resolve, reject) => { const s = net.connect({ host: '127.0.0.1', port }, () => resolve(s)); s.once('error', reject); });
  const mine = L.connectionOwner({ port, peerPort: sock.localPort }, { run: releases.run });
  const listening = L.listenerOwner(port, { run: releases.run });
  sock.destroy();
  await new Promise((r) => server.close(r));
  assert.deepEqual(mine, { state: 'own' }, JSON.stringify(mine));
  assert.deepEqual(listening, { state: 'own' }, JSON.stringify(listening));
  assert.deepEqual(L.listenerOwner(port, { run: releases.run }), { state: 'none' });
});

test('PC-152: macOS netstat rows in both of its forms, listeners and connections', () => {
  const text = HEADER + row('tcp4', '127.0.0.1.8799', 'Google Chrome He:4242') + row('tcp4', '127.0.0.1.8799', 'node:77', '127.0.0.1.50123', 'ESTABLISHED');
  assert.deepEqual(L.parseNetstat(text), [
    { proto: 'tcp4', local: '127.0.0.1.8799', foreign: '*.*', state: 'LISTEN', pid: 4242 },
    { proto: 'tcp4', local: '127.0.0.1.8799', foreign: '127.0.0.1.50123', state: 'ESTABLISHED', pid: 77 },
  ], 'a process name with spaces');
  const old = 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)     rhiwat shiwat    pid   epid  state    options\n'
    + 'tcp4       0      0  127.0.0.1.8799         *.*                    LISTEN      131072 131072   4243      0 0x0080 0x00000106\n';
  assert.equal(L.parseNetstat(old)[0].pid, 4243, 'macOS 12 and earlier print pid and epid');
  assert.equal(L.parseNetstat(HEADER + row('tcp4', '127.0.0.1.8799', '-'))[0].pid, null, 'no process named');
  assert.equal(L.parseNetstat('no table here'), null);
  assert.equal(L.parseNetstat(''), null);
});

const darwinRun = (table, uids, netstat) => (cmd, args) => {
  if (cmd === 'netstat') return netstat || { code: 0, out: table, err: '' };
  const uid = uids[args[args.indexOf('-p') + 1]];
  return uid === undefined ? { code: 1, out: '', err: 'no such process' } : { code: 0, out: `  ${uid}\n`, err: '' };
};

test('PC-163: on macOS the process that holds the server end of the connection decides', () => {
  const table = HEADER + row('tcp4', '127.0.0.1.8799', 'python3.12:4242') + row('tcp4', '127.0.0.1.8799', 'python3.12:4242', '127.0.0.1.50123', 'ESTABLISHED')
    + row('tcp4', '127.0.0.1.50123', 'node:9', '127.0.0.1.8799', 'ESTABLISHED');
  const at = (uids, netstat, peerPort = 50123) => L.connectionOwner({ port: 8799, peerPort }, { platform: 'darwin', run: darwinRun(table, uids, netstat), uid: 501 });
  assert.deepEqual(at({ 4242: 501, 9: 501 }), { state: 'own' });
  assert.deepEqual(at({ 4242: 502, 9: 501 }), { state: 'foreign-user', owner: 'uid 502' }, 'the client\'s own end is not the server\'s');
  assert.deepEqual(at({ 4242: 0 }), { state: 'foreign-user', owner: 'uid 0' }, 'root is another account');
  assert.match(at({}).reason, /owner of process 4242 could not be read/);
  const lost = at({ 4242: 501 }, undefined, 50999);
  assert.equal(lost.state, 'foreign-user'); assert.equal(lost.owner, null);
  assert.match(lost.reason, /^table-restricted/, 'a table without the connection is cut short, even with this account\'s listener in it');
  const empty = at({}, { code: 0, out: '', err: '' });
  assert.equal(empty.state, 'foreign-user'); assert.match(empty.reason, /^table-restricted.*netstat printed no table/, 'an empty table (an ad-hoc signed reader on some macOS releases) is never another account');
  assert.match(at({}, { code: 1, out: '', err: 'netstat: denied' }).reason, /^table-restricted.*netstat did not list the sockets: netstat: denied\)/, 'DEC-0155 RT-1: a netstat that fails is a cut-short table');
  assert.match(at({}, { code: 1, out: '', err: '' }).reason, /^table-restricted.*: exit 1\)/);
  assert.match(at({}, { code: 0, out: HEADER, err: '' }).reason, /^table-restricted.*only its header/, 'a header with no rows is a cut-short table');
  const bare = L.listenerOwner(8799, { platform: 'darwin', run: darwinRun(HEADER, {}), uid: 501 });
  assert.equal(bare.state, 'foreign-user'); assert.match(bare.reason, /^table-restricted.*only its header/, 'without a connection too: a header alone never says nothing listens');
  const nameless = L.connectionOwner({ port: 8799, peerPort: 50123 }, { platform: 'darwin', run: darwinRun(HEADER + row('tcp4', '127.0.0.1.8799', '-', '127.0.0.1.50123', 'ESTABLISHED'), {}), uid: 501 });
  assert.match(nameless.reason, /netstat named no process for port 8799/);
});

test('PC-163: on macOS the listener on the address wins over a wildcard; different accounts there cannot be told apart', () => {
  const at = (table, uids) => L.listenerOwner(8799, { platform: 'darwin', run: darwinRun(HEADER + table, uids), uid: 501 });
  const exact = row('tcp4', '127.0.0.1.8799', 'a:1');
  const wild = row('tcp46', '*.8799', 'b:2');
  assert.deepEqual(at(exact + wild, { 1: 501, 2: 502 }), { state: 'own' }, 'another account\'s wildcard beside this account\'s 127.0.0.1');
  assert.deepEqual(at(exact + wild, { 1: 502, 2: 501 }), { state: 'foreign-user', owner: 'uid 502' }, 'this account\'s wildcard does not make the port its own');
  assert.deepEqual(at(wild, { 2: 501 }), { state: 'own' }, 'the wildcard counts when none listens on 127.0.0.1');
  assert.deepEqual(at(row('tcp6', '*.8799', 'c:3'), { 3: 502 }), { state: 'none' }, 'an IPv6-only wildcard takes no 127.0.0.1 connection');
  assert.deepEqual(at(row('tcp6', '::1.8799', 'c:3'), { 3: 502 }), { state: 'none' }, '::1 is another address');
  assert.deepEqual(at(row('tcp4', '192.168.1.5.8799', 'd:4'), { 4: 502 }), { state: 'none' });
  const mixed = at(exact + row('tcp4', '127.0.0.1.8799', 'e:5'), { 1: 501, 5: 502 });
  assert.equal(mixed.state, 'foreign-user'); assert.equal(mixed.owner, null); assert.match(mixed.reason, /different OS accounts/);
});

test('PC-163: on Linux the accepted connection\'s uid decides; before it is accepted, the listener on its address', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-procnet-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const head = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n';
  const line = (local, remote, st, uid, inode) => `   0: ${local} ${remote} ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 ${inode} 1 0000000000000000 100 0 0 10 0\n`;
  const put = (tcp, tcp6 = '') => { fs.writeFileSync(path.join(dir, 'tcp'), head + tcp); fs.writeFileSync(path.join(dir, 'tcp6'), head + tcp6); };
  const conn = (peer = 0xC3A1) => L.connectionOwner({ port: 0x225F, peerPort: peer }, { platform: 'linux', uid: 1000, procNet: dir });
  const lstn = (uid, at = '0100007F') => line(`${at}:225F`, '00000000:0000', '0A', uid, 4000 + uid);
  put(line('0100007F:225F', '0100007F:C3A1', '01', 1000, 555) + lstn(1001));
  assert.deepEqual(conn(), { state: 'own' }, 'the accepted connection\'s uid, not the listener\'s');
  put(line('0100007F:225F', '0100007F:C3A1', '01', 1002, 555) + lstn(1000));
  assert.deepEqual(conn(), { state: 'foreign-user', owner: 'uid 1002' });
  put(line('0100007F:225F', '0100007F:C3A1', '01', 0, 0) + lstn(1000));
  assert.deepEqual(conn(), { state: 'own' }, 'inode 0: the uid there is not the owner, the listener decides');
  put(line('0100007F:225F', '0100007F:C3A1', '01', 0, 0) + lstn(1000, '00000000') + lstn(1003));
  assert.deepEqual(conn(), { state: 'foreign-user', owner: 'uid 1003' }, 'the listener on 127.0.0.1 wins over this account\'s wildcard');
  put(line('0100007F:225F', '0100007F:C3A1', '01', 0, 0) + lstn(1000) + lstn(1004));
  assert.match(conn().reason, /different OS accounts/);
  put(line('0100007F:225F', '0100007F:C3A1', '01', 0, 0));
  assert.match(conn().reason, /no listener on port 8799/, 'inode 0 and no listener: an owner that cannot be told');
  put(lstn(1000));
  assert.match(conn().reason, /^table-restricted/, 'no row for the connection');
  put(line('0100007F:225F', '0100007F:C3A1', '06', 1002, 0) + lstn(1000));
  assert.match(conn().reason, /^table-restricted/, 'a server end in TIME_WAIT is not this open connection');
  put('', line('0000000000000000FFFF00000100007F:225F', '0000000000000000FFFF00000100007F:C3A1', '01', 1000, 556));
  assert.deepEqual(conn(), { state: 'own' }, 'a dual-stack socket accepted the 127.0.0.1 connection');
  put(lstn(1000, '00000000'), line('00000000000000000000000001000000:225F', '00000000000000000000000000000000:0000', '0A', 1005, 9));
  assert.deepEqual(L.listenerOwner(0x225F, { platform: 'linux', uid: 1000, procNet: dir }), { state: 'own' }, '::1 is another address');
  put(line('0501A8C0:225F', '00000000:0000', '0A', 1006, 9));
  assert.deepEqual(L.listenerOwner(0x225F, { platform: 'linux', uid: 1000, procNet: dir }), { state: 'none' });
  const blind = L.connectionOwner({ port: 80, peerPort: 5000 }, { platform: 'linux', uid: 1000, procNet: path.join(dir, 'missing') });
  assert.equal(blind.state, 'foreign-user'); assert.match(blind.reason, /tcp could not be read/);
});

test('PC-163: on Windows the owner SID of the connection\'s server end decides; one that cannot be read is `foreign-user`', () => {
  const ps = (out, code = 0) => () => ({ code, out, err: code ? 'powershell failed' : '' });
  const me = 'me S-1-5-21-1-1001\r\n';
  const at = (out, code) => L.connectionOwner({ port: 8799, peerPort: 50123 }, { platform: 'win32', run: ps(out, code) });
  assert.deepEqual(at(`${me}conn 127.0.0.1 400 S-1-5-21-1-1001\r\nlisten 0.0.0.0 401 S-1-5-21-1-1002\r\n`), { state: 'own' });
  assert.deepEqual(at(`${me}conn 127.0.0.1 400 S-1-5-18\r\nlisten 127.0.0.1 400 S-1-5-18\r\n`), { state: 'foreign-user', owner: 'SID S-1-5-18' }, 'SYSTEM is another account');
  assert.match(at(`${me}conn 127.0.0.1 400 ?\r\n`).reason, /owner of process 400 could not be read/);
  assert.match(at(`${me}listen 127.0.0.1 400 S-1-5-21-1-1001\r\n`).reason, /^table-restricted/, 'no row for the connection');
  assert.match(at(`${me}conn ::1 400 S-1-5-21-1-1001\r\n`).reason, /^table-restricted/, 'a connection on ::1 is not the one to 127.0.0.1');
  assert.match(at('', 1).reason, /PowerShell did not list the sockets/);
  const lst = (out) => L.listenerOwner(8799, { platform: 'win32', run: ps(out) });
  assert.deepEqual(lst(`${me}listen 127.0.0.1 400 S-1-5-21-1-1001\r\nlisten 0.0.0.0 401 S-1-5-21-1-1002\r\n`), { state: 'own' });
  assert.deepEqual(lst(`${me}listen :: 401 S-1-5-21-1-1002\r\n`), { state: 'foreign-user', owner: 'SID S-1-5-21-1-1002' }, 'a dual-mode wildcard');
  assert.deepEqual(lst(`${me}listen 192.168.1.2 400 S-1-5-21-1-1002\r\n`), { state: 'none' });
  assert.deepEqual(lst(me), { state: 'none' });
});

test('PC-152: a port that is not a TCP port, or an address that is not loopback, is never read as the service\'s', () => {
  assert.equal(L.listenerOwner(0, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.listenerOwner(70000, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.connectionOwner({ port: 80, peerPort: 0 }, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.connectionOwner({ port: 80, host: '10.0.0.1' }, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.listenerOwner(80, { platform: 'aix', run: releases.run }).state, 'foreign-user');
});
