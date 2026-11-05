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
 * `trust.json` and that carries an SLSA provenance attestation (its builder is not checked here;
 * npm validated the attestation at publish time). The probe and the update ask registry.npmjs.org
 * itself, whatever registry the person's npm uses, because the pinned key only speaks for it.
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
const REGISTRY = 'https://registry.npmjs.org';
// npm prefers a registry set for the scope (`@passioncode-ai:registry` in .npmrc) over `--registry`: pin both.
// `--workspaces=false` keeps npm from walking up from the run folder to a monorepo root that lists it.
const REGISTRY_ARGS = [`--registry=${REGISTRY}`, `--${PACKAGE.split('/')[0]}:registry=${REGISTRY}`, '--workspaces=false'];
// The refusal reasons as a person reads them; bin/passioncode.js says them the same way in `status`.
const REFUSED = { registry_signature: 'its signature does not verify', provenance: 'no build provenance', untrusted_publisher: 'its publisher is not trusted', unreadable_publisher: 'its publisher could not be read' };
const SECURITY_URL = 'https://github.com/passioncode-ai/passioncode/blob/main/SECURITY.md#the-self-update-and-who-it-trusts';
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
    verify: { ...readDist(doc.dist), version: latest },
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
  // verify carries the check's time: an older plugin's probe that rewrites the accounts keeps it, and then it no longer matches.
  if (result.published) Object.assign(next, { latest: result.latest, maintainers: result.maintainers, publisher: result.publisher, verify: { ...result.verify, checkedAt: next.checkedAt } });
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
      .filter((k) => k && typeof k.keyid === 'string' && k.keyid && typeof k.key === 'string' && BASE64.test(k.key))
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
      // npm signs with ECDSA P-256; a pinned key of any other kind verifies nothing.
      if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails.namedCurve !== 'prime256v1') return false;
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
function decide(state, trust, now = Date.now(), keys = [], nodeDir = path.dirname(process.execPath)) {
  const lines = [];
  const stateChanges = {};
  const events = [];
  let spawn = null;
  // A refusal goes into the update log once per version and reason, not at every session start (LC-16).
  // A refused version must not be reached through `@latest` either: point the person at what they have.
  const keep = () => (typeof state.installed === 'string' && VERSION.test(state.installed)
    ? `keep using ${state.installed} (npx ${PACKAGE}@${state.installed}, not @latest) and see ${SECURITY_URL}.`
    : `see ${SECURITY_URL}.`);
  let refused = false;
  const refuse = (reason) => {
    refused = true;
    const key = `${state.latest} ${reason}`;
    if (state.refusalLogged === key) return;
    stateChanges.refusalLogged = key;
    events.push({ event: 'update_check', outcome: 'signature_failed', reason });
  };

  if (state.checkError && state.checkError !== state.checkErrorShown) {
    lines.push(state.checkError === NPM_MISSING ? npmMissingLine(nodeDir)
      : `[passioncode] the daily update check failed: ${oneLine(state.checkError)} (log: ~/.passioncode/logs/probe.log).`);
    stateChanges.checkErrorShown = state.checkError;
  }

  const latest = typeof state.latest === 'string' && VERSION.test(state.latest) ? state.latest : null;
  // The last check failed (no latest known) while an earlier refusal stands: say so at every session, as the refusal itself was.
  const standing = typeof state.refusalLogged === 'string' ? state.refusalLogged.split(' ') : [];
  if (!latest && state.checkError && standing.length === 2 && VERSION.test(standing[0]) && state.installed && newer(standing[0], state.installed)) {
    refused = true;
    lines.push(`[passioncode] ${PACKAGE}@${standing[0]} was not installed (${REFUSED[standing[1]] || 'refused'}) and the last check could not tell whether that changed; ${keep()}`);
  }
  if (state.published !== false && latest && state.installed && newer(latest, state.installed)) {
    const maintainers = Array.isArray(state.maintainers) ? state.maintainers : [];
    const trusted = new Set(trust);
    const untrusted = [...maintainers, ...(state.publisher ? [state.publisher] : [])].filter((m) => !trusted.has(m));
    if (!maintainers.length || !maintainers.every((m) => typeof m === 'string' && accountName(m) === m)
      || typeof state.publisher !== 'string' || !state.publisher || accountName(state.publisher) !== state.publisher) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; ${keep()}`);
      refuse('unreadable_publisher');
    } else if (untrusted.length) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher, so it is not installed; ${keep()}`);
      refuse('untrusted_publisher');
    } else if (!verifiedFor(state)) {
      // Recorded by an older probe, or for another version: the hook starts a fresh probe (needsProbe); until it answers, nothing installs.
    } else if (!registrySigned(latest, state.verify, keys)) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm but its registry signature does not verify against the npm key pinned in this plugin, so it is not installed; ${keep()}`);
      refuse('registry_signature');
    } else if (state.verify.provenance !== PROVENANCE) {
      lines.push(`[passioncode] ${PACKAGE}@${latest} is on npm without a build provenance attestation, so it is not installed; ${keep()}`);
      refuse('provenance');
    } else {
      const auto = (state.config && state.config.auto) !== false;
      const runningAge = now - Date.parse(state.updatingSince);
      const running = Number.isFinite(runningAge) && runningAge >= 0 && runningAge < 10 * 60 * 1000;
      if (auto && !running) {
        spawn = ['--yes', ...REGISTRY_ARGS, `${PACKAGE}@${latest}`, 'update', '--quiet'];
        stateChanges.updatingSince = new Date(now).toISOString();
        events.push({ event: 'update_download', outcome: 'started' });
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}); updating in the background; it takes effect next session.`);
      } else if (!auto) {
        lines.push(`[passioncode] ${latest} is out (you have ${state.installed}): npx ${REGISTRY_ARGS.join(' ')} ${PACKAGE}@${latest} update`);
      }
    }
  }
  // A version that now passes every check (or is no longer newer) is not refused any more: forget the old refusal.
  // A failed check (no latest known) forgets nothing: the next answer is most likely the same refused version.
  if (!refused && state.refusalLogged && (spawn || lines.some((l) => l.includes(' is out (you have ')) || (latest && !(state.installed && newer(latest, state.installed))))) {
    stateChanges.refusalLogged = null;
  }
  return { lines, spawn, stateChanges, events, refused };
}

