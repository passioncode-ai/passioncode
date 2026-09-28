// Builds payload/: one Claude Code marketplace holding every member plugin,
// taken from each member's repository at a pinned ref with `git archive` — the
// committed bytes, never a working tree. Also the source of the hub copies the
// launcher links for every other agent.
//
//   node scripts/vendor.mjs              refs may be branches (development)
//   node scripts/vendor.mjs --release    every ref must be a tag; refuses otherwise
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

function extract(checkout, ref, sub, into) {
  fs.mkdirSync(into, { recursive: true });
  const tar = execFileSync('git', ['-C', checkout, 'archive', '--format=tar', ref, sub], { maxBuffer: 256 * 1024 * 1024 });
  execFileSync('tar', ['-xf', '-', '-C', into], { input: tar });
  return path.join(into, sub);
}

const skillsIn = (pluginDir) => {
  const dir = path.join(pluginDir, 'skills');
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.existsSync(path.join(dir, n, 'SKILL.md'))).sort() : [];
};

export function build({ release = false, out = path.join(root, 'payload') } = {}) {
  const family = JSON.parse(fs.readFileSync(path.join(root, 'family.json'), 'utf8'));
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-vendor-'));
  const stage = path.join(temp, 'payload');
  fs.mkdirSync(path.join(stage, 'plugins'), { recursive: true });
  const members = [];
  try {
    for (const m of family.members) {
      const dest = path.join(stage, 'plugins', m.name);
      let commit = null;
      let version;
      if (m.kind === 'self') {
        fs.cpSync(path.join(root, m.path), dest, { recursive: true });
        version = pkg.version;
        const manifest = path.join(dest, '.claude-plugin/plugin.json');
        const doc = JSON.parse(fs.readFileSync(manifest, 'utf8'));
        fs.writeFileSync(manifest, JSON.stringify({ ...doc, version }, null, 2) + '\n');
      } else {
        const checkout = expand(m.checkout);
        if (release) {
          const tags = git(checkout, 'tag', '--points-at', m.ref).trim();
          const isTag = git(checkout, 'show-ref', '--tags', m.ref).trim();
          if (!isTag && !tags.split('\n').includes(m.ref)) throw new Error(`${m.name}: ref ${m.ref} is not a tag; a release vendors tagged bytes only.`);
        }
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
            $schema: 'https://json.schemastore.org/claude-code-plugin.json', name: m.name, version, description: m.description,
            author: { name: 'PassionCode.ai', url: 'https://passioncode.ai/' }, homepage: `https://github.com/${m.repo}`, license: 'MIT',
          }, null, 2) + '\n');
        }
      }
      for (const junk of ['__pycache__', '.DS_Store']) fs.rmSync(path.join(dest, junk), { recursive: true, force: true });
      members.push({ name: m.name, repo: m.repo ?? `${family.owner}/passioncode`, ref: m.ref ?? `v${pkg.version}`, commit, version, skills: skillsIn(dest), legacyPluginIds: m.legacyPluginIds ?? [], contentHash: treeHash(dest), description: m.description });
    }
    const hits = scanForSecrets(stage);
    if (hits.length) throw new Error(`Refusing to vendor: credential-shaped strings found:\n  ${hits.join('\n  ')}`);
    fs.mkdirSync(path.join(stage, '.claude-plugin'), { recursive: true });
    fs.writeFileSync(path.join(stage, '.claude-plugin/marketplace.json'), JSON.stringify({
      $schema: 'https://anthropic.com/claude-code/marketplace.schema.json', name: family.name,
      owner: { name: family.displayName, url: 'https://passioncode.ai/' }, description: family.description,
      plugins: members.map((m) => ({ name: m.name, source: `./plugins/${m.name}`, version: m.version, description: m.description ?? JSON.parse(fs.readFileSync(path.join(stage, 'plugins', m.name, '.claude-plugin/plugin.json'), 'utf8')).description, license: 'MIT' })),
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
    const { out, members } = build({ release: process.argv.includes('--release') });
    for (const m of members) console.log(`${m.name.padEnd(22)} ${String(m.version).padEnd(8)} ${m.ref}${m.commit ? ' @ ' + m.commit.slice(0, 12) : ''}  skills: ${m.skills.join(', ') || '—'}`);
    console.log(`payload written to ${path.relative(root, out)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
