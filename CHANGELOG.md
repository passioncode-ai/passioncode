# Changelog

## 0.2.19 - 2026-10-21

### Changed

- **Fabric Agent Adapter is pinned at `v0.40.0`** (it was `v0.39.1`): the service kit as layered modules behind
  compatibility facades, installed into a service with `fabric_kit.py install` and checked with `fabric_kit.py status`;
  connectors for outbound HTTP and OpenRouter (the agent's own key, a spend ceiling before every attempt, usage
  receipts, a fallback model); a support-agent recipe. A service that copied one kit file installs the kit as a set now.

## 0.2.18 - 2026-10-21

### Changed

- **Fabric Agent Adapter is pinned at `v0.39.1`** (it was `v0.39.0`): fixes from a review of 0.39.0. The service
  probe no longer crashes on a usage count that is not a number, the Python and Node kits read such counts as the
  contract does, the documentation and the messages people read carry no em dash, and the dashboard kit is 1.1.1.

## 0.2.17 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.39.0`** (it was `v0.38.0`): the kits follow contract `c55f2d5`. A partner's
  publisher key is trusted only in the organization contexts its scope names (FAC-SEM-122), a partner may sit innermost
  in a delegation chain (DEC-0090), and a usage report counts calls with unknown tokens in `unmeasuredCalls`
  (DEC-0091).

## 0.2.16 - 2026-10-20

### Changed

- **Observatory Log is pinned at `v0.26.0`** (plugin 0.26.0; it was `v0.18.0`). Its Stop hook records and asks about
  what a turn changed, not what the working tree already held: files untracked before the session never count, and
  the `why` is asked only for tracked content, once per record, with the session's next prompt (a new
  `UserPromptSubmit` hook) instead of a Stop notice. The hook parses its payload once instead of starting Python
  four times per turn (PC-05, audit F12). The tag's plugin version and the release version are the same, so
  `family.json` still declares no `refVersions` (PC-04).

## 0.2.15 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.38.0`** (it was `v0.37.1`): a quieter session start. No Fabric-service count
  in every session; the Fabric-down line only in a project that uses Fabric, telling the agent to skip
  `fabric_whoami`; nothing on compact or resume; the dashboard-kit notice only in a repository that owns the service,
  as an upgrade the agent may make itself.

## 0.2.14 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.37.1`** (it was `v0.37.0`): the nearby pairing of a new machine by a
  six-digit code and the hub's single use of an enroll token in both kits, and notes for agents that register a remote
  service.

## 0.2.13 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.37.0`** (it was `v0.36.0`). Its `creating-fabric-agents` skill now carries
  how to build agents that run in a personal or an organization's cloud, choose models per lane with OpenRouter keys,
  orchestrate their work and learn from failures, with the practices production agents taught us.

## 0.2.12 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.36.0`** (it was `v0.35.4`), on Fabric Agent Contract `0704218`. Its kits tell a
  caller when a provider limit stopped or paused a job and when an effect may have happened unseen (DEC-0087), check
  share grants into an organization (DEC-0086) and the estate ceremonies' record rules and enroll tokens (DEC-0084). A
  partner's setup for a company is documented as an org skill set that requires its agents.

## 0.2.11 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.4`** (it was `v0.35.3`). Its session hooks rejoin a Fabric session at most
  once a minute, so many agent sessions on one machine no longer spend Fabric's shared request budget on every turn;
  the resilience reference follows the contract's job limit codes (DEC-0087).

## 0.2.10 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.3`** (it was `v0.35.2`). `creating-fabric-agents` asks in its grill
  whether a new agent writes text people read, and if so gives it the no-em-dash rule (U+2014) in its prompt and a
  test that fails on it; the resilience reference gains its third pass.

## 0.2.9 - 2026-10-18

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.2`** (it was `v0.35.0`). 0.35.1 names the Codex hook groups a removal
  moves, stops the tests and the session hooks' spool from accumulating files, adds the `creating-fabric-agents`
  resilience-and-autonomy reference and fixes the Hermes adapter losing a helper's answer; 0.35.2 extends the reference.

## 0.2.8 - 2026-10-16

### Changed

- Fabric Agent Adapter is pinned at `v0.35.0` (previously `v0.34.1`), carrying
  host-specific session hooks and their installation and verification tools.
  See the [adapter release](https://github.com/passioncode-ai/fabric-agent-adapter/releases/tag/v0.35.0)
  for supported hosts and activation requirements.

## 0.2.7 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.34.1`** (it was `v0.34.0`). v0.34.1 makes its profile and route rules
  answer as the contract does on any JSON — strict comparisons, values shown as JavaScript writes them, numbers as
  doubles — and the doctor's model check never raises (FAA-47).

## 0.2.6 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.34.0`** (it was `v0.33.0`). v0.34.0 pins the contract at `d8146cf` and
  keeps a lane that reads what members, clients or the public send on an open-vendor model (DEC-0083, FAC-SEM-112):
  its profile kits check the route and the models a project's policy leaves, `open-vendor` admits and excludes
  nothing, and `creating-fabric-agents` asks which lanes read user content.

## 0.2.5 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.33.0`** (it was `v0.32.1`). v0.33.0 pins the contract at `82e1636` and
  reads contexts in its estate kits (DEC-0082): one agent placed on a machine for the person and for each organization
  it serves, an organization's instance under a share grant of its context, and every estate rule total on hostile
  JSON. It also fixes a flaky board test (FAA-43).