/**
 * The `update_check` event a probe's record is worth (LC-16): `check_failed` every time, `ready` or
 * `current` only when it differs from the last one logged (`lastCheckEvent`), so a quiet day adds one
 * line, not one per check. Returns `{ outcome, key }` or null.
 */
function checkEvent(state) {
  if (state.checkError) return { outcome: 'check_failed', key: 'check_failed' };
  if (state.published !== true) return null;
  const outcome = state.installed && newer(state.latest, state.installed) ? 'ready' : 'current';
  const key = `${outcome} ${state.latest}`;
  return state.lastCheckEvent === key ? null : { outcome, key };
}

/** The recorded signature data belongs to the recorded latest version (an older plugin's probe may have kept another's). */
function verifiedFor(state) {
  return Boolean(state.verify) && typeof state.verify === 'object' && !Array.isArray(state.verify) && state.verify.version === state.latest
    // No released probe wrote a verify without the stamp; the allowance only keeps hand-written records (tests) readable.
    && (state.verify.checkedAt === undefined || state.verify.checkedAt === state.checkedAt);
}

/** A state recorded by a probe older than the signature check, or by an older plugin since, asks for a fresh probe. */
function needsProbe(state) {
  return state.published === true && typeof state.latest === 'string' && !verifiedFor(state);
}

/**
 * How a hook starts npm's `npm` or `npx` (PC-135). On Windows both are `.cmd` files, which a spawn without a shell
 * cannot start, and a shell would re-read every argument: so this runs npm's own script, which npm ships beside the
 * Node that runs the hook, through that Node. Anywhere else, and when that script is not there, the command by name.
 * `PASSIONCODE_NPM` and `PASSIONCODE_NPX` name a stand-in for tests (a `.js` one runs through this Node).
 */
function npmCommand(name, { env = process.env, platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  const stand = env[`PASSIONCODE_${name.toUpperCase()}`];
  if (stand) return /\.[cm]?js$/.test(stand) ? [execPath, [stand]] : [stand, []];
  if (platform === 'win32') {
    const cli = path.win32.join(path.win32.dirname(execPath), 'node_modules', 'npm', 'bin', `${name}-cli.js`);
    if (exists(cli)) return [execPath, [cli]];
  }
  return [name, []];
}

/**
 * On Windows the name alone cannot start npm's `.cmd` files, so with no npm beside the Node that runs the hooks (and no
 * stand-in) they can neither check for updates nor start one, and no PATH change for npx helps (PC-143). Returns that
 * Node's folder, or null when npm can be started.
 */
function npmMissing(name, { env = process.env, platform = process.platform, execPath = process.execPath, exists = fs.existsSync } = {}) {
  if (platform !== 'win32' || env[`PASSIONCODE_${name.toUpperCase()}`]) return null;
  return npmCommand(name, { env, platform, execPath, exists })[1].length ? null : path.win32.dirname(execPath);
}
/** The `checkError` the probe records when it finds no npm to start (PC-143). */
const NPM_MISSING = 'npm-missing';
/** The session line for it: the lasting fixes first, then, when a verified version is known, the pinned manual update. */
function npmMissingLine(nodeDir, latest) {
  const now = latest && VERSION.test(latest)
    ? ` To update now, run in a terminal where npx works: npx --yes ${REGISTRY_ARGS.join(' ')} ${PACKAGE}@${latest} update`
    : '';
  return `[passioncode] there is no npm beside the Node in ${nodeDir}, so automatic updates cannot be checked or installed; reinstall that Node.js with npm (with the tool that installed it), or put a Node.js that has npm first on PATH, then start Claude Code again: the next session checks again.${now}`;
}

module.exports = { npmCommand, npmMissing, NPM_MISSING, npmMissingLine, PACKAGE, OIDC_PUBLISHER, PROVENANCE, REGISTRY, REGISTRY_ARGS, SECURITY_URL, verifiedFor, TRUST_FILE, PROBE_MARKER, PROBE_STALE_MS, accountName, parseView, readDist, recordProbe, loadTrust, loadRegistryKeys, registrySigned, newer, decide, checkEvent, needsProbe, claimProbe, releaseProbe };
