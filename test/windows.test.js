'use strict';
// Windows acceptance of 2026-10-28 (fabric-workspace docs/reports/2026-10-28-windows-acceptance): the
// launcher's two defects there, PC-84 and PC-85. Every test runs on any OS; on Windows itself the
// rename below is the real one, so the hosted Windows job proves PC-84 on the file system it is about.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const L = require('../lib/launcher');
const W = require('../lib/windows-apps');
const catalog = require('../lib/catalog');

const onWindows = process.platform === 'win32';
// Windows refuses a rename over an existing directory link; elsewhere the stand-in refuses the same way.
const windowsRename = (from, to) => {
  if (!onWindows && fs.lstatSync(to, { throwIfNoEntry: false })) throw Object.assign(new Error(`EPERM: operation not permitted, rename '${from}' -> '${to}'`), { code: 'EPERM' });
  fs.renameSync(from, to);
};

function tree() {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-'));
  const release = (v) => { const dir = path.join(state, 'releases', v); fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'manifest.json'), v); return dir; };
  return { state, current: path.join(state, 'current'), release };
}
const leftovers = (state) => fs.readdirSync(state).filter((n) => /^current\..+\.lnk$/.test(n));

test('PC-84: on Windows a second update moves `current` to the new release and leaves no link behind', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current, { platform: 'win32', rename: windowsRename });
  fs.symlinkSync(old, path.join(t.state, 'current.24764.lnk')); // what a failed 0.2.45 update left on the tester's machine
  L.symlinkAtomic(next, t.current, { platform: 'win32', rename: windowsRename });
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.45');
  assert.deepEqual(leftovers(t.state), []);
  assert.equal(fs.readFileSync(path.join(old, 'manifest.json'), 'utf8'), '0.2.44', 'the old release itself is untouched');
  L.symlinkAtomic(next, t.current, { platform: 'win32', rename: windowsRename });
  assert.equal(fs.readdirSync(t.state).filter((n) => n.startsWith('current')).length, 1, 'one `current`, nothing beside it');
});

test('PC-84: if the second rename fails too, the old link is put back and no temporary link is left', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current, { platform: 'win32', rename: windowsRename });
  let calls = 0;
  const refuses = (from, to) => { calls += 1; throw Object.assign(new Error(`EPERM: rename '${from}' -> '${to}'`), { code: 'EPERM' }); };
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'win32', rename: refuses }), /EPERM/);
  assert.equal(calls, 2);
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.44');
  assert.deepEqual(leftovers(t.state), []);
});

test('PC-84: off Windows a refused rename is still an error, and the temporary link is removed', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current);
  const refuses = (from, to) => { throw Object.assign(new Error(`EPERM ${from} ${to}`), { code: 'EPERM' }); };
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'linux', rename: refuses }), /EPERM/);
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.44');
  assert.deepEqual(leftovers(t.state), []);
});

test('PC-84: a plain directory at `current` is never removed to make room for the link', () => {
  const t = tree();
  const next = t.release('0.2.45');
  fs.mkdirSync(t.current);
  fs.writeFileSync(path.join(t.current, 'mine.txt'), 'a person\'s file');
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'win32', rename: windowsRename }));
  assert.equal(fs.readFileSync(path.join(t.current, 'mine.txt'), 'utf8'), 'a person\'s file');
  assert.deepEqual(leftovers(t.state), []);
});

const REG = [
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\5f2a1c3e-fabric-dashboards',
  '    DisplayName    REG_SZ    Fabric Dashboards 0.8.13',
  '    DisplayVersion    REG_SZ    0.8.13',
  '    UninstallString    REG_SZ    "C:\\Users\\tester\\AppData\\Local\\Programs\\Fabric Dashboards\\Uninstall Fabric Dashboards.exe" /currentuser',
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Fabric Switchboard',
  '    DisplayName    REG_SZ    Fabric Switchboard',
  '    DisplayVersion    REG_SZ    0.7.0',
  '    InstallLocation    REG_SZ    C:\\Users\\tester\\AppData\\Local\\Fabric Switchboard',
  '',
  'HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Some Other Fabric Tool',
  '    DisplayName    REG_SZ    Fabric Tooling Pack',
  '    DisplayVersion    REG_SZ    9.9.9',
  '',
].join('\r\n');

