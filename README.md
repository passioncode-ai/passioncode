# PassionCode.ai launcher

The **PassionCode.ai launcher** (`@passioncode-ai/passioncode` on npm) sets up PassionCode.ai on a
computer with one command: the apps (Fabric, Fabric Switchboard, Fabric Dashboards, Fabric Inbox,
Project Observatory) from their signed releases, their MCP servers for every coding agent on it,
and the PassionCode.ai skills listed in [`family.json`](family.json). Run the same command on a
computer that is already set up, and it checks everything, repairs what is wrong and tells you
what changed.

```bash
npx @passioncode-ai/passioncode@latest setup     # a new computer: set up · an existing one: check and repair
npx @passioncode-ai/passioncode@latest doctor    # check only; changes nothing
```

| Member | Skills |
|---|---|
| Fabric Agent Adapter | `creating-fabric-agents`, `adapting-projects-to-fabric`, `building-fabric-services` |
| Observatory Log | `explaining-changes`, `handling-secrets`, `tracking-resources` (+ its session hooks) |
| passioncode | `setting-up-passioncode` (set up and check a computer), `working-in-passioncode` (the organisation's working rules, for every contributor's agent) and the once-a-day update check |

Only PassionCode.ai products are members. Agents that people build for themselves stay
out of it, even when they implement Fabric protocols.

## Set it up with your coding agent

Paste this into Claude Code, Codex or another coding agent:

> Set up PassionCode.ai on this computer, or check and repair it if it is already set up. Run
> `npx --yes @passioncode-ai/passioncode@latest setup --yes --json` (it needs Node 18 or newer)
> and read its JSON: it installs the missing apps from their signed releases, the skills and
> every MCP server, repairs whatever is wrong, and checks everything again. Do not download or
> install anything by hand, and never stop or kill a running app. Then run each product
> onboarding step it lists that an agent may run, never ask me for a key or password in the
> chat (the tools open their own hidden prompts), and finish with
> `npx --yes @passioncode-ai/passioncode@latest doctor`. Tell me briefly what you set up or
> fixed, what still fails, and the numbered steps only I can do, such as signing in, and
> remind me to restart you so the new skills and MCP servers load.

Once the skills are installed, "set me up" or "check my setup" is enough: the
`setting-up-passioncode` skill knows the rest. What stays yours: signing in, consenting, typing a
secret into a product's own hidden prompt, starting Docker for Fabric, and restarting your agent.

## Quick start for a new teammate

1. **Install** (Node 18 or newer; the Claude Code CLI on `PATH` for the plugins):
   `npx @passioncode-ai/passioncode@latest setup`, then restart your agents. In a terminal it asks
   one question per app; `--yes` accepts the plan, `--with`/`--without <ids>` choose apps
   (`switchboard`, `dashboards`, `observatory`, `inbox`, `fabric`), `--no-apps` sets up the skills
   and MCP only, `--dry-run` shows the plan. Apps are installed on macOS; on other systems setup
   names each download page. Skills only: `npx @passioncode-ai/passioncode@latest update`.
2. **Configure:** nothing to set, no account and no key. Background updates are on by default;
   `npx @passioncode-ai/passioncode@latest config set update.auto off` turns them off. Each app's
   own onboarding (sign-ins, Fabric Inbox's server, Observatory's projects) is listed by `setup`.
3. **MCP:** the launcher serves no MCP server of its own. It registers the apps' servers —
   `fabric-dashboards`, `fabric` (`fabric-mcp --runner <agent>`) and `switchboard`
   (`switchboard mcp`) — for Claude Code, Codex CLI, Gemini CLI and Kimi Code, and `doctor` proves
   each one with a real call: `initialize`, `tools/list`, then `list_services`,
   `switchboard_accounts` or `observatory_status` (Fabric: `initialize` only — your agent's
   `fabric_whoami` is the first real call). Project Observatory and Fabric Inbox register their
   own servers through their onboarding; `doctor` checks those too.
4. **Develop:** clone, then `npm test` — there are no dependencies and no lockfile, so there is
   nothing to install (`npm ci` refuses to run here). `npm run vendor` builds `payload/` from the
   members pinned in `family.json`; `claude plugin validate ./payload --strict` checks it. Start
   in `lib/launcher.js` (update, restore, status, uninstall) and `bin/passioncode.js` (the CLI);
   [AGENTS.md](AGENTS.md) maps the rest and [CONTRIBUTING.md](CONTRIBUTING.md) the rules.

## How it installs

- **Claude Code** gets plugins from a local marketplace named `passioncode` at
  `~/.passioncode/current` — no GitHub access needed. A plugin that was installed from
  its old single-member marketplace (`fabric-agent-adapter@fabric-agent-adapter`,
  `observatory-log@observatory-log`) is replaced once the new one is verified, and that
  marketplace is unregistered and taken out of `settings.json` once nothing installed
  comes from it.
- **Every other agent** (Cursor, Codex, Gemini, OpenCode, Kiro, Windsurf, Goose, …) gets
  the same skills through `~/.agents/skills`, linked from each channel that exists on
  the machine.
- Updates create no skill copies in `~/.claude/skills`: a plain copy there shadows the plugin. Such
  copies, and hub entries that pointed at a repository's working tree, are moved into
  `~/.passioncode/quarantine/` — `npx @passioncode-ai/passioncode@latest restore` puts them back.
- Each version is an immutable release under `~/.passioncode/releases/<version>`; an update
  keeps the release it replaced for rollback and removes older ones.
