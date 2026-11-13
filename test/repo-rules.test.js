'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
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
const { orgOf, rulesLine, courseLine, KNOWLEDGE, KNOWLEDGE_WEB, PRINCIPLE_10, PRINCIPLE_11, COURSE_RULE, COURSE_PLAN } = require('../plugin/passioncode/hooks/repo-rules');

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

test('the reminder sends task edits to canonical sources and the shared backlog', () => {
  const line = rulesLine(repo('https://github.com/passioncode-ai/passioncode'));
  assert.match(line, /docs\/backlog-sources\.json/);
  assert.match(line, /canonical task source/);
  assert.match(line, /workspace backlog/);
});

test('the line names Fabric principles 10 and 11 by anchor, between the read-first and the after-work parts', () => {
  const line = rulesLine(repo('git@github.com:passioncode-ai/fabric-agent-adapter.git'));
  assert.equal(PRINCIPLE_10, `${KNOWLEDGE}principles.md#10-a-free-agent-takes-the-next-task`);
  assert.equal(PRINCIPLE_11, `${KNOWLEDGE}principles.md#11-a-project-moves-in-releases-and-every-run-leaves-a-lesson-the-next-one-reads`);
  const p10 = line.indexOf('principles.md#10-');
  const p11 = line.indexOf('principles.md#11-');
  assert.ok(p10 > line.indexOf('before the first edit'), `principle 10 follows the read-first part: ${line}`);
  assert.ok(p11 > p10 && line.indexOf('after the work') > p11, `principle 11 follows 10, both before the after-work part: ${line}`);
  assert.match(line, /a free agent takes the next task/);
  assert.match(line, /every run leaves a lesson/);
  assert.equal(line.split('\n').length, 1);
});

test('the course-check line names rules §0 and the one plan, the link to name, and the unread board', () => {
  const line = courseLine();
  assert.equal(COURSE_RULE, `${KNOWLEDGE}rules.md#0-the-course-check-the-plan-and-the-north-star-before-every-change`);
  assert.equal(COURSE_PLAN, 'fabric-workspace/docs/plans/2026-11-11-unified/README.md');
  assert.match(line, /^\[passioncode\] course check before every change: /);
  assert.ok(line.includes(COURSE_RULE) && line.includes(COURSE_PLAN), `both links: ${line}`);
  assert.match(line, /North Star/);
  assert.match(line, /track, plan row or gap/);
  assert.match(line, /goes to the board first/);
  assert.match(line, /com\.list \{unread: true\}/);
  assert.equal(line.split('\n').length, 1);
});

test('the session-start hook prints the course line right after the read-first line, only in a passioncode-ai repository', () => {
  const hook = path.join(__dirname, '..', 'plugin', 'passioncode', 'hooks', 'session-start.js');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-course-home-'));
  const stateDir = path.join(home, '.passioncode');
  fs.mkdirSync(stateDir);
  // A check from just now and nothing published: the hook starts no probe and no update, so only its lines run.
  fs.writeFileSync(path.join(stateDir, 'state.json'), JSON.stringify({ checkedAt: new Date().toISOString() }));
  const run = (cwd) => execFileSync(process.execPath, [hook], {
    input: JSON.stringify({ cwd }), encoding: 'utf8', timeout: 20000,
    env: { ...process.env, HOME: home, USERPROFILE: home, PASSIONCODE_HOME: stateDir },
  });
  const ours = run(repo('git@github.com:passioncode-ai/fabric.git')).split('\n');
  const at = ours.findIndex((l) => l.startsWith('[passioncode] passioncode-ai repository: '));
  assert.ok(at >= 0, ours.join('\n'));
  assert.equal(ours[at + 1], courseLine());
  assert.ok(!run(repo('git@github.com:ssheleg/private-agent.git')).includes('course check'));
});
