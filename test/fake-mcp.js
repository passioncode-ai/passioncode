#!/usr/bin/env node
// A stdio MCP server standing in for an app's bundled one: answers initialize, tools/list and
// tools/call for the app's proving tool and logs each start to $HOME/fake-mcp.log.
// FAKE_MCP_BROKEN=<name> makes that server's tool answer an error.
// FAKE_MCP_DOORS=<name> makes that server list only the two doors, `search` and `execute`, the way
// an MCP server built on the operator's two-door rule (2026-11-18) does; FAKE_MCP_DOORS_DOMAIN=<d>
// names them `<d>.search` and `<d>.execute`. FAKE_MCP_NONE=<name> makes it list one unrelated tool.
// FAKE_MCP_SEARCH_ANSWER=bare makes a search answer carry no content (not well-formed).
// Each tools/call is logged as `<name> <tool> <arguments>` to $HOME/fake-mcp-calls.log.
const fs = require('fs');
const path = require('path');
const name = process.argv[2] || 'fake';
try { fs.appendFileSync(path.join(process.env.HOME, 'fake-mcp.log'), `${name} ${process.argv.slice(3).join(' ')}\n`); } catch (_) { /* no home */ }
const own = { switchboard: ['switchboard_accounts'], 'fabric-dashboards': ['list_services'], fabric: ['fabric_whoami'], observatory: ['observatory_status'] }[name] || [];
const domain = process.env.FAKE_MCP_DOORS_DOMAIN;
const doors = domain ? [`${domain}.search`, `${domain}.execute`] : ['search', 'execute'];
const tools = process.env.FAKE_MCP_DOORS === name ? doors : process.env.FAKE_MCP_NONE === name ? ['something_else'] : own;
const isSearch = (t) => t === 'search' || /\.search$/.test(t);
let buf = '';
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    const m = JSON.parse(line);
    if (m.id === undefined) continue;
    let result;
    if (m.method === 'initialize') result = { protocolVersion: m.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name, version: '9.9.9' } };
    else if (m.method === 'tools/list') result = { tools: tools.map((t) => ({ name: t, inputSchema: { type: 'object' } })) };
    else if (m.method === 'tools/call') {
      try { fs.appendFileSync(path.join(process.env.HOME, 'fake-mcp-calls.log'), `${name} ${m.params.name} ${JSON.stringify(m.params.arguments)}\n`); } catch (_) { /* no home */ }
      if (process.env.FAKE_MCP_BROKEN === name) result = { isError: true, content: [{ type: 'text', text: 'broken on purpose' }] };
      else if (isSearch(m.params.name)) result = process.env.FAKE_MCP_SEARCH_ANSWER === 'bare' ? {} : { content: [{ type: 'text', text: JSON.stringify({ operations: own.map((o) => ({ name: o, effect: 'read' })) }) }] };
      else result = { content: [{ type: 'text', text: '{}' }] };
    }
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
  }
});
