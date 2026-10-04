# Handoff — launcher lifecycle contract (0.1.23), 2026-10-03

Objective: bring the launcher in line with the organization's
[product lifecycle contract](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/lifecycle.md),
closing findings F13, F14, F15, F17 of the 2026-10-03 lifecycle audit
(`fabric-workspace` `docs/reports/2026-10-03-lifecycle-audit/raw/passioncode-adapter.md`).

## What changed (branch `claude/lifecycle-contract`)

| Finding | Rule | Change | Test |
|---|---|---|---|
| F13 | LC-03 | hook claims `~/.passioncode/probe.pending` (exclusive create) before spawning the probe; probe removes it; stale after 5 min | `test/self-update.test.js`: `hook: session starts inside one probe window…`, `hook: a probe marker left by a probe that died…` |
| F14 | LC-03 | `update`/`restore`/`uninstall` take `~/.passioncode/update.lock` (flock on macOS, live-pid file elsewhere) | `test/lifecycle.test.js` `LC-03 …` (3) |
| F15 | LC-11, LC-15 | `prune` step keeps installed + replaced release, sweeps `*.partial` | `test/lifecycle.test.js` `LC-15 …`, `LC-12 …` (4) |
| F17 | provenance | `vendor --release` asserts `ref == v<version>` or, with `refVersions: "repository"`, the pinned `version`; observatory-log pinned that way in `family.json` | `test/vendor.test.js` (3 new) |

Not here: **F12** (Observatory Log Stop hook spawning python four times per turn) lives in
`passioncode-ai/project-observatory-dashboard`, `observatory/engine/skill/plugins/observatory-log/hooks/record-turn.sh`;
the launcher only vendors it at a tag. Claude Code's own plugin cache (`~/.claude/plugins/cache/passioncode/*`)
is Claude Code's to prune, not the launcher's.

## Checks run

`npm test` → exit 0 (103 pass). `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` → exit 0 against the real
tags (observatory-log v0.13.0 carries 0.14.0, matching the pin); `claude plugin validate ./payload --strict` → passed;
payload removed afterwards.

## Next task

Coordinator: review and land the PR, then release 0.1.23 (tag `v0.1.23`). Pin fabric-agent-adapter 0.7.0 once
passioncode-ai/fabric-agent-adapter#28 is released. Open F12 in project-observatory-dashboard.

## Landing, 2026-10-04

The sections above record the branch as written on 2026-10-03. On landing:

- **Version 0.1.28, not 0.1.23.** `main` had released 0.1.23–0.1.27 meanwhile; `origin/main` was
  merged into the branch (`09f4bcf`) and `package.json`, `plugin/passioncode/.claude-plugin/plugin.json`
  and the CHANGELOG entry moved to 0.1.28.
- **`family.json` keeps `main`'s pins** (fabric-agent-adapter `v0.6.3`, Observatory Log `v0.15.0`) and
  declares no `refVersions`: at `v0.15.0` the tag names the plugin version it carries (0.15.0), so the
  default provenance rule passes. The F17 row above ("observatory-log pinned that way") no longer
  describes `family.json`; the check and its tests ship, and whether Observatory Log uses
  `refVersions: "repository"` when the two diverge again is the operator decision PC-04 (open).
- **The adapter stays at `v0.6.3`.** A release vendors tagged bytes only (`scripts/vendor.mjs`:
  "is not a tag; a release vendors tagged bytes only") and the provenance rule wants `ref == v<version>`;
  adapter 0.7.0 is merged on its `main` but has no `v0.7.0` tag. Re-pinning it is PC-10.
- Checks: `npm test` → exit 0 (103 pass); `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` → exit 0
  (adapter 0.6.3 @ `v0.6.3`, observatory-log 0.15.0 @ `v0.15.0`, passioncode 0.1.28);
  `claude plugin validate ./payload --strict` → passed; payload removed.

Next task: release 0.1.28 through the release flow (PC-11: tag `v0.1.28`, CI, the operator's approval),
then PC-10 once fabric-agent-adapter tags `v0.7.0` (its FAA-06).
