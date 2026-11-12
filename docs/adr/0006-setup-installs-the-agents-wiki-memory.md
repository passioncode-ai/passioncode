# ADR-0006: `setup` installs the agents' wiki memory: Obsidian by its vendor's own chain, obsidian-wiki as a pinned tool

Status: accepted · 2026-11-12 · backlog: PC-178 · brief: [docs/tasks/2026-11-12-pc-178-memory.md](../tasks/2026-11-12-pc-178-memory.md) · amends [ADR-0004](0004-setup-installs-verified-apps-and-registers-their-mcp.md) decision 2

## Context

The operator, 2026-11-12: «давай передадим в анбординг скрипт passioncode организации установку сразу туда вместе с
софтом и обсидиан мемори вот эту чтобы она там работала и обсидиан вместе с ней конечно же». The PassionCode.ai setup
(`npx @passioncode-ai/passioncode@latest setup`) is to install the agents' wiki memory as well: the open-source
`obsidian-wiki` package (github.com/Ar9av/obsidian-wiki, MIT, PyPI `obsidian-wiki`) with a vault of its own, and the
Obsidian app a person reads that vault in, on every machine and for every macOS user (Studio spaces included). Only the
mechanics travel: no vault content of anyone's is shipped or read.

Two facts shape it. Obsidian's releases (`obsidianmd/obsidian-releases`, tag `v<x.y.z>`, the universal macOS image
`Obsidian-<x.y.z>.dmg`) carry no PGP-signed `SHA256SUMS`, so ADR-0004's chain cannot apply; each asset has GitHub's
`digest`, and the app is signed by Dynalist Inc.'s Developer ID, team `6JSW4SJWN9` (read on the operator's Mac with
`codesign -dv /Applications/Obsidian.app`, 2026-11-12; v1.15.0's image digest is
`sha256:d3f837e6fd3efaf65fa0bec987b18296982995d4ddae3171a7f7f67e0e2b7aa8`). And `obsidian-wiki setup` from 2026.11
registers two Claude Code hooks unless told `--no-hooks`; one of them (Stop) wakes every editing session in every
project, after every turn, to write into the vault. On the operator's machine that hook was rolled back the same day.

## Decision

