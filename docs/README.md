# Launcher documentation

| Need | Start here | Source of truth |
|---|---|---|
| Install and run | [Project README](../README.md) | `bin/passioncode.js`, `family.json` |
| Command results, failure recovery, state | [CLI contract](reference/cli.md) | `lib/launcher.js`, `test/launcher.test.js` |
| Automatic-update trust and filesystem effects | [Security](../SECURITY.md) | `plugin/passioncode/hooks/`, `trust.json` |
| Contribute or release | [Contributing](../CONTRIBUTING.md) | Tests and `.github/workflows/` |
| User paths and wording | [Scenarios](ux/scenarios.md), [copy pack](brand/README.md) | Named regression coverage and CLI source |
| Coordinate work | [Generated coordination snapshot](AGENT_SYNC.md) | `.claude/agent-sync.json` and the live tool |
| Resume the latest audit | [Audit handoff](handoffs/2026-10-01-launcher-audit.md) | Exact source commits and command receipts |
| Understand architecture decisions | [Launcher shape](adr/0001-launcher-shape.md), [publisher trust](adr/0002-self-update-trusts-named-publishers.md) | Append-only historical decisions |

Current operational docs are README, SECURITY, CONTRIBUTING, this index and the
CLI contract. Historical ADRs and dated handoffs describe the state at their
recorded date; later releases may supersede package names, trust-list contents
or checks. Keep historical evidence intact and link its successor.

`npm test` includes documentation checks for relative Markdown links, anchors,
registered source locations, scenario coverage and evidence-test names. These
checks establish resolvability, not semantic correctness. Review the affected
contract against implementation whenever behaviour changes; update its scenario,
wording and regression receipt in the same commit.
