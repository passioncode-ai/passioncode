'use strict';
// The organisation's text rule: what a person reads carries no em dash (U+2014). Every line of
// code the launcher runs is held to it; comments, which no person running it reads, are not.
// A comment is a whole line starting with `//`, or a line inside a `/* */` block opened at the
// start of a line; a trailing comment after code is checked like code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['bin', 'lib', 'plugin/passioncode/hooks'];

function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.(c|m)?js$/.test(e.name) ? [rel] : [];
  });
}

function codeLines(text) {
  const out = [];
  let block = false;
  text.split('\n').forEach((line, n) => {
    const t = line.trim();
    if (block) { if (t.includes('*/')) block = false; return; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) block = true; return; }
    if (t.startsWith('//')) return;
    out.push([n + 1, line]);
  });
  return out;
}

test('PC-95: no em dash in a string the launcher prints', () => {
  const found = [];
  for (const file of DIRS.flatMap(files)) {
    for (const [n, line] of codeLines(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (line.includes('—')) found.push(`${file}:${n}`);
    }
  }
  assert.deepEqual(found, []);
});

test('PC-95: the guard reads template lines and trailing comments as code', () => {
  const sample = "/**\n * a — b\n */\n// c — d\nconst s = `\n* item — one\n`;\nconst u = 'x // y — z';\n";
  assert.deepEqual(codeLines(sample).filter(([, l]) => l.includes('—')).map(([n]) => n), [6, 8]);
});
