'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// The organisation's text rule: what a person reads carries no em dash (U+2014). Every line of
// code the launcher runs is held to it; comments, which no person running it reads, are not.
// PC-97: the source is read as JavaScript, character by character: strings, template literals
// (with their `${}` nesting) and regular expressions are code wherever they start, and a comment
// is a `//` or `/* */` met outside them, so a template line that starts with `//` is code and so
// is code after a block's `*/`. Known blind spots: a dash built at run time from anything but a
// `fromCharCode`/`fromCodePoint` call that names 0x2014, 8212, 8_212 or 0o20024 on the call's own
// line before any `;` (another spelling, such as 0x20_14 or a binary literal, or an argument on a
// later line, is not seen), and a `/` the scanner reads
// unlike JavaScript (after `)`, `]` or a name it reads a division, after a keyword such as
// `return` a regular expression; a division after `++` or `--` is read as a regular expression).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['bin', 'lib', 'plugin/passioncode/hooks'];
// The character itself, its escape in a JS or JSON string (zero-padded too), or a literal call
// that builds it.
const DASH = /\u2014|\\u2014|\\u\{0*2014\}|from(?:CharCode|CodePoint)\([^;]*\b(?:0x0*2014|8_?212|0o0*20024)\b/i;

function files(dir) {
  return fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return files(rel);
    return /\.((c|m)?js|json)$/.test(e.name) ? [rel] : [];
  });
}

// The lines of a JavaScript source with their comments removed: [line number, what is left],
// for every line where something is left. Strings, templates and regular expressions are kept.
function codeLines(text) {
  const src = text.replace(/\r\n?/g, '\n');
  const kept = src.split('\n').map(() => '');
  let line = 0;
  const keep = (c) => { if (c === '\n') line += 1; else kept[line] += c; };
  const skip = (c) => { if (c === '\n') line += 1; };
  const stack = []; // open template literals, each with the brace depth of its `${}`
  let i = 0;
  let prev = ''; // the last significant code character, to tell a regular expression from a division
  let word = ''; // the identifier or keyword that ends just before it, if any
  const KEYWORDS = /^(return|typeof|instanceof|in|of|new|delete|void|throw|case|do|else|yield|await|default|extends)$/;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i += 1; continue; }
    if (c === '/' && d === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) skip(src[i++]);
      i += 2;
      continue;
    }
    if (c === '"' || c === "'") {
      keep(c); i += 1;
      while (i < src.length && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') keep(src[i++]); if (i < src.length) keep(src[i++]); }
      if (i < src.length) keep(src[i++]);
      prev = c; continue;
    }
    if (c === '`' || (c === '}' && stack.length && stack[stack.length - 1] === 0)) {
      if (c === '}') stack.pop();
      keep(c); i += 1;
      while (i < src.length && src[i] !== '`' && !(src[i] === '$' && src[i + 1] === '{')) { if (src[i] === '\\') keep(src[i++]); if (i < src.length) keep(src[i++]); }
      if (src[i] === '`') { keep(src[i++]); prev = '`'; } else if (i < src.length) { keep(src[i++]); keep(src[i++]); stack.push(0); prev = '{'; }
      continue;
    }
    if (c === '/' && (!/[\w$)\]'"`]/.test(prev) || KEYWORDS.test(word))) {
      keep(c); i += 1;
      let cls = false;
      while (i < src.length && src[i] !== '\n' && (cls || src[i] !== '/')) {
        if (src[i] === '\\') keep(src[i++]);
        else if (src[i] === '[') cls = true;
        else if (src[i] === ']') cls = false;
        if (i < src.length) keep(src[i++]);
      }
      if (i < src.length && src[i] === '/') keep(src[i++]);
      prev = 'x'; word = ''; continue;
    }
    if (stack.length && c === '{') stack[stack.length - 1] += 1;
    if (stack.length && c === '}') stack[stack.length - 1] -= 1;
    if (!/\s/.test(c)) { word = /[\w$]/.test(c) ? (/[\w$]/.test(src[i - 1] || '') ? word : '') + c : ''; prev = c; }
    keep(c); i += 1;
  }
  return kept.map((l, n) => [n + 1, l]).filter(([, l]) => l.trim());
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
  assert.ok(DASH.test("const s = `a \\u{02014} b`;")); // PC-97: zero-padded
  assert.ok(DASH.test('String.fromCharCode(0x2014)') && DASH.test('String.fromCodePoint( 8212 )')); // PC-97
  assert.ok(DASH.test('String.fromCharCode(0X2014)') && DASH.test('String.fromCharCode(97, 0x2014)') && DASH.test('String.fromCharCode(f(1), 0x2014)'));
  assert.ok(DASH.test('String.fromCharCode(8_212)') && DASH.test('String.fromCodePoint(0o20024)'));
  assert.ok(DASH.test('String.fromCharCode(0x02014)') && DASH.test('String.fromCodePoint(0o020024)')); // zero-padded
  assert.ok(!DASH.test('a: b, c; d (e)') && !DASH.test('String.fromCharCode(0x2013)'));
});

