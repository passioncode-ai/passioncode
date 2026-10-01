# UX Scenarios

<!-- Managed with super-ux (ux-contract v4). Coverage is a regression contract, not a production-install receipt. -->

## Index

| ID | Title | Feature | Persona | Traces | Status | Last audit |
|---|---|---|---|---|---|---|
| SCN-001 | Inspect cached npm version | status | Operator | REQ-1, REQ-2 | implemented | 2026-10-01 |
| SCN-002 | Read status without changing the installation | status | Automation | REQ-3 | implemented | 2026-10-01 |
| SCN-003 | Update with a partial failure | update | Operator | REQ-A1 | implemented | 2026-10-01 |
| SCN-004 | Restore displaced entries safely | restore | Operator | REQ-A1 | implemented | 2026-10-01 |
| SCN-005 | Uninstall and retry a failed removal | uninstall | Operator | REQ-A1 | implemented | 2026-10-01 |
| SCN-006 | Start a session with a registry observation | self-update | Operator | REQ-A2 | implemented | 2026-10-01 |
| SCN-007 | Reject unsupported arguments or damaged state | command validation | Operator | REQ-A1 | implemented | 2026-10-01 |

## Personas

- **Operator:** a person checking the installed skill set after an update.
- **Automation:** a script reading machine-readable installation status.

## Scenarios

### SCN-001: Inspect cached npm version

- **Persona:** Operator
- **Feature:** status
- **Entry point:** `passioncode status`
- **Preconditions:** An installation may exist; the session-start probe may have saved a registry observation.
- **Steps:**
  1. Run `passioncode status`.
  2. Compare installed, package and cached npm versions; read when npm was checked.
- **Expected result:** The npm version is labelled cached, with its recorded timestamp. A cache below the installed stable version is explicitly labelled stale.
- **Alt paths:** No cached version: say not checked. Missing or invalid timestamp: say check time unknown. A cache equal to or above installed remains labelled cached, without claiming a live lookup.
- **UI elements:** First line of terminal output.
- **States covered:** empty, success, error
- **Errors & recovery:** Unknown check time does not crash status. A later session-start probe can refresh the observation; status itself does not perform a probe.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`, tests beginning `status labels cached npm observations` and `status reports an absent npm observation`.
- **Product:** unobserved

### SCN-002: Read status without changing the installation

- **Persona:** Automation
- **Feature:** status
- **Entry point:** `passioncode status --json`
- **Preconditions:** Saved state contains an npm observation; npm may be unavailable.
- **Steps:**
  1. Read JSON status.
  2. Use `latest` and `checkedAt` as the saved observation.
- **Expected result:** Existing JSON fields retain their raw values. Both text and JSON status leave state unchanged and do not invoke npm.
- **Alt paths:** With no observation, `latest` and `checkedAt` remain null.
- **UI elements:** JSON on stdout and process exit code.
- **States covered:** empty, success
- **Errors & recovery:** Network availability has no effect on reading locally saved status.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`, test beginning `status labels cached npm observations`.
- **Product:** unobserved
### SCN-003: Update with a partial failure

- **Persona:** Operator
- **Feature:** update
- **Entry point:** `passioncode update`
- **Preconditions:** A bundled payload and optionally an installed release; Claude may be unavailable.
- **Steps:**
  1. Run a pinned update and inspect the step outcomes.
  2. Fix a reported failure and repeat the same update.
- **Expected result:** Invalid payloads are refused before changes. Release/current failures stop dependent work. Marketplace or plugin verification failures preserve affected legacy entries. Available agent channels still receive a valid release when only Claude fails.
- **Alt paths:** `--dry-run` plans without applying; symlinked channel directories are supported; immutable version mismatch is refused.
- **UI elements:** Step list and exit code.
- **States covered:** loading, error, success
- **Errors & recovery:** Exit 1 names failed steps; follow the retry instructions in the CLI contract. Already completed work can remain applied.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; the SCN-003 entries in `docs/evidence/launcher-audit.json` name exact tests.
- **Product:** unobserved

### SCN-004: Restore displaced entries safely

- **Persona:** Operator
- **Feature:** restore
- **Entry point:** `passioncode restore`
- **Preconditions:** A quarantine batch exists, possibly partly restored or interrupted.
- **Steps:**
  1. Run restore for the latest batch.
  2. If a conflict or external failure is reported, fix it and retry.
  3. Repeat restore after completion.
- **Expected result:** Successful entries are checkpointed. Another restore leaves restored files intact and reports no new work.
- **Alt paths:** Old journals without checkpoints are handled without deleting a destination whose quarantine source is absent.
- **UI elements:** Restored paths, conflict/error text, empty result.
- **States covered:** empty, error, success
- **Errors & recovery:** A user replacement stays untouched. Move it aside before retrying. Missing backup paths are reported; partial work remains recorded.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; SCN-004 evidence includes repeat, conflict and interruption regressions.
- **Product:** unobserved

### SCN-005: Uninstall and retry a failed removal

- **Persona:** Operator
- **Feature:** uninstall
- **Entry point:** `passioncode uninstall`
- **Preconditions:** A set is installed, or an earlier uninstall was partly applied.
- **Steps:**
  1. Run uninstall.
  2. Fix any reported plugin failure and retry.
  3. Inspect status; optionally restore displaced files.
- **Expected result:** Success clears the active installation and disables automatic updates; recovery copies remain. Repeating uninstall is safe.
- **Alt paths:** A relative owned link is removed; unrelated files stay. A marketplace serving another plugin is retained.
- **UI elements:** Removed list, errors, status.
- **States covered:** empty, error, success
- **Errors & recovery:** Plugin failure returns exit 1 and preserves the marketplace/current needed for retry. Reinstallation retains the off preference until explicitly enabled.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; SCN-005 evidence names successful/repeated and failed uninstall tests.
- **Product:** unobserved

### SCN-006: Start a session with a registry observation

- **Persona:** Operator
- **Feature:** self-update
- **Entry point:** SessionStart hook
- **Preconditions:** The self plugin is installed and may have a saved registry check.
- **Steps:**
  1. Start a session.
  2. Read any update/check diagnostic; continue the session.
- **Expected result:** Only a newer pinned version with all maintainers and its publisher known and trusted can start automatically. Probe errors cannot authorize an update.
- **Alt paths:** Auto off yields a pinned manual command; missing/future/expired check time starts a probe; current version is silent.
- **UI elements:** One-line hook notifications and logs.
- **States covered:** empty, error, success
- **Errors & recovery:** Missing npx does not fail the session or leave a false running marker. Repair PATH and retry next session.
- **Status:** implemented
- **Coverage:** `test/self-update.test.js`; SCN-006 evidence names attribution, subprocess and timestamp regressions.
- **Product:** unobserved

### SCN-007: Reject unsupported arguments or damaged state

- **Persona:** Operator
- **Feature:** command validation
- **Entry point:** Any launcher command
- **Preconditions:** Arguments may be misspelled or state JSON may be damaged.
- **Steps:**
  1. Invoke a command with unsupported arguments, or a mutating command with invalid state.
  2. Read the error; correct arguments or preserve and repair the state file.
  3. Retry the command.
- **Expected result:** Unsupported arguments return exit 2 before mutation. Invalid state returns exit 1 without overwriting it; status can still read the active release.
- **Alt paths:** Valid command/options follow their normal scenarios.
- **UI elements:** stderr, help, exit code.
- **States covered:** error, success
- **Errors & recovery:** `uninstall --dry-run` is rejected; it never removes an installation.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; SCN-007 evidence names argument and damaged-state regressions.
- **Product:** unobserved
