// Verify the published bytes, after both metadata and tarball propagation settle.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export async function checkRegistry({ name, version, registry = 'https://registry.npmjs.org',
  attempts = 60, delayMs = 10000, requestTimeoutMs = 15000, fetchImpl = fetch,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) {
  assert.match(name, /^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/);
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.ok(Number.isInteger(attempts) && attempts > 0, 'attempts must be positive');
  const retry = async (stage, operation) => {
    let last;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try { return await operation(); } catch (error) { last = error; }
      if (attempt < attempts) await sleep(delayMs);
    }
    throw new Error(`${stage} unavailable after ${attempts} attempts: ${last.message}`);
  };
  const get = async (url) => {
    const response = await fetchImpl(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status} from ${url}`);
    }
    return response;
  };
  const metadata = await retry('registry metadata', async () => {
    const doc = await (await get(`${registry}/${encodeURIComponent(name)}/${version}`)).json();
    assert.equal(doc.name, name, 'registry package name mismatch');
    assert.equal(doc.version, version, 'registry package version mismatch');
    assert.match(doc.dist?.integrity || '', /^sha512-[A-Za-z0-9+/]{86}==$/, 'expected SHA-512 integrity');
    const tarball = new URL(doc.dist.tarball);
    assert.equal(tarball.origin, new URL(registry).origin, 'unexpected tarball registry');
    return doc;
  });
  const bytes = await retry('registry tarball', async () => {
    const data = Buffer.from(await (await get(metadata.dist.tarball)).arrayBuffer());
    const integrity = `sha512-${createHash('sha512').update(data).digest('base64')}`;
    assert.equal(integrity, metadata.dist.integrity, 'registry tarball integrity mismatch');
    return data.length;
  });
  return { name, version, tarball: metadata.dist.tarball, integrity: metadata.dist.integrity, bytes, result: 'served and verified' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert.equal(process.argv.length, 4, 'usage: node scripts/check-registry.mjs PACKAGE VERSION');
    console.log(JSON.stringify(await checkRegistry({ name: process.argv[2], version: process.argv[3] }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
