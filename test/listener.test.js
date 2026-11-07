'use strict';
// PC-152: who owns a loopback listener, by the contract's HA-2 (fabric-agent-contract DEC-0154).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const L = require('../lib/listener');
const releases = require('../lib/releases');

const HEADER = 'Active Internet connections (including servers)\n'
  + 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options\n';
const row = (proto, local, proc) => `${proto}       0      0  ${local}         *.*                    LISTEN                 0            0  131072  131072  ${proc}  00000 00000006 000000000ffc7886 00000000 00000800      1      0 000000\n`;

test('PC-152: this account\'s own listener reads `own`, and a port nobody holds reads `none`, from the real socket table', async (t) => {
  const server = http.createServer((req, res) => res.end('ok'));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const mine = L.listenerOwner(port, { run: releases.run });
  await new Promise((r) => server.close(r));
  assert.deepEqual(mine, { state: 'own' }, JSON.stringify(mine));
  assert.deepEqual(L.listenerOwner(port, { run: releases.run }), { state: 'none' });
});

test('PC-152: macOS reads the owning process from netstat, in both of its forms, and only listeners that take loopback', () => {
  const text = HEADER + row('tcp4', '127.0.0.1.8799', 'Google Chrome He:4242') + row('tcp4', '192.168.1.5.8799', 'other:7') + row('tcp4', '127.0.0.1.8800', 'x:8')
    + row('tcp6', '::1.8801', 'node:9') + row('tcp46', '*.8802', 'node:10');
  assert.deepEqual(L.parseNetstat(text, 8799), [4242], 'a process name with spaces; another address on the port is not loopback');
  assert.deepEqual(L.parseNetstat(text, 8801), [9]);
  assert.deepEqual(L.parseNetstat(text, 8802), [10], 'the wildcard takes loopback too');
  assert.deepEqual(L.parseNetstat(text, 9000), []);
  const old = 'Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)     rhiwat shiwat    pid   epid  state    options\n'
    + 'tcp4       0      0  127.0.0.1.8799         *.*                    LISTEN      131072 131072   4243      0 0x0080 0x00000106\n';
  assert.deepEqual(L.parseNetstat(old, 8799), [4243], 'macOS 12 and earlier print pid and epid');
  assert.equal(L.parseNetstat('no table here', 8799), null);
});

test('PC-152: on macOS a listener of another uid, or one whose owner cannot be read, is `foreign-user`', () => {
  const table = HEADER + row('tcp4', '127.0.0.1.8799', 'python3.12:4242');
  const run = (uids, netstat = { code: 0, out: table, err: '' }) => (cmd, args) => {
    if (cmd === 'netstat') return netstat;
    const uid = uids[args[args.indexOf('-p') + 1]];
    return uid === undefined ? { code: 1, out: '', err: 'no such process' } : { code: 0, out: `  ${uid}\n`, err: '' };
  };
  assert.deepEqual(L.listenerOwner(8799, { platform: 'darwin', run: run({ 4242: 501 }), uid: 501 }), { state: 'own' });
  assert.deepEqual(L.listenerOwner(8799, { platform: 'darwin', run: run({ 4242: 502 }), uid: 501 }), { state: 'foreign-user', owner: 'uid 502' });
  assert.deepEqual(L.listenerOwner(8799, { platform: 'darwin', run: run({ 4242: 0 }), uid: 501 }), { state: 'foreign-user', owner: 'uid 0' }, 'root is another account');
  const gone = L.listenerOwner(8799, { platform: 'darwin', run: run({}), uid: 501 });
  assert.equal(gone.state, 'foreign-user'); assert.equal(gone.owner, null); assert.match(gone.reason, /owner of process 4242 could not be read/);
  const blind = L.listenerOwner(8799, { platform: 'darwin', run: run({}, { code: 1, out: '', err: 'netstat: denied' }), uid: 501 });
  assert.equal(blind.state, 'foreign-user'); assert.match(blind.reason, /netstat did not list the sockets \(netstat: denied\)/);
  assert.deepEqual(L.listenerOwner(9000, { platform: 'darwin', run: run({}), uid: 501 }), { state: 'none' });
  const nameless = L.listenerOwner(8799, { platform: 'darwin', run: run({ 4242: 501 }, { code: 0, out: HEADER + row('tcp4', '127.0.0.1.8799', '-'), err: '' }), uid: 501 });
  assert.equal(nameless.state, 'foreign-user', 'a listener netstat names no process for is not this account\'s');
  assert.match(nameless.reason, /netstat named no process for port 8799/);
});

