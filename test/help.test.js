'use strict';
// PC-98: the help lists, on each command's own line, every flag in the argument parser's lists for
// that command (plus --with, --without and --train, which it reads by pattern, and config's
// --json), and names the command aliases, so no option is only discoverable elsewhere.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const BIN = path.resolve(__dirname, '..', 'bin', 'passioncode.js');
const list = (text) => [...text.matchAll(/['"](--?[a-z][a-z-]*)['"]/g)].map((m) => m[1]);

function accepted(source) {
  const setup = /cmd\s*===\s*['"]doctor['"]\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/.exec(source);
  const options = /const options = (?:Object\.freeze\()?\{([\s\S]*?)\}\)?;/.exec(source);
  assert.ok(setup && options, 'the parser lists its flags where this test reads them');
  const byCmd = { doctor: list(setup[1]), setup: [...list(setup[2]), '--with', '--without', '--train'] };
  for (const [, cmd, flags] of options[1].matchAll(/['"]?([\w-]+)['"]?:\s*\[([^\]]*)\]/g)) byCmd[cmd] = list(flags);
  byCmd.config = ['--json'];
  delete byCmd.install; // an alias of update, named in the help's prose
  delete byCmd.help;
  for (const k of ['--help', '-h']) delete byCmd[k];
  assert.deepEqual(Object.keys(byCmd).sort(), ['config', 'doctor', 'restore', 'setup', 'status', 'uninstall', 'update']);
  for (const [cmd, flags] of Object.entries(byCmd)) assert.ok(flags.length, `the parser lists flags for ${cmd}`);
  return byCmd;
}

test('PC-98: each command line of the help names every flag the parser accepts for it', () => {
  const help = spawnSync(process.execPath, [BIN, 'help'], { encoding: 'utf8' }).stdout;
  const missing = [];
  for (const [cmd, flags] of Object.entries(accepted(fs.readFileSync(BIN, 'utf8')))) {
    const line = help.split('\n').find((l) => l.includes(`@latest ${cmd} `));
    assert.ok(line, `the help has a line for ${cmd}`);
    for (const f of flags) if (!new RegExp(`[\\[|]${f}[\\]| ]`).test(line)) missing.push(`${cmd} ${f}`);
  }
  assert.deepEqual(missing, []);
  for (const alias of ['onboard', 'install']) assert.match(help, new RegExp(`\\b${alias} is another name|, ${alias} for`));
});
