# Changelog

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
