'use strict';
// The string registry (docs/brand/strings.md) points every row at the line that prints it. Code moves
// those lines; this keeps each Location honest: the row's whole text, placeholders included, is the
// source that starts on the cited line (whitespace collapsed, so a template that wraps across lines,
// like the help, is read as it prints). Two rows that share a phrase are told apart by the rest of it.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();

test('every strings.md row points at the line that holds its text', () => {
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l));
  assert.ok(rows.length > 10, 'the registry has rows');
  const wrong = [];
  let checked = 0;
  for (const row of rows) {
    const cells = row.split(' | ');
    const [key, text, loc] = [cells[0].slice(2), collapse(cells[1].replace(/\\\|/g, '|')), cells[2]];
    const m = /^([\w./-]+):(\d+)$/.exec(loc);
    if (!m) continue;
    const lines = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split(/\r?\n/);
    const first = collapse(lines[Number(m[2]) - 1] || '');
    // The text must start on the cited line and may run on over the next lines (at most 20).
    const at = collapse(lines.slice(Number(m[2]) - 1, Number(m[2]) + 19).join('\n')).indexOf(text);
    if (at < 0 || at >= first.length) wrong.push(`${key} at ${loc}`);
    checked += 1;
  }
  assert.ok(checked > 10, 'rows with a file:line location were checked');
  assert.deepEqual(wrong, []);
});