## 0.2.4 - 2026-10-14

### Changed

- **Fabric Agent Adapter is pinned at `v0.32.1`** (it was `v0.32.0`). v0.32.1 makes the
  `building-fabric-services` lifecycle reference the rule its public readers follow: it states the lifecycle
  itself (the supervisor owns the process, the descriptor, readiness) and links only public sources, where it used
  to defer to the organization's private lifecycle contract (release iteration 1, N-12).
- 0.2.3 was not published on its own; this release carries its changes below.

## 0.2.3 - 2026-10-14

### Changed

- **The session-start line names Fabric principles 10 and 11.** In a passioncode-ai repository the
  line now also says to work by principle 10, a free agent takes the next task (a wait goes on a
  watcher, stop only at a human gate), and principle 11, a project moves in releases and every run
  leaves a lesson the next one reads, each with its anchor in the knowledge base's `principles.md`.
  The knowledge base's rules §4 relies on this line to reach every session, so an `AGENTS.md` need
  not restate the rule (`test/repo-rules.test.js`).
- **`working-in-passioncode` §4 carries both principles** in two bullets with their links, and a
  new scenario eval (`a-wait-is-not-a-stop`) holds the behaviour.
- **README: "With the ssheleg family"** — what the public sshlg-skills family is, how it relates to
  this set (routers, the method, what each side adds, one channel per plugin id) and the two update
  commands.

## 0.2.2 - 2026-10-14

### Changed

- **Fabric Agent Adapter is pinned at `v0.32.0`** (it was `v0.30.0`).
  - v0.31.0 added packing, signing and verifying an agent as a `fabric-package/1` folder, in both service kits and from
    the command line (`npx @passioncode-ai/fabric-agent-adapter pack|sign|verify`). This is the adapter's part of the
    RM-28 pilot.
  - v0.31.1 lets this launcher vendor the kit.
  - v0.32.0 pins contract `1636fa9`: a board responder now waits under an operator's hold, never treating it as an
    outage, and reads the estate owner's settlement.

## 0.2.1 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.30.0`** (it was `v0.29.0`). The Node service kit now installs and uninstalls a launchd job the way the Python kit does: `launchdPlist`, `launchdInstall` and `launchdUninstall`. A service's plist comes out the same from either kit. The service probe (`check_service.py`) gains a rule, `lifecycle.supervisor-marker`: it fails a launchd job whose plist does not tell the service that launchd supervises it. Without that marker, a second copy that finds the lock held exits at once and launchd restarts it every few seconds.

## 0.2.0 - 2026-10-13

### Added

- **`setup` (alias `onboard`): one command for a new computer and for one that is already set up.**
  It checks everything first, then installs the PassionCode.ai apps that are missing (Fabric
  Switchboard, Fabric Dashboards, Project Observatory, Fabric Inbox, and Fabric as an early
  preview when Docker and the Supabase CLI are present), installs the skills, registers every
  app's MCP server for every coding agent present, repairs what is wrong, checks again and prints
  a before → after table with one list of the steps that stay yours. On a healthy computer it
  changes nothing and exits 0. In a terminal it asks one question per app; `--yes`, `--with`,
  `--without`, `--no-apps`, `--no-open`, `--dry-run` and `--json` serve agents and scripts.
- **No unverified byte is installed.** Each release's `SHA256SUMS.asc` is verified against the
  PassionCode.ai release key bundled in the package (pinned by fingerprint, no gpg needed); the
  download must match the signed checksum and GitHub's digest; the app must pass `codesign`,
  carry team `KJ35UYYL22`, have its notarization ticket stapled and pass Gatekeeper. An outdated
  or damaged app is reinstalled only when it is not running, and the old one goes to the Trash.
- **`doctor`: a read-only check of the whole setup** — prerequisites, the skill set, each app's
  version, signature and team, each agent's MCP entries with one real proving call per server,
  and the family's Fabric services. Every line names its state and its fix; exit 0 means no check
  failed. `doctor --fix` runs setup's repairs without installing new apps.
- **`update` registers Fabric Switchboard's MCP server (`switchboard mcp`)** next to Fabric
  Dashboards', under the same never-clobber, reversible rules; an entry counts as the same only
  with the same command and arguments. **`setup` also registers Fabric's (`fabric-mcp --runner
  <agent>`)**: an early preview, it is never added by a background update (ADR-0004).
- **Safer installs and removals**: an app is copied beside its target and swapped in with two
  renames, after a second check that nothing runs from it; uninstall keeps a Codex entry that
  gained settings since it was written; a dry run copies no config file.
- **The `setting-up-passioncode` skill**: "set me up" or "check my setup" makes any coding agent
  run setup or doctor, finish the steps an agent may take and hand you only sign-ins, consents
  and secrets typed into a product's own hidden prompt. The README and passioncode.ai/start/
  carry a one-paragraph prompt to paste into Claude Code or Codex.
- **Session start names the problems of the last setup check** while it has any; it never runs
  the check itself.

## 0.1.53 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.29.0`** (it was `v0.28.0`). The update teaches `working-with-fabric` a new rule: a lane, subagent or session that stops on a usage or session limit is restarted at once, from where it stopped, instead of waiting for the stated reset. It backs off 2, 5, 10, then 15 minutes only if the restart stops again, and spend or billing limits stay the operator's. The rule comes from fabric-workspace principle 10, item 6.