test('PC-85: the uninstall entries name each app and its version; "Fabric" never matches another product', () => {
  const entries = W.parseUninstall(REG);
  assert.equal(entries.length, 3);
  const dash = W.findWindowsApp(catalog.byId('dashboards'), { entries, env: {}, home: os.tmpdir() });
  assert.deepEqual([dash.version, dash.source], ['0.8.13', 'registry']);
  assert.equal(dash.at, 'C:\\Users\\tester\\AppData\\Local\\Programs\\Fabric Dashboards', 'the folder of its uninstaller');
  const sb = W.findWindowsApp(catalog.byId('switchboard'), { entries, env: {}, home: os.tmpdir() });
  assert.deepEqual([sb.version, sb.at], ['0.7.0', 'C:\\Users\\tester\\AppData\\Local\\Fabric Switchboard']);
  assert.equal(W.findWindowsApp(catalog.byId('fabric'), { entries, env: { LOCALAPPDATA: path.join(os.tmpdir(), 'pc-none') }, home: os.tmpdir() }), null);
});

test('PC-85: without an uninstall entry the per-user folder still shows the app, version unknown', () => {
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-local-'));
  fs.mkdirSync(path.join(local, 'Programs', 'Fabric Inbox'), { recursive: true });
  fs.writeFileSync(path.join(local, 'Programs', 'Fabric Inbox', 'Fabric Inbox.exe'), '');
  fs.mkdirSync(path.join(local, 'Project Observatory'), { recursive: true }); // a folder without the program is not an install
  const found = W.findWindowsApp(catalog.byId('inbox'), { entries: [], env: { LOCALAPPDATA: local }, home: os.tmpdir() });
  assert.deepEqual(found, { at: path.join(local, 'Programs', 'Fabric Inbox'), version: null, source: 'folder' });
  assert.equal(W.findWindowsApp(catalog.byId('observatory'), { entries: [], env: { LOCALAPPDATA: local }, home: os.tmpdir() }), null);
});

// The whole command on a Windows machine, as the tester ran it: `doctor` reads each app, offline.
// A stand-in `reg` answers the per-user hive; it is a shell script, so this one runs off Windows.
test('PC-85: doctor on Windows names the installed apps and their versions instead of "run on macOS"', { skip: onWindows && 'the stand-in reg is a shell script' }, () => {
  const { spawnSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-doctor-'));
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(home, 'reg.txt'), REG);
  fs.writeFileSync(path.join(bin, 'reg'), `#!/bin/sh\ncase "$2" in HKCU*) cat "${path.join(home, 'reg.txt')}";; *) echo "ERROR: The system was unable to find the specified registry key or value." >&2; exit 1;; esac\n`, { mode: 0o755 });
  const local = path.join(home, 'AppData', 'Local');
  fs.mkdirSync(path.join(local, 'Programs', 'Fabric Inbox'), { recursive: true });
  fs.writeFileSync(path.join(local, 'Programs', 'Fabric Inbox', 'Fabric Inbox.exe'), '');
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'passioncode.js'), 'doctor', '--json', '--offline'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, LOCALAPPDATA: local, PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_HOME: '', PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_SERVICES_DIR: path.join(home, 'services'), KIMI_CODE_HOME: path.join(home, '.kimi-code') },
  });
  const checks = JSON.parse(r.stdout).checks;
  const app = (id) => checks.find((c) => c.id === `app.${id}`);
  assert.equal(app('dashboards').state, 'ok');
  assert.match(app('dashboards').detail, /^Fabric Dashboards 0\.8\.13 in C:\\Users\\tester\\AppData\\Local\\Programs\\Fabric Dashboards; latest not checked/);
  assert.match(app('switchboard').detail, /^Fabric Switchboard 0\.7\.0 in /);
  assert.match(app('inbox').detail, /^Fabric Inbox \(version unknown\) in .*Fabric Inbox/);
  assert.equal(app('observatory').detail, 'Project Observatory: not installed');
  assert.ok(!checks.some((c) => /run on macOS/.test(c.detail)), 'no "app checks run on macOS" on Windows');
});