- `update` (and therefore `setup`) registers the MCP server inside each installed app — Fabric
  Dashboards (`fabric-dashboards`), Fabric (`fabric`, with each agent's own `--runner`) and Fabric
  Switchboard (`switchboard`, unless Claude Code already gets it from the `switchboard` plugin) —
  for every agent that is present: Claude Code (through `claude mcp add --scope user`), Codex CLI
  (`~/.codex/config.toml`), Gemini CLI (`~/.gemini/settings.json`) and Kimi Code
  (`~/.kimi-code/mcp.json`). An entry that already exists is left alone; one that points elsewhere
  is reported and kept. `restore` and `uninstall` remove what the launcher added
  ([ADR-0003](docs/adr/0003-fabric-dashboards-mcp-registration.md),
  [ADR-0004](docs/adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md)).

## Setup and doctor

`setup` checks first, then installs the absent apps you chose, repairs what the checks found,
checks again and prints a before → after table and the steps that stay yours. On a healthy
computer it changes nothing and exits 0. An app is installed only after its release's
`SHA256SUMS.asc` verifies against the PassionCode.ai release key bundled in this package
(fingerprint `63B3 0DC3 24BD 6974 87AA 3194 4FAF B8AE C803 B6A7`), the file matches the signed
checksum and GitHub's digest, and the app passes `codesign`, carries team `KJ35UYYL22`, has its
notarization ticket stapled and is accepted by Gatekeeper. An outdated or damaged app is
reinstalled only when it is not running; the old one goes to the Trash. A family service that
does not answer is started through launchd (`launchctl kickstart`, never a kill).

`doctor` changes nothing. It reads prerequisites, the skill set, each app's version, signature
and team, each agent's MCP entries with one proving call per server, and the Fabric services of
the family; each line names its state and its fix. Exit codes: **0** no check failed, **1** a
check (or a setup step) failed, **2** bad arguments. `doctor --fix` runs setup's repairs without
installing new apps. Details: the [CLI contract](docs/reference/cli.md#setup-and-doctor).

## Staying current

At Claude Code session start the `passioncode` plugin uses a cached npm check for up
to 24 hours and, when a newer set is out **and every npm account that publishes it is in the
plugin's `trust.json`**, updates to that exact version in the background — it takes
effect in the next session. A version published by anyone else is named and not
installed ([SECURITY.md](SECURITY.md#the-self-update-and-who-it-trusts)).
`npx @passioncode-ai/passioncode@latest config set update.auto off` makes it only say so.

`status` reads local state without contacting npm. Its npm version is labelled
`npm latest (cached)` with the saved check timestamp, or `check time unknown`.
When that stable version is below the installed stable version, the line also says
`stale: older than installed`. A newer or equal cached version is still a saved
observation, not a live registry check. With no saved version it says
`npm latest: not checked`; `--json` retains the raw `latest` and `checkedAt` fields.

```bash
npx @passioncode-ai/passioncode@latest status   # the installed release: its members, their channels, shadows
npx @passioncode-ai/passioncode@latest update --dry-run
npx @passioncode-ai/passioncode@latest uninstall
```

For supported flags, JSON fields, exit codes and partial-failure recovery, read the
[CLI contract](docs/reference/cli.md). `restore` repairs the latest quarantine batch;
it is not a release rollback. A successful `uninstall` preserves recovery files and
turns automatic updates off. Unsupported flags are rejected before mutation.

Repository docs describe the current source. See the [documentation index](docs/README.md)
and dated handoffs for which changes have actually been published or installed.

## Release (maintainers)

1. Tag every member at the version to ship; set `ref` to that tag in `family.json`.
2. Bump `version` in `package.json` and `plugin/passioncode/.claude-plugin/plugin.json`
   (a test holds them and the CHANGELOG in sync), add the CHANGELOG section.
3. The npm account that publishes must be listed in `plugin/passioncode/trust.json`
   (`npmPublishers`), and be the package's only kind of maintainer — otherwise every
   installed hook refuses the update and says so.
4. Merge, then tag the merge commit `vX.Y.Z` and push the tag. `.github/workflows/release.yml`
   validates, checks the tag against both manifests, creates the GitHub release from the
   CHANGELOG section, vendors every member **from its own repository** at its pinned tag,
   runs the tests, exercises packed update/status/uninstall with a fake Claude CLI
   in a temporary home (`node scripts/smoke-pack.mjs`), publishes
   `@passioncode-ai/passioncode` and waits until npm serves it. It runs when the repository
   variables `RELEASE_ENABLED` and `PUBLISH_NPMJS` are `true`; npm auth is trusted publishing
   (OIDC) or the `NPM_TOKEN` secret; a private member needs `MEMBERS_READ_TOKEN`.
   By hand, `npm publish` still works: `prepublishOnly` vendors from tags only (`--release`),
   refuses credential-shaped strings and runs the tests.
5. `npx @passioncode-ai/passioncode@<version> update` on each machine; restart the agents.

Vendoring clones every member from its own repository at its tag. A maintainer with
local clones can point the vendor at them instead — `PASSIONCODE_CHECKOUT_ROOT=<dir>`
reads a member from `<dir>/<repository name>`, and `PASSIONCODE_CHECKOUT_<MEMBER>=<path>`
(the member's name upper-cased, `-` as `_`) names one clone kept under another name.
`PASSIONCODE_VENDOR_CLONE=1` ignores both. `family.json` names no machine paths.

## License

Open source under the [GNU AGPL-3.0](LICENSE). A [commercial license](COMMERCIAL-LICENSE.md) is
available for use that does not meet the AGPL's terms — [passioncode.ai/business](https://passioncode.ai/business/).
Versions before 0.1.12 were released under PolyForm Noncommercial or Internal Use (v0.1.5 to
v0.1.11) and MIT (v0.1.4 and earlier); each keeps the licence it was released under.
Contributions are accepted under [CLA.md](CLA.md) ([CONTRIBUTING.md](CONTRIBUTING.md)).
