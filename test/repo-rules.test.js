'use strict';
// The read-first reminder (Fabric agent-registry plan AR-0.7, the protocol of Fabric ADR-0093):
// at session start in a passioncode-ai repository, one line says the protocol — read the
// knowledge base and the repository's AGENTS.md before the first edit, update the knowledge base
// page that owns a changed cross-repository fact after the work; anywhere else, nothing is printed.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const test = require('node:test');
const { orgOf, rulesLine, KNOWLEDGE, KNOWLEDGE_WEB } = require('../plugin/passioncode/hooks/repo-rules');

function repo(url) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-rules-'));
  execFileSync('git', ['-C', dir, 'init', '-q']);
  if (url) execFileSync('git', ['-C', dir, 'remote', 'add', 'origin', url]);
  fs.mkdirSync(path.join(dir, 'sub'));
  return dir;
}

test('origin URLs of the organization are recognised in every spelling', () => {
  for (const url of ['git@github.com:passioncode-ai/fabric.git', 'https://github.com/passioncode-ai/fabric', 'ssh://git@github.com/passioncode-ai/org-index.git']) {
    assert.equal(orgOf(url), 'passioncode-ai', url);
  }
  for (const url of ['git@github.com:ssheleg/fabric.git', 'https://github.com/passioncode-ai-fake/x', 'https://gitlab.com/passioncode-ai/x', '']) {
    assert.equal(orgOf(url), null, url);
  }
});

test('a passioncode-ai repository gets one read-first line, from any subdirectory', () => {
  const dir = repo('git@github.com:passioncode-ai/fabric.git');
  const line = rulesLine(path.join(dir, 'sub'));
  assert.match(line, /^\[passioncode\] passioncode-ai repository: /);
  assert.equal(line.split('\n').length, 1);
});

test('the line says the protocol: the knowledge base and AGENTS.md before, the owning page after', () => {
  const line = rulesLine(repo('https://github.com/passioncode-ai/fabric-inbox'));
  assert.equal(KNOWLEDGE, 'fabric-workspace/knowledge/');
  assert.equal(KNOWLEDGE_WEB, 'https://wiki.passioncode.ai/knowledge');
  const before = line.indexOf('before the first edit');
  const after = line.indexOf('after the work');
  assert.ok(before > 0 && after > before, `"before the first edit" comes before "after the work": ${line}`);
  const head = line.slice(0, before);
  assert.ok(head.includes(KNOWLEDGE) && head.includes(KNOWLEDGE_WEB), 'before: the knowledge base, local copy and wiki');
  assert.ok(head.indexOf('knowledge') < head.indexOf('AGENTS.md'), 'before: the knowledge base first, then AGENTS.md');
  assert.match(line.slice(after), /knowledge base page that owns/, 'after: update the page that owns a changed cross-repository fact');
  assert.match(line.slice(after), /cross-repository fact/);
});

test('any other repository, a folder without git, or a missing git prints nothing', () => {
  assert.equal(rulesLine(repo('git@github.com:ssheleg/private-agent.git')), null);
  assert.equal(rulesLine(repo(null)), null);
  assert.equal(rulesLine(fs.mkdtempSync(path.join(os.tmpdir(), 'pc-nogit-'))), null);
  assert.equal(rulesLine(path.join(os.tmpdir(), 'does-not-exist-pc')), null);
});
