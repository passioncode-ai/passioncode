# PassionCode.ai launcher

The **PassionCode.ai launcher** (`@passioncode-ai/passioncode` on npm) installs and updates the
PassionCode.ai skills and plugins listed in [`family.json`](family.json) — the Fabric Agent Adapter,
Observatory Log and the organization's working rules — for Claude Code and every other agent on your machine, as one set.
It is how a teammate's agent gets the tools that build for Fabric, PassionCode.ai's CEO AI agent,
and it works on its own: no Fabric install, no account, no key.

```bash
npx @passioncode-ai/passioncode@latest update
```

| Member | Skills |
|---|---|
| Fabric Agent Adapter | `creating-fabric-agents`, `adapting-projects-to-fabric`, `building-fabric-services` |
| Observatory Log | `explaining-changes`, `handling-secrets`, `tracking-resources` (+ its session hooks) |
| passioncode | `working-in-passioncode` (the organisation's working rules, for every contributor's agent) and the once-a-day update check |

Only PassionCode.ai products are members. Agents that people build for themselves stay
out of it, even when they implement Fabric protocols.

## Quick start for a new teammate

1. **Install** (Node 18 or newer; the Claude Code CLI on `PATH` for the plugins):
   `npx @passioncode-ai/passioncode@latest update`, then restart your agents. Check it with
   `npx @passioncode-ai/passioncode@latest status` (every member `claude: plugin · hub: n/n`) and
   `claude plugin list` (the plugins listed in `family.json`, under `@passioncode`).
   Always call the scoped package shown above.
2. **Configure:** nothing to set, no account and no key. Background updates are on by default;
   `npx @passioncode-ai/passioncode@latest config set update.auto off` turns them off.
3. **MCP:** none today, and not planned. The launcher installs skills and session hooks and is
   driven by its CLI (`update`, `status`, `restore`, `uninstall`, `config`); it neither serves nor
   calls an MCP server. The products it installs for, and the ones that serve MCP (Fabric
   Switchboard, Fabric Inbox, Fabric Dashboards), document their own registration and proving
   call; the Fabric Agent Adapter's quick start builds and calls one.
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
- Each version is an immutable release under `~/.passioncode/releases/<version>`.

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
available for use that does not meet the AGPL's terms — contact@passioncode.ai.
Versions before 0.1.12 were released under PolyForm Noncommercial or Internal Use (v0.1.5 to
v0.1.11) and MIT (v0.1.4 and earlier); each keeps the licence it was released under.
Contributions are accepted under [CLA.md](CLA.md) ([CONTRIBUTING.md](CONTRIBUTING.md)).