1. **Obsidian is an app, verified by a chain of its own.** It is installed and replaced like the PassionCode.ai apps
   (`lib/catalog.js` `OBSIDIAN`, placement by `appPath`, PC-145 to PC-147: this user's `~/Applications`, never another
   user's copy, never while it runs), but `releases.installApp` checks it differently: the downloaded asset's SHA-256
   must equal GitHub's release asset `digest` (a release without one installs nothing), then the mounted app must pass
   `codesign --verify --strict`, name team `6JSW4SJWN9` (PassionCode.ai's own team does not pass for it), pass
   `xcrun stapler validate`, and pass `spctl --assess --type execute` with `source=Notarized Developer ID`. A failure
   installs nothing. Trust rests on Apple's notarization and the pinned team; GitHub's digest protects the transfer
   only, since whoever can publish the release sets it. A release train pins PassionCode.ai apps only, so Obsidian
   follows its latest release. Obsidian updates itself inside the app (a newer `obsidian-<x.y.z>.asar` in
   `~/Library/Application Support/obsidian`) and keeps its bundle's version as the installer's, so its version is the
   newer of the two, and an older one is information only: the launcher never replaces a person's working Obsidian for
   a version. It reinstalls only a copy of this user's own whose signature or team fails, and a failing signature fails
   the run even when the run leaves Obsidian out. A copy an administrator
   installed in `/Applications` (owned by root) is this user's Obsidian too: no second copy is installed. Other
   systems: `doctor` names https://obsidian.md/download, and setup installs no Obsidian.
2. **obsidian-wiki is a tool pinned by the launcher release**, like the skills (`family.json`), not by a train:
   `catalog.WIKI.pin`, `2026.11.4` at this decision. It is installed with `uv tool install obsidian-wiki==<pin>`, and an
   older one is brought up with `uv tool install --force obsidian-wiki==<pin>` only when the copy found first on PATH is
   in uv's tool folder AND `uv tool list` names obsidian-wiki (round 5: pipx and pip `--user` put theirs in
   `~/.local/bin` too; a copy uv does not list is the person's to bring up, gate `consent`; a copy pip or pipx put first
   on PATH is named, `memory.wiki.shadow`, never replaced under it). Right after that upgrade setup runs
   `obsidian-wiki list` with its update check off (`OBSIDIAN_WIKI_NO_UPDATE_CHECK=1`): any ordinary command runs obsidian-wiki's stale refresh, which records the new version in the
   config and refreshes the skills it linked, keeping every other key (2026.11.4 `_check_stale`), so the setup-version
   warning never follows the launcher's own upgrade; a `list` whose stale check could not refresh and asks for
   `obsidian-wiki setup` fails the step with the fixed text below, never a "done". Versions compare by their leading x.y.z: above the pin is left
   alone, below it is upgraded, and the pin's own x.y.z with a suffix the launcher cannot order (or no version) is a
   warning with no repair, so a newer build is never taken back. Without uv, setup names a step: with
   Homebrew whose `bin` this user can write (`$(brew --prefix)/bin`), `brew install uv` (an agent runs it; the launcher does not); without, a person runs the installer uv's page
   names (https://docs.astral.sh/uv/getting-started/installation/), never piped into a shell by an agent. Without git
   (on macOS `xcode-select -p` is asked first, so no install dialog opens), the vault is not offered either.
3. **A vault only for a user who has none.** When obsidian-wiki has no config in the one folder it reads (found as it
   finds it: `~/.obsidian-wiki` only while `$XDG_CONFIG_HOME/obsidian-wiki`, default `~/.config/obsidian-wiki`, does not
   exist as `Path.exists()` sees it, so a folder that is a link to nothing does not; the config file itself that is a link
   to nothing still counts as a config),
   setup makes the vault: `~/Documents/Wiki`, or the folder `--wiki-vault` names (absolute); `git init -b main` in it
   when it has no `.git`; `obsidian-wiki setup --no-hooks --vault <dir>` with no terminal (its own questions are skipped);
   then, where Claude Code is installed (its CLI answers, as `doctor` finds it) and reads `~/.claude/settings.json`,
   the SessionStart recap (the entry `obsidian-wiki hooks install --only SessionStart` writes, written by the launcher
   since round 6, decision 9): the read-only recap of the vault at session start. obsidian-wiki
   writes its hooks only to that literal file; where `CLAUDE_CONFIG_DIR` names another folder no hook is registered and
   `doctor` says so as information. Where that file is a link (round 5), obsidian-wiki's writer (a temporary file and
   `os.replace`) would turn it into a plain file: obsidian-wiki then writes its entry into a throwaway home and the
   launcher adds exactly that entry where the link points, with its own writer (`lib/permissions.js` `write`), keeping
   the link and the file's permission bits. A vault step that fails removes what the launcher made (a folder it made,
   the `.git` it made, what the failed step added to obsidian-wiki's config folder: the config and `WRITING.md`, or the
   folder when the step made it; a folder that was there, empty, stays as it was), so the next run starts
   again (a part it cannot remove is named, with what to do). A failure writing the SessionStart entry after the vault stands keeps the vault and obsidian-wiki and records the vault; the error names the kept vault and the cause, the same step is among the person's steps, and once the cause is fixed, the next `setup` registers the entry. The vault the launcher made is remembered in
   `~/.passioncode/state.json` (`wiki`), and only for it, while the config still names it, does setup register a missing
   SessionStart hook again; any other vault's missing hook is the person's choice (`gate: consent`). A folder that already holds files is never made a vault: the plan names
   it and asks for `--wiki-vault`. An existing config or vault is left exactly as it is (apart from the version keys obsidian-wiki's own refresh records
   after an upgrade, or an install over an existing config, every other key kept): the launcher never runs
   `obsidian-wiki setup` over a config, which rewrites the config.
