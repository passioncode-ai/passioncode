'use strict';
/**
 * Latest releases of the PassionCode.ai apps, and an install that trusts no byte it has not
 * verified (ADR-0004): SHA256SUMS.asc against the bundled release key, the asset against both its
 * SHA256SUMS line and GitHub's digest, then the extracted app's Developer ID signature, team,
 * stapled notarization ticket and Gatekeeper assessment. A failure removes the download.
 */
const { spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const pgp = require('./openpgp');
const catalog = require('./catalog');

const API = () => (process.env.PASSIONCODE_GITHUB_API || 'https://api.github.com').replace(/\/$/, '');
const CACHE_TTL_MS = 30 * 60 * 1000;

function run(cmd, args, { timeout = 60000, input } = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout, input });
  if (r.error && r.error.code === 'ENOENT') return { code: 127, out: '', err: `${cmd} not found` };
  if (r.error && r.error.code === 'ETIMEDOUT') return { code: 124, out: r.stdout || '', err: `${cmd} timed out after ${Math.round(timeout / 1000)} s` };
  return { code: r.status === null ? 1 : r.status, out: r.stdout || '', err: r.stderr || '' };
}

async function getJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'passioncode-launcher' }, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`${url} answered HTTP ${res.status}`);
  return res.json();
}

/**
 * The newest published release of a product: `releases/latest` for stable products, the newest
 * non-draft release for one that ships prereleases only (Fabric). Cached for 30 minutes in
 * ~/.passioncode/releases-cache.json, because unauthenticated GitHub allows 60 calls an hour.
 */
async function latestRelease(product, { cacheFile = null, now = Date.now() } = {}) {
  let cache = {};
  if (cacheFile) { try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch (_) { cache = {}; } }
  const hit = cache[product.repo];
  if (hit && now - Date.parse(hit.at) < CACHE_TTL_MS && hit.release) return hit.release;
  let raw;
  if (product.prerelease) {
    const list = await getJson(`${API()}/repos/${product.repo}/releases?per_page=10`);
    raw = (Array.isArray(list) ? list : []).find((r) => !r.draft);
    if (!raw) throw new Error(`${product.repo} has no published release`);
  } else {
    raw = await getJson(`${API()}/repos/${product.repo}/releases/latest`);
  }
  const release = {
    tag: raw.tag_name, version: String(raw.tag_name || '').replace(/^v/, ''), prerelease: !!raw.prerelease, url: raw.html_url,
    assets: (raw.assets || []).map((a) => ({ name: a.name, url: a.browser_download_url, size: a.size, digest: a.digest || null })),
  };
  if (!/^\d+\.\d+\.\d+/.test(release.version)) throw new Error(`${product.repo}: unexpected tag ${raw.tag_name}`);
  if (cacheFile) {
    cache[product.repo] = { at: new Date(now).toISOString(), release };
    try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify(cache, null, 2)); } catch (_) { /* a cache only */ }
  }
  return release;
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': 'passioncode-launcher' }, redirect: 'follow', signal: AbortSignal.timeout(30 * 60 * 1000) });
  if (!res.ok || !res.body) throw new Error(`download ${url}: HTTP ${res.status}`);
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(dest, 'w');
  try {
    for await (const chunk of res.body) { hash.update(chunk); fs.writeSync(fd, chunk); }
  } finally { fs.closeSync(fd); }
  return hash.digest('hex');
}

/** Free bytes on the volume holding `dir` (df -k), or null when it cannot be read. */
function freeBytes(dir) {
  const r = run('df', ['-k', dir], { timeout: 10000 });
  const line = r.out.trim().split('\n').pop() || '';
  const cols = line.split(/\s+/);
  const kb = Number(cols[3]);
  return r.code === 0 && Number.isFinite(kb) ? kb * 1024 : null;
}

/** Checks of an app bundle on disk: Developer ID signature, the PassionCode.ai team, stapled ticket, Gatekeeper. */
function verifyApp(appDir, { gatekeeper = true } = {}) {
  const checks = [];
  const sig = run('codesign', ['--verify', '--strict', appDir], { timeout: 120000 });
  checks.push({ check: 'signature', ok: sig.code === 0, detail: sig.code === 0 ? 'codesign --verify --strict: valid' : (sig.err || sig.out).trim().split('\n')[0] });
  const info = run('codesign', ['-dv', appDir], { timeout: 30000 });
  const team = /TeamIdentifier=(\S+)/.exec(`${info.err}\n${info.out}`);
  checks.push({ check: 'team', ok: !!team && team[1] === catalog.TEAM_ID, detail: team ? `team ${team[1]}` : 'no team identifier' });
  const staple = run('xcrun', ['stapler', 'validate', appDir], { timeout: 60000 });
  checks.push({ check: 'notarization', ok: staple.code === 0, detail: staple.code === 0 ? 'notarization ticket stapled' : (staple.err || staple.out || 'stapler validate failed').trim().split('\n').pop() });
  if (gatekeeper) {
    const gk = run('spctl', ['--assess', '--type', 'execute', '-vv', appDir], { timeout: 120000 });
    const text = `${gk.err}\n${gk.out}`;
    checks.push({ check: 'gatekeeper', ok: gk.code === 0 && /source=Notarized Developer ID/.test(text), detail: gk.code === 124 ? gk.err : (/source=([^\n]+)/.exec(text) || [null, text.trim().split('\n')[0] || 'rejected'])[1] });
  }
  return { ok: checks.every((c) => c.ok), checks };
}

