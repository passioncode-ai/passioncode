'use strict';
delete process.env.CLAUDE_CONFIG_DIR; // PC-129: a run never reaches the developer's Claude Code folder
const assert = require('node:assert/strict');
const { createHash, generateKeyPairSync, sign } = require('node:crypto');

// A registry key for these tests, pinned through checkRegistry's `keys`, as trust.json pins npm's.
const PAIR = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const KEYS = [{ keyid: 'SHA256:test', key: PAIR.publicKey.export({ type: 'spki', format: 'der' }).toString('base64') }];
const http = require('node:http');
const test = require('node:test');

async function fixture(t, { missingMetadata = 0, missingTarballs = 0, corrupt = false, wrongVersion = false, provenance = 'https://slsa.dev/provenance/v1', signedFor = '0.1.16' } = {}) {
  const bytes = Buffer.from('published fixture archive bytes');
  const counts = { metadata: 0, tarball: 0 };
  let registry;
  const server = http.createServer((req, res) => {
    if (req.url === '/package.tgz') {
      counts.tarball += 1;
      res.statusCode = counts.tarball <= missingTarballs ? 404 : 200;
      res.end(corrupt ? Buffer.from('damaged archive') : bytes);
    } else {
      counts.metadata += 1;
      res.statusCode = counts.metadata <= missingMetadata ? 404 : 200;
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      const sig = sign('sha256', Buffer.from(`@passioncode-ai/passioncode@${signedFor}:${integrity}`), PAIR.privateKey).toString('base64');
      res.end(JSON.stringify({ name: '@passioncode-ai/passioncode', version: wrongVersion ? '0.1.14' : '0.1.16',
        dist: { tarball: `${registry}/package.tgz`, integrity, signatures: [{ keyid: KEYS[0].keyid, sig }],
          ...(provenance ? { attestations: { provenance: { predicateType: provenance } } } : {}) } }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  registry = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { counts, bytes, options: { name: '@passioncode-ai/passioncode', version: '0.1.16', registry, attempts: 2, delayMs: 0, keys: KEYS } };
}

test('registry receipt waits separately for metadata and canonical archive then verifies its bytes', async (t) => {
  const f = await fixture(t, { missingMetadata: 1, missingTarballs: 1 });
  const { checkRegistry } = await import('../scripts/check-registry.mjs');
  const receipt = await checkRegistry(f.options);
  assert.deepEqual(f.counts, { metadata: 2, tarball: 2 });
  assert.equal(receipt.bytes, f.bytes.length);
  assert.equal(receipt.result, 'served and verified');
});

test('visible metadata cannot pass a registry receipt while its archive stays 404', async (t) => {
  const f = await fixture(t, { missingTarballs: Infinity });
  const { checkRegistry } = await import('../scripts/check-registry.mjs');
  await assert.rejects(checkRegistry(f.options), /registry tarball unavailable after 2 attempts: HTTP 404/);
  assert.deepEqual(f.counts, { metadata: 1, tarball: 2 });
});

test('a corrupt registry archive fails its bounded SHA-512 check', async (t) => {
  const f = await fixture(t, { corrupt: true });
  const { checkRegistry } = await import('../scripts/check-registry.mjs');
  await assert.rejects(checkRegistry(f.options), /registry tarball integrity mismatch/);
  assert.deepEqual(f.counts, { metadata: 1, tarball: 2 });
});

test('metadata for another version cannot authorize an archive download', async (t) => {
  const f = await fixture(t, { wrongVersion: true });
  const { checkRegistry } = await import('../scripts/check-registry.mjs');
  await assert.rejects(checkRegistry(f.options), /registry package version mismatch/);
  assert.deepEqual(f.counts, { metadata: 2, tarball: 0 });
});

test('a release the installed hook would refuse fails its registry receipt (PC-131, ADR-0005)', async (t) => {
  const { checkRegistry } = await import('../scripts/check-registry.mjs');
  await assert.rejects(checkRegistry((await fixture(t, { provenance: null })).options), /no SLSA provenance attestation/);
  await assert.rejects(checkRegistry((await fixture(t, { signedFor: '0.1.15' })).options), /no registry signature verifies/);
  const other = await fixture(t);
  await assert.rejects(checkRegistry({ ...other.options, keys: [] }), /no registry signature verifies/, 'no pinned key, no receipt');
  const receipt = await checkRegistry((await fixture(t)).options);
  assert.equal(receipt.signature, 'verified with the pinned npm key');
});

test('the shipped trust.json and hook verify the real 0.2.75 metadata the receipt would read', async () => {
  const hook = require('../plugin/passioncode/hooks/update-check.js');
  const real = require('./fixtures/npm-dist-0.2.75.json');
  assert.ok(hook.registrySigned(real.version, hook.readDist(real.dist), hook.loadRegistryKeys()));
});
