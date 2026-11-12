'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-178, round 4: the launcher never relays obsidian-wiki's own hints. Every hint obsidian-wiki 2026.11.4 can give
// (test/fixtures/obsidian-wiki-2026.11.4-hints.json, copied from its cli.py doctor and hooks.py) becomes one of the
// commands on the allowlist or a fixed text, which names obsidian-wiki setup, a bare hooks install and the wiki-setup
// skill only to say never.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const M = require('../lib/memory');

const FIXTURE = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'obsidian-wiki-2026.11.4-hints.json'), 'utf8'));
const NPX = 'npx @passioncode-ai/passioncode@latest';
// The prohibition the fixed texts carry, and what follows it, is taken off before the forbidden words are looked for.
const withoutProhibition = (s) => s.replace(/; never `obsidian-wiki setup`.*$/, '').replace(/, not with obsidian-wiki setup or its wiki-setup skill/, '');

test('PC-178: no hint of obsidian-wiki 2026.11.4 comes out as a step that runs its setup, its setup skill or a bare hooks install', () => {
  const out = [];
  for (const check of FIXTURE.checks) {
    for (const hint of FIXTURE.hints) {
      for (const status of ['warn', 'fail']) out.push(M.fixFor({ name: check, status, hint, detail: 'sample detail' }, NPX));
    }
  }
  out.push(M.fixFor({ name: 'session-hooks', status: 'warn', hint: FIXTURE.hints[FIXTURE.hints.length - 1], detail: 'registered, but hooks cannot reach the package' }, NPX));
  assert.ok(out.length > 500);
  for (const fix of out) {
    assert.equal(typeof fix, 'string');
    const said = withoutProhibition(fix);
    for (const word of ['obsidian-wiki setup', 'wiki-setup', 'setup skill']) assert.ok(!said.includes(word), `${word}: ${fix}`);
    const install = said.match(/obsidian-wiki hooks install(.{0,22})/);
    assert.ok(!install || install[1].startsWith(' --only SessionStart'), fix);
    assert.ok(!/`obsidian-wiki doctor`|`obsidian-wiki hooks status`/.test(fix), `never a bare doctor or hooks status: ${fix}`);
    // Every command it names is on the allowlist.
    for (const [, cmd] of fix.matchAll(/`([^`]+)`/g)) {
      if (/^obsidian-wiki setup$|^obsidian-wiki hooks install$/.test(cmd)) continue; // named only after "never"
      assert.ok(M.ALLOWED.some((a) => cmd === a || cmd.startsWith(`${a} `)) || cmd === `${NPX} setup --with wiki`, `${cmd} in ${fix}`);
    }
  }
});

test('PC-178: the fixed texts: setup-version, missing files, the SessionStart hook, and every other check', () => {
  assert.equal(M.fixFor({ name: 'setup-version', status: 'warn', hint: 'run: obsidian-wiki setup', detail: 'x' }, NPX), M.REFRESH);
  assert.equal(M.fixFor({ name: 'vault-core-files', status: 'warn', hint: 'run the wiki setup skill or create the missing files', detail: 'missing: index.md' }, NPX),
    'create the missing files by hand (missing: index.md), not with obsidian-wiki setup or its wiki-setup skill');
  assert.equal(M.fixFor({ name: 'session-hooks', status: 'info', hint: 'run: obsidian-wiki hooks install', detail: 'x' }, NPX), 'run: obsidian-wiki hooks install --only SessionStart');
  assert.equal(M.fixFor({ name: 'vault-path', status: 'fail', hint: 'fix OBSIDIAN_VAULT_PATH or re-run setup', detail: 'vault directory missing' }, NPX),
    `obsidian-wiki reports vault-path fail: vault directory missing; read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; never \`obsidian-wiki setup\`, a bare \`obsidian-wiki hooks install\`, or obsidian-wiki's wiki-setup skill`);
});

test('PC-178: versions are compared by their leading x.y.z; a suffix the launcher cannot order is unknown, never a reinstall', () => {
  const pin = M.PIN;
  assert.equal(M.versionAgainstPin('2026.12.0.post1'), 'ahead');
  assert.equal(M.versionAgainstPin('2026.12.0rc1'), 'ahead');
  assert.equal(M.versionAgainstPin('2026.10.2.post1'), 'behind');
  assert.equal(M.versionAgainstPin('2026.10.2'), 'behind');
  assert.equal(M.versionAgainstPin(pin), 'equal');
  assert.equal(M.versionAgainstPin(`${pin}.post1`), 'unknown');
  assert.equal(M.versionAgainstPin(`${pin}rc1`), 'unknown');
  assert.equal(M.versionAgainstPin(null), 'unknown');
  assert.equal(M.versionAgainstPin('nightly'), 'unknown');
});
