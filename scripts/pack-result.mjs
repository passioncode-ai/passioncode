import assert from 'node:assert/strict';

// #region pack-result — docs: docs/handoffs/2026-10-01-release-0.1.16.md
// npm <=11 emits an array; npm 12 emits an object keyed by package name.
// A release smoke must exercise exactly one package, never silently pick one.
export function readSinglePack(stdout) {
  const result = JSON.parse(stdout);
  assert.ok(result && typeof result === 'object', 'npm pack must return package metadata');
  const packs = Array.isArray(result) ? result : Object.values(result);
  assert.equal(packs.length, 1, 'npm pack must describe exactly one package');
  const pack = packs[0];
  assert.ok(pack && typeof pack.filename === 'string'
    && /^[^/\\]+\.tgz$/.test(pack.filename), 'npm pack must name one local tarball');
  assert.ok(Array.isArray(pack.files) && typeof pack.integrity === 'string',
    'npm pack must include files and integrity');
  return pack;
}
// #endregion pack-result
