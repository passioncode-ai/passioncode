'use strict';
// The organisation's text rule: what a person reads carries no em dash (U+2014). Every line of
// code the launcher runs is held to it; comments, which no person running it reads, are not.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const ROOT = path.resolve(__dirname, '..');
const DIRS = ['bin', 'lib', 'plugin/passioncode/hooks'];
const COMMENT = /^\s*(\/\/|\/\*|\*)/;

test('PC-95: no em dash in a string the launcher prints', () => {
  const found = [];
  for (const dir of DIRS) {
    for (const name of fs.readdirSync(path.join(ROOT, dir))) {
      if (!/\.(c|m)?js$/.test(name)) continue;
      const file = path.join(dir, name);
      fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n').forEach((line, n) => {
        if (!COMMENT.test(line) && line.replace(/\s\/\/ .*$/, '').includes('—')) found.push(`${file}:${n + 1}`);
      });
    }
  }
  assert.deepEqual(found, []);
});