## 0.1.52 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.28.0`** (it was `v0.27.0`). Fabric Agent Adapter 0.28.0 (FAA-12b, FAA-40) gives the service kits a client for Fabric's project board, so a service can answer requests other projects send it. The kits also check a project directory page before they look a project up. The adapter now pins contract f00a768.

## 0.1.51 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.27.0`** (it was `v0.26.0`). Fabric Agent Adapter 0.27.0 (FAA-33) adds three things to the service kits:
  - a service can report its model spend by the project it ran each call for;
  - its usage report is checked against the contract's window of the last 31 days;
  - a product can credit its own OpenRouter traffic to itself. This is off by default, and a user's own attribution is never overwritten.

## 0.1.50 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.26.0`** (it was `v0.25.0`). Fabric Agent Adapter 0.26.0 (FAA-35, FAA-37): a service's feed events can carry machine-readable data next to their sentence. That data is refused if it holds a credential. A service can also list the protocol revisions it accepts, and refuses any other revision with `schema-unsupported`. The contract pin stays a046f57.

## 0.1.49 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.25.0`** (it was `v0.24.0`). Fabric Agent Adapter 0.25.0 (FAA-39): both service kits treat two spellings of one identifier as the same identifier, by its normal form (contract DEC-0076). This covers routes, bindings, route events, estate share grants and their revocations, and a provider entry's provider id. The kits also write the identifiers they create in that normal form. The adapter now pins contract a046f57.

## 0.1.48 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.24.0`** (it was `v0.23.0`). Fabric Agent Adapter 0.24.0 (FAA-34) lets both service kits read and write three new kinds of service descriptor:
  - an app's own descriptor, for a desktop app a person starts: installed, never running, with no port;
  - a service Project Observatory's node supervises;
  - a service offered to others.

  The kits now say who installed a service by role, never by name, and how its model calls sign in, as a kind and never a credential. A host refuses a request above an offered service's highest data class. Fabric's button shows only while Fabric itself is installed. The contract pin stays `fe55fc6`.

## 0.1.47 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.23.0`** (it was `v0.21.0`). It brings two adapter releases.
  - **0.22.0 (FAA-12a)** adds the fourth skill, `working-with-fabric`, with the plugin's session hooks. A coding agent opened in a terminal can then work in a project through Fabric's project board.
  - **0.23.0 (FAA-32)** moves the adapter's contract pin to `fe55fc6`:
    - a service's supervisor can mark itself with an argument as well as the environment. The Task Scheduler and Project Observatory's node are now recognised, and markers that disagree stop the service before it takes its lock;
    - a delegation key the estate record certifies follows the contract's verdict and refusal codes;
    - an estate record may be issued up to 60 s ahead of the clock, and its passkey must sign under a `sign.<domain>` RP;
    - Windows token files are checked against the contract's reader rule.

## 0.1.46 - 2026-10-12

### Added

