// Resolve local documentation links, source locations and named regression evidence.
// This checks addresses, not whether prose correctly describes the implementation.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function anchors(text) {
  const ids = new Set(), counts = new Map();
  const prose = text.replace(/^```[^\n]*\n[\s\S]*?^```\s*$/gm, '');
  for (const m of prose.matchAll(/^#{1,6}\s+(.+)$/gm)) {
    const base = m[1].trim().toLowerCase().replace(/[^\p{L}\p{N}_\- ]/gu, '').replace(/ /g, '-');
    const count = counts.get(base) || 0;
    ids.add(base + (count ? `-${count}` : ''));
    counts.set(base, count + 1);
  }
  for (const m of text.matchAll(/\bid=["']([^"']+)["']/g)) ids.add(m[1]);
  return ids;
}

export function checkLinks(root, files) {
  const errors = [];
  for (const file of files) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    for (const match of text.matchAll(/\[[^\]]*\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const href = match[1].replace(/^<|>$/g, '');
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) continue;
      const [rel, fragment] = href.split('#');
      const target = rel ? path.resolve(root, path.dirname(file), decodeURIComponent(rel)) : path.join(root, file);
      if (!fs.existsSync(target)) errors.push(`${file}: missing link target ${href}`);
      else if (fragment && target.endsWith('.md') && !anchors(fs.readFileSync(target, 'utf8')).has(decodeURIComponent(fragment))) {
        errors.push(`${file}: missing Markdown anchor ${href}`);
      }
    }
    for (const m of text.matchAll(/\b((?:bin|lib|scripts|test|plugin|docs|\.github)\/[\w./-]+):(\d+)\b/g)) {
      const source = path.join(root, m[1]);
      if (!fs.existsSync(source) || Number(m[2]) < 1 || Number(m[2]) > fs.readFileSync(source, 'utf8').split('\n').length) {
        errors.push(`${file}: invalid source location ${m[0]}`);
      }
    }
  }
  return errors;
}

export function checkEvidence(root, entries) {
  const errors = [];
  const scenarios = fs.readFileSync(path.join(root, 'docs/ux/scenarios.md'), 'utf8');
  for (const row of entries) {
    const file = path.join(root, row.file);
    const source = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (!source.includes(`test('${row.test}',`)) errors.push(`${row.id}: missing named test ${row.file}: ${row.test}`);
    if (!scenarios.includes(`### ${row.scenario}:`)) errors.push(`${row.id}: missing scenario ${row.scenario}`);
  }
  return errors;
}

function markdownFiles(root, dir = 'docs') {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    return entry.isDirectory() ? markdownFiles(root, file) : entry.name.endsWith('.md') ? [file] : [];
  });
}

export function checkDocs(root) {
  const files = ['README.md', 'SECURITY.md', 'CONTRIBUTING.md', 'AGENTS.md', ...markdownFiles(root)];
  const entries = JSON.parse(fs.readFileSync(path.join(root, 'docs/evidence/launcher-audit.json'), 'utf8')).regressions;
  const errors = [...checkLinks(root, files), ...checkEvidence(root, entries)];
  return { files: files.length, regressions: entries.length, errors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const result = checkDocs(root);
  for (const error of result.errors) console.error(error);
  console.log(`docs: ${result.files} Markdown files, ${result.regressions} named regressions, ${result.errors.length} errors`);
  process.exitCode = result.errors.length ? 1 : 0;
}
