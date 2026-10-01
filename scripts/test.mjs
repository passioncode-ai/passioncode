// Node 18 does not expand quoted test globs. Pass explicit paths on every host.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tests = fs.readdirSync(path.join(root, 'test')).filter((name) => name.endsWith('.test.js')).sort();
if (!tests.length) throw new Error('No test files found.');
const result = spawnSync(process.execPath, ['--test', ...tests.map((name) => path.join(root, 'test', name))], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
