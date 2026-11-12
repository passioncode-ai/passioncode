#!/usr/bin/env node
// Stand-ins for the macOS tools setup and doctor call, so the tests run on any OS and never touch
// a real app. Each call is appended to $HOME/fake-tools.log. An app bundle's state lives in files:
//   Contents/Info.plist   JSON { CFBundleShortVersionString }
//   BROKEN                codesign, stapler and Gatekeeper reject it
//   TEAM                  the team identifier codesign reports (default KJ35UYYL22)
//   RUNNING               pgrep finds a process running from it
// netstat prints the file $FAKE_NETSTAT (a socket table in macOS's `netstat -anv -p tcp` form), or a table
// with no listeners; `{PEER}` in it is the client port the test's server saw last, read from $FAKE_NETSTAT.peer;
// ps answers `-o uid= -p <pid>` from $FAKE_PS_UIDS and $FAKE_PS_UIDS_EXTRA (`pid=uid,pid=uid`), else fails.
// A release "archive" is JSON { app, version, broken?, team? }; ditto and hdiutil unpack it into a
// bundle whose MCP binary (catalog `mcp.bin`) is test/fake-mcp.js.
// PC-178: uv and obsidian-wiki keep their state in $HOME/fake-wiki: `version` (what `uv tool install` installed, its
// command written into $UV_TOOL_BIN_DIR), `hooks.json` (the hooks registered in Claude Code). obsidian-wiki's config is
// $XDG_CONFIG_HOME (else $HOME/.config)/obsidian-wiki/config; `doctor --json` prints $FAKE_WIKI_DOCTOR's file when set.
// $FAKE_UV_FAIL and $FAKE_WIKI_SETUP_FAIL make those commands fail ($FAKE_WIKI_SETUP_FAIL=late writes the config, then
// fails; =quiet exits 0 without a config). Like obsidian-wiki 2026.11.4, an ordinary command (`list`) whose config
// records another version rewrites only that line (its stale refresh) and keeps every other key. brew and xcode-select
// answer as installed ones do.
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
  case 'pgrep': { const at = args[args.length - 1].replace(/^\(\^\| \)/, '').replace(/\/Contents\/MacOS\/$/, '').replace(/\\(.)/g, '$1'); process.exit(has(at, 'RUNNING') ? 0 : 1); }
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
  case 'netstat': {
    if (process.env.FAKE_NETSTAT) {
      let text = fs.readFileSync(process.env.FAKE_NETSTAT, 'utf8');
      if (text.includes('{PEER}')) {
        const peerFile = `${process.env.FAKE_NETSTAT}.peer`;
        const until = Date.now() + 3000;
        while (!fs.existsSync(peerFile) && Date.now() < until) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
        text = text.split('{PEER}').join(fs.existsSync(peerFile) ? fs.readFileSync(peerFile, 'utf8').trim() : '0');
      }
      process.stdout.write(text); process.exit(0);
    }
    out('Active Internet connections (including servers)');
    out('Proto Recv-Q Send-Q  Local Address          Foreign Address        (state)          rxbytes      txbytes  rhiwat  shiwat          process:pid    state  options');
    process.exit(0);
  }
  case 'ps': {
    const pid = args[args.indexOf('-p') + 1];
    const hit = [process.env.FAKE_PS_UIDS, process.env.FAKE_PS_UIDS_EXTRA].filter(Boolean).join(',').split(',').map((x) => x.split('=')).find(([p]) => p === pid);
    if (!hit) { err(`ps: process ${pid} not found`); process.exit(1); }
    out(`  ${hit[1]}`); process.exit(0);
  }
  case 'uv': {
    if (args[0] === '--version') { out('uv 0.9.0'); process.exit(0); }
    const state = path.join(home, 'fake-wiki');
    if (args[0] === 'tool' && args[1] === 'list') { if (fs.existsSync(path.join(state, 'version'))) out(`obsidian-wiki v${fs.readFileSync(path.join(state, 'version'), 'utf8').trim()}\n- obsidian-wiki`); process.exit(0); }
    if (args[0] === 'tool' && args[1] === 'install') {
      if (process.env.FAKE_UV_FAIL) { err('error: Failed to download obsidian-wiki'); process.exit(2); }
      const spec = args.find((a) => a.startsWith('obsidian-wiki=='));
      if (!spec) { err('fake uv: only obsidian-wiki==<version>'); process.exit(2); }
      const dir = process.env.UV_TOOL_BIN_DIR || path.join(home, '.local', 'bin');
      fs.mkdirSync(state, { recursive: true });
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(state, 'version'), spec.split('==')[1]);
      fs.writeFileSync(path.join(dir, 'obsidian-wiki'), `#!/bin/sh\nexec "${process.execPath}" "${__filename}" obsidian-wiki "$@"\n`, { mode: 0o755 });
      out(`Installed 1 executable: obsidian-wiki`); process.exit(0);
    }
    process.exit(2);
  }
  case 'obsidian-wiki': {
    const state = path.join(home, 'fake-wiki');
    const version = (() => { try { return fs.readFileSync(path.join(state, 'version'), 'utf8').trim(); } catch (_) { return null; } })();
    if (!version) process.exit(127); // not installed: the stub on PATH answers as a missing command does
    const config = path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'obsidian-wiki', 'config');
    const hooksFile = path.join(state, 'hooks.json');
    const hooks = (() => { try { return JSON.parse(fs.readFileSync(hooksFile, 'utf8')); } catch (_) { return []; } })();
    const saveHooks = (list) => fs.writeFileSync(hooksFile, JSON.stringify([...new Set(list)]));
    const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
    if (args[0] === '--version') { out(`obsidian-wiki ${version}`); process.exit(0); }
    const recorded = () => { try { return (/OBSIDIAN_WIKI_VERSION="([^"]*)"/.exec(fs.readFileSync(config, 'utf8')) || [])[1] || null; } catch (_) { return null; } };
    if (args[0] === 'list') {
      if (recorded() && recorded() !== version) fs.writeFileSync(config, fs.readFileSync(config, 'utf8').replace(/OBSIDIAN_WIKI_VERSION="[^"]*"/, `OBSIDIAN_WIKI_VERSION="${version}"`));
      out('wiki-update\nwiki-query'); process.exit(0);
    }
    if (args[0] === 'setup') {
      if (process.stdin.isTTY) fs.appendFileSync(path.join(home, 'fake-tools.log'), 'obsidian-wiki setup ran on a terminal\n');
      const vault = args[args.indexOf('--vault') + 1];
      if (process.env.FAKE_WIKI_SETUP_FAIL === 'quiet') process.exit(0);
      fs.mkdirSync(vault, { recursive: true });
      fs.writeFileSync(path.join(vault, 'index.md'), '---\ntitle: Wiki Index\n---\n');
      if (process.env.FAKE_WIKI_SETUP_FAIL && process.env.FAKE_WIKI_SETUP_FAIL !== 'late') { err('error: setup failed'); process.exit(1); }
      fs.mkdirSync(path.dirname(config), { recursive: true });
      fs.writeFileSync(config, `OBSIDIAN_VAULT_PATH="${vault}"\nOBSIDIAN_WIKI_VERSION="${version}"\n`);
      if (process.env.FAKE_WIKI_SETUP_FAIL === 'late') { err('error: setup failed after its config'); process.exit(1); }
      // Like obsidian-wiki's own setup, it makes a skills folder for every agent it knows.
      for (const d of ['.codex/skills', '.gemini/skills', '.gemini/antigravity/skills']) fs.mkdirSync(path.join(home, d), { recursive: true });
      if (!args.includes('--no-hooks')) saveHooks([...hooks, 'SessionStart', 'Stop']);
      out('Setup complete!'); process.exit(0);
    }
    if (args[0] === 'hooks' && args[1] === 'install') { saveHooks([...hooks, ...(only ? [only] : ['SessionStart', 'Stop'])]); process.exit(0); }
    if (args[0] === 'hooks' && args[1] === 'uninstall') { saveHooks(hooks.filter((h) => only && h !== only)); process.exit(0); }
    if (args[0] === 'hooks' && args[1] === 'status') {
      out(JSON.stringify({ hooks: ['SessionStart', 'UserPromptSubmit', 'Stop'].map((event) => ({ event, registered: hooks.includes(event) })), reachability: { reachable: true, hint: '' } }));
      process.exit(0);
    }
    if (args[0] === 'doctor') {
      if (process.env.FAKE_WIKI_DOCTOR) { out(fs.readFileSync(process.env.FAKE_WIKI_DOCTOR, 'utf8')); process.exit(0); }
      if (!fs.existsSync(config)) { out(JSON.stringify({ status: 'fail', checks: [{ name: 'global-config', status: 'fail', detail: `${config} missing`, hint: 'run: obsidian-wiki setup --vault /path/to/your/vault' }] })); process.exit(1); }
      const vault = /OBSIDIAN_VAULT_PATH="([^"]*)"/.exec(fs.readFileSync(config, 'utf8'))[1];
      const lag = recorded() && recorded() !== version
        ? [{ name: 'setup-version', status: 'warn', detail: `setup ran with ${recorded()}; installed package is ${version}`, hint: 'run: obsidian-wiki setup' }] : [];
      out(JSON.stringify({ status: lag.length ? 'warn' : 'pass', checks: [{ name: 'vault-config', status: 'pass', detail: vault, hint: '' }, ...lag, { name: 'session-hooks', status: 'info', detail: 'not registered (optional)', hint: 'run: obsidian-wiki hooks install' }] }));
      process.exit(0);
    }
    process.exit(2);
  }
  case 'brew': out('Homebrew 4.6.0'); process.exit(0);
  case 'xcode-select': out('/Library/Developer/CommandLineTools'); process.exit(0);
  default: err(`fake-tools: unknown ${tool}`); process.exit(127);
}
