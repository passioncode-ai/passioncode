'use strict';
/**
 * Where a PassionCode.ai app is installed on Windows and which version it is, read without
 * starting it (PC-85): the uninstall entry its installer wrote (electron-builder and Tauri both
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

/** Every uninstall entry on this machine; a hive `reg` cannot read (or no `reg`) adds none. */
function readUninstallEntries(run) {
  return HIVES.flatMap((hive) => {
    const r = run('reg', ['query', hive, '/s'], { timeout: 15000 });
    return r.code === 0 ? parseUninstall(r.out) : [];
  });
}

/** electron-builder names its entry "<name> <version>", Tauri "<name>"; "Fabric" never matches "Fabric Inbox". */
function names(entry, name) {
  return entry.DisplayName === name || (!!entry.DisplayVersion && entry.DisplayName === `${name} ${entry.DisplayVersion}`);
}

function folderOf(entry) {
  if (entry.InstallLocation) return entry.InstallLocation.replace(/^"|"$/g, '').replace(/\\$/, '');
  const m = /^"([^"]+)"|^(\S+\.exe)/i.exec(entry.UninstallString || '');
  const exe = m && (m[1] || m[2]);
  return exe ? exe.slice(0, exe.lastIndexOf('\\')) : null;
}

function folders(name, { env, home }) {
  const local = env.LOCALAPPDATA || path.join(home, 'AppData', 'Local');
  return [path.join(local, 'Programs', name), path.join(local, name), env.ProgramFiles && path.join(env.ProgramFiles, name)].filter(Boolean);
}

function hasProgram(dir) { try { return fs.readdirSync(dir).some((n) => /\.exe$/i.test(n)); } catch (_) { return false; } }

/** { at, version, source: 'registry' | 'folder' } or null when the app is not installed. */
function findWindowsApp(product, { entries, env = process.env, home }) {
  const hit = entries.find((e) => names(e, product.name));
  if (hit) return { at: folderOf(hit), version: hit.DisplayVersion || null, source: 'registry' };
  const dir = folders(product.name, { env, home }).find(hasProgram);
  return dir ? { at: dir, version: null, source: 'folder' } : null;
}

module.exports = { parseUninstall, readUninstallEntries, findWindowsApp, HIVES };
