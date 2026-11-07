'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-151: an app counts as in use only for a process of this user that runs from this very bundle.
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const R = require('../lib/releases');

test('PC-151: the pattern matches the bundle at the start of the command or after a space, never as the end of a longer path', () => {
  const re = new RegExp(R.runningPattern('/Applications/Fabric Switchboard.app'));
  assert.ok(re.test('/Applications/Fabric Switchboard.app/Contents/MacOS/Fabric Switchboard'));
  assert.ok(re.test('/usr/bin/env /Applications/Fabric Switchboard.app/Contents/MacOS/switchboard mcp'));
  assert.ok(!re.test('/Users/other/Applications/Fabric Switchboard.app/Contents/MacOS/Fabric Switchboard'), "another user's copy");
  assert.ok(!re.test('/Applications/Fabric SwitchboardXapp/Contents/MacOS/x'), 'the dot is literal');
  assert.ok(!re.test('/Applications/Fabric Switchboard.app.old/Contents/MacOS/x'));
});

test('PC-151: every character a regular expression reads specially is escaped, so a bundle named like a pattern matches only itself', () => {
  const special = '/Applications/A (1) [x]{2}+?*^$|\\.app';
  const re = new RegExp(R.runningPattern(special));
  assert.ok(re.test(`${special}/Contents/MacOS/A`), 'its own command line');
  for (const ch of '()[]{}+?*^$|\\.') {
    const other = special.split(ch).join('Z');
    assert.ok(!re.test(`${other}/Contents/MacOS/A`), `with ${ch} replaced it is another bundle`);
  }
});

const pgrep = spawnSync('pgrep', ['-x', 'no-such-process-pc151'], { encoding: 'utf8' });
test('PC-151: with the real pgrep, a copy running under another path is not this bundle in use', { skip: (process.platform === 'win32' || pgrep.error) && 'needs pgrep' }, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc151-'));
  const name = `PC151 ${process.pid}.app`;
  const nested = path.join(base, 'Users', 'other', 'Applications', name);
  fs.mkdirSync(path.join(nested, 'Contents', 'MacOS'), { recursive: true });
  const bin = path.join(nested, 'Contents', 'MacOS', 'sleeper');
  fs.writeFileSync(bin, '#!/bin/sh\nsleep 30\n', { mode: 0o755 }); // runs as `/bin/sh <bin>`: the path after a space
  const child = spawn(bin, [], { stdio: 'ignore', detached: true });
  t.after(() => { try { process.kill(-child.pid); } catch (_) { /* gone */ } fs.rmSync(base, { recursive: true, force: true }); });
  const until = Date.now() + 10000;
  while (!R.isRunning(nested) && Date.now() < until) await new Promise((r) => setTimeout(r, 100));
  assert.equal(R.isRunning(nested), true, 'its own bundle is in use');
  assert.equal(R.isRunning(path.join(base, 'Applications', name)), false, 'a bundle whose path is a suffix of the running one is not');
  assert.equal(R.isRunning(`/Applications/${name}`), false);
});

test('PC-151: pgrep is asked only about this user\'s processes', { skip: (process.platform === 'win32' || typeof process.getuid !== 'function') && 'POSIX users' }, () => {
  const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'pc151-bin-'));
  const log = path.join(bin, 'args.log');
  fs.writeFileSync(path.join(bin, 'pgrep'), `#!/bin/sh\nprintf '%s\\n' "$@" > '${log}'\nexit 1\n`, { mode: 0o755 });
  // PC-169: macOS checks a new executable on its first start, which under heavy load outlasts isRunning's 5 s timeout
  // (a timeout reads as in use); one start beforehand keeps the check out of the call under test.
  require('node:child_process').spawnSync(path.join(bin, 'pgrep'), ['--warm'], { timeout: 60000 });
  const saved = process.env.PATH;
  process.env.PATH = `${bin}${path.delimiter}${saved}`;
  try {
    assert.equal(R.isRunning('/Applications/X.app'), false);
  } finally { process.env.PATH = saved; }
  const args = fs.readFileSync(log, 'utf8').trim().split('\n');
  assert.deepEqual(args.slice(0, 3), ['-U', String(process.getuid()), '-f']);
  fs.rmSync(bin, { recursive: true, force: true });
});
