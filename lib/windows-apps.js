'use strict';
/**
 * Where a PassionCode.ai app is installed on Windows and which version it is, read without
 * starting it (PC-86): the uninstall entry its installer wrote (electron-builder and Tauri both
 * write DisplayName and DisplayVersion; Tauri also InstallLocation), else the folder a per-user
 * installer uses (%LOCALAPPDATA%\Programs\<name> for electron-builder, %LOCALAPPDATA%\<name> for
 * Tauri) or a per-machine one under Program Files, with the program in it.
 */
const fs = require('fs');
const path = require('path');

const HIVES = [
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

/** `reg query <hive> /s` output → [{ key, DisplayName, DisplayVersion, InstallLocation, UninstallString }]. */
function parseUninstall(text) {
  const entries = [];
  let entry = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^HKEY_/.test(line)) { entry = { key: line.trim() }; entries.push(entry); continue; }
    const m = /^\s+(\S+)\s+REG_(?:SZ|EXPAND_SZ)\s+(.*)$/.exec(line);
    if (m && entry) entry[m[1]] = m[2].trim();
  }
  return entries.filter((e) => e.DisplayName);
}

/**
 * Every uninstall entry on this machine, and the hives `reg` could not read (a missing hive is
 * normal: HKLM's WOW6432Node exists only on 64-bit Windows), so a reader can say an app it did not
 * find may still be there.
 */
function readUninstallEntries(run) {
  const entries = [], unread = [];
  for (const hive of HIVES) {
    const r = run('reg', ['query', hive, '/s'], { timeout: 15000, maxBuffer: 32 * 1024 * 1024 });
    if (r.code === 0) entries.push(...parseUninstall(r.out));
    else if (!/unable to find/i.test(`${r.err || ''}${r.out || ''}`)) unread.push({ hive, why: (r.err || r.out || `exit ${r.code}`).trim().split(/\r?\n/)[0] });
  }
  return { entries, unread };
}

/** electron-builder names its entry "<name> <version>", Tauri "<name>"; "Fabric" never matches "Fabric Inbox". */
function names(entry, name) {
  return entry.DisplayName === name || (!!entry.DisplayVersion && entry.DisplayName === `${name} ${entry.DisplayVersion}`);
}

/** The install folder an entry names, or null: an MSI entry's `MsiExec.exe /X{...}` names none. */
function folderOf(entry) {
  if (entry.InstallLocation) return entry.InstallLocation.replace(/^"|"$/g, '').replace(/\\$/, '');
  const m = /^"([^"]+)"|^(\S+\.exe)/i.exec(entry.UninstallString || '');
  const exe = m && (m[1] || m[2]);
  if (!exe || !exe.includes('\\') || /(^|\\)msiexec\.exe$/i.test(exe)) return null;
  return exe.slice(0, exe.lastIndexOf('\\'));
}

function folders(name, { env, home }) {
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [path.join(local, 'Programs', name), path.join(local, name), env.ProgramFiles && path.join(env.ProgramFiles, name)].filter(Boolean);
}

function hasProgram(dir) { try { return fs.readdirSync(dir).some((n) => /\.exe$/i.test(n)); } catch (_) { return false; } }

/** { at, version, source: 'registry' | 'folder' } or null when the app is not installed. */
function findWindowsApp(product, { entries, env = process.env, home }) {
  const dir = folders(product.name, { env, home }).find(hasProgram);
  const hit = entries.find((e) => names(e, product.name));
  if (hit) return { at: folderOf(hit) || dir || null, version: hit.DisplayVersion || null, source: 'registry' };
  return dir ? { at: dir, version: null, source: 'folder' } : null;
}

module.exports = { parseUninstall, readUninstallEntries, findWindowsApp, HIVES };
