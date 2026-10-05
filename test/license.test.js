'use strict';
// Fabric ADR-0092: the launcher is AGPL-3.0-only OR the PassionCode.ai commercial licence.
// LICENSE, COMMERCIAL-LICENSE.md and CLA.md are byte for byte the templates in fabric-workspace
// knowledge/templates/ (that repository is not readable from here, so their SHA-256 is pinned),
// the package ships them, and the README says it in the knowledge base's licensing wording.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const SPDX = 'AGPL-3.0-only OR LicenseRef-PassionCode-Commercial';
const FIRST_AGPL_VERSION = '0.1.12';
const TEMPLATE_SHA256 = {
  LICENSE: '0d96a4ff68ad6d4b6f1f30f713b18d5184912ba8dd389f86aa7710db079abcb0',
  'COMMERCIAL-LICENSE.md': '893b4bb9e4597b19b178ad69f56b799b4e5d468463ecb2d05ab05f0eee92804a',
  'CLA.md': 'cf44ce2b052fd75e9ef48f8124fb6eed71513c9152aac90eede0a2132951e408',
};
const read = (f) => fs.readFileSync(path.join(ROOT, f));

test('the licence files are the knowledge base templates, byte for byte', () => {
  for (const [file, digest] of Object.entries(TEMPLATE_SHA256)) {
    assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} exists`);
    assert.equal(crypto.createHash('sha256').update(read(file)).digest('hex'), digest, `${file} is the template, byte for byte`);
  }
});

test('every manifest carries the expression, and the package ships the licence files', () => {
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.license, SPDX);
  assert.equal(JSON.parse(read('plugin/passioncode/.claude-plugin/plugin.json')).license, SPDX);
  for (const f of ['LICENSE', 'COMMERCIAL-LICENSE.md', 'CLA.md']) assert.ok(pkg.files.includes(f), `package.json files ships ${f}`);
});

test('the README follows the standard: the name, the quick start, the licensing wording', () => {
  const readme = read('README.md').toString('utf8');
  const heading = readme.split('\n').find((l) => l.startsWith('#'));
  assert.equal(heading, '# PassionCode.ai launcher', 'the first heading is the full name (products.md)');
  assert.match(readme, /^## Quick start for a new teammate$/m);
  const section = readme.split(/^## License$/m)[1] || '';
  for (const needle of ['Open source under the [GNU AGPL-3.0](LICENSE).', '[commercial license](COMMERCIAL-LICENSE.md)',
    'https://passioncode.ai/business/', `Versions before ${FIRST_AGPL_VERSION} were released under`]) {
    assert.ok(section.includes(needle), `## License carries ${JSON.stringify(needle)}`);
  }
  assert.doesNotMatch(readme, /Source-available under|license-source--available/i, 'the retired licence is not stated as current');
  assert.ok(!section.includes('contact@passioncode.ai'), 'the commercial pointer is the business form, not the security address (operator decision 2026-10-05)');
});
