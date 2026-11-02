'use strict';
// The organisation's text rule: what a person reads carries no em dash (U+2014). Every line of
// code the launcher runs is held to it; comments, which no person running it reads, are not.
// A comment is a whole line starting with `//`, or a line inside a `/* */` block opened at the
// start of a line; a trailing comment after code is checked like code. Known blind spots: a
// template-literal line that itself starts with `//` or `/*`, and code after a block's `*/`.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['bin', 'lib', 'plugin/passioncode/hooks'];
// The character itself, or its escape in a JS or JSON string.
const DASH = /\u2014|\\u2014|\\u\{2014\}/;

function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.((c|m)?js|json)$/.test(e.name) ? [rel] : [];
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
      if (DASH.test(line)) found.push(`${file}:${n}`);
    }
  }
  assert.deepEqual(found, []);
});

test('PC-95: the guard catches the character and its escapes', () => {
  assert.ok(DASH.test('a \u2014 b'));
  assert.ok(DASH.test("const s = 'a \\u2014 b';"));
  assert.ok(DASH.test("const s = `a \\u{2014} b`;"));
  assert.ok(!DASH.test('a: b, c; d (e)'));
});

test('PC-95: the guard reads template lines and trailing comments as code', () => {
  const sample = '/**\n * a \u2014 b\n */\n// c \u2014 d\nconst s = `\n* item \u2014 one\n`;\nconst u = \'x // y \u2014 z\';\n';
  assert.deepEqual(codeLines(sample).filter(([, l]) => DASH.test(l)).map(([n]) => n), [6, 8]);
});
