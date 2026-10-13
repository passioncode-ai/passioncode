#!/usr/bin/env node
// A stdio MCP server standing in for an app's bundled one: answers initialize, tools/list and
// tools/call for the tool named by FAKE_MCP_TOOLS (comma list) and logs each start to
// $HOME/fake-mcp.log. FAKE_MCP_BROKEN=<name> makes that server's tool answer an error.
const fs = require('fs');
const path = require('path');
const name = process.argv[2] || 'fake';
try { fs.appendFileSync(path.join(process.env.HOME, 'fake-mcp.log'), `${name} ${process.argv.slice(3).join(' ')}\n`); } catch (_) { /* no home */ }
const tools = { switchboard: ['switchboard_accounts'], 'fabric-dashboards': ['list_services'], fabric: ['fabric_whoami'], observatory: ['observatory_status'] }[name] || [];
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
    else if (m.method === 'tools/call') result = process.env.FAKE_MCP_BROKEN === name ? { isError: true, content: [{ type: 'text', text: 'broken on purpose' }] } : { content: [{ type: 'text', text: '{}' }] };
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: m.id, result }) + '\n');
  }
});