- **`update` registers the Fabric Dashboards MCP server for every agent that is present**
  (`fabric-dashboards`, stdio, the app bundle's `bin/fabric-dashboards-mcp`): Claude Code
  through `claude mcp add --scope user`, Codex CLI as a `["mcp_servers"."fabric-dashboards"]`
  table appended to `~/.codex/config.toml`, Gemini CLI and Kimi Code in the `mcpServers` of
  `~/.gemini/settings.json` and `$KIMI_CODE_HOME/mcp.json`. A machine without the app skips
  the step; an entry that already points at the same command is left alone, and one that
  points elsewhere, or is declared in a form the launcher does not edit, is reported and
  kept. Each registration is journalled before the file changes and removed again by
  `restore` and `uninstall` only while it is still exactly what the launcher wrote
  ([ADR-0003](docs/adr/0003-fabric-dashboards-mcp-registration.md)).

## 0.1.45 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.21.0`** (it was `v0.20.0`). Fabric Agent Adapter 0.21.0 (FAA-31): both service kits verify the operator's signed estate record (estate-record/1, contract DEC-0055) — the chain of revisions, the passkey's WebAuthn assertion checked offline, the 30-day window and the record's rules — and a delegation gate given the current record trusts a token's key only while that record certifies it. The adapter now pins contract b291bf0.

## 0.1.44 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.20.0`** (it was `v0.19.0`). Fabric Agent Adapter 0.20.0 (FAA-11): runner routes in both service kits — the doctor reports each runner's state with the contract's closed probe results (not-installed, not-responding, not-connected), and a service checks a runner route, the bundle a host pins and every route event against FAC-SEM-028…034, answering the contract's own rules.

## 0.1.43 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.19.0`** (it was `v0.18.0`). Fabric Agent Adapter 0.19.0 (FAA-13): both service kits keep settings backups of what the operator decided — outside the data directory, byte-identical between the kits, restored only into a fresh database and never over a row — list every spending limit a service applies in its usage report, and send the service token in the header the descriptor declares.

## 0.1.42 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.18.0`** (it was `v0.17.0`). Fabric Agent Adapter 0.18.0 (FAA-21): both service kits write and install the Linux and Windows supervisors — a systemd user unit and a per-user Scheduled Task, byte-identical between the kits, never carrying a secret, an upgrade restarting what runs while the operator's off stays off. The Node kit runs on Windows: the folders, descriptor validation at parity with Python, the token file's protected ACL and a named-pipe instance lock; the two kits now exclude each other on every system and the conformance probe sees a Node service's lock.

## 0.1.41 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.17.0`** (it was `v0.16.0`). The organisation's lifecycle rules LC-19 and LC-21 are now enforced by the adapter's checks. No plugin may start a stdio MCP server in every session, and no credential may appear in argv or a URL query. The checks are in adapt_project.py check, fabric_provider.py and the adapter's own validate gate.

## 0.1.40 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.16.0`** (it was `v0.15.0`). Runner and model profiles in both kits (contract DEC-0046). The kit resolves the model profile in the contract's order within the project's model classes and declares what applies in the well-known configuration, with Runner and Model tiles. It checks the runner and model in the doctor and records the route on usage. The contract's credential detector is ported.

## 0.1.39 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.15.0`** (it was `v0.14.0`). The dashboard kit ships Fabric's button (contract DEC-0040, FB-7). It is one floating menu button that opens Fabric on the service, with links built from the contract's grammar. It hides itself when the host draws its own and says how to get Fabric when Fabric is absent. Dashboard kit 1.1.0.

## 0.1.38 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.14.0`** (it was `v0.13.0`). The kit's contract pin now includes DEC-0046
  (runner and model profiles) and CT-31: a delegation token without an actor chain is refused, never thrown. The
  contract pin is `0cacd08`.

## 0.1.37 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.13.0`** (it was `v0.12.0`). The scaffolder now requires every capability's
  effect class (`--effect`) and never defaults it. It writes the capability's idempotency and the manifest's cost
  presets (`--cost-preset`, DEC-0037), which are fixed options a launcher offers when a run's cost varies.

## 0.1.36 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.12.0`** (it was `v0.11.1`). The kit follows Fabric Agent Contract up to
  DEC-0045. The delegation verifiers are sealed as the contract specifies: the trusted issuer is required, a
  small-order key is refused as the issuer's fault, and claims are typed strictly. The operator's own machines need no
  token (trust tiers). The canonical JSON vectors are shared with the contract, and a provider entry may say where its
  stdio server starts (never once per session). The contract pin is `2eb91c0`.

## 0.1.35 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.11.1`** (it was `v0.10.0`). A service built with the kit can now check a
  delegation token and an operator's approval offline, in Python and Node, with the same answers as the Fabric Agent
  Contract's own verifier (DEC-0039). It can put a gate in front of its MCP tools, so each call names the person it
  is for, the calling agent and the chain, and an approval is used once. The Node kit refuses small-order Ed25519
  keys itself (Node 20 and 22 accepted a forged signature under one). The contract pin is unchanged at `8e49fbd`.

## 0.1.34 - 2026-10-11

### Changed

- **Fabric Agent Adapter is pinned at `v0.10.0`** (it was `v0.9.0`). A security fix from Fabric Agent Contract
  DEC-0039: a service built with the kit now ends an operator's dashboard session on the server. A session
  ends 12 h after it was last used, 7 days after sign-in, on logout, or when the service token rotates.
  Before, it lasted as long as a 30-day cookie, and the server checked only its signature. Operators sign in once more after a
  service upgrades; the host does it on the page's 401. The conformance probe treats `surfaces.mcp.auth:
  "delegation"` like `own` (DL-16) and checks the session cookie's lifetime. The default contract pin moves to
  `8e49fbd`; bundles issued under the earlier revisions stay valid.

## 0.1.33 - 2026-10-11

### Changed

- **Fabric Agent Adapter is pinned at `v0.9.0`** (it was `v0.8.3`). `building-fabric-services` ships the dashboard
  kit for `fabric-dashboard/0.1` (Fabric Agent Contract DEC-0036): one stylesheet and one script that keep a
  service's dashboard usable from 360 CSS px inside a host pane beside the agent console, seven WCAG AA themes in
  light and dark that follow the host's `fabric_appearance` cookie, `dashboard_kit.py`, the layout probe
  `check_dashboard_layout.mjs` and the probe rule `dashboard.declared`. The adapter plugin gains its first hook:
  at session start it prints one line in a repository whose dashboard has no kit or an older one, and nothing
  elsewhere. The default contract pin moves to `a83bec6`; bundles issued under the earlier revisions stay valid.

## 0.1.32 - 2026-10-10

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.3`** (it was `v0.8.1`). Its default contract pin moves to Fabric
  Agent Contract `main` `52da526` (DEC-0032 through DEC-0035). `creating-fabric-agents` and
  `adapting-projects-to-fabric` now propose an agent's own operator channel (`fabric-operator-channel/0.1`, rule
  OC-11) once, when the agent has human stops or `notify: true` events: they list the operator's steps, record
  the answer (`accepted`, `declined` or `later`) and never create a bot, store a token or enable the channel
  themselves. For a channel bound in a group shared with other bots they name rules OC-14 through OC-17 (silent
  unless addressed; a bare `/command` is not addressed). The Python service kit runs on Windows and Linux
  (`systemd` and `task-scheduler` managers, Windows paths and token files). Bundles issued under the earlier
  contract revisions stay valid.