/** Whether an app bundle has a process running from it (pgrep; reads only). */
function isRunning(appDir) {
  return run('pgrep', ['-f', `${appDir}/Contents/MacOS/`], { timeout: 5000 }).code === 0;
}

/** CFBundleShortVersionString of an installed app, or null. */
function appVersion(appDir) {
  const r = run('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', path.join(appDir, 'Contents', 'Info.plist')], { timeout: 10000 });
  const v = r.out.trim();
  return r.code === 0 && v ? v : null;
}

/**
 * Download, verify and install one absent app into the applications folder. `report(step)` gets
 * each stage. Throws with the first failed check; the working directory is always removed.
 */
async function installApp(product, release, { work, report = () => {}, replace = false, home = os.homedir() }) {
  const target = catalog.appPath(product);
  if (fs.existsSync(target) && !replace) throw new Error(`${target} already exists`);
  if (fs.existsSync(target) && isRunning(target)) throw new Error(`${product.name} is running; quit it first`);
  const assetName = product.asset(release.version);
  const asset = release.assets.find((a) => a.name === assetName);
  const sums = release.assets.find((a) => a.name === 'SHA256SUMS');
  const sig = release.assets.find((a) => a.name === 'SHA256SUMS.asc');
  if (!asset) throw new Error(`${release.tag} has no ${assetName}`);
  if (!sums || !sig) throw new Error(`${release.tag} publishes no signed SHA256SUMS; nothing unsigned is installed`);
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(work, { recursive: true });
  try {
    const free = freeBytes(work);
    const need = (asset.size || 0) * 3;
    if (free !== null && asset.size && free < need) throw new Error(`not enough disk: ${Math.round(free / 1e6)} MB free, about ${Math.round(need / 1e6)} MB needed to download and unpack ${assetName}`);
    const sumsFile = path.join(work, 'SHA256SUMS');
    await download(sums.url, sumsFile);
    await download(sig.url, path.join(work, 'SHA256SUMS.asc'));
    const verdict = pgp.verifyDetached(fs.readFileSync(sumsFile), fs.readFileSync(path.join(work, 'SHA256SUMS.asc'), 'utf8'));
    if (!verdict.ok) throw new Error(`SHA256SUMS signature: ${verdict.reason}`);
    report({ kind: 'verify', detail: `SHA256SUMS of ${release.tag} signed by the PassionCode.ai release key ${pgp.RELEASE_KEY_FINGERPRINT.slice(-16)}` });
    const listed = pgp.parseSums(fs.readFileSync(sumsFile, 'utf8')).get(assetName);
    if (!listed) throw new Error(`SHA256SUMS does not list ${assetName}`);
    const file = path.join(work, assetName);
    const got = await download(asset.url, file);
    if (got !== listed) throw new Error(`${assetName}: SHA-256 ${got} is not the signed ${listed}`);
    if (asset.digest && asset.digest !== `sha256:${got}`) throw new Error(`${assetName}: GitHub's digest ${asset.digest} differs from the download`);
    report({ kind: 'verify', detail: `${assetName}: SHA-256 matches the signed SHA256SUMS${asset.digest ? ' and GitHub\'s digest' : ''}` });
    const unpacked = path.join(work, 'unpacked');
    fs.mkdirSync(unpacked);
    let mount = null;
    try {
      let source;
      if (assetName.endsWith('.dmg')) {
        mount = path.join(work, 'mount');
        fs.mkdirSync(mount);
        const a = run('hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-mountpoint', mount, file], { timeout: 300000 });
        if (a.code !== 0) { mount = null; throw new Error(`hdiutil attach: ${(a.err || a.out).trim()}`); }
        source = path.join(mount, product.app);
      } else {
        const x = run('ditto', ['-x', '-k', file, unpacked], { timeout: 600000 });
        if (x.code !== 0) throw new Error(`ditto -x: ${(x.err || x.out).trim()}`);
        source = path.join(unpacked, product.app);
      }
      if (!fs.existsSync(source)) throw new Error(`${assetName} holds no ${product.app}`);
      const app = verifyApp(source);
      for (const c of app.checks) report({ kind: 'verify', detail: `${product.app}: ${c.check} — ${c.detail}`, ok: c.ok });
      if (!app.ok) throw new Error(`${product.app} failed ${app.checks.filter((c) => !c.ok).map((c) => c.check).join(', ')}; nothing was installed`);
      // The bundle it replaces goes to the person's Trash, never deleted, and comes back if the copy fails.
      let previous = null;
      if (fs.existsSync(target)) {
        const trash = path.join(home, '.Trash');
        fs.mkdirSync(trash, { recursive: true });
        previous = path.join(trash, `${product.app.replace(/\.app$/, '')} ${appVersion(target) || 'old'} ${new Date().toISOString().replace(/[:.]/g, '-')}.app`);
        fs.renameSync(target, previous);
        report({ kind: 'trash', detail: `moved ${product.name} ${appVersion(previous) || ''} to ${previous}`.replace('  ', ' ') });
      }
      const c = run('ditto', [source, target], { timeout: 600000 });
      if (c.code !== 0) {
        fs.rmSync(target, { recursive: true, force: true }); // only the partial copy just made
        if (previous) fs.renameSync(previous, target);
        throw new Error(`copy to ${target}: ${(c.err || c.out).trim()}`);
      }
      return { path: target, version: release.version, replaced: previous };
    } finally {
      if (mount) run('hdiutil', ['detach', mount, '-quiet'], { timeout: 120000 });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

module.exports = { latestRelease, installApp, verifyApp, appVersion, isRunning, freeBytes, run, download, API };
