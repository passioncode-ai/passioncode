'use strict';
/**
 * The decisions behind the self-update, kept apart from the processes that act on them.
 *
 * The package name on npm is the attack surface: whoever publishes `passioncode` gets
 * code run on every machine that has this plugin. So the probe records WHO published
 * the latest version, and the session-start hook installs it only when every npm
 * maintainer — and the account that published that version — is named in the trust
 * list shipped inside the plugin (`trust.json`). Anything else is reported, never run.
 *
 * Names alone trust whatever npm says they published. So the probe also records the version's
 * `dist.integrity`, the registry's signatures over it and its provenance attestation, and the
 * hook installs only a version whose signature verifies against an npm registry key pinned in
 * `trust.json` and that was built with SLSA provenance (published by CI, not from a laptop).
 */
const crypto = require('crypto');
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

/** The provenance npm records for a package built by a CI workflow with `--provenance` (release.yml). */
const PROVENANCE = 'https://slsa.dev/provenance/v1';
const INTEGRITY = /^sha512-[A-Za-z0-9+/]{86}==$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

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
 * Reads the answer of `npm view @passioncode-ai/passioncode version maintainers _npmUser dist --json`.
 * Returns what the probe records: `{ published: true, latest, maintainers, publisher }`,
 * `{ published: false }` for a name nobody has published (E404), or `{ checkError }`.
 */
function parseView(stdout, error) {
  let doc = null;
  try { doc = JSON.parse(String(stdout || '').trim()); } catch (_) { /* judged below */ }
  // npm 12 wraps a single-version answer in an array; ambiguous answers stay rejected.
  if (Array.isArray(doc) && doc.length === 1) doc = doc[0];
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
    verify: readDist(doc.dist),
  };
}

/**
 * What `dist` says about the bytes: their integrity, the registry's signatures over
 * `<name>@<version>:<integrity>` and the provenance attestation's type. Anything unreadable is
 * recorded as absent, so the hook refuses it; nothing here is trusted until decide() verifies it.
 */
function readDist(dist) {
  const d = dist && typeof dist === 'object' && !Array.isArray(dist) ? dist : {};
  const integrity = typeof d.integrity === 'string' && INTEGRITY.test(d.integrity) ? d.integrity : null;
  const signatures = (Array.isArray(d.signatures) ? d.signatures : [])
    .filter((x) => x && typeof x.keyid === 'string' && typeof x.sig === 'string' && x.keyid.length <= 200 && BASE64.test(x.sig) && x.sig.length <= 400)
    .slice(0, 8)
    .map((x) => ({ keyid: x.keyid, sig: x.sig }));
  const prov = d.attestations && typeof d.attestations === 'object' && d.attestations.provenance;
  const provenance = prov && typeof prov.predicateType === 'string' ? prov.predicateType.slice(0, 200) : null;
  return { integrity, signatures, provenance };
}

/** Applies a probe result to the state: every run replaces the previous answer whole. */
function recordProbe(state, result, now = new Date()) {
  const next = { ...state, checkedAt: now.toISOString() };
  for (const key of ['published', 'latest', 'maintainers', 'publisher', 'verify', 'checkError']) delete next[key];
  if (result.checkError) {
    next.checkError = result.checkError.slice(0, 200);
    return next;
  }
  delete next.checkErrorShown; // a later failure is news again
  next.published = result.published;
  if (result.published) Object.assign(next, { latest: result.latest, maintainers: result.maintainers, publisher: result.publisher, verify: result.verify });
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

/**
 * The npm registry keys pinned in the plugin (`npmRegistryKeys`: `{ keyid, key }`, the key as
 * base64 DER SPKI, as https://registry.npmjs.org/-/npm/v1/keys publishes it). Missing or damaged
 * means no signature can verify, so nothing is installed on its own.
 */
function loadRegistryKeys(file = TRUST_FILE) {
  try {
    const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
    return (Array.isArray(doc.npmRegistryKeys) ? doc.npmRegistryKeys : [])
      .filter((k) => k && typeof k.keyid === 'string' && typeof k.key === 'string' && BASE64.test(k.key))
      .map((k) => ({ keyid: k.keyid, key: k.key }));
  } catch (_) {
    return [];
  }
}

/** True when one of the recorded signatures over `<PACKAGE>@<version>:<integrity>` verifies with a pinned key. */
function registrySigned(version, verify, keys) {
  if (!verify || !verify.integrity || !Array.isArray(verify.signatures)) return false;
  const message = Buffer.from(`${PACKAGE}@${version}:${verify.integrity}`);
  return verify.signatures.some((s) => keys.some((k) => {
    if (!s || k.keyid !== s.keyid) return false;
    try {
      const key = crypto.createPublicKey({ key: Buffer.from(k.key, 'base64'), format: 'der', type: 'spki' });
      return crypto.verify('sha256', message, key, Buffer.from(String(s.sig), 'base64'));
    } catch (_) {
      return false;
    }
  }));
}

function newer(a, b) {
  const pa = String(a || '').split('.').map(Number);
  const pb = String(b || '').split('.').map(Number);
  for (let i = 0; i < 3; i += 1) { if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0); }
  return false;
}

