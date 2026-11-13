'use strict';
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.SWITCHBOARD_CLAUDE_SOURCE_DIR;
// PC-223: doctor's rows for MCP servers across Claude Code homes, against a temp HOME and a fake `switchboard` run.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const M = require('../lib/mcp-homes');

const write = (file, doc) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(doc)); };

function machine() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'pc-mcp-homes-'));
  const data = path.join(home, 'sb-data');
  process.env.PASSIONCODE_SWITCHBOARD_DATA = data;
  const claudeDir = path.join(home, '.claude');
  const claudeJson = path.join(home, '.claude.json');
  // A plugin that serves Figma, installed once and shared by the homes that enable it.
  const plugin = path.join(home, 'plugin-cache', 'figma');
  write(path.join(plugin, '.mcp.json'), { figma: { type: 'http', url: 'https://mcp.figma.com/mcp' } });
  const enable = (dir) => {
    write(path.join(dir, 'settings.json'), { enabledPlugins: { 'figma@claude-plugins-official': true } });
    write(path.join(dir, 'plugins', 'installed_plugins.json'), { version: 2, plugins: { 'figma@claude-plugins-official': [{ scope: 'user', installPath: plugin }] } });
  };
  const sbHome = (id) => path.join(data, 'homes', id);
  return { home, data, claudeDir, claudeJson, enable, sbHome };
}

const args = (m, extra = {}) => ({ home: m.home, platform: 'linux', claudeDir: m.claudeDir, claudeJson: m.claudeJson, run: () => ({ code: 2, out: '', err: 'unrecognized subcommand' }), switchboardBin: null, ...extra });

test('a second name for the plugin\'s URL in the default home is a warning, never a failure', () => {
  const m = machine();
  m.enable(m.claudeDir);
  write(m.claudeJson, { mcpServers: { figma: { type: 'http', url: 'https://mcp.figma.com/mcp/' } } });
  const rows = M.checks(args(m));
  const dup = rows.find((r) => r.id === 'mcp.homes.duplicate');
  assert.equal(dup.state, 'warn');
  assert.match(dup.detail, /the default home: figma, plugin:figma:figma \(https:\/\/mcp\.figma\.com\/mcp\)/);
  assert.match(dup.fix, /switchboard_status/);
  assert.match(dup.fix, /session\.mode/);
  assert.match(dup.fix, /once under one name/);
  assert.deepEqual(dup.entries, [{ home: 'default', folder: null, url: 'https://mcp.figma.com/mcp', names: ['figma', 'plugin:figma:figma'] }]);
  assert.ok(!rows.some((r) => r.state === 'fail'));
  assert.ok(!rows.some((r) => r.id === 'mcp.homes.signin'), 'one home: nothing to compare');
});

test('a project entry duplicating a global one is named with its folder; two projects with one URL are not', () => {
  const m = machine();
  write(m.claudeJson, {
    mcpServers: { cf: { url: 'https://mcp.cloudflare.com/mcp' } },
    projects: {
      '/work/a': { mcpServers: { 'cloudflare-api': { url: 'https://MCP.cloudflare.com/mcp' } } },
      '/work/b': { mcpServers: { x: { url: 'https://example.com/mcp' } } },
      '/work/c': { mcpServers: { y: { url: 'https://example.com/mcp' } } },
    },
  });
  const dup = M.checks(args(m)).find((r) => r.id === 'mcp.homes.duplicate');
  assert.equal(dup.state, 'warn');
  assert.equal(dup.entries.length, 1);
  assert.equal(dup.entries[0].folder, '/work/a');
  assert.deepEqual(dup.entries[0].names, ['cf', 'cloudflare-api']);
});

test('a duplicate inside a Switchboard home names that home; a disabled plugin counts for nothing', () => {
  const m = machine();
  write(m.claudeJson, {});
  const a = m.sbHome('0123abcd-0000-0000-0000-000000000000');
  m.enable(a);
  write(path.join(a, '.claude.json'), { mcpServers: { figma: { url: 'https://mcp.figma.com/mcp' } } });
  const b = m.sbHome('fedc9876-0000-0000-0000-000000000000');
  write(path.join(b, 'settings.json'), { enabledPlugins: { 'figma@claude-plugins-official': false } });
  write(path.join(b, '.claude.json'), { mcpServers: { figma: { url: 'https://mcp.figma.com/mcp' } } });
  const rows = M.checks(args(m));
  const dup = rows.find((r) => r.id === 'mcp.homes.duplicate');
  assert.equal(dup.state, 'warn');
  assert.match(dup.detail, /Switchboard home 0123abcd/);
  assert.doesNotMatch(dup.detail, /fedc9876/);
  const sign = rows.find((r) => r.id === 'mcp.homes.signin');
  assert.equal(sign.state, 'info');
  assert.match(sign.detail, /no `switchboard` command found/);
});

