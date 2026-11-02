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

// PC-96: the documentation a person reads, held to the same rule outside code spans and fenced
// blocks (a quoted command or marker keeps its bytes). History is exempt: CHANGELOG entries,
// handoffs, task packets, ADRs and backlog rows; so are contributor-only AGENTS.md and
// docs/AGENT_SYNC.md (generated).
const DOCS = ['README.md', 'SECURITY.md', 'COMMERCIAL-LICENSE.md', 'docs/README.md', 'docs/reference', 'docs/ux', 'docs/brand',
  'plugin/passioncode/skills', 'test/evals'];

function docFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() || /[.](md|json)$/.test(e.name) ? docFiles(path.join(rel, e.name)) : []));
}

function proseLines(text) {
  const out = [];
  let fence = false;
  text.split('\n').forEach((line, n) => {
    if (/^[ \t]*(```|~~~)/.test(line)) { fence = !fence; return; }
    if (!fence) out.push([n + 1, line.replace(/`[^`]*`/g, '')]);
  });
  return out;
}

test('PC-96: no em dash in the prose of the documentation a person reads', () => {
  const found = [];
  for (const file of DOCS.flatMap(docFiles)) {
    for (const [n, line] of proseLines(fs.readFileSync(path.join(ROOT, file), 'utf8'))) {
      if (line.includes('\u2014')) found.push(`${file}:${n}`);
    }
  }
  assert.deepEqual(found, []);
});

test('PC-96: code spans and fenced blocks keep their bytes', () => {
  const sample = 'a `x \u2014 y` b\n```\nc \u2014 d\n```\ne \u2014 f\n';
  assert.deepEqual(proseLines(sample).filter(([, l]) => l.includes('\u2014')).map(([n]) => n), [5]);
});
