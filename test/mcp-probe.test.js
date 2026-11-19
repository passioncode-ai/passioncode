'use strict';
// PC-170: a server that closes its input before reading made the probe's write fail with EPIPE, an unhandled 'error'
// event that ended `doctor` itself (seen on Linux CI, 2026-11-07).
const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const { probe } = require('../lib/mcp-probe');

test('PC-170: a server that closes its input is a failed probe, never a crash', () => {
  // Which comes first, the server's exit or the failed write, is a race the operating system decides; here the write
  // always fails with EPIPE while the server stays alive. Run apart, so a crash is this child's exit code.
  const script = `
    const cp = require('child_process');
    const real = cp.spawn;
    cp.spawn = (...a) => {
      const child = real(...a);
      setImmediate(() => child.stdin.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' })));
      return child;
    };
    require(${JSON.stringify(require.resolve('../lib/mcp-probe'))})
      .probe({ command: process.execPath, args: ['-e', 'setTimeout(() => {}, 5000)'], timeoutMs: 10000 })
      .then((r) => { process.stdout.write(JSON.stringify(r)); });
  `;
  const run = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8', timeout: 30000 });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'the server closed its input during initialize');
});

test('PC-170: a server that exits at once is a failed probe, never a crash', async () => {
  const result = await probe({ command: process.execPath, args: ['-e', 'process.exit(0)'], timeoutMs: 10000 });
  assert.equal(result.ok, false);
  assert.match(result.reason, /during initialize$/, result.reason);
});

// Two doors (the operator's rule of 2026-11-18): which listed tool is a search door, and what the search call takes.
const { searchDoor, searchArgs } = require('../lib/mcp-probe');

test('two doors: a bare search, or the one <domain>.search beside its <domain>.execute', () => {
  assert.deepEqual(searchDoor(['search', 'execute']), { search: 'search', execute: 'execute' });
  assert.deepEqual(searchDoor(['execute', 'search', 'list_services']), { search: 'search', execute: 'execute' });
  assert.deepEqual(searchDoor(['dashboards.search', 'dashboards.execute']), { search: 'dashboards.search', execute: 'dashboards.execute' });
  assert.equal(searchDoor(['dashboards.search']), null, 'a domain search without its execute is not a door');
  assert.equal(searchDoor(['a.search', 'a.execute', 'b.search', 'b.execute']), null, 'two domains are ambiguous');
  assert.equal(searchDoor(['list_services', 'research_search']), null, 'a tool that merely ends in _search is not a door');
  assert.equal(searchDoor([]), null);
});

test('two doors: search is called with no arguments unless its schema requires a query', () => {
  assert.deepEqual(searchArgs({ type: 'object', properties: { query: { type: 'string' } } }), {});
  assert.deepEqual(searchArgs(undefined), {});
  assert.deepEqual(searchArgs({ type: 'object', required: ['query'] }), { query: '*' });
});
