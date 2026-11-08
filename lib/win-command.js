'use strict';
/**
 * PC-143: how a command named by an agent's configuration, or by the person, is started without a shell. Windows starts
 * no file by its `#!` line and, since Node 18.20.2 and 20.12.2, no `.cmd` or `.bat` file without a shell, so a command
 * installed through npm (`claude.cmd`, an MCP server's `.cmd` shim) read as missing there. A name is looked up on
 * `PATH` with `PATHEXT` as the shell does; an `.exe` or `.com` found runs as itself, and an npm `.cmd` shim runs its
 * JavaScript target through this Node. Any other batch file is refused with a reason, never handed to `cmd.exe`, whose
 * quoting cannot carry every argument safely. With `scripts` a JavaScript file runs through this Node on every system,
 * so a stand-in needs no executable bit; without it, macOS and Linux start the command exactly as named.
 */
const fs = require('fs');
const path = require('path');

// The target an npm cmd-shim runs: `"%dp0%\node_modules\<package>\cli.js"` (npm's cmd-shim, every version since npm 7).
const SHIM_TARGET = /"%~?dp0%?\\([^"%]+\.[cm]?js)"/i;
const JS = /\.[cm]?js$/i;

/**
 * Resolves `command` and `args` into what `spawn` can start without a shell: `{ command, args }`, or
 * `{ command, args, refused }` with a reason when only a shell could start it. `scripts` (default true) runs a
 * JavaScript file through this Node on every system; on Windows it always does. `exists` and `read` are overridable
 * for tests; `read` returns the file's text or throws.
 */
function resolveCommand(command, args = [], {
  platform = process.platform, env = process.env, execPath = process.execPath, scripts = true,
  exists = (f) => { try { return fs.statSync(f).isFile(); } catch { return false; } },
  read = (f) => fs.readFileSync(f, 'utf8'),
} = {}) {
  if (JS.test(command) && (scripts || platform === 'win32')) return { command: execPath, args: [command, ...args] };
  if (platform !== 'win32') return { command, args };
  const win = path.win32;
  const exts = (env.PATHEXT || env.Pathext || '.COM;.EXE;.BAT;.CMD').split(';').map((e) => e.trim().toLowerCase()).filter(Boolean);
  const named = exts.includes(win.extname(command).toLowerCase());
  const names = named ? [command] : exts.map((e) => command + e);
  // A name with a folder in it is that file; a bare name is looked up on PATH, as `spawn` does for an `.exe`.
  const dirs = /[\\/:]/.test(command) ? [''] : (env.PATH || env.Path || '').split(';').filter(Boolean);
  let found = null;
  for (const dir of dirs) {
    found = names.map((n) => (dir ? win.join(dir, n) : n)).find((f) => exists(f)) || null;
    if (found) break;
  }
  if (!found) return { command, args };
  const ext = win.extname(found).toLowerCase();
  if (ext !== '.cmd' && ext !== '.bat') return { command: found, args };
  let text = '';
  try { text = read(found); } catch { /* an unreadable shim is refused below */ }
  const target = SHIM_TARGET.exec(text);
  if (target) return { command: execPath, args: [win.join(win.dirname(found), target[1]), ...args] };
  return { command: found, args, refused: `${found} is a batch file that only a shell can start` };
}

module.exports = { resolveCommand };
