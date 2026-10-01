'use strict';
/**
 * The read-first reminder: the protocol of Fabric ADR-0093. In a passioncode-ai repository an
 * agent reads the organization's knowledge base (fabric-workspace/knowledge/, published at
 * wiki.passioncode.ai/knowledge) and the repository's AGENTS.md before its first edit, and after
 * the work updates the knowledge base page that owns any cross-repository fact it changed. A rule
 * an agent has to remember is a rule it forgets in the one repository where it mattered, so the
 * session start says it, in one line, and only where it applies. Anything unexpected (no git, no
 * origin, a slow git) prints nothing: a reminder must never cost a session.
 */
const { execFileSync } = require('child_process');

const KNOWLEDGE = 'fabric-workspace/knowledge/';
const KNOWLEDGE_WEB = 'https://wiki.passioncode.ai/knowledge';

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
  return `[passioncode] passioncode-ai repository: read the knowledge base (${KNOWLEDGE} or ${KNOWLEDGE_WEB}), then this repository's AGENTS.md, before the first edit; after the work, update the knowledge base page that owns any cross-repository fact you changed; edit each canonical task source declared in docs/backlog-sources.json and publish the derived workspace backlog.`;
}

module.exports = { KNOWLEDGE, KNOWLEDGE_WEB, orgOf, rulesLine };
