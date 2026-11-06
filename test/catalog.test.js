'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR; // PC-129: a run never reaches the developer's Claude Code folder
// PC-145, PC-146, PC-147: where an app is, or goes, for this macOS user (SCN-017).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const C = require('../lib/catalog');

const fabric = C.byId('fabric');
const world = () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'pc145-'));
  const home = path.join(base, 'home');
  const shared = path.join(base, 'Applications');
  fs.mkdirSync(home, { recursive: true });
  fs.mkdirSync(shared, { recursive: true });
  const bundle = (dir) => { fs.mkdirSync(path.join(dir, fabric.app, 'Contents'), { recursive: true }); return path.join(dir, fabric.app); };
  return { base, home, shared, bundle, own: path.join(home, 'Applications', fabric.app) };
};
const me = typeof process.getuid === 'function' ? process.getuid() : null;
const saved = process.env.PASSIONCODE_APPLICATIONS;
test.beforeEach(() => { delete process.env.PASSIONCODE_APPLICATIONS; });
test.after(() => { if (saved === undefined) delete process.env.PASSIONCODE_APPLICATIONS; else process.env.PASSIONCODE_APPLICATIONS = saved; });

test('PC-145: with no copy anywhere an app goes into ~/Applications', () => {
  const w = world();
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), null);
});

test('PC-145: a copy in ~/Applications wins over one in /Applications', () => {
  const w = world();
  w.bundle(w.shared);
  w.bundle(path.join(w.home, 'Applications'));
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
});

test('PC-145: a copy in /Applications this user owns and may replace stays where it is', () => {
  const w = world();
  const there = w.bundle(w.shared);
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), there);
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), null);
});

test('PC-146: another user\'s copy in /Applications is never ours: this user gets ~/Applications and doctor names that copy', { skip: me === null && 'POSIX owners' }, () => {
  const w = world();
  const there = w.bundle(w.shared);
  const other = me + 1; // the bundle belongs to someone else from this user's point of view
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: other }), w.own);
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: other }), there);
});

test('PC-147: a copy whose folder this user cannot write is not replaced: the app goes into ~/Applications', { skip: (me === null && 'POSIX modes') || (me === 0 && 'root writes anyway') }, (t) => {
  const w = world();
  const there = w.bundle(w.shared);
  fs.chmodSync(w.shared, 0o555);
  t.after(() => fs.chmodSync(w.shared, 0o755));
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), there);
});

test('PC-145: PASSIONCODE_APPLICATIONS names one folder for every app and turns the rule off', () => {
  const w = world();
  w.bundle(path.join(w.home, 'Applications'));
  process.env.PASSIONCODE_APPLICATIONS = path.join(w.base, 'only');
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), path.join(w.base, 'only', fabric.app));
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), null);
});
