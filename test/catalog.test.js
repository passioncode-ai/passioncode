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

test('PC-145: a copy in ~/Applications wins over one in /Applications, which doctor names as this user\'s own earlier copy', () => {
  const w = world();
  const there = w.bundle(w.shared);
  w.bundle(path.join(w.home, 'Applications'));
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
  assert.deepEqual(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), { path: there, why: 'own' });
});

test('PC-145: with no user id to compare (Windows), a replaceable shared copy stays where it is', () => {
  const w = world();
  const there = w.bundle(w.shared);
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: null }), there);
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: null }), null);
});

test('PC-147: a bundle this user cannot write is not replaced either: macOS refuses to move it into the Trash', { skip: (me === null && 'POSIX modes') || (me === 0 && 'root writes anyway') }, (t) => {
  const w = world();
  const there = w.bundle(w.shared);
  fs.chmodSync(there, 0o555);
  t.after(() => fs.chmodSync(there, 0o755));
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
  assert.deepEqual(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), { path: there, why: 'not-writable' });
});

test('PC-147: blockedFolder names the nearest existing folder on the way when it is not writable, else null', { skip: (me === null && 'POSIX modes') || (me === 0 && 'root writes anyway') }, (t) => {
  const w = world();
  assert.equal(C.blockedFolder(path.join(w.home, 'Applications', 'deep', fabric.app)), null, 'a folder made on the way');
  fs.chmodSync(w.shared, 0o555);
  t.after(() => fs.chmodSync(w.shared, 0o755));
  assert.equal(C.blockedFolder(path.join(w.shared, 'sub', fabric.app)), w.shared);
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
  assert.deepEqual(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: other }), { path: there, why: 'other-user' });
});

test('PC-147: a copy whose folder this user cannot write is not replaced: the app goes into ~/Applications', { skip: (me === null && 'POSIX modes') || (me === 0 && 'root writes anyway') }, (t) => {
  const w = world();
  const there = w.bundle(w.shared);
  fs.chmodSync(w.shared, 0o555);
  t.after(() => fs.chmodSync(w.shared, 0o755));
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), w.own);
  assert.deepEqual(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), { path: there, why: 'not-writable' });
});

test('PC-145: PASSIONCODE_APPLICATIONS names one folder for every app and turns the rule off', () => {
  const w = world();
  w.bundle(path.join(w.home, 'Applications'));
  w.bundle(w.shared); // a shared copy too: the override still names none
  process.env.PASSIONCODE_APPLICATIONS = path.join(w.base, 'only');
  assert.equal(C.appPath(fabric, { home: w.home, shared: w.shared, uid: me }), path.join(w.base, 'only', fabric.app));
  assert.equal(C.sharedCopy(fabric, { home: w.home, shared: w.shared, uid: me }), null);
});

test('PC-146: doctor names whose a shared copy is, and the links it may answer', () => {
  const copy = (why) => ({ path: '/Applications/Fabric Dashboards.app', why });
  const dash = C.byId('dashboards'), sb = C.byId('switchboard');
  assert.equal(C.sharedNote(dash, 'Fabric Dashboards', copy('other-user'), true), "Fabric Dashboards: the copy in /Applications/Fabric Dashboards.app is another user's, left as it is; macOS may open fabric-dashboards:// links with it instead of yours");
  assert.equal(C.sharedNote(dash, 'Fabric Dashboards', copy('own'), false), 'Fabric Dashboards: the copy in /Applications/Fabric Dashboards.app is your own earlier copy, left as it is; macOS may open fabric-dashboards:// links with it');
  assert.equal(C.sharedNote(sb, 'Fabric Switchboard', copy('not-writable'), true), 'Fabric Switchboard: the copy in /Applications/Fabric Dashboards.app is one you cannot replace, left as it is');
});

test('PC-147: a bundle this user cannot write, in a folder they can, is what blocks a replace', { skip: (me === null && 'POSIX modes') || (me === 0 && 'root writes anyway') }, (t) => {
  const w = world();
  const there = w.bundle(w.shared);
  fs.chmodSync(there, 0o555);
  t.after(() => fs.chmodSync(there, 0o755));
  assert.equal(C.blockedFolder(there), there);
});

test('PC-147: the note for a folder this user cannot write names PASSIONCODE_APPLICATIONS only when it is set', () => {
  assert.equal(C.blockedNote('/Applications'), '/Applications is not writable for you, so nothing is downloaded: ask an administrator to let you write it');
  // A folder of this user's own is theirs to unlock; one they do not own (or that is gone) is an administrator's.
  const own = fs.mkdtempSync(path.join(os.tmpdir(), 'pc147-'));
  if (me !== null) assert.equal(C.blockedNote(own), `${own} is not writable for you, so nothing is downloaded: make it writable (in Finder, Get Info, then Sharing & Permissions)`);
  process.env.PASSIONCODE_APPLICATIONS = '/x';
  assert.equal(C.blockedNote('/x'), '/x is not writable for you, so nothing is downloaded: unset PASSIONCODE_APPLICATIONS to use ~/Applications, or ask an administrator to let you write it');
});

test('PC-146: a copy owned by root (a package or an administrator installed it) is named as such, not as another user\'s', { skip: (process.platform !== 'darwin' && 'a root-owned bundle macOS ships') || (me === 0 && 'root owns it') }, () => {
  const w = world();
  const calculator = { ...fabric, app: 'Calculator.app' }; // root-owned on every Mac
  const copy = C.sharedCopy(calculator, { home: w.home, shared: '/System/Applications', uid: me });
  assert.deepEqual(copy, { path: '/System/Applications/Calculator.app', why: 'admin' });
  assert.equal(C.sharedNote(calculator, 'Calculator', copy, false), 'Calculator: the copy in /System/Applications/Calculator.app is one an administrator installed, left as it is; macOS may open fabric:// links with it');
});
