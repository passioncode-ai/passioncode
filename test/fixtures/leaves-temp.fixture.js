'use strict';
// PC-115 fixture: a test that leaves temporary folders behind, its own and a child process's.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

test('leaves its temporary folders', () => {
  fs.mkdtempSync(path.join(os.tmpdir(), 'pc-fixture-'));
  require('node:child_process').execFileSync(process.execPath, ['-e', "require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 'pc-child-'))"]);
});