test('clean homes read ok; a Switchboard without the report reads info with SB-359', () => {
  const m = machine();
  write(m.claudeJson, { mcpServers: { a: { url: 'https://a.example/mcp' }, b: { command: 'node', args: ['x'] } } });
  write(path.join(m.sbHome('11111111-2222'), '.claude.json'), { mcpServers: { a: { url: 'https://a.example/mcp' } } });
  const calls = [];
  const rows = M.checks(args(m, { switchboardBin: '/bin/switchboard', run: (bin, a) => { calls.push([bin, ...a]); return { code: 2, out: '', err: 'error: unrecognized subcommand' }; } }));
  assert.equal(rows.find((r) => r.id === 'mcp.homes.duplicate').state, 'ok');
  const sign = rows.find((r) => r.id === 'mcp.homes.signin');
  assert.equal(sign.state, 'info');
  assert.match(sign.detail, /SB-359/);
  assert.match(sign.detail, /never reads the keychain/);
  assert.deepEqual(calls, [['/bin/switchboard', 'mcp-homes', '--json']]);
});

test('Switchboard\'s report: a server signed in in some homes and not others is a sign-in warning', () => {
  const m = machine();
  write(m.claudeJson, {});
  write(path.join(m.sbHome('aaaaaaaa-1'), '.claude.json'), {});
  const report = {
    homes: [
      { id: 'default', default: true, servers: [{ name: 'plugin:figma:figma', url: 'https://mcp.figma.com/mcp', signed_in: false }, { name: 'stripe', url: 'https://mcp.stripe.com', signed_in: true }] },
      { id: 'aaaaaaaa-1', label: 'Switchboard home aaaaaaaa', servers: [{ name: 'plugin:figma:figma', url: 'https://mcp.figma.com/mcp/', signed_in: true }, { name: 'stripe', url: 'https://mcp.stripe.com', signed_in: true }] },
    ],
  };
  const rows = M.checks(args(m, { switchboardBin: '/bin/switchboard', run: () => ({ code: 0, out: JSON.stringify(report), err: '' }) }));
  const sign = rows.find((r) => r.id === 'mcp.homes.signin');
  assert.equal(sign.state, 'warn');
  assert.equal(sign.gate, 'sign-in');
  assert.match(sign.detail, /plugin:figma:figma signed in in 1 of 2 \(not in the default home\)/);
  assert.doesNotMatch(sign.detail, /stripe/);
  assert.match(sign.fix, /session\.mode/);
});

test('a report all signed in reads ok; a report of another shape reads info', () => {
  const m = machine();
  write(m.claudeJson, {});
  write(path.join(m.sbHome('bbbbbbbb-1'), '.claude.json'), {});
  const ok = { homes: [{ id: 'default', servers: [{ name: 'x', signed_in: true }] }, { id: 'bbbbbbbb-1', servers: [{ name: 'x', signed_in: true }] }] };
  let rows = M.checks(args(m, { switchboardBin: '/bin/sb', run: () => ({ code: 0, out: JSON.stringify(ok) }) }));
  assert.equal(rows.find((r) => r.id === 'mcp.homes.signin').state, 'ok');
  rows = M.checks(args(m, { switchboardBin: '/bin/sb', run: () => ({ code: 0, out: '{"servers":[]}' }) }));
  const sign = rows.find((r) => r.id === 'mcp.homes.signin');
  assert.equal(sign.state, 'info');
  assert.match(sign.detail, /shape doctor does not read/);
});

test('an unreadable home config is skipped, not a crash', () => {
  const m = machine();
  fs.mkdirSync(path.dirname(m.claudeJson), { recursive: true });
  fs.writeFileSync(m.claudeJson, '{not json');
  const dup = M.checks(args(m)).find((r) => r.id === 'mcp.homes.duplicate');
  assert.equal(dup.state, 'ok');
  assert.match(dup.detail, /could not be read/);
});