## 0.1.31 - 2026-10-08

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.1`** (it was `v0.8.0`). Its default contract pin moves to Fabric
  Agent Contract `main` `623bf61` (DEC-0025 through DEC-0031: settings backups, runner routes, spending limits,
  activity telemetry, devices — optional surfaces the kits do not emit yet), and `Mcp-Name` values outside plain
  ASCII use the MCP 2026-07-28 Base64 sentinel. Bundles issued under the earlier contract revisions stay valid.

## 0.1.30 - 2026-10-07

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.0`** (it was `v0.6.3`). Its service kit meets the
  organization's lifecycle contract (0.7.0: a launchd install respects an operator's disable, an
  `ExitTimeOut` default), agents can report what they spend (`make_usage_receipt`, `usage_report`,
  Fabric Agent Contract DEC-0021), and a service may keep its MCP credential apart from the host's
  token (DEC-0024). Bundles issued under the earlier contract revisions stay valid.
- **Observatory Log is pinned at `v0.18.0`** (plugin 0.18.0; it was `v0.17.3`), the Project
  Observatory 0.18.0 skills. That release installs only updates whose `SHA256SUMS` is signed by
  the organization's release key, so the hook's daily update of an older engine now refuses an
  unsigned or foreign-signed release instead of installing it.

## 0.1.29 - 2026-10-05

### Changed

- **Observatory Log is pinned at `v0.17.3`** (plugin 0.17.3; it was `v0.16.0`). Its
  SessionStart hook keeps Project Observatory current:
  - for an engine at 0.17.0 or later, it schedules the engine's hourly maintenance job where
    it is missing;
  - for an engine from 0.7.0 to 0.16.0, which has no updater of its own, it installs the newer
    release once a day with that engine's `full update --apply`, unless the person turned
    automatic updates off.

  Both run detached, at most every six hours or once a day, and never hold up a session.

## 0.1.28 - 2026-10-05

The launcher meets the organization's
[product lifecycle contract](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/lifecycle.md):
findings F13, F14, F15 and F17 of the 2026-10-03 lifecycle audit. Observatory Log moves to
Project Observatory 0.16.0.

### Changed

- **Observatory Log is pinned at `v0.16.0`** (plugin 0.16.0; it was `v0.15.0`, plugin 0.15.0),
  the Project Observatory 0.16.0 skills. The skills' text is unchanged and follows the release:
  agent memory now checks an access binding on every call, embeds remotely only with the
  operator's per-project consent, and can be erased with a receipt (`full forget`).

### Fixed

- **One update at a time (LC-03, F14).** `update`, `restore` and `uninstall` take
  `~/.passioncode/update.lock`; a second one refuses with exit 1 and names the holder, so a
  background update and a manual one no longer interleave their `claude plugin` writes.
- **One `npm view` for sessions started together (F13).** The SessionStart hook claims
  `~/.passioncode/probe.pending` before it starts the probe; the probe removes it after recording,
  and a marker older than five minutes is taken over.
- **Releases no longer accumulate (LC-11, LC-15, F15).** An update keeps the release it installed
  and the one it replaced, and removes older releases and partial copies left by a killed update
  (`prune` step; a dry run plans it).
- **A release proves its provenance (F17).** `vendor --release` refuses a member whose tag does not
  name the plugin version it carries. A member whose repository's tags version another product
  may declare `refVersions: "repository"` with the plugin `version` it expects; the bytes at that
  tag must carry that version, and the manifest records `refVersions` so the pair reads as the
  repository's release, not the plugin's. No member declares it yet: at the current pins every tag
  names its plugin version (Observatory Log `v0.16.0` carries 0.16.0), and whether Observatory Log
  should use it when the two diverge again is the open operator decision PC-04.
- `AGENTS.md` gains a `## Lifecycle` section: the background footprint with the SessionStart
  hook's cost and cadence (LC-09) and build retention (LC-15).

## 0.1.27 - 2026-10-04

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.3`** (it was `v0.6.2`). `building-fabric-services`
  and `creating-fabric-agents` say that every credential an agent or service uses comes from
  Project Observatory, by name: `use_secret.py run --vault-only` for an agent, `use_secret.py
  serve` for a long-running service, never a `.env` or a key file beside it.

## 0.1.26 - 2026-10-04

### Changed

- **Observatory Log is pinned at `v0.15.0`** (plugin 0.15.0; it was `v0.13.0`, plugin 0.14.0),
  the Project Observatory 0.15.0 skills. `handling-secrets` gains the header door: `use_secret.py
  header` hands one HTTP MCP server's bearer to Claude Code's `headersHelper`, from the vault only
  and only to the server the slot is bound to with `vault.py bind --header-for`. Agents and
  services take every credential from Observatory by name (`use_secret.py run --vault-only`).

## 0.1.25 - 2026-10-03

### Changed

- **`working-in-passioncode` follows the amended release-approval rule** (knowledge rules §11,
  operator decision 2026-10-03): any member of `release-approvers` may approve a release run,
  including the person who pushed the tag. Unchanged: approval is a person's act and an agent
  never approves a release run, signing happens only in CI, admins cannot bypass, `v*` tags
  only, and a published release is never rewritten.

## 0.1.24 - 2026-10-03

### Changed

- **`working-in-passioncode` carries the release-signing rule** (knowledge rules §11):
  - a published build is signed only in CI, in the repository's `release` environment, through
    `passioncode-ai/.github@v1`;
  - it is approved by `release-approvers` but not by the tag's author;
  - no release key lives on a laptop;
  - an agent never approves a release it started;
  - a published release is never rewritten.

  The engine line now names its CI release.

## 0.1.23 - 2026-10-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.2`** (it was `v0.6.1`). `building-fabric-services`
  now says how a product behaves under a host lifecycle broker — the always-on per-user service
  agents ask to start, stop and restart products: quit through both the platform's quit and
  `SIGTERM`, stay in the background when opened non-activating, keep the designated requirement
  stable, expose honest readiness.

