'use strict';
/**
 * The decisions behind the self-update, kept apart from the processes that act on them.
 *
 * The package name on npm is the attack surface: whoever publishes `passioncode` gets
 * code run on every machine that has this plugin. So the probe records WHO published
 * the latest version, and the session-start hook installs it only when every npm
 * maintainer — and the account that published that version — is named in the trust
 * list shipped inside the plugin (`trust.json`). Anything else is reported, never run.
 */
const fs = require('fs');
const path = require('path');

const PACKAGE = '@passioncode-ai/passioncode';
const VERSION = /^\d+\.\d+\.\d+$/;
const TRUST_FILE = path.join(__dirname, '..', 'trust.json');

/**
 * The identity npm records for a version published by GitHub Actions through trusted
 * publishing (OIDC). Recognised by its email, never by the display name, which any account
 * can copy. Only a maintainer can register a trusted publisher, and maintainers are still
 * checked one by one, so listing this in trust.json trusts the release workflow the
 * maintainers configured, not GitHub at large.
 */
const OIDC_PUBLISHER = 'github-actions-oidc';
const OIDC_EMAIL = 'npm-oidc-no-reply@github.com';

function publisherName(entry) {
  const email = entry && typeof entry === 'object' ? entry.email : (String(entry || '').match(/<([^>]*)>/) || [])[1];
  if (typeof email === 'string' && email.trim().toLowerCase() === OIDC_EMAIL) return OIDC_PUBLISHER;
  return accountName(entry);
}

/** `name <email>`, `{ name, email }` or `name` → the npm account name, lowercased. */
function accountName(entry) {
  const raw = entry && typeof entry === 'object' ? entry.name : entry;
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/<[^>]*>/g, '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9._-]*$/.test(name) ? name : null;
}

/**
 * Reads the answer of `npm view @passioncode-ai/passioncode version maintainers _npmUser --json`.
 * Returns what the probe records: `{ published: true, latest, maintainers, publisher }`,
 * `{ published: false }` for a name nobody has published (E404), or `{ checkError }`.
 */
function parseView(stdout, error) {
  let doc = null;
  try { doc = JSON.parse(String(stdout || '').trim()); } catch (_) { /* judged below */ }
  if (doc && typeof doc === 'object' && doc.error) {
    if (doc.error.code === 'E404') return { published: false };
    return { checkError: `${doc.error.code || 'npm error'}: ${oneLine(doc.error.summary || '')}`.trim() };
  }
  if (error) return { checkError: oneLine(error.message) };
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) {
    return { checkError: error ? oneLine(error.message) : 'npm answered with something that is not the expected JSON' };
  }
  const latest = typeof doc.version === 'string' ? doc.version.trim() : '';
  if (!VERSION.test(latest)) return { checkError: 'npm answered without a usable version' };
  const list = Array.isArray(doc.maintainers) ? doc.maintainers : (doc.maintainers ? [doc.maintainers] : []);
  const maintainers = list.map(accountName);
  return {
    published: true,
    latest,
    // An entry that is not a readable account name poisons the list: it cannot be trusted.
    maintainers: maintainers.includes(null) ? [] : maintainers,
    publisher: doc._npmUser ? publisherName(doc._npmUser) : null,
  };
}

/** Applies a probe result to the state: every run replaces the previous answer whole. */
function recordProbe(state, result, now = new Date()) {
  const next = { ...state, checkedAt: now.toISOString() };
  for (const key of ['published', 'latest', 'maintainers', 'publisher', 'checkError']) delete next[key];
  if (result.checkError) {
    next.checkError = result.checkError.slice(0, 200);
    return next;
  }
  delete next.checkErrorShown; // a later failure is news again
  next.published = result.published;
  if (result.published) Object.assign(next, { latest: result.latest, maintainers: result.maintainers, publisher: result.publisher });
  return next;
}

/** The trust list shipped with the plugin. Missing or damaged means nobody is trusted. */
function loadTrust(file = TRUST_FILE) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(doc.npmPublishers) ? doc.npmPublishers : [];
    return list.map(accountName).filter(Boolean);
  } catch (_) {
    return [];
  }
}

function newer(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

function oneLine(text) { return String(text).replace(/\s+/g, ' ').trim().slice(0, 200); }

/**
 * What the session-start hook does with the recorded state. Returns
 * `{ lines, spawn, stateChanges }`: `spawn` is the exact argv for `npx` or null.
 */
function decide(state, trust, now = Date.now()) {
  const lines = [];
  const stateChanges = {};
  let spawn = null;

  if (state.checkError && state.checkError !== state.checkErrorShown) {
    lines.push(`[passioncode] the daily update check failed: ${oneLine(state.checkError)} (log: ~/.passioncode/logs/probe.log).`);
    stateChanges.checkErrorShown = state.checkError;
  }

  const latest = typeof state.latest === 'string' && VERSION.test(state.latest) ? state.latest : null;
  if (state.published !== false && latest && state.installed && newer(latest, state.installed)) {
    const maintainers = Array.isArray(state.maintainers) ? state.maintainers : [];
    const trusted = new Set(trust);
    const untrusted = [...maintainers, ...(state.publisher ? [state.publisher] : [])].filter((m) => !trusted.has(m));
    if (!maintainers.length || !maintainers.every((m) => typeof m === 'string' && accountName(m) === m)
      || typeof state.publisher !== 'string' || !state.publisher || accountName(state.publisher) !== state.publisher) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read — not installing; see SECURITY.md.`);
    } else if (untrusted.length) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher — not installing; see SECURITY.md.`);
    } else {
      const auto = (state.config && state.config.auto) !== false;
      const runningAge = now - Date.parse(state.updatingSince);
      const running = Number.isFinite(runningAge) && runningAge >= 0 && runningAge < 10 * 60 * 1000;
      if (auto && !running) {
        spawn = ['--yes', `${PACKAGE}@${latest}`, 'update', '--quiet'];
        stateChanges.updatingSince = new Date(now).toISOString();
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}); updating in the background — it takes effect next session.`);
      } else if (!auto) {
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}): npx ${PACKAGE}@${latest} update`);
      }
    }
  }
  return { lines, spawn, stateChanges };
}

module.exports = { PACKAGE, OIDC_PUBLISHER, TRUST_FILE, accountName, parseView, recordProbe, loadTrust, newer, decide };
