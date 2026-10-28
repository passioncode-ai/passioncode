'use strict';
// Windows acceptance of 2026-10-28 (fabric-workspace docs/reports/2026-10-28-windows-acceptance): the
// launcher's two defects there, PC-85 and PC-86, and PC-87 found beside them. Every test runs on any OS; on Windows itself the
// rename below is the real one, so the hosted Windows job proves PC-85 on the file system it is about.
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

test('PC-85: on Windows a second update moves `current` to the new release and leaves no link behind', () => {
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

test('PC-85: if the second rename fails too, the old link is put back and no temporary link is left', () => {
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

test('PC-85: if the old link cannot be removed, the temporary link is removed and the old link stays', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current, { platform: 'win32', rename: windowsRename });
  const busy = (at) => { throw Object.assign(new Error(`EBUSY: resource busy or locked, unlink '${at}'`), { code: 'EBUSY' }); };
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'win32', rename: windowsRename, unlink: busy }), /EBUSY/);
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.44');
  assert.deepEqual(leftovers(t.state), []);
});

test('PC-85: off Windows a refused rename is still an error, and the temporary link is removed', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current);
  const refuses = (from, to) => { throw Object.assign(new Error(`EPERM ${from} ${to}`), { code: 'EPERM' }); };
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'linux', rename: refuses }), /EPERM/);
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.44');
  assert.deepEqual(leftovers(t.state), []);
});

