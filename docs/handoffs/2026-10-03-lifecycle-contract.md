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
