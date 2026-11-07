# PassionCode.ai launcher

The **PassionCode.ai launcher** (`@passioncode-ai/passioncode` on npm) sets up PassionCode.ai on a
computer with one command: the apps (Fabric, Fabric Switchboard, Fabric Dashboards, Fabric Inbox,
Project Observatory) from their signed releases, their MCP servers for every coding agent on it,
and the PassionCode.ai skills listed in [`family.json`](family.json). Run the same command on a
computer that is already set up, and it checks everything, repairs what is wrong and tells you
what changed.

```bash
npx @passioncode-ai/passioncode@latest setup     # a new computer: set up · an existing one: check and repair
npx @passioncode-ai/passioncode@latest doctor    # check only; changes nothing (apart from anonymous counts)
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
> remind me to restart you so the new skills and MCP servers load. If the launcher prints a line
> about anonymous usage counts, give it to me word for word. If a `[passioncode]` line at the start
> of this session says to keep using a version, use that version instead of `@latest` and tell me why.

Once the skills are installed, "set me up" or "check my setup" is enough: the
`setting-up-passioncode` skill knows the rest. What stays yours: signing in, consenting, typing a
secret into a product's own hidden prompt, starting Docker for Fabric, unlocking a folder setup cannot write (or asking
an administrator), and restarting your agent.

## Quick start for a new teammate

1. **Install** (Node 18 or newer; the Claude Code CLI on `PATH` for the plugins):
   `npx @passioncode-ai/passioncode@latest setup`, then restart your agents. In a terminal it asks
   one question per absent app (on macOS; one whose folder you cannot write is named instead, SCN-017), one for the repairs, if any are left, one for Claude Code's rules for PassionCode's own tools where Claude Code is and they are missing, and one for the rules for commands where Claude Code is and any are missing (an app you install that bundles an MCP server runs the skill and MCP update itself; a `--json` run never asks); `--yes` accepts the plan, `--with`/`--without <ids>` choose apps
   (`switchboard`, `dashboards`, `observatory`, `inbox`, `fabric`), `--no-apps` sets up the skills
   and MCP only, `--dry-run` shows the plan, `--allow-tools` lets Claude Code use PassionCode's own tools without asking and
   `--allow-commands` run the commands setup lists, such as `gh pr merge` (each offered as its own question in a
   terminal, never by `--yes` alone). Apps are installed on macOS; on other systems setup
   names each download page, and on Windows `doctor` reads which version of each app is installed. Skills only: `npx @passioncode-ai/passioncode@latest update`.
2. **Configure:** nothing to set, no account and no key. Background updates are on by default;
   `npx @passioncode-ai/passioncode@latest config set update.auto off` turns them off. The launcher's anonymous
   usage and error counts are on by default too ([what is sent](docs/analytics-events.md));
   `npx @passioncode-ai/passioncode@latest analytics off` turns them off for the launcher (each PassionCode app has its
   own switch in its settings). Each app's
   own onboarding (sign-ins, Fabric Inbox's server, Observatory's projects) is listed by `setup`.
3. **MCP:** the launcher serves no MCP server of its own. It registers the apps' servers
   (`fabric-dashboards`, `fabric` with `fabric-mcp --runner <agent>`, and `switchboard` with
   `switchboard mcp`) for Claude Code, Codex CLI, Gemini CLI and Kimi Code, and `doctor` proves
   each one with a real call: `initialize`, `tools/list`, then `list_services`,
   `switchboard_accounts` or `observatory_status`. Fabric's server is never started by doctor,
   because it enrols a session as it starts: doctor checks its entry, and your agent's first
   `fabric_whoami` is the proving call. Fabric is an early preview, so only `setup` registers it,
   never a background update. Project Observatory and Fabric Inbox register their
   own servers through their onboarding; `doctor` checks those too.
4. **Develop:** clone, then `npm test`. There are no dependencies and no lockfile, so there is
   nothing to install (`npm ci` refuses to run here). `npm run vendor` builds `payload/` from the
   members pinned in `family.json`; `claude plugin validate ./payload --strict` checks it. Start
   in `lib/launcher.js` (update, restore, status, uninstall) and `bin/passioncode.js` (the CLI);
   [AGENTS.md](AGENTS.md) maps the rest and [CONTRIBUTING.md](CONTRIBUTING.md) the rules.

## How it installs

- **Claude Code** gets plugins from a local marketplace named `passioncode` at
  `~/.passioncode/current`, with no GitHub access needed. A plugin that was installed from
  its old single-member marketplace (`fabric-agent-adapter@fabric-agent-adapter`,
  `observatory-log@observatory-log`) is replaced once the new one is verified, and that
  marketplace is unregistered and taken out of `settings.json` once nothing installed
  comes from it.
- **Every other agent** (Cursor, Codex, Gemini, OpenCode, Kiro, Windsurf, Goose, …) gets
  the same skills through `~/.agents/skills`, linked from each channel that exists on
  the machine. On Windows these links (and `~/.passioncode/current`) are junctions, which
  need neither an administrator session nor Developer Mode.
- Updates create no skill copies in `~/.claude/skills` (or the folder `CLAUDE_CONFIG_DIR` names): a plain copy there shadows the plugin. Such
  copies, and hub entries that pointed at a repository's working tree, are moved into
  `~/.passioncode/quarantine/`; `npx @passioncode-ai/passioncode@latest restore` puts them back.
- Each version is an immutable release under `~/.passioncode/releases/<version>`; an update
  keeps the release it replaced for rollback and removes older ones.
- `update` (and therefore `setup`) registers the MCP server inside each installed app: Fabric
  Dashboards (`fabric-dashboards`), Fabric Switchboard (`switchboard`, unless Claude Code already
  gets it from the `switchboard` plugin) and, from `setup` only because it is an early preview,
  Fabric (`fabric`, with each agent's own `--runner`). It registers them
  for every agent that is present: Claude Code (through `claude mcp add --scope user`), Codex CLI
  (`~/.codex/config.toml`), Gemini CLI (`~/.gemini/settings.json`) and Kimi Code
  (`~/.kimi-code/mcp.json`). An entry that already exists is left alone; one that points elsewhere
  is reported and kept. `restore` and `uninstall` remove what the launcher added (the Claude Code
  tool and command rules setup or `permissions allow` added and a mode `permissions mode` set stay in `~/.claude/settings.json` (or the folder `CLAUDE_CONFIG_DIR` names; in a session of Fabric Switchboard 0.7.14 or later, your own Claude folder, and with an earlier one `~/.claude`, [docs/reference/cli.md](docs/reference/cli.md)), and agents' declarations in
  `~/.passioncode/rules.d` and the permissions ledger `~/.passioncode/permissions.json` stay)
  ([ADR-0003](docs/adr/0003-fabric-dashboards-mcp-registration.md),
  [ADR-0004](docs/adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md)).

## Setup and doctor

`setup` checks first, then installs the absent apps you chose, repairs what the checks found,
checks again and prints a before → after table and the steps that stay yours. On a healthy
computer it changes nothing (apart from the anonymous counts) and exits 0. An app is installed only after its release's
`SHA256SUMS.asc` verifies against the PassionCode.ai release key bundled in this package
(fingerprint `63B3 0DC3 24BD 6974 87AA 3194 4FAF B8AE C803 B6A7`), the file matches the signed
checksum and GitHub's digest, and the app passes `codesign`, carries team `KJ35UYYL22`, has its
notarization ticket stapled and is accepted by Gatekeeper. Apps go into your own `~/Applications` (made on the first
install); a copy in `/Applications` that is yours and that you may replace stays there. An outdated or damaged app is
reinstalled only when it is not running and you may replace it; the old one goes to the Trash ("running" means running
for you: on a Mac with several users only your own processes count, so a copy of yours that another user has open, or runs an MCP server from (an entry they set by hand: the launcher's own follow each user's copy, PC-149), is still replaced and goes to your Trash; that user restarts it, PC-151). One you cannot replace
(another user's, or in a folder you cannot write) is named, never reinstalled. A family service that
does not answer is started through launchd (`launchctl kickstart`, never a kill).

`doctor` changes nothing but the launcher's anonymous counts, sent once their notice has been shown unless they are off ([docs/analytics-events.md](docs/analytics-events.md)). It reads prerequisites, the skill set, each app's version, signature
and team, each agent's MCP entries with one proving call per server, and the Fabric services of
the family; each line names its state and its fix. Exit codes: **0** no check failed (or `setup`
only showed its plan), **1** a check (or a setup step) failed, **2** bad arguments. `doctor --fix` runs setup's repairs without
installing new apps. Details: the [CLI contract](docs/reference/cli.md#setup-and-doctor).

**Release trains.** An organization's machines install one set of pinned app versions instead of
each app's latest release: `setup --train organization-r1` installs and reinstalls the apps at
the versions in [`trains/organization-r1.json`](trains/organization-r1.json), remembers the train,
and `doctor` then compares every app with its pin (offline too) in an `app.<id>` line per app and
one `train` line. An app newer than its pin is reported and left alone (a damaged one, or one whose version cannot be read, is reinstalled from the latest
release): the train never takes an app back, because its data may not open in an older release. `setup --train none` returns to the
latest releases. Either change is saved with `--yes` or in a terminal (after its answers, or at once when there is nothing to ask; a `--json` run never asks), never with `--dry-run`; without either it is only shown as a plan. A named
train is not saved when every offer in the terminal (at least one of them defaulting to yes) is
answered no, while `--train none` is saved on any answer. The skills are pinned by the launcher release itself (`family.json`). Which
version each app pins is the train's record in fabric-workspace
([SD-4](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/roadmap.md#sd-4)); a
change to the file is a launcher release.

## Staying current

At Claude Code session start the `passioncode` plugin uses a cached npm check for up
to 24 hours and, when a newer set is out **and every npm account that publishes it is in the
plugin's `trust.json`, npm's signature over it verifies with the registry key pinned there and it
carries build provenance**, updates to that exact version in the background; it takes
effect in the next session. Any other version is named and not installed
automatically; while that stands, `@latest` runs it, so use the version the line names
(`npx @passioncode-ai/passioncode@<installed> status`) until a release is accepted ([SECURITY.md](SECURITY.md#the-self-update-and-who-it-trusts)).
On Windows, where npm is installed as `.cmd` files (the Node installer, nvm-windows, fnm), an installation from 0.2.75 or
earlier never updates itself (its hook could not start npm): run
`npx --yes @passioncode-ai/passioncode@latest update` once, and it updates itself from 0.2.76 on (PC-135), when the Node
that runs Claude Code's hooks (the first `node` on PATH) has npm beside it; otherwise a session line says how to fix
that (PC-143).
`npx @passioncode-ai/passioncode@latest config set update.auto off` makes it only say so. `status` and `doctor` show
when the switch is off (by `config set`, or by an uninstall by 0.2.75 or earlier), and `config set update.auto on` turns it
back on.

`status` reads local state without contacting npm. Its npm version is labelled
`npm latest (cached)` with the saved check timestamp, or `check time unknown`.
When that stable version is below the installed stable version, the line also says
`stale: older than installed`, and when the session hook refused it, `not installed automatically`
with the reason (PC-131). A newer or equal cached version is still a saved
observation, not a live registry check. With no saved version it says
`npm latest: not checked`, and after a failed check while a refusal stands it adds the refused version and the
reason; `--json` retains the raw `latest` and `checkedAt` fields.

```bash
npx @passioncode-ai/passioncode@latest status   # the installed release: its members, their channels, shadows
npx @passioncode-ai/passioncode@latest update --dry-run
npx @passioncode-ai/passioncode@latest uninstall
npx @passioncode-ai/passioncode@latest analytics off # stop the launcher's anonymous usage and error counts (on by default)
npx @passioncode-ai/passioncode@latest permissions   # what PassionCode allowed Claude Code to do without asking (in Claude Code's user settings), and who asked for it
```

For supported flags, JSON fields, exit codes and partial-failure recovery, read the
[CLI contract](docs/reference/cli.md). `restore` repairs the latest quarantine batch;
it is not a release rollback. A successful `uninstall` preserves recovery files and
leaves the update switch as it was; with nothing installed, the session hook starts no update (PC-131). Unsupported flags are rejected before mutation (the anonymous counts still count the run).

Repository docs describe the current source. See the [documentation index](docs/README.md)
and dated handoffs for which changes have actually been published or installed.

## With the ssheleg family

The ssheleg family ([sshlg-skills](https://github.com/ssheleg/sshlg-skills), on npm as
`sshlg-skills`) is a separate, public set of skills for coding agents: a working method with
`task-pipeline` (gated delivery and release iterations), `agent-sync` (leases and id
reservation), `super-ux`, `sheleg-design`, `make-skill`, `agent-stack` and others. It is not a
member of this launcher's set, and neither set installs or vendors the other's plugins. Install
both and update each as one set with its own command:

```bash
npx @passioncode-ai/passioncode@latest update   # this set: Fabric Agent Adapter, Observatory Log, passioncode
npx --yes sshlg-skills@latest update            # the family; it takes no member argument
```

- **Routers.** `npx sshlg-skills routers` writes one routing block into each agent's global
  instructions (`~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`, `~/.gemini/GEMINI.md`, …). It says
  which member owns which kind of work: interface behaviour, look, copy, delivery, coordination.
  On a computer where Fabric is installed (its services directory exists) the block gains a
  `fabric` router, which sends questions about the computer's agent services to the Fabric
  tooling and to this set's Fabric Agent Adapter skills.
- **The method.** Fabric principle 11 (a project moves in releases, and every run leaves a lesson)
  takes its method from `task-pipeline`'s release iteration. Principle 10's wait rule (a wait is
  not a stop) reaches personal repositories as the family's opt-in rule block
  (`npx sshlg-skills config set rules.wait on`). In a passioncode-ai repository both reach the
  agent through this plugin's session-start line and `working-in-passioncode` instead.
- **What the family gains here.** Where Project Observatory runs, `task-pipeline` writes workflow
  checkpoints and planned handoffs through it and records cross-project lessons in its shared
  lesson store, as proposals; `agent-sync` takes the git leases that passioncode-ai repositories
  declare.
- **One channel per plugin id.** Each plugin comes from one source: this set's from the
  `passioncode` marketplace, each family member's from its own (`<name>@<name>`). A plain skill
  copy in `~/.claude/skills` shadows a plugin; both updaters take such copies out of the way and
  never create one. Never update a plugin member with a bare `npx skills update <name>`: it
  recreates that copy.

## Release (maintainers)

1. Tag every member at the version to ship; set `ref` to that tag in `family.json`.
2. Bump `version` in `package.json` and `plugin/passioncode/.claude-plugin/plugin.json`
   (a test holds them and the CHANGELOG in sync), add the CHANGELOG section.
3. The npm account that publishes must be listed in `plugin/passioncode/trust.json`
   (`npmPublishers`), and be the package's only kind of maintainer, and the release must be
   published by `release.yml` with provenance (a public repository; the workflow stops otherwise, and
   its registry receipt runs the hook's signature and provenance checks on the published version).
   Otherwise every installed hook refuses the update and says so. When npm announces a new registry key, add it to
   `npmRegistryKeys` in a release before npm signs with it, and name the new keyid in that release's CHANGELOG
   section (SECURITY.md tells people to look for it there).
4. Merge, then tag the merge commit `vX.Y.Z` and push the tag. `.github/workflows/release.yml`
   validates, checks the tag against both manifests, creates the GitHub release from the
   CHANGELOG section, vendors every member **from its own repository** at its pinned tag,
   runs the tests, exercises packed update/status/uninstall with a fake Claude CLI
   in a temporary home (`node scripts/smoke-pack.mjs`), publishes
   `@passioncode-ai/passioncode` and waits until npm serves it. It runs when the repository
   variables `RELEASE_ENABLED` and `PUBLISH_NPMJS` are `true`; npm auth is trusted publishing
   (OIDC) or the `NPM_TOKEN` secret; a private member needs `MEMBERS_READ_TOKEN`.
   The job writes `lib/analytics-key.json` from the `PASSIONCODE_ANALYTICS_APP_KEY` secret (the App Key for the
   anonymous counts, PC-123) and refuses to publish without it.
   Release only through the tag. A hand `npm publish` (`prepublishOnly` vendors from tags only, refuses
   credential-shaped strings and runs the tests) carries no build provenance, so every installed plugin refuses it
   and its users see a line that may mean tampering; it also carries no App Key and sends no counts.
   If the registry receipt fails after publishing (the version is already `latest`), publish a corrected next
   version through the tag at once and say in its CHANGELOG section that the refused one was not tampering.
5. `npx @passioncode-ai/passioncode@<version> update` on each machine; restart the agents.

Vendoring clones every member from its own repository at its tag. A maintainer with
local clones can point the vendor at them instead: `PASSIONCODE_CHECKOUT_ROOT=<dir>`
reads a member from `<dir>/<repository name>`, and `PASSIONCODE_CHECKOUT_<MEMBER>=<path>`
(the member's name upper-cased, `-` as `_`) names one clone kept under another name.
`PASSIONCODE_VENDOR_CLONE=1` ignores both. `family.json` names no machine paths.

## License

Open source under the [GNU AGPL-3.0](LICENSE). A [commercial license](COMMERCIAL-LICENSE.md) is
available for use that does not meet the AGPL's terms: [passioncode.ai/business](https://passioncode.ai/business/).
Versions before 0.1.12 were released under PolyForm Noncommercial or Internal Use (v0.1.5 to
v0.1.11) and MIT (v0.1.4 and earlier); each keeps the licence it was released under.
Contributions are accepted under [CLA.md](CLA.md) ([CONTRIBUTING.md](CONTRIBUTING.md)).
