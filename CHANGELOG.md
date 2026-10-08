# Changelog

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
