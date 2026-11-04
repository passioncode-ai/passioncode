# CLI and recovery contract

This page describes the source tree on `main`. A source merge is not an npm
publication: use the [handoff index](../README.md) to distinguish source fixes
from released and installed versions.

## Commands and results

Run the published launcher as `npx @passioncode-ai/passioncode@<version> <command>`.
From a checkout, first run `npm run vendor`, then `node bin/passioncode.js <command>`.
The launcher needs Node 18 or newer; it has no runtime dependencies.

| Command | Accepted options | Successful JSON result | Effect |
|---|---|---|---|
| `setup` (alias `onboard`) | `--yes`/`-y`, `--with <ids>`, `--without <ids>`, `--train <name>`/`none`, `--no-apps`, `--no-open`, `--dry-run`, `--allow-tools`, `--allow-commands`, `--offline`, `--json` | Setup result described below | Check, install absent apps, repair, check again ([ADR-0004](../adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md)) |
| `doctor` | `--fix`, `--offline`, `--json` | Doctor result described below; with `--fix`, a setup result | Check of everything that changes nothing but the [anonymous counts](#anonymous-usage-counts); `--fix` runs setup's repairs without new apps |
| `update` (alias `install`) | `--dry-run`, `--quiet`, `--json` | `{ version, steps, moved }` | Install the bundled payload and the apps' MCP registrations; preserve displaced files in quarantine |
| `status` | `--json` | Status object described below | Read local installation and cached npm observation |
| `restore` | `--json` | Array of restored paths/marketplace descriptions, and one note per MCP registration removed or kept | Restore the latest quarantine batch; retry unfinished entries |
| `uninstall` | `--json` | Array of removed links/plugin IDs, and one note per MCP registration removed or kept | Remove owned links/plugins, clear active release, disable auto-update |
| `config set update.auto on` or `off` | `--json` | `{ auto: boolean }` | Persist the automatic-update preference |
| `permissions` (also `allow <rule>...`, `remove <rule>...`, `mode <mode>`) | `--by <who>`, `--json` | Permissions view described below (`allow` adds `added`, `remove` adds `removed`, `mode` adds the boolean `changed` and `from`; an act that stops prints its reason on stderr and no view) | Read, or change, the Claude Code permission rules PassionCode installed and the default mode (PC-125) |
| `analytics` (also `on`, `off`, `status`) | `--json` | `{enabled, sending, reason, host}`: `reason` is null when counts are sent, else `off`, `off-elsewhere` (turned off in another PassionCode app before the launcher counted, see [Anonymous usage counts](#anonymous-usage-counts)), `env`, `do-not-track`, `no-key` or `notice` (on, waiting for the notice: nothing is sent before it) | Turn the launcher's anonymous usage and error counts off or on, or say whether they are sent (PC-123); exit 1 when the switch cannot be saved |
| `help`, `--help`, `-h`, or no command | None | Text only | Print usage |

Exit codes: **0** means the command completed (an update can include explicitly
skipped steps; `doctor` and `setup` found no failing check, or `setup` only returned a plan,
`planOnly: true`); **1** means an
operation or supported config value failed, or a `doctor`/`setup` check still
fails; **2** means an unknown command or unsupported arguments. `--quiet` suppresses
successful update output, including JSON, but never hides failed update steps.
`--dry-run` exists for setup/onboard and update/install: `doctor --dry-run`,
`uninstall --dry-run` and misspelled flags fail before any mutation. Runtime errors go to stderr, including with
`--json`; consumers must check the exit code before parsing stdout.

Evidence: [CLI dispatch](../../bin/passioncode.js), `unsupported flags are rejected
before uninstall or restore can mutate anything` and `dry run changes nothing`
in [launcher tests](../../test/launcher.test.js).

## What status proves

| Field | Meaning |
|---|---|
| `installed` | Version in the readable active release; saved installation bookkeeping is a fallback when that release cannot be read |
| `package` | Version of the payload beside the invoked CLI, which an update would install |
| `source` | Where member descriptions came from: `installed`, `package`, or null |
| `latest`, `checkedAt` | Raw saved npm observation and check timestamp, or null; no live npm probe |
| `auto` | Saved automatic-update preference; defaults to true |
| `members` | Declared member versions, plugin presence, legacy entries, hub link targets and shadowing files |

A `claude: plugin` entry proves registry presence, not that its cached bytes or
version were independently verified by status. A hub check compares its link
target, not every skill byte. A damaged state file does not prevent status from
reading the active release; mutating commands refuse to overwrite that state.
Claude availability is checked once per command, with a five-second timeout.

The text output labels npm data cached, displays its timestamp or unknown time,
and marks a stable cached version below installed as stale. Equal or higher cache
values still do not prove registry freshness. Sources: `status()` in
[launcher](../../lib/launcher.js), `cachedNpmStatus()` in
[CLI](../../bin/passioncode.js), and status regressions in the launcher tests.

## Setup and doctor

`doctor` returns `{ version, platform, at, checks, summary, ok }`. Each check is
`{ id, area, product, state, detail, fix, repair }`: `area` is `prerequisites`,
`skills`, `apps`, `mcp` or `services`; `state` is `ok`, `warn`, `fail` or `info`;
`fix` is the command or step that resolves it; `repair` names what `setup` may do
about it (`update`, `replace`, `kickstart`) or is null. `ok` is false when any
check fails. The summary and the failed ids are saved to
`~/.passioncode/doctor.json`, which the SessionStart hook repeats while it has
failures. Doctor writes nothing else and starts, stops or opens nothing, apart from the anonymous counts every command
sends when they are on ([Anonymous usage counts](#anonymous-usage-counts): `~/.passioncode/analytics.json`, its notice
marker, the shared `installation.json` created once, and one request to `https://analytics.passioncode.ai`).

| Area | What is read | A failure means |
|---|---|---|
| prerequisites | Node ≥ 18; coding agents present; Docker answering and the Supabase CLI when Fabric is installed | Node too old; Docker or the Supabase CLI missing (a stopped Docker is a warning) |
| skills | `status`: the set installed, each member's plugin, hub links, shadows, legacy copies | the set is missing or broken |
| apps (macOS) | each installed app's version against its latest release; `codesign --verify --strict`, team `KJ35UYYL22`, `xcrun stapler validate`; running or not | the signature, team or ticket does not hold (an outdated app is a warning) |
| mcp | each present agent's entry for each installed app's server; one proving call per distinct registered command (never Fabric's: it enrols a session as it starts, so its entry and binary are checked) | a bundled server is not registered, points at a missing file, or its proving call fails (an Observatory or Inbox server not yet added by its own onboarding is a warning) |
| services | each family Fabric service descriptor's `/.well-known/fabric-service` on loopback | the service does not answer (degraded is a warning) |
| services | `sessions.on-demand`: what a session Fabric starts on a board request needs, with Claude Code as the default agent (Fabric Switchboard installed, Fabric's MCP server registered in Claude Code, the skill set, Claude Code's rules for PassionCode's own tools); `info` while Fabric is not installed, on Linux, where doctor checks no app, and when only the tool rules are missing (the person's choice) ([session chain](session-chain.md), PC-124) | another part is missing (a warning; its fix names what repairs each part) |

`setup` returns `{ version, platform, mode, plan, actions, before, after,
humanSteps, planOnly, ok, keyOverride }`, plus `permissions` (PC-117, below) when Claude Code lacks PassionCode's tool rules, `commands` (PC-119, below) when it lacks a command rule or a declared rule was not offered, `dryRun: true` on a `--dry-run` (PC-107), and `trainNotSaved` (the train, or
`none` when a train is saved) when a run named a train other than the saved one but was only a plan, or was a declined
terminal run that named one.
A terminal run that took no offer (at least one of them defaulting to yes) and changed nothing is `declined: true`; its
`notTaken` names the apps whose offer defaulted to no (Fabric without its prerequisites), since leaving those is not
declining them. A terminal run that changed nothing without declining names them in `notTaken` alone. Both come only
from a terminal run, so `--json` output never carries them; in a run that asked nothing, `skipped` takes the place of `notTaken`. A run that asked
nothing (`--yes`, or no terminal, which includes every `--json` run), changed nothing and was not a plan (`planOnly`
false) names the install offers it skipped by default in `skipped`; their notes are among `humanSteps`. A plan shows the
same apps as `install` items with `selected` false and their note. A run that changes the
saved train lists it in `actions` (kind `train`). `mode` is `new` (no skill set and no
app) or `existing`. `plan` items are `install` (an absent app; `selected` false
for Fabric without its prerequisites unless `--with fabric`), `update`,
`replace` (an outdated or damaged app nothing runs from: not the app, not an agent's MCP server from its bundle; a `pgrep` that cannot answer counts as in use) and `kickstart` (a
launchd service that does not answer), each with the check ids that caused it.
`actions` are what ran, with `outcome` `done` or `failed` and `error`. `before`
and `after` are doctor results; `humanSteps` lists, once each, every remaining
fix, each product's onboarding for apps installed in this run, and the restart. A plan lists
none: its items carry their notes, and nothing ran. A declined run that named a train carries `planOnly` too, but it is
the person's answer, not a plan (`declined` true, and it exits by its checks): its steps name `setup --train <name>` when its checks call for `setup`.

Questions are asked only on a terminal: one per absent app (on macOS), one for the
repairs, if any are left after the installs (see PC-112 below), and one for Claude Code's rules for PassionCode's own
tools where Claude Code is and they are missing (default no; see PC-117 below), and one for the rules for shell commands
where Claude Code is and one of them is missing (default no; see PC-119 below). With `--dry-run`, or without a terminal and without `--yes` when the run would change
something (an offer selected, or a train other than the saved one named, `none` included when a
train is saved; a `--json` run never asks, so it counts as one without a terminal), the plan is returned with `planOnly: true`,
nothing changes, and the exit code is 0; without a terminal and without `--yes` a run with nothing
to change runs as `setup` does and exits by its checks.
`setup` exits 1 when an action failed or a check still fails after the
repairs. A terminal run that declined every offer (PC-91) exits by its checks the
same way, 1 when a check still fails, whether or not it named a train (PC-93). `doctor --fix` is `setup --yes` with no `install` items and nothing
opened.

Claude Code's rules for PassionCode's own tools (PC-117; fabric-workspace `knowledge/agents-first.md`, "When Claude
Code's auto mode refuses..."): `setup` offers to add `mcp__fabric`, `mcp__fabric-dashboards`, `mcp__switchboard`,
`mcp__plugin_switchboard_switchboard` (Switchboard through its Claude Code plugin) and `mcp__observatory` to `permissions.allow` in `~/.claude/settings.json`, so Claude Code uses those servers' tools without
asking. It is the person's security decision, taken only on its own yes: one question in a terminal (default no), or
`--allow-tools`; `--yes` alone does not take it, a `--dry-run` shows it, and `doctor --fix` never offers it. The rules
are merged: every other key and rule, and their order, is kept; a rule the person lists under `permissions.deny` or
`permissions.ask` is not added; a second run adds nothing. Only `~/.claude/settings.json` is read (a rule granted in a
project's or a managed settings file, or in another spelling such as `mcp__fabric__*`, is offered again), and the rules
are offered only where Claude Code is (its `~/.claude` folder exists). Without a terminal and without `--yes`,
`--allow-tools` adds them when nothing else would change, and is part of the plan otherwise. A settings file that cannot
be read, is not valid JSON, or whose `permissions`, `allow`, `deny` or `ask` has the wrong shape, is left as it is and
named; a run with `--allow-tools` fails that step (exit 1), and a `--dry-run` with it says so ("A run with
--allow-tools fails until that is fixed.") and exits 0. The rules merge writes a settings file that is a link, or a
chain of links, where the system says it ends (linked folders and `..` included), keeping every link and the file's
permission bits, and writes the merged file back as JSON indented by two spaces; the skill update's own write to that
file, which retires an old marketplace, and `restore`'s, which declares it again, do the same (PC-120). The result carries `permissions: { rules, error, taken }` only while
rules are missing (or the file cannot be read); `taken` is the person's yes, and the `permissions` action is the proof
they were written (a plan agreed to but not run writes nothing). The plan lists them as a line of their own (after a
train's line; while they are offered a terminal asks about them, so a train-only plan closes with "Run it with --yes to
apply, or in a terminal to answer its questions.", and a `--dry-run` whose only change is the rules (an offer that
defaults to no may stand beside them, unticked) closes with "Run it without --dry-run, in a terminal or with
--allow-tools, to apply.", naming `--allow-commands` too, joined with "and", while the rules for commands are offered), a run that leaves them out says how to add them under its
headline (`setup --allow-tools`), and a run that changed nothing else says "Everything else this command can set up is
in place". Yes to the rules alone is not a declined run, so with a named train it saves that train too.

What the rules do not cover: each one allows every tool of the server registered under that name (Fabric Dashboards'
`control`, which restarts a service, included), whatever program answers under the name. They allow MCP tools only:
shell commands (`gh pr merge`, a launchd job), other MCP servers and Fabric Inbox (`fabric-inbox`) need rules of their own.
An `ask` or `deny` rule for one of these tools (in this file or a project's, local or managed settings file), or a
managed policy that ignores user rules, still wins over them. They apply to Claude Code only. Existing machines are
offered them the next time `setup` runs; `update` and the background update do not offer them.

Rules for shell commands (PC-119) are a set of their own, with their own question in a terminal (default no) and
`--allow-commands`; `--yes` alone does not take them and `doctor --fix` never offers them. The set is the launcher's own
rules (`Bash(gh pr merge:*)`, to merge a pull request with the GitHub CLI: Claude Code cannot limit a command rule to
your repositories, so it allows a merge in any) and the rules an agent of your own declares on this machine, each in a
file `~/.passioncode/rules.d/<name>.json`:

```json
{ "by": "Your Agent", "rules": [{ "rule": "Bash(your-cli sync:*)", "why": "let Your Agent sync its data" }] }
```

`by` (1 to 80 characters) names the agent as the file says (nothing checks it) and `why` (1 to 200 characters) says what the rule allows;
the plan shows each rule with them. The folder follows `PASSIONCODE_HOME` when it is set. A declared rule names one command (`Bash(<command>)`,
with `:*` or a trailing ` *` for any arguments); an MCP rule is not offered from a declaration (PassionCode's own tool
rules have their own question, PC-117). Claude Code matches a rule against the command's text, and a rule
ending in `*` allows any arguments after its words, options included (the plan, the question, the hint and the done
line say so). So only a plain form is offered, and every other rule is refused because it could allow more than it
says: printable ASCII only; the program by its bare name in lower case (no path, so not `/bin/bash`; a version in the
name is read as the program, so `perl5.34` is `perl` and `python3.12` is `python`); no quote, escape, substitution
(`$(...)`), separator (`&&`, `;`, `|`, a line break) or redirection; never a program that runs another one (`env`,
`sudo`, `command`, `nohup`, `xargs`, `xcrun`, `lockf` and the like), not even exactly. A wildcard comes only at the
end, after `:` or a space, and only over a command installed in your home folder, as an agent's own command is (in
`~/.local/bin`, say). The program is looked up on the `PATH` setup runs with, as the kernel runs it (links and `..`
followed physically, a file the user may not execute skipped; on Windows the name itself, when it starts as a program or a script does, or `<name>.exe`, as Git Bash runs it,
never a `.cmd` or `.bat`), leaving out the `node_modules/.bin` folders `npx` adds (absolute ones; a relative one stays);
a program that is not found, or that the system or a package manager installed elsewhere, takes no wildcard, and
neither does any program when a `PATH` folder ahead of it is empty or relative (a shell reads that from wherever it
runs) or when the home folder is the root folder. Claude Code's shell may still find another program of the same name
first, so the person's yes on each rule shown stays the gate. Within the home folder there is no wildcard over a program
that runs whatever it is given, or takes options after its words that run other code (a shell, `python3`, `node`,
`perl`, `uv`, `npx`, `find`, `ssh`, `make`, `git`, `claude` and the like), and none after a general-purpose program's
name alone (`gh`, `aws`, `rm`, `curl` and the like): declare the exact command, or a command of your own. An exact
rule, with no wildcard, allows only its own text and is offered over any program but a wrapper. A control character, or a
format character that reorders or hides text (a bidirectional override or isolate, a zero-width or tag character, a
line or paragraph separator, any character Unicode marks as ignorable), in `by` or `why` is refused too. A declaration that repeats the launcher's own rule changes nothing; a rule two files declare is
offered once, as the first file (by name) not refused for it says it, and a later one is listed as the same rule. A wildcard is not offered over a `.cmd` or
`.bat` file, which runs through `cmd` and has its arguments read again. The lists name known programs, not every one: the person's yes on each rule shown is
the gate. A declared rule the launcher carries (`Bash(gh pr merge:*)`) is offered once, as the launcher says it.
The result lists them under `commands.refused` and the text under "Rules declared on this machine and not offered as declared"; a
control or format character a refusal line repeats from the declaration (its rule, file name or text) is written as
its `\uXXXX` (or `\u{XXXXX}`) escape.
Existing machines are offered the set the next time `setup` runs, until the person takes it; a rule the person lists
under `permissions.ask` or `permissions.deny` is not offered again. When Claude Code's settings cannot be read, that is
named once (above), and a run with `--allow-commands` fails that step (exit 1), as one with `--allow-tools` does.

What Claude Code does with them, from its own docs (permissions, "Compound commands"; permission-modes, "How the
classifier evaluates actions"): every subcommand of a compound command must be allowed for it to run without a prompt;
an allow rule resolves before the auto mode classifier, except writes to protected paths, which still go to the
classifier, and critical `rm` targets, which no rule approves; on entering auto mode Claude Code drops broad rules that
grant arbitrary code execution (package-manager run commands among them), so a rule over such a runner may not apply
there. For an act no rule can describe, Claude Code reads plain-language exceptions under `autoMode` in the same file,
which `setup` never writes. The result carries `commands: { rules, refused, taken }`, and `error` only when a run with `--allow-commands`
cannot read the settings (then `rules` is the whole set a run would write; without the flag, unreadable settings are
named once, under `permissions.error`); `taken` is the yes, and the `commands`
action is the proof the rules were written.

`--train <name>` follows a release train (`trains/<name>.json`): `install` and
`replace` take the pinned release (`GET /repos/<repo>/releases/tags/v<version>`)
instead of the latest, and the name is saved as `train` in
`~/.passioncode/state.json` once the run goes ahead (not with `--dry-run`, nor
when only the plan is returned; the plan still uses it). An installed app newer
than its pin is never taken back: if it needs a reinstall (a damaged signature),
that one comes from the latest release, as does one whose version cannot be read.
The train is saved with `--yes` or in a terminal (after its answers, or at once
when it has nothing to ask; a `--json` run never asks, so without `--yes` it saves no train); without either, a run that names a train other than
the saved one is a plan (`planOnly: true`) and nothing changes. Naming the saved
train again (or `none` with no train saved) changes nothing and runs as plain
`setup` does. A person who answers
no to every offer (at least one of them defaulting to yes) keeps the previous train (the train is not saved, the report says
so, and the run exits by its checks like any declined run, PC-93); those checks are the named train's, so the saved
train's fail row does not count: when the saved train is one this launcher cannot use, declining a usable one can exit 0
while plain `doctor` (on the saved train) exits 1. A plan that names a train counts the same checks: its
closing line's problems and warnings are the named train's, and can differ from plain `doctor` on the saved train; a plan
still exits 0 (PC-110). When its checks call for `setup`, its steps name `setup --train <name>`,
and an app that needs asking for is named with `setup --train <name> --with <id>` (PC-94). `--train none` is saved on any
answer, since forgetting a train touches no app. Any terminal run that answers no to its repairs, whatever else it took
(an install, or forgetting a train), names `setup` among its steps where a failing or warning check's own fix names it.
An app a run installs that bundles an MCP server (Fabric Switchboard, Fabric Dashboards, Fabric) is registered through
the skill and MCP update, so once such an install is taken the repairs question leaves that update out and asks only
about the rest, and the update runs after that install succeeds (not when it fails: that terminal run installs no skills and registers
no MCP server, where `--yes` would, and `setup` stays a step, PC-112); the update also makes the skill-set and MCP-registration repairs (PC-108).
`--train none` forgets the saved train. An unknown name exits 2 before anything is checked.
On a train, `doctor` compares each pinned app with its pin: equal is `ok`, an
older one is `warn` with a `replace` repair (macOS; on Windows the fix names the
pinned version's download page), a newer one is `warn` with no repair. One
`train` check counts the apps at their pin; a saved train this launcher does not
ship is `fail` with the fix `setup --yes --no-apps --train none`, and while it is, no app check
offers to install or reinstall it (setup touches no app until a train or `none`
is named); the skill-set update and a Windows download page stay.

An app is installed or replaced only after: `SHA256SUMS.asc` verifies against
`lib/release-key.asc` (pinned fingerprint
`63B30DC324BD697487AA31944FAFB8AEC803B6A7`, `lib/openpgp.js`); the asset's
SHA-256 equals its `SHA256SUMS` line and GitHub's digest; the unpacked app
passes `codesign --verify --strict`, carries team `KJ35UYYL22`, passes
`xcrun stapler validate` and `spctl --assess --type execute` (source
Notarized Developer ID). The download lives under
`~/.passioncode/downloads/<app>-<version>/` and is removed whatever happens. A
new app is copied beside the target (`<App>.app.passioncode-<pid>.partial`), checked again for use, then swapped in with two same-volume renames; the replaced app is moved to `~/.Trash/` and moved back if the swap fails, and the staged copy is always removed. Only `setup` and `doctor --fix` register the early-preview Fabric server; `update` alone never does.

Evidence: `lib/setup.js`, `lib/doctor.js`, `lib/releases.js`; `test/setup.test.js`
and `test/openpgp.test.js`.

## Update and failure boundaries

1. Validate the payload manifest, safe names, unique skills, plugin versions and
   required skill entry files before mutation. Release versions are plain `x.y.z`.
2. Stage a release and switch `current`. A failed copy or failed switch stops all
   subsequent plugin/link actions and does not mark the new installation active.
   An existing version with different manifest identity is refused, not overwritten.
3. Register/update the Claude marketplace, then its plugins. A failed marketplace
   step prevents dependent plugin work and legacy cleanup. A successful plugin
   command must also register the requested version before its legacy entries or
   shadows can be removed. Other agents' hub installation can still proceed.
4. Link supported existing agent channels, including directory symlinks. Record
   each quarantine move before applying it. Re-read state before the final write
   to retain config/probe results written while plugin subprocesses ran.
5. Prune the launcher's own releases (`prune` step): keep the release just
   installed and the one it replaced (the newest other release when it replaced
   none), and remove older ones and `*.partial` copies a killed update left
   behind. Files and links in `releases/` are never touched. A dry run plans it.

Updates are **not a transaction across all agents**: a failure can leave a valid
active release with incomplete plugin/channel work. The failed steps and exit 1
are the receipt; fix the cause and repeat the same pinned update. `update`,
`restore` and `uninstall` take `~/.passioncode/update.lock` (a kernel flock on
macOS, released when the holder dies; elsewhere a pid file whose holder must be
alive). A second mutating command refuses with exit 1 and names the holder;
`update --dry-run` and `status` take no lock.

Evidence: `update()` in [launcher](../../lib/launcher.js); regressions named
`a failed release copy...`, `a failed current switch...`, `marketplace failure...`,
`a successful plugin command...`, `update preserves config...` and
`a failure immediately after a quarantine move...` in the launcher tests; the lock
and pruning in [the lifecycle tests](../../test/lifecycle.test.js)
(`LC-03 a second update refuses while one holds the lock, and names the holder`,
`LC-15 after four updates only the current and the previous release remain`).

## Restore safely

`restore` restores displaced files and retired marketplace declarations from the
**latest recorded batch**. It does not roll back `current`, reinstall removed
legacy plugins, or walk automatically into older batches. An already restored
entry is skipped; a completed batch produces `Nothing to restore.` on another run.

Each successful entry gets `restoredAt` in `moved.json`. For old journals without
that checkpoint, a missing quarantine source with a destination already present
is treated as consumed, without deleting the destination. If a recorded source
is present but a user replacement occupies the destination, restore reports a
conflict; move that replacement aside yourself and retry. If a marketplace cannot
be re-added or its settings cannot be restored, exit 1 leaves it retryable.

Keep quarantine directories and settings backups until recovery is complete.
Do not delete a corrupted `state.json` to silence the error: it indexes the
quarantine batches. Preserve a copy, repair its JSON object, then retry. Recovery
from physically missing backups is manual; the launcher reports the missing path.

Evidence: `restore()` and `restoreMarketplace()` in the launcher; repeated restore,
conflict and interrupted-move regression tests in `test/launcher.test.js`.

## Permissions ledger

`permissions` shows what PassionCode allowed Claude Code to do without asking, for a person and for Fabric's
permissions screen (PC-125). Setup keeps a ledger, `~/.passioncode/permissions.json` (under `PASSIONCODE_HOME` when it
is set; private, mode 600 on macOS and Linux, a link kept): each rule it added with `--allow-tools`, `--allow-commands` or a yes in a
terminal, its set (`tools` or `commands`), what it allows (`why`), who declared it (`by`), where it came from
(`source`: `launcher`, or `rules.d/<file>.json` for an agent's declaration), when (`installedAt`), who asked for it
(`installedBy`: `PassionCode setup`, `permissions command`, or the words `--by` carried) and the launcher version. The ledger never decides what Claude Code allows; `~/.claude/settings.json` does, and the view joins the two:

```json
{ "schema": "passioncode-permissions/1", "settingsFile": "/home/you/.claude/settings.json", "readable": true,
  "mode": { "value": "acceptEdits", "file": "/home/you/.claude/settings.json" },
  "rules": [ { "rule": "Bash(gh pr merge:*)", "set": "commands", "why": "...", "by": "PassionCode setup",
               "source": "launcher", "installedAt": "2026-11-04T09:30:00.000Z", "installedBy": "Fabric (operator)",
               "version": "0.2.75", "state": "allowed" } ],
  "offered": [ { "rule": "...", "set": "...", "why": "...", "by": "...", "source": "..." } ],
  "refused": [ "<a declaration not offered as declared, with why>" ],
  "foreign": [ "Bash(npm test)" ] }
```

`rules` holds every rule the ledger names and every rule of PassionCode's sets that the settings allow, ask about or
deny without a ledger entry (`installedAt: null`: set before the ledger, or by the person, a deny included), each with
its `state` now: `allowed`, `asked`, `denied`, or `missing` (taken out since; `removedAt` and `removedBy` say when and
by whom), or `unknown` while the settings cannot be read. A rule allowed again keeps its last removal as
`lastRemoved`. `offered` is every rule PassionCode offers now that the settings name in no list, a rule taken out since
included; `refused` is setup's list of declarations it does not offer as declared; `foreign` is every other allow
rule, listed and never changed here. `mode.value` is `permissions.defaultMode` in this file, or null (not set there,
or not known while `readable` is false); a project's or a managed settings file can set another mode, and this view
reads only the user's file. `mode.changed` is the last change made through `permissions mode`: its value, the one
before (`from`), who asked and when; the file can change by hand since, so compare `mode.changed.value` with
`mode.value` before showing it as the author of the mode in force.

`permissions allow <rule>...` adds rules PassionCode offers (any other is refused, exit 2) and `remove <rule>...` takes
out of `permissions.allow` only rules PassionCode offers or the ledger names (a foreign rule is refused, exit 2; the
person removes it in the file). `permissions mode <mode>` sets `permissions.defaultMode` to one of Claude Code's modes:
`default`, `acceptEdits`, `plan`, `auto`, `dontAsk` or `bypassPermissions`; nothing else in the file changes.
`allow` and `mode` create `~/.claude/settings.json`, and its folder, when it is absent. `--by <who>` (1 to 80 characters of plain text, trimmed, with `allow`, `remove` or `mode` only) records who asked, for example `"Fabric (operator)"`; without it the
ledger says `permissions command`. It is the caller's own words, not a proof of who asked. Each change is written the
way setup writes (a link is written where it points, its permission bits kept) and each answers the view again.
Settings or a ledger that cannot be read, or a ledger that cannot be written, make an act exit 1 before the settings
change; the act prints its reason on stderr and no view, `--json` included, and `permissions --json` then shows the
view with `readable: false` and `error`, or `ledgerError`, beside every list it could read; that read exits 1, prints
the view on stdout and nothing on stderr, so a program reads the view on exit 1, as it reads `setup --json` and
`doctor --json` when a check fails. A rule taken out here is
offered again by the next `setup`, which adds it back on a yes: its question in a terminal, or `--allow-tools` or
`--allow-commands` given in advance, which do not ask (a removal does not stay removed against them yet, PC-133).
When setup can write the settings but not the ledger, it still adds the rules and says so on that step ("the
permissions ledger was not updated"); `permissions` then lists them as not in the ledger.

## Anonymous usage counts

Every command sends, when it ends, a few anonymous counts to PassionCode's analytics host: which command ran, how it
ended, how long it took in coarse buckets, and once a day that the launcher was used (PC-123). The events, their fixed
properties, the notice and what is never sent are in the [event catalogue](../analytics-events.md). The first command
that would send something, without `--json` or `--quiet`, prints the notice once on stderr (an agent passes it to the
person); a `--json` or `--quiet` run prints nothing and sends nothing until such a run has shown it. `analytics off` turns the counts off for the launcher alone, saved in
`~/.passioncode/analytics.json`; `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` turns them off for one process. A
checkout or a test sends nothing: only the published package carries the App Key. A send never makes a command fail
and never delays it by more than two seconds.

## Uninstall and reinstall

Uninstall removes only links targeting this launcher's active release/hub, including
equivalent relative links. It leaves the Claude Code rules setup added (the tool rules of PC-117 and the command rules of PC-119)
and the rules `permissions allow` added and the default mode `permissions mode` set (PC-125) in
`~/.claude/settings.json`, the declarations in `~/.passioncode/rules.d/` and the ledger `~/.passioncode/permissions.json`
(under `PASSIONCODE_HOME` when it is set);
the person removes them there, or at any time with `permissions remove` and `permissions mode default` (which sets the mode to `default`; it does not unset it). It also leaves `~/.passioncode/analytics.json`, so an `analytics off` survives a reinstall, and the shared `PassionCode/installation.json`, which the PassionCode apps use too; `uninstall` itself is counted like any command. Other user files stay in place. Failed plugin removal
returns exit 1 and keeps the marketplace and active release for a retry. A
marketplace still serving another installed plugin is retained.

After success, `current` is removed, `installed` becomes null, member bookkeeping
is cleared, and automatic updates are off. The current and previous release
directories and the quarantines remain available; `restore` still works. Repeated uninstall is safe. A later
manual install preserves the off preference; enable it explicitly with
`config set update.auto on` if wanted.

Evidence: `uninstall()` in the launcher and both `uninstall...` regressions.

## Background checks and trust

The SessionStart hook reuses a registry observation for up to 24 hours. Missing,
invalid, future or older check timestamps trigger a detached probe. Before it
spawns, the hook claims `~/.passioncode/probe.pending` with an exclusive create, so
sessions started together run one `npm view`; the probe removes the marker once it
has recorded, and a marker older than five minutes is taken over. A probe is
consumed by a later hook invocation.

Only a successful npm response with readable maintainers and publisher can
authorize an automatic update; every identity must be trusted. The spawned
command pins the verified version. Missing `npx` is reported without crashing the
session or retaining a false running marker. The running marker suppresses another
automatic attempt for ten minutes; it is not a process lock or proof of completion.
See [the security policy](../../SECURITY.md#the-self-update-and-who-it-trusts).

Evidence: [decision logic](../../plugin/passioncode/hooks/update-check.js),
[session hook](../../plugin/passioncode/hooks/session-start.js),
[probe](../../plugin/passioncode/hooks/probe.js), and
[self-update tests](../../test/self-update.test.js).

## Locations and development overrides

| Location/variable | Role |
|---|---|
| `~/.passioncode/{releases,current,state.json,quarantine,logs}` | Installed copies, active link, state, recovery records, background logs |
| `~/.passioncode/permissions.json`, `~/.passioncode/rules.d/` | The permissions ledger (PC-125) and the rules agents declare (PC-119) |
| `~/.passioncode/analytics.json` | The analytics switch and what was already counted (PC-123) |
| `~/.passioncode/analytics-notice` | An empty marker: the notice was claimed by one command, so two commands started together never both print it; one older than a minute with no record of the notice in `analytics.json` is claimed again (PC-123) |
| `PassionCode/installation.json` in the user's application data folder | The installation id every PassionCode app on the machine shares (PC-123; created once with `analytics: true`, the apps' own field, never rewritten) |
| `PASSIONCODE_ANALYTICS=off`, `DO_NOT_TRACK` | Turn the anonymous counts off for one process (PC-123) |
| `~/.agents/skills` | Shared skill hub |
| Existing paths in `CHANNELS` in `lib/launcher.js` | Supported agent channels; an absent channel is not created |
| `~/.claude/skills` | Shadowing entries may be quarantined after replacement verification |
| `PASSIONCODE_HOME` | Override launcher state/release/quarantine/log root, and with it the `rules.d` folder `setup` reads declared rules from and the permissions ledger; agent directories still use the user's home |
| `PASSIONCODE_PAYLOAD` | Override payload directory for checkout/testing |
| `PASSIONCODE_CLAUDE` | Override Claude executable for checkout/testing |
| `PASSIONCODE_APPLICATIONS` | Applications folder setup and doctor use (default `/Applications`) |
| `PASSIONCODE_GITHUB_API` | GitHub API base for release lookups (default `https://api.github.com`) |
| `PASSIONCODE_RELEASE_KEY` | An armoured key file that replaces the bundled release key, for tests; setup names it in its output whenever it is set |
| `PASSIONCODE_PLATFORM` | Treat the system as this platform (tests) |
| `PASSIONCODE_SERVICES_DIR` | Fabric service descriptors directory (else `FABRIC_SERVICES_DIR`, else the platform default) |
| `~/.passioncode/{doctor.json,releases-cache.json,downloads/}` | Last check summary, 30-minute release cache, transient downloads |

These overrides are trusted local configuration, not a sandbox. The isolated
test harness supplies a temporary home and fake Claude/npm/npx executables;
normal tests neither install into the operator's home nor contact npm.
