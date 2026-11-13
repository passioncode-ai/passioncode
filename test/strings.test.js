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

// PC-178 round 15, widened in round 16: every literal lib/memory.js prints has a strings.md row covering its line, so an
// unregistered memory string fails here instead of in a reading. A printed literal is one thrown, passed to fail(),
// refuse() or lefts.push(), returned, set as a row's detail or fix, a ternary arm on its own line or after `? ` anywhere on a
// line (round 17), or a constant (or arrow constant) whose value is a string or template. Not covered: a `detail`/`fix` shorthand property (it names a variable).
const SITE = /(new Error\(|\bfail\(|\brefuse\(|\blefts\.push\(|\breturn |\bdetail: |\bfix: )\s*\(?[`'"]|^\s*[?:] [`'"]|\? [`'"]|^\s*const \w+ = (?:\([^)]*\) => |\w+ => )?\(?[`'"]/;
// Literals that are not printed text: a page, a scratch folder's prefix, a file name, a TOML header or key, a command's
// name, a state code, an empty string, a requirement built for uv, the shell quoting helper, a command's .exe name, a
// version's major.minor.
const NOT_TEXT = /'https:\/\/|passioncode-hook-|'utf8'|'\.wiki'|\[tool\]|'tool', '|'wiki-session-recap\.sh'|'wiki-stop-capture\.sh'|'obsidian-wiki'\b(?! is)|return '';|return 'uv';|return 'unknown';|const req = |const q = |\.exe`|\? 'ahead'|\? 'unknown' : 'equal'|\? 'fail' : |requirement: |requirement = `|with\.push\(`|`\$\{m\[1\]\}\.\$\{m\[2\]\}`|'profiles-unreadable'|const PY_SPACE = |const tail = /;
function unregistered(lines, rows) {
  const covered = new Set();
  for (const r of rows) {
    const from = Number(r.loc.split(':')[1]);
    let end = from;
    while (end < from + 19 && !collapse(lines.slice(from - 1, end).join('\n')).includes(r.text)) end += 1;
    for (let n = from; n <= end; n++) covered.add(n);
  }
  return lines.map((l, i) => (SITE.test(l) && !NOT_TEXT.test(l) && !/^\s*(\/\/|\*)/.test(l) && !covered.has(i + 1) ? `lib/memory.js:${i + 1}: ${l.trim().slice(0, 90)}` : null)).filter(Boolean);
}
test('every printed string in lib/memory.js has a strings.md row (thrown, failed, refused, pushed, returned, a row\'s detail or fix, a ternary arm, a string constant)', () => {
  // A planted probe: the check reports an unregistered literal of each kind.
  const probe = ['throw new Error(`probe one`);', '  lefts.push(`probe two`);', '  return `probe three`;', "    : 'probe four'", "const PROBE = 'probe five';", '  add({ fix: `probe six` });', "  : form === 'x' ? `probe seven`"];
  assert.equal(unregistered(probe, []).length, probe.length);
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l)).map((row) => {
      const cells = row.split(' | ');
      return { text: collapse(cells[1].replace(/\\\|/g, '|')), loc: cells[2] };
    }).filter((r) => r.loc.startsWith('lib/memory.js:'));
  assert.deepEqual(unregistered(fs.readFileSync(path.join(ROOT, 'lib/memory.js'), 'utf8').split(/\r?\n/), rows), []);
});

// PC-178 round 16: a doc that quotes the step to open the vault, or the refresh step, quotes what the launcher prints
// (the registered text, placeholders shown as <dir>), so the quotes stop drifting from the code.
test('the docs quote the vault step and the refresh step as they print', () => {
  const rows = Object.fromEntries(fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l)).map((row) => { const c = row.split(' | '); return [c[0].slice(2), c[1].replace(/\\\|/g, '|')]; }));
  const vault = rows['setup.memory-open-vault'].replace('${route(v)}', rows['setup.memory-open-route.mac']).replace(/\$\{v\}/g, '<dir>');
  const refresh = rows['memory.refresh'].split('; ${NEVER}')[0];
  assert.match(refresh, /records the installed version and package path/);
  // Either route the step prints: on a Mac, or elsewhere (round 17, R8).
  const other = rows['setup.memory-open-vault'].replace('${route(v)}', rows['setup.memory-open-route']).replace(/\$\{v\}/g, '<dir>');
  for (const doc of ['docs/reference/cli.md', 'docs/ux/scenarios.md', 'README.md', 'SECURITY.md', 'CHANGELOG.md']) {
    let raw = fs.readFileSync(path.join(ROOT, doc), 'utf8');
    // A released CHANGELOG section is a record of what printed then: only Unreleased is read (round 17, R8).
    if (doc === 'CHANGELOG.md') { const at = raw.indexOf('## Unreleased'); raw = raw.slice(at, raw.indexOf('\n## ', at + 1)); }
    const text = collapse(raw);
    for (const m of text.matchAll(/"(Open the wiki vault [^"]*)"/g)) assert.ok(m[1] === vault || m[1] === other, `${doc} quotes the vault step as it prints: ${m[1]}`);
    for (const m of text.matchAll(/"(run: obsidian-wiki list \([^"]*)"/g)) assert.ok(m[1].startsWith(refresh), `${doc} quotes the refresh step as it prints`);
  }
  assert.ok(collapse(fs.readFileSync(path.join(ROOT, 'docs/reference/cli.md'), 'utf8')).includes(`"${vault}"`), 'cli.md quotes the vault step');
  // Round 18 (3): what the refresh may change, as the plan and done lines print it (KEPT_APART), and every doc that says the
  // version and package path says the quotes too.
  const kept = rows['memory.kept-apart'];
  assert.match(kept, /quotes around a bare value or an empty vault line where there was none$/);
  for (const k of ['setup.memory-install', 'setup.repair-tool', 'memory.done-upgrade-brought', 'memory.done-upgrade-forced']) assert.ok(rows[k] && /\$\{(memory\.)?KEPT_APART\}/.test(rows[k]), `${k} prints KEPT_APART: ${rows[k]}`);
  const head = "the version and package path obsidian-wiki's refresh records";
  for (const doc of ['README.md', 'docs/reference/cli.md', 'docs/ux/scenarios.md', 'CHANGELOG.md', 'docs/adr/0006-setup-installs-the-agents-wiki-memory.md', 'plugin/passioncode/skills/setting-up-passioncode/SKILL.md', 'test/evals/setting-up-passioncode/scenarios.json']) {
    let raw = fs.readFileSync(path.join(ROOT, doc), 'utf8');
    if (doc === 'CHANGELOG.md') { const at = raw.indexOf('## Unreleased'); raw = raw.slice(at, raw.indexOf('\n## ', at + 1)); }
    const text = collapse(raw);
    for (let at = text.indexOf(head); at >= 0; at = text.indexOf(head, at + 1)) {
      assert.ok(text.slice(at, at + 400).includes('quotes around a bare value or an empty vault line'), `${doc}: ${text.slice(at, at + 200)}`);
    }
  }
});

// PC-178 round 18 (R12): every form configForm can name has a strings.md row that cites its literal in CONFIG_FORMS, never a
// comment that happens to hold the same words.
test('every config form has a strings.md row at its CONFIG_FORMS literal', () => {
  const memory = require('../lib/memory');
  const lines = fs.readFileSync(path.join(ROOT, 'lib/memory.js'), 'utf8').split(/\r?\n/);
  const from = lines.findIndex((l) => l.startsWith('const CONFIG_FORMS = Object.freeze({')) + 1;
  const to = lines.findIndex((l, i) => i >= from && l.startsWith('});')) + 1;
  assert.ok(from > 0 && to > from);
  const rows = fs.readFileSync(path.join(ROOT, 'docs/brand/strings.md'), 'utf8').split(/\r?\n/)
    .filter((l) => /^\| [a-z][\w.-]* \|/.test(l)).map((row) => { const c = row.split(' | '); return { text: c[1].replace(/\\\|/g, '|'), loc: c[2] }; });
  for (const value of Object.values(memory.CONFIG_FORMS)) {
    const row = rows.find((r) => r.text === value && r.loc.startsWith('lib/memory.js:'));
    assert.ok(row, `no row for ${value}`);
    const n = Number(row.loc.split(':')[1]);
    assert.ok(n > from && n < to, `${value} cites ${row.loc}, outside CONFIG_FORMS (lines ${from + 1} to ${to - 1})`);
  }
});

// PC-178 round 20 (6): every memory row id lib/memory.js gives a person's gate appears in cli.md's list of gates.
test('every memory row with a gate is in cli.md\'s list of gates', () => {
  const src = fs.readFileSync(path.join(ROOT, 'lib/memory.js'), 'utf8').split(/\r?\n/);
  const ids = new Set();
  for (let i = 0; i < src.length; i++) {
    const m = /id: '(memory[\w.-]*)'/.exec(src[i]);
    if (!m) continue;
    // The row's object: this line and the next two (a row spans at most three lines in lib/memory.js).
    const text = src.slice(i, i + 3).join(' ');
    if (/gate: (?!null\b)/.test(text)) ids.add(m[1]);
  }
  ids.add('memory.vault.config-form'); // configFormRow's id, its gate on a later line
  const cli = fs.readFileSync(path.join(ROOT, 'docs/reference/cli.md'), 'utf8');
  const at = cli.indexOf('Today: `consent` for');
  const list = cli.slice(at, cli.indexOf('`secret` for\n`memory.obsidian.signature`', at));
  assert.ok(at > 0 && list.length > 100);
  for (const id of ids) assert.ok(list.includes(`\`${id}\``), `${id} is not in cli.md's list of gates`);
});
