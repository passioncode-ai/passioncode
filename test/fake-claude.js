#!/usr/bin/env node
// A stand-in for the `claude` CLI: records every call and keeps the plugin
// registries and the user settings the launcher reads, the way Claude Code 2.x
// does (checked against the real CLI in a temp HOME on 2026-09-29):
//   marketplace add <dir|owner/repo>  registers it AND declares it in settings.json
//   marketplace remove <name>         drops both; "not found" (exit 1) when unregistered
//   marketplace list --json           [{ name, source, ... }]
//   mcp add --scope user <name> -- <command>   writes { type: 'stdio', command, args, env } to
//                                              ~/.claude.json mcpServers, keeping the rest
//   mcp remove --scope user <name>             drops it; exit 1 when there is none
const fs = require('fs');
const path = require('path');
const home = process.env.HOME;
const dir = path.join(home, '.claude', 'plugins');
const settingsFile = path.join(home, '.claude', 'settings.json');
fs.mkdirSync(dir, { recursive: true });
const args = process.argv.slice(2);
fs.appendFileSync(path.join(home, 'claude-calls.log'), args.join(' ') + '\n');
const read = (f, d) => { try { return JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (_) { return d; } };
const write = (f, v) => fs.writeFileSync(path.join(dir, f), JSON.stringify(v, null, 2));
// A settings.json that does not parse is left as it is (null), never overwritten.
const readSettings = () => { try { return JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch (e) { return e.code === 'ENOENT' ? {} : null; } };
const writeSettings = (v) => { if (v) fs.writeFileSync(settingsFile, JSON.stringify(v, null, 2)); };
if (args[0] === '--version') { console.log('2.1.0 (Claude Code)'); process.exit(0); }
if (process.env.FAKE_CLAUDE_FAIL && args.join(' ').includes(process.env.FAKE_CLAUDE_FAIL)) { console.error('simulated failure'); process.exit(1); }
if (args[0] === 'mcp') {
  const claudeJson = path.join(home, '.claude.json');
  const doc = (() => { try { return JSON.parse(fs.readFileSync(claudeJson, 'utf8')); } catch (_) { return {}; } })();
  const rest = args.slice(2).filter((x, i, all) => x !== '--scope' && all[i - 1] !== '--scope');
  if (args[1] === 'add') {
    const [name, dash, command, ...cmdArgs] = rest;
    if (dash !== '--' || !command) { console.error('usage'); process.exit(1); }
    doc.mcpServers = { ...(doc.mcpServers || {}), [name]: { type: 'stdio', command, args: cmdArgs, env: {} } };
  } else if (args[1] === 'remove') {
    if (!doc.mcpServers || !doc.mcpServers[rest[0]]) { console.error(`No MCP server found with name: ${rest[0]}`); process.exit(1); }
    delete doc.mcpServers[rest[0]];
  }
  fs.writeFileSync(claudeJson, JSON.stringify(doc, null, 2));
  process.exit(0);
}
const known = read('known_marketplaces.json', {});
const installed = read('installed_plugins.json', { version: 2, plugins: {} });
const [, verb, a, b] = args;
if (verb === 'marketplace' && a === 'add') {
  const manifest = path.join(b, '.claude-plugin', 'marketplace.json');
  let name;
  let source;
  if (fs.existsSync(manifest)) {
    name = JSON.parse(fs.readFileSync(manifest, 'utf8')).name;
    source = { source: 'directory', path: b };
  } else {
    // owner/repo: the real CLI reads the name from the repository; the test names it here.
    const names = (() => { try { return JSON.parse(fs.readFileSync(path.join(home, 'fake-marketplace-names.json'), 'utf8')); } catch (_) { return {}; } })();
    name = names[b] || b.split('/').pop();
    source = { source: 'github', repo: b };
  }
  known[name] = { source, installLocation: path.join(dir, 'marketplaces', name), lastUpdated: new Date().toISOString() };
  write('known_marketplaces.json', known);
  const s = readSettings();
  if (s) s.extraKnownMarketplaces = { ...(s.extraKnownMarketplaces || {}), [name]: { source } };
  writeSettings(s);
} else if (verb === 'marketplace' && a === 'update') { /* re-read */ }
else if (verb === 'marketplace' && a === 'remove') {
  if (!known[b]) { console.error(`✘ Failed to remove marketplace: Marketplace '${b}' not found`); process.exit(1); }
  delete known[b];
  write('known_marketplaces.json', known);
  const s = readSettings();
  if (s && s.extraKnownMarketplaces && s.extraKnownMarketplaces[b]) { delete s.extraKnownMarketplaces[b]; writeSettings(s); }
} else if (verb === 'marketplace' && a === 'list') {
  console.log(JSON.stringify(Object.entries(known).map(([name, v]) => ({ name, ...v.source, installLocation: v.installLocation }))));
} else if (verb === 'install' || verb === 'update') {
  if (process.env.FAKE_CLAUDE_SKIP_PLUGIN) process.exit(0);
  const [name, mkt] = a.split('@');
  const src = mkt === 'passioncode' ? path.join(known.passioncode.source.path, 'plugins', name) : '/nowhere';
  if (!fs.existsSync(src)) { console.error(`Plugin ${a} not found`); process.exit(1); }
  installed.plugins[a] = [{ scope: 'user', installPath: src, version: JSON.parse(fs.readFileSync(path.join(src, '.claude-plugin/plugin.json'), 'utf8')).version }];
  write('installed_plugins.json', installed);
} else if (verb === 'uninstall') {
  if (!process.env.FAKE_CLAUDE_SKIP_UNINSTALL) { delete installed.plugins[a]; write('installed_plugins.json', installed); }
}
