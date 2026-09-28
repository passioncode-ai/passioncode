#!/usr/bin/env node
// A stand-in for the `claude` CLI: records every call and keeps the two plugin
// registries the launcher reads, the way Claude Code does.
const fs = require('fs');
const path = require('path');
const home = process.env.HOME;
const dir = path.join(home, '.claude', 'plugins');
fs.mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2);
fs.appendFileSync(path.join(home, 'claude-calls.log'), args.join(' ') + '\n');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return d; } };
const write = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2));
if (args[0] === '--version') { console.log('2.1.0 (Claude Code)'); process.exit(0); }
if (process.env.FAKE_CLAUDE_FAIL && args.join(' ').includes(process.env.FAKE_CLAUDE_FAIL)) { console.error('simulated failure'); process.exit(1); }
const known = read('known_marketplaces.json', {});
const installed = read('installed_plugins.json', { version: 2, plugins: {} });
const [, verb, a, b] = args;
if (verb === 'marketplace' && a === 'add') { known.passioncode = { source: { source: 'directory', path: b } }; write('known_marketplaces.json', known); }
else if (verb === 'marketplace' && a === 'update') { /* re-read */ }
else if (verb === 'marketplace' && a === 'remove') { delete known[b]; write('known_marketplaces.json', known); }
else if (verb === 'install' || verb === 'update') {
  const [name, mkt] = a.split('@');
  const src = mkt === 'passioncode' ? path.join(known.passioncode.source.path, 'plugins', name) : '/nowhere';
  if (!fs.existsSync(src)) { console.error(`Plugin ${a} not found`); process.exit(1); }
  installed.plugins[a] = [{ scope: 'user', installPath: src, version: JSON.parse(fs.readFileSync(path.join(src, '.claude-plugin/plugin.json'), 'utf8')).version }];
  write('installed_plugins.json', installed);
} else if (verb === 'uninstall') { delete installed.plugins[a]; write('installed_plugins.json', installed); }