test('PC-85: a plain directory at `current` is never removed to make room for the link', () => {
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

test('PC-86: the uninstall entries name each app and its version; "Fabric" never matches another product', () => {
  const entries = W.parseUninstall(REG);
  assert.equal(entries.length, 3);
  const dash = W.findWindowsApp(catalog.byId('dashboards'), { entries, env: {}, home: os.tmpdir() });
  assert.deepEqual([dash.version, dash.source], ['0.8.13', 'registry']);
  assert.equal(dash.at, 'C:\\Users\\tester\\AppData\\Local\\Programs\\Fabric Dashboards', 'the folder of its uninstaller');
  const sb = W.findWindowsApp(catalog.byId('switchboard'), { entries, env: {}, home: os.tmpdir() });
  assert.deepEqual([sb.version, sb.at], ['0.7.0', 'C:\\Users\\tester\\AppData\\Local\\Fabric Switchboard']);
  assert.equal(W.findWindowsApp(catalog.byId('fabric'), { entries, env: { LOCALAPPDATA: path.join(os.tmpdir(), 'pc-none') }, home: os.tmpdir() }), null);
});

test('PC-86: an MSI entry names no folder; the folder of the app is found on disk, or the location is left out', () => {
  const msi = W.parseUninstall([
    'HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\{0F1A2B3C-4D5E-6F70-8192-A3B4C5D6E7F8}',
    '    DisplayName    REG_SZ    Project Observatory',
    '    DisplayVersion    REG_SZ    0.30.0',
    '    UninstallString    REG_EXPAND_SZ    MsiExec.exe /X{0F1A2B3C-4D5E-6F70-8192-A3B4C5D6E7F8}',
  ].join('\r\n'));
  const none = path.join(os.tmpdir(), 'pc-none');
  assert.deepEqual(W.findWindowsApp(catalog.byId('observatory'), { entries: msi, env: { LOCALAPPDATA: none }, home: os.tmpdir() }), { at: null, version: '0.30.0', source: 'registry' });
  const local = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-local-'));
  fs.mkdirSync(path.join(local, 'Project Observatory'), { recursive: true });
  fs.writeFileSync(path.join(local, 'Project Observatory', 'project-observatory.exe'), '');
  assert.equal(W.findWindowsApp(catalog.byId('observatory'), { entries: msi, env: { LOCALAPPDATA: local }, home: os.tmpdir() }).at, path.join(local, 'Project Observatory'));
});

test('PC-86: a hive reg cannot read is named, so "not installed" is not taken as certain; a missing hive is not', () => {
  const run = (cmd, args) => {
    if (args[1].startsWith('HKCU')) return { code: 0, out: REG, err: '' };
    if (args[1].includes('WOW6432Node')) return { code: 1, out: '', err: 'ERROR: The system was unable to find the specified registry key or value.' };
    return { code: 124, out: '', err: 'reg timed out after 15 s' };
  };
  const { entries, unread } = W.readUninstallEntries(run);
  assert.equal(entries.length, 3);
  assert.deepEqual(unread, [{ hive: W.HIVES[1], why: 'reg timed out after 15 s' }]);
});

test('PC-86: without an uninstall entry the per-user folder still shows the app, version unknown', () => {
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
test('PC-86: doctor on Windows names the installed apps and their versions instead of "run on macOS"', { skip: onWindows && 'the stand-in reg is a shell script' }, () => {
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

// The seam reading of 2026-10-28: setup decided "new or existing" with a macOS-only rule, so a Windows
// machine with apps but no skill set was "a new setup" while its own apps rows showed them installed.
test('PC-86: setup on Windows calls a machine with an installed app an existing setup', { skip: onWindows && 'the stand-in reg is a shell script' }, () => {
  const { spawnSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-setup-'));
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(home, 'reg.txt'), REG);
  fs.writeFileSync(path.join(bin, 'reg'), `#!/bin/sh\ncase "$2" in HKCU*) cat "${path.join(home, 'reg.txt')}";; *) echo "ERROR: The system was unable to find the specified registry key or value." >&2; exit 1;; esac\n`, { mode: 0o755 });
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'passioncode.js'), 'setup', '--dry-run', '--offline', '--json'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_HOME: '', PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_SERVICES_DIR: path.join(home, 'services'), KIMI_CODE_HOME: path.join(home, '.kimi-code') },
  });
  const out = JSON.parse(r.stdout);
  assert.equal(out.mode, 'existing', r.stderr);
  assert.ok(!out.plan.some((i) => i.kind === 'install' || i.kind === 'replace'), 'setup installs no app on Windows');
});

// On the hosted Windows runner the real reg.exe answers: its output parses, and both hives a 64-bit
// Windows always has are read.
test('PC-86: the real reg.exe output parses and the per-user and machine hives are read', { skip: !onWindows && 'needs Windows' }, () => {
  const releases = require('../lib/releases');
  const { entries, unread } = W.readUninstallEntries(releases.run);
  assert.deepEqual(unread, []);
  assert.ok(entries.length > 0, 'a Windows runner has installed programs');
  assert.ok(entries.every((e) => e.key.startsWith('HKEY_') && e.DisplayName));
});

// PC-88: on Windows `setup --with` installs no app, so a stale MCP entry of an app that is not installed
// is fixed from its download page, never by a command that plans nothing.
test('PC-88: doctor on Windows sends a stale MCP entry of a missing app to its download page', { skip: onWindows && 'the stand-in reg is a shell script' }, () => {
  const { spawnSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-mcp-'));
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, 'reg'), '#!/bin/sh\necho "ERROR: The system was unable to find the specified registry key or value." >&2; exit 1\n', { mode: 0o755 });
  fs.writeFileSync(path.join(home, '.claude.json'), JSON.stringify({ mcpServers: { observatory: { command: path.join(home, 'gone', 'project-observatory.exe'), args: ['mcp'] } } }));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'passioncode.js'), 'doctor', '--json', '--offline'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_HOME: '', PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_SERVICES_DIR: path.join(home, 'services'), KIMI_CODE_HOME: path.join(home, '.kimi-code') },
  });
  const row = JSON.parse(r.stdout).checks.find((c) => c.id === 'mcp.claude.observatory');
  assert.ok(row, r.stderr);
  assert.equal(row.state, 'fail');
  assert.equal(row.fix, 'download Project Observatory from https://passioncode.ai/observatory/, or remove that entry from Claude Code');
});

