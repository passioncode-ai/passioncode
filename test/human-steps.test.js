'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-158: branches of setup's plan and steps (PR #277) that were right by reading and that no test guarded.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const S = require('../lib/setup');
const D = require('../lib/doctor');
const catalog = require('../lib/catalog');

const SETUP = `${D.NPX} setup`;
const dash = catalog.byId('dashboards');

test('PC-158: a blocked repair is not a repair left, so the run that was `setup` does not name setup again', () => {
  const after = [{ id: 'skills.installed', state: 'fail', fix: SETUP }];
  const blocked = [{ key: 'replace:dashboards', kind: 'replace', product: 'dashboards', selected: false, blocked: true, note: 'N' }];
  assert.deepEqual(S.humanSteps({ actions: [] }, after, blocked, []), [`${dash.name}: N`]);
  // A repair the person left (answered no to) is one: the step names setup.
  const left = [{ key: 'update', kind: 'update', selected: false, blocked: false }];
  assert.deepEqual(S.humanSteps({ actions: [] }, after, left, []), [SETUP]);
});

test('PC-158: a blocked row of an app with a blocked plan item is said once, by the item', () => {
  const after = [{ id: 'app.dashboards', state: 'fail', fix: 'F', blocked: true, product: 'dashboards' }];
  const items = [{ kind: 'install', product: 'dashboards', selected: false, blocked: true, note: 'N' }];
  assert.deepEqual(S.humanSteps({ actions: [] }, after, items, []), [`${dash.name}: N`]);
  // Without the item, the row names the app itself.
  assert.deepEqual(S.humanSteps({ actions: [] }, after, [], []), [`${dash.name}: F`]);
});

test('PC-158: one app with two blocked rows of one fix prints one line', () => {
  const after = [
    { id: 'app.dashboards', state: 'fail', fix: 'F', blocked: true, product: 'dashboards' },
    { id: 'mcp.claude.fabric-dashboards', state: 'fail', fix: 'F', blocked: true, product: 'dashboards' },
  ];
  assert.deepEqual(S.humanSteps({ actions: [] }, after, [], []), [`${dash.name}: F`]);
});

test('PC-158: a blocked reinstall never promises the Trash', { skip: (process.platform === 'win32' && 'POSIX modes') || (process.getuid?.() === 0 && 'root writes anyway') }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc158-'));
  const apps = path.join(base, 'Applications');
  fs.mkdirSync(path.join(apps, dash.app, 'Contents'), { recursive: true });
  const saved = process.env.PASSIONCODE_APPLICATIONS;
  process.env.PASSIONCODE_APPLICATIONS = apps;
  t.after(() => {
    fs.chmodSync(apps, 0o755);
    if (saved === undefined) delete process.env.PASSIONCODE_APPLICATIONS; else process.env.PASSIONCODE_APPLICATIONS = saved;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const checks = [{ id: 'app.dashboards', state: 'fail', repair: { kind: 'replace', product: 'dashboards' } }];
  const open = S.plan(checks, { platform: 'darwin', noApps: false, home: base }).find((i) => i.kind === 'replace');
  assert.equal(open.detail, `reinstall ${dash.name} from its latest signed release (the current one goes to the Trash)`);
  fs.chmodSync(apps, 0o555);
  const locked = S.plan(checks, { platform: 'darwin', noApps: false, home: base }).find((i) => i.kind === 'replace');
  assert.equal(locked.detail, `reinstall ${dash.name} from its latest signed release`);
  assert.ok(locked.blocked && !locked.selected && locked.note.startsWith(`${apps} is not writable for you`), JSON.stringify(locked));
});
