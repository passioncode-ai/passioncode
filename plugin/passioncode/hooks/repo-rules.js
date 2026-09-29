'use strict';
/**
 * The read-first reminder. In a passioncode-ai repository an agent reads the repository's
 * AGENTS.md and the organization's CONTRIBUTING.md before its first edit — names, landing
 * rules, code region markers, the shared tools. A rule an agent has to remember is a rule it
 * forgets in the one repository where it mattered, so the session start says it, in one line,
 * and only where it applies. Anything unexpected (no git, no origin, a slow git) prints nothing:
 * a reminder must never cost a session.
 */
const { execFileSync } = require('child_process');

const CONTRIBUTING = 'https://github.com/passioncode-ai/.github/blob/main/CONTRIBUTING.md';

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
  return `[passioncode] passioncode-ai repository: read AGENTS.md and the organization's CONTRIBUTING.md (${CONTRIBUTING}) before the first edit — names, landing rules, code region markers.`;
}

module.exports = { CONTRIBUTING, orgOf, rulesLine };
