'use strict';
// scripts/vendor.mjs against a throwaway repository root: a member that lives only
// in a (local, bare) remote, and the self plugin copied from this repository.
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const vendor = () => import(pathToFileURL(path.join(ROOT, 'scripts/vendor.mjs')).href);
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'init.defaultBranch=main', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...args], { cwd, encoding: 'utf8' }).trim();

function writePlugin(dir, version) {
  fs.mkdirSync(path.join(dir, '.claude-plugin'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'member', version, description: 'A member plugin.', license: 'Apache-2.0' }));
  fs.mkdirSync(path.join(dir, 'skills/using-member'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/using-member/SKILL.md'), `---\nname: using-member\n---\n${version}\n`);
}

/** A member repository with a tag v1.0.0 and a later untagged commit, pushed to a bare remote. */
function fixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-vendor-'));
  const work = path.join(base, 'work');
  fs.mkdirSync(work);
  git(work, 'init', '--quiet');
  writePlugin(path.join(work, 'plugins/member'), '1.0.0');
  git(work, 'add', '-A');
  git(work, 'commit', '--quiet', '-m', 'v1.0.0');
  git(work, 'tag', 'v1.0.0');
  // The same bytes under the tag of another product's release (a monorepo carrying the plugin).
  git(work, 'tag', 'v0.9.0');
  const tagged = git(work, 'rev-parse', 'HEAD');
  writePlugin(path.join(work, 'plugins/member'), '1.1.0-dev');
  git(work, 'commit', '--quiet', '-am', 'work in progress');
  const remotes = path.join(base, 'remotes');
  fs.mkdirSync(path.join(remotes, 'example-org'), { recursive: true });
  git(base, 'clone', '--quiet', '--bare', work, path.join(remotes, 'example-org/member.git'));

  const root = path.join(base, 'root');
  fs.mkdirSync(root);
  fs.cpSync(path.join(ROOT, 'plugin'), path.join(root, 'plugin'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'package.json'), path.join(root, 'package.json'));
  const family = (member) => fs.writeFileSync(path.join(root, 'family.json'), JSON.stringify({
    name: 'passioncode', owner: 'passioncode-ai', displayName: 'PassionCode.ai', description: 'test family',
    members: [
      { name: 'member', displayName: 'Member', repo: 'example-org/member', ref: 'v1.0.0', kind: 'plugin', path: 'plugins/member', legacyPluginIds: ['member@member'], legacyMarketplaces: ['member'], ...member },
      { name: 'passioncode', displayName: 'PassionCode.ai', kind: 'self', path: 'plugin/passioncode', description: 'self' },
    ],
  }));
  family({});
  return { base, work, root, remotes, tagged, family, gitBase: `${pathToFileURL(remotes).href}/`, out: path.join(base, 'payload') };
}

