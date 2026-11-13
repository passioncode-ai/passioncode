'use strict';
// PC-178 round 17: obsidian-wiki 2026.11.4's write_config, as its stale refresh calls it
// (write_config(_read_config_value("OBSIDIAN_VAULT_PATH"))), for the fake tools. Every managed line is rewritten as
// KEY="value" (an empty value too; the repo is always the package path), a repeated managed line is dropped, a managed
// key that is missing is appended in VAULT, REPO, VERSION order (so a config with no vault line gains
// OBSIDIAN_VAULT_PATH=""), and the file ends with a newline. test/memory.test.js compares it with the real outputs.
const MANAGED = ['OBSIDIAN_VAULT_PATH', 'OBSIDIAN_WIKI_REPO', 'OBSIDIAN_WIKI_VERSION'];
// Python's str.splitlines() line breaks (\r\n counts once).
const splitlines = (text) => { const out = text.split(/\r\n|[\n\r\v\f\x1c-\x1e\x85\u2028\u2029]/); if (out.length && out[out.length - 1] === '') out.pop(); return out; };
/** _read_config_value: the first line that starts with KEY=, the rest stripped of whitespace, then of double quotes. */
const readValue = (text, key) => { const l = splitlines(text).find((x) => x.startsWith(`${key}=`)); return l ? l.slice(key.length + 1).trim().replace(/^"+|"+$/g, '') : ''; };
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
module.exports = { refreshConfig, readValue };
