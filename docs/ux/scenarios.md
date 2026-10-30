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
| SCN-008 | Set up a new computer with one command | setup | Newcomer | REQ-1…REQ-5 | implemented | 2026-10-13 |
| SCN-009 | Check and repair an existing setup with the same command | setup | Operator | REQ-7a | implemented | 2026-10-13 |
| SCN-010 | Check the setup without changing anything | doctor | Operator, Automation | REQ-6, REQ-8 | implemented | 2026-10-13 |
| SCN-011 | A download that fails verification installs nothing | setup | Newcomer | REQ-2 | implemented | 2026-10-13 |
| SCN-012 | A coding agent sets the computer up from one pasted prompt | setting-up-passioncode | Newcomer | REQ-9, REQ-10 | implemented | 2026-10-13 |
| SCN-013 | A new session names the problems of the last setup check | session start | Operator | REQ-9 | implemented | 2026-10-13 |
| SCN-014 | Follow an organization's release train | setup, doctor | Operator | PC-89 | implemented | 2026-10-28 |

## Personas

- **Operator:** a person checking the installed skill set after an update.
- **Automation:** a script reading machine-readable installation status.
- **Newcomer:** a person setting up PassionCode.ai on a computer for the first time, usually through their coding agent.

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
- **Alt paths:** `--dry-run` plans without applying; symlinked channel directories are supported; immutable version mismatch is refused; an update while another update, restore or uninstall runs refuses with exit 1 and names the holder; releases older than the one replaced are pruned.
- **UI elements:** Step list and exit code.
- **States covered:** loading, error, success
- **Errors & recovery:** Exit 1 names failed steps; follow the retry instructions in the CLI contract. Already completed work can remain applied.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js` and `test/lifecycle.test.js`; the SCN-003 entries in `docs/evidence/launcher-audit.json` name exact tests.
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
- **Alt paths:** Auto off yields a pinned manual command; missing/future/expired check time starts a probe, one at a time across sessions started together; current version is silent.
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

### SCN-008: Set up a new computer with one command

- **Persona:** Newcomer
- **Feature:** setup
- **Entry point:** `npx @passioncode-ai/passioncode@latest setup` (in a terminal), or `setup --yes --json` from a coding agent
- **Preconditions:** Node 18+; macOS for the apps; no PassionCode.ai app or skill installed.
- **Steps:**
  1. Run setup. In a terminal, answer one question per app (Fabric, an early preview, defaults to no without Docker and the Supabase CLI) and one for the repairs.
  2. Read the result: what was installed, the checks before and after, and the numbered steps that stay the person's.
  3. Do those steps (sign-ins, consents, secrets in each product's hidden prompt), restart the coding agents.
- **Expected result:** The chosen apps are installed from verified releases and opened once; the skill set is installed; every bundled MCP server is registered for every agent present and answers its proving call; the person's steps are listed once.
- **Alt paths:** `--with`/`--without` choose apps; `--no-apps` sets up skills and MCP only; `--dry-run` shows the plan; without a terminal and without `--yes` the plan is printed and nothing changes; on Linux or Windows the apps are named with their download page.
- **UI elements:** Questions on stderr; the result on stdout (text or `--json`); exit code.
- **States covered:** empty, loading, success, error
- **Errors & recovery:** A failed step is named with its cause and exit 1; running setup again resumes, because completed work is detected and skipped.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `a new machine:` and `without a terminal and without --yes`.
- **Product:** unobserved

### SCN-009: Check and repair an existing setup with the same command

- **Persona:** Operator
- **Feature:** setup
- **Entry point:** `npx @passioncode-ai/passioncode@latest setup`
- **Preconditions:** Some apps, skills or MCP registrations exist; some may be outdated, damaged, missing or not answering.
- **Steps:**
  1. Run setup. It checks first and lists the repairs.
  2. Accept. It repairs, checks again and prints before → after.
  3. Do the listed steps that stay the person's (quit a running app that needs an update, start Docker, a product's own onboarding).
- **Expected result:** The skill set and MCP registrations are repaired; an outdated or damaged app that is not running is reinstalled from its verified release and the old one is in the Trash; a family service launchd owns that does not answer is started with `launchctl kickstart` (no `-k`); a running app is never replaced; nothing is killed. On a healthy computer nothing changes and the exit code is 0.
- **Alt paths:** `doctor --fix` runs the same repairs without installing new apps or opening anything.
- **UI elements:** The before → after table by area, every check that changed state, what is still open, the person's steps.
- **States covered:** success, error
- **Errors & recovery:** A problem that remains keeps exit 1 and names its fix.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `an existing broken setup:` and `a new machine:` (its no-op re-run).
- **Product:** unobserved

### SCN-010: Check the setup without changing anything

- **Persona:** Operator, Automation
- **Feature:** doctor
- **Entry point:** `npx @passioncode-ai/passioncode@latest doctor [--json] [--offline]`, a product's "Check setup" button, or a coding agent
- **Preconditions:** None.
- **Steps:**
  1. Run doctor.
  2. Read one line per check, grouped by area — prerequisites, skills, apps, MCP, services — each with its state and, when not ok, its fix.
- **Expected result:** Nothing is installed, registered, started, stopped or opened. Each registered stdio MCP server answers `initialize` and `tools/list` and one read-only tool; Fabric's server is never started (it enrols a session as it starts), its entry and binary are checked. The result is saved for the session hook. Exit 0 when no check failed, 1 otherwise.
- **Alt paths:** `--offline` skips the latest-release lookups; `--fix` repairs as setup does. On Windows the apps rows
  come from each app's uninstall entry (`reg query`) or its install folder: the installed version, whether a newer
  one is out, or "not installed" with the download page; a registry hive that could not be read is a warning of its
  own (PC-86).
- **UI elements:** Grouped text lines or JSON; exit code.
- **States covered:** success, error
- **Errors & recovery:** Every failing line names the command or the step that fixes it.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `doctor is read-only` and `a proving call that fails`;
  `test/windows.test.js`, tests beginning `PC-86`.
- **Product:** unobserved

### SCN-011: A download that fails verification installs nothing

- **Persona:** Newcomer
- **Feature:** setup
- **Entry point:** setup installing or reinstalling an app
- **Preconditions:** A release whose checksum, signature, team or notarization does not hold.
- **Steps:**
  1. Run setup; the app's action fails and names the failed check.
- **Expected result:** The app is not installed (an existing one stays as it was), the download is removed, and the exit code is 1.
- **Alt paths:** None — there is no flag that skips a check.
- **UI elements:** The failed action with its reason.
- **States covered:** error
- **Errors & recovery:** Report it to contact@passioncode.ai; retry after a new release.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `setup refuses`; `test/openpgp.test.js`.
- **Product:** unobserved

### SCN-012: A coding agent sets the computer up from one pasted prompt

- **Persona:** Newcomer
- **Feature:** setting-up-passioncode
- **Entry point:** The copy-prompt from the README or passioncode.ai/start/, pasted into Claude Code or Codex; or "set me up" / "check my setup" once the skill is installed
- **Preconditions:** A coding agent that can run commands; Node 18+.
- **Steps:**
  1. Paste the prompt.
  2. The agent runs `setup --yes --json`, finishes each step an agent may take, runs `doctor`, and reports.
- **Expected result:** The person reads what was set up or fixed, what still fails, and a numbered list of their own steps; no secret is asked for in the chat.
- **Alt paths:** "Don't change anything" → the agent runs doctor only.
- **UI elements:** The agent's reply.
- **States covered:** success, error
- **Errors & recovery:** The agent reports a failed command with its exit code and does not fall back to manual installs.
- **Status:** implemented
- **Coverage:** `test/skill.test.js`, tests beginning `setting-up-passioncode`; trigger and scenario evals in `test/evals/setting-up-passioncode/`.
- **Product:** unobserved

### SCN-013: A new session names the problems of the last setup check

- **Persona:** Operator
- **Feature:** session start
- **Entry point:** SessionStart hook
- **Preconditions:** `~/.passioncode/doctor.json` from an earlier setup or doctor run.
- **Steps:**
  1. Start a session.
- **Expected result:** While the saved result has failures, one line names their count, the first ids and the command that repairs them. The hook never runs doctor.
- **Alt paths:** No failures or no file: silent.
- **UI elements:** One hook line.
- **States covered:** empty, error
- **Errors & recovery:** A damaged file is ignored.
- **Status:** implemented
- **Coverage:** `test/self-update.test.js`, test beginning `session start names the failures`.
- **Product:** unobserved

### SCN-014: Follow an organization's release train

- **Persona:** Operator
- **Feature:** setup, doctor
- **Entry point:** `npx @passioncode-ai/passioncode@latest setup --train organization-r1`
- **Preconditions:** Node 18+; the launcher ships the train; macOS for installs (on Windows `doctor` compares, the person installs).
- **Steps:**
  1. Run setup with the train. The plan names each app's pinned release instead of its latest.
  2. Read the result: apps installed or reinstalled at their pin, the train saved for later runs.
  3. Later, run `doctor` (offline is enough): one line per app against its pin and one `train` line.
- **Expected result:** Every installed app the train pins is at its pinned version; `doctor` says how many are.
- **Alt paths:** An app newer than its pin is reported and left alone (never downgraded); `--train none` returns to the latest releases; `--dry-run` shows the train's plan and saves nothing.
- **UI elements:** The plan, the `app.<id>` and `train` lines; exit code.
- **States covered:** success, partial, error
- **Errors & recovery:** An unknown train exits 2 before anything changes; a saved train this launcher no longer ships is a `fail` line whose fix is `setup --yes --no-apps --train none`.
- **Status:** implemented
- **Coverage:** `test/setup.test.js` tests beginning `PC-89`; `test/windows.test.js` test beginning `PC-89`.
- **Product:** unobserved
