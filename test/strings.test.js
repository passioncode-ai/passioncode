'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// The string registry (docs/brand/strings.md) points every row at the line that prints it. Code moves
// those lines; this keeps each Location honest: the row's whole text, placeholders included, is the
// source that starts on the cited line (whitespace collapsed, so a template that wraps across lines,
// like the help, is read as it prints). A row whose words a longer row contains may not cite the longer row's line.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const collapse = (s) => s.replace(/\s+/g, ' ').trim();
// A row's literal words, each placeholder reduced to one marker, innermost first, so a placeholder
// that holds a template with placeholders of its own is reduced whole (PC-107).
const words = (s) => {
  for (let prev = null; prev !== s;) { prev = s; s = s.replace(/\$\{[^{}]*\}/g, '\u0000'); }
  return s;
};

test('every strings.md row points at the line that holds its text', () => {
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l));
  assert.ok(rows.length > 10, 'the registry has rows');
  const wrong = [];
  // The text must start on the cited line and may run on over the next lines (at most 20).
  const startsAt = (text, loc) => {
    const m = /^([\w./-]+):(\d+)$/.exec(loc);
    const lines = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split(/\r?\n/);
    const at = collapse(lines.slice(Number(m[2]) - 1, Number(m[2]) + 19).join('\n')).indexOf(text);
    return at >= 0 && at < collapse(lines[Number(m[2]) - 1] || '').length;
  };
  // The lines a row's text covers, from its cited line to the line where the text ends.
  const covers = (o) => {
    const m = /^([\w./-]+):(\d+)$/.exec(o.loc);
    const lines = fs.readFileSync(path.join(ROOT, m[1]), 'utf8').split(/\r?\n/);
    let end = Number(m[2]);
    while (end < Number(m[2]) + 19 && !collapse(lines.slice(Number(m[2]) - 1, end).join('\n')).includes(o.text)) end += 1;
    return { file: m[1], from: Number(m[2]), to: end };
  };
  const cited = rows.map((row) => {
    const cells = row.split(' | ');
    return { key: cells[0].slice(2), text: collapse(cells[1].replace(/\\\|/g, '|')), loc: cells[2] };
  });
  // A row that names a code file must name its line too: one without is wrong, never skipped.
  for (const r of cited) if (/^(lib|bin|plugin|scripts)\//.test(r.loc) && !/^([\w./-]+):(\d+)$/.test(r.loc)) wrong.push(`${r.key} at ${r.loc} (no line)`);
  cited.splice(0, cited.length, ...cited.filter((r) => /^([\w./-]+):(\d+)$/.test(r.loc)));
  for (const r of cited) {
    if (!startsAt(r.text, r.loc)) wrong.push(`${r.key} at ${r.loc}`);
    // A row whose words another row's words contain is told apart by the rest: when the longer row's
    // text is the one at this line, the shorter row points at the wrong line. A row for a piece of a
    // placeholder (the "(early preview)" label inside the install question) is not such a row.
    // PC-107: on any line the longer row's text covers, not only the one it starts on.
    else if (cited.some((o) => {
      if (o.text === r.text || !words(o.text).includes(words(r.text))) return false;
      if (startsAt(o.text, r.loc)) return true; // the longer text starts on this very line
      if (!startsAt(o.text, o.loc)) return false;
      const span = covers(o);
      const [file, line] = r.loc.split(':');
      return file === span.file && Number(line) >= span.from && Number(line) <= span.to;
    })) wrong.push(`${r.key} at ${r.loc} (a longer row's text is there)`);
  }
  const checked = cited.length;
  assert.ok(checked > 10, 'rows with a file:line location were checked');
  assert.deepEqual(wrong, []);
});

// PC-178 round 15: every literal lib/memory.js prints (thrown, a failure, a receipt refusal, a row's detail or fix) has a
// strings.md row covering its line, so an unregistered memory string fails here instead of in a reading.
test('every printed string in lib/memory.js has a strings.md row', () => {
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l)).map((row) => {
      const cells = row.split(' | ');
      return { text: collapse(cells[1].replace(/\\\|/g, '|')), loc: cells[2] };
    }).filter((r) => r.loc.startsWith('lib/memory.js:'));
  const lines = fs.readFileSync(path.join(ROOT, 'lib/memory.js'), 'utf8').split(/\r?\n/);
  const covered = new Set();
  for (const r of rows) {
    const from = Number(r.loc.split(':')[1]);
    let end = from;
    while (end < from + 19 && !collapse(lines.slice(from - 1, end).join('\n')).includes(r.text)) end += 1;
    for (let n = from; n <= end; n++) covered.add(n);
  }
  const site = /(new Error\(|\bfail\(|\brefuse\(|\bdetail: |\bfix: )\s*[`'"]/;
  const missing = lines.map((l, i) => (site.test(l) && !/^\s*(\/\/|\*)/.test(l) && !covered.has(i + 1) ? `lib/memory.js:${i + 1}: ${l.trim().slice(0, 90)}` : null)).filter(Boolean);
  assert.deepEqual(missing, []);
});
