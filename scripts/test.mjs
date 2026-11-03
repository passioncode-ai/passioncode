// Node 18 does not expand quoted test globs. Pass explicit paths on every host.
// Arguments name the test files to run (the PC-115 test runs this script on a fixture); none: every test/*.test.js.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const named = process.argv.slice(2).map((file) => path.resolve(file));
const tests = named.length ? named
  : fs.readdirSync(path.join(root, 'test')).filter((name) => name.endsWith('.test.js')).sort().map((name) => path.join(root, 'test', name));
if (!tests.length) throw new Error('No test files found.');
// PC-115: the run gets a temporary folder of its own, removed when it ends, so the folders the tests make
// (and those of the processes they start, which inherit it) never pile up in the system's one.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-test-'));
let status = 1;
try {
  const result = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', env: { ...process.env, TMPDIR: scratch, TMP: scratch, TEMP: scratch } });
  if (result.error) console.error(result.error.message);
  status = result.status ?? 1;
} finally {
  try { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (error) { console.error(error.message); } // a file held open (Windows) is named below, not thrown
}
if (fs.existsSync(scratch)) {
  console.error(`The test run's temporary folder could not be removed: ${scratch}`);
  status = status || 1;
}
process.exitCode = status;
