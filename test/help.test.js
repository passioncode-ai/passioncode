'use strict';
// PC-98: the help lists, on each command's own line, every flag in the argument parser's lists for
// that command (plus --with, --without and --train, which it reads by pattern, and the flags
// config's argument filter sets aside), and names the command aliases, so no option is only
// discoverable elsewhere.
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const BIN = path.resolve(__dirname, '..', 'bin', 'passioncode.js');
const list = (text) => [...text.matchAll(/[`'"](--?[A-Za-z0-9][\w-]*)[`'"]/g)].map((m) => m[1]);

function accepted(source) {
  const setup = /cmd\s*===\s*['"]doctor['"]\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/.exec(source);
  const options = /const options = (?:Object\.freeze\()?\{([\s\S]*?)\}\)?;/.exec(source);
  assert.ok(setup && options, 'the parser lists its flags where this test reads them');
  // Flags setup reads by pattern join its list, in any of the forms `/^--name(?:=`, `/^--name=` and
  // `/^--name$/`, with one name or an alternation (`/^--(with|without)(?:=/`).
  // Only parseSetupArgs reads setup's flags (PC-107): a pattern flag of another command is not setup's.
  const setupParser = /function parseSetupArgs\([\s\S]*?\n\}\n/.exec(source);
  assert.ok(setupParser, 'the setup parser is where this test reads it');
  const patterns = [...setupParser[0].matchAll(/\/\^--(?:\(([a-z|]+)\)|([a-z-]+))(?:\(\?:=|=|\$\/)/g)].flatMap((m) => (m[1] || m[2]).split('|').map((f) => `--${f}`));
  assert.ok(patterns.length >= 3, 'the parser reads --with, --without and --train by pattern');
  const byCmd = { doctor: list(setup[1]), setup: [...list(setup[2]), ...patterns] };
  for (const [, cmd, flags] of options[1].matchAll(/['"]?([\w-]+)['"]?:\s*\[([^\]]*)\]/g)) byCmd[cmd] = list(flags);
  // config takes `set <key> <value>` plus the flags its argument filter sets aside.
  const config = /const configArgs = rest\.filter\(\(arg\) => ([^;]*)\);/.exec(source);
  assert.ok(config, 'the parser sets the flags of config aside where this test reads them');
  byCmd.config = list(config[1]);
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
  // Every alias the dispatcher routes (`if (cmd === 'a' || cmd === 'b' ...)`, each name after the
  // first; doctor shares setup's branch but is a command) is named in the help's prose.
  const source = fs.readFileSync(BIN, 'utf8');
  const aliases = [...source.matchAll(/if \((cmd === '\w+'(?: \|\| cmd === '\w+')+)\)/g)]
    .flatMap((m) => [...m[1].matchAll(/'(\w+)'/g)].map((n) => n[1]).slice(1)).filter((a) => a !== 'doctor');
  assert.deepEqual(aliases.sort(), ['install', 'onboard']);
  for (const alias of aliases) assert.match(help, new RegExp(`\\b${alias} is another name|, ${alias} for`));
});
