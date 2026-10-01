// Exercise shipped bytes in an isolated home with fake Claude, never the real installation.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'passioncode-pack-'));
try {
  assert.ok(fs.existsSync(path.join(root, 'payload/manifest.json')), 'run npm run vendor:release first');
  const [pack] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' }));
  execFileSync('tar', ['-xzf', path.join(temp, pack.filename), '-C', temp]);
  const home = path.join(temp, 'home');
  fs.mkdirSync(path.join(home, '.codex/skills'), { recursive: true });
  const env = { ...process.env, HOME: home, PASSIONCODE_HOME: '', PASSIONCODE_PAYLOAD: '',
    PASSIONCODE_CLAUDE: path.join(root, 'test/fake-claude.js'),
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH}` };
  const cli = (args, expected = 0) => {
    const r = spawnSync(process.execPath, [path.join(temp, 'package/bin/passioncode.js'), ...args], { cwd: temp, env, encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, expected, `${args.join(' ')}: ${r.stdout}\n${r.stderr}`);
    return args.includes('--json') ? JSON.parse(r.stdout) : r.stdout;
  };
  const manifest = JSON.parse(fs.readFileSync(path.join(temp, 'package/payload/manifest.json')));
  assert.ok(cli(['update', '--json']).steps.every((step) => step.outcome !== 'failed'));
  const status = cli(['status', '--json']);
  assert.equal(status.installed, manifest.version);
  assert.deepEqual(status.members.map((m) => m.name), manifest.members.map((m) => m.name));
  assert.ok(status.members.every((m) => m.claude === 'plugin' && m.hub.every((s) => s.ok)));
  cli(['uninstall', '--dry-run'], 2);
  assert.equal(cli(['status', '--json']).installed, manifest.version);
  cli(['uninstall', '--json']);
  const after = cli(['status', '--json']);
  assert.equal(after.installed, null);
  assert.equal(after.auto, false);
  assert.deepEqual(cli(['uninstall', '--json']), []);
  assert.deepEqual(cli(['restore', '--json']), []);
  console.log(JSON.stringify({ node: process.version, package: pack.filename, integrity: pack.integrity,
    files: pack.files.length, checks: ['update', 'status', 'unsupported dry-run', 'uninstall', 'repeat uninstall', 'restore'], result: 'PASS' }, null, 2));
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
