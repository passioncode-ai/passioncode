# UX Scenarios

<!-- Managed with super-ux (ux-contract v4). Coverage is a regression contract, not a production-install receipt. -->

## Index

| ID | Title | Feature | Persona | Traces | Status | Last audit |
|---|---|---|---|---|---|---|
| SCN-001 | Inspect cached npm version | status | Operator | REQ-1, REQ-2 | implemented | 2026-10-01 |
| SCN-002 | Read status without changing the installation | status | Automation | REQ-3 | implemented | 2026-10-01 |
| SCN-003 | Update with a partial failure | update | Operator | REQ-A1 | implemented | 2026-11-05 |
| SCN-004 | Restore displaced entries safely | restore | Operator | REQ-A1 | implemented | 2026-11-05 |
| SCN-005 | Uninstall and retry a failed removal | uninstall | Operator | REQ-A1 | implemented | 2026-11-05 |
| SCN-006 | Start a session with a registry observation | self-update | Operator | REQ-A2 | implemented | 2026-10-01 |
| SCN-007 | Reject unsupported arguments or damaged state | command validation | Operator | REQ-A1 | implemented | 2026-10-01 |
| SCN-008 | Set up a new computer with one command | setup | Newcomer | REQ-1…REQ-5 | implemented | 2026-10-13 |
| SCN-009 | Check and repair an existing setup with the same command | setup | Operator | REQ-7a | implemented | 2026-10-13 |
| SCN-010 | Check the setup without changing anything (but the anonymous counts) | doctor | Operator, Automation | REQ-6, REQ-8 | implemented | 2026-10-13 |
| SCN-011 | A download that fails verification installs nothing | setup | Newcomer | REQ-2 | implemented | 2026-10-13 |
| SCN-012 | A coding agent sets the computer up from one pasted prompt | setting-up-passioncode | Newcomer | REQ-9, REQ-10 | implemented | 2026-10-13 |
| SCN-013 | A new session names the problems of the last setup check | session start | Operator | REQ-9 | implemented | 2026-10-13 |
| SCN-014 | Follow an organization's release train | setup, doctor | Operator | PC-89 | implemented | 2026-10-28 |
| SCN-015 | See and change what Claude Code may do without asking | permissions | Operator | PC-125 | implemented | 2026-11-04 |
| SCN-016 | Know about and turn off the anonymous usage counts | analytics | Operator | PC-123 | implemented | 2026-11-04 |

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
- **Expected result:** Existing JSON fields retain their raw values. Both text and JSON status leave state unchanged and do not invoke npm, apart from the launcher's anonymous counts (SCN-016).
- **Alt paths:** With no observation, `latest` and `checkedAt` remain null.
- **UI elements:** JSON on stdout and process exit code.
- **States covered:** empty, success
- **Errors & recovery:** Network availability has no effect on reading locally saved status (a count that cannot be sent is dropped).
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
- **Alt paths:** `--dry-run` plans without applying; symlinked channel directories are supported; immutable version mismatch is refused; an update while another update, restore or uninstall runs refuses with exit 1 and names the holder; releases older than the one replaced are pruned; an agent config that is a link is written where it points with its mode kept, and a link into a folder that cannot be written fails that agent's `mcp` step and keeps the link (PC-126).
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
- **Errors & recovery:** A user replacement stays untouched. Move it aside before retrying. Missing backup paths are reported; partial work remains recorded. An MCP entry whose file the system cannot open now is kept; the rest of the batch is still put back and listed, and restore exits 1 naming the file. Once the file and its folder are readable and writable, a restore removes it while that batch is still the latest; after any update (a quiet or background one included) starts a new batch, delete it by hand (uninstall, which removes PassionCode too, also does). A JSON file that does not parse, or a folder in place of a file, is reported as kept and no longer tracked; `config.toml` is read as text: a launcher table edited since (a key or comment added inside it included) or a server declared another way is reported as kept, and an entry no longer declared in the file is taken as gone; an entry kept because it was changed is no longer tracked (PC-127). Restore takes out only MCP entries an update recorded as registered, so an entry declared by hand after a failed registration stays (PC-126).
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; SCN-004 evidence includes repeat, conflict and interruption regressions and the PC-127 restore test.
- **Product:** unobserved

