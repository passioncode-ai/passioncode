'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('documentation links, source locations and regression evidence resolve', async () => {
  const { checkDocs } = await import('../scripts/check-docs.mjs');
  const result = checkDocs(path.resolve(__dirname, '..'));
  assert.deepEqual(result.errors, []);
  assert.ok(result.files > 0 && result.regressions > 0, 'the check actually read documentation');
});

test('documentation gate rejects broken paths, anchors and invented test evidence', async () => {
  const { checkLinks, checkEvidence } = await import('../scripts/check-docs.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-docgate-'));
  try {
    fs.mkdirSync(path.join(root, 'docs/ux'), { recursive: true });
    fs.writeFileSync(path.join(root, 'README.md'), '[missing](absent.md)\n[wrong anchor](other.md#absent)\n[valid](other.md#present)\n');
    fs.writeFileSync(path.join(root, 'other.md'), '# Present\n');
    fs.writeFileSync(path.join(root, 'docs/ux/scenarios.md'), '### SCN-001: Example\n');
    assert.equal(checkLinks(root, ['README.md']).length, 2);
    const errors = checkEvidence(root, [{ id: 'NEGATIVE', file: 'absent.test.js', test: 'invented', scenario: 'SCN-404' }]);
    assert.equal(errors.length, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
