# Status cache provenance — issue #19

## Brief and scope

The operator accepted issue [#19](https://github.com/passioncode-ai/passioncode/issues/19)
as the next task on 2026-10-01. Correct the human-readable `status` output so a saved
npm observation cannot be mistaken for a current registry lookup. Keep the command
offline and read-only; preserve the JSON contract and the self-update trust rules.
This is a source fix; npm publication and installation are separate release work.

Sources: `bin/passioncode.js` (current wording), `lib/launcher.js` (`status` fields),
`plugin/passioncode/hooks/update-check.js` (`recordProbe` owns registry observations),
`docs/adr/0002-self-update-trusts-named-publishers.md` (trust boundary), and issue #19
(installed 0.1.14 versus cached 0.1.10). No material scope questions remain.

## Requirements and checks

| ID | Requirement | Verification |
|---|---|---|
| REQ-1 | Label npm data as cached and show its check timestamp, or explicitly unknown time | CLI regression cases in `test/launcher.test.js` |
| REQ-2 | Flag a cached stable version below the installed stable version as stale | Regression: installed 0.1.14, cached 0.1.10; numeric ordering case |
| REQ-3 | Preserve JSON values, state bytes and offline operation | Regression assertions against planted state and a failing npm executable |
| REQ-4 | Deliver tested source and a resumable handoff in Git | `npm test`, pushed branch and main commit, `docs/handoffs/2026-10-01-status-cache-19.md` |

## Execution profile

One bounded fix, using task-pipeline's scope/evidence/dependencies/resume kernel:
1. Specify status scenarios and copy; add a failing CLI regression.
2. Change only presentation; run focused tests and the repository gate.
3. Review the diff, commit and push, integrate under repository policy, record evidence.

Dependencies: existing `status()` and `recordProbe()` contracts. No runtime dependency,
network request, release version, member pin, skill or hook change is required.
Resume: the handoff records the final state and exact next task. UX coverage is scoped
to `status`; the rest of the CLI has not been audited by this iteration.