### SCN-005: Uninstall and retry a failed removal

- **Persona:** Operator
- **Feature:** uninstall
- **Entry point:** `passioncode uninstall`
- **Preconditions:** A set is installed, or an earlier uninstall was partly applied.
- **Steps:**
  1. Run uninstall.
  2. Fix any reported plugin failure and retry.
  3. Inspect status (it does not list an MCP entry an incomplete uninstall kept; the uninstall's error names it); optionally restore displaced files.
- **Expected result:** Success clears the active installation, so nothing updates itself while nothing is installed; the update switch stays as the person set it (LC-16, PC-131), and `status` still shows it (on by default) although nothing installed updates; recovery copies remain. Repeating uninstall is safe.
- **Alt paths:** A relative owned link is removed; unrelated files stay. A marketplace serving another plugin is retained. The Claude Code rules for PassionCode's own tools (PC-117) and for commands (PC-119) that setup added stay in `~/.claude/settings.json`, the rules `permissions allow` added and a default mode `permissions mode` set stay there too (PC-125), and the declarations agents wrote in `~/.passioncode/rules.d`, the permissions ledger `~/.passioncode/permissions.json`, the analytics switch `~/.passioncode/analytics.json` (an `off` survives a reinstall) and the shared `PassionCode/installation.json` stay; the person removes them there, or at any time with `permissions remove` and `permissions mode default` (which sets the mode to `default`; it does not unset it).
- **UI elements:** Removed list, errors, status.
- **States covered:** empty, error, success
- **Errors & recovery:** Plugin failure returns exit 1 and preserves the marketplace/current needed for retry. An MCP entry whose file the system cannot open now (a link into a locked folder) does not stop the rest: uninstall finishes and lists what it removed, exits 1 naming the file and keeps the entry recorded, and a retry once the file and its folder are readable and writable removes it (PC-127). `config.toml` is read as text: a launcher table edited since (a key or comment added inside it included) or a server declared another way is reported as kept; an entry no longer declared is taken as gone; an entry kept because it was changed is no longer tracked, so a retry leaves it (PC-127). A reinstall keeps the update switch as it was; an uninstall by 0.2.75 or earlier wrote it off, and `config set update.auto on` turns it back on.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`; SCN-005 evidence names successful/repeated and failed uninstall tests and the PC-127 uninstall test and the PC-131 update-switch test (AUD-50).
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
- **Expected result:** Unsupported arguments return exit 2 before mutation (apart from the launcher's anonymous counts, SCN-016). Invalid state returns exit 1 without overwriting it; status can still read the active release.
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
  1. Run setup. In a terminal, answer one question per absent app (Fabric, an early preview, defaults to no without Docker and the Supabase CLI), one for the repairs, if any are left, where Claude Code is and its rules for PassionCode's own tools are missing, one for those rules (default no), and, where Claude Code is and a rule for commands is missing, one for the rules for commands (default no): an app that bundles an MCP server (Fabric Switchboard, Fabric Dashboards, Fabric) runs the skill and MCP update itself, so a new computer that takes one is often asked no repairs question.
  2. Read the result: what was installed, the checks before and after, and the numbered steps that stay the person's.
  3. Do those steps (sign-ins, consents, secrets in each product's hidden prompt), restart the coding agents.
- **Expected result:** The chosen apps are installed from verified releases and opened once; the skill set is installed; every bundled MCP server is registered for every agent present and answers its proving call; the person's steps are listed once.
- **Alt paths:** `--with`/`--without` choose apps; `--no-apps` sets up skills and MCP only; Claude Code's rules for PassionCode's own tools (`mcp__fabric`, `mcp__fabric-dashboards`, `mcp__switchboard`, `mcp__plugin_switchboard_switchboard`, `mcp__observatory`) are offered as a question of their own in a terminal, default no, or added by `--allow-tools`, never by `--yes` alone; they are merged into `~/.claude/settings.json` keeping every rule there, a plan lists them as "let Claude Code use PassionCode's own tools without asking: allow ...", a run that leaves them out adds under its headline "Claude Code still asks before it uses PassionCode's own tools. To allow them: ... setup --allow-tools" (and says "Everything else this command can set up is in place" when it changed nothing else), settings it cannot read are named, not changed (with `--allow-tools` or `--allow-commands` they make the run fail, exit 1, and a `--dry-run` says "A run with --allow-tools fails until that is fixed.", naming the flag given), while the rules are offered a train-only plan lists them after the train and closes with the questions footer, since a terminal asks about them, and a `--dry-run` whose only change is the rules (an offer that defaults to no may stand beside them, unticked) closes with "Run it without --dry-run, in a terminal or with --allow-tools, to apply.", naming `--allow-commands` too, joined with "and", while the rules for commands are offered (PC-117, PC-119); rules for shell commands are a set of their own with their own question (default no) or `--allow-commands`: the launcher's `Bash(gh pr merge:*)` (it cannot be limited to the person's repositories, and the plan says so) and the rules an agent of the person's own declares in `~/.passioncode/rules.d/`, the plan listing each under "let Claude Code run these commands without asking" with what it allows and who declared it, a declared rule that would allow more than it says listed under "Rules declared on this machine and not offered as declared" with why, and a run that leaves them out saying "Claude Code still asks before it runs ... To allow them: ... setup --allow-commands", adding "(a rule ending in * allows any arguments after its words)" when one of them is a wildcard; when the settings' default mode is `bypassPermissions`, `dontAsk` or `auto` (which do not ask), both lines say instead "Claude Code's allow rules do not include ...; its default mode in your user settings, <mode>, decides what it does without them. To allow them: ..." (`bypassPermissions` with `disableBypassPermissionsMode: "disable"` in the same file counts as asking; PC-125); a wildcard is offered only over a command installed in the person's home folder (PC-119); `--dry-run` shows the plan (a plan with nothing to change says "Nothing to do" or names the app it would leave, "Nothing would change: Fabric would not be installed", either adding "The checks below still stand" when a check fails or warns; a plan that changes the train lists it as the plan's last item, "save release train <name>", or "forget the saved release train" for `--train none` (a plan whose only change is a train is still a plan), and says the train was not saved, or not forgotten; the plan closes with how to apply it, "Run it without --dry-run (with --yes, or in a terminal) to apply." after a `--dry-run`, and "Run it with --yes, or in a terminal, to apply." when it has nothing to ask, no offer and no repair, only a train, since a terminal then asks nothing and saves the train at once; an offer that defaults to no is still asked about); without a terminal and without `--yes`, a run that would change something (an offer selected, or a train other than the saved one named, `none` included when a train is saved) prints the plan and changes nothing (a `--json` run never asks, so it counts as one without a terminal), and one with nothing to change reports its checks and exits by them; answering no to every offer (at least one of them defaulting to yes) changes nothing (forgetting a train with `--train none` is a change on any answer) and says "You declined every offer; nothing was changed", adding "The checks below still stand" when a check fails or warns (or "You declined every other offer, and Fabric was not installed" when an offer that defaults to no, Fabric without Docker or the Supabase CLI, was left as it was), with `setup` (or `setup --train <name>` when a train was declined) among the person's steps when a failing or warning check's own fix names `setup`; on Linux or Windows the apps are named with their download page.
- **UI elements:** Questions on stderr; the result on stdout (text or `--json`); exit code.
- **States covered:** empty, loading, success, error
- **Errors & recovery:** A failed step is named with its cause and exit 1; running setup again resumes, because completed work is detected and skipped. Setup records the Claude Code rules it adds in the permissions ledger `~/.passioncode/permissions.json` (SCN-015); when it cannot write the ledger, the rules still stand, the step is done and ends "the permissions ledger was not updated (...)", and the run exits by its checks.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `a new machine:`, `without a terminal and without --yes`, `PC-91:`, `PC-101:`, `PC-104:`, `PC-105:`, `PC-107:`, `PC-108:`, `PC-110:`, `PC-112:`, `PC-117:` and `PC-119:`; `test/permissions.test.js`.
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
- **Expected result:** The closing line counts what is still open: "No problems" or the number of problems (FAILs), with the warnings named beside them ("No problems, 1 warning(s).", or "No problems remain (before: 2), 1 warning(s)." after repairs); open checks are "Still open:" after any run, a declined one included, and "Open now:" under a plan. The skill set and MCP registrations are repaired; an outdated or damaged app that is not running is reinstalled from its verified release and the old one is in the Trash; a family service launchd owns that does not answer is started with `launchctl kickstart` (no `-k`); a running app is never replaced; nothing is killed. On a healthy computer nothing changes (apart from the launcher's anonymous counts, SCN-016) and the exit code is 0; a `sessions.on-demand` warning is listed under the checks, never as a step for the person.
- **Alt paths:** `doctor --fix` runs the same repairs without installing new apps or opening anything (it never asks). `setup` in a terminal, answered no to the repairs and to every other offer, changes nothing, is reported as declined (never as "everything is in place") and still names `setup` among the person's steps when a failing or warning check's own fix names it (a service it would start keeps that check's own fix). The steps rule holds for any terminal run that answers no to the repairs, whatever else it took (an install, or forgetting a train with `--train none`): `setup` stays among the person's steps where a failing or warning check's own fix names it. An app it installs that bundles an MCP server (Fabric Switchboard, Fabric Dashboards, Fabric) is registered through the skill and MCP update, so once such an install is taken the repairs question leaves that update out, and the update runs after that install succeeds, not when it fails (PC-112); the update also makes the skill-set and MCP-registration repairs, so their checks may pass and leave no `setup` step (PC-108). A yes to PassionCode's tool rules alone (PC-117), or to the rules for commands alone (PC-119), is not a declined run: it adds those rules. An existing machine is offered the rules for commands on its next `setup` until the person takes them or lists them under ask or deny (PC-119). An app answered no that has no note (its prerequisites are there) is no step of its own: running `setup` again offers it, and the steps name `setup` only when a failing or warning check's own fix names it. Fabric named with `--with fabric` without its prerequisites and then answered no is "not installed (--with fabric)" among the steps (with a declined train, `setup --train <name> --with fabric`). On a set-up Mac where the only offer defaults to no (Fabric without Docker or the Supabase CLI), a terminal run that takes nothing and names no train other than the saved one (`--train none` with a train saved is a change) says "Nothing was changed: Fabric was offered and not installed" and lists the app's note among the person's steps (a run that names a new train saves it, "Done: saved release train"). The same machine re-run with `--yes`, or without a terminal, naming no train other than the saved one, says "Nothing was changed: Fabric was not installed (see your steps below)" rather than "everything is in place". A terminal run that answers no to every offer that defaults to yes and leaves Fabric's says "You declined every other offer, and Fabric was not installed": leaving a default-no offer is not declining it. Each of these lines adds "The checks below still stand." when a check fails or warns, and only then. A run that is not a plan, changes nothing and leaves no app out (none offered and not installed, none skipped) says "Everything this command can set up is in place; nothing was changed." ("Everything else this command can set up is in place" while Claude Code's tool rules or the rules for commands are offered and not taken, or its settings cannot be read, PC-117, PC-119), adding "The checks below still stand." the same way; with a check it cannot repair failing it exits 1. A `--dry-run` is a plan and says "Nothing to do" instead.
- **UI elements:** The before → after table by area, every check that changed state, what is still open, the person's steps.
- **States covered:** success, error
- **Errors & recovery:** A problem that remains keeps exit 1 and names its fix. A rule step that cannot write the permissions ledger still adds its rules and says "the permissions ledger was not updated (...)", as in SCN-008.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `an existing broken setup:` and `a new machine:` (its no-op re-run), `PC-91:`, `PC-92:`, `PC-94:`, `PC-101:`, `PC-104:`, `PC-105:`, `PC-107:`, `PC-108:`, `PC-112:`, `PC-114:`, `PC-117:` and `PC-119:`; `test/windows.test.js` test beginning `PC-108:`.
- **Product:** unobserved

### SCN-010: Check the setup without changing anything (but the anonymous counts)

- **Persona:** Operator, Automation
- **Feature:** doctor
- **Entry point:** `npx @passioncode-ai/passioncode@latest doctor [--json] [--offline]`, a product's "Check setup" button, or a coding agent
- **Preconditions:** None.
- **Steps:**
  1. Run doctor.
  2. Read one line per check, grouped by area (prerequisites, skills, apps, MCP, services), each with its state and, when not ok, its fix.
- **Expected result:** Nothing is installed, registered, started, stopped or opened; the only writes are doctor's own result, its release cache (`~/.passioncode/releases-cache.json`, release lookups kept 30 minutes) and, unless they are off, the launcher's anonymous counts (SCN-016). The `sessions.on-demand` row says whether sessions Fabric starts on a board request can run here: ok when nothing is missing, a warning naming each missing part, information on Linux, without Fabric or when only the tool rules, Claude Code itself or a Fabric entry doctor cannot read are missing. Each registered stdio MCP server answers `initialize` and `tools/list` and one read-only tool; Fabric's server is never started (it enrols a session as it starts), its entry and binary are checked. The result is saved for the session hook. Exit 0 when no check failed, 1 otherwise.
- **Alt paths:** `--offline` skips the latest-release lookups; `--fix` repairs as setup does. On Windows the apps rows
  come from each app's uninstall entry (`reg query`) or its install folder: the installed version, whether a newer
  one is out, or "not installed" with the download page; a registry hive that could not be read is a warning of its
  own (PC-86).
- **UI elements:** Grouped text lines or JSON; exit code.
- **States covered:** success, error
- **Errors & recovery:** Every failing line names the command or the step that fixes it.
- **Status:** implemented
- **Coverage:** `test/setup.test.js`, tests beginning `doctor is read-only` and `a proving call that fails`; PC-124's `sessions.on-demand` row: `test/setup.test.js` test beginning `doctor never starts Fabric's MCP server` and `test/analytics.test.js` test beginning `PC-124:`.
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
- **Alt paths:** None: there is no flag that skips a check.
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
  2. The agent runs `setup --yes --json`, finishes each step an agent may take, runs `doctor` (the README prompt, whose plain `doctor` shows the notice) or `analytics status` once without `--json` (the skill), and reports.
- **Expected result:** The person reads what was set up or fixed, what still fails, and a numbered list of their own steps; the launcher's anonymous-counts notice word for word, or the status line it printed (SCN-016); no secret is asked for in the chat.
- **Alt paths:** "Don't change anything" → the agent runs doctor only, and names the counts and `analytics off` without running `analytics status` or another command to show the notice (its `doctor --json` counts only where the notice was shown before).
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
- **Alt paths:** An app newer than its pin is reported and left alone (never downgraded); `--train none` returns to the latest releases; `--dry-run` shows the train's plan (when it names a train other than the saved one, its last item is "save release train <name>", followed only by Claude Code's tool rules while they are offered, PC-117) and saves nothing; without a terminal and without `--yes`, a plan whose only item is the train closes with "Run it with --yes, or in a terminal, to apply.", since a terminal then asks nothing and saves the train at once (while Claude Code's tool rules are offered a terminal asks about them, so it closes with the questions footer, PC-117); a yes to the tool rules alone is a run the person agreed to, so it saves a named train with them; in a terminal, answered no to every offer (at least one of them defaulting to yes), the train is not saved, the report says so, the run exits by its checks (1 when a check still fails, PC-93), the report lists no plan under its headline, and the person's steps name `setup --train <name>` where a failing or warning check's own fix names `setup` (and `setup --train <name> --with fabric` for Fabric without its prerequisites); `--train none` in a terminal is saved on any answer, and when the repairs are answered no, the steps name `setup` where a failing or warning check's own fix names it.
- **UI elements:** The plan, the `app.<id>` and `train` lines; exit code.
- **States covered:** success, partial, error
- **Errors & recovery:** An unknown train exits 2 before anything changes; a saved train this launcher no longer ships is a `fail` line whose fix is `setup --yes --no-apps --train none`.
- **Status:** implemented
- **Coverage:** `test/setup.test.js` tests beginning `PC-89`, `PC-91:`, `PC-94:`, `PC-105:` and `PC-110:`; `test/windows.test.js` test beginning `PC-89`.
- **Product:** unobserved

### SCN-015: See and change what Claude Code may do without asking

- **Persona:** Operator (Automation: Fabric's permissions screen through `--json`)
- **Feature:** permissions
- **Entry point:** `npx @passioncode-ai/passioncode@latest permissions`
- **Preconditions:** Node 18+; Claude Code's settings in `~/.claude/settings.json` (absent is an empty file; `allow` and `mode` create it, and its folder, when they write).
- **Steps:**
  1. Run `permissions`: PassionCode's rules, each with its state, what it allows, who declared it, and who installed it and when; the rules offered and not allowed yet; the declarations not offered as declared; every other allow rule; the default mode.
  2. Take a rule out with `permissions remove <rule>`, or allow an offered one with `permissions allow <rule>`.
  3. Switch the default mode with `permissions mode <mode>`.
- **Expected result:** Only rules PassionCode offers or installed change; every other key and rule of the settings file is kept; the ledger records who asked (`installedBy`, the words of `--by`, or `permissions command`) and when, and keeps a removed rule with `removedAt` and `removedBy`.
- **Alt paths:** `--json` answers the same view for a program (Fabric); a rule PassionCode does not offer is refused for `allow`, and one it neither offers nor has in its ledger for `remove` (exit 2, nothing written); a mode Claude Code does not have is refused (exit 2); rules of PassionCode's sets the settings name without a ledger entry (set before it, or by the person, a deny included) are listed as "not in the ledger"; a rule taken out is offered again, here and by the next `setup`, which adds it back on its question or with `--allow-tools` or `--allow-commands`; a settings file that is a link stays a link with its mode.
- **UI elements:** The view's sections in text, the JSON view, exit code.
- **States covered:** success, empty, error
- **Errors & recovery:** `permissions` (and `--json`) with settings or a ledger it cannot read exits 1 and still prints the view on stdout, nothing on stderr, so a program reads the view on exit 1. For `permissions allow`, `remove` and `mode`: settings or a ledger that cannot be read, or a ledger that cannot be written, are named and exit 1 before the settings change; the person repairs the file and runs the command again.
- **Status:** implemented
- **Coverage:** `test/ledger.test.js` tests beginning `PC-125:`; `test/setup.test.js` tests beginning `PC-117:` and `PC-119:` (the ledger setup writes).
- **Product:** unobserved

### SCN-016: Know about and turn off the anonymous usage counts

- **Persona:** Operator
- **Feature:** analytics
- **Entry point:** any command; `npx @passioncode-ai/passioncode@latest analytics`
- **Preconditions:** Node 18+; the published package (a checkout carries no App Key and sends nothing).
- **Steps:**
  1. Run any command without `--json` (a person, or an agent who passes the line on): the first one that would send something prints, once, "The PassionCode launcher sends anonymous usage and error counts to improve it. Turn them off for the launcher: npx @passioncode-ai/passioncode@latest analytics off (each PassionCode app has its own switch).".
  2. Run `analytics off`: nothing is sent from then on; `analytics status` says "turned off (analytics off)" and that each PassionCode app has its own switch.
  3. Run `analytics on` to send them again.
- **Expected result:** Each command sends, when it ends, the events of docs/analytics-events.md with fixed words only; the switch is the launcher's own and never turns another PassionCode app off.
- **Alt paths:** `--json` and `--quiet` runs never print the notice and send nothing until it was shown, and `analytics status --json` then reports reason `notice`; a `no` given earlier in a PassionCode app (the shared file's `analytics: false`) is kept as the launcher's off, which `analytics status` names and `analytics on` lifts for the launcher alone; `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` turn the counts off for one process; the background update at session start sends nothing; a build without a key says "this build carries no App Key, so nothing is sent".
- **UI elements:** The notice line on stderr, the status line, the JSON status, exit code.
- **States covered:** success, empty, error
- **Errors & recovery:** A send that fails or is slow is dropped after two seconds and never fails the command; a word other than on, off or status exits 2. A switch file that cannot be read counts as off for that run and is not rewritten; `analytics on` or `off` writes it again.
- **Status:** implemented
- **Coverage:** `test/analytics.test.js` tests beginning `PC-123:`.
- **Product:** unobserved