test('PC-97: template lines that look like comments, and code after a block comment, are code', () => {
  const D = '\u2014';
  const sample = [
    '/* a */ const s = "b ' + D + '";', // 1: code after a block's */
    'const t = `', // 2
    '// not a comment ' + D, // 3: inside a template
    '/* nor this ' + D, // 4: inside a template, and it hides nothing after it
    '`;', // 5
    'const u = `x ${`y ${"z"} ' + D + '`} w`;', // 6: a template nested in ${}
    'const r = /[/*]/; const v = "c ' + D + '";', // 7: a regex holding /*
    'const w = a / b; const x = "d ' + D + '"; // e ' + D, // 8: a division, and a trailing comment
    '/* f ' + D, // 9: a block comment
    ' */ const y = "g ' + D + '";', // 10: code after it closes
    '// h ' + D, // 11
  ].join('\n');
  assert.deepEqual(codeLines(sample).filter(([, l]) => DASH.test(l)).map(([n]) => n), [1, 3, 4, 6, 7, 8, 10]);
  assert.doesNotMatch(codeLines(sample).find(([n]) => n === 8)[1], /e \u2014/, 'a trailing comment is a comment');
  // One line for each rule of the scanner: an escaped quote, an object literal inside `${}`, a class
  // holding `/`, a division after `)`, a lone CR, and a quote inside a regular expression.
  const more = [
    'const a = "x \\" // " + "' + D + '";', // 1: an escaped quote keeps the string open
    'const b = `${ { k: 1 }.k } ' + D + '`;', // 2: braces of an object inside ${}
    'const c = /[/]/; const d = "' + D + '";', // 3: a class holding /
    'const e = (x) / 2 + "//" + "' + D + '";', // 4: a division after )
    'const f = /["\']/; const g = "' + D + '";', // 5: quotes inside a regular expression
    'const z = /[/]//2 + "' + D + '";', // 6: a regular expression divided by 2, no comment
    'function f(s) {\n  const a = 1, b = a\n  return /[//]/.test(s) ? "' + D + '" : "";\n}', // 7-10: return after a line break
  ].join('\r');
  assert.deepEqual(codeLines(more).filter(([, l]) => DASH.test(l)).map(([n]) => n), [1, 2, 3, 4, 5, 6, 9]);
  // And what is a comment stays one: after a division by `(x)`, and after a template whose `${}`
  // holds an object and a string with a backtick.
  const quiet = [
    'const h = (x) / 2 + "a/b"; // ' + D, // a division, so `/b"` opens no regular expression
    'const k = `a ${ { k: 1 }.k + "`" } b`; // ' + D, // the object's } does not close the ${}
    'const re = /[/"]/; // a note ' + D, // a class holding / and a quote: the quote opens no string
  ].join('\n');
  assert.deepEqual(codeLines(quiet).filter(([, l]) => DASH.test(l)), []);
  // After a keyword a `/` starts a regular expression, even one that holds `/*`.
  const kw = 'function f(s) { return /a\\/*b/.test(s); }\nconst m = "y ' + D + '";\n// */\nconst q = typeof x / 2; const z = "w ' + D + '";\n';
  assert.deepEqual(codeLines(kw).filter(([, l]) => DASH.test(l)).map(([n]) => n), [2, 4]);
  // Every keyword that can precede a regular expression: a `//` in its class is no comment.
  for (const k of ['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await', 'default', 'extends']) {
    assert.deepEqual(codeLines(`x = ${k} /[//]/; const s = "${D}";`).filter(([, l]) => DASH.test(l)).map(([n]) => n), [1], k);
  }
});

test('PC-95: the guard reads template lines and strings as code', () => {
  const sample = '/**\n * a \u2014 b\n */\n// c \u2014 d\nconst s = `\n* item \u2014 one\n`;\nconst u = \'x // y \u2014 z\';\n';
  assert.deepEqual(codeLines(sample).filter(([, l]) => DASH.test(l)).map(([n]) => n), [6, 8]);
});

