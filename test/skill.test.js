'use strict';
// The skills this repository ships in its own plugin (plugin/passioncode/skills/*),
// held to the Agent Skills standard and to the organisation's publishing rules. The
// front matter is read the way the strictest consumer reads it: an agent that loads the
// skill from ~/.agents/skills with a YAML parser drops a skill Claude Code accepted.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SKILLS = path.join(ROOT, 'plugin/passioncode/skills');
const EVALS = path.join(__dirname, 'evals');
const SPDX = 'AGPL-3.0-only OR LicenseRef-PassionCode-Commercial'; // Fabric ADR-0092

/**
 * A strict reader for the YAML subset SKILL.md uses: a flat mapping of plain, quoted or
 * folded/literal block scalars, and one level of nested mapping. Anything a YAML 1.2
 * reader would reject — or silently truncate — is an error naming the line.
 */
function parseFrontMatter(text) {
  const m = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!m) throw new Error('no front matter block');
  const lines = m[1].split('\n');
  const doc = {};
  const plain = (value, n) => {
    if (/^[\[\]{},#&*!|>'"%@`]/.test(value) || /^[-?:](\s|$)/.test(value)) throw new Error(`line ${n}: a plain scalar cannot start with ${value[0]}`);
    if (/:(\s|$)/.test(value)) throw new Error(`line ${n}: an unquoted value holds ": " — use a block scalar (>-) or quotes`);
    if (/\s#/.test(value)) throw new Error(`line ${n}: " #" starts a comment inside an unquoted value`);
    return value;
  };
  const scalar = (value, n) => {
    if (value.startsWith('"')) { if (!/^"(?:[^"\\]|\\.)*"$/.test(value)) throw new Error(`line ${n}: unclosed double quote`); return JSON.parse(value); }
    if (value.startsWith("'")) { if (!/^'(?:[^']|'')*'$/.test(value)) throw new Error(`line ${n}: unclosed single quote`); return value.slice(1, -1).replace(/''/g, "'"); }
    return plain(value, n);
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const n = i + 2;
    if (line.trim() === '') { i += 1; continue; }
    const kv = /^([A-Za-z0-9_-]+):(?: (.*))?$/.exec(line);
    if (!kv) throw new Error(`line ${n}: expected "key: value" at the top level`);
    const [, key, rest = ''] = kv;
    if (Object.prototype.hasOwnProperty.call(doc, key)) throw new Error(`line ${n}: duplicate key ${key}`);
    i += 1;
    if (/^[>|][+-]?$/.test(rest)) {
      const body = [];
      while (i < lines.length && (/^ {2,}\S/.test(lines[i]) || lines[i].trim() === '')) { body.push(lines[i].trim()); i += 1; }
      if (!body.length) throw new Error(`line ${n}: empty block scalar`);
      doc[key] = rest.startsWith('>') ? body.join(' ').replace(/\s+/g, ' ').trim() : body.join('\n');
    } else if (rest === '') {
      const nested = {};
      while (i < lines.length && /^ {2}\S/.test(lines[i])) {
        const sub = /^ {2}([A-Za-z0-9_-]+): (.+)$/.exec(lines[i]);
        if (!sub) throw new Error(`line ${i + 2}: expected "  key: value" under ${key}`);
        if (Object.prototype.hasOwnProperty.call(nested, sub[1])) throw new Error(`line ${i + 2}: duplicate key ${sub[1]}`);
        nested[sub[1]] = scalar(sub[2], i + 2);
        i += 1;
      }
      if (!Object.keys(nested).length) throw new Error(`line ${n}: ${key} has no value — YAML reads it as null`);
      doc[key] = nested;
    } else {
      doc[key] = scalar(rest, n);
    }
  }
  return { doc, body: text.slice(m[0].length) };
}

const skills = () => fs.readdirSync(SKILLS).filter((n) => fs.existsSync(path.join(SKILLS, n, 'SKILL.md'))).sort();

test('the strict front-matter reader rejects what a YAML reader rejects', () => {
  assert.throws(() => parseFrontMatter('---\nname: x\ndescription: Use when X extension: which. NOT for Y.\n---\n'), /": "/);
  assert.throws(() => parseFrontMatter('---\nname: x\ndescription: Use when X #1. NOT for Y.\n---\n'), /comment/);
  assert.throws(() => parseFrontMatter('---\nname: x\nname: y\n---\n'), /duplicate/);
  assert.throws(() => parseFrontMatter('---\nname: x\nmetadata:\n---\n'), /null/);
  assert.equal(parseFrontMatter('---\ndescription: >-\n  a: b\n  c\n---\n').doc.description, 'a: b c');
});

test('the self plugin ships the working-in-passioncode skill', () => {
  assert.ok(skills().includes('working-in-passioncode'));
});

for (const name of fs.existsSync(SKILLS) ? skills() : []) {
  const dir = path.join(SKILLS, name);
  const text = fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8');

  test(`${name}: front matter meets the Agent Skills standard`, () => {
    const { doc } = parseFrontMatter(text);
    assert.equal(doc.name, name, 'name equals the directory');
    assert.match(doc.name, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
    assert.ok(doc.name.length <= 64);
    assert.doesNotMatch(doc.name, /anthropic|claude/, 'reserved substrings are rejected on upload');
    assert.ok(doc.description.startsWith('Use when '), 'description says WHEN');
    assert.ok(doc.description.includes('NOT for'), 'description names what it is not for');
    assert.ok(doc.description.length <= 970, `description ${doc.description.length} chars holds 5% headroom under 1024`);
    assert.doesNotMatch(doc.description, /[<>]/, 'no angle brackets in a description');
    assert.equal(doc.license, SPDX);
    assert.equal(doc.license, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).license, 'the skill and the package carry one license');
    assert.ok(!doc.compatibility || doc.compatibility.length <= 500);
  });

  test(`${name}: body stays inside the budget and links every reference once`, () => {
    const { body } = parseFrontMatter(text);
    assert.ok(text.split('\n').length < 500, 'SKILL.md under 500 lines');
    assert.ok(text.split(/\s+/).length < 4750, 'SKILL.md holds 5% headroom under ~5000 tokens');
    assert.doesNotMatch(body, /[А-Яа-яЁё]/, 'Cyrillic belongs in trigger phrases, not the body');
    const linked = [...text.matchAll(/\]\(references\/([^)#]+)\)/g)].map((x) => x[1]);
    const refs = fs.existsSync(path.join(dir, 'references')) ? fs.readdirSync(path.join(dir, 'references')).filter((f) => f.endsWith('.md')).sort() : [];
    assert.deepEqual([...new Set(linked)].sort(), refs, 'every reference is linked from SKILL.md, and every link resolves');
    for (const ref of refs) {
      const r = fs.readFileSync(path.join(dir, 'references', ref), 'utf8');
      if (r.split('\n').length > 100) assert.match(r, /^## Contents$/m, `${ref} is over 100 lines and needs Contents`);
    }
  });

  test(`${name}: nothing machine-specific ships`, () => {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
    for (const file of walk(dir)) {
      const t = fs.readFileSync(file, 'utf8');
      assert.doesNotMatch(t, /\/Users\/[a-z]|\/home\/[a-z]|~\/DATA\b/, `${path.relative(ROOT, file)} names an absolute home path`);
      assert.doesNotMatch(t, /Source-available under|PolyForm-Noncommercial-1\.0\.0 OR/i, `${path.relative(ROOT, file)} states the retired PolyForm licence as current (ADR-0092: AGPL-3.0 or commercial)`);
    }
  });

  test(`${name}: routes backlog work to one canonical owner`, () => {
    assert.match(text, /docs\/backlog-sources\.json/);
    assert.match(text, /knowledge\/backlog\.md/);
    assert.match(text, /Never edit generated task status/);
  });

  test(`${name}: says the knowledge base protocol — read first, update last`, () => {
    const { body } = parseFrontMatter(text);
    const flat = body.replace(/\s+/g, ' ');
    assert.match(flat, /fabric-workspace\/knowledge\//, 'names the local copy of the knowledge base');
    assert.match(flat, /wiki\.passioncode\.ai\/knowledge/, 'names the published knowledge base');
    assert.match(flat, /before the first edit/i);
    assert.match(flat, /update the (knowledge base )?page (here )?that owns/i, 'after the work, the page that owns a changed cross-repository fact');
    assert.match(flat, /AGPL-3\.0-only OR LicenseRef-PassionCode-Commercial/, 'the licence expression, exactly');
    assert.match(flat, /https:\/\/passioncode\.ai\/business\//, 'the commercial path is the business form (operator decision 2026-10-05)');
    assert.match(flat, /commercial@passioncode\.ai/, 'the commercial contact address');
    assert.doesNotMatch(flat, /PassionCode\.ai \(contact@passioncode\.ai\)/, 'contact@ is the security address, not the commercial one');
  });

  test(`${name}: trigger and scenario evals exist and are balanced`, () => {
    const triggers = JSON.parse(fs.readFileSync(path.join(EVALS, name, 'triggers.json'), 'utf8'));
    assert.equal(triggers.skill, name);
    const pos = triggers.queries.filter((q) => q.shouldTrigger === true).length;
    const neg = triggers.queries.filter((q) => q.shouldTrigger === false).length;
    assert.ok(triggers.queries.length >= 18 && pos >= 8 && neg >= 8, `about twenty balanced queries (${pos} positive, ${neg} near-miss negative)`);
    assert.equal(new Set(triggers.queries.map((q) => q.query)).size, triggers.queries.length, 'no duplicate query');
    assert.ok(triggers.queries.some((q) => q.shouldTrigger && /[А-Яа-яЁё]/.test(q.query)), 'a Russian positive');
    assert.ok(triggers.queries.some((q) => !q.shouldTrigger && /[А-Яа-яЁё]/.test(q.query)), 'a Russian negative');
    const scenarios = JSON.parse(fs.readFileSync(path.join(EVALS, name, 'scenarios.json'), 'utf8'));
    assert.equal(scenarios.skill, name);
    assert.ok(scenarios.scenarios.length >= 3);
    for (const s of scenarios.scenarios) assert.ok(s.id && s.trap && s.request && s.expected.length >= 3, `scenario ${s.id} names its trap and at least three observables`);
  });
}

module.exports = { parseFrontMatter };
