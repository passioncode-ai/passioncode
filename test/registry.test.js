'use strict';
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const http = require('node:http');
const test = require('node:test');

async function fixture(t, { missingMetadata = 0, missingTarballs = 0, corrupt = false, wrongVersion = false } = {}) {
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
      res.end(JSON.stringify({ name: '@passioncode-ai/passioncode', version: wrongVersion ? '0.1.14' : '0.1.16',
        dist: { tarball: `${registry}/package.tgz`, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } }));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  registry = `http://127.0.0.1:${server.address().port}`;
  t.after(() => { server.closeAllConnections(); server.close(); });
  return { counts, bytes, options: { name: '@passioncode-ai/passioncode', version: '0.1.16', registry, attempts: 2, delayMs: 0 } };
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