/**
 * One probe at a time. The probe writes `checkedAt` only when npm answers (up to 30 s), so every
 * session that starts meanwhile saw a stale check and started its own `npm view`. The hook now
 * claims `probe.pending` with an exclusive create BEFORE it spawns; the probe removes it after it
 * has recorded. A marker older than PROBE_STALE_MS (or dated in the future) belongs to a probe
 * that died: it is moved aside atomically — so two hooks cannot both take it over — and claimed.
 */
const PROBE_MARKER = 'probe.pending';
const PROBE_STALE_MS = 5 * 60 * 1000;

function claimProbe(dir, now = Date.now()) {
  const file = path.join(dir, PROBE_MARKER);
  const create = () => { fs.writeFileSync(file, new Date(now).toISOString(), { flag: 'wx', mode: 0o600 }); return true; };
  try {
    fs.mkdirSync(dir, { recursive: true });
    return create();
  } catch (error) {
    if (error.code !== 'EEXIST') return false;
  }
  let age;
  try { age = now - fs.statSync(file).mtimeMs; } catch (_) { return false; } // just released: the next session checks
  if (age >= 0 && age < PROBE_STALE_MS) return false;
  const aside = `${file}.stale.${process.pid}`;
  try { fs.renameSync(file, aside); } catch (_) { return false; } // another hook took it over
  fs.rmSync(aside, { force: true });
  try { return create(); } catch (_) { return false; }
}

function releaseProbe(dir) {
  fs.rmSync(path.join(dir, PROBE_MARKER), { force: true });
}

function oneLine(text) { return String(text).replace(/\s+/g, ' ').trim().slice(0, 200); }

/**
 * What the session-start hook does with the recorded state. Returns
 * `{ lines, spawn, stateChanges }`: `spawn` is the exact argv for `npx` or null.
 */
function decide(state, trust, now = Date.now(), keys = []) {
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
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; see SECURITY.md.`);
    } else if (untrusted.length) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher, so it is not installed; see SECURITY.md.`);
    } else if (!state.verify || typeof state.verify !== 'object') {
      // Recorded by a probe older than this check: the hook starts a fresh probe (needsProbe); until it answers, nothing installs.
    } else if (!registrySigned(latest, state.verify, keys)) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but its registry signature does not verify against the npm key pinned in this plugin, so it is not installed; see SECURITY.md.`);
    } else if (state.verify.provenance !== PROVENANCE) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm without a build provenance attestation, so it is not installed; see SECURITY.md.`);
    } else {
      const auto = (state.config && state.config.auto) !== false;
      const runningAge = now - Date.parse(state.updatingSince);
      const running = Number.isFinite(runningAge) && runningAge >= 0 && runningAge < 10 * 60 * 1000;
      if (auto && !running) {
        spawn = ['--yes', `${PACKAGE}@${latest}`, 'update', '--quiet'];
        stateChanges.updatingSince = new Date(now).toISOString();
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}); updating in the background; it takes effect next session.`);
      } else if (!auto) {
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}): npx ${PACKAGE}@${latest} update`);
      }
    }
  }
  return { lines, spawn, stateChanges };
}

/** A state recorded by a probe older than the signature check (no `verify`) asks for a fresh probe. */
function needsProbe(state) {
  return state.published === true && typeof state.latest === 'string' && (!state.verify || typeof state.verify !== 'object');
}

module.exports = { PACKAGE, OIDC_PUBLISHER, PROVENANCE, TRUST_FILE, PROBE_MARKER, PROBE_STALE_MS, accountName, parseView, readDist, recordProbe, loadTrust, loadRegistryKeys, registrySigned, newer, decide, needsProbe, claimProbe, releaseProbe };
