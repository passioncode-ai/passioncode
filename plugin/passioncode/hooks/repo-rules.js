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
 * knowledge base's rules §4 reaches every session without each AGENTS.md restating it. Anything
 * unexpected (no git, no origin, a slow git) prints nothing: a reminder must never cost a session.
 */
const { execFileSync } = require('child_process');

const KNOWLEDGE = 'fabric-workspace/knowledge/';
const KNOWLEDGE_WEB = 'https://wiki.passioncode.ai/knowledge';
const PRINCIPLE_10 = `${KNOWLEDGE}principles.md#10-a-free-agent-takes-the-next-task`;
const PRINCIPLE_11 = `${KNOWLEDGE}principles.md#11-a-project-moves-in-releases-and-every-run-leaves-a-lesson-the-next-one-reads`;

/** The GitHub organization an origin URL belongs to, when it is passioncode-ai; else null. */
function orgOf(url) {
  const m = String(url || '').trim().match(/^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([^/]+)\//);
  return m && m[1] === 'passioncode-ai' ? 'passioncode-ai' : null;
}

function originOf(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], {
      encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'ignore'],
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

module.exports = { KNOWLEDGE, KNOWLEDGE_WEB, PRINCIPLE_10, PRINCIPLE_11, orgOf, rulesLine };