// PC-96: the documentation a person reads, held to the same rule outside code spans and fenced
// blocks (a quoted command or marker keeps its bytes). History is exempt: CHANGELOG entries,
// handoffs, task packets, ADRs and backlog rows; so are contributor-only AGENTS.md and
// docs/AGENT_SYNC.md (generated).
// PC-97: fences and code spans are read close to how CommonMark reads them (what the tests below
// pin, and no more): a ``` opener's info string holds
// no backtick, a tab-indented line opens no fence, a code span opens on a run of backticks that a
// backslash does not escape and closes on the next run of the same length, within its paragraph
// (so it may span lines, but not into a heading, a table row that starts with `|`, a block quote,
// a thematic break, a setext underline or a new list item; a JSON file pairs within a line). Known
// blind spots: a table row without a leading `|`, indented code blocks (a tab-indented ``` among them,
// whose backticks may pair as a span here), HTML blocks, link destinations, and an autolink or
// inline HTML holding a backtick (CommonMark binds those before spans) are read as prose,
// a fence inside a list item or a block quote opens only at the start of a line, and any other
// CommonMark rule these tests do not pin.
const DOCS = ['README.md', 'SECURITY.md', 'COMMERCIAL-LICENSE.md', 'docs/README.md', 'docs/reference', 'docs/ux', 'docs/brand',
  'plugin/passioncode/skills', 'test/evals'];

function docFiles(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.statSync(abs).isDirectory()) return [rel];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => (e.isDirectory() || /[.](md|json)$/.test(e.name) ? docFiles(path.join(rel, e.name)) : []));
}

// Code spans of one paragraph replaced by spaces, newlines kept, so its lines keep their numbers.
function stripSpans(par) {
  let out = '';
  let i = 0;
  while (i < par.length) {
    if (par[i] === '\\' && i + 1 < par.length) { out += par[i] + par[i + 1]; i += 2; continue; }
    if (par[i] !== '`') { out += par[i]; i += 1; continue; }
    let n = 0;
    while (par[i + n] === '`') n += 1;
    // The closer: the next run of exactly n backticks.
    let j = i + n;
    let close = -1;
    while (j < par.length) {
      if (par[j] !== '`') { j += 1; continue; }
      let m = 0;
      while (par[j + m] === '`') m += 1;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close < 0) { out += '`'.repeat(n); i += n; continue; }
    out += par.slice(i, close + n).replace(/[^\n]/g, ' ');
    i = close + n;
  }
  return out;
}

