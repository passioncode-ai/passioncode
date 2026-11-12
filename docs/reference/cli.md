# CLI and recovery contract

This page describes the source tree on `main`. A source merge is not an npm
publication: use the [handoff index](../README.md) to distinguish source fixes
from released and installed versions.

Claude Code's files on this page: every `~/.claude` path and `~/.claude.json` means the folder `CLAUDE_CONFIG_DIR`
names when it is set (its `.claude.json` inside it), as Claude Code itself reads them; in a session of Fabric
Switchboard 0.7.14 or later, settings, plugins and MCP servers mean the person's own folder that
`SWITCHBOARD_CLAUDE_SOURCE_DIR` names, and with an earlier Switchboard `~/.claude` (PC-129;
[the two rows in Locations](#locations-and-development-overrides)).

## Commands and results

Run the published launcher as `npx @passioncode-ai/passioncode@<version> <command>`.
From a checkout, first run `npm run vendor`, then `node bin/passioncode.js <command>`.
The launcher needs Node 18 or newer; it has no runtime dependencies.

| Command | Accepted options | Successful JSON result | Effect |
|---|---|---|---|
| `setup` (alias `onboard`) | `--yes`/`-y`, `--with <ids>`, `--without <ids>`, `--train <name>`/`none`, `--wiki-vault <dir>`, `--no-apps`, `--no-open`, `--dry-run`, `--allow-tools`, `--allow-commands`, `--offline`, `--json` | Setup result described below | Check, install absent apps, repair, check again ([ADR-0004](../adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md)) |
| `doctor` | `--fix`, `--offline`, `--json` | Doctor result described below; with `--fix`, a setup result | Check of everything that changes nothing but the [anonymous counts](#anonymous-usage-counts); `--fix` runs setup's repairs without new apps |
| `update` (alias `install`) | `--dry-run`, `--quiet`, `--json` | `{ version, steps, moved }` (a `moved` entry with `failedAt` is a registration that was never written, not a recovery entry) | Install the bundled payload and the apps' MCP registrations; preserve displaced files in quarantine |
| `status` | `--json` | Status object described below | Read local installation and cached npm observation |
| `restore` | `--json` | Array of restored paths/marketplace descriptions, and one note per MCP registration removed, put back (an entry the update re-pointed at the user's own copy runs the old command again, PC-149) or kept | Restore the latest quarantine batch; retry unfinished entries |
| `uninstall` | `--json` | Array of removed links/plugin IDs, and one note per MCP registration removed or kept | Remove owned links/plugins, clear active release and the session hook's update folders (`~/.passioncode/run/`, kept while an update recorded in the last hour may run from them; the update switch is kept) |
| `config set update.auto on` or `off` | `--json` | `{ auto: boolean }` | Persist the automatic-update preference |
| `permissions` (also `allow <rule>...`, `remove <rule>...`, `mode <mode>`) | `--by <who>`, `--json`, `--confirm-bypass` (with `mode bypassPermissions` only) | Permissions view described below (`allow` adds `added`, `remove` adds `removed`, `mode` adds the boolean `changed` and `from`; an act that stops prints its reason on stderr and no view) | Read, or change, the Claude Code permission rules PassionCode installed and the default mode (PC-125) |
| `analytics` (also `on`, `off`, `status`) | `--json` | `{enabled, sending, reason, host}`: `reason` is null when counts are sent, else `off`, `off-elsewhere` (turned off in another PassionCode app before the launcher counted, see [Anonymous usage counts](#anonymous-usage-counts)), `unreadable` (the switch file is there but cannot be read: off for that run, never rewritten by a count), `shared-unreadable` (the shared `installation.json` is there but cannot be read, or holds no usable id: nothing is sent until it can be), `env`, `do-not-track`, `no-key` or `notice` (on, waiting for the notice: nothing is sent before it) | Turn the launcher's anonymous usage and error counts off or on, or say whether they are sent (PC-123); exit 1 when the switch cannot be saved |
| `help`, `--help`, `-h`, or no command | None | Text only | Print usage |

Exit codes: **0** means the command completed (an update can include explicitly
skipped steps; `doctor` and `setup` found no failing check in what the run covered, or `setup` only returned a plan,
`planOnly: true`: the `memory.*` rows of a part named in `leftOut` do not count, except a failing Obsidian signature);
**1** means an
operation or supported config value failed, or a `doctor`/`setup` check still
fails; **2** means an unknown command or unsupported arguments. `--quiet` suppresses
successful update output, including JSON, but never hides failed update steps.
`--dry-run` exists for setup/onboard and update/install: `doctor --dry-run`,
`uninstall --dry-run` and misspelled flags fail before any mutation. Runtime errors go to stderr, including with
`--json`; consumers must check the exit code before parsing stdout. On exit 1 from an
MCP entry kept for a retry, `restore --json` and `uninstall --json` still print the
array of what they did (no output when they did nothing), and stderr names the kept
entries (PC-127).

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
| `npmMissing` | `true` when the last check found no npm beside this Node, so nothing is checked until there is one (PC-143); the text line says "not checked (no npm beside this Node)" |
| `refused`, `refusedVersion` | The session hook's standing refusal while the refused version is newer than installed: its reason (`registry_signature`, `provenance`, `untrusted_publisher`, `unreadable_publisher`) and version, or null; it stands also when the last check failed (PC-131) |
| `auto` | Saved automatic-update preference; defaults to true |
| `members` | Declared member versions, plugin presence, legacy entries, hub link targets and shadowing files |

A `claude: plugin` entry proves registry presence, not that its cached bytes or
version were independently verified by status. A hub check compares its link
target, not every skill byte. A damaged state file does not prevent status from
reading the active release; mutating commands refuse to overwrite that state.
Claude availability is checked once per command, with a five-second timeout.

The text output labels npm data cached, displays its timestamp or unknown time,
and marks a stable cached version below installed as stale; a newer one the hook refused
adds `not installed automatically` and the reason in words. Equal or higher cache
values still do not prove registry freshness. Sources: `status()` in
[launcher](../../lib/launcher.js), `cachedNpmStatus()` in
[CLI](../../bin/passioncode.js), and status regressions in the launcher tests.

## Setup and doctor

`doctor` returns `{ version, platform, at, checks, summary, ok }`. Each check is
`{ id, area, product, state, detail, fix, repair, gate }`: `area` is `prerequisites`,
`skills`, `apps`, `memory` (PC-178), `mcp` or `services`; `state` is `ok`, `warn`, `fail` or `info`;
`fix` is the command or step that resolves it; `repair` names what `setup` may do
about it (`update`, `replace`, `kickstart`, `tool`, `hook`) or is null. `gate` (PC-171) says which of a person's own acts
the `fix` needs, the first one they meet: `sign-in`, `code` (a one-time code), `consent`, `payment` or `secret` (a
value only a person types, an administrator's password included); null when an agent can carry the fix out, and always
null on a check without a fix. Today: `consent` for `memory.wiki` when uv is missing and Homebrew is absent or not this
user's to write (a person runs uv's installer), for a `memory.hooks` row whose vault the launcher did not make (adding the
hook is the person's choice), for `memory.hooks.stop`, for `memory.wiki.shadow` (removing with pip or pipx a copy the
launcher did not install), for `memory.wiki.clash` (moving or renaming the person's own skills, or repairing a folder that could not be read), for `memory.vault.config-form` (the person rewrites the config line), for a `memory.hooks` warning beside an older `~/.obsidian-wiki` (removing or merging it), for `memory.config` (setting XDG_CONFIG_HOME to an absolute folder or unsetting it), for a `memory.hooks` warning whose registered script is gone (removing that entry by hand) and for a `memory.wiki` row whose copy uv does not list, that uv holds but does not run (the person's reinstall), or whose install or upgrade a clash or a config line holds back (an install: a config line only), or that is the person's own copy off this PATH (putting its command folder on PATH); `secret` for
`memory.obsidian.signature` when the damaged Obsidian is an administrator's copy (PC-178); `consent` for
`skills.auto-update`, for a `sessions.on-demand` row that lacks Claude Code's tool rules and for a service port another OS
account holds; `secret` for a service that waits for setup
(DEC-0044 says only that a key is not entered or a model not chosen, so the key names it), for a missing
`observatory` or `fabric-inbox` MCP server or service descriptor (their onboarding asks for a key first) and for a
`blocked` row whose folder an administrator must open; `sign-in` for Fabric Switchboard's onboarding. Readers that do
not know the field ignore it. `ok` is false when any
check fails. The summary and the failed ids are saved to
`~/.passioncode/doctor.json` (with `blocked`, the failed ids whose app folder this user cannot write, PC-147, and `manual`, the
failed ids no setup run repairs, such as a failing wiki vault, PC-178; `setup` saves only the rows of what it covered, so
the `memory.*` rows of a part named in `leftOut` are not among them, while a plain `doctor` saves them all until
PC-187), which the
SessionStart hook repeats while it has failures (naming `doctor` instead of `setup` when every one is blocked or manual), and release lookups are kept 30 minutes in `~/.passioncode/releases-cache.json`. Doctor writes nothing else and
starts, stops or opens nothing, apart from the anonymous counts every command
sends when they are on ([Anonymous usage counts](#anonymous-usage-counts): `~/.passioncode/analytics.json`, its notice
marker, the shared `installation.json` created once, and one request to `https://analytics.passioncode.ai`).

| Area | What is read | A failure means |
|---|---|---|
| prerequisites | Node ≥ 18; coding agents present; Docker answering and the Supabase CLI when Fabric is installed | Node too old; Docker or the Supabase CLI missing (a stopped Docker is a warning) |
| skills | `status`: the set installed, each member's plugin, hub links, shadows, legacy copies; the update switch (`skills.auto-update`, information only, when `update.auto` is off, with the command that turns it on: an uninstall by 0.2.75 or earlier wrote it off, PC-131) | the set is missing or broken |
| apps (macOS) | this user's copy of each app (the per-user rule of `PASSIONCODE_APPLICATIONS` below), with an information row `app.<id>.shared` for a copy in `/Applications` left as it is; each installed app's version against its latest release; `codesign --verify --strict`, team `KJ35UYYL22`, `xcrun stapler validate`; running or not | the signature, team or ticket does not hold (an outdated app is a warning) |
| mcp | each present agent's entry for each installed app's server; one proving call per distinct registered command (never Fabric's: it enrols a session as it starts, so its entry and binary are checked) | a bundled server is not registered, points at a missing file, or its proving call fails (an Observatory or Inbox server not yet added by its own onboarding is a warning; an entry that runs from a copy in `/Applications` this user does not use, while their own copy is installed, is a warning: one the launcher set and nobody changed since gets the fix `setup`, which points it at this user's copy (PC-149); one the person set says the launcher did not set it, and its fix removes it (for Claude Code `claude mcp remove --scope user <name>`) and runs `doctor --fix`, PC-146) |
| services | each family Fabric service descriptor's `/.well-known/fabric-service` on loopback, read only after the server end of doctor's own open connection to it is this OS account's (PC-152, PC-163, the contract's HA-2 and CT-254: macOS `netstat -anv -p tcp` and `ps`, Linux `/proc/net/tcp` and `tcp6` with the listener on `127.0.0.1` before a wildcard while the connection is not yet accepted, Windows `Get-NetTCPConnection` and the process's owner SID) | the service does not answer (degraded is a warning; one degraded only by slots waiting for a person, the contract's DEC-0149 `setup: true` entries, reads «waits for setup» with the slots and the setup to finish, PC-164); the port belongs to another OS account, or its owner cannot be told: doctor sends that listener nothing, reads nothing from it and offers no `kickstart`; a socket table this system cuts short (some macOS releases show a reader only its own sockets) is a warning that names the port and the service's own doctor, never another account |
| memory (PC-178, [ADR-0006](../adr/0006-setup-installs-the-agents-wiki-memory.md)) | `memory.obsidian`: Obsidian on macOS (this user's copy by the same per-user rule as the apps, or the copy an administrator installed in `/Applications`, owned by root, which counts as this user's; `memory.obsidian.shared` for another copy there left as it is), its version (the newer of the bundle's and the newest `obsidian-<x.y.z>.asar` in `~/Library/Application Support/obsidian`, since Obsidian updates itself inside the app) against its latest release: an older one is information with no fix or repair; `memory.obsidian.signature`: `codesign --verify --strict`, team `6JSW4SJWN9`, `xcrun stapler validate` (the repair `replace` only for a damaged copy of this user's own; an administrator's is theirs, `manual`); on other systems an information row naming https://obsidian.md/download. `memory.wiki`: the obsidian-wiki found first on PATH, else where uv puts it (`UV_TOOL_BIN_DIR`, `XDG_BIN_HOME`, `$XDG_DATA_HOME/../bin`, `~/.local/bin`; a relative XDG value is ignored, as uv ignores it; uv itself is looked for in its installer's order), its version against the launcher's pin (2026.11.4): absent is information (its fix names `setup --with wiki`, after `brew install uv` where Homebrew is and this user can write its prefix (`brew --prefix`) and uv is missing, else after a person runs uv's installer, gate `consent`), its leading x.y.z compared with the pin: below it a warning (`2026.10.2.post1` included) whose repair is `tool` when the copy found first is in uv's tool folder and `uv tool list` names obsidian-wiki (pipx and pip `--user` use `~/.local/bin` too), while one uv does not list is brought up "with the tool that installed it (uv does not list it)", gate `consent` (one in uv's folder where uv is missing names how to get uv first); the person's own copy off this PATH (the config's `OBSIDIAN_WIKI_REPO` names an existing `obsidian_wiki/_data` outside uv's tool folder: a venv, pip `--user`, pipx) is a warning naming that package, gate `consent`, fix: put its command folder on PATH; setup never installs over it and offers no `memory` item; one uv holds (`uv tool list` names it, or its `uv-receipt.toml` is there) that does not run is a warning, "installed by uv but does not run", with the person's reinstall from what uv recorded as the fix (its own version specifier, never the pin; each value single-quoted for the shell), gate `consent`, no repair: setup never installs over it or uninstalls it; above it left alone (`2026.12.0rc1` included); the pin's own x.y.z with a suffix the launcher cannot order, or no version, a warning naming the pin with no repair; `memory.wiki.shadow`, a warning when another copy is found on PATH before uv's; `memory.wiki.path`, a warning when it is not on PATH (fix `uv tool update-shell`); `memory.wiki.clash`, a warning (gate `consent`) naming the first five skills of the person's that share a name with one of obsidian-wiki's bundled skills in any of its global skills folders, and how many more (its `entries` field lists every one as `{ path, problem, code? }`, `problem` being `clash` (a skill of the person's), `unreadable` (a skills folder or entry that cannot be read, with its error `code`) or `profiles-unreadable` (the Hermes profiles folder itself cannot be listed): an agent reads the whole list there, never only the five printed), which its setup and its version refresh would delete or replace (fix: move or rename them, then `setup`; while one is there neither the install of obsidian-wiki, the vault step nor the `tool` repair is offered; a skills folder or entry that cannot be read, a looped link or a folder this user may not read, is named on its own, "<folder> could not be read (<code>)", with the fix to repair the link or the permissions, never as a skill to move, and counts as one); `memory.vault.config-form`, a warning (gate `consent`) naming the key and its form while a line of the config is one obsidian-wiki's version refresh would rewrite (it empties a spaced key, wraps a single-quoted value, appends to an `export` line, absorbs a trailing comment, replaces a person's `OBSIDIAN_WIKI_REPO` with the package path; seen with the real 2026.11.4): a config with Windows line endings or any line break Python's `splitlines()` reads besides `\n` (`\r`, `\v`, `\f`, `\x1c` to `\x1e`, `\x85`, U+2028, U+2029), or any other control character but tab and `\n` (`\x1f`, which Python's `strip()` takes for whitespace, included),, or one that starts with a byte order mark, is refused as a whole, in its own words; the refresh keeps a config whose each of `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_WIKI_REPO` and `OBSIDIAN_WIKI_VERSION` present exactly once as `KEY="..."` (no inner quote, nothing after it) or `KEY=value` (no quote, space or `#`), never after `export`, and `OBSIDIAN_WIKI_REPO`, when present, an absolute path (`~/` is this home) inside an `obsidian_wiki/_data` folder (an empty one is accepted: the refresh fills it); until then no `obsidian-wiki list` runs (no upgrade, no install over the config, no `tool` repair), also while obsidian-wiki is not installed, whose `memory.wiki` fix then names that row first; `memory.error`, a warning naming a memory check that failed in a way nobody foresaw (fix: fix what it names, then `doctor`), instead of a crash; `memory.config`, a warning (gate `consent`) while XDG_CONFIG_HOME is a relative path, which obsidian-wiki reads from the folder it runs in, so it would not find its config where the launcher does (fix: set it to an absolute folder, or unset it, then `setup --with wiki`; while it stays relative obsidian-wiki is not installed or upgraded, no vault is made and no SessionStart hook is registered; Obsidian and the apps are set up as usual, and every other memory row that names `setup` asks for that step first). `memory.vault`: information while obsidian-wiki has no config (in the one folder obsidian-wiki reads, as it finds it: `~/.obsidian-wiki` only while `$XDG_CONFIG_HOME/obsidian-wiki`, default `~/.config/obsidian-wiki`, does not exist, as obsidian-wiki's `Path.exists()` sees it: a link to nothing does not); a warning for a config entry that cannot be read (a link to nothing counts as a config: no vault step over it); else `obsidian-wiki doctor --json` read as `ok`, `warn` or `fail` (a `fail` is `manual`) with the names and details of its checks that are not passing, and their hints as the fix (obsidian-wiki's own hints are never relayed: a fix names only `obsidian-wiki list` (for the version setup recorded; its stale refresh keeps every other key; while a clash is there, only after moving or renaming the skills and repairing the folders `memory.wiki.clash` names, each in its own words; withheld below the pin, where the fix is to bring obsidian-wiki up to the pin first, since its upgrade records the version, and for a version the launcher cannot order against its pin, which is left to the person), `obsidian-wiki hooks status --json`, `obsidian-wiki doctor --json`, `uv tool update-shell`, `brew install uv`, the launcher's own `setup --with wiki` or `doctor`, or the pip/pipx note; missing vault files are "never ...; create the missing files by hand (...)", `obsidian-wiki list` and the fixes that send an agent to `obsidian-wiki doctor --json` or `hooks status --json` carry the same "never ..." first (with a note that its session-hooks line and `hooks status` exiting 1 for an unregistered Stop hook are expected), and any other check reads "never `obsidian-wiki setup`, a bare `obsidian-wiki hooks install`, or obsidian-wiki's wiki-setup skill; obsidian-wiki reports <check> <status>: <detail>; read `obsidian-wiki doctor --json` (its session-hooks hint asking for a bare hooks install is expected: the launcher registers only SessionStart)", with the step to read obsidian-wiki's doctor named once, last, when several checks fail). `memory.hooks` (where Claude Code's CLI answers and a config exists): the SessionStart recap registered (`ok`, only while the folder its script reads is the config folder obsidian-wiki's commands read) or not (information; the repair `hook`, fix `setup`, only for the vault the launcher made while the config still names it and no line of the config is one `memory.vault.config-form` names, whose step its fix then names first; any other vault's fix is to add obsidian-wiki's entry by hand, gate `consent`, the person's choice, since obsidian-wiki's own writer drops the file's permission bits and replaces a link); an older `~/.obsidian-wiki` folder beside the XDG one obsidian-wiki's commands read (a link to the same folder is that folder): a warning (gate `consent`, no repair), since the recap script reads `~/.obsidian-wiki` whenever it exists and would recap another vault, and setup never registers it (the person removes or merges that folder); registered but unreachable (a warning); registered but its script is not there (a warning, gate `consent`: remove the entry by hand, then setup registers it again for the vault the launcher made; judged only for an absolute POSIX path without `~` or `$`); where Claude Code reads another settings file than `~/.claude/settings.json` (`CLAUDE_CONFIG_DIR`), information that obsidian-wiki writes only that file, and that its skills are only in `~/.claude/skills` too, never `ok`; `memory.hooks.stop`, information when obsidian-wiki's Stop hook is registered, naming its effect on every session (gate `consent`, fix: remove its entry by hand) | Obsidian's signature, team or ticket does not hold; `obsidian-wiki doctor` reports a failing check |
| services | `sessions.on-demand`: what a session Fabric starts on a board request needs, with Claude Code as the default agent (Fabric Switchboard installed, Fabric's MCP server registered in Claude Code, the skill set, Claude Code's rules for PassionCode's own tools); `info` while Fabric is not installed, on Linux, where doctor checks no app, and when only the tool rules, Claude Code itself or a Fabric entry doctor cannot read are missing (the person's choice; Switchboard's default agent may be another) ([session chain](session-chain.md), PC-124) | another part is missing (a warning; its fix names what repairs each part) |

`setup` returns `{ version, platform, mode, plan, actions, before, after,
humanSteps, planOnly, ok, keyOverride, leftOut }` (`leftOut`, PC-178: the memory ids the run left out, `obsidian`
and `wiki`; their `memory.*` rows other than a failing `.signature` row do not count against `ok`, so `ok` and
`after.summary.fail` reconcile through it), plus `permissions` (PC-117, below) when Claude Code lacks PassionCode's tool rules, `commands` (PC-119, below) when it lacks a command rule or a declared rule was not offered, `keptOut` (PC-133) listing each rule it lacks that is left out because the person took it out with `permissions remove` (`rule`, `removedAt`, `removedBy`), `dryRun: true` on a `--dry-run` (PC-107), and `trainNotSaved` (the train, or
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
app) or `existing`. `plan` items are `install` (an absent app, Obsidian included on macOS; `selected` false
for Fabric without its prerequisites unless `--with fabric`), `memory` (PC-178: obsidian-wiki to install at the pin with
uv and, for a user with no obsidian-wiki config, a vault to make, named in `vault`; `selected` false and `unavailable`
true, never asked, with the reason in `note`, when uv or git is missing, XDG_CONFIG_HOME is a relative path (obsidian-wiki reads it from the folder it runs in), the vault folder already holds files, a skill of the person's shares a name with one of obsidian-wiki's, obsidian-wiki is installed by uv but does not run, a line of its config is one obsidian-wiki's refresh would rewrite (`memory.vault.config-form`), or a memory check could not run ("could not be checked")), `tool` (an
older obsidian-wiki uv lists, brought up to the pin with `uv tool install --force` and then `obsidian-wiki list`),
`hook` (the SessionStart recap of the vault the launcher made, registered again), `update`,
`replace` (an outdated or damaged app nothing runs from: not the app, not an agent's MCP server from its bundle; only this user's processes count, matched on the bundle's whole path, PC-151; a `pgrep` that cannot answer counts as in use) and `kickstart` (a
launchd service that does not answer), each with the check ids that caused it. An `install` or `replace` whose
folder (or, for a replace, the app itself) this user cannot write is `blocked: true`, `selected` false and never asked
about, with the reason in `note`; it is among `humanSteps`, and every run, a plan included, names those apps in
`blocked`, whatever else it changed, never in `notTaken` (with the apps of problems doctor marks blocked that the plan
has no item for: an outdated copy in use, an app the run leaves out, a stale MCP entry; a plan lists each of those under
its items with doctor's fix, and their checks carry `blocked: true`). The closing line says so: "Nothing was changed: X needs a
folder you can write" when nothing ran, "Not installed or replaced: X needs a folder you can write" after "Done:",
"Not asked about: X needs a folder you can write" after a declined run's line, and "Nothing would change: X needs a
folder you can write" for a plan with nothing selected (PC-147); when an app is skipped too (Fabric without its
prerequisites), a plan's headline names the skipped app and a run's names the blocked one, and the plan items and the
steps name both. doctor's fix for such an app, in its app rows, a stale
MCP entry and the `sessions.on-demand` row, names the folder, never a `setup` that cannot install or replace it.
`actions` are what ran, with `outcome` `done` or `failed` and `error`. `before`
and `after` are doctor results; `humanSteps` lists, once each, every remaining
`fail` or `warn` fix (except the `sessions.on-demand` row's: a readiness note that stays in `after.checks`, PC-124; information rows such as `skills.auto-update` stay in `after.checks` too; a check marked `blocked` whose app has a blocked plan item is named by that item's note, PC-147), each product's onboarding for apps installed in this run, and the restart. A plan lists
none: its items carry their notes, and nothing ran. A declined run that named a train carries `planOnly` too, but it is
the person's answer, not a plan (`declined` true, and it exits by its checks): its steps name `setup --train <name>` when its checks call for `setup`.

Questions are asked only on a terminal: one per absent app (on macOS, naming the folder it goes into; one whose folder
this user cannot write is named, never asked, PC-147), one for the agents' wiki memory when it is offered (PC-178), one for the
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

The agents' wiki memory (PC-178, [ADR-0006](../adr/0006-setup-installs-the-agents-wiki-memory.md)) is offered with the
apps and taken by `--yes`. `--with` and `--without` take `obsidian` (the app, macOS only), `wiki` (obsidian-wiki and its
vault) and `memory` for both; `--no-apps`, and a saved release train this launcher cannot use, leave both out, and with
them every memory action, the `tool` and `hook` repairs included; the `memory.*` rows of a part the run leaves out (by
`--without`, by a `--with` that names other ids, by `--no-apps` or an unusable train) stay in the checks but do not make
the run fail (a failing Obsidian signature always fails it; the JSON names the parts in `leftOut`). `doctor --fix` never installs obsidian-wiki or makes a vault, and runs only those two repairs, the `tool`
one before any vault step. A `memory` action runs, in
order and each with no terminal: `uv tool install obsidian-wiki==2026.11.4` when obsidian-wiki is absent (every obsidian-wiki command runs with this home as `HOME`), then, over an existing config, `obsidian-wiki list` with its update check off (its stale refresh records the new version and keeps every other key, as after an upgrade); when this user
has no obsidian-wiki config, makes the vault folder (`--wiki-vault <dir>`, an absolute folder or one under `~/`, else
`~/.wiki`), `git init -b main` in it unless it has `.git`, `obsidian-wiki setup --no-hooks --vault <dir>`, and,
where Claude Code is installed and reads `~/.claude/settings.json`, the SessionStart entry `obsidian-wiki hooks install
--only SessionStart` writes, written by the launcher (obsidian-wiki runs with a throwaway home; the launcher's writer
follows a link, keeps the file's permission bits and makes a new file private; a `hooks` that is not an object, or a
`SessionStart` that is not a list of groups, stops the step with the file unchanged). Neither the install of obsidian-wiki, the vault step nor the
upgrade runs while a skill of the person's shares a name with one of obsidian-wiki's bundled skills in any of its global
skills folders (obsidian-wiki's setup and version refresh delete or replace it): the item is unavailable, its note names
the first five entries and how many more, and `doctor` shows `memory.wiki.clash`. The upgrade carries the extras and `--with` requirements uv recorded
(`uv-receipt.toml`) and, when that record names no Python, the one obsidian-wiki's venv was made with (`pyvenv.cfg`), so the registered SessionStart script path stays valid, stops with the name of anything else that receipt holds (a quoted key (also inside a requirement) or a dotted one, a `[tool]` key other than `requirements`,
`entrypoints` and `python`, a `[tool.options]` key other than `link-mode` and `compile-bytecode`, another table, text
before its first table), and fails, with the fixed text, when the config does not record the pin after `list`; when `list` refuses after the reinstall, the upgrade puts the previous version back with what uv recorded and says so, or names the state it leaves (the pin installed while the config records the old version, so obsidian-wiki's next command asks for its setup) and the command to run. A copy counts as uv's only when `uv tool list` names obsidian-wiki itself (not `obsidian-wiki-mcp`) and uv's record, where it names the command it installed, names this one. A memory row's fix carries the prohibition once, first, and a list of clashing entries names the first five and how many more.
The first step that fails fails the action (exit 1); when the action installed obsidian-wiki and a step fails before
the vault stands (the version check after the install, the version refresh over an existing config, git init, obsidian-wiki setup), it uninstalls it again (`uv tool uninstall obsidian-wiki`) and the error says so, or names the uninstall that failed for the
person to run. A failure writing the SessionStart entry after the vault stands keeps the vault and obsidian-wiki and records the vault; the error names the kept vault and the cause, the same step is among the person's steps, and once the cause is fixed, the next `setup` registers the entry. A launcher state file that cannot be read or written keeps the action going: its detail says the vault
was not recorded, so a missing SessionStart hook will not be offered as a repair. A failed vault step leaves nothing it made: a folder it made is
removed, a folder that was there (empty) is left empty, a config the failed step wrote is removed, so the next run
starts again; a part it cannot remove (a folder it may no longer write) is named in the error with "remove it, then run
setup again". The vault it made is saved as `wiki` in `~/.passioncode/state.json`, and the run's steps name it to open
in Obsidian ("Open the wiki vault <dir> in Obsidian once (Open folder as vault) ..."), or, where Obsidian is not installed,
name Obsidian's download page ("Obsidian is where you read the wiki vault <dir>: download it from ..."). An older copy uv
installed is brought up to the pin before a vault is made. A vault folder that holds files is never used: the
plan names it and `--wiki-vault`. An existing config, vault or hook is never changed (apart from the version and package path obsidian-wiki's refresh records after an upgrade, or an install over an existing config, every other key kept), and obsidian-wiki's Stop hook is
never registered or removed. Without uv the note names `brew install uv` where Homebrew is, else a person's step with
uv's installer; without git (on macOS `xcode-select -p` answers first) it names Apple's command line tools or git's page.
A run that leaves the memory out because uv or git is missing, XDG_CONFIG_HOME is a relative path, the folder holds files, a skill of the person's shares a name with one of obsidian-wiki's, obsidian-wiki is installed by uv but does not run, a config line obsidian-wiki's refresh would rewrite, or a memory check could not run names it
among `humanSteps` ("The wiki memory: ...") and in `skipped` or `notTaken` as "the wiki memory"; a `memory` action
that ran, a `hook` repair and a `tool` upgrade (its `list` refreshes the skills) each add the restart step. `--wiki-vault` without a value is exit 2 with the usage line; a relative one is exit 2
with "passioncode: --wiki-vault takes an absolute folder, or one that starts with ~/ (not <value>)."

Claude Code's rules for PassionCode's own tools (PC-117; fabric-workspace `knowledge/agents-first.md`, "When Claude
Code's auto mode refuses..."): `setup` offers to add `mcp__fabric`, `mcp__fabric-dashboards`, `mcp__switchboard`,
`mcp__plugin_switchboard_switchboard` (Switchboard through its Claude Code plugin) and `mcp__observatory` to `permissions.allow` in `~/.claude/settings.json`, so Claude Code uses those servers' tools without
asking. It is the person's security decision, taken only on its own yes: one question in a terminal (default no), or
`--allow-tools`; `--yes` alone does not take it, a `--dry-run` shows it, and `doctor --fix` never offers it. The rules
are merged: every other key and rule, and their order, is kept; a rule the person lists under `permissions.deny` or
`permissions.ask` is not added; a second run adds nothing. Only `~/.claude/settings.json` is read (a rule granted in a
project's or a managed settings file, or in another spelling such as `mcp__fabric__*`, is offered again), and the rules
are offered only where Claude Code is (the folder of its settings file exists). Without a terminal and without `--yes`,
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

`--train <name>` follows a release train (`trains/<name>.json`), which pins PassionCode.ai apps only (Obsidian follows its
latest release, obsidian-wiki the launcher's own pin, PC-178): `install` and
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

A PassionCode.ai app is installed or replaced only after: `SHA256SUMS.asc` verifies against
`lib/release-key.asc` (pinned fingerprint
`63B30DC324BD697487AA31944FAFB8AEC803B6A7`, `lib/openpgp.js`); the asset's
SHA-256 equals its `SHA256SUMS` line and GitHub's digest; the unpacked app
passes `codesign --verify --strict`, carries team `KJ35UYYL22`, passes
`xcrun stapler validate` and `spctl --assess --type execute` (source
Notarized Developer ID). Obsidian (PC-178, [ADR-0006](../adr/0006-setup-installs-the-agents-wiki-memory.md)) publishes
no signed `SHA256SUMS`: its image's SHA-256 must equal GitHub's digest (a release without one installs nothing), then the
app passes `codesign --verify --strict`, carries team `6JSW4SJWN9`, passes `xcrun stapler validate` and `spctl --assess
--type execute` (source Notarized Developer ID). The download lives under
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
5. Register the MCP server inside each installed app's bundle (`mcp` steps; Project
   Observatory and Fabric Inbox add theirs through their own onboarding): Fabric Dashboards and
   Fabric Switchboard (not for Claude Code when its `switchboard` plugin already brings
   it), for every agent that is present: Claude Code through its CLI,
   `~/.codex/config.toml`, `~/.gemini/settings.json` and `~/.kimi-code/mcp.json`
   directly. An entry already there is kept and reported, each existing file is
   copied into the quarantine first, and a file that is a link is written where it
   points with its permission bits kept; a new one is private (mode 600 on macOS and
   Linux). A link into a folder the launcher cannot write fails that agent's step
   and leaves the link (setup and `doctor --fix`, which run an update, report it
   too): make the folder writable, or declare the server in the file the link points
   to, which the next update finds already there; a registration that failed is never
   taken out by `restore`, and an update whose only change is such a failure saves no
   recovery entry. The other agents are still registered. Fabric's early-preview
   server is registered by `setup`, not by an update.
6. Prune the launcher's own releases (`prune` step): keep the release just
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
`a failure immediately after a quarantine move...`, `update registers the Fabric Dashboards MCP server...` and the PC-120 and PC-126 tests in the launcher tests; the lock
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
An MCP registration whose file the system cannot open now (its permissions, or a
link into a folder that is locked) is kept and left unrestored, the rest of the
batch is still put back and listed, and restore exits 1 naming the file. Make the
file and its folder readable and writable (for a link, the folder it points into)
and run `restore` again: it removes the entry while that batch is still the latest.
Any update that registers or moves something starts a new batch, including
`update --quiet` and the background update a session start runs, and restore reads
only the latest: if a later restore succeeds while the entry is still in the file,
delete it by hand (`uninstall`, which removes PassionCode too, also does). A file
that does not parse, or a folder in the file's place, is reported as kept and no
longer tracked: fix it and remove the entry by hand. `~/.codex/config.toml` is read
as text: the launcher removes its own table while it is unchanged, reports one edited
since (another command or arguments, any key or comment added inside it such as an inline `env`,
or settings added under it) as kept, and takes the entry as gone without a note only
when the server is no longer declared in the file. An entry kept because it was
changed is the person's: it is no longer tracked, and neither a retry nor `uninstall`
touches it. A path that now runs through a
file is taken as already gone. A conflict, a missing source, or a marketplace that cannot be re-added or whose settings cannot be restored, in the same batch stops restore with nothing listed,
although MCP entries it reached first are already removed; after you move the
replacement aside, the retry puts back the rest and names the kept entry. A missing
source stops every retry (recover it by hand, as below); an MCP entry kept because its file could not be opened is then
removed by `uninstall` or by hand (PC-127).

Keep quarantine directories and settings backups until recovery is complete.
Do not delete a corrupted `state.json` to silence the error: it indexes the
quarantine batches. Preserve a copy, repair its JSON object, then retry. Recovery
from physically missing backups is manual; the launcher reports the missing path.

Evidence: `restore()` and `restoreMarketplace()` in the launcher; repeated restore,
conflict and interrupted-move regression tests and the PC-127 restore test in `test/launcher.test.js`.

## Permissions ledger

`permissions` shows what PassionCode allowed Claude Code to do without asking, for a person and for a program (meant for
Fabric's permissions screen, which does not read it yet; PC-125, PC-134). The ledger is one per machine (per
`PASSIONCODE_HOME`), not one per Claude Code folder: with `CLAUDE_CONFIG_DIR` changing between runs, rules setup added to
another folder's settings are listed against the folder read now (PC-129). Setup keeps a ledger, `~/.passioncode/permissions.json` (under `PASSIONCODE_HOME` when it
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
`bypassPermissions` lets Claude Code use every tool and run every command without asking, so it is set only on a
person's yes in a terminal or with `--confirm-bypass`; without either it is refused (exit 2, nothing written), a no in
the terminal leaves the mode and exits 1, and a mode already `bypassPermissions` is not asked about again (PC-133).
A rule taken out with `remove` stays out: `setup`, its `--allow-tools` and `--allow-commands` and a yes to its
questions included, does not add it back, and says so on one line; `permissions allow <rule>` adds it back (PC-133).
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

"Changes nothing" and "nothing was changed" across the CLI (doctor, status, a plan, a dry run, a refused argument) mean
the setup: the counts' own files (`analytics.json`, its notice marker, the shared `installation.json`) and their one
request are written and sent apart from that, unless they are off. `--offline` skips the release lookups, not the counts;
`PASSIONCODE_ANALYTICS=off` stops those for one run.

Every command sends, when it ends, a few anonymous counts to PassionCode's analytics host: which command ran, how it
ended, how long it took in coarse buckets, and once a day that the launcher was used (PC-123). The events, their fixed
properties, the notice and what is never sent are in the [event catalogue](../analytics-events.md). The first command
that would send something, without `--json` or `--quiet`, prints the notice once on stderr (an agent passes it to the
person); a `--json` or `--quiet` run prints nothing and sends nothing until such a run has shown it. `analytics off` turns the counts off for the launcher alone, saved in
`~/.passioncode/analytics.json`; `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` turns them off for one process. A
checkout or a test sends nothing: only the published package carries the App Key. A send never makes a command fail
and never delays it by more than two seconds (about four on the run that shows the notice, which first waits for it to be
written).

## Uninstall and reinstall

Uninstall removes only links targeting this launcher's active release/hub, including
equivalent relative links. It leaves the Claude Code rules setup added (the tool rules of PC-117 and the command rules of PC-119)
and the rules `permissions allow` added and the default mode `permissions mode` set (PC-125) in
`~/.claude/settings.json`, the declarations in `~/.passioncode/rules.d/` and the ledger `~/.passioncode/permissions.json`
(under `PASSIONCODE_HOME` when it is set); the person removes them there, or at any time with `permissions remove` and
`permissions mode default` (which sets the mode to `default`; it does not unset it). It leaves the agents' wiki memory:
obsidian-wiki, its vault and SessionStart hook, and Obsidian ([ADR-0006](../adr/0006-setup-installs-the-agents-wiki-memory.md)); `restore` leaves the memory too. It also leaves `~/.passioncode/analytics.json`, so an `analytics off` survives a reinstall, and `~/.passioncode/run/` (the self-update's run folder and its cache, safe to remove), and the shared `PassionCode/installation.json`, which the PassionCode apps use too; `uninstall` itself is counted like any command. Other user files stay in place. Failed plugin removal
returns exit 1 and keeps the marketplace and active release for a retry. A
marketplace still serving another installed plugin is retained. An MCP registration
whose file the system cannot open now (its permissions, or a link into a locked
folder) does not stop the rest: uninstall finishes and lists what it removed, keeps
that entry recorded in `state.json`, and exits 1 naming the file; once the file and
its folder are readable and writable, another uninstall removes the entry. A file that does not parse, or a folder
in its place, is reported as kept and no longer tracked; remove that entry by hand
(PC-127). `~/.codex/config.toml` is read as text: its own table is removed while it is
unchanged, one edited since (a key or comment added inside it included) is reported as kept, and
the entry is taken as gone without a note only when the server is no longer declared
in the file. An entry kept because it was changed is no longer tracked:
a retry leaves it; delete its declaration by hand if you no longer want it.

After success, `current` is removed, `installed` becomes null and member bookkeeping
is cleared; with nothing installed the session hook installs nothing. The update
switch is the person's: uninstall never writes it, and a later install keeps it as
it was (on unless `config set update.auto off` turned it off; LC-16, PC-131). The
current and previous release directories and the quarantines remain available;
`restore` still works. Repeated uninstall is safe; with more than one Claude Code folder, see the manual commands in [the `CLAUDE_CONFIG_DIR` row](#locations-and-development-overrides). An update the session hook had
already started (its `npx` still downloading, before it takes the update lock) still
finishes and installs the set, which can take several minutes (uninstall refuses while
it runs): once `~/.passioncode/logs/update.log` shows it ended, run `status`; if it shows
a version, run `uninstall` again. `status` still shows the switch
(on by default); with nothing installed it updates nothing. An uninstall by 0.2.75 or
earlier wrote the switch off: `status` then shows `auto-update off`, and
`npx @passioncode-ai/passioncode@latest config set update.auto on` turns it back on.

Evidence: `uninstall()` in the launcher, both `uninstall...` regressions, the PC-127 uninstall test and `PC-131: an update switch turned off stays off through uninstall and a reinstall`.

## Background checks and trust

The SessionStart hook reuses a registry observation for up to 24 hours. Missing,
invalid, future or older check timestamps trigger a detached probe. Before it
spawns, the hook claims `~/.passioncode/probe.pending` with an exclusive create, so
sessions started together run one `npm view`; the probe removes the marker once it
has recorded, and a marker older than five minutes is taken over. A probe is
consumed by a later hook invocation. On Windows with no npm beside the Node that runs the hooks, the probe records
`npm-missing` and one session line names the fix, once after each daily check, so a fix that did not work is named
again the next day; within the day no new check starts while npm is still missing, and the first session that finds
npm beside that Node again starts one at once and says no more that npm is missing (PC-143).

Only a successful npm response with readable maintainers and publisher, with a
release installed, can authorize an automatic update; every identity must be trusted, one of npm's
registry signatures over the version's integrity must verify with a key pinned in `trust.json`, and
the version must carry SLSA build provenance (ADR-0005). The probe and the update ask
`https://registry.npmjs.org` whatever registry npm is set to, for the scope too
(`--registry` and `--@passioncode-ai:registry`), with `--workspaces=false` so npm does not walk up to a
monorepo root, from `~/.passioncode/run/`; the update installs through a new cache folder of its own (`run/cache-*`; without one it does not
start), with npm's debug logs in `logs/npm` (npm's default place, inside the update's cache folder, when that folder cannot be made; the update still runs). A record from an older probe, without
`verify` or with one read for another version, starts a fresh probe at once and installs nothing
meanwhile. While a refusal stands the hook's lines name the installed version instead of `@latest`,
and `status` adds "not installed automatically: <reason>" (`refused` in `--json`). The spawned
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
| `~/.passioncode/run/` | Where the session hook runs its probe and the background update (`cache-*` folders hold each update's own npm cache, removed at every session start once older than an hour, except those the last updates run from (`updateCache`, and the last three in `updateCaches`, in `state.json`; PC-143); uninstall removes the folder unless an update recorded in the last hour may still run from it (LC-12)): a `package.json` with no dependencies, so npm never uses the session project's `node_modules` or `.npmrc` (PC-131) |
| `~/.passioncode/{releases,current,state.json,quarantine,logs}` | Installed copies, active link, state, recovery records, background logs (`probe.log`, `update.log`, and `update-events.log`: the update events as codes, PC-131; each moves aside at 5 MB, five files kept, mode 0600; `logs/npm/` holds npm's own debug logs of the background update, five kept by npm in a 0700 folder) |
| `~/.passioncode/permissions.json`, `~/.passioncode/rules.d/` | The permissions ledger (PC-125) and the rules agents declare (PC-119) |
| `~/.passioncode/analytics.json` | The analytics switch and what was already counted (PC-123) |
| `~/.passioncode/analytics-notice` | An empty marker: the notice was claimed by one command, so two commands started together never both print it; one older than a minute with no record of the notice in `analytics.json` is claimed again (PC-123) |
| `PassionCode/installation.json` in the user's application data folder | The installation id every PassionCode app on the machine shares (PC-123; created once with `analytics: true`, the apps' own field, never rewritten) |
| `PASSIONCODE_ANALYTICS=off`, `DO_NOT_TRACK` | Turn the anonymous counts off for one process (PC-123) |
| `~/.agents/skills` | Shared skill hub |
| Existing paths in `CHANNELS` in `lib/launcher.js` | Supported agent channels; an absent channel is not created |
| `~/.claude/skills` | Shadowing entries may be quarantined after replacement verification |
| `PASSIONCODE_HOME` | Override launcher state/release/quarantine/log root (and the `run/` folder the session hook uses), and with it the `rules.d` folder `setup` reads declared rules from and the permissions ledger; agent directories still use the user's home |
| `PASSIONCODE_PAYLOAD` | Override payload directory for checkout/testing |
| `CLAUDE_CONFIG_DIR` | Claude Code's own variable: when set, the launcher reads and writes Claude Code's settings, plugins, skills and `.claude.json` in that folder instead of `~/.claude` and `~/.claude.json`, as Claude Code does (PC-129). `update`, `setup` and `restore` act on the folder of the run, while the release state in `~/.passioncode` is one per machine: another Claude Code folder gets new plugins when `update` runs with that folder's variable (the session hook's background update acts on the folder of the session that starts it). `uninstall` clears the installation once: the first run removes the set's plugins and marketplace from the folder it runs with, and every MCP entry the launcher registered wherever it was written; in every other folder a later `uninstall` prints "Nothing was installed.", so remove the plugins there by hand with `claude plugin uninstall <member>@passioncode` and `claude plugin marketplace remove passioncode`, run with that folder's variable, before or after. Not seen when it is set only in the `env` of Claude Code's own settings files. `restore` puts a retired marketplace back into the settings file of the folder it runs with, not necessarily the one it was taken from |
| `SWITCHBOARD_CLAUDE_SOURCE_DIR` | Set by Fabric Switchboard 0.7.14 and later beside a `CLAUDE_CONFIG_DIR` that points at its own Claude Code home, in the sessions it launches and in the terminals its hook keeps in a group's folder: the absolute path of the person's folder that home is built from. With both set, the launcher writes settings (permission rules, the mode, marketplace declarations), installs plugins and registers MCP servers there (`.claude.json` inside it, or `~/.claude.json` when it is `~/.claude`), checks the plugin registry there, where the CLI wrote it, and moves shadowing skills in the home, whose links (on macOS and Linux, and on Windows from Switchboard 0.7.17) lead to the same files; Switchboard rebuilds the home's `settings.json` at every launch, so a write there would be lost, and Switchboard's sessions see a change from their next launch (PC-129, SB-259). A home of an earlier Switchboard, which names no source, lies in Switchboard's data folder (`ai.passioncode.fabric-switchboard`): the launcher then writes to `~/.claude` (where 0.2.75 wrote settings too; its plugin and MCP calls went into the home). If your own Claude Code folder is not `~/.claude`, use Switchboard 0.7.14 or later: an earlier one does not tell the launcher where it is. Before Switchboard 0.7.15 on macOS and Linux, and on Windows before Switchboard 0.7.17 (earlier releases make no links in the homes they launch there; SB-266), a home whose own `plugins` folder is a real folder (not a link) does not see plugins installed in the person's folder (SB-260); the organization-r1 train pins Switchboard 0.7.17 (PC-148). Ignored when it is not absolute or `CLAUDE_CONFIG_DIR` is not set. MCP servers registered this way reach sessions outside Switchboard; Switchboard's own sessions get the servers Switchboard carries into its homes |
| `PASSIONCODE_UID` | The uid `setup`, `doctor` and `update` take as theirs, for tests of the root refusal (PC-159) and of another user's copy (PC-160); unset, the process's own |
| `PASSIONCODE_CLAUDE` | Override Claude executable for checkout/testing; a `.js`, `.cjs` or `.mjs` file runs through this Node. Unset on Windows, `claude` is looked up on `PATH` with `PATHEXT`, and Claude Code installed through npm (`claude.cmd`) runs its JavaScript target through this Node (PC-143) |
| `PASSIONCODE_REG` | Replace the `reg` doctor and setup read Windows uninstall entries with, for tests; a `.js`, `.cjs` or `.mjs` file runs through this Node, so the Windows cases run on every system (PC-143) |
| `PASSIONCODE_NPM`, `PASSIONCODE_NPX` | Replace the `npm` the session hook's probe runs and the `npx` its background update runs, for tests; a `.js`, `.cjs` or `.mjs` file runs through this Node. Whatever they name runs in place of npm, so they are trusted local configuration like every override here |
| `PASSIONCODE_APPLICATIONS` | One applications folder for every app setup and doctor use. Unset: each app is in this user's `~/Applications` (made on the first install), or in `/Applications` when the copy there is this user's and its folder and the app itself let them replace it; another user's copy is never replaced, moved or put in the Trash, and `doctor` names it (`app.<id>.shared`; PC-145, PC-146, SCN-017). Read on each run, never remembered: set it wherever `setup`, `doctor` and the agents start. A folder the user cannot write is named in the plan before anything is downloaded (PC-147). Only an absolute value counts: a relative one is read as unset. Another user's copy in that folder (not root's) is never this user's: `doctor` names it (`app.<id>.shared`) and reads the app as not installed, `setup` plans its install as blocked, and nothing replaces it or registers an MCP server from it. The Fabric Agent Adapter (v0.70.0) reads the variable the same way (PC-160). |
| `PASSIONCODE_SHARED_APPLICATIONS` | The shared folder of that rule (default `/Applications`); tests set it so none reaches the machine's own |
| `PASSIONCODE_GITHUB_API` | GitHub API base for release lookups (default `https://api.github.com`) |
| `PASSIONCODE_RELEASE_KEY` | An armoured key file that replaces the bundled release key, for tests; setup names it in its output whenever it is set |
| `PASSIONCODE_PLATFORM` | Treat the system as this platform (tests); the session hook and its update check read it too, to choose how they start npm and npx |
| `PASSIONCODE_SERVICES_DIR` | Fabric service descriptors directory (else `FABRIC_SERVICES_DIR`, else the platform default) |
| `~/.passioncode/{doctor.json,releases-cache.json,downloads/}` | Last check summary, 30-minute release cache, transient downloads |

These overrides are trusted local configuration, not a sandbox. The isolated
test harness supplies a temporary home and fake Claude/npm/npx executables;
normal tests neither install into the operator's home nor contact npm.
