'use strict';
// PC-178 round 17: obsidian-wiki 2026.11.4's write_config, as its stale refresh calls it
// (write_config(_read_config_value("OBSIDIAN_VAULT_PATH"))), for the fake tools. Every managed line is rewritten as
// KEY="value" (an empty value too; the repo is always the package path), a repeated managed line is dropped, a managed
// key that is missing is appended in VAULT, REPO, VERSION order (so a config with no vault line gains
// OBSIDIAN_VAULT_PATH=""), and the file ends with a newline. test/memory.test.js compares it with the real outputs.
const MANAGED = ['OBSIDIAN_VAULT_PATH', 'OBSIDIAN_WIKI_REPO', 'OBSIDIAN_WIKI_VERSION'];
// Python's str.splitlines() line breaks (\r\n counts once).
const splitlines = (text) => { const out = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/); if (out.length && out[out.length - 1] === '') out.pop(); return out; };
// Python's str.strip() with no argument: the characters str.isspace() names (round 18, R11), never JS's trim().
const PY_SPACE = '\\t\\n\\v\\f\\r\\x1c-\\x1f \\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const pyStrip = (s) => String(s).replace(new RegExp(`^[${PY_SPACE}]+|[${PY_SPACE}]+$`, 'g'), '');
const stripQuotes = (s) => s.replace(/^"+|"+$/g, '');
/** _read_config_value: the first line that starts with KEY=, the rest stripped of whitespace, then of double quotes. */
const readValue = (text, key) => { const l = splitlines(text).find((x) => x.startsWith(`${key}=`)); return l ? stripQuotes(pyStrip(l.slice(key.length + 1))) : ''; };
/** _read_config: every stripped line with =, not a comment, as key = value (both stripped, the value of double quotes); the last wins. */
function readConfig(text) {
  const values = {};
  for (const raw of splitlines(text)) {
    const line = pyStrip(raw);
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const at = line.indexOf('=');
    values[pyStrip(line.slice(0, at))] = stripQuotes(pyStrip(line.slice(at + 1)));
  }
  return values;
}
/**
 * obsidian-wiki 2026.11.4 doctor's vault-config check over its config's text: fail "OBSIDIAN_VAULT_PATH is not set" for an
 * empty or missing value, else pass with the path expanded (~) and resolved against `cwd`. Recorded with the real one on
 * 2026-11-13: an empty line and no line fail; of two lines the last wins; a spaced key passes; ~/v is the home's.
 */
function doctorVault(text, { home, cwd = process.cwd() }) {
  const v = readConfig(text).OBSIDIAN_VAULT_PATH || '';
  if (!v) return { name: 'vault-config', status: 'fail', detail: 'OBSIDIAN_VAULT_PATH is not set', hint: 'run: obsidian-wiki setup --vault /path/to/your/vault' };
  const expanded = v.replace(/^~(?=$|\/)/, home);
  return { name: 'vault-config', status: 'pass', detail: require('path').resolve(cwd, expanded), hint: '' };
}
function refreshConfig(text, { repo, version }) {
  const managed = { OBSIDIAN_VAULT_PATH: readValue(text, 'OBSIDIAN_VAULT_PATH'), OBSIDIAN_WIKI_REPO: repo, OBSIDIAN_WIKI_VERSION: version };
  const out = [];
  const seen = new Set();
  for (const raw of splitlines(text)) {
    const stripped = raw.trim();
    const key = stripped.includes('=') ? stripped.split('=')[0].trim() : '';
    if (MANAGED.includes(key) && !stripped.startsWith('#')) {
      if (!seen.has(key)) { out.push(`${key}="${managed[key]}"`); seen.add(key); }
      continue;
    }
    out.push(raw);
  }
  for (const key of MANAGED) if (!seen.has(key)) out.push(`${key}="${managed[key]}"`);
  return `${out.join('\n')}\n`;
}
module.exports = { refreshConfig, readValue, readConfig, doctorVault, pyStrip };
