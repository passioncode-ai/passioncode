#!/usr/bin/env node
// Stand-ins for the macOS tools setup and doctor call, so the tests run on any OS and never touch
// a real app. Each call is appended to $HOME/fake-tools.log. An app bundle's state lives in files:
//   Contents/Info.plist   JSON { CFBundleShortVersionString }
//   BROKEN                codesign, stapler and Gatekeeper reject it
//   TEAM                  the team identifier codesign reports (default KJ35UYYL22)
//   RUNNING               pgrep finds a process running from it
// A release "archive" is JSON { app, version, broken?, team? }; ditto and hdiutil unpack it into a
// bundle whose MCP binary (catalog `mcp.bin`) is test/fake-mcp.js.
const fs = require('fs');
const path = require('path');
const catalog = require('../lib/catalog');

const [tool, ...args] = process.argv.slice(2);
const home = process.env.HOME;
try { fs.appendFileSync(path.join(home, 'fake-tools.log'), `${tool} ${args.join(' ')}\n`); } catch (_) { /* no home */ }
const out = (s) => process.stdout.write(`${s}\n`);
const err = (s) => process.stderr.write(`${s}\n`);
const has = (app, f) => fs.existsSync(path.join(app, f));

function makeApp(archive, destDir) {
  const spec = JSON.parse(fs.readFileSync(archive, 'utf8'));
  const app = path.join(destDir, spec.folder || '', spec.app); // a zip may hold the app inside one folder
  fs.mkdirSync(path.join(app, 'Contents', 'MacOS'), { recursive: true });
  fs.writeFileSync(path.join(app, 'Contents', 'Info.plist'), JSON.stringify({ CFBundleShortVersionString: spec.version }));
  if (spec.broken) fs.writeFileSync(path.join(app, 'BROKEN'), '');
  if (spec.team) fs.writeFileSync(path.join(app, 'TEAM'), spec.team);
  const product = catalog.PRODUCTS.find((p) => p.app === spec.app);
  if (product && product.mcp && product.mcp.bin) {
    const bin = path.join(app, product.mcp.bin);
    fs.mkdirSync(path.dirname(bin), { recursive: true });
    fs.writeFileSync(bin, `#!/bin/sh\nexec "${process.execPath}" "${path.join(__dirname, 'fake-mcp.js')}" ${product.mcp.name} "$@"\n`, { mode: 0o755 });
  }
}

switch (tool) {
  case 'codesign': {
    const app = args[args.length - 1];
    if (args[0] === '--verify') { if (has(app, 'BROKEN')) { err(`${app}: invalid signature (code or signature have been modified)`); process.exit(1); } process.exit(0); }
    if (args[0] === '-dv') { err(`Executable=${app}\nTeamIdentifier=${has(app, 'TEAM') ? fs.readFileSync(path.join(app, 'TEAM'), 'utf8') : catalog.TEAM_ID}`); process.exit(0); }
    process.exit(1);
  }
  case 'xcrun': { const app = args[args.length - 1]; if (has(app, 'BROKEN')) { err('does not have a ticket stapled to it'); process.exit(65); } out('The validate action worked!'); process.exit(0); }
  case 'spctl': { const app = args[args.length - 1]; if (has(app, 'BROKEN')) { err(`${app}: rejected\nsource=no usable signature`); process.exit(3); } err(`${app}: accepted\nsource=Notarized Developer ID`); process.exit(0); }
  case 'plutil': { try { out(JSON.parse(fs.readFileSync(args[args.length - 1], 'utf8')).CFBundleShortVersionString); process.exit(0); } catch (_) { process.exit(1); } }
  case 'pgrep': { const at = args[1].replace(/\/Contents\/MacOS\/$/, ''); process.exit(has(at, 'RUNNING') ? 0 : 1); }
  case 'ditto': {
    if (args[0] === '-x') {
      makeApp(args[2], args[3]);
      // An agent session starts the app's MCP server while the release downloads.
      if (process.env.FAKE_BUSY_DURING_DOWNLOAD) fs.writeFileSync(path.join(process.env.FAKE_BUSY_DURING_DOWNLOAD, 'RUNNING'), '');
      process.exit(0);
    }
    // A copy cut off halfway: part of the bundle written, then a failure.
    if (process.env.FAKE_DITTO_COPY_FAIL) { fs.mkdirSync(path.join(args[1], 'Contents'), { recursive: true }); err('ditto: interrupted'); process.exit(1); }
    fs.cpSync(args[0], args[1], { recursive: true }); process.exit(0);
  }
  case 'hdiutil': {
    if (args[0] === 'attach') { makeApp(args[args.length - 1], args[args.indexOf('-mountpoint') + 1]); process.exit(0); }
    process.exit(0); // detach
  }
  case 'docker': if (args[0] === 'info') out('27.0.0'); else out('Docker version 27.0.0'); process.exit(0);
  case 'supabase': out('2.0.0'); process.exit(0);
  case 'launchctl': case 'open': process.exit(0);
  default: err(`fake-tools: unknown ${tool}`); process.exit(127);
}
