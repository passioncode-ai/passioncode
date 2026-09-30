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
  'COMMERCIAL-LICENSE.md': '9bd2312a9dc20d13aab5af26d63d943aa03c304febf42a32160a205496a9155f',
  'CLA.md': '9a80c3d37a1f6cebdce422c54bf90cc8a57085d2e0959b04f2d48295f4320bd3',
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
    'contact@passioncode.ai', `Versions before ${FIRST_AGPL_VERSION} were released under`]) {
    assert.ok(section.includes(needle), `## License carries ${JSON.stringify(needle)}`);
  }
  assert.doesNotMatch(readme, /Source-available under|license-source--available/i, 'the retired licence is not stated as current');
});
