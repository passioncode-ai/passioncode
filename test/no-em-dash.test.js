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
  // A fence opens on ``` or ~~~ and closes only on a bare marker of the same character and at
  // least its length (CommonMark); a file that ends inside one hides nothing.
  const out = [];
  let fence = null;
  let held = [];
  text.split('\n').forEach((line, n) => {
    const open = /^[ \t]{0,3}(`{3,}|~{3,})/.exec(line);
    const bare = /^[ \t]{0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
    if (fence === null && open) { fence = open[1]; held = []; return; }
    if (fence !== null && bare && bare[1][0] === fence[0] && bare[1].length >= fence.length) { fence = null; held = []; return; }
    if (fence === null) out.push([n + 1, line.replace(/`[^`]*`/g, '')]);
    else held.push([n + 1, line]);
  });
  return out.concat(held);
}

// The character, its escape in a JSON string, or its HTML entity, which renders as the character.
const DOC_DASH = new RegExp(`${DASH.source}|&mdash;|&#0*8212;|&#x0*2014;`, 'i');
const docDashes = (text) => proseLines(text).filter(([, l]) => DOC_DASH.test(l)).map(([n]) => n);

test('PC-96: no em dash in the prose of the documentation a person reads', () => {
  const found = [];
  for (const file of DOCS.flatMap(docFiles)) {
    for (const n of docDashes(fs.readFileSync(path.join(ROOT, file), 'utf8'))) found.push(`${file}:${n}`);
  }
  assert.deepEqual(found, []);
});

test('PC-96: code spans and fenced blocks keep their bytes', () => {
  assert.deepEqual(docDashes('a `x \u2014 y` b\n```\nc \u2014 d\n```\ne \u2014 f\n'), [5]);
});

test('PC-96: an escape or an entity in prose counts', () => {
  assert.deepEqual(docDashes('{"query": "a \\u2014 b"}\nx &mdash; y\nz &#8212; w\nv &#x2014; u\nplain\n'), [1, 2, 3, 4]);
});

test('PC-96: a fence closes only on its own bare marker, and an unclosed one hides nothing', () => {
  // ~~~ inside a ``` fence and ```js inside it do not close it; the bare ``` does.
  assert.deepEqual(docDashes('```\na \u2014\n~~~\n```js\nb \u2014\n```\nc \u2014\n~~~\nd \u2014\n'), [7, 9]);
});
