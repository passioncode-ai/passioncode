# Handoff — one-command setup and doctor (2026-10-13)

Objective: `npx @passioncode-ai/passioncode@latest setup` sets up a new computer and checks,
repairs and re-checks an existing one (a healthy re-run changes nothing, exit 0); `doctor` is the
read-only check for a button and for agents; an agent skill and a copy-prompt; the site's /start/
leads with both. Roadmap RM-09; fabric-agent-adapter#49. Brief and decisions:
[docs/tasks/2026-10-13-setup-doctor.md](../tasks/2026-10-13-setup-doctor.md);
[ADR-0004](../adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md).

## Stopped on disk

The run stopped at **1.1 GiB free** on `/System/Volumes/Data`, under the brief's 1.5 GiB stop
line (operator constraint: no installs or builds below it). Every unit is committed and pushed;
nothing is merged, released or deployed. Leases were released.

## State per repository

| Repository | Branch @ commit | State |
|---|---|---|
| passioncode-ai/passioncode | `agent/setup-doctor` @ `d8d44de` | [PR #92](https://github.com/passioncode-ai/passioncode/pull/92), CI `validate` green on `d8d44de`; not merged. Version 0.2.0 (package.json, plugin.json, CHANGELOG). Backlog PC-37 open, PC-09 closed as superseded |
| passioncode-ai/passioncode-ai.github.io | `agent/start-one-command` @ `7ca5996` | pushed, **no PR yet**; /start/ #setup and #setup-prompt in 10 languages; must deploy only after npm 0.2.0 exists |
| passioncode-ai/fabric-dashboards | `agent/check-setup-row` | [PR #129](https://github.com/passioncode-ai/fabric-dashboards/pull/129): backlog FD-65 (Check setup runs the launcher's doctor); no checks configured |
| passioncode-ai/fabric | `agent/check-setup-row` | [PR #32](https://github.com/passioncode-ai/fabric/pull/32): backlog M200; its CI fails exactly as `main` does at `d162e844` (workspace snapshot stale), not from this row |
| passioncode-ai/fabric-workspace | — | not started: knowledge/how-to-work.md:11 and products.md launcher rows, roadmap RM-09 note and the launcher release-train row |

## Checks actually run

- `npm test` in the launcher: exit 0, 146/146 (temp homes, fake claude, fake macOS tools, a local
  GitHub-shaped release server signed by a throwaway key).
- `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` exit 0; `claude plugin validate ./payload --strict`
  and `./payload/plugins/passioncode --strict`: passed; `node scripts/smoke-pack.mjs`: PASS.
- Mutation checks: the tamper refusal, the in-use re-check before the swap and the after-check
  timestamp each fail their test when removed.
- Two seam reviews (task-pipeline verifier-seam): 12 findings, then 6 more; all fixed with tests.
- `lib/openpgp.js` verifies the live `SHA256SUMS.asc` of all five products' latest releases.
- Read-only `doctor` on the maintainer's Mac (before the Fabric no-spawn fix): Dashboards,
  Observatory proved by real calls; found Switchboard unregistered for all four agents, Fabric
  Inbox 0.12.0 (0.16.3 out), Fabric Dashboards 0.7.7 (0.7.8 out), Observatory service degraded.
- Site: `npm run check` exit 0, `npm run build` PASS (224 entries), `extract-public-copy.py`
  PASS (150), WebKit at 1280 and 390 px: no horizontal overflow on /start/, /ru/start/, /ja/start/;
  copy agent rule checks passed for en, ru, de, es, pt-BR, pl, ko, ja (fr spacing applied);
  zh-Hans from the copy agent's write (0.0446 USD).

## Exact next task (needs ≥ 1.5 GiB free)

1. `df -h /System/Volumes/Data` ≥ 1.5 GiB.
2. Merge PR #92 (CI green on its head), tag `v0.2.0` on the merge commit, push the tag, watch
   `release.yml`, confirm `npm view @passioncode-ai/passioncode version` → 0.2.0.
3. `npx --yes @passioncode-ai/passioncode@latest update`, then `status`, then
   `doctor` (read-only) on this machine; record commands and exit codes in PC-37.
4. Site: open the PR for `agent/start-one-command`, merge, then from `main`:
   `npm ci && npm run check && python3 scripts/extract-public-copy.py --check && npm run build`,
   deploy per docs/DEPLOYMENT.md, `python3 scripts/verify-live.py --output docs/evidence/2026-10-13-start-one-command/live.json`.
5. fabric-workspace: update how-to-work.md:11 and products.md launcher rows, roadmap RM-09 and
   the launcher release train (`npm run check:releases`), under its lease; comment on
   fabric-agent-adapter#49 that the launcher's `setup` is the family setup entry.
6. Merge FD-65 (#129) and M200 (#32) rows.
