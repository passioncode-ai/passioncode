# Changelog

## Unreleased

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