4. **The Stop hook is never the launcher's.** Setup never registers it and never removes one someone registered;
   `doctor` names it as information (`memory.hooks.stop`), with its machine-wide effect and the person's choice
   (`gate: consent`) to remove its entry by hand (decision 9). Hints `doctor` passes on from
   `obsidian-wiki doctor` are never relayed (round 4, 2026-11-12): a memory row's fix names only `obsidian-wiki list`
   (the stale refresh, for the version setup recorded; round 9: withheld below the pin, where the fix is to bring
   obsidian-wiki up to the pin first, since its upgrade records the version, and for a version the launcher cannot order
   against its pin, which is left to the person), `obsidian-wiki hooks status --json`, `obsidian-wiki doctor
   --json`, `uv tool update-shell`, `brew install uv`, the launcher's own `setup --with wiki` and `doctor`, and the
   pip/pipx note (round 6: no hooks writer, decision 9);
   every other check gets a fixed text that names what obsidian-wiki reports and the safe route, and says never
   `obsidian-wiki setup`, a bare `hooks install`, or its wiki-setup skill. Round 5: every fix that names an obsidian-wiki
   command carries that "never" (round 6: with no exception; the refresh step, the missing vault files, and the fixes that send an agent to `obsidian-wiki doctor --json` or
   `hooks status --json`, which say that its session-hooks line and `hooks status` exiting 1 for an unregistered Stop
   hook are expected); where the settings file is a link, the hook fixes are by hand. A test iterates every hint obsidian-wiki
   2026.11.4's doctor and hooks can give (`test/fixtures/obsidian-wiki-2026.11.4-hints.json`).
5. **`doctor` reads the memory** (area `memory`): Obsidian (installed, version against its latest, signature and team,
   a copy in `/Applications` left as it is), obsidian-wiki (found by name on PATH or where uv puts it, version against
   the pin, a warning when it is not on PATH), the config and vault (`obsidian-wiki doctor --json`: its `fail` is a
   failure, its `warn` a warning, with the names of the checks that fail), and the hooks (SessionStart registered or
   not, Stop as above). Each fix carries `gate` per PC-171: null wherever an agent can do it. A failure no setup run
   repairs (obsidian-wiki's own `fail`, an administrator's damaged Obsidian) stays a failure and is listed in
   `doctor.json` `manual`, so the session-start line sends the person to `doctor`, not to `setup`.
6. **Selection.** The memory is offered by default with the apps (`--yes` takes it); `--with` and `--without` take
   `obsidian`, `wiki`, and `memory` for both; `--no-apps` leaves the memory out too, and so does a saved release train
   this launcher cannot use (setup installs nothing new until the train is usable): under them setup runs no memory
   action at all, the upgrade and the hook included, and the memory rows of a part the run leaves out do not fail it.
   `doctor --fix` never makes a vault or installs obsidian-wiki; it
   brings an older one up to the pin and registers a missing hook of the vault the launcher made.