## 0.1.22 - 2026-10-03

### Changed

- **Observatory Log is pinned at `v0.13.0`** (plugin 0.14.0; it was `v0.10.0`, plugin 0.13.0),
  the Project Observatory 0.13.0 hook and skills. The hook and the skills hand over the installed
  engine's commands (`project-observatory full findings`, `full doctor`) instead of source-tree
  paths, and the skills' own check runs under the interpreter `full agent install` records. In
  `handling-secrets`, a vault `PROJECT` is the project's folder name and its registry id resolves to
  the same folder. `use_secret.py run` takes `--env`, and `vault.py remove` deletes a slot or only
  its retired archives.

## 0.1.21 - 2026-10-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.1`:** `check_service.py` no longer fails an online
  service hosted behind a platform router. Heroku, Fly, Render and CDNs answer a foreign `Host`
  themselves (`404`/`421`), and that now counts as the refusal it is, unless the body is the
  well-known document.

## 0.1.20 - 2026-10-02

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.0`:** `building-fabric-services` also makes an online
  agent or dashboard (an `https` origin on a platform) a Fabric service — the remote placement of
  `fabric-service/0.1`, Fabric Agent Contract DEC-0019 — with Node and Python kits, a TLS sample
  online service and a probe that checks remote services over verified TLS.

## 0.1.19 - 2026-10-02

### Changed

- `working-in-passioncode`: contributions are accepted under `CLA.md` by opening a pull request;
  a PR template never carries a CLA checkbox. `CLA.md` is the knowledge-base template changed the
  same day ("ticking the CLA box" is gone), and the publishing reference asks for one sentence in
  the PR template instead of a box.

## 0.1.18 - 2026-10-01

### Changed

- Pin Fabric Agent Adapter v0.5.7: services are scheduled as standard processes (`ProcessType
  Standard`; the probe's `lifecycle.priority` rule fails `Background`), `notify: true` is reserved
  for a decision, a failure or a blocking warning once per episode, a service raises no banners of
  its own, and a preview instance is uninstalled once checked
  ([adapter changelog](https://github.com/passioncode-ai/fabric-agent-adapter/blob/v0.5.7/CHANGELOG.md)).

## 0.1.17 - 2026-10-01

### Changed

- Pin Fabric Agent Adapter v0.5.6 so the installed set carries its dashboard deep-link procedure and portable handoff checker. The Observatory Log and working-in-passioncode members keep their existing behavior.
- Dashboard routing evidence belongs to the [adapter handoff](https://github.com/passioncode-ai/fabric-agent-adapter/blob/v0.5.6/docs/handoffs/2026-10-01-dashboard-links.md); the launcher installs these bytes through its existing plugin and agents-hub channels.

## 0.1.16 - 2026-10-01

### Fixed

- The packed lifecycle release check accepts both npm 11’s array and npm 12’s
  package-name-keyed JSON output, and rejects ambiguous or malformed pack results.
- The update probe accepts npm 12’s singleton metadata array while preserving
  publisher checks and rejecting ambiguous or malformed responses.
- The 0.1.15 tag and GitHub release remain historical: its release workflow stopped
  at this check before npm publication. Version 0.1.16 includes the fixes and shared
  backlog instructions described below.

## 0.1.15 - 2026-10-01

### Fixed

- Restore and uninstall preserve recoverable state, reject unsupported options before changes,
  and report failed filesystem or plugin operations truthfully. Updates reject inconsistent
  payloads and stop dependent work after a failed release or marketplace step.
- Status reports the installed release correctly and retains concurrent probe/configuration
  updates. Self-update checks reject untrusted or incomplete npm publisher metadata and
  recover from failed spawns and future timestamps.
- Node 18 test discovery, release-tag validation and the packed lifecycle smoke now guard
  the release path. The launcher audit records the regression evidence.

### Changed

- The repository skill and SessionStart reminder direct agents to canonical local backlog
  sources and the derived workspace backlog, with one owner per task and source-commit checks.
- Developer documentation now states the CLI, recovery and self-update contracts and checks
  their local references. Tagged Fabric Agent Adapter 0.5.5 and Observatory Log 0.13.0 stay
  in the family; this release does not add a new family member.

## 0.1.14 - 2026-10-01

### Changed

- Fabric Agent Adapter 0.5.5 in the set (`family.json` pins `v0.5.5`, was `v0.5.4`): its shipped
  docs no longer call the public Fabric Agent Contract private; no behaviour changes.
- Observatory Log 0.13.0 in the set (`family.json` pins Project Observatory `v0.10.0`, was
  `v0.8.2`, which shipped plugin 0.12.3): the plugin's licence metadata is `AGPL-3.0-only OR
  LicenseRef-PassionCode-Commercial`, and `handling-secrets` documents the new Cloudflare presets.
- The README, `--help`, `family.json` and `package.json` descriptions say what is true: the
  launcher installs the set listed in `family.json`, not every PassionCode.ai skill and plugin.

## 0.1.13 - 2026-10-01

### Changed

- Fabric Agent Adapter 0.5.4 in the set (`family.json` pins `v0.5.4`, was `v0.5.3`): the adapter pins
  the public Fabric Agent Contract, re-created with one clean history; no behaviour changes.

## 0.1.12 - 2026-09-30

### Changed

- **License.** From this version the launcher is open source under the GNU AGPL-3.0, or
  available under a commercial license from PassionCode.ai (contact@passioncode.ai): SPDX
  `AGPL-3.0-only OR LicenseRef-PassionCode-Commercial` (Fabric ADR-0092) in `package.json`, the
  self plugin and the `working-in-passioncode` skill. `LICENSE` is the unmodified AGPL-3.0 text;
  `COMMERCIAL-LICENSE.md` is new; both, with `CLA.md`, are byte for byte the knowledge base
  templates and ship in the npm package (`test/license.test.js`). Versions v0.1.5 to v0.1.11 stay
  under PolyForm Noncommercial or Internal Use, and v0.1.4 and earlier under MIT.
- **The session-start line says the protocol** (Fabric ADR-0093): in a passioncode-ai repository
  it now sends the agent to the knowledge base (`fabric-workspace/knowledge/` or
  https://wiki.passioncode.ai/knowledge), then the repository's `AGENTS.md`, before the first
  edit, and asks it to update the knowledge base page that owns any cross-repository fact it
  changed after the work.
- **`working-in-passioncode`** names the knowledge base as the source of truth (org-index keeps the
  map, onboarding and the checks), opens with the before/after protocol, states the new licence
  and the repository standard (`check_format.py`), and its completion report names the knowledge
  base page updated. `references/publishing.md` lists the licence files as templates copied byte
  for byte. Evals: the licence scenario rewritten, one protocol scenario, two trigger queries.
- Fabric Agent Adapter 0.5.3 in the set (`family.json` pins `v0.5.3`, was `v0.5.2`): the same
  licence, and its skills send a PassionCode.ai repository to the repository standard.
- README and AGENTS.md follow the repository standard: `# PassionCode.ai launcher`, the
  knowledge base *Read first* block and *After work*.

