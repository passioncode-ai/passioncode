'use strict';
/**
 * The PassionCode.ai apps `setup` installs and `doctor` checks: where each is released, which
 * asset is its macOS build, where it lives once installed, its MCP server and the one read-only
 * call that proves the server answers, and the product's own onboarding step. Public facts only;
 * each is the product's own documentation (named per entry).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TEAM_ID = 'KJ35UYYL22'; // Developer ID Application team of every PassionCode.ai macOS build
const SITE = 'https://passioncode.ai';

/** Agents the launcher registers MCP servers for: `cli` is detected by its command, the rest by a directory. */
const AGENTS = [
  { id: 'claude', name: 'Claude Code', fabricRunner: 'claude-code' },
  { id: 'codex', name: 'Codex CLI', fabricRunner: 'codex' },
  { id: 'gemini', name: 'Gemini CLI', fabricRunner: null }, // fabric-mcp has no Gemini runner
  { id: 'kimi', name: 'Kimi Code', fabricRunner: 'kimi-code' },
];

const PRODUCTS = [
  {
    // fabric-switchboard docs/INSTALL.md, docs/AGENT-ONBOARDING.md
    id: 'switchboard', name: 'Fabric Switchboard', repo: 'passioncode-ai/fabric-switchboard',
    app: 'Fabric Switchboard.app', page: `${SITE}/switchboard/`,
    asset: (v) => `Fabric-Switchboard-${v}-macos-universal.zip`,
    mcp: {
      name: 'switchboard', bin: 'Contents/MacOS/switchboard', args: () => ['mcp'],
      claudePlugin: 'switchboard@', prove: { tool: 'switchboard_accounts', args: {} },
    },
    guide: 'Fabric Switchboard: your agent runs `switchboard onboard --status --json` and follows it; you sign in to each coding-agent account in the app.',
  },
  {
    // fabric-dashboards README "Install", src/core/setup.ts
    id: 'dashboards', name: 'Fabric Dashboards', repo: 'passioncode-ai/fabric-dashboards', scheme: 'fabric-dashboards',
    app: 'Fabric Dashboards.app', page: `${SITE}/dashboards/`,
    asset: (v) => `Fabric-Dashboards-${v}-mac.zip`,
    mcp: { name: 'fabric-dashboards', bin: 'Contents/Resources/bin/fabric-dashboards-mcp', args: () => [], prove: { tool: 'list_services', args: {} } },
    guide: 'Fabric Dashboards: open it once; its first session is a Setup console your coding agent runs.',
  },
  {
    // project-observatory-dashboard docs/AGENT-ONBOARDING.md (`full onboard`)
    id: 'observatory', name: 'Project Observatory', repo: 'passioncode-ai/project-observatory-dashboard',
    app: 'Project Observatory.app', page: `${SITE}/observatory/`,
    asset: (v) => `ProjectObservatory-${v}-macos.zip`,
    serviceIds: ['project-observatory'],
    mcp: { name: 'observatory', external: true, prove: { tool: 'observatory_status', args: {} } },
    guide: 'Project Observatory: your agent runs `project-observatory full onboard` and follows it (it registers the `observatory` MCP server); secrets go in through its hidden prompt, never the chat.',
  },
  {
    // fabric-inbox docs/agents/onboard.md (B-79)
    id: 'inbox', name: 'Fabric Inbox', repo: 'passioncode-ai/fabric-inbox', scheme: 'fabric-inbox',
    app: 'Fabric Inbox.app', page: `${SITE}/inbox/`,
    asset: (v) => `Fabric-Inbox-${v}-mac.zip`,
    mcp: { name: 'fabric-inbox', external: true, remote: true },
    guide: 'Fabric Inbox: your agent follows its onboard guide (github.com/passioncode-ai/fabric-inbox, docs/agents/onboard.md) to create your mail server; you enter the Cloudflare token in its hidden prompt, sign in with the emailed code and press Allow.',
  },
  {
    // fabric apps/desktop/resources/bin/fabric-mcp, src/main/fabricMcpMain.ts
    id: 'fabric', name: 'Fabric', repo: 'passioncode-ai/fabric', scheme: 'fabric', preview: true, prerelease: true,
    app: 'Fabric.app', page: `${SITE}/fabric/`,
    asset: (v) => `Fabric-${v}-universal.dmg`,
    needs: ['docker', 'supabase'],
    mcp: {
      name: 'fabric', bin: 'Contents/Resources/bin/fabric-mcp',
      args: (agent) => (agent.fabricRunner ? ['--runner', agent.fabricRunner] : null),
      // fabric-mcp enrols a session with Fabric's hub as soon as it starts (fabricMcpMain.ts runs
      // proxy.run at start), so doctor never starts it: it checks the entry and the binary, and the
      // agent's own `fabric_whoami` is the proving call.
      prove: null, spawn: false,
    },
    guide: 'Fabric (early preview): open it and finish its first run; Docker or OrbStack must be running. Then your agent calls `fabric_whoami` once to prove its MCP server.',
  },
];

const SHARED_APPLICATIONS = '/Applications';
/** The shared folder: `/Applications`; `PASSIONCODE_SHARED_APPLICATIONS` moves it for tests, so none reaches the machine's own. */
const sharedDir = () => process.env.PASSIONCODE_SHARED_APPLICATIONS || SHARED_APPLICATIONS;

