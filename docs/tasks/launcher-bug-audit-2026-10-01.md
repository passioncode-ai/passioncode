# Launcher correctness and documentation audit

Operator request, 2026-10-01: check for bugs, fix everything found and improve the
documentation. Baseline: `86c206f31cff5d9bc52532faa7d23e41202a0a51` (PR #21).

Scope: launcher commands, local state and recovery, bundled self-update hook,
vendoring, release workflow and current documentation. Historical ADRs and release
receipts stay historical. No package publication, local installation or member pin
change is part of this source audit.

Sources: `AGENTS.md`, `CONTRIBUTING.md`, `docs/AGENT_SYNC.md`, `README.md`,
`SECURITY.md`, both ADRs, `lib/launcher.js`, `bin/passioncode.js`,
`plugin/passioncode/hooks/`, `scripts/vendor.mjs`, existing tests and workflows.

## Requirements

| ID | Deliverable | Evidence |
|---|---|---|
| REQ-A1 | Reproduce and fix concrete lifecycle failures without losing user data | Negative regressions, then `npm test` |
| REQ-A2 | Refuse unattributed or failed registry observations; tolerate unavailable subprocesses | Self-update regressions and plugin validation |
| REQ-A3 | Bring current docs into agreement with implementation | Runtime contract, recovery guide, scenario coverage and executable documentation checks |
| REQ-A4 | Commit, push and integrate with a durable audit receipt | Handoff with exact commits, checks and remaining release work |

Profile: inspect and reproduce → implement and verify → document, review and
deliver. Each finding receives a regression or a directly checkable correction.
Resume point: `docs/handoffs/2026-10-01-launcher-audit.md` once complete; until then
the branch is `codex/launcher-bug-audit-2026-10-01`.
