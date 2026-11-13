'use strict';
/**
 * The read-first reminder: the protocol of Fabric ADR-0093. In a passioncode-ai repository an
 * agent reads the organization's knowledge base (fabric-workspace/knowledge/, published at
 * wiki.passioncode.ai/knowledge) and the repository's AGENTS.md before its first edit, and after
 * the work updates the knowledge base page that owns any cross-repository fact it changed. A rule
 * an agent has to remember is a rule it forgets in the one repository where it mattered, so the
 * session start says it, in one line, and only where it applies. The same line names the two Fabric
 * principles that govern how the work moves — 10, a free agent takes the next task, and 11, a project
 * moves in releases and every run leaves a lesson — by their anchors in principles.md, so the
 * knowledge base's rules §4 reaches every session without each AGENTS.md restating it. A second line
 * carries the course check of rules §0 (courseLine). Anything
 * unexpected (no git, no origin, a slow git) prints nothing: a reminder must never cost a session.
 */
const { execFileSync } = require('child_process');

const KNOWLEDGE = 'fabric-workspace/knowledge/';
const KNOWLEDGE_WEB = 'https://wiki.passioncode.ai/knowledge';
const PRINCIPLE_10 = `${KNOWLEDGE}principles.md#10-a-free-agent-takes-the-next-task`;
const PRINCIPLE_11 = `${KNOWLEDGE}principles.md#11-a-project-moves-in-releases-and-every-run-leaves-a-lesson-the-next-one-reads`;
// #region course-check — docs: plugin/passioncode/skills/working-in-passioncode/SKILL.md#0-the-protocol-before-and-after-every-piece-of-work
// The course check (knowledge base rules §0, the operator 2026-11-12): before a change, the North Star
// and the one plan in waves; the change names the track, plan row or gap it serves; after it, the row
// is updated. Printed as its own line next to the read-first one, in passioncode-ai repositories only.
const COURSE_RULE = `${KNOWLEDGE}rules.md#0-the-course-check-the-plan-and-the-north-star-before-every-change`;
const COURSE_PLAN = 'fabric-workspace/docs/plans/2026-11-11-unified/README.md';
// #endregion course-check

/** The GitHub organization an origin URL belongs to, when it is passioncode-ai; else null. */
function orgOf(url) {
  const m = String(url || '').trim().match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/]+)\//);
  return m && m[1] === 'passioncode-ai' ? 'passioncode-ai' : null;
}

function originOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8', timeout: 2000, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch (_) {
    return '';
  }
}

/** The one line to print at session start in `dir`, or null. */
function rulesLine(dir) {
  if (!orgOf(originOf(dir))) return null;
  return `[passioncode] passioncode-ai repository: read the knowledge base (${KNOWLEDGE} or ${KNOWLEDGE_WEB}), then this repository's AGENTS.md, before the first edit; work by Fabric principle 10, a free agent takes the next task (a wait goes on a watcher, stop only at a human gate; ${PRINCIPLE_10}), and principle 11, a project moves in releases and every run leaves a lesson the next one reads (${PRINCIPLE_11}); after the work, update the knowledge base page that owns any cross-repository fact you changed; edit each canonical task source declared in docs/backlog-sources.json and publish the derived workspace backlog.`;
}

/** The course-check line, printed right after rulesLine wherever that one is printed. */
function courseLine() {
  return `[passioncode] course check before every change: read the North Star metric and gaps and the one plan in waves (${COURSE_RULE}; ${COURSE_PLAN}), name the track, plan row or gap the change serves (work that serves none goes to the board first), update that row after the change, and read what waits on you with com.list {unread: true}.`;
}

module.exports = { KNOWLEDGE, KNOWLEDGE_WEB, PRINCIPLE_10, PRINCIPLE_11, COURSE_RULE, COURSE_PLAN, orgOf, rulesLine, courseLine };
