// Builds payload/: one Claude Code marketplace holding every member plugin,
// taken from each member's repository at a pinned ref with `git archive` — the
// committed bytes, never a working tree. Also the source of the hub copies the
// launcher links for every other agent.
//
//   node scripts/vendor.mjs              refs may be branches (development)
//   node scripts/vendor.mjs --release    every ref must be a tag; refuses otherwise
//   node scripts/vendor.mjs --clone      ignore local checkouts; shallow-clone every member
//
// A member is read from its `checkout` when that directory exists, and otherwise
// from a shallow clone of `repo` at `ref` over SSH (`git@github.com:<repo>.git`,
// the contributor's own key — members may be private). PASSIONCODE_VENDOR_CLONE=1
// is the same as --clone; PASSIONCODE_GIT_BASE replaces `git@github.com:`.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGIN_SCHEMA = 'https://json.schemastore.org/claude-code-plugin-manifest.json';
export const MARKETPLACE_SCHEMA = 'https://json.schemastore.org/claude-code-marketplace.json';
const AUTHOR = { name: 'PassionCode.ai', url: 'https://passioncode.ai/' };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const expand = (p) => (p.startsWith('~/') ? path.join(os.homedir(), p.slice(2)) : p);
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });

// Credential shapes that must never ship in a public tarball.
export const SECRET_PATTERNS = [
  /\bsk-(?:or-|ant-|proj-)?[A-Za-z0-9_-]{20,}/, /\blin_api_[A-Za-z0-9]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{30,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /\bAKIA[0-9A-Z]{16}\b/,
];

export function scanForSecrets(dir) {
  const hits = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (fs.statSync(p).size < 2 * 1024 * 1024) {
        const text = fs.readFileSync(p, 'utf8');
        for (const re of SECRET_PATTERNS) if (re.test(text)) hits.push(`${path.relative(dir, p)} matches ${re}`);
      }
    }
  };
  walk(dir);
  return hits;
}

function treeHash(dir) {
  const h = createHash('sha256');
  const walk = (d) => {
    for (const name of fs.readdirSync(d).sort()) {
      const p = path.join(d, name);
      const rel = path.relative(dir, p);
      if (fs.statSync(p).isDirectory()) { h.update(`d:${rel}\n`); walk(p); }
      else { h.update(`f:${rel}\n`); h.update(fs.readFileSync(p)); }
    }
  };
  walk(dir);
  return `sha256:${h.digest('hex')}`;
}

function isTag(repo, ref) {
  try { git(repo, 'rev-parse', '--verify', '--quiet', `refs/tags/${ref}`); return true; } catch (_) { return false; }
}