## 0.1.11 - 2026-09-30

### Fixed

- Fabric Agent Adapter 0.5.2 in the set (`family.json` pins `v0.5.2`, was `v0.5.1`): services built on its
  kits answer the MCP `initialize` handshake, so a real client such as Claude Code connects (0.5.0
  and 0.5.1 did not), and every tool's `outputSchema` has an object root (contract DEC-0018).

## 0.1.10 - 2026-09-30

### Changed

- Fabric Agent Adapter 0.5.1 in the set (`family.json` pins `v0.5.1`, was `v0.5.0`): the kits follow the
  contract rulings of DEC-0017 — full result envelope with its trace for jobs, a job tool's
  `outputSchema` as the union of envelope and handle, `providers/` entries carrying `providerId`.

## 0.1.9 - 2026-09-30

### Changed

- Fabric Agent Adapter 0.5.0 in the set (`family.json` pins `v0.5.0`, was `v0.4.3`); Observatory
  Log stays at Observatory `v0.8.2`, still its latest tag.

### Fixed

- The CLI help, `README.md` and `SECURITY.md` told people to run `npx passioncode <command>`.
  No unscoped `passioncode` package exists on npm (`npm view passioncode` → E404), so those
  commands failed on any machine without a local install, and a squatted name would have run
  someone else's code. They now name `npx @passioncode-ai/passioncode@latest <command>`.
- `README.md` gains a quick start for a new teammate: install, configure, MCP, develop.

## 0.1.8 - 2026-09-29

### Added

- **Read the rules first.** In a passioncode-ai repository the session-start hook now prints one
  line sending the agent to the repository's `AGENTS.md` and the organization's `CONTRIBUTING.md`
  before its first edit; anywhere else it prints nothing, and a missing or slow git prints
  nothing (`hooks/repo-rules.js`).
- `working-in-passioncode` carries the names of Fabric ADR-0090 and the code region marker rule.

## 0.1.7 - 2026-09-29

- Observatory Log 0.12.3 (Observatory v0.8.2) in the set: source-available license and PassionCode.ai metadata; no behaviour change.

## 0.1.6 - 2026-09-29

### Fixed

- **A version published from GitHub is trusted.** npm records a trusted-publishing (OIDC)
  release as `GitHub Actions <npm-oidc-no-reply@github.com>`; the hook read that as an
  unreadable account and would have refused every release the workflow publishes. It is now
  recognised by its email as `github-actions-oidc`, which `trust.json` lists; a look-alike
  name with another email is not. Maintainers are still checked one by one.
- `vendor.mjs` reads `PASSIONCODE_VENDOR_CLONE` and `PASSIONCODE_GIT_BASE` from the
  environment it is given, so a CI step's clone mode no longer leaks into the tests.
- The release job waits up to 10 minutes for npm to serve a new version (5 was too short).

0.1.5 was tagged but its release job failed on the leak above; it was never published.

## 0.1.5 - 2026-09-29

### Added