function proseLines(text, { json = false } = {}) {
  // A fence opens on ``` (an info string without a backtick) or ~~~, indented at most three spaces,
  // and closes only on a bare marker of the same character and at least its length (CommonMark);
  // a file that ends inside one hides nothing.
  const out = [];
  let fence = null;
  let held = [];
  let par = [];
  const flush = () => {
    if (!par.length) return;
    stripSpans(par.map(([, l]) => l).join('\n')).split('\n').forEach((l, k) => out.push([par[k][0], l]));
    par = [];
  };
  text.split(/\r?\n/).forEach((line, n) => {
    const open = /^ {0,3}(`{3,})[^`]*$|^ {0,3}(~{3,})/.exec(line);
    const bare = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(line);
    if (fence === null && open) { flush(); fence = open[1] || open[2]; held = []; return; }
    if (fence !== null && bare && bare[1][0] === fence[0] && bare[1].length >= fence.length) { fence = null; held = []; return; }
    if (fence !== null) { held.push([n + 1, line]); return; }
    if (!line.trim()) { flush(); return; }
    // A heading, a table row, a block quote and a list item each start a block of their own, and a
    // heading, a table row, a thematic break and a setext underline also end there: in the forms the
    // tests below pin, a code span does not run across them (the header names what is not pinned).
    // A JSON file is read line by line: its strings are not a paragraph.
    const own = json || /^ {0,3}#{1,6}(\s|$)|^\s*\||^ {0,3}([-*_])([ \t]*\2){2,}[ \t]*$|^ {0,3}(=+|-+)[ \t]*$/.test(line);
    if (own || /^\s*(>|[-*+]\s|\d+[.)]\s|#{1,6}(\s|$))/.test(line)) flush(); // nested ones too: a flush only splits
    par.push([n + 1, line]);
    if (own) flush();
  });
  flush();
  return out.concat(held);
}

// The character, its escape in a JSON string, or its HTML entity, which renders as the character.
const DOC_DASH = new RegExp(`${DASH.source}|&mdash;|&#0*8212;|&#x0*2014;`, 'i');
const docDashes = (text, opts) => proseLines(text, opts).filter(([, l]) => DOC_DASH.test(l)).map(([n]) => n);

test('PC-96: no em dash in the prose of the documentation a person reads', () => {
  const found = [];
  for (const file of DOCS.flatMap(docFiles)) {
    for (const n of docDashes(fs.readFileSync(path.join(ROOT, file), 'utf8'), { json: file.endsWith('.json') })) found.push(`${file}:${n}`);
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
  // Each wrong closer exposes a line: ~~~ inside ```, ``` inside ````, ```js inside ```, and a
  // toggle on any marker; the last fence never closes, so its line counts too.
  const sample = '```\n~~~\na \u2014\n```\n````\n```\nb \u2014\n````\nc \u2014\n```\n```js\nd \u2014\n```\ne \u2014\n~~~\nf \u2014\n';
  assert.deepEqual(docDashes(sample), [9, 14, 16]);
  assert.deepEqual(docDashes('```\na \u2014\n````\nb \u2014\n'), [4]); // a longer bare marker closes
});

test('PC-97: code spans and fences as CommonMark reads them', () => {
  const D = '\u2014';
  // A double-backtick span holds a single backtick; a span may run over two lines of a paragraph.
  assert.deepEqual(docDashes('a ``x ` ' + D + '`` b\nc ' + D + '\n'), [2]);
  assert.deepEqual(docDashes('a `x\n' + D + ' y` b\n\nc `d\n\n' + D + '` e\n'), [6]);
  // A backslash-escaped backtick opens nothing, so the dash after it is prose.
  assert.deepEqual(docDashes('a \\` ' + D + ' `b`\n'), [1]);
  // A ``` line whose info string holds a backtick is no fence.
  assert.deepEqual(docDashes('```a`b\n' + D + '\n```\n'), [2]);
  // A span ends at a block boundary: a heading, a list item, a table row or a block quote.
  for (const t of ['# a `b\nc ' + D + ' d `e`\n', '- a `b\n- c ' + D + ' d `e`\n', '* a `b\n* c ' + D + ' d `e`\n', '+ a `b\n+ c ' + D + ' d `e`\n',
    '1. a `b\n2. c ' + D + ' d `e`\n', '1) a `b\n2) c ' + D + ' d `e`\n', '| a | `b |\n| c ' + D + ' | `e` |\n', '> a `b\n\n> c ' + D + ' d `e`\n',
    'a `b\n> c ' + D + ' d `e`\n', 'a `b\n## c ' + D + ' `d`\n', 'a `b\n###### c ' + D + ' `d`\n', '- a\n  - b `x\n    - c ' + D + ' `y`\n']) {
    assert.deepEqual(docDashes(t), [t.split('\n').findIndex((l) => l.includes(D)) + 1], JSON.stringify(t));
  }
  // A thematic break and a setext underline end a paragraph; a JSON file pairs within a line.
  for (const brk of ['***', '---', '___', '* * *', '***\t', '_\t_\t_', '===', '===\t', '---\t']) {
    assert.deepEqual(docDashes('a `b\n' + brk + '\nc ' + D + ' `d`\n'), [3], JSON.stringify(brk));
  }
  // Four spaces before ``` open no fence (that is indented code): the dash after it is prose.
  assert.deepEqual(docDashes('    ```\n' + D + '\n```\nx\n```\n'), [2]);
  assert.deepEqual(docDashes('{\n "a": "the ` key",\n "b": "x ' + D + ' y",\n "c": "`z`"\n}\n', { json: true }), [3]);
  // A fence ends the paragraph before it: a backtick above it pairs with nothing below it.
  assert.deepEqual(docDashes('a `b\n```\nx\n```\nc ' + D + ' `d`\n'), [5]);
  // A span closes only on a run of exactly its length; a tab-indented ``` opens no fence.
  assert.deepEqual(docDashes('a ``b ``` c ' + D + '`` d\ne ' + D + '\n'), [2]);
  assert.deepEqual(docDashes('`a``` ' + D + ' `\n'), []); // one span: three backticks do not close a single one
  assert.deepEqual(docDashes('\t```\n' + D + '\n```\n'), [2]); // indented code, prose, then an unclosed fence
  // A run with no closer of its length is literal: the dash after it is prose.
  assert.deepEqual(docDashes('a `` b ' + D + ' ` c\n'), [1]);
});

test('PC-96: CRLF line endings read as LF (a Windows checkout)', () => {
  const sample = '```'+'\nc \u2014 x\n```\nprose `a \u2014 b` ok\nd \u2014\n';
  assert.deepEqual(docDashes(sample.replace(/\n/g, '\r\n')), docDashes(sample));
  assert.deepEqual(docDashes(sample), [5]);
  assert.deepEqual(codeLines('/* a \u2014\r\n */\r\nconst s = "b \u2014";\r\n').filter(([, l]) => DASH.test(l)).map(([n]) => n), [3]);
  const lf = '/* a \u2014\n */\nconst s = "b \u2014";\n';
  assert.deepEqual(codeLines(lf.replace(/\n/g, '\r\n')), codeLines(lf));
});
