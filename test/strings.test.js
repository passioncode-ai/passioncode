'use strict';
// The string registry (docs/brand/strings.md) points every row at the line that prints it. Code moves
// those lines; this keeps each Location honest: the cited line holds at least one literal run of the
// row's text between placeholders (six to 40 characters; a row of placeholders only is skipped).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');

test('every strings.md row points at the line that holds its text', () => {
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l));
  assert.ok(rows.length > 10, 'the registry has rows');
  const wrong = [];
  for (const row of rows) {
    const cells = row.split(' | ');
    const [key, text, loc] = [cells[0].slice(2), cells[1].replace(/\\\|/g, '|'), cells[2]];
    const m = /^([\w./-]+):(\d+)$/.exec(loc);
    if (!m) continue;
    const line = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split(/\r?\n/)[Number(m[2]) - 1] || '';
    const pieces = text.split(/\$\{[^}]*\}/).map((p) => p.trim().slice(0, 40)).filter((p) => p.length >= 6);
    if (pieces.length && !pieces.some((p) => line.includes(p))) wrong.push(`${key} at ${loc}: none of ${JSON.stringify(pieces)}`);
  }
  assert.deepEqual(wrong, []);
});
