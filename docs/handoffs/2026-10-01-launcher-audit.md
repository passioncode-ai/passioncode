# Launcher audit and corrections — 2026-10-01

Objective: inspect launcher correctness, fix reproduced defects and update current
documentation. Owner: `passioncode-ai/passioncode`, branch
`codex/launcher-bug-audit-2026-10-01`. Baseline:
`86c206f31cff5d9bc52532faa7d23e41202a0a51` (PR #21).

## Scope and findings

| Area | Corrected failures | Evidence |
|---|---|---|
| Restore | Repeat could delete restored symlinks; user replacements were overwritten; a move could be lost from the recovery journal | AUD-01–03 |
| Installation | Copy/current failure still ran dependent work; invalid/incomplete payloads and differing immutable manifests were accepted | AUD-04–06, AUD-13 |
| Plugin cleanup | Marketplace failure or exit 0 with the wrong registered version could still retire working entries | AUD-07–08 |
| Uninstall | Installed state/current remained active; relative owned links remained; plugin failure or false success was hidden | AUD-09–10, AUD-21 |
| Arguments/state | Unsupported flags such as `uninstall --dry-run` still mutated; damaged state was overwritten; slow update overwrote newer config/probe data | AUD-11–12, AUD-14 |
| Status/channels | Saved version overrode the active release; symlinked channel directories were ignored | AUD-15–16 |
| Self-update | Missing publisher/malformed maintainer could authorize; nonzero npm exit could count as success; absent npx crashed the hook; future timestamp suppressed probes | AUD-17–20 |

The [evidence manifest](../evidence/launcher-audit.json) resolves every AUD row to
an exact regression test and scenario. The manifest is an address index, not an
execution receipt. All 21 new runtime regressions were also run against the
baseline source: the selected launcher/self-update suite reported 56 tests,
35 passes and **21 failures**, matching all new cases. This isolated baseline
run used the new tests and fake Claude fixture against the old implementation.

Additional corrections: Claude availability is bounded and cached per command;
marketplace-restore failure now returns an error; update output distinguishes
completed work from dependent steps that never ran. Release validation now checks
the selected tag on manual dispatch, with strict tag syntax and safe shell input.
`actionlint` also caught and cleared two shell warnings in the existing workflow.
The quoted test glob failed on the declared minimum Node 18.20.8; the new
`scripts/test.mjs` passes explicit paths. The release workflow now uses a reproducible
packed lifecycle smoke, replacing its previous status-only smoke.

## Documentation delivered

- [CLI and recovery contract](../reference/cli.md): accepted options, JSON, exit
  codes, state meaning, retry boundaries, quarantine and uninstall semantics.
- [Documentation index](../README.md): canonical owners and historical evidence.
- README and SECURITY corrections: actual trust-list source, executable code in
  the package, cache interval versus a lock, and the exact packed smoke scope.
- [Scenarios](../ux/scenarios.md), [copy registry](../brand/strings.md) and the
  expanded draft voice cover changed command/hook behaviour.
- `scripts/check-docs.mjs`, included through `test/docs.test.js` in `npm test`,
  resolves local Markdown links/anchors, source locations and named evidence.
  Its negative test supplies broken references and invented test/scenario names.

Historical ADRs and release receipts remain unchanged. The earlier status fix's
[handoff](2026-10-01-status-cache-19.md) is superseded by this entry for next work.

## Verification

| Check | Actual result |
|---|---|
| Baseline `npm test` before additions | 58 passed |
| New launcher/self-update regressions against baseline, TAP reporter | 56 tests: 35 passed, 21 failed; every added case red |
| Final `npm test`, Node 26.8.2 | 81 passed, 0 failed |
| `node scripts/test.mjs`, Node 18.20.8 | 81 passed, 0 failed; future-timestamp case rechecked after its final extension |
| `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` | Exit 0; tagged adapter 0.5.5 and Observatory Log 0.13.0 plus local self plugin |
| `claude plugin validate ./plugin/passioncode --strict` | Exit 0 |
| `claude plugin validate ./payload --strict` | Exit 0 |
| Packed lifecycle using the generated tarball, Node 26.8.2 and 18.20.8 | PASS: update, status, rejected uninstall dry-run, uninstall, repeated uninstall, empty restore |
| `node scripts/smoke-pack.mjs` | PASS; repeatable packed smoke, fake Claude and temporary home |
| `actionlint` | Exit 0 |
| `node scripts/check-docs.mjs` | 24 Markdown files, 21 named regressions, 0 errors |
| External super-ux `brand_lint.py docs/brand --strict` and `ux_lint.py docs/ux --strict` | Both exit 0, no warnings |
| `git diff --check` | Exit 0 |

The Node 18 binary came from the official 18.20.8 archive and matched its
SHASUMS256 entry. Its previous quoted-glob invocation exited 1 before the runner
fix. Pack smoke is local validation, not a package publication or a live-Claude
installation receipt. No manual hosted workflow dispatch was used.

## Limits and exact next task

This audit tests a temporary-home model with fake external CLIs. It does not
prove every Claude version, every operating system, filesystem durability after
power loss, or simultaneous installation transactions. Mutating commands have
no cross-process installation lock; do not run them concurrently. External
registry availability and a live package release were not exercised.

Next task: prepare launcher release candidate **0.1.15**, including this audit and
PR #21. Hold a lease for CHANGELOG, synchronize package/plugin versions, follow
[the release checklist](../../README.md#release-maintainers), run strict payload
checks, then use the tag workflow and verify npm/install receipts. Update the
knowledge-base version pages in that release. No npm publication or operator-home
installation is claimed by this source handoff.

Keep generated payloads, tarballs, temporary homes and raw logs local-only. Use
the brief at [the bounded task packet](../tasks/launcher-bug-audit-2026-10-01.md)
and `lib/launcher.js` / `plugin/passioncode/hooks/` as the shared contract context.