/** The one folder `PASSIONCODE_APPLICATIONS` names for every app, or null: then each app follows `appPath`'s rule. */
function appsDir() { return process.env.PASSIONCODE_APPLICATIONS || null; }

/**
 * Where an app is, or goes, for this macOS user (PC-145, PC-146, PC-147): the copy in the user's own `~/Applications`
 * when there is one; else a copy in `/Applications` this user owns and may replace (the folder writable to them), which
 * stays where it is; else `~/Applications`, made when absent. Another user's copy in `/Applications`, or one this user
 * cannot replace, is never theirs: it is left as it is (`sharedCopy` names it). One copy per user is the
 * organization's rule for a Mac with several users (fabric-workspace studio-spaces README, "The apps themselves").
 */
function appPath(product, { home = os.homedir(), shared = sharedDir(), uid = typeof process.getuid === 'function' ? process.getuid() : null } = {}) {
  const only = appsDir();
  if (only) return path.join(only, product.app);
  const own = path.join(home, 'Applications', product.app);
  if (fs.existsSync(own)) return own;
  const there = path.join(shared, product.app);
  return mayReplace(there, uid) ? there : own;
}

/** Whether a bundle exists, is this user's, and its folder lets this user swap it. */
function mayReplace(bundle, uid) {
  let st;
  try { st = fs.statSync(bundle); } catch (_) { return false; }
  if (uid !== null && st.uid !== uid) return false;
  // Moving a folder bundle into the Trash also needs write on the bundle itself (macOS refuses the rename otherwise).
  try { fs.accessSync(path.dirname(bundle), fs.constants.W_OK); fs.accessSync(bundle, fs.constants.W_OK); } catch (_) { return false; }
  return true;
}

/**
 * A copy of the app in `/Applications` this user does not use, with why: `admin` (owned by root: a package or an
 * administrator installed it), `other-user` (another user's), `not-writable`
 * (its folder does not let this user replace it) or `own` (this user's, left there beside the copy in `~/Applications`);
 * null when there is none or it is the one in use.
 */
function sharedCopy(product, opts = {}) {
  if (appsDir()) return null;
  const there = path.join(opts.shared || sharedDir(), product.app);
  if (!fs.existsSync(there) || appPath(product, opts) === there) return null;
  const uid = 'uid' in opts ? opts.uid : (typeof process.getuid === 'function' ? process.getuid() : null);
  let owner = null;
  try { owner = fs.statSync(there).uid; } catch (_) { /* gone meanwhile */ }
  const why = uid !== null && owner !== uid ? (owner === 0 ? 'admin' : 'other-user') : mayReplace(there, uid) ? 'own' : 'not-writable';
  return { path: there, why };
}

/**
 * The folder that keeps this user from putting the app at its place, or null when they can (PC-147): the nearest folder
 * on the way that exists, when it is not writable to them. Checked before anything is downloaded.
 */
function blockedFolder(target) {
  let dir = path.dirname(target);
  while (!fs.existsSync(dir)) { const up = path.dirname(dir); if (up === dir) break; dir = up; }
  try { fs.accessSync(dir, fs.constants.W_OK); } catch (_) { return dir; }
  // A bundle already there is moved into the Trash first, which macOS refuses when the bundle itself is not writable.
  if (fs.existsSync(target)) { try { fs.accessSync(target, fs.constants.W_OK); } catch (_) { return target; } }
  return null;
}

/**
 * doctor's line for a copy left in /Applications (PC-146): whose it is, and that macOS may open the app's links with it
 * (`instead of yours` when this user has a copy of their own).
 */
function sharedNote(product, label, copy, installed) {
  const whose = { admin: 'one an administrator installed', 'other-user': "another user's", 'not-writable': 'one you cannot replace', own: 'your own earlier copy' }[copy.why];
  const links = product.scheme ? `; macOS may open ${product.scheme}:// links with it${installed ? ' instead of yours' : ''}` : '';
  return `${label}: the copy in ${copy.path} is ${whose}, left as it is${links}`;
}

/** What `setup` and `doctor` say about a place this user cannot write (PC-147). */
function blockedNote(where) {
  return `${where} is not writable for you, so nothing is downloaded: ${appsDir() ? 'unset PASSIONCODE_APPLICATIONS to use ~/Applications, or ' : ''}ask an administrator to let you write it`;
}

/** The stdio command of a product's MCP server for one agent, or null (not bundled / no runner). */
function mcpCommand(product, agent) {
  const m = product.mcp;
  if (!m || m.external || !m.bin) return null;
  const override = product.id === 'dashboards' ? process.env.PASSIONCODE_FABRIC_DASHBOARDS_MCP : null;
  const command = override || path.join(appPath(product), m.bin);
  const args = m.args(agent);
  return args ? { command, args } : null;
}

function byId(id) { return PRODUCTS.find((p) => p.id === id) || null; }

module.exports = { PRODUCTS, AGENTS, TEAM_ID, SITE, SHARED_APPLICATIONS, appsDir, appPath, sharedCopy, sharedNote, blockedFolder, blockedNote, mcpCommand, byId };