- `working-in-passioncode`, a skill in the self plugin: the organisation's working rules —
  the org map, landing, nightly CI and why a blocked run is not green, handoffs,
  decisions, ids and leases, secrets, licensing, the privacy gate, releases and pins —
  reach every contributor's agent instead of living only in org-index. It points to
  org-index as the source of truth; detail is in its `references/releasing.md` and
  `references/publishing.md`. Trigger and scenario evals are in
  `test/evals/working-in-passioncode/`; `test/skill.test.js` holds every self-plugin skill
  to the Agent Skills standard (strict front matter, description budget, references
  linked, no home paths). The hub links it like any member's skill (`status` showed
  `passioncode hub: 0/0` because the self plugin had no skill).
- Fabric Agent Adapter 0.4.3: source-available license, one contract pin (`a5a2709`),
  neutral examples, and hand-offs to the neighbouring agent-stack and make-skill skills.

### Changed

- **License.** The launcher is source-available under
  `PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0`, with a
  commercial license on request (contact@passioncode.ai). Versions up to and including
  v0.1.4 were released under MIT and remain available under it. Contributions come in
  under `CLA.md` (new `CONTRIBUTING.md` and PR template). The payload's marketplace
  lists each member under its own manifest's license instead of a hard-coded `MIT`.
- `family.json` names no machine paths. Members are cloned from their repositories at
  their tags; a maintainer's local clones are an environment override:
  `PASSIONCODE_CHECKOUT_ROOT=<dir>` reads `<dir>/<repository name>`, and
  `PASSIONCODE_CHECKOUT_<MEMBER>=<path>` names one clone kept under another name. A
  `checkout` key in `family.json` is refused.

### Fixed

- `passioncode status` described the payload beside the CLI — from a checkout, whatever
  was last vendored there — instead of what is installed. It now reads the release
  `~/.passioncode/current` points at, reports the payload version separately as
  `package`, and says which it described (`source`).

## 0.1.4 - 2026-09-29

### Security

- The package is `@passioncode-ai/passioncode`, in the npm organisation that PassionCode.ai
  owns. The bare name `passioncode` was unclaimed, so whoever registered it would have been
  what the self-update checks. The hook now watches the scoped name, and `trust.json` names
  the organisation's publisher.

### Changed

- Install and update with `npx @passioncode-ai/passioncode@latest update`.
- A `v*` tag releases and publishes from GitHub Actions (`.github/workflows/release.yml`),
  the same pipeline as the adapter.

## 0.1.3 - 2026-09-29

- Observatory Log 0.12.2 (Observatory 0.8.1): the engine's `full agent` recognises the copy this
  launcher installs instead of adding a second one, and `tracking-resources` no longer triggers on
  creation requests.

### Security

- The session-start hook no longer runs whatever is published under the npm name
  `passioncode`. The name was unclaimed (`npm view passioncode` answered E404), so
  whoever registered it would have had code run on every machine with the plugin. The
  daily probe now records the latest version together with its npm maintainers and
  publishing account (`npm view passioncode version maintainers _npmUser --json`); the
  hook updates only when every one of them is in `plugin/passioncode/trust.json`, and
  otherwise spawns nothing and names who published it. The list ships empty: until the
  maintainers add their npm account, nothing updates on its own.
- The update it runs is pinned — `npx --yes passioncode@<verified version> update` — so
  what was checked is what runs, not whatever `@latest` points at a moment later.

### Fixed

- A failed update check is shown once in the session-start line instead of never; the
  same error is not repeated every session.
- A background update is recorded (`updatingSince`) when it starts, so a second session
  start within ten minutes does not start a second one.
- The old single-member marketplaces (`fabric-agent-adapter`, `observatory-log`) are
  retired once the member's `@passioncode` plugin is verified and nothing else installed
  comes from them: the `extraKnownMarketplaces` entry leaves `~/.claude/settings.json`
  (backed up in the quarantine) and `claude plugin marketplace remove` unregisters it —
  otherwise Claude Code re-registered it, with autoUpdate, and installing from it would
  bring a second channel back. `passioncode restore` re-adds both. `status` names any
  that are left.
- Vendoring no longer needs the maintainer's own checkouts: a member whose `checkout`
  is absent is shallow-cloned from `repo` at `ref` over SSH (`--clone` or
  `PASSIONCODE_VENDOR_CLONE=1` forces it). The payload's marketplace entries carry
  `displayName` and `author`, and the `$schema` URLs are ones that resolve.

## 0.1.2 - 2026-09-29

- Fabric Agent Adapter 0.4.2: the kit's `LoopbackHTTPServer` binds without a reverse DNS
  lookup, a garbled pid file reads as unknown, and every SKILL.md front matter parses as
  strict YAML (0.4.1).

## 0.1.1 - 2026-09-29

- `update --dry-run` says the plan changed nothing instead of reporting it as done.
  0.1.0 was tagged but never published.

## 0.1.0 - 2026-09-28

- First release: Fabric Agent Adapter 0.4.0 and Observatory Log 0.12.1 as Claude Code
  plugins from one local marketplace, and through the `~/.agents/skills` hub for every
  other agent.
- Replaces the old single-member plugin installs, and moves shadowing
  `~/.claude/skills` entries and working-tree hub links into a restorable quarantine.
- Once-a-day update check at session start with a background update (`update.auto`).