test('PC-152: on Linux the uid column of /proc/net/tcp and tcp6 decides, for loopback and wildcard listeners', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-procnet-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const head = '  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode\n';
  const line = (local, st, uid) => `   0: ${local} 00000000:0000 ${st} 00000000:00000000 00:00000000 00000000  ${uid}        0 12345 1 0000000000000000 100 0 0 10 0\n`;
  fs.writeFileSync(path.join(dir, 'tcp'), head + line('0100007F:225F', '0A', 1001) + line('0501A8C0:2260', '0A', 1002) + line('00000000:2261', '0A', 1000) + line('0100007F:2262', '01', 1003));
  fs.writeFileSync(path.join(dir, 'tcp6'), head + line('00000000000000000000000001000000:2263', '0A', 1000) + line('0000000000000000FFFF00000100007F:2264', '0A', 1004));
  const at = (port) => L.listenerOwner(port, { platform: 'linux', uid: 1000, procNet: dir });
  assert.deepEqual(at(0x225F), { state: 'foreign-user', owner: 'uid 1001' });
  assert.deepEqual(at(0x2260), { state: 'none' }, 'a listener on another address does not take loopback');
  assert.deepEqual(at(0x2261), { state: 'own' }, 'the wildcard, this uid');
  assert.deepEqual(at(0x2262), { state: 'none' }, 'an established connection is not a listener');
  assert.deepEqual(at(0x2263), { state: 'own' }, '::1');
  assert.deepEqual(at(0x2264), { state: 'foreign-user', owner: 'uid 1004' }, 'an IPv4-mapped loopback listener');
  const blind = L.listenerOwner(80, { platform: 'linux', uid: 1000, procNet: path.join(dir, 'missing') });
  assert.equal(blind.state, 'foreign-user'); assert.match(blind.reason, /tcp could not be read/);
});

test('PC-152: on Windows the owner SID of the listening process decides; one that cannot be read is `foreign-user`', () => {
  const ps = (out, code = 0) => () => ({ code, out, err: code ? 'powershell failed' : '' });
  const me = 'me S-1-5-21-1-1001\r\n';
  const at = (out, code) => L.listenerOwner(8799, { platform: 'win32', run: ps(out, code) });
  assert.deepEqual(at(`${me}127.0.0.1 400 S-1-5-21-1-1001\r\n`), { state: 'own' });
  assert.deepEqual(at(`${me}0.0.0.0 400 S-1-5-21-1-1002\r\n`), { state: 'foreign-user', owner: 'SID S-1-5-21-1-1002' });
  assert.deepEqual(at(`${me}::1 400 S-1-5-18\r\n`), { state: 'foreign-user', owner: 'SID S-1-5-18' }, 'SYSTEM is another account');
  assert.match(at(`${me}127.0.0.1 400 ?\r\n`).reason, /owner of process 400 could not be read/);
  assert.deepEqual(at(`${me}192.168.1.2 400 S-1-5-21-1-1002\r\n`), { state: 'none' });
  assert.deepEqual(at(me), { state: 'none' });
  assert.match(at('', 1).reason, /PowerShell did not list the sockets/);
});

test('PC-152: a port that is not a TCP port is never read as the service\'s', () => {
  assert.equal(L.listenerOwner(0, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.listenerOwner(70000, { platform: 'linux' }).state, 'foreign-user');
  assert.equal(L.listenerOwner(80, { platform: 'aix', run: releases.run }).state, 'foreign-user');
});
