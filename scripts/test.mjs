// Node 18 does not expand quoted test globs. Pass explicit paths on every host.
// Arguments name the test files to run (the PC-115 test runs this script on a fixture); none: every test/*.test.js.
// An argument that starts with - goes to node --test as it is (`npm test -- --test-name-pattern=PC-115`).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flags = args.filter((arg) => arg.startsWith('-'));
const named = args.filter((arg) => !arg.startsWith('-')).map((file) => path.resolve(file));
// A whole run started from inside a run would start itself again: the runner marks its run's environment.
if (!named.length && process.env.PASSIONCODE_TEST_RUN) {
  console.error('scripts/test.mjs: a whole test run cannot start inside another one; name the test files.');
  process.exit(2);
}
const tests = named.length ? named
  : fs.readdirSync(path.join(root, 'test')).filter((name) => name.endsWith('.test.js')).sort().map((name) => path.join(root, 'test', name));
if (!tests.length) throw new Error('No test files found.');
// PC-115: the run gets a temporary folder of its own, removed when it ends, so the folders the tests make
// (and those of the processes they start, which inherit it) never pile up in the system's one.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-test-'));
let status = 1;
try {
  // PC-129: a developer's CLAUDE_CONFIG_DIR (or Switchboard's SWITCHBOARD_CLAUDE_SOURCE_DIR) would send the sandboxed
  // launcher to their real Claude Code folder.
  const env = { ...process.env, PASSIONCODE_TEST_RUN: '1', TMPDIR: scratch, TMP: scratch, TEMP: scratch };
  delete env.CLAUDE_CONFIG_DIR;
  delete env.SWITCHBOARD_CLAUDE_SOURCE_DIR;
  // PC-178: a developer's XDG folders and uv's or obsidian-wiki's variables would move the config, the tool folder or
  // uv's installer folders out of a test's home: none reaches a test (a test that needs one sets its own).
  for (const k of Object.keys(env)) if (/^(XDG_|UV_|OBSIDIAN_WIKI_|OBSIDIAN_VAULT|HERMES_HOME$)/.test(k)) delete env[k];
  // PC-145: the shared apps folder is a scratch one, so no test reads the machine's own /Applications.
  env.PASSIONCODE_SHARED_APPLICATIONS = path.join(scratch, 'shared-Applications');
  const child = spawn(process.execPath, ['--test', ...flags, ...tests], { stdio: 'inherit', env });
  // PC-116: an interrupted run (Ctrl-C, SIGTERM) stops its tests and still removes its folder: the signal goes
  // to node --test, and this process waits for it to end instead of ending first.
  let interrupted = false;
  // On Windows the console delivers Ctrl-C to node --test itself, and kill() there would end it outright.
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { interrupted = true; if (process.platform !== 'win32') child.kill(signal); });
  const code = await new Promise((resolve) => {
    child.once('error', (error) => { console.error(error.message); resolve(1); });
    child.once('exit', (exitCode) => resolve(exitCode ?? 1));
  });
  status = interrupted ? code || 1 : code; // an interrupted run never reads as passed
} finally {
  try { fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); }
  catch (error) { console.error(error.message); } // a file held open (Windows) is named below, not thrown
}
if (fs.existsSync(scratch)) {
  console.error(`The test run's temporary folder could not be removed: ${scratch}`);
  status = status || 1;
}
process.exitCode = status;
