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

// PC-110: a function's source up to the brace that closes it, at any indentation. Braces inside
// strings, templates, regular expressions and comments do not count.
function functionBody(source, name) {
  const start = source.search(new RegExp(`function ${name}\\(`));
  if (start < 0) return null;
  let depth = 0;
  let prev = '';
  for (let i = source.indexOf('{', source.indexOf(')', start)); i < source.length; i++) {
    const c = source[i];
    if (c === "'" || c === '"' || c === '`') {
      for (i++; i < source.length && source[i] !== c; i++) if (source[i] === '\\') i++;
    } else if (c === '/' && (source[i + 1] === '/' || source[i + 1] === '*')) { // a comment leaves prev as it was
      i = source[i + 1] === '/' ? source.indexOf('\n', i) : source.indexOf('*/', i + 2) + 1;
      if (i <= 0) return null;
      continue;
    } else if (c === '/' && /[(=,:!&|?;{}[]/.test(prev)) {
      for (let cls = false, j = i + 1; j < source.length; j++) {
        if (source[j] === '\\') j++;
        else if (source[j] === '[') cls = true;
        else if (source[j] === ']') cls = false;
        else if (source[j] === '/' && !cls) { i = j; break; }
      }
    } else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return source.slice(start, i + 1);
    if (!/\s/.test(c)) prev = c;
  }
  return null;
}

function accepted(source) {
  const setup = /cmd\s*===\s*['"]doctor['"]\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/.exec(source);
  const options = /const options = (?:Object\.freeze\()?\{([\s\S]*?)\}\)?;/.exec(source);
  assert.ok(setup && options, 'the parser lists its flags where this test reads them');
  // Flags setup reads by pattern join its list, in any of the forms `/^--name(?:=`, `/^--name=` and
  // `/^--name$/`, with one name or an alternation (`/^--(with|without)(?:=/`).
  // Only parseSetupArgs reads setup's flags (PC-107): a pattern flag of another command is not setup's.
  const setupParser = functionBody(source, 'parseSetupArgs');
  assert.ok(setupParser, 'the setup parser is where this test reads it');
  const patterns = [...setupParser.matchAll(/\/\^--(?:\(([a-z|]+)\)|([a-z-]+))(?:\(\?:=|=|\$\/)/g)].flatMap((m) => (m[1] || m[2]).split('|').map((f) => `--${f}`));
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

test('PC-110: the parser slice ends at its own closing brace, at any indentation', () => {
  const src = [
    'if (x) {',
    '  function parseSetupArgs(cmd, rest) {',
    "    const a = '}'; const b = \"{\"; const c = `}`; // a } in a comment, and it's",
    '    /* { */',
    "    const r = /^--(a|b)(?:=)?\\}[}/]\\{$/.exec(rest[0]);",
    // A regular expression after each character that can stand before one, and after a comment line.
    "    f(/\\{/, /\\{/); x = a ? /\\{/ : /\\{/; z = !/\\{/ || /\\{/ && /\\{/ && [/\\{/]; { /\\{/ } /\\{/.test(y);",
    '    // a comment, then a regular expression',
    "    /\\{/.test(rest[1]);",
    '    if (r) { return { r }; }',
    '  }',
    '}',
    'function after() {}',
  ].join('\n');
  const body = functionBody(src, 'parseSetupArgs');
  assert.ok(body && body.startsWith('function parseSetupArgs(') && body.endsWith('return { r }; }\n  }'), body);
  assert.equal(functionBody(src, 'missing'), null);
  assert.equal(functionBody('function f() { // never closed', 'f'), null);
});