7. **An agent folder that holds only skill folders is not that agent.** `obsidian-wiki setup` makes `skills` folders for
   every agent it knows (`~/.codex/skills`, `~/.gemini/skills`, and more), so the launcher no longer counts a folder that
   holds nothing but `skills` (and Gemini's `antigravity`) as Codex, Gemini or Kimi being installed, and registers no MCP
   server there (`lib/launcher.js` `agentFolder`). An empty folder still counts, as before.
8. **A skill of the person's is never replaced by obsidian-wiki's (round 6, 2026-11-12, seen in the field: a real
   `obsidian-wiki setup` deleted the operator's `skill-creator` in `~/.agents/skills`).** obsidian-wiki's setup and its
   version refresh (which any ordinary command, `list` included, runs after an upgrade) link its bundled skills (40 in
   2026.11.4, `skill-creator` among them) into every agent's global skills folder (`cli.py` `install_skills`,
   `GLOBAL_AGENT_DIRS`, and the Hermes profiles): a link or file of the same name is unlinked and a real folder holding
   `SKILL.md` is removed with everything in it. Before the vault step and before the upgrade's `list`, the launcher reads
   the bundled names from the package the found `obsidian-wiki` belongs to (through the hook scripts `hooks status
   --json` names; the pinned list `catalog.WIKI.skills` before it is installed) and looks in each of those folders: an
   entry of a bundled name that is not obsidian-wiki's own (a link into its package) is a clash, a real folder holding
   `SKILL.md` included even when that `SKILL.md` is the package's (the operator's own `skill-creator` was one: the same
   `SKILL.md`, another `LICENSE.txt`). With any clash the step does not run: the `memory` plan item is unavailable, or the `tool`
   repair is not offered, with a note naming each entry, gate `consent`, and the fix to move or rename them, then run
   setup again; `doctor` shows `memory.wiki.clash` (a warning). The launcher never moves, quarantines or deletes them.
   Round 8: the same holds for installing obsidian-wiki over an existing config (its first ordinary command runs the
   version refresh), checked in the plan and right before `uv tool install`; an install over a config is then followed
   by the upgrade's refresh, checked again right before `obsidian-wiki list`.