// PC-87: a symbolic link to a directory needs an administrator or Developer Mode on Windows (the tester
// had the first), a junction needs neither. Every link the launcher makes there is a junction.
test('PC-87: on Windows every link the launcher makes is a junction with an absolute target', () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  const made = [];
  const symlink = (target, at, type) => { made.push({ target, at: path.basename(at), type }); fs.symlinkSync(target, at); };
  L.makeLink(path.join('releases', '0.2.44'), t.current, { platform: 'win32', symlink });
  assert.deepEqual(made.pop(), { target: old, at: 'current', type: 'junction' }, 'a relative target is made absolute');
  fs.unlinkSync(t.current);
  L.symlinkAtomic(old, t.current, { platform: 'win32', rename: windowsRename, symlink });
  const refuses = (from, to) => { throw Object.assign(new Error(`EPERM: rename '${from}' -> '${to}'`), { code: 'EPERM' }); };
  assert.throws(() => L.symlinkAtomic(next, t.current, { platform: 'win32', rename: refuses, symlink }), /EPERM/);
  assert.deepEqual(made.map((m) => m.type), ['junction', 'junction', 'junction'], 'the temporary links and the put-back one');
  assert.ok(made.every((m) => path.isAbsolute(m.target)));
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.44');
  made.length = 0;
  L.makeLink(old, path.join(t.state, 'off-windows'), { platform: 'darwin', symlink });
  assert.equal(made[0].type, undefined, 'elsewhere it stays a symbolic link');
});

// On the hosted Windows runner the real junction: made, read back in the form the launcher compares
// (no `\\?\`, no trailing separator), swapped by a second update, removed without touching its target.
test('PC-87: a real junction on Windows reads back as the path it was made to', { skip: !onWindows && 'needs Windows' }, () => {
  const t = tree();
  const old = t.release('0.2.44');
  const next = t.release('0.2.45');
  L.symlinkAtomic(old, t.current);
  assert.equal(L.linkTarget(t.current), path.resolve(old));
  assert.ok(fs.lstatSync(t.current).isSymbolicLink());
  L.symlinkAtomic(next, t.current);
  assert.equal(L.linkTarget(t.current), path.resolve(next));
  assert.equal(fs.readFileSync(path.join(t.current, 'manifest.json'), 'utf8'), '0.2.45');
  assert.deepEqual(leftovers(t.state), []);
  fs.unlinkSync(t.current);
  assert.equal(fs.readFileSync(path.join(old, 'manifest.json'), 'utf8'), '0.2.44', 'removing the junction leaves its target');
});

// PC-89 on Windows: the train is compared from the installer's records; behind is the person's
// install from the download page, never a command that plans nothing there.
test('PC-89: doctor on Windows compares each app with the release train and names the download for one behind', { skip: onWindows && 'the stand-in reg is a shell script' }, () => {
  const { spawnSync } = require('node:child_process');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-win-train-'));
  const bin = path.join(home, 'bin'); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(home, 'reg.txt'), REG);
  fs.writeFileSync(path.join(bin, 'reg'), `#!/bin/sh\ncase "$2" in HKCU*) cat "${path.join(home, 'reg.txt')}";; *) echo "ERROR: The system was unable to find the specified registry key or value." >&2; exit 1;; esac\n`, { mode: 0o755 });
  const trainsDir = path.join(home, 'trains'); fs.mkdirSync(trainsDir);
  fs.writeFileSync(path.join(trainsDir, 'org-test.json'), JSON.stringify({ train: 'org-test', title: 'Org Test', apps: { dashboards: '0.8.15', switchboard: '0.7.0' } }));
  fs.mkdirSync(path.join(home, '.passioncode'));
  fs.writeFileSync(path.join(home, '.passioncode', 'state.json'), JSON.stringify({ train: 'org-test' }));
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'bin', 'passioncode.js'), 'doctor', '--json', '--offline'], {
    encoding: 'utf8',
    env: { ...process.env, HOME: home, PATH: `${bin}${path.delimiter}${process.env.PATH}`, LOCALAPPDATA: path.join(home, 'AppData', 'Local'), PASSIONCODE_PLATFORM: 'win32', PASSIONCODE_HOME: '', PASSIONCODE_TRAINS: trainsDir, PASSIONCODE_CLAUDE: path.join(__dirname, 'fake-claude.js'), PASSIONCODE_SERVICES_DIR: path.join(home, 'services'), KIMI_CODE_HOME: path.join(home, '.kimi-code') },
  });
  const checks = JSON.parse(r.stdout).checks;
  const row = (id) => checks.find((c) => c.id === id);
  assert.equal(row('app.switchboard').state, 'ok');
  assert.equal(row('app.dashboards').state, 'warn');
  assert.equal(row('app.dashboards').fix, 'install 0.8.15 from https://passioncode.ai/dashboards/');
  assert.equal(row('app.dashboards').repair, null);
  assert.match(row('train').detail, /^release train org-test \(Org Test\): 1 of 2 apps at their pinned version/);
});