test('vendor falls back to a shallow clone of the member repository at its tag when the checkout is absent', async () => {
  const { build, PLUGIN_SCHEMA, MARKETPLACE_SCHEMA } = await vendor();
  const f = fixture();
  const { members } = build({ release: true, root: f.root, out: f.out, gitBase: f.gitBase, env: {} });
  const member = members.find((m) => m.name === 'member');
  assert.equal(member.commit, f.tagged, 'the tagged commit, not the newer work');
  assert.equal(member.version, '1.0.0');
  assert.match(member.via, /^clone of file:/);
  assert.deepEqual(member.legacyMarketplaces, ['member']);
  assert.equal(fs.readFileSync(path.join(f.out, 'plugins/member/skills/using-member/SKILL.md'), 'utf8').trim().split('\n').pop(), '1.0.0');

  const market = JSON.parse(fs.readFileSync(path.join(f.out, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.equal(market.$schema, MARKETPLACE_SCHEMA);
  for (const entry of market.plugins) {
    assert.ok(entry.displayName, `${entry.name} has a displayName`);
    assert.ok(entry.author && entry.author.name, `${entry.name} has an author`);
  }
  assert.deepEqual(market.plugins.map((p) => p.displayName), ['Member', 'PassionCode.ai']);

  const self = JSON.parse(fs.readFileSync(path.join(f.out, 'plugins/passioncode/.claude-plugin/plugin.json'), 'utf8'));
  assert.equal(self.$schema, PLUGIN_SCHEMA);
  assert.equal(self.version, JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.out, 'plugins/passioncode/trust.json'), 'utf8')).npmPublishers,
    JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/passioncode/trust.json'), 'utf8')).npmPublishers, 'the trust list ships in the payload');
  assert.ok(fs.existsSync(path.join(f.out, 'plugins/passioncode/hooks/update-check.js')));
  const manifest = JSON.parse(fs.readFileSync(path.join(f.out, 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.members.find((m) => m.name === 'member').legacyMarketplaces, ['member'], 'the launcher learns the legacy marketplaces');
});

test('a local clone is used only when the environment names one; clone mode ignores it', async () => {
  const { build, checkoutVar } = await vendor();
  const f = fixture();
  const opts = (env, extra = {}) => ({ root: f.root, out: f.out, gitBase: f.gitBase, env, ...extra });
  assert.match(build(opts({})).members[0].via, /^clone of /, 'no environment: the member repository at its tag');
  assert.equal(checkoutVar('observatory-log'), 'PASSIONCODE_CHECKOUT_OBSERVATORY_LOG');
  assert.equal(build(opts({ [checkoutVar('member')]: f.work })).members[0].via, 'checkout', 'a per-member path');
  const clones = path.join(f.base, 'clones-root');
  fs.mkdirSync(clones);
  fs.symlinkSync(f.work, path.join(clones, 'member')); // <root>/<repo name>
  assert.equal(build(opts({ PASSIONCODE_CHECKOUT_ROOT: clones })).members[0].via, 'checkout', 'a root of clones named like their repositories');
  assert.equal(build(opts({ PASSIONCODE_CHECKOUT_ROOT: clones, [checkoutVar('member')]: path.join(f.base, 'nowhere') })).members[0].via.startsWith('clone of '), true, 'a named clone that does not exist falls back to cloning, not to the root');
  assert.match(build(opts({ PASSIONCODE_CHECKOUT_ROOT: clones }, { clone: true })).members[0].via, /^clone of /, 'clone mode ignores local clones');
});

test('family.json carries no machine paths', async () => {
  const { build } = await vendor();
  assert.ok(JSON.parse(fs.readFileSync(path.join(ROOT, 'family.json'), 'utf8')).members.every((m) => !('checkout' in m)), 'this repository\'s family.json');
  const f = fixture();
  f.family({ checkout: f.work });
  assert.throws(() => build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} }), /machine path \(checkout\) for member.*PASSIONCODE_CHECKOUT_ROOT/);
});

test('the payload carries each member\'s own license and ships the self plugin\'s skills', async () => {
  const { build } = await vendor();
  const f = fixture();
  const { members } = build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} });
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const market = JSON.parse(fs.readFileSync(path.join(f.out, '.claude-plugin/marketplace.json'), 'utf8'));
  assert.deepEqual(market.plugins.map((p) => [p.name, p.license]), [['member', 'Apache-2.0'], ['passioncode', pkg.license]], 'a member is listed under its own license, not a hard-coded one');
  const self = members.find((m) => m.name === 'passioncode');
  assert.ok(self.skills.includes('working-in-passioncode'), 'the launcher links the self plugin\'s skills into the hub like any member\'s');
  assert.ok(fs.existsSync(path.join(f.out, 'plugins/passioncode/skills/working-in-passioncode/references/releasing.md')));
});

test('a release refuses a branch ref, from a clone as from a checkout', async () => {
  const { build } = await vendor();
  const f = fixture();
  f.family({ ref: 'main' });
  assert.throws(() => build({ release: true, root: f.root, out: f.out, gitBase: f.gitBase, env: {} }), /ref main is not a tag/);
  assert.throws(() => build({ release: true, root: f.root, out: f.out, gitBase: f.gitBase, env: { PASSIONCODE_CHECKOUT_MEMBER: f.work } }), /ref main is not a tag/);
  assert.equal(fs.existsSync(f.out), false, 'no payload is written');
});