9. **obsidian-wiki never writes Claude Code's settings file (round 6).** Its writer (`Path.write_text` and `os.replace`)
   makes `~/.claude/settings.json` `0644` and replaces a link with a plain file. `hook` always runs `obsidian-wiki hooks
   install --only SessionStart` with a throwaway home and adds exactly the entry it wrote with the launcher's own writer
   (`lib/permissions.js` `write`: through a link, keeping the file's permission bits, a new file private), after checking
   that `hooks` is an object and `SessionStart` a list of groups (else nothing runs and the file stays as it is). No
   `doctor` fix names `hooks install` or `hooks uninstall`: a Stop entry, or a SessionStart entry for a vault the launcher
   did not make, is a hand edit.
10. **The upgrade keeps what uv recorded (round 6).** `uv tool install --force` would drop a person's extras and `--with`
    requirements; the launcher reads `uv-receipt.toml` in uv's tool folder (`uv tool dir`) and carries the extras and
    requirements given by name, specifier and marker into the reinstall; one given as a URL, a path, a Git source or
    editable stops the upgrade with its name. After `list`, the version the config records decides: anything but the pin
    fails the step with the fixed text, while obsidian-wiki's missing-skills line does not. Round 9: refusing over
    parsing. Anything else the receipt holds stops the upgrade, named: a `[tool]` key other than `requirements`,
    `entrypoints` and `python`, a `[tool.options]` key other than `link-mode` and `compile-bytecode`, another table, or
    text before its first table.
11. **obsidian-wiki's own update notice stays the person's (round 9).** The launcher pins obsidian-wiki to its release
    and runs every command of it with the update check off (`OBSIDIAN_WIKI_NO_UPDATE_CHECK=1`); it does not suppress the
    notice obsidian-wiki prints to a person in a terminal. A by-hand `uv tool upgrade obsidian-wiki` is the person's, and
    it can refresh skills with newer names than the pin bundles; the launcher never undoes it (a newer obsidian-wiki is
    left alone), and `doctor` names any clash that results as `memory.wiki.clash`.
12. **A failed step uninstalls what the same run installed (round 9).** When `setup` installed obsidian-wiki and a later
    step of the same action fails (the refresh over an existing config, or the vault step before the vault stands), the
    launcher runs `uv tool uninstall obsidian-wiki` and says so, or names the uninstall that failed for the person to
    run: a tool left with no config, or with an old recorded version, answers every agent's next command with "Run:
    obsidian-wiki setup". A relative XDG_CONFIG_HOME, which obsidian-wiki reads from the folder it runs in, leaves obsidian-wiki
    out: it is not installed or upgraded, no vault is made and no SessionStart hook is registered (the `tool` and `hook`
    repairs included); Obsidian and the apps are set up as usual, and `doctor` shows it as `memory.config`.
13. **What cannot be read is refused, never a crash (round 11).** A skills folder or entry `lstat` cannot read (a looped
    link, ELOOP; a folder this user may not read, EACCES) counts as a clash, named on its own (round 12: "<folder> could not be read (<code>)", with the fix to repair the
    link or the permissions, never as a skill of the person's to move): the
    install, the vault step and the upgrade do not run over it, since obsidian-wiki's setup would meet it too. An
    obsidian-wiki uv holds that does not run is the person's to reinstall with what uv recorded: setup never runs a plain
    `uv tool install` over it (it would drop the extras or take back a newer version) and never uninstalls it. A memory
    check that throws anyway is one `memory.error` warning in `doctor` and a memory item left out of `setup` with that
    note. Round 12: that reinstall keeps the person's own version specifier (never the pin) and single-quotes each value;
    a config that writes `OBSIDIAN_VAULT_PATH`, `OBSIDIAN_WIKI_REPO` or `OBSIDIAN_WIKI_VERSION` with spaces around `=`
    stops every `obsidian-wiki list` (seen with the real 2026.11.4: its refresh empties such a key), named in
    `memory.vault.spaced`; the upgrade passes the venv's own Python (`pyvenv.cfg`) when uv's record names none; a quoted
    key in uv's record is refused; a hook entry counts only with `type: "command"`, as obsidian-wiki's `is_registered`
    reads it.

## Consequences

- One `setup` gives a new machine a working wiki memory, where uv and git are there, XDG_CONFIG_HOME is not a relative
  path and no skill of the person's shares a name with one of obsidian-wiki's: the tool, its skills in each agent's own folder (written by
  obsidian-wiki's setup, its own channel, never by the launcher), a vault that is a Git repository, the session-start
  recap in Claude Code, and Obsidian to read it.
- The launcher now has three trust roots. PassionCode.ai apps: the release key's signed `SHA256SUMS`, team
  `KJ35UYYL22` and notarization (ADR-0004). Obsidian: Dynalist Inc.'s Developer ID team `6JSW4SJWN9` and Apple's
  notarization, with GitHub's asset digest guarding only the transfer. obsidian-wiki: PyPI through uv, pinned by
  version, not by hash (uv may fetch a Python to run it). A new pin is a launcher release.
- obsidian-wiki's setup creates skills folders for agents that are not installed (`~/.codex/skills`, `~/.gemini/skills`,
  `~/.hermes/skills` and more). The launcher links the set's member skills into every such channel folder it finds
  (`lib/launcher.js` `CHANNELS`), so after the memory is set up the member skills are linked there too. This is kept on
  purpose: changing which folders count as channels would stop link updates on machines that rely on them. Only the MCP
  registration and `doctor`'s agent list ignore a folder that holds nothing but skills (decision 7). Asserted in
  `test/launcher.test.js` `PC-178: an agent folder` (round 7).
- `setup` runs `uv`, `git` (after `xcode-select -p` on macOS) and `obsidian-wiki` (each with no terminal, each capped in
  time); `doctor` runs `obsidian-wiki --version`, `doctor --json` and `hooks status --json`, which read only.
- `uninstall` and `restore` leave the memory alone: the tool, the vault and its hook are the person's once made.
- obsidian-wiki's own `wiki-setup` skill stays installed with its other skills (it is the tool's feature). It is a known
  path to `obsidian-wiki setup` over an existing config and to its Stop hook, guarded by the setting-up-passioncode skill
  (never `obsidian-wiki setup`, a bare `hooks install`, or that skill) and by every `doctor` fix that names an
  obsidian-wiki command; the upstream issue is PC-192.
