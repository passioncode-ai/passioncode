'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');

const pack = {
  name: '@passioncode-ai/passioncode', version: '0.1.16',
  filename: 'passioncode-ai-passioncode-0.1.16.tgz',
  integrity: 'sha512-fixture', files: [{ path: 'package.json', size: 100, mode: 420 }],
};

test('release smoke reads the npm 11 array pack result', async () => {
  const { readSinglePack } = await import('../scripts/pack-result.mjs');
  assert.deepEqual(readSinglePack(JSON.stringify([pack])), pack);
});

test('release smoke reads the npm 12 name-keyed pack result', async () => {
  const { readSinglePack } = await import('../scripts/pack-result.mjs');
  assert.deepEqual(readSinglePack(JSON.stringify({ [pack.name]: pack })), pack);
});

test('release smoke refuses ambiguous or unusable pack output before extracting', async () => {
  const { readSinglePack } = await import('../scripts/pack-result.mjs');
  for (const value of [null, [], {}, [pack, pack], { first: pack, second: pack }]) {
    assert.throws(() => readSinglePack(JSON.stringify(value)), /metadata|exactly one/);
  }
  for (const value of [{ error: { message: 'failed' } }, [{ ...pack, filename: '../escape.tgz' }],
    [{ ...pack, filename: 'nested\\escape.tgz' }], [{ ...pack, files: null }]]) {
    assert.throws(() => readSinglePack(JSON.stringify(value)), /local tarball|files and integrity/);
  }
});
