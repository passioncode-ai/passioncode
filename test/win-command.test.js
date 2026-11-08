'use strict';
// PC-143: commands installed through npm on Windows (`claude.cmd`, an MCP server's `.cmd` shim) start without a shell.
const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveCommand } = require('../lib/win-command');
const { probe } = require('../lib/mcp-probe');

const NODE = 'C:\\Program Files\\nodejs\\node.exe';
const BIN = 'C:\\Users\\example\\AppData\\Roaming\\npm';
// npm's cmd-shim for a package bin, as `npm i -g` writes it.
const SHIM = [
  '@ECHO off', 'GOTO start', ':find_dp0', 'SET dp0=%~dp0', 'EXIT /b', ':start', 'SETLOCAL', 'CALL :find_dp0', '',
  'IF EXIST "%dp0%\\node.exe" (', '  SET "_prog=%dp0%\\node.exe"', ') ELSE (', '  SET "_prog=node"', '  SET PATHEXT=%PATHEXT:;.JS;=;%', ')', '',
  'endLocal & goto #_undefined_# 2>NUL || title %COMSPEC% & "%_prog%"  "%dp0%\\node_modules\\@example\\tool\\cli.js" %*',
].join('\r\n');

function windows(files, env = { PATH: `C:\\Windows\\system32;${BIN}`, PATHEXT: '.COM;.EXE;.BAT;.CMD;.VBS;.JS' }) {
  return {
    platform: 'win32', env, execPath: NODE,
    exists: (f) => Object.prototype.hasOwnProperty.call(files, f),
    read: (f) => { if (typeof files[f] !== 'string') throw new Error('EACCES'); return files[f]; },
  };
}

test('PC-143: an npm .cmd shim on PATH runs its JavaScript target through this Node', () => {
  const r = resolveCommand('claude', ['--version'], windows({ [`${BIN}\\claude.cmd`]: SHIM }));
  assert.deepEqual(r, { command: NODE, args: [`${BIN}\\node_modules\\@example\\tool\\cli.js`, '--version'] });
});

test('PC-143: an older shim that names %~dp0 is read too', () => {
  const old = '@IF EXIST "%~dp0\\node.exe" (\r\n  "%~dp0\\node.exe"  "%~dp0\\node_modules\\tool\\bin\\tool.mjs" %*\r\n)';
  const r = resolveCommand('tool', [], windows({ [`${BIN}\\tool.cmd`]: old }));
  assert.deepEqual(r, { command: NODE, args: [`${BIN}\\node_modules\\tool\\bin\\tool.mjs`] });
});

test('PC-143: an .exe found first on PATH runs as itself, by its full path', () => {
  const files = { 'C:\\Windows\\system32\\claude.exe': null, [`${BIN}\\claude.cmd`]: SHIM };
  assert.deepEqual(resolveCommand('claude', ['a'], windows(files)), { command: 'C:\\Windows\\system32\\claude.exe', args: ['a'] });
  // PATHEXT order decides within one folder: .COM and .EXE before .CMD.
  const same = { [`${BIN}\\claude.cmd`]: SHIM, [`${BIN}\\claude.exe`]: null };
  assert.equal(resolveCommand('claude', [], windows(same)).command, `${BIN}\\claude.exe`);
});

test('PC-143: a batch file that is not an npm shim is refused, never started through cmd.exe', () => {
  const file = `${BIN}\\server.bat`;
  const r = resolveCommand('server', ['x'], windows({ [file]: '@echo off\r\npython server.py %*' }));
  assert.equal(r.refused, `${file} is a batch file that only a shell can start`);
  const unreadable = resolveCommand(file, [], windows({ [file]: null }));
  assert.equal(unreadable.refused, `${file} is a batch file that only a shell can start`);
});

test('PC-143: a path is that file, a name with an extension is not extended, and nothing found is left as named', () => {
  const file = 'D:\\tools\\claude.cmd';
  assert.equal(resolveCommand(file, [], windows({ [file]: SHIM })).command, NODE);
  assert.deepEqual(resolveCommand('missing', ['a'], windows({})), { command: 'missing', args: ['a'] });
  assert.deepEqual(resolveCommand('claude.exe', [], windows({ [`${BIN}\\claude.exe`]: null, [`${BIN}\\claude.exe.cmd`]: SHIM })),
    { command: `${BIN}\\claude.exe`, args: [] });
  // No PATHEXT: the shell's default list.
  assert.equal(resolveCommand('claude', [], windows({ [`${BIN}\\claude.cmd`]: SHIM }, { PATH: BIN })).command, NODE);
});

test('PC-143: on macOS and Linux a command starts as named, and a script through Node only when asked', () => {
  const posix = { platform: 'linux', execPath: '/usr/bin/node', exists: () => { throw new Error('no lookup'); } };
  assert.deepEqual(resolveCommand('claude', ['a'], posix), { command: 'claude', args: ['a'] });
  assert.deepEqual(resolveCommand('/x/stand-in.js', ['a'], posix), { command: '/usr/bin/node', args: ['/x/stand-in.js', 'a'] });
  assert.deepEqual(resolveCommand('/x/server.js', ['a'], { ...posix, scripts: false }), { command: '/x/server.js', args: ['a'] });
  // Windows starts no file by its `#!` line, so there a script always runs through Node.
  assert.deepEqual(resolveCommand('C:\\x\\server.js', [], { ...windows({}), scripts: false }), { command: NODE, args: ['C:\\x\\server.js'] });
});

test('PC-143: the probe names a batch file it will not start and starts nothing', { skip: process.platform !== 'win32' && 'a batch file is Windows only' }, async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc143-bat-'));
  const file = path.join(dir, 'server.bat');
  fs.writeFileSync(file, '@echo off\r\nexit /b 0\r\n');
  try {
    const r = await probe({ command: file, timeoutMs: 5000 });
    assert.deepEqual([r.ok, r.stage, r.reason], [false, 'start', `${file} is a batch file that only a shell can start`]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
