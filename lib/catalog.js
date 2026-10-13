'use strict';
/**
 * The PassionCode.ai apps `setup` installs and `doctor` checks: where each is released, which
 * asset is its macOS build, where it lives once installed, its MCP server and the one read-only
 * call that proves the server answers, and the product's own onboarding step. Public facts only;
 * each is the product's own documentation (named per entry).
 */
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
    id: 'dashboards', name: 'Fabric Dashboards', repo: 'passioncode-ai/fabric-dashboards',
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
    id: 'inbox', name: 'Fabric Inbox', repo: 'passioncode-ai/fabric-inbox',
    app: 'Fabric Inbox.app', page: `${SITE}/inbox/`,
    asset: (v) => `Fabric-Inbox-${v}-mac.zip`,
    mcp: { name: 'fabric-inbox', external: true, remote: true },
    guide: 'Fabric Inbox: your agent follows its onboard guide (github.com/passioncode-ai/fabric-inbox, docs/agents/onboard.md) to create your mail server; you enter the Cloudflare token in its hidden prompt, sign in with the emailed code and press Allow.',
  },
  {
    // fabric apps/desktop/resources/bin/fabric-mcp, src/main/fabricMcpMain.ts
    id: 'fabric', name: 'Fabric', repo: 'passioncode-ai/fabric', preview: true, prerelease: true,
    app: 'Fabric.app', page: `${SITE}/fabric/`,
    asset: (v) => `Fabric-${v}-universal.dmg`,
    needs: ['docker', 'supabase'],
    mcp: {
      name: 'fabric', bin: 'Contents/Resources/bin/fabric-mcp',
      args: (agent) => (agent.fabricRunner ? ['--runner', agent.fabricRunner] : null),
      // `fabric_whoami` enrols a session in a project: doctor stops at `initialize` and leaves the
      // real proving call to the agent.
      prove: null,
    },
    guide: 'Fabric (early preview): open it and finish its first run; Docker or OrbStack must be running. Then your agent calls `fabric_whoami` once to prove its MCP server.',
  },
];

function appsDir() { return process.env.PASSIONCODE_APPLICATIONS || '/Applications'; }
function appPath(product) { return path.join(appsDir(), product.app); }

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

module.exports = { PRODUCTS, AGENTS, TEAM_ID, SITE, appsDir, appPath, mcpCommand, byId };