test('a release refuses a tag that does not name the plugin version it carries (F17)', async (t) => {
  const { build } = await vendor();
  const f = fixture();
  t.after(() => fs.rmSync(f.base, { recursive: true, force: true }));
  f.family({ ref: 'v0.9.0' });
  assert.throws(() => build({ release: true, root: f.root, out: f.out, gitBase: f.gitBase, env: {} }),
    /member: ref v0\.9\.0 does not name the plugin version 1\.0\.0 it carries/);
  assert.equal(fs.existsSync(f.out), false, 'no payload is written');
  // Development vendoring reads branches and other refs freely.
  assert.equal(build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} }).members[0].version, '1.0.0');
});

test('a member whose repository tags another product pins the plugin version it expects (F17)', async (t) => {
  const { build } = await vendor();
  const f = fixture();
  t.after(() => fs.rmSync(f.base, { recursive: true, force: true }));
  const opts = { release: true, root: f.root, out: f.out, gitBase: f.gitBase, env: {} };
  f.family({ ref: 'v0.9.0', refVersions: 'repository', version: '1.0.0' });
  const member = build(opts).members.find((m) => m.name === 'member');
  assert.equal(member.refVersions, 'repository', 'the manifest says the ref is the repository\'s release, not the plugin\'s');
  assert.equal(member.version, '1.0.0');
  f.family({ ref: 'v0.9.0', refVersions: 'repository', version: '2.0.0' });
  assert.throws(() => build(opts), /member: v0\.9\.0 carries plugin version 1\.0\.0, but family\.json pins 2\.0\.0/);
  f.family({ ref: 'v0.9.0', refVersions: 'repository' });
  assert.throws(() => build(opts), /member: refVersions "repository" needs the plugin "version" it expects/);
  f.family({ ref: 'v1.0.0', refVersions: 'tag?' });
  assert.throws(() => build(opts), /member: refVersions must be "plugin" or "repository"/);
});

test('the shipped family pins every member so that a release can prove its provenance', () => {
  const family = JSON.parse(fs.readFileSync(path.join(ROOT, 'family.json'), 'utf8'));
  for (const m of family.members.filter((x) => x.kind !== 'self')) {
    assert.match(m.ref, /^v\d+\.\d+\.\d+$/, m.name);
    if (m.refVersions === 'repository') assert.match(String(m.version), /^\d+\.\d+\.\d+$/, `${m.name} pins the plugin version`);
    else assert.equal(m.refVersions ?? 'plugin', 'plugin', m.name);
  }
});

test('an unreachable member repository is a clear error', async () => {
  const { build } = await vendor();
  const f = fixture();
  f.family({ repo: 'example-org/missing' });
  assert.throws(() => build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} }), /member: could not clone .*missing\.git at v1\.0\.0/);
});

test('vendor refuses a self plugin without a valid trust list', async () => {
  const { build } = await vendor();
  const f = fixture();
  fs.rmSync(path.join(f.root, 'plugin/passioncode/trust.json'));
  assert.throws(() => build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} }), /trust\.json is missing/);
  fs.writeFileSync(path.join(f.root, 'plugin/passioncode/trust.json'), JSON.stringify({ npmPublishers: ['Not An Account'] }));
  assert.throws(() => build({ root: f.root, out: f.out, gitBase: f.gitBase, env: {} }), /lowercase npm account names/);
});

test('versions are in sync: package.json, the self plugin and the CHANGELOG', () => {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  assert.equal(JSON.parse(fs.readFileSync(path.join(ROOT, 'plugin/passioncode/.claude-plugin/plugin.json'), 'utf8')).version, version);
  assert.match(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'), new RegExp(`^## ${version.replace(/\./g, '\\.')} - `, 'm'));
});

test('a clone URL carrying a token is never printed', async () => {
  const { redactUrl } = await vendor();
  assert.equal(redactUrl('https://x-access-token:ghs_SECRET123@github.com/org/repo.git'), 'https://***@github.com/org/repo.git');
  assert.equal(redactUrl('git@github.com:org/repo.git'), 'git@github.com:org/repo.git');
  assert.equal(redactUrl('file:///tmp/remotes/org/repo.git'), 'file:///tmp/remotes/org/repo.git');
  assert.equal(redactUrl("fatal: repository 'https://x-access-token:ghs_S@github.com/o/r.git/' not found"), "fatal: repository 'https://***@github.com/o/r.git/' not found");
});