function extract(checkout, ref, sub, into) {
  fs.mkdirSync(into, { recursive: true });
  const tar = execFileSync('git', ['-C', checkout, 'archive', '--format=tar', ref, sub], { maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', into], { input: tar });
  return path.join(into, sub);
}

/** Where a member's bytes are read from: its checkout, or a shallow clone of its repo at ref. */
function memberRepo(m, { clone, gitBase, temp }) {
  const checkout = m.checkout ? expand(m.checkout) : null;
  if (!clone && checkout && fs.existsSync(path.join(checkout, '.git'))) return { dir: checkout, via: 'checkout' };
  if (!m.repo || !m.ref) throw new Error(`${m.name}: no checkout at ${m.checkout ?? '(none)'} and no repo/ref to clone.`);
  const dir = path.join(temp, 'clones', m.name);
  const url = `${gitBase}${m.repo}.git`;
  try {
    execFileSync('git', ['clone', '--quiet', '--depth', '1', '--branch', m.ref, url, dir], { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' });
  } catch (error) {
    throw new Error(`${m.name}: could not clone ${url} at ${m.ref}: ${String(error.stderr || error.message).trim()}`);
  }
  return { dir, via: `clone of ${url}` };
}

/** The self plugin's trust list must ship, and must be a list of npm account names. */
function checkTrust(pluginDir) {
  const file = path.join(pluginDir, 'trust.json');
  let doc;
  try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (error) { throw new Error(`passioncode: ${file} is missing or not JSON (${error.message}); the self-update refuses to run without it.`); }
  if (!Array.isArray(doc.npmPublishers) || !doc.npmPublishers.every((n) => typeof n === 'string' && /^[a-z0-9][a-z0-9._-]*$/.test(n))) {
    throw new Error(`passioncode: ${file} must hold "npmPublishers": a list of lowercase npm account names.`);
  }
  return doc.npmPublishers;
}

const skillsIn = (pluginDir) => {
  const dir = path.join(pluginDir, 'skills');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md'))).sort() : [];
};

export function build({
  release = false,
  root: base = root,
  out = path.join(base, 'payload'),
  clone = process.env.PASSIONCODE_VENDOR_CLONE === '1',
  gitBase = process.env.PASSIONCODE_GIT_BASE || 'git@github.com:',
} = {}) {
  const family = JSON.parse(fs.readFileSync(path.join(base, 'family.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json'), 'utf8'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-vendor-'));
  const stage = path.join(temp, 'payload');
  fs.mkdirSync(path.join(stage, 'plugins'), { recursive: true });
  const members = [];
  try {
    for (const m of family.members) {
      const dest = path.join(stage, 'plugins', m.name);
      let commit = null;
      let version;
      let via = 'this repository';
      if (m.kind === 'self') {
        fs.cpSync(path.join(base, m.path), dest, { recursive: true });
        checkTrust(dest);
        version = pkg.version;
        const manifest = path.join(dest, '.claude-plugin/plugin.json');
        const doc = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        fs.writeFileSync(manifest, JSON.stringify({ ...doc, $schema: PLUGIN_SCHEMA, version }, null, 2) + '\n');
      } else {
        const repo = memberRepo(m, { clone, gitBase, temp });
        const checkout = repo.dir;
        via = repo.via;
        if (release && !isTag(checkout, m.ref)) throw new Error(`${m.name}: ref ${m.ref} is not a tag; a release vendors tagged bytes only.`);
        commit = git(checkout, 'rev-parse', `${m.ref}^{commit}`).trim();
        const src = extract(checkout, m.ref, m.path, path.join(temp, 'src', m.name));
        if (m.kind === 'plugin') {
          fs.cpSync(src, dest, { recursive: true });
          version = JSON.parse(fs.readFileSync(path.join(dest, '.claude-plugin/plugin.json'), 'utf8')).version;
        } else {
          for (const skill of m.skills) {
            const s = path.join(src, skill);
            if (!fs.existsSync(path.join(s, 'SKILL.md'))) throw new Error(`${m.name}: ${m.path}/${skill}/SKILL.md is missing at ${m.ref}.`);
            fs.cpSync(s, path.join(dest, 'skills', skill), { recursive: true });
          }
          version = m.version;
          fs.mkdirSync(path.join(dest, '.claude-plugin'), { recursive: true });
          fs.writeFileSync(path.join(dest, '.claude-plugin/plugin.json'), JSON.stringify({
            $schema: PLUGIN_SCHEMA, name: m.name, ...(m.displayName ? { displayName: m.displayName } : {}), version, description: m.description,
            author: AUTHOR, homepage: `https://github.com/${m.repo}`, license: 'MIT',
          }, null, 2) + '\n');
        }
      }
      for (const junk of ['__pycache__', '.DS_Store']) fs.rmSync(path.join(dest, junk), { recursive: true, force: true });
      const plugin = JSON.parse(fs.readFileSync(path.join(dest, '.claude-plugin/plugin.json'), 'utf8'));
      members.push({
        name: m.name, displayName: m.displayName ?? plugin.displayName ?? m.name, repo: m.repo ?? `${family.owner}/passioncode`, ref: m.ref ?? `v${pkg.version}`, commit, version, via,
        skills: skillsIn(dest), legacyPluginIds: m.legacyPluginIds ?? [], legacyMarketplaces: m.legacyMarketplaces ?? [], contentHash: treeHash(dest),
        description: m.description ?? plugin.description, author: m.author ?? (plugin.author && plugin.author.name ? plugin.author : AUTHOR),
      });
    }
    const hits = scanForSecrets(stage);
    if (hits.length) throw new Error(`Refusing to vendor: credential-shaped strings found:\n  ${hits.join('\n  ')}`);
    fs.mkdirSync(path.join(stage, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(stage, '.claude-plugin/marketplace.json'), JSON.stringify({
      $schema: MARKETPLACE_SCHEMA, name: family.name,
      owner: { name: family.displayName, url: 'https://passioncode.ai/' }, description: family.description,
      plugins: members.map((m) => ({ name: m.name, displayName: m.displayName, source: `./plugins/${m.name}`, version: m.version, description: m.description, author: m.author, license: 'MIT' })),
    }, null, 2) + '\n');
    fs.writeFileSync(path.join(stage, 'manifest.json'), JSON.stringify({ family: family.name, version: pkg.version, release, members }, null, 2) + '\n');
    fs.rmSync(out, { recursive: true, force: true });
    fs.cpSync(stage, out, { recursive: true });
    return { out, members };
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    const { out, members } = build({ release: process.argv.includes('--release'), ...(process.argv.includes('--clone') ? { clone: true } : {}) });
    for (const m of members) console.log(`${m.name.padEnd(22)} ${String(m.version).padEnd(8)} ${m.ref}${m.commit ? ' @ ' + m.commit.slice(0, 12) : ''}  from ${m.via}  skills: ${m.skills.join(', ') || '—'}`);
    console.log(`payload written to ${path.relative(root, out)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
