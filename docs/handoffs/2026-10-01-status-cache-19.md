# Handoff — status cache provenance, 2026-10-01

Objective: fix [#19](https://github.com/passioncode-ai/passioncode/issues/19), where
`status` called a saved npm observation the current latest version.

## Delivered source

[Implementation commit c544150](https://github.com/passioncode-ai/passioncode/commit/c544150)
contains the formatter, regressions and documentation. The task branch is
`codex/launcher-status-cache-19` on `passioncode-ai/passioncode`.

- The summary labels npm data as cached and prints its saved check timestamp.
- Missing or invalid timestamps say `check time unknown`; no version says `not checked`.
- A cached stable version below installed says `stale: older than installed`.
- JSON keeps its existing fields and values; status neither probes npm nor writes state.

Example from the regression fixture:

```text
installed 0.1.14 · package 0.1.0 · npm latest (cached) 0.1.10 (checked 2026-09-30T13:22:11.000Z; stale: older than installed) · auto-update off
```

The [bounded brief](../tasks/status-cache-19.md) maps requirements to checks.
[Scenarios](../ux/scenarios.md) cover only status; the [copy pack](../brand/README.md)
is a scoped draft inferred from the existing CLI, not a full product approval.
Shared contracts remain `lib/launcher.js::status()` and
`plugin/passioncode/hooks/update-check.js::recordProbe()`; their implementations
and the self-update trust policy are unchanged.

## Checks actually run

| Check | Result |
|---|---|
| `node --test --test-name-pattern='status labels cached\|status reports an absent' test/launcher.test.js` before the fix | Exit 1; both new tests reproduced the old wording |
| `npm test` after the fix | Exit 0; 58 tests passed |
| `git diff --cached --check` | Exit 0 |
| org-index `scripts/check_private.py .` after staging all task files | Exit 0; 0 findings |
| super-ux `scripts/brand_lint.py docs/brand --brief` | Exit 0; 0 errors, 5 warnings for existing help/restore/uninstall strings outside this scoped registry |
| super-ux `scripts/ux_lint.py docs/ux` | Exit 0; 0 errors, 1 warning for absent web-surface declaration; this change is a terminal CLI |

The external linters are contributor tools, not runtime dependencies. No new
hosted suite was dispatched. Release validation, npm publication and installation
were not performed in this source-only fix. The package version remains 0.1.14.
Generated payloads, temporary test homes and agent-sync state stay local-only.

## Exact next task

Prepare the next launcher release (candidate 0.1.15) containing this fix. Follow
[CONTRIBUTING](../../CONTRIBUTING.md) and [the release checklist](../../README.md#release-maintainers):
take a lease before editing CHANGELOG, synchronize both version manifests, vendor
tagged members, validate the payload, run tests, then publish through the existing
tag workflow. Update the owning knowledge-base version rows in that release.
This handoff does not claim the installed npm launcher contains this source fix.
