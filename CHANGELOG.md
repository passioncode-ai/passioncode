# Changelog

## Unreleased

### Added

- **`setup` installs the agents' wiki memory** (PC-178, the operator's request of 2026-11-12, ADR-0006): the
  open-source obsidian-wiki (github.com/Ar9av/obsidian-wiki, MIT) at the version this launcher pins, 2026.11.4, with
  `uv tool install`, and, on a Mac, Obsidian, where a person reads the memory. Obsidian publishes no signed checksums, so
  its image must match GitHub's digest and the app must carry Obsidian's own Developer ID team `6JSW4SJWN9`, a stapled
  ticket and Gatekeeper's yes; it goes into `~/Applications` like the other apps. A user with no obsidian-wiki config
  gets a new vault in `~/.wiki` (or the folder `--wiki-vault` names, never one that holds files), made a Git
  repository, set up with `obsidian-wiki setup --no-hooks` and given only the SessionStart recap for Claude Code. An
  existing config, vault or hook is left exactly as it is (apart from the version and package path obsidian-wiki's refresh records
  after an upgrade, or an install over an existing config, and, with the same meaning, quotes around a bare value or an empty vault line where there was none (ADR-0006 decision 16), every other key kept beside the version and package path), and obsidian-wiki's Stop hook (it asks every session in every
  project to write into the vault after every turn) is never registered. The SessionStart hook goes only where Claude
  Code is installed and reads `~/.claude/settings.json` (obsidian-wiki's hooks writer targets only `~/.claude/settings.json`). A vault step that fails
  leaves nothing it made, so the next run starts again; when the same run installed obsidian-wiki, a step that fails
  before the vault stands (the version check after the install, the version refresh over an existing config, git
  init, obsidian-wiki setup) uninstalls it again (`uv tool uninstall obsidian-wiki`) and
  says so, or names the uninstall that failed. A skills folder or entry that cannot be read (a looped link, a folder
  you may not read) blocks the memory and is named on its own, with the fix to repair the link or the permissions; a
  memory check that fails in a way nobody foresaw is one `memory.error` warning in `doctor`, never a crash; an
  obsidian-wiki uv holds that does not run is never installed over or uninstalled, and `doctor` names your reinstall
  from what uv recorded (the version specifier uv recorded, none meaning PyPI's latest, never the pin; each value quoted
  for the shell). A config line obsidian-wiki's version refresh would rewrite (a spaced, single-quoted, exported,
  commented or repeated managed key, or an `OBSIDIAN_WIKI_REPO` outside its package) stops every `obsidian-wiki list` and
  is named; the upgrade keeps the Python obsidian-wiki's venv was made with, and puts the previous version back when the
  refresh refuses after the reinstall. Beside an older `~/.obsidian-wiki`, which obsidian-wiki's recap script reads
  first, setup makes the vault but registers no SessionStart recap, and setup names why (`doctor` shows it in `memory.hooks` or `memory.legacy`). A config with Windows line
  endings, another line break obsidian-wiki reads differently, or a byte order mark is refused the same way. Your own
  obsidian-wiki off the PATH (its package named in the config, outside uv's folder) is never installed over: `doctor`
  names it and the step to put its command folder on PATH. A new vault now goes in the hidden `~/.wiki`, never
  `~/Documents` (which iCloud may sync), and a `--wiki-vault` inside `~/Documents` is refused too; the step to open it names Cmd+Shift+G in Obsidian's folder picker and the
  path. A config with any control character but tab and newline is refused like the line breaks above, and a relative
  `OBSIDIAN_WIKI_REPO` naming obsidian-wiki's package folder is a config form whose step is to remove the line or write it as an absolute path to that folder (one naming no package folder: remove the line); a config not saved
  as UTF-8 is its own form, a vault line with a double quote, a line break or a control character in its value asks to move the vault and write the line once,
  a relative vault line is a config form (obsidian-wiki's recap would read it against each session's folder), every other form of an `OBSIDIAN_WIKI_REPO` line asks only to remove it,
  and a vault path with a double quote, a line break or a control character other than tab (exactly: any C0 control but tab, `\x85`, U+2028 or U+2029) is refused with one step (choose another folder with `--wiki-vault`). Every step that names a vault
  names its path and, on a Mac, Cmd+Shift+G; with no obsidian-wiki config Obsidian's guide says the vault comes with the wiki memory's setup step, and a config that names no vault the launcher can use (a config form, an empty vault line, a config that cannot be read, a link to nothing or a folder, or one an older `~/.obsidian-wiki` shadows) gets a step that prints why and the person's step itself (the same text a `doctor` row carries, obsidian-wiki installed or not), never a path read from it and never a setup step. With obsidian-wiki installed, a config that is a link to nothing, a folder, a file that cannot be read or names no vault stays a `doctor` failure (`manual`), and a registered SessionStart hook then reads as recapping nothing; an `XDG_CONFIG_HOME` that starts with `~` is named like a relative one (the recap reads it as written); an older `~/.obsidian-wiki` asks to copy into the XDG folder the files of the older one it lacks (never the old config over the XDG config), then remove it; the XDG config obsidian-wiki's commands read stays. A config obsidian-wiki cannot read stops the upgrade and the install over it, as its own `list` crashes on it; `memory.hooks` reads `ok` only when the recap, as its script reads the config, and obsidian-wiki's commands, as `cli.py` reads it, read the same existing vault (a leading `~` as the home in both, as every obsidian-wiki command reads it), and never while `XDG_CONFIG_HOME` is relative or starts with `~`. A step that depends on another names it in words that hold in any order ("first fix XDG_CONFIG_HOME as its own step says"), never by its position or its row id. A declined wiki memory (`--without memory`, or "no" to its question) is declined for that run only: the next `setup --yes` installs it again (a terminal run asks again), so an agent passes `--without memory` for a person who declined it (PC-205 would remember the choice). `doctor` names an older `~/.obsidian-wiki` whatever Claude Code's state (`memory.legacy` where `memory.hooks` does not), and with obsidian-wiki not installed a config that names no usable vault is a `memory.vault` row; a vault value with an apostrophe at either end is a config form, a `--wiki-vault` path that starts or ends with one is refused, a relative vault line names the folder `obsidian-wiki setup` ran in, and `~\` is the home on Windows. A failure writing the SessionStart entry after the vault stands keeps the vault and obsidian-wiki and records the vault; the error names the kept vault and the cause, the same step is among the person's steps, and once the cause is fixed, the next `setup` registers the entry.
  With XDG_CONFIG_HOME set to a relative path (obsidian-wiki reads it from the folder it runs in) obsidian-wiki is not installed or upgraded, no vault is made and no SessionStart hook is registered; Obsidian and the apps are set up as usual; `doctor` shows it as
  `memory.config`, and every other memory row that names `setup` asks for that step first. Without uv the steps name `brew install uv` where Homebrew is and this user can write its bin folder,
  else uv's installer as the person's step; without git, Apple's command line tools (asked with `xcode-select -p` first,
  so no dialog opens). An older obsidian-wiki uv lists is brought up to the pin with `uv tool install --force`, then
  `obsidian-wiki list` (also right after installing obsidian-wiki over an existing config) records the new version and package path (and, with the same meaning, quotes around a bare value or an empty vault line where there was none) and keeps every other key of the config (`doctor --fix` too); a copy
  another tool put first on PATH is named, never replaced. Obsidian updates itself inside the app, so an older version is
  information and a working Obsidian is never replaced; a copy in `/Applications` that root owns (a package or MDM
  install) counts as yours, while one another user dragged in stays theirs and you get your own.
  The run ends by naming the new vault to open in Obsidian (or Obsidian's download page where it is not installed).
  A missing SessionStart hook is registered again only for the vault setup made, while the config still names it; a
  memory part the run leaves out (`--without`, `--no-apps`) does not fail it (a damaged Obsidian signature always does;
  the JSON names the parts in `leftOut`). obsidian-wiki's own hints are never relayed: a fix names only a short list of
  safe commands, or says what obsidian-wiki reports and the safe route. A newer obsidian-wiki, suffixed or not, is never
  taken back to the pin. A `~/.claude/settings.json` that is a link stays a link (the entry goes where it points), a
  copy of obsidian-wiki that uv does not list is never replaced by uv, and an XDG config folder that is a link to nothing
  does not hide an older `~/.obsidian-wiki` config. obsidian-wiki's setup and its version refresh replace a skill of
  the same name as one of theirs in every agent's global skills folder (it deleted a `skill-creator` on a real Mac), so
  neither runs while a skill of yours shares a name, nor does installing obsidian-wiki over an existing config: setup
  names the first five and how many more for you to move or rename, and `doctor` shows it (its JSON lists every one). obsidian-wiki never writes Claude Code's settings file (its writer made it world-readable): the launcher adds the
  SessionStart entry, keeping the file private. The upgrade keeps the extras, requirements and Python uv recorded, and stops, naming it, on anything else uv
  recorded (a requirement given as a URL, path, Git source or editable; an unknown key or table), for the person to bring
  it up with uv. A registered SessionStart entry whose script is gone is a `doctor` warning (gate `consent`): remove the
  entry by hand, then `setup` registers it again for the vault the launcher made.
  `uninstall` says which parts of the memory stay, where any of it is installed. `--with` and `--without` take `obsidian`, `wiki` and
  `memory`; `--no-apps` leaves the memory out, its upgrade included. obsidian-wiki's setup creates skills folders for
  agents that are not installed (`~/.codex/skills`, `~/.gemini/skills` and more), and the set's member skills are then
  linked into those folders as into any agent's.
- **`doctor` has a `memory` section** (PC-178): Obsidian's version, signature and team; obsidian-wiki against the pin
  and whether it is on PATH; the vault, read with `obsidian-wiki doctor --json`; the SessionStart hook; and, as
  information, a Stop hook someone registered, with its effect and how to remove it. A memory failure no setup run
  repairs (a failing vault) is listed in `doctor.json` as `manual`, and the session-start line names `doctor` for it.
- An agent folder that holds only skill folders (obsidian-wiki's setup makes `~/.codex/skills`, `~/.gemini/skills` and
  more) no longer counts as that agent, so no MCP server is registered for an agent that is not installed (PC-178).

This ships in the release after 0.2.76, whose publication is held (PC-123).

### Changed

- **Observatory Log 0.35.12** (PC-176, project-observatory's board request `7809e7a1`, 2026-11-11): the set pins
  Observatory's tag `v0.35.12` instead of `v0.26.0`. Its three skills' descriptions take 1,046 characters (from
  2,243), within Claude Code's skill-listing budget, and every Observatory Log change since 0.26.0 comes with it.
- **Shorter skill descriptions** (PC-173, sshlg-skills' board request `3b81fa6f`, 2026-11-11): Claude Code lists every
  installed skill within a 30,000-character budget and drops the descriptions of the least used ones beyond it (measured
  on the operator's machine: 105 skills, 35,962 characters). `setting-up-passioncode` now takes 333 characters and
  `working-in-passioncode` 348 (from 827 and 945): when to use, two English and two Russian triggers, and the NOT-for
  boundary with its neighbour. The full English trigger list moved to a "When this skill applies" section in each body.
  `test/skill.test.js` holds each description to 350 characters and the two together to 700.
- **"PassionCode.ai app" in the README and SECURITY.md** (PC-174, org-index's board request `7f42f2d5`, 2026-11-11):
  the retired framing "PassionCode app" (org-index naming rule N1) is gone from the living documents. The launcher's
  own `analytics` output keeps its wording until PC-175.

## 0.2.76 - 2026-11-09

### Added

- **`doctor --json` says which fixes need a person** (PC-171, asked by Fabric Dashboards on the board, request
  `452c6b7d`): every check carries `gate`, the first of a person's own acts its `fix` needs (`sign-in`, `code`,
  `consent`, `payment` or `secret`), or null when an agent can carry the fix out. Dashboards shows such a step as
  "needs you". The text output is unchanged.
- **Anonymous usage and error counts, on by default** (PC-123): when a command ends, the launcher sends a few anonymous
  counts to PassionCode's analytics host (which command, how it ended, a coarse duration, once a day that it was used),
  with fixed words, the previous version after an update and the installation id every PassionCode app on the machine
  shares; never a path, a name, a
  rule, an argument, a token or a message. The first command run without `--json` or `--quiet` says so once on stderr, and nothing is sent before
  that (the setup skill has an agent show it to the person);
  `analytics off` turns the counts off for the launcher alone, `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` for one
  process; a "no" already given in a PassionCode app (the shared `installation.json`) is kept as the launcher's off.
  `analytics on` and `analytics status` turn them back on and say whether they are sent and why not; the background
  update the SessionStart hook starts sends nothing. Only the published package carries the App Key. The events are
  listed in `docs/analytics-events.md`.
- **`doctor` checks what sessions Fabric starts need** (PC-124): a `sessions.on-demand` row names what a session Fabric
  starts on a board request still lacks with Claude Code as the default agent (Fabric Switchboard, Fabric's MCP server
  in Claude Code, the skill set, the tool rules), and is information only on Linux, while Fabric is not installed or when only the tool rules, Claude Code itself or a Fabric entry doctor cannot
  read are missing; it is never one of setup's steps for the person. As a warning it adds one to doctor's and setup's
  warning count on a Mac or Windows machine with Fabric that lacks a part. The page
  `docs/reference/session-chain.md` says which part of that chain is the launcher's.
- **`doctor` says when automatic updates are off** (PC-131): a `skills.auto-update` information row, shown whenever
  `update.auto` is off, names `config set update.auto on` as the person's choice; it is never a failure, a repair or one
  of setup's steps, and doctor never turns the switch on.

- **The self-update checks npm's signature and the build provenance** (PC-131, ADR-0005): besides the trusted
  publishers, the session hook now requires one of npm's registry signatures over the integrity its check recorded to
  verify with npm's key, pinned in the plugin's `trust.json`, and an SLSA provenance attestation (its builder is not
  checked). The probe and the update ask `registry.npmjs.org` whatever registry npm is set to, and run in
  `~/.passioncode/run/`, never in the session's project, whose `node_modules` npm would otherwise run unchecked, and each
  update installs through a new npm cache of its own. A tampered, unsigned,
  foreign-signed or provenance-less version is named in one line that says which version to keep using, and it is
  neither installed nor offered as a manual command; while a refusal stands the hook's lines name the installed
  version, not `@latest`, and `status` shows the refusal. The release build refuses a `trust.json` whose keys the hook
  would not load, the release workflow publishes only with provenance, and its registry receipt runs the same checks
  on the published version. The signature is npm's, not the organization's that LC-16 asks for (PC-142).
- **An update log, and the update logs capped** (PC-131, LC-12, LC-16): `~/.passioncode/logs/update-events.log`
  records `update_check` (`ready` or `current` once per answer, `check_failed`, `signature_failed` with its reason
  once per version), `update_download`, `update_install` and `auto_update`, codes only; it, `probe.log` and
  `update.log` move aside at 5 MB, five files kept, mode 0600 on macOS and Linux. npm's own debug logs of the
  background update go to `~/.passioncode/logs/npm` (0700, npm keeps five), and each update's
  `~/.passioncode/run/cache-*` folder is removed at a session start once it is an hour old and no longer the one
  the last update recorded.

### Changed

- **New installs go into your own `~/Applications`, on every Mac** (PC-145): see the entry under Fixed; a copy already in
  `/Applications` that is yours stays there, so one Mac may hold apps in both folders.

- **The `organization-r1` train pins the current releases** (PC-148): Fabric 0.3.16, whose hub takes a port per macOS
  user (a second user on the same Mac no longer meets the first one's hub on 47070), Fabric Switchboard 0.7.17,
  Fabric Dashboards 0.8.25, Project Observatory 0.33.1 and Fabric Inbox 0.99.0 (it pinned 0.3.15, 0.7.0, 0.8.15,
  0.30.0 and 0.77.3). A machine on the train installs these with `setup --train organization-r1`; an app already newer
  is left as it is.

- **Fabric Agent Adapter is pinned at `v0.75.0`** (it was `v0.62.0`; `v0.70.0` was pinned first, PC-141): the `working-with-fabric` session hooks take a
  board request as a session (FAA-201), answer the board at once (FAA-205) and take the owner's word the first time
  (FAA-207), a hook after a claim released as done asks for the retro in that turn (FAA-206), hook input in Cyrillic
  is no longer dropped on Windows, and the support-agent recipe is new (FAA-197); sessions Fabric starts find
  fabric-mcp in your own `~/Applications/Fabric.app` before `/Applications`, and another user's registered copy is
  flagged (FAA-229, the adapter's side of PC-145); an absolute `PASSIONCODE_APPLICATIONS` is the one place it looks when set (it skips another
  user's copy there, as `setup` and `doctor` now do, PC-160), and a root-owned copy is named as an administrator's (FAA-237) (PC-141).
  From `v0.74.0` its kit checks that a loopback listener belongs to your own OS account before it sends any credential
  (FAA-226, the contract's DEC-0154 HA-2): a service that refreshes its copy of the kit sends nothing to another
  account's process, and its probe fails such a port; `v0.75.0` adds the communication agent template (guidance only)
  (PC-165).

### Fixed

- **The pinned update line is printed once when npm is missing** (PC-143): on Windows with no npm beside Node and a
  verified version recorded, every session start printed the missing-npm line with the pinned command until the daily
  check ran; the hook now records what it found as the check would, and says it once.

- **The setup skill and the README prompt relay the missing-npm line** (PC-143): an agent setting up was told what to do
  with a refused version but not with the line that says there is no npm beside Node; both now give that line to the
  person word for word, and the skill's evals cover both lines.

- **A fix for the missing npm that did not work is named again** (PC-143): the line that names no npm beside Node was
  shown once, so a person whose fix did not take saw nothing more; it now comes back once after each daily check.

- **The session that finds npm back stops saying it is missing** (PC-143): on Windows, the first session after npm was
  put back beside Node started the check again but could still say npm was missing; it now says the check runs again.

- **Printed commands keep to the version you have while the newest is refused** (PC-143): while the session hook refuses
  the newest launcher, doctor's fixes, setup's closing line, the help and the analytics notice named
  `npx @passioncode-ai/passioncode@latest`, which runs the refused version; they now name the installed one.

- **Claude Code and MCP servers installed through npm start on Windows** (PC-143): Windows starts a `.cmd` file only
  through a shell, so Claude Code installed with `npm i -g` read as not installed, `update` skipped every plugin, and
  doctor's proving call failed for an MCP server registered as a `.cmd` shim. An npm shim now runs its JavaScript
  target through this Node; any other batch file is named in doctor's line and never handed to `cmd.exe`.

- **Two background updates that overlap both keep their folders** (PC-143): only the newer update's folder was
  recorded, so the older one could be swept while that update still ran; the last three are now kept
  (`updateCaches` in `state.json`).

- **A standing refusal names a missing npm** (PC-143): with no npm beside this Node, the session line about a refused
  version said the last check "could not tell" and offered an `npx` command, which cannot run without npm; it now says
  nothing is checked until there is npm beside this Node, and names the version to keep.

- **`status` names a missing npm** (PC-143): after the daily check found no npm beside this Node, `status` said only "npm
  latest: not checked"; it now says "not checked (no npm beside this Node)", and `status --json` carries `npmMissing`.

- **A `state.json` that cannot be written is named** (PC-143): the session hook stopped without a word, with no update,
  refusal or setup line; now it starts no update (its start could not be recorded) and says the file cannot be written.

- **A failed background start records no folder that is gone** (PC-143): when an update could not start, the hook put
  back the folder of the update before it even if another session's sweep had removed it; now only one still there.

- **A log folder the background update cannot write is named** (PC-143): when `~/.passioncode/logs` cannot be written,
  the session hook said to check that npx is on PATH, which fixes nothing; it now names the log folder and asks to make
  it writable.

- **`uninstall` leaves no update folders behind** (PC-143, LC-12): the session hook's update folders
  (`~/.passioncode/run/`) and their record go with the rest of the launcher's state, unless an update recorded in the
  last hour may still run from one; then the hook's own sweep removes them later.

- **`doctor` survives an MCP server that closes its input at once** (PC-170): the proving call's write to such a server
  failed with `EPIPE`, an unhandled error that ended `doctor` itself (seen on Linux). Now it is that server's failed
  probe, named by the stage: "the server closed its input during initialize".

- **More programs that run other code are never offered a wildcard** (PC-122): the wrappers `gsudo`, `sshpass`,
  `chronic`, `ifne`, `xvfb-run` and `autossh`, and the runners `gemini`, `aider`, `opencode`, `goose`, `infisical`,
  `chamber`, `sops`, `summon`, `envchain`, `teller`, `pulumi` and `pre-commit`, join the lists a declared rule is
  checked against.

- **`setup` under sudo is refused** (PC-159): run as root, `setup` and `doctor --fix` compared owners with root's uid, so
  a copy in `/Applications` read as someone else's and an install could land root-owned in the person's
  `~/Applications`, never replaceable by them. Both now stop with one line saying to run them as yourself (exit 2);
  plain `doctor` only reads and still runs.

- **A rule you took out stays out, and bypassPermissions needs your yes** (PC-133): `setup` (with `--allow-tools`,
  `--allow-commands`, or a yes to its questions) added back a rule taken out with `permissions remove`. It now leaves
  such a rule out, says so on one line, and `permissions allow <rule>` adds it back; `--json` lists them as `keptOut`.
  `permissions mode bypassPermissions` set the mode for whoever ran it; it now asks in a terminal, or takes
  `--confirm-bypass`, and is refused otherwise (exit 2, nothing written).

- **A dry run whose only asked step cannot run says so** (PC-121): `setup --dry-run --allow-tools` over Claude Code
  settings it cannot read headed the answer "Nothing to do." above "A run with --allow-tools fails until that is fixed."
  It now heads it "Nothing was changed: the step you asked for cannot run until Claude Code's settings are fixed."

- **A settings file reached through links follows at most 32 of them** (PC-121), as macOS does (Linux allows 40), not
  64: a longer chain to a missing file is refused as too many levels of links, as the system refuses it, and no file is
  made at its end.

- **New installs go into the user's own `~/Applications`, so a second macOS user gets their own apps** (PC-145, PC-146, PC-147, SCN-017): `setup`
  installed only into `/Applications`, counted another user's copy there as installed, and replaced an outdated one by
  moving it into the running user's Trash; a standard user got a bare permission error. Each app now goes into the
  user's `~/Applications` (made on the first install), on a Mac with one user too; a copy already in `/Applications`
  that is theirs and that they may replace stays there and is updated there; the plan and the install question name the
  folder. Another user's copy, or one an administrator installed, is left byte for byte and `doctor` names it (for Fabric Dashboards, Fabric Inbox and Fabric it adds that macOS may open their links with it). No administrator password is needed, and a
  folder the user cannot write (or an app they cannot replace) is named in the plan, the steps and the `blocked` list
  of every run, never asked about, and nothing is downloaded. `PASSIONCODE_APPLICATIONS` still names one folder for
  every app, read as the Fabric Agent Adapter reads it (PC-160): only an absolute value counts, and another user's copy
  in that folder is named, planned as a blocked install and never replaced or registered as an MCP server.

- **The launcher's MCP entries follow your own copy** (PC-149): an entry an earlier `setup` registered from a copy you
  no longer use (another user's in `/Applications`) is pointed at your own copy by the next `setup` or update, while it
  is still exactly what the launcher wrote; `restore` puts the old entry back. An entry you set or changed yourself is
  kept: `doctor` warns that it runs from that copy, says the launcher did not set it and names the step (for Claude
  Code `claude mcp remove --scope user <name>`, then `doctor --fix`).

- **A service waiting for its setup is not called degraded** (PC-164, the contract's DEC-0149): an agent started
  without its instance answers `degraded` with every entry marked `setup: true`; `doctor` now says it «waits for
  setup» and names the slots a person fills (and the service's own doctor command, when it declares one), where it
  said «status degraded». A failure beside them still reads as a degradation, the failures named first.

- **`doctor` checks who owns a service's port** (PC-152, the contract's HA-2, fabric-agent-contract DEC-0154,
  `v0.1.0+2026-11-07.1`): before it reads a family service's `/.well-known/fabric-service` on loopback, `doctor` checks
  that the listener on the port is a process of your own OS account (macOS `netstat` and `ps`, Linux `/proc/net/tcp`,
  Windows the listening process's owner). A port another account's program holds, or one whose owner cannot be told,
  is a failed row that names the port; doctor sends that listener nothing, reads nothing from it and offers no
  `kickstart`. Before, on a Mac with two users, another user's process on your service's port answered for it.
- **The owner is read on doctor's own connection** (PC-163, the contract's CT-254, `v0.1.0+2026-11-07.3`): `doctor`
  opens the connection first and checks the process that holds its server end, then reads the answer over that same
  connection; a list of listeners read before connecting says nothing about who accepted it. While a connection is
  not yet accepted, the listener on `127.0.0.1` counts before a wildcard one, and listeners of two accounts there are
  an owner that cannot be told. A socket table the system cuts short (some macOS releases show a process only its own
  sockets) is a warning that names the port, never another account and never a healthy service. Under the contract's
  DEC-0155 (`v0.1.0+2026-11-07.5`, PC-168) a `netstat` that fails, or prints only its header, is such a table too: a
  warning, not a failure.

- **Another user's app is not "in use"** (PC-151): `setup` and `doctor` asked `pgrep` about every user's processes and
  matched the bundle's path anywhere in a command line, so on a Mac with two users a copy in one user's
  `~/Applications` kept the same app in `/Applications` from being replaced. Now only this user's processes count,
  and the path must start the command or follow a space. So a copy of yours that another user has open, or runs an MCP
  server from (an entry they set by hand; the launcher's own follow each user's copy, PC-149), is replaced and goes to your Trash; that user
  restarts it.

- **`CLAUDE_CONFIG_DIR` is honoured** (PC-129): with Claude Code's own variable set, the launcher read and wrote
  `~/.claude` and `~/.claude.json`, so `update`, `setup`, `doctor`, `status`, `permissions`, `restore` and `uninstall` looked at a
  folder Claude Code was not using. They now use the folder the variable names, as Claude Code does. In a session
  Fabric Switchboard launched, they write settings, plugins and MCP servers to the person's own folder Switchboard names in
  `SWITCHBOARD_CLAUDE_SOURCE_DIR` (0.7.14 and later), and with an earlier Switchboard to `~/.claude` (where 0.2.75 wrote settings too; its plugin and MCP calls went into the
  home), not to Switchboard's home (the folder `CLAUDE_CONFIG_DIR` names, whose settings Switchboard rebuilds at
  every launch; SB-259). Not yet: a variable set only in Claude Code's own settings `env`,
  `restore` putting a retired marketplace back into the folder it was taken from (docs/reference/cli.md), and, on
  Windows, a session a Switchboard before 0.7.17 launches seeing plugins installed in your own folder (SB-260, SB-266).
  An MCP entry an earlier release put in the folder `CLAUDE_CONFIG_DIR` named (and then reported as failed) is left as the person's: `uninstall` does
  not remove it, so remove it by hand with `claude mcp remove --scope user <name>` run with that variable; rules and a mode an earlier release
  wrote to `~/.claude/settings.json` while the variable named a folder of your own stay there and do nothing (`setup` or
  `permissions allow` adds them to that folder); in a Switchboard session built from `~/.claude` they were already in
  the right place. With the
  variable set, the anonymous error counts of `update` and `doctor` should fall: those failures are what this fixes.
- **Automatic updates can start on Windows** (PC-135): the session hook started `npx` and `npm` without a shell, which
  cannot start their `.cmd` files, so wherever npm is installed that way (the Node installer, nvm-windows, fnm) the daily
  check failed and no update ever started. The hook now runs npm's
  own `npx-cli.js` and `npm-cli.js` (the npm in the folder of the Node that runs it, through that Node). Where no npm
  sits beside that Node, the check and the update start nothing and the session line says so instead of
  `spawn npm ENOENT` or asking to fix PATH: reinstall that Node.js with npm, or put a Node.js that has npm first on PATH
  (the next session checks again once npm is there), with
  the manual command pinned to the verified version when one is known (PC-143). The processes
  the hook starts open no console window (whether npm's own shell for the package shows one is not yet checked on a
  Windows desktop, PC-143; CI proves that npm's scripts start there, and a full background update on a Windows desktop is
  still to be observed, PC-143). An installation on Windows from 0.2.75 or earlier still runs
  its old hook, which cannot learn of this version: update it once by hand
  (`npx --yes @passioncode-ai/passioncode@latest update`); it updates itself from then on.
- **`update` moves entries aside on Windows** (PC-135): a shadowing `~/.claude/skills` entry, or a foreign link or copy in
  `~/.agents/skills` or an agent's skills folder. `update` named a moved path by its forward slashes alone, so on Windows
  the name kept the drive's colon and the move failed; the quarantine now flattens Windows paths too.
- **`uninstall` keeps the update switch** (PC-131, LC-16): it wrote `update.auto` off, so a later install stopped
  updating itself although the person never turned it off. It now leaves the switch as the person set it; with
  nothing installed the session hook starts no update (one it had already started still finishes, which can take several minutes: once
  `~/.passioncode/logs/update.log` shows it ended, run `status`, and if it shows a version run `uninstall` again), and a reinstall keeps the choice. An uninstall by 0.2.75 or
  earlier wrote the switch off: `status` then shows `auto-update off`, and
  `npx @passioncode-ai/passioncode@latest config set update.auto on` turns it back on; `doctor` now shows an information row
  (`skills.auto-update`) whenever the switch is off, naming that command as the person's choice, and never turns it on itself.

- **`~/.codex/config.toml` keeps its link and its mode** (PC-126): registering an MCP server there, and removing it
  through `restore` or `uninstall`, now writes the file where a link points and keeps its permission bits, as the JSON
  settings files already did (PC-120); a file the launcher creates is private (mode 600 on macOS and Linux). Before, a
  link was replaced by a regular file and the file, which can hold server tokens under `env`, could become readable by
  others. When the file is a link into a folder the launcher cannot write, the update now reports the registration as
  failed instead of replacing the link, and so do `setup` and `doctor --fix`, which run an update (the Gemini and Kimi
  files have done so since 0.2.74); make the folder writable, or declare the server in the file the link points to,
  which the update then finds already there.
- **`restore` and `uninstall` go on past an MCP entry they cannot remove** (PC-127): an entry whose file cannot be
  opened now (its permissions, a link into a locked folder) is kept and stays recorded; `restore` still puts back the rest of
  the batch and `uninstall` finishes the rest, each lists what it did and exits 1 naming the file. Once the file and its
  folder are readable and writable again (for a link, the folder it points into), `uninstall` removes the entry, and so does `restore` while that batch is still the latest
  (any update that registers or moves something starts a new one, a quiet or background one included). With
  `--json`, stdout still holds what was done. A JSON file that does not parse, or a folder in place of a file, is
  reported as kept and no longer tracked (`config.toml` is read as text: a launcher table edited since is reported as kept, and an entry no longer declared in the file is taken as gone), and a path that now runs through a file is taken as already gone. A registration whose
  write failed is marked in the journal and saves no recovery entry, and `restore` takes out only what an update
  recorded as registered, so it never removes an entry the person declares there later, even from a batch an earlier
  version journalled. Before, both stopped at that entry (`uninstall` with `current` already gone), and an entry whose file the
  system could not open was dropped from the record: a `config.toml` was taken as already cleaned, the JSON files of
  Claude Code, Gemini and Kimi were reported as kept and then forgotten.
- **A key added inside a launcher Codex table is kept** (PC-127): `restore` and `uninstall` removed a table the launcher
  wrote in `~/.codex/config.toml` (`["mcp_servers"."fabric-dashboards"]`, and likewise for `switchboard` and `fabric`)
  with any key or comment a person had added inside it, such as an inline `env = { … }` holding a token, and reported
  it as removed. They now keep a table that holds anything beside the launcher's own `command` and `args`, and report
  it as kept; a server the person declared another way under `mcp_servers` (inline or with dotted keys under
  `[mcp_servers]`, a `[mcp_servers.<name>.…]` sub-table, or a root `mcp_servers.<name>` key before the first table) is
  now reported as kept too (before, it was left alone without a note).
- What earlier versions left in `~/.codex/config.toml` stays as it is: a link an earlier update, `restore` or
  `uninstall` replaced is not put back, and a file one of them rewrote may have been left readable by others (mode 644
  on macOS and Linux; `chmod 600 ~/.codex/config.toml` narrows it again, since the launcher now keeps the mode it
  finds). The file the link pointed at was not written then and holds what it held before that update; the regular
  file in the link's place holds every change since, so merge that into it before linking again. The copy that update
  took is in its `~/.passioncode/quarantine/<run>/` as `config.toml.before-mcp-codex-cli`; a removal by `restore` or
  `uninstall` took none. A link to a missing file was replaced by 0.2.74 and 0.2.75 with a file holding only the
  launcher's entries, and no copy was taken: move that file to where the link pointed and link again.
  An MCP entry an earlier version left unrecorded (one a 0.2.75 `restore` or `uninstall` could not read and dropped
  from its record, or one written by an update that was killed before it finished) is now neither removed by
  `restore` nor known to `uninstall`: delete it by hand. These failures now exit 1 where they used to pass, for
  `update`, `restore` and `uninstall` and for `setup` and `doctor --fix`, which run an update; the failed-run counts
  this version starts sending (`command_run` with `failed`, `app_error`) include them from the first day.

## 0.2.75 - 2026-11-04

### Added

- **`permissions`** (PC-125): what PassionCode allowed Claude Code to do without asking, and its default mode, for a
  person and for Fabric's permissions screen. Setup keeps a private ledger, `~/.passioncode/permissions.json`: each rule
  it added, its set, what it allows, who declared it, from where, when, who asked for it and the launcher version.
  `permissions` joins
  it with `~/.claude/settings.json` (each rule's state, the rules offered and not allowed yet, declarations not offered
  as declared, every other allow rule, the mode); `permissions allow` and `remove` change only PassionCode's rules,
  `permissions mode <mode>` sets `permissions.defaultMode` to one of Claude Code's modes, and `--by` records who the
  caller says asked. A ledger that cannot be read or written stops the act before the settings change. `--json`
  answers the same view; a settings file that is a link stays a link with its mode.

### Changed

- **Setup's hints under a mode that does not ask** (PC-125): when `~/.claude/settings.json` sets the default mode to
  `bypassPermissions`, `dontAsk` or `auto`, setup no longer says "Claude Code still asks"; it says the allow rules do not
  include the rules and that the mode decides. A rules step that cannot write the ledger still adds its rules and ends
  "the permissions ledger was not updated".
- **Fabric Agent Adapter is pinned at `v0.62.0`** (it was `v0.61.0`): a new service install must name the repository of
  its code (an update of an installed one without it still works and warns), the reference service declares its
  connections, and `check_service.py` reports a descriptor without a repository and the connections declaration
  (PC-130).

## 0.2.74 - 2026-11-04

### Fixed

- When the skill update retires an old marketplace, and when `restore` declares it again, a `~/.claude/settings.json`
  that is a link stays a link: the change is written where the link points and the file keeps its permission bits, as
  the PC-117 rules merge already did (PC-120). The MCP registration in `~/.gemini/settings.json` and
  `~/.kimi-code/mcp.json`, and its removal, do the same, and a file the launcher creates there is private; a link there
  to a missing file no longer fails the registration: the file is made where it points.
  `~/.codex/config.toml` is still written as a regular file (PC-126).
- What earlier versions left stays as it is: a link an earlier update, `restore` or `uninstall` replaced is not put
  back, and a file one of them rewrote may have been left readable by others (mode 644 on macOS and Linux; `chmod 600`
  on it narrows it again). The file the link pointed at
  was not written then and holds what it held before that update; the regular file in the link's place holds every
  change since, so merge that into it before linking again. The copy that update took is in its
  `~/.passioncode/quarantine/<run>/` as `settings.json.before-<marketplace>` (`~/.claude/settings.json`),
  `settings.json.before-mcp-gemini-cli` or `mcp.json.before-mcp-kimi-code`; a removal by `restore` or `uninstall`,
  and `restore` declaring a marketplace again, took none.

## 0.2.73 - 2026-11-04

### Added

- **`setup` offers rules for shell commands** (PC-119), a set of its own beside PassionCode's tool rules: one question
  in a terminal (default no) or `--allow-commands`, never `--yes` alone. The launcher carries `Bash(gh pr merge:*)` and
  says it cannot be limited to your repositories; an agent of your own declares its rules on the machine in
  `~/.passioncode/rules.d/<name>.json` (`by`, and each `rule` with `why` it is needed). The plan lists each rule with
  what it allows and who declared it; a declared rule with a substitution, a separator, a redirection or a wildcard
  that would allow more than it says is named and not offered: only a plain form is offered (the program by its bare
  name, no wrapper such as `env` or `sudo`, a wildcard only over a command installed in your home folder, and none over
  a shell, an interpreter or a program whose options can run other code). The plan and the question say a rule ending
  in `*` allows any arguments after its words. With `--allow-commands`, settings that cannot be read are a failed step
  (exit 1). The result carries `commands`.

## 0.2.72 - 2026-11-04

### Changed

- **Fabric Agent Adapter is pinned at `v0.61.0`** (it was `v0.60.0`): a board responder can read the operator's mandate
  from a request of his own Project (off by default); working-with-fabric says the operator's approval holds for the
  whole task; the kit's mandate readers read a spend by its real type and number, a job's approval step is kept as the
  gate reads it, and requests or answers that are no JSON object are refused, never a crash (PC-118).

## 0.2.71 - 2026-11-04

### Added

- **`setup` offers Claude Code's rules for PassionCode's own tools** (PC-117). On the person's own yes (a question in a
  terminal, default no, or `--allow-tools`; never `--yes` alone) it merges `mcp__fabric`, `mcp__fabric-dashboards`,
  `mcp__switchboard`, `mcp__plugin_switchboard_switchboard` and `mcp__observatory` into `permissions.allow` in `~/.claude/settings.json`, so Claude Code uses
  those tools without asking. Every other setting and rule is kept, a denied rule is not added, a second run adds
  nothing, and settings that cannot be read are named and left as they are. The plan lists the rules; a run that
  leaves them out says how to add them; the result carries `permissions`. Each rule allows every tool of its server;
  shell commands, other servers and Fabric Inbox are not covered, and an `ask` or `deny` rule still wins. Existing
  machines are offered the rules the next time `setup` runs. The rules merge writes a settings file that is a link, or a
  chain of links, where it ends (the skill update's own write to that file does not keep a link yet, PC-120); with `--allow-tools`, settings that cannot be read are a failed step (exit 1).

## 0.2.70 - 2026-11-03

### Changed

- **The repairs question asks only what a no stops** (PC-112). When a run installs an app that bundles an MCP server
  (Fabric Switchboard, Fabric Dashboards, Fabric), that install registers it through the skill and MCP update, which
  runs whatever the repairs answer. The repairs question now leaves that update out and asks only about the rest (no
  question when nothing else is left), and the update is listed as taken. It runs after that install succeeds; an
  install that fails runs no update, and the update is then listed as not taken. The question is registered in
  `docs/brand/strings.md`.

## 0.2.69 - 2026-11-03

### Changed

- `docs/reference/cli.md` and SCN-009 say that an app a run installs that bundles an MCP server (Fabric Switchboard,
  Fabric Dashboards, Fabric) still gets it registered when the person answered no to the repairs, and that this update
  also makes the skill-set and MCP-registration repairs (PC-108). SCN-009 and SCN-014 no longer say `setup` always stays
  a step after declined repairs: it does where a failing or warning check's own fix names it. An app answered no that has no note is no step of its own: running `setup`
  again offers it.
- Tests (PC-108): a declined terminal run on Windows (no install is asked there; nothing changes, `setup` stays a
  step, exit 1 while a check fails), an install answered no without a note, and the update an install forces after
  declined repairs.

## 0.2.68 - 2026-11-03

### Changed

- **A plan with nothing to ask no longer promises questions** (PC-110). A plan with no offer and no repair, only a
  train, asks nothing in a terminal, which saves the train at once, so it closes with "Run it with --yes, or in a
  terminal, to apply." A plan with any offer (one that defaults to no, Fabric without Docker, included) or repair
  keeps "Run it with --yes to apply, or in a terminal to answer its questions."
- `docs/reference/cli.md` says a plan that names a train is judged by that train's checks, so its problem and warning
  counts can differ from plain `doctor` on the saved train (PC-110).
- The 0.2.67 entry's "the plan's last line" is the last line of the plan block: the checks follow it (PC-110).
- The release train loader's errors are registered in `docs/brand/strings.md`, and the help test reads the setup
  parser up to its own closing brace at any indentation (PC-110).

## 0.2.67 - 2026-11-03

### Changed

- **A plan says how to apply it once** (PC-107). The train line says only what was not saved ("The release train
  (<name>) was not saved.", "The saved release train was not forgotten."), and the plan's last line says how to apply
  it, also when the only change is a train; after a `--dry-run`, which only plans with `--yes` or in a terminal too, it
  says "Run it without --dry-run (with --yes, or in a terminal) to apply." The `--json` result carries `dryRun: true` on a `--dry-run`.
- **The closing line names warnings** (PC-107): "No problems, 1 warning(s)." where it used to say "No problems." while
  warnings were open. A declined run's open checks are "Still open:", as after any run.
- `none` is no release train's name: a train file `none.json` is refused and not listed (PC-107).

### Fixed

- The string registry test reduces nested placeholders whole and refuses a short row cited on any line of a longer
  row's text, not only its first; the help test reads pattern flags only from the setup parser (PC-107).

## 0.2.66 - 2026-11-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.60.0`** (it was `v0.59.0`): a board responder finds a slot the operator moves
  back to it, once Fabric offers that move, and claims it without a take-back; `pack`, `sign` and `verify` say why a
  provider manifest is refused; working-with-fabric reads a filed row's answer and says when an accepted request is
  left behind by a move; Python's package kit refuses `NaN` and `Infinity` as the Node kit does (PC-109).

## 0.2.65 - 2026-11-03

### Fixed

- **Your steps after a declined answer** (PC-94). A terminal run that answers no to its repairs keeps `setup` among the
  person's steps (where a failing or warning check's fix names it), whatever else it took: an install, or forgetting the
  saved train with `--train none`, which used to make the run count as that command. After a declined train, Fabric's
  note asks for it with that train (`setup --train <name> --with fabric`); Fabric named with `--with fabric` without its
  prerequisites and then answered no is "not installed" in the steps, not "installed because you asked for it". A declined run lists no plan under its
  headline, which points at the checks when one is still open.
- The em dash guard reads JavaScript and Markdown more as they are read (PC-97). In code: strings, template literals
  with their `${}` nesting and regular expressions (after a keyword such as `return` too) are code, so a template line
  that starts with `//` or `/*` and code after a block comment's `*/` are checked, while a trailing comment is not; it
  also catches `\u{02014}` and a `fromCharCode`/`fromCodePoint` call that names 0x2014, 8212, 8_212 or 0o20024 on its
  own line. In the documentation: double-backtick code spans, a span over lines of one paragraph that ends at a heading,
  a list item, a block quote, a thematic break, a setext underline or a table row that starts with `|`, an escaped
  backtick, and a ``` opener whose info string holds a backtick (no fence); a JSON file pairs spans within a line. The
  test pins each of these, and its header names the cases it still cannot see.

## 0.2.64 - 2026-11-03

### Changed

- **One rule for "The checks below still stand."** Each headline of `setup` and `doctor --fix` that reports, instead
  of a plan, that nothing changed (declined, not installed, skipped, in place, nothing to do, nothing would change) adds it when a check below
  is still open, a FAIL or a WARN, and only then. It used to follow a FAIL only, and the declined, not-installed and
  skipped lines carried it even above passing checks (PC-105).
- **A plan lists its train change as one of its lines** ("save release train <name>"), so a plan whose only change is
  a train no longer shows an empty list, and a plan that would forget the saved train with `--train none` says "forget the saved release train" and "The saved release train was not forgotten",
  instead of naming a train "(none)" (PC-105). The line is in the text report; `--json` keeps the train in `trainNotSaved`,
  and the setting-up skill now reports it from there.
- **Agent-facing docs:** the setting-up skill says a declined terminal run is not a plan and exits by its checks, and
  `docs/reference/cli.md` says a plan carries no `humanSteps`, and that a declined run that named a train is the
  person's answer, not a plan, so its steps name `setup --train <name>` (PC-105).

### Fixed

- The string registry test reads each row's whole text, placeholders included, from the line it cites (it read only the
  longest phrase, up to 40 characters), so two rows that share a phrase are told apart and a changed placeholder is
  caught; three rows now match their code, and the plan's install line and the doctor's app label are registered. The
  help test reads the flags `config` sets aside from the parser and every form of a pattern flag (PC-105).

## 0.2.63 - 2026-11-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.59.0`** (it was `v0.58.0`): a new agent is portable from its first commit.
  The intake asks its uptime category (A, a cloud host from the first release; B, local only), the kind of its data
  (U or O) and its copyright holder. A new agent gets a data home of its own, a new private agent gets a `LICENSE`
  naming its holder, and every release runs the transfer audit (PC-106).

## 0.2.62 - 2026-11-03

### Fixed

- `setup` and `doctor --fix` no longer print a bare "Nothing to do." or "Everything ... is in place"
  above a failing check: both add "The checks below still stand." (PC-104). A plan that would leave an
  app out names it ("Nothing would change: Fabric would not be installed (see the plan below).") and a
  plan whose only change is a release train is shown as a plan. The line under the plan says "answer
  its questions", which covers the repairs question. The README, the setting-up skill and the reference name the cases more exactly.

## 0.2.61 - 2026-11-03

### Fixed

- A `setup` re-run that asks nothing (`--yes`, or no terminal) and changes nothing no longer says
  everything is in place when it skipped an app by default: "Nothing was changed: Fabric was not
  installed (see your steps below)", and the JSON names it in `skipped` (PC-101). A terminal run that
  answers no to every offer that defaulted to yes no longer counts Fabric's default-no offer as
  declined: "You declined every other offer, and Fabric was not installed", with `notTaken`. The
  "declined" and "in place" reports are in the string registry.

## 0.2.60 - 2026-11-03

### Fixed

- The `setting-up-passioncode` skill states setup's exit codes: a step or a check that failed exits 1,
  and a plan (`--dry-run`, or a run without a terminal and without `--yes` that would change something;
  a `--json` run never asks) exits 0 even when a check fails, so an agent reads `after.summary` and `plan`; exit 1 with no
  JSON is a runtime error (PC-102). The README says a `--json` run never asks, names the repairs
  question beside the one per app, and says a terminal run with nothing to ask saves a train at once. `doctor --dry-run` is refused with exit 2 before any check, now under test.

## 0.2.59 - 2026-11-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.58.0`** (it was `v0.57.0`): an agent built with the adapter keeps its source
  apart from its instance from its first commit, and `adapting-projects-to-fabric/scripts/fabric_source_check.py check`
  finds home paths, credentials and the owner's strings in a source tree without printing any of them (PC-103).

## 0.2.58 - 2026-11-03

### Fixed

- `help` says that exit code 0 also means only a plan was shown, and `docs/reference/cli.md` says
  when a run without a terminal and without `--yes` is a plan: only when it would change something;
  otherwise it exits by its checks (PC-100). The setup and doctor variant of "unsupported
  arguments" is in the string registry. The help test now reads the flags setup parses by pattern
  and the command aliases from the parser itself, and the string registry test requires each
  location to hold the longest literal run of its text.

## 0.2.57 - 2026-11-03

### Fixed

- A terminal `setup` that declined every offer (PC-91) exits by its checks, 1 when a check still
  fails, whether or not it named a release train (PC-93). Before, naming a train other than the
  saved one made it exit 0 as a plan does, and otherwise it exited by its checks, though in both
  the person changed nothing. A run that only returns a plan (`--dry-run`, or no terminal and no
  `--yes` when it would change something) still exits 0.

## 0.2.56 - 2026-11-03

### Fixed

- `setup` in a terminal that asked, changed nothing and left install offers untaken, such as Fabric
  offered without Docker (an offer that defaults to no), says "Nothing was changed: Fabric was
  offered and not installed. The checks below still stand." instead of "Everything this command can
  set up is in place" (PC-92). It does not say "declined": pressing Enter on an offer that defaults
  to no is not declining (PC-89, as its test `a run nobody agreed to saves no train` holds). A run that answered no to every offer, at least one of them
  defaulting to yes, still says "You declined every offer" (PC-91).

## 0.2.55 - 2026-11-03

### Fixed

- `help` lists every flag each command accepts and the command aliases (PC-98): `--offline` for
  `setup` and `doctor`, `-y` for `setup`, `--quiet` for `update`, `--json` for `restore`,
  `uninstall` and `config`, and that `onboard` is another name for `setup` and `install` for
  `update`. It also says what `--offline` and `--quiet` do. A test fails when a flag in the parser's
  lists is missing from its command's line.

## 0.2.54 - 2026-11-02

### Changed

- The documentation a person reads carries no em dash outside code (PC-96): the README, the CLI
  reference, the scenarios and screens, the docs index, both PassionCode.ai skills with their
  references, and the skill evals. `COMMERCIAL-LICENSE.md` and the README's licence sentence follow
  the knowledge base templates again (they dropped theirs). The `setting-up-passioncode` skill now
  says `humanSteps` holds both commands an agent may run and steps that need the person,
  consistent with the terminal header since 0.2.53, and the releasing reference names the title the
  launcher's release workflow sets. `docs/brand/strings.md` carries the help text's words as printed,
  points each row at its current line, and registers the 0.2.53 strings of `setup` (its question,
  its verification line and its steps header), `update` and the session-start notices (the `doctor`
  details and fixes are not in the registry). The heading
  "0. The protocol" of the `working-in-passioncode` skill lost its dash, so its anchor changed. The
  em dash test now also reads that documentation, outside code spans and fenced blocks.

## 0.2.53 - 2026-11-02

### Fixed

- What the launcher prints for a person carries no em dash (PC-95): the `setup` install question, its
  app verification lines and its "Your steps" header, the `doctor` details and fixes for Node, a stopped
  app, Docker, the Supabase CLI, MCP registrations and proving calls, and services, the `help` title,
  the `update` closing line, and the session-start update notices. A
  colon, comma, semicolon or parentheses take its place. Each line keeps its meaning, except that the
  "Your steps" header no longer says an agent cannot do any of them (some are commands an agent runs):
  it now reads "sign-ins, consents and secrets in hidden prompts need you in person". A test now
  fails on an em dash, or its escape, in any string under `bin/`, `lib/` or the plugin's hooks. The npm
  description and the GitHub release title (now "PassionCode.ai <tag>") carry none either.

## 0.2.52 - 2026-11-02

### Fixed

- `setup` in a terminal, answered "no" to every offer (at least one of them defaulting to yes) and so
  changing nothing, says "You declined every offer; nothing was changed." instead of "Everything this
  command can set up is in place" (or "Nothing to do." when it named a train), and a release train named in that run is reported as not saved without the
  advice to answer in a terminal (PC-91). Forgetting a train with `--train none` is still a change.
  Such a run now lists `setup` among the person's steps when a failing or warning check's own fix
  names it (`setup --train <name>` when the run declined that train).

## 0.2.51 - 2026-10-30

### Fixed

- `setup` finds an app one folder down in its zip, as Fabric Switchboard's archive holds it
  (`Fabric-Switchboard-<v>-macos-universal/Fabric Switchboard.app`, 0.6.83 to 0.7.1); before, it
  refused the release with "holds no Fabric Switchboard.app". Two copies in one archive are refused.
- A release download or a GitHub API read whose connection drops before any answer is tried once
  more after a second, instead of failing the install with "fetch failed".

### Added

- Release trains (PC-89, organization R1 N-12): `setup --train organization-r1` installs and
  reinstalls each app at the version the train pins (`trains/organization-r1.json`) instead of its
  latest release, and remembers the train; `doctor` compares every app with its pin, offline too,
  in each `app.<id>` line and one `train` line, on macOS and Windows. An app ahead of its pin is
  reported and never taken back, nor is one whose version cannot be read. `setup --train none` returns to the latest releases. The first
  pins are the releases of 2026-10-28; the train's record in fabric-workspace decides later ones.
  In `setup --json`, a change of train is an action of kind `train`, and a run that named a new
  train but was only a plan carries `trainNotSaved`.

## 0.2.50 - 2026-10-28

### Changed

- **Fabric Agent Adapter is pinned at `v0.57.0`** (it was `v0.56.0`): the kits read the Fabric Agent Contract at
  `3830a33` (`v0.1.0+2026-10-27.6`). A person's comparison of codes is a human step (DEC-0142), the protocol register
  knows the peer-share and organization-adaptation revisions, and on Windows the provider writer uses the folder Fabric
  reads (PC-90).

## 0.2.49 - 2026-10-28

### Fixed

- On Windows the launcher makes its links (`current`, the skill hub and each agent's channel) as
  junctions instead of symbolic links, so a member without an administrator session or Developer
  Mode can install and update the skill set; a junction's target is read back in the same form the
  launcher compares (PC-87).

## 0.2.48 - 2026-10-28

### Fixed

- `doctor` on Windows no longer tells you to run `setup --with <app>` for an MCP entry whose app is
  not installed: `setup` installs apps only on macOS, so the fix names the app's download page (or
  removing the entry). The `setting-up-passioncode` skill says the same (PC-88).

## 0.2.47 - 2026-10-28

### Fixed

- **`update` on Windows moves `current` to the new release** (PC-85, the Windows acceptance of 2026-10-28): Windows
  refuses a rename over a directory link (`EPERM ... rename 'current.<pid>.lnk' -> 'current'`), so an update stopped
  halfway, kept the old release and left a `current.<pid>.lnk` per attempt. There the old link is now removed first
  (the link itself, never what it points at) and put back if the rename fails again; the temporary link never outlives
  the call, and the ones a failed update left are removed by the next one.
- **`doctor` checks the apps on Windows** (PC-86): it reads each app's uninstall entry (`reg query`, the name and
  version its installer wrote) or finds it in `%LOCALAPPDATA%\Programs\<name>`, `%LOCALAPPDATA%\<name>` or Program
  Files, and says which version is installed and whether a newer one is out, instead of "app checks run on macOS".
  Setup still installs apps on macOS only.

## 0.2.46 - 2026-10-28

### Changed

- **Fabric Agent Adapter is pinned at `v0.56.0`** (it was `v0.55.0`): stability and Windows. working-with-fabric names
  the repositories a Windows turn touched; the board responder recovers from a refused slot, leaves within 3 s when
  idle and logs its notices at `warning` with a subject; the reference service can take a moved slot back; a spend
  gate fails closed.

## 0.2.45 - 2026-10-27

### Changed

- **Fabric Agent Adapter is pinned at `v0.55.0`** (it was `v0.54.0`): creating-fabric-agents carries what an agent
  that answers people needs from its first release (a reference of 17 parts, each with its check), and the
  support-agent recipe refuses a call to `answer()` from inside `on_handoff` with `ReentryError` instead of hanging.

## 0.2.44 - 2026-10-27

### Changed

- **Fabric Agent Adapter is pinned at `v0.54.0`** (it was `v0.53.1`): the contract pin `v0.1.0+2026-10-27.1` (DEC-0141
  MJ-1). A job's step under the operator's mandate is read under the job's own capability; a step no mandate can read
  is answered `operator-decision-required` (`mandate-capability-missing`) and waits for the operator. working-with-fabric
  names the job's capability without `actions` when it covers a job's steps.

## 0.2.43 - 2026-10-27

### Changed

- **Fabric Agent Adapter is pinned at `v0.53.1`** (it was `v0.52.0`): working-with-fabric's Stop hook names the other
  repositories a turn touched once Fabric takes them (never on Windows), a board responder stops when the operator
  moves its slot, and Step 4 reads Fabric 0.3.14's answer when a piece is filed. `v0.53.0` was never released. Notes
  are in the adapter's CHANGELOG.

## 0.2.42 - 2026-10-26

### Changed

- **Fabric Agent Adapter is pinned at `v0.52.0`** (it was `v0.51.2`): the contract release `v0.1.0+2026-10-26.12`,
  with where the operator said an approval travelling with a call, a hub key per organization context, a job's
  approval step read under the operator's mandate, and Fabric's rules for checking in every three minutes and for being
  seen correctly. Notes are in the adapter's CHANGELOG.

## 0.2.41 - 2026-10-26

### Changed

- **Fabric Agent Adapter is pinned at `v0.51.2`** (it was `v0.51.1`): the reminders Fabric gives on a turn (from
  Fabric 0.3.14) reach the agent at its next prompt, once each. Notes are in the adapter's CHANGELOG.

## 0.2.40 - 2026-10-26

### Changed

- **Fabric Agent Adapter is pinned at `v0.51.1`** (it was `v0.50.0`): the contract release `v0.1.0+2026-10-26.2` with
  the operator's mandate (one approval carried with a call, refused outside its scope with the order to follow), page
  links handed over as Fabric Dashboards links, and the A2A surface. Notes are in the adapter's CHANGELOG.

## 0.2.39 - 2026-10-26

### Changed

- **Fabric Agent Adapter is pinned at `v0.50.0`** (it was `v0.49.3`): the contract release `v0.1.0+2026-10-25` with
  dashboard action parity (every dashboard button has an agent tool, and the operator's agent relays their decision),
  agent pages that open only in Fabric Dashboards, and new probe rules. Notes are in the adapter's CHANGELOG.

## 0.2.38 - 2026-10-26

### Changed

- **Fabric Agent Adapter is pinned at `v0.49.3`** (it was `v0.49.2`): Fabric's button in the dashboard kit shows
  Russian on a Russian page and takes a page's own words, with no em dash, and a remote service registers the
  repository of its code. Notes are in the adapter's CHANGELOG.

## 0.2.37 - 2026-10-24

### Changed

- **Fabric Agent Adapter is pinned at `v0.49.2`** (it was `v0.49.1`): the service probe judges a remote service's
  session cookie by its name, so a CDN edge's own cookie no longer fails the login rules. Notes are in the adapter's
  CHANGELOG.

## 0.2.36 - 2026-10-24

### Changed

- **Fabric Agent Adapter is pinned at `v0.49.1`** (it was `v0.49.0`): the Python estate kit matches machine ids,
  passkeys and keys as the contract's `Set` does. Notes are in the adapter's CHANGELOG.

## 0.2.35 - 2026-10-24

### Changed

- **Fabric Agent Adapter is pinned at `v0.49.0`** (it was `v0.48.3`): the session start says one line in a folder that
  does not use Fabric, `watch-mail` delivers the spooled turns, a resumed board handler runs once, and the OpenRouter
  ceiling counts money only. Notes are in the adapter's CHANGELOG.

## 0.2.34 - 2026-10-24

### Changed

- **Fabric Agent Adapter is pinned at `v0.48.3`** (it was `v0.48.2`): the Node package reader refuses a folder swapped
  for a link while its files are read. Notes are in the adapter's CHANGELOG.

## 0.2.33 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.48.2`** (it was `v0.48.1`): the board responder settles a resumed request
  whose completion answer was lost on the next tick. Notes are in the adapter's CHANGELOG.

## 0.2.32 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.48.1`** (it was `v0.48.0`): the Python and Node usage kits round money
  alike. Notes are in the adapter's CHANGELOG.

## 0.2.31 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.48.0`** (it was `v0.47.1`): the re-pin to the contract's first release
  `v0.1.0+2026-10-23`. The probe admits an identity proxy's no-token page (DEC-0109), spending limits count money
  only, never a subscription's estimate (DEC-0110), the estate readers read the delta anchor (DEC-0107). Notes are in
  the adapter's CHANGELOG.

## 0.2.30 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.47.1`** (it was `v0.47.0`): the three risks of 0.47.0's blind reading
  closed (a Set's membership in the Python estate reader, `profile-forbids`' 403 asserted, more vendored variants).
  Notes are in the adapter's CHANGELOG.

## 0.2.29 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.47.0`** (it was `v0.46.1`): the repin to contract `87d384f`. The kits read a
  machine's `profile` in the estate record (DEC-0106, `FAC-SEM-134`), name `profile-forbids` and register
  `fabric-agent-call/1`. Notes are in the adapter's CHANGELOG.

## 0.2.28 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.46.1`** (it was `v0.46.0`): dashboard kit 1.1.3, whose section navigation no
  longer leaves a half-cut link beside More and follows the current section. Notes are in the adapter's CHANGELOG.

## 0.2.27 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.46.0`** (it was `v0.45.0`; `v0.45.1` is included): `working-with-fabric`
  teaches what to do when nobody answers a board request and reads the board as Fabric 0.3.9 serves it, and the kit is
  pinned to the Fabric Agent Contract's `0a4ce77` (a node's call queue: `queue-full`, three new protocols). Notes are
  in the adapter's CHANGELOG.

## 0.2.26 - 2026-10-23

### Changed

- **Fabric Agent Adapter is pinned at `v0.45.0`** (it was `v0.44.2`): pinned to the Fabric Agent Contract's
  `e742016`; the board kit reads the board as Fabric 0.3.9 serves it (the `answered` state, the read counts, a request
  nobody can answer now), a peer may be `processor-hosted`, and three new protocols are known. Notes are in the
  adapter's CHANGELOG.

## 0.2.25 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.44.2`** (it was `v0.44.1`): the kit writes its consumed-approval file
  owner-only on every platform (a protected ACL on Windows), and its private writer leaves no temporary file behind
  whatever fails. Notes are in the adapter's CHANGELOG.

## 0.2.24 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.44.1`** (it was `v0.44.0`): two kit modules split by responsibility
  (`fabric_interop_rules`, `fabric_package_schema`, both twins); no behaviour changed. Notes are in the adapter's
  CHANGELOG.

## 0.2.23 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.44.0`** (it was `v0.43.0`): a service built with the kit can say what it
  uses (`fabric-connections/0.1`, the Connections tab of Fabric Dashboards), and the kit's layout check exits 3 when it
  measured nothing. Notes are in the adapter's CHANGELOG.

## 0.2.22 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.43.0`** (it was `v0.42.1`): the adapter follows Fabric Agent Contract
  `bfa9a67` (the contract review, DEC-0096 and DEC-0097, a fix to schema patterns that accepted a line separator in a
  package path). Notes are in the adapter's CHANGELOG.

## 0.2.21 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.42.1`** (it was `v0.41.0`): the session hooks follow Fabric 0.3.9 (a
  `/clear` keeps the Fabric session, an end from before a `--resume` is not delivered, the release says when the end
  was observed, a rejoin Fabric answers with "no session" is not retried every turn); the kit's layout check and its
  `pack`/`sign`/`verify` run when started through the launcher's symlinked folder. `v0.42.0` was tagged and never
  published. Notes are in the adapter's CHANGELOG.

## 0.2.20 - 2026-10-22

### Changed

- **Fabric Agent Adapter is pinned at `v0.41.0`** (it was `v0.40.0`): the 2026-10-22 audit closed. Session hooks that
  survive a refused call, a wrapped `fabric-mcp` and a slow process table; a board responder that recovers a request
  after lost answers; Python twins of the service kit that lock their stores and refuse what the Node twins refuse;
  package and estate checks that agree across the kits; safer installers (a copy in the hub is replaced only with
  `--force`, atomically); nightly CI with the contract at the pin, Python 3.9, Node 18, macOS and Windows. A Linux
  service on the Node kit needs Node 22. Upgrading notes are in the adapter's CHANGELOG.

## 0.2.19 - 2026-10-21

### Changed

- **Fabric Agent Adapter is pinned at `v0.40.0`** (it was `v0.39.1`): the service kit as layered modules behind
  compatibility facades, installed into a service with `fabric_kit.py install` and checked with `fabric_kit.py status`;
  connectors for outbound HTTP and OpenRouter (the agent's own key, a spend ceiling before every attempt, usage
  receipts, a fallback model); a support-agent recipe. A service that copied one kit file installs the kit as a set now.

## 0.2.18 - 2026-10-21

### Changed

- **Fabric Agent Adapter is pinned at `v0.39.1`** (it was `v0.39.0`): fixes from a review of 0.39.0. The service
  probe no longer crashes on a usage count that is not a number, the Python and Node kits read such counts as the
  contract does, the documentation and the messages people read carry no em dash, and the dashboard kit is 1.1.1.

## 0.2.17 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.39.0`** (it was `v0.38.0`): the kits follow contract `c55f2d5`. A partner's
  publisher key is trusted only in the organization contexts its scope names (FAC-SEM-122), a partner may sit innermost
  in a delegation chain (DEC-0090), and a usage report counts calls with unknown tokens in `unmeasuredCalls`
  (DEC-0091).

## 0.2.16 - 2026-10-20

### Changed

- **Observatory Log is pinned at `v0.26.0`** (plugin 0.26.0; it was `v0.18.0`). Its Stop hook records and asks about
  what a turn changed, not what the working tree already held: files untracked before the session never count, and
  the `why` is asked only for tracked content, once per record, with the session's next prompt (a new
  `UserPromptSubmit` hook) instead of a Stop notice. The hook parses its payload once instead of starting Python
  four times per turn (PC-05, audit F12). The tag's plugin version and the release version are the same, so
  `family.json` still declares no `refVersions` (PC-04).

## 0.2.15 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.38.0`** (it was `v0.37.1`): a quieter session start. No Fabric-service count
  in every session; the Fabric-down line only in a project that uses Fabric, telling the agent to skip
  `fabric_whoami`; nothing on compact or resume; the dashboard-kit notice only in a repository that owns the service,
  as an upgrade the agent may make itself.

## 0.2.14 - 2026-10-20

### Changed

- **Fabric Agent Adapter is pinned at `v0.37.1`** (it was `v0.37.0`): the nearby pairing of a new machine by a
  six-digit code and the hub's single use of an enroll token in both kits, and notes for agents that register a remote
  service.

## 0.2.13 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.37.0`** (it was `v0.36.0`). Its `creating-fabric-agents` skill now carries
  how to build agents that run in a personal or an organization's cloud, choose models per lane with OpenRouter keys,
  orchestrate their work and learn from failures, with the practices production agents taught us.

## 0.2.12 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.36.0`** (it was `v0.35.4`), on Fabric Agent Contract `0704218`. Its kits tell a
  caller when a provider limit stopped or paused a job and when an effect may have happened unseen (DEC-0087), check
  share grants into an organization (DEC-0086) and the estate ceremonies' record rules and enroll tokens (DEC-0084). A
  partner's setup for a company is documented as an org skill set that requires its agents.

## 0.2.11 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.4`** (it was `v0.35.3`). Its session hooks rejoin a Fabric session at most
  once a minute, so many agent sessions on one machine no longer spend Fabric's shared request budget on every turn;
  the resilience reference follows the contract's job limit codes (DEC-0087).

## 0.2.10 - 2026-10-19

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.3`** (it was `v0.35.2`). `creating-fabric-agents` asks in its grill
  whether a new agent writes text people read, and if so gives it the no-em-dash rule (U+2014) in its prompt and a
  test that fails on it; the resilience reference gains its third pass.

## 0.2.9 - 2026-10-18

### Changed

- **Fabric Agent Adapter is pinned at `v0.35.2`** (it was `v0.35.0`). 0.35.1 names the Codex hook groups a removal
  moves, stops the tests and the session hooks' spool from accumulating files, adds the `creating-fabric-agents`
  resilience-and-autonomy reference and fixes the Hermes adapter losing a helper's answer; 0.35.2 extends the reference.

## 0.2.8 - 2026-10-16

### Changed

- Fabric Agent Adapter is pinned at `v0.35.0` (previously `v0.34.1`), carrying
  host-specific session hooks and their installation and verification tools.
  See the [adapter release](https://github.com/passioncode-ai/fabric-agent-adapter/releases/tag/v0.35.0)
  for supported hosts and activation requirements.

## 0.2.7 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.34.1`** (it was `v0.34.0`). v0.34.1 makes its profile and route rules
  answer as the contract does on any JSON — strict comparisons, values shown as JavaScript writes them, numbers as
  doubles — and the doctor's model check never raises (FAA-47).

## 0.2.6 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.34.0`** (it was `v0.33.0`). v0.34.0 pins the contract at `d8146cf` and
  keeps a lane that reads what members, clients or the public send on an open-vendor model (DEC-0083, FAC-SEM-112):
  its profile kits check the route and the models a project's policy leaves, `open-vendor` admits and excludes
  nothing, and `creating-fabric-agents` asks which lanes read user content.

## 0.2.5 - 2026-10-15

### Changed

- **Fabric Agent Adapter is pinned at `v0.33.0`** (it was `v0.32.1`). v0.33.0 pins the contract at `82e1636` and
  reads contexts in its estate kits (DEC-0082): one agent placed on a machine for the person and for each organization
  it serves, an organization's instance under a share grant of its context, and every estate rule total on hostile
  JSON. It also fixes a flaky board test (FAA-43).

## 0.2.4 - 2026-10-14

### Changed

- **Fabric Agent Adapter is pinned at `v0.32.1`** (it was `v0.32.0`). v0.32.1 makes the
  `building-fabric-services` lifecycle reference the rule its public readers follow: it states the lifecycle
  itself (the supervisor owns the process, the descriptor, readiness) and links only public sources, where it used
  to defer to the organization's private lifecycle contract (release iteration 1, N-12).
- 0.2.3 was not published on its own; this release carries its changes below.

## 0.2.3 - 2026-10-14

### Changed

- **The session-start line names Fabric principles 10 and 11.** In a passioncode-ai repository the
  line now also says to work by principle 10, a free agent takes the next task (a wait goes on a
  watcher, stop only at a human gate), and principle 11, a project moves in releases and every run
  leaves a lesson the next one reads, each with its anchor in the knowledge base's `principles.md`.
  The knowledge base's rules §4 relies on this line to reach every session, so an `AGENTS.md` need
  not restate the rule (`test/repo-rules.test.js`).
- **`working-in-passioncode` §4 carries both principles** in two bullets with their links, and a
  new scenario eval (`a-wait-is-not-a-stop`) holds the behaviour.
- **README: "With the ssheleg family"** — what the public sshlg-skills family is, how it relates to
  this set (routers, the method, what each side adds, one channel per plugin id) and the two update
  commands.

## 0.2.2 - 2026-10-14

### Changed

- **Fabric Agent Adapter is pinned at `v0.32.0`** (it was `v0.30.0`).
  - v0.31.0 added packing, signing and verifying an agent as a `fabric-package/1` folder, in both service kits and from
    the command line (`npx @passioncode-ai/fabric-agent-adapter pack|sign|verify`). This is the adapter's part of the
    RM-28 pilot.
  - v0.31.1 lets this launcher vendor the kit.
  - v0.32.0 pins contract `1636fa9`: a board responder now waits under an operator's hold, never treating it as an
    outage, and reads the estate owner's settlement.

## 0.2.1 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.30.0`** (it was `v0.29.0`). The Node service kit now installs and uninstalls a launchd job the way the Python kit does: `launchdPlist`, `launchdInstall` and `launchdUninstall`. A service's plist comes out the same from either kit. The service probe (`check_service.py`) gains a rule, `lifecycle.supervisor-marker`: it fails a launchd job whose plist does not tell the service that launchd supervises it. Without that marker, a second copy that finds the lock held exits at once and launchd restarts it every few seconds.

## 0.2.0 - 2026-10-13

### Added

- **`setup` (alias `onboard`): one command for a new computer and for one that is already set up.**
  It checks everything first, then installs the PassionCode.ai apps that are missing (Fabric
  Switchboard, Fabric Dashboards, Project Observatory, Fabric Inbox, and Fabric as an early
  preview when Docker and the Supabase CLI are present), installs the skills, registers every
  app's MCP server for every coding agent present, repairs what is wrong, checks again and prints
  a before → after table with one list of the steps that stay yours. On a healthy computer it
  changes nothing and exits 0. In a terminal it asks one question per app; `--yes`, `--with`,
  `--without`, `--no-apps`, `--no-open`, `--dry-run` and `--json` serve agents and scripts.
- **No unverified byte is installed.** Each release's `SHA256SUMS.asc` is verified against the
  PassionCode.ai release key bundled in the package (pinned by fingerprint, no gpg needed); the
  download must match the signed checksum and GitHub's digest; the app must pass `codesign`,
  carry team `KJ35UYYL22`, have its notarization ticket stapled and pass Gatekeeper. An outdated
  or damaged app is reinstalled only when it is not running, and the old one goes to the Trash.
- **`doctor`: a read-only check of the whole setup** — prerequisites, the skill set, each app's
  version, signature and team, each agent's MCP entries with one real proving call per server,
  and the family's Fabric services. Every line names its state and its fix; exit 0 means no check
  failed. `doctor --fix` runs setup's repairs without installing new apps.
- **`update` registers Fabric Switchboard's MCP server (`switchboard mcp`)** next to Fabric
  Dashboards', under the same never-clobber, reversible rules; an entry counts as the same only
  with the same command and arguments. **`setup` also registers Fabric's (`fabric-mcp --runner
  <agent>`)**: an early preview, it is never added by a background update (ADR-0004).
- **Safer installs and removals**: an app is copied beside its target and swapped in with two
  renames, after a second check that nothing runs from it; uninstall keeps a Codex entry that
  gained settings since it was written; a dry run copies no config file.
- **The `setting-up-passioncode` skill**: "set me up" or "check my setup" makes any coding agent
  run setup or doctor, finish the steps an agent may take and hand you only sign-ins, consents
  and secrets typed into a product's own hidden prompt. The README and passioncode.ai/start/
  carry a one-paragraph prompt to paste into Claude Code or Codex.
- **Session start names the problems of the last setup check** while it has any; it never runs
  the check itself.

## 0.1.53 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.29.0`** (it was `v0.28.0`). The update teaches `working-with-fabric` a new rule: a lane, subagent or session that stops on a usage or session limit is restarted at once, from where it stopped, instead of waiting for the stated reset. It backs off 2, 5, 10, then 15 minutes only if the restart stops again, and spend or billing limits stay the operator's. The rule comes from fabric-workspace principle 10, item 6.

## 0.1.52 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.28.0`** (it was `v0.27.0`). Fabric Agent Adapter 0.28.0 (FAA-12b, FAA-40) gives the service kits a client for Fabric's project board, so a service can answer requests other projects send it. The kits also check a project directory page before they look a project up. The adapter now pins contract f00a768.

## 0.1.51 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.27.0`** (it was `v0.26.0`). Fabric Agent Adapter 0.27.0 (FAA-33) adds three things to the service kits:
  - a service can report its model spend by the project it ran each call for;
  - its usage report is checked against the contract's window of the last 31 days;
  - a product can credit its own OpenRouter traffic to itself. This is off by default, and a user's own attribution is never overwritten.

## 0.1.50 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.26.0`** (it was `v0.25.0`). Fabric Agent Adapter 0.26.0 (FAA-35, FAA-37): a service's feed events can carry machine-readable data next to their sentence. That data is refused if it holds a credential. A service can also list the protocol revisions it accepts, and refuses any other revision with `schema-unsupported`. The contract pin stays a046f57.

## 0.1.49 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.25.0`** (it was `v0.24.0`). Fabric Agent Adapter 0.25.0 (FAA-39): both service kits treat two spellings of one identifier as the same identifier, by its normal form (contract DEC-0076). This covers routes, bindings, route events, estate share grants and their revocations, and a provider entry's provider id. The kits also write the identifiers they create in that normal form. The adapter now pins contract a046f57.

## 0.1.48 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.24.0`** (it was `v0.23.0`). Fabric Agent Adapter 0.24.0 (FAA-34) lets both service kits read and write three new kinds of service descriptor:
  - an app's own descriptor, for a desktop app a person starts: installed, never running, with no port;
  - a service Project Observatory's node supervises;
  - a service offered to others.

  The kits now say who installed a service by role, never by name, and how its model calls sign in, as a kind and never a credential. A host refuses a request above an offered service's highest data class. Fabric's button shows only while Fabric itself is installed. The contract pin stays `fe55fc6`.

## 0.1.47 - 2026-10-13

### Changed

- **Fabric Agent Adapter is pinned at `v0.23.0`** (it was `v0.21.0`). It brings two adapter releases.
  - **0.22.0 (FAA-12a)** adds the fourth skill, `working-with-fabric`, with the plugin's session hooks. A coding agent opened in a terminal can then work in a project through Fabric's project board.
  - **0.23.0 (FAA-32)** moves the adapter's contract pin to `fe55fc6`:
    - a service's supervisor can mark itself with an argument as well as the environment. The Task Scheduler and Project Observatory's node are now recognised, and markers that disagree stop the service before it takes its lock;
    - a delegation key the estate record certifies follows the contract's verdict and refusal codes;
    - an estate record may be issued up to 60 s ahead of the clock, and its passkey must sign under a `sign.<domain>` RP;
    - Windows token files are checked against the contract's reader rule.

## 0.1.46 - 2026-10-12

### Added

- **`update` registers the Fabric Dashboards MCP server for every agent that is present**
  (`fabric-dashboards`, stdio, the app bundle's `bin/fabric-dashboards-mcp`): Claude Code
  through `claude mcp add --scope user`, Codex CLI as a `["mcp_servers"."fabric-dashboards"]`
  table appended to `~/.codex/config.toml`, Gemini CLI and Kimi Code in the `mcpServers` of
  `~/.gemini/settings.json` and `$KIMI_CODE_HOME/mcp.json`. A machine without the app skips
  the step; an entry that already points at the same command is left alone, and one that
  points elsewhere, or is declared in a form the launcher does not edit, is reported and
  kept. Each registration is journalled before the file changes and removed again by
  `restore` and `uninstall` only while it is still exactly what the launcher wrote
  ([ADR-0003](docs/adr/0003-fabric-dashboards-mcp-registration.md)).

## 0.1.45 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.21.0`** (it was `v0.20.0`). Fabric Agent Adapter 0.21.0 (FAA-31): both service kits verify the operator's signed estate record (estate-record/1, contract DEC-0055) — the chain of revisions, the passkey's WebAuthn assertion checked offline, the 30-day window and the record's rules — and a delegation gate given the current record trusts a token's key only while that record certifies it. The adapter now pins contract b291bf0.

## 0.1.44 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.20.0`** (it was `v0.19.0`). Fabric Agent Adapter 0.20.0 (FAA-11): runner routes in both service kits — the doctor reports each runner's state with the contract's closed probe results (not-installed, not-responding, not-connected), and a service checks a runner route, the bundle a host pins and every route event against FAC-SEM-028…034, answering the contract's own rules.

## 0.1.43 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.19.0`** (it was `v0.18.0`). Fabric Agent Adapter 0.19.0 (FAA-13): both service kits keep settings backups of what the operator decided — outside the data directory, byte-identical between the kits, restored only into a fresh database and never over a row — list every spending limit a service applies in its usage report, and send the service token in the header the descriptor declares.

## 0.1.42 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.18.0`** (it was `v0.17.0`). Fabric Agent Adapter 0.18.0 (FAA-21): both service kits write and install the Linux and Windows supervisors — a systemd user unit and a per-user Scheduled Task, byte-identical between the kits, never carrying a secret, an upgrade restarting what runs while the operator's off stays off. The Node kit runs on Windows: the folders, descriptor validation at parity with Python, the token file's protected ACL and a named-pipe instance lock; the two kits now exclude each other on every system and the conformance probe sees a Node service's lock.

## 0.1.41 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.17.0`** (it was `v0.16.0`). The organisation's lifecycle rules LC-19 and LC-21 are now enforced by the adapter's checks. No plugin may start a stdio MCP server in every session, and no credential may appear in argv or a URL query. The checks are in adapt_project.py check, fabric_provider.py and the adapter's own validate gate.

## 0.1.40 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.16.0`** (it was `v0.15.0`). Runner and model profiles in both kits (contract DEC-0046). The kit resolves the model profile in the contract's order within the project's model classes and declares what applies in the well-known configuration, with Runner and Model tiles. It checks the runner and model in the doctor and records the route on usage. The contract's credential detector is ported.

## 0.1.39 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.15.0`** (it was `v0.14.0`). The dashboard kit ships Fabric's button (contract DEC-0040, FB-7). It is one floating menu button that opens Fabric on the service, with links built from the contract's grammar. It hides itself when the host draws its own and says how to get Fabric when Fabric is absent. Dashboard kit 1.1.0.

## 0.1.38 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.14.0`** (it was `v0.13.0`). The kit's contract pin now includes DEC-0046
  (runner and model profiles) and CT-31: a delegation token without an actor chain is refused, never thrown. The
  contract pin is `0cacd08`.

## 0.1.37 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.13.0`** (it was `v0.12.0`). The scaffolder now requires every capability's
  effect class (`--effect`) and never defaults it. It writes the capability's idempotency and the manifest's cost
  presets (`--cost-preset`, DEC-0037), which are fixed options a launcher offers when a run's cost varies.

## 0.1.36 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.12.0`** (it was `v0.11.1`). The kit follows Fabric Agent Contract up to
  DEC-0045. The delegation verifiers are sealed as the contract specifies: the trusted issuer is required, a
  small-order key is refused as the issuer's fault, and claims are typed strictly. The operator's own machines need no
  token (trust tiers). The canonical JSON vectors are shared with the contract, and a provider entry may say where its
  stdio server starts (never once per session). The contract pin is `2eb91c0`.

## 0.1.35 - 2026-10-12

### Changed

- **Fabric Agent Adapter is pinned at `v0.11.1`** (it was `v0.10.0`). A service built with the kit can now check a
  delegation token and an operator's approval offline, in Python and Node, with the same answers as the Fabric Agent
  Contract's own verifier (DEC-0039). It can put a gate in front of its MCP tools, so each call names the person it
  is for, the calling agent and the chain, and an approval is used once. The Node kit refuses small-order Ed25519
  keys itself (Node 20 and 22 accepted a forged signature under one). The contract pin is unchanged at `8e49fbd`.

## 0.1.34 - 2026-10-11

### Changed

- **Fabric Agent Adapter is pinned at `v0.10.0`** (it was `v0.9.0`). A security fix from Fabric Agent Contract
  DEC-0039: a service built with the kit now ends an operator's dashboard session on the server. A session
  ends 12 h after it was last used, 7 days after sign-in, on logout, or when the service token rotates.
  Before, it lasted as long as a 30-day cookie, and the server checked only its signature. Operators sign in once more after a
  service upgrades; the host does it on the page's 401. The conformance probe treats `surfaces.mcp.auth:
  "delegation"` like `own` (DL-16) and checks the session cookie's lifetime. The default contract pin moves to
  `8e49fbd`; bundles issued under the earlier revisions stay valid.

## 0.1.33 - 2026-10-11

### Changed

- **Fabric Agent Adapter is pinned at `v0.9.0`** (it was `v0.8.3`). `building-fabric-services` ships the dashboard
  kit for `fabric-dashboard/0.1` (Fabric Agent Contract DEC-0036): one stylesheet and one script that keep a
  service's dashboard usable from 360 CSS px inside a host pane beside the agent console, seven WCAG AA themes in
  light and dark that follow the host's `fabric_appearance` cookie, `dashboard_kit.py`, the layout probe
  `check_dashboard_layout.mjs` and the probe rule `dashboard.declared`. The adapter plugin gains its first hook:
  at session start it prints one line in a repository whose dashboard has no kit or an older one, and nothing
  elsewhere. The default contract pin moves to `a83bec6`; bundles issued under the earlier revisions stay valid.

## 0.1.32 - 2026-10-10

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.3`** (it was `v0.8.1`). Its default contract pin moves to Fabric
  Agent Contract `main` `52da526` (DEC-0032 through DEC-0035). `creating-fabric-agents` and
  `adapting-projects-to-fabric` now propose an agent's own operator channel (`fabric-operator-channel/0.1`, rule
  OC-11) once, when the agent has human stops or `notify: true` events: they list the operator's steps, record
  the answer (`accepted`, `declined` or `later`) and never create a bot, store a token or enable the channel
  themselves. For a channel bound in a group shared with other bots they name rules OC-14 through OC-17 (silent
  unless addressed; a bare `/command` is not addressed). The Python service kit runs on Windows and Linux
  (`systemd` and `task-scheduler` managers, Windows paths and token files). Bundles issued under the earlier
  contract revisions stay valid.

## 0.1.31 - 2026-10-08

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.1`** (it was `v0.8.0`). Its default contract pin moves to Fabric
  Agent Contract `main` `623bf61` (DEC-0025 through DEC-0031: settings backups, runner routes, spending limits,
  activity telemetry, devices — optional surfaces the kits do not emit yet), and `Mcp-Name` values outside plain
  ASCII use the MCP 2026-07-28 Base64 sentinel. Bundles issued under the earlier contract revisions stay valid.

## 0.1.30 - 2026-10-07

### Changed

- **Fabric Agent Adapter is pinned at `v0.8.0`** (it was `v0.6.3`). Its service kit meets the
  organization's lifecycle contract (0.7.0: a launchd install respects an operator's disable, an
  `ExitTimeOut` default), agents can report what they spend (`make_usage_receipt`, `usage_report`,
  Fabric Agent Contract DEC-0021), and a service may keep its MCP credential apart from the host's
  token (DEC-0024). Bundles issued under the earlier contract revisions stay valid.
- **Observatory Log is pinned at `v0.18.0`** (plugin 0.18.0; it was `v0.17.3`), the Project
  Observatory 0.18.0 skills. That release installs only updates whose `SHA256SUMS` is signed by
  the organization's release key, so the hook's daily update of an older engine now refuses an
  unsigned or foreign-signed release instead of installing it.

## 0.1.29 - 2026-10-05

### Changed

- **Observatory Log is pinned at `v0.17.3`** (plugin 0.17.3; it was `v0.16.0`). Its
  SessionStart hook keeps Project Observatory current:
  - for an engine at 0.17.0 or later, it schedules the engine's hourly maintenance job where
    it is missing;
  - for an engine from 0.7.0 to 0.16.0, which has no updater of its own, it installs the newer
    release once a day with that engine's `full update --apply`, unless the person turned
    automatic updates off.

  Both run detached, at most every six hours or once a day, and never hold up a session.

## 0.1.28 - 2026-10-05

The launcher meets the organization's
[product lifecycle contract](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/lifecycle.md):
findings F13, F14, F15 and F17 of the 2026-10-03 lifecycle audit. Observatory Log moves to
Project Observatory 0.16.0.

### Changed

- **Observatory Log is pinned at `v0.16.0`** (plugin 0.16.0; it was `v0.15.0`, plugin 0.15.0),
  the Project Observatory 0.16.0 skills. The skills' text is unchanged and follows the release:
  agent memory now checks an access binding on every call, embeds remotely only with the
  operator's per-project consent, and can be erased with a receipt (`full forget`).

### Fixed

- **One update at a time (LC-03, F14).** `update`, `restore` and `uninstall` take
  `~/.passioncode/update.lock`; a second one refuses with exit 1 and names the holder, so a
  background update and a manual one no longer interleave their `claude plugin` writes.
- **One `npm view` for sessions started together (F13).** The SessionStart hook claims
  `~/.passioncode/probe.pending` before it starts the probe; the probe removes it after recording,
  and a marker older than five minutes is taken over.
- **Releases no longer accumulate (LC-11, LC-15, F15).** An update keeps the release it installed
  and the one it replaced, and removes older releases and partial copies left by a killed update
  (`prune` step; a dry run plans it).
- **A release proves its provenance (F17).** `vendor --release` refuses a member whose tag does not
  name the plugin version it carries. A member whose repository's tags version another product
  may declare `refVersions: "repository"` with the plugin `version` it expects; the bytes at that
  tag must carry that version, and the manifest records `refVersions` so the pair reads as the
  repository's release, not the plugin's. No member declares it yet: at the current pins every tag
  names its plugin version (Observatory Log `v0.16.0` carries 0.16.0), and whether Observatory Log
  should use it when the two diverge again is the open operator decision PC-04.
- `AGENTS.md` gains a `## Lifecycle` section: the background footprint with the SessionStart
  hook's cost and cadence (LC-09) and build retention (LC-15).

## 0.1.27 - 2026-10-04

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.3`** (it was `v0.6.2`). `building-fabric-services`
  and `creating-fabric-agents` say that every credential an agent or service uses comes from
  Project Observatory, by name: `use_secret.py run --vault-only` for an agent, `use_secret.py
  serve` for a long-running service, never a `.env` or a key file beside it.

## 0.1.26 - 2026-10-04

### Changed

- **Observatory Log is pinned at `v0.15.0`** (plugin 0.15.0; it was `v0.13.0`, plugin 0.14.0),
  the Project Observatory 0.15.0 skills. `handling-secrets` gains the header door: `use_secret.py
  header` hands one HTTP MCP server's bearer to Claude Code's `headersHelper`, from the vault only
  and only to the server the slot is bound to with `vault.py bind --header-for`. Agents and
  services take every credential from Observatory by name (`use_secret.py run --vault-only`).

## 0.1.25 - 2026-10-03

### Changed

- **`working-in-passioncode` follows the amended release-approval rule** (knowledge rules §11,
  operator decision 2026-10-03): any member of `release-approvers` may approve a release run,
  including the person who pushed the tag. Unchanged: approval is a person's act and an agent
  never approves a release run, signing happens only in CI, admins cannot bypass, `v*` tags
  only, and a published release is never rewritten.

## 0.1.24 - 2026-10-03

### Changed

- **`working-in-passioncode` carries the release-signing rule** (knowledge rules §11):
  - a published build is signed only in CI, in the repository's `release` environment, through
    `passioncode-ai/.github@v1`;
  - it is approved by `release-approvers` but not by the tag's author;
  - no release key lives on a laptop;
  - an agent never approves a release it started;
  - a published release is never rewritten.

  The engine line now names its CI release.

## 0.1.23 - 2026-10-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.2`** (it was `v0.6.1`). `building-fabric-services`
  now says how a product behaves under a host lifecycle broker — the always-on per-user service
  agents ask to start, stop and restart products: quit through both the platform's quit and
  `SIGTERM`, stay in the background when opened non-activating, keep the designated requirement
  stable, expose honest readiness.

## 0.1.22 - 2026-10-03

### Changed

- **Observatory Log is pinned at `v0.13.0`** (plugin 0.14.0; it was `v0.10.0`, plugin 0.13.0),
  the Project Observatory 0.13.0 hook and skills. The hook and the skills hand over the installed
  engine's commands (`project-observatory full findings`, `full doctor`) instead of source-tree
  paths, and the skills' own check runs under the interpreter `full agent install` records. In
  `handling-secrets`, a vault `PROJECT` is the project's folder name and its registry id resolves to
  the same folder. `use_secret.py run` takes `--env`, and `vault.py remove` deletes a slot or only
  its retired archives.

## 0.1.21 - 2026-10-03

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.1`:** `check_service.py` no longer fails an online
  service hosted behind a platform router. Heroku, Fly, Render and CDNs answer a foreign `Host`
  themselves (`404`/`421`), and that now counts as the refusal it is, unless the body is the
  well-known document.

## 0.1.20 - 2026-10-02

### Changed

- **Fabric Agent Adapter is pinned at `v0.6.0`:** `building-fabric-services` also makes an online
  agent or dashboard (an `https` origin on a platform) a Fabric service — the remote placement of
  `fabric-service/0.1`, Fabric Agent Contract DEC-0019 — with Node and Python kits, a TLS sample
  online service and a probe that checks remote services over verified TLS.

## 0.1.19 - 2026-10-02

### Changed

- `working-in-passioncode`: contributions are accepted under `CLA.md` by opening a pull request;
  a PR template never carries a CLA checkbox. `CLA.md` is the knowledge-base template changed the
  same day ("ticking the CLA box" is gone), and the publishing reference asks for one sentence in
  the PR template instead of a box.

## 0.1.18 - 2026-10-01

### Changed

- Pin Fabric Agent Adapter v0.5.7: services are scheduled as standard processes (`ProcessType
  Standard`; the probe's `lifecycle.priority` rule fails `Background`), `notify: true` is reserved
  for a decision, a failure or a blocking warning once per episode, a service raises no banners of
  its own, and a preview instance is uninstalled once checked
  ([adapter changelog](https://github.com/passioncode-ai/fabric-agent-adapter/blob/v0.5.7/CHANGELOG.md)).

## 0.1.17 - 2026-10-01

### Changed

- Pin Fabric Agent Adapter v0.5.6 so the installed set carries its dashboard deep-link procedure and portable handoff checker. The Observatory Log and working-in-passioncode members keep their existing behavior.
- Dashboard routing evidence belongs to the [adapter handoff](https://github.com/passioncode-ai/fabric-agent-adapter/blob/v0.5.6/docs/handoffs/2026-10-01-dashboard-links.md); the launcher installs these bytes through its existing plugin and agents-hub channels.

## 0.1.16 - 2026-10-01

### Fixed

- The packed lifecycle release check accepts both npm 11’s array and npm 12’s
  package-name-keyed JSON output, and rejects ambiguous or malformed pack results.
- The update probe accepts npm 12’s singleton metadata array while preserving
  publisher checks and rejecting ambiguous or malformed responses.
- The 0.1.15 tag and GitHub release remain historical: its release workflow stopped
  at this check before npm publication. Version 0.1.16 includes the fixes and shared
  backlog instructions described below.

## 0.1.15 - 2026-10-01

### Fixed

- Restore and uninstall preserve recoverable state, reject unsupported options before changes,
  and report failed filesystem or plugin operations truthfully. Updates reject inconsistent
  payloads and stop dependent work after a failed release or marketplace step.
- Status reports the installed release correctly and retains concurrent probe/configuration
  updates. Self-update checks reject untrusted or incomplete npm publisher metadata and
  recover from failed spawns and future timestamps.
- Node 18 test discovery, release-tag validation and the packed lifecycle smoke now guard
  the release path. The launcher audit records the regression evidence.

### Changed

- The repository skill and SessionStart reminder direct agents to canonical local backlog
  sources and the derived workspace backlog, with one owner per task and source-commit checks.
- Developer documentation now states the CLI, recovery and self-update contracts and checks
  their local references. Tagged Fabric Agent Adapter 0.5.5 and Observatory Log 0.13.0 stay
  in the family; this release does not add a new family member.

## 0.1.14 - 2026-10-01

### Changed

- Fabric Agent Adapter 0.5.5 in the set (`family.json` pins `v0.5.5`, was `v0.5.4`): its shipped
  docs no longer call the public Fabric Agent Contract private; no behaviour changes.
- Observatory Log 0.13.0 in the set (`family.json` pins Project Observatory `v0.10.0`, was
  `v0.8.2`, which shipped plugin 0.12.3): the plugin's licence metadata is `AGPL-3.0-only OR
  LicenseRef-PassionCode-Commercial`, and `handling-secrets` documents the new Cloudflare presets.
- The README, `--help`, `family.json` and `package.json` descriptions say what is true: the
  launcher installs the set listed in `family.json`, not every PassionCode.ai skill and plugin.

## 0.1.13 - 2026-10-01

### Changed

- Fabric Agent Adapter 0.5.4 in the set (`family.json` pins `v0.5.4`, was `v0.5.3`): the adapter pins
  the public Fabric Agent Contract, re-created with one clean history; no behaviour changes.

## 0.1.12 - 2026-09-30

### Changed

- **License.** From this version the launcher is open source under the GNU AGPL-3.0, or
  available under a commercial license from PassionCode.ai (contact@passioncode.ai): SPDX
  `AGPL-3.0-only OR LicenseRef-PassionCode-Commercial` (Fabric ADR-0092) in `package.json`, the
  self plugin and the `working-in-passioncode` skill. `LICENSE` is the unmodified AGPL-3.0 text;
  `COMMERCIAL-LICENSE.md` is new; both, with `CLA.md`, are byte for byte the knowledge base
  templates and ship in the npm package (`test/license.test.js`). Versions v0.1.5 to v0.1.11 stay
  under PolyForm Noncommercial or Internal Use, and v0.1.4 and earlier under MIT.
- **The session-start line says the protocol** (Fabric ADR-0093): in a passioncode-ai repository
  it now sends the agent to the knowledge base (`fabric-workspace/knowledge/` or
  https://wiki.passioncode.ai/knowledge), then the repository's `AGENTS.md`, before the first
  edit, and asks it to update the knowledge base page that owns any cross-repository fact it
  changed after the work.
- **`working-in-passioncode`** names the knowledge base as the source of truth (org-index keeps the
  map, onboarding and the checks), opens with the before/after protocol, states the new licence
  and the repository standard (`check_format.py`), and its completion report names the knowledge
  base page updated. `references/publishing.md` lists the licence files as templates copied byte
  for byte. Evals: the licence scenario rewritten, one protocol scenario, two trigger queries.
- Fabric Agent Adapter 0.5.3 in the set (`family.json` pins `v0.5.3`, was `v0.5.2`): the same
  licence, and its skills send a PassionCode.ai repository to the repository standard.
- README and AGENTS.md follow the repository standard: `# PassionCode.ai launcher`, the
  knowledge base *Read first* block and *After work*.

## 0.1.11 - 2026-09-30

### Fixed

- Fabric Agent Adapter 0.5.2 in the set (`family.json` pins `v0.5.2`, was `v0.5.1`): services built on its
  kits answer the MCP `initialize` handshake, so a real client such as Claude Code connects (0.5.0
  and 0.5.1 did not), and every tool's `outputSchema` has an object root (contract DEC-0018).

## 0.1.10 - 2026-09-30

### Changed

- Fabric Agent Adapter 0.5.1 in the set (`family.json` pins `v0.5.1`, was `v0.5.0`): the kits follow the
  contract rulings of DEC-0017 — full result envelope with its trace for jobs, a job tool's
  `outputSchema` as the union of envelope and handle, `providers/` entries carrying `providerId`.

## 0.1.9 - 2026-09-30

### Changed

- Fabric Agent Adapter 0.5.0 in the set (`family.json` pins `v0.5.0`, was `v0.4.3`); Observatory
  Log stays at Observatory `v0.8.2`, still its latest tag.

### Fixed

- The CLI help, `README.md` and `SECURITY.md` told people to run `npx passioncode <command>`.
  No unscoped `passioncode` package exists on npm (`npm view passioncode` → E404), so those
  commands failed on any machine without a local install, and a squatted name would have run
  someone else's code. They now name `npx @passioncode-ai/passioncode@latest <command>`.
- `README.md` gains a quick start for a new teammate: install, configure, MCP, develop.

## 0.1.8 - 2026-09-29

### Added

- **Read the rules first.** In a passioncode-ai repository the session-start hook now prints one
  line sending the agent to the repository's `AGENTS.md` and the organization's `CONTRIBUTING.md`
  before its first edit; anywhere else it prints nothing, and a missing or slow git prints
  nothing (`hooks/repo-rules.js`).
- `working-in-passioncode` carries the names of Fabric ADR-0090 and the code region marker rule.

## 0.1.7 - 2026-09-29

- Observatory Log 0.12.3 (Observatory v0.8.2) in the set: source-available license and PassionCode.ai metadata; no behaviour change.

## 0.1.6 - 2026-09-29

### Fixed

- **A version published from GitHub is trusted.** npm records a trusted-publishing (OIDC)
  release as `GitHub Actions <npm-oidc-no-reply@github.com>`; the hook read that as an
  unreadable account and would have refused every release the workflow publishes. It is now
  recognised by its email as `github-actions-oidc`, which `trust.json` lists; a look-alike
  name with another email is not. Maintainers are still checked one by one.
- `vendor.mjs` reads `PASSIONCODE_VENDOR_CLONE` and `PASSIONCODE_GIT_BASE` from the
  environment it is given, so a CI step's clone mode no longer leaks into the tests.
- The release job waits up to 10 minutes for npm to serve a new version (5 was too short).

0.1.5 was tagged but its release job failed on the leak above; it was never published.

## 0.1.5 - 2026-09-29

### Added

- `working-in-passioncode`, a skill in the self plugin: the organisation's working rules —
  the org map, landing, nightly CI and why a blocked run is not green, handoffs,
  decisions, ids and leases, secrets, licensing, the privacy gate, releases and pins —
  reach every contributor's agent instead of living only in org-index. It points to
  org-index as the source of truth; detail is in its `references/releasing.md` and
  `references/publishing.md`. Trigger and scenario evals are in
  `test/evals/working-in-passioncode/`; `test/skill.test.js` holds every self-plugin skill
  to the Agent Skills standard (strict front matter, description budget, references
  linked, no home paths). The hub links it like any member's skill (`status` showed
  `passioncode hub: 0/0` because the self plugin had no skill).
- Fabric Agent Adapter 0.4.3: source-available license, one contract pin (`a5a2709`),
  neutral examples, and hand-offs to the neighbouring agent-stack and make-skill skills.

### Changed

- **License.** The launcher is source-available under
  `PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0`, with a
  commercial license on request (contact@passioncode.ai). Versions up to and including
  v0.1.4 were released under MIT and remain available under it. Contributions come in
  under `CLA.md` (new `CONTRIBUTING.md` and PR template). The payload's marketplace
  lists each member under its own manifest's license instead of a hard-coded `MIT`.
- `family.json` names no machine paths. Members are cloned from their repositories at
  their tags; a maintainer's local clones are an environment override:
  `PASSIONCODE_CHECKOUT_ROOT=<dir>` reads `<dir>/<repository name>`, and
  `PASSIONCODE_CHECKOUT_<MEMBER>=<path>` names one clone kept under another name. A
  `checkout` key in `family.json` is refused.

### Fixed

- `passioncode status` described the payload beside the CLI — from a checkout, whatever
  was last vendored there — instead of what is installed. It now reads the release
  `~/.passioncode/current` points at, reports the payload version separately as
  `package`, and says which it described (`source`).

## 0.1.4 - 2026-09-29

### Security

- The package is `@passioncode-ai/passioncode`, in the npm organisation that PassionCode.ai
  owns. The bare name `passioncode` was unclaimed, so whoever registered it would have been
  what the self-update checks. The hook now watches the scoped name, and `trust.json` names
  the organisation's publisher.

### Changed

- Install and update with `npx @passioncode-ai/passioncode@latest update`.
- A `v*` tag releases and publishes from GitHub Actions (`.github/workflows/release.yml`),
  the same pipeline as the adapter.

## 0.1.3 - 2026-09-29

- Observatory Log 0.12.2 (Observatory 0.8.1): the engine's `full agent` recognises the copy this
  launcher installs instead of adding a second one, and `tracking-resources` no longer triggers on
  creation requests.

### Security

- The session-start hook no longer runs whatever is published under the npm name
  `passioncode`. The name was unclaimed (`npm view passioncode` answered E404), so
  whoever registered it would have had code run on every machine with the plugin. The
  daily probe now records the latest version together with its npm maintainers and
  publishing account (`npm view passioncode version maintainers _npmUser --json`); the
  hook updates only when every one of them is in `plugin/passioncode/trust.json`, and
  otherwise spawns nothing and names who published it. The list ships empty: until the
  maintainers add their npm account, nothing updates on its own.
- The update it runs is pinned — `npx --yes passioncode@<verified version> update` — so
  what was checked is what runs, not whatever `@latest` points at a moment later.

### Fixed

- A failed update check is shown once in the session-start line instead of never; the
  same error is not repeated every session.
- A background update is recorded (`updatingSince`) when it starts, so a second session
  start within ten minutes does not start a second one.
- The old single-member marketplaces (`fabric-agent-adapter`, `observatory-log`) are
  retired once the member's `@passioncode` plugin is verified and nothing else installed
  comes from them: the `extraKnownMarketplaces` entry leaves `~/.claude/settings.json`
  (backed up in the quarantine) and `claude plugin marketplace remove` unregisters it —
  otherwise Claude Code re-registered it, with autoUpdate, and installing from it would
  bring a second channel back. `passioncode restore` re-adds both. `status` names any
  that are left.
- Vendoring no longer needs the maintainer's own checkouts: a member whose `checkout`
  is absent is shallow-cloned from `repo` at `ref` over SSH (`--clone` or
  `PASSIONCODE_VENDOR_CLONE=1` forces it). The payload's marketplace entries carry
  `displayName` and `author`, and the `$schema` URLs are ones that resolve.

## 0.1.2 - 2026-09-29

- Fabric Agent Adapter 0.4.2: the kit's `LoopbackHTTPServer` binds without a reverse DNS
  lookup, a garbled pid file reads as unknown, and every SKILL.md front matter parses as
  strict YAML (0.4.1).

## 0.1.1 - 2026-09-29

- `update --dry-run` says the plan changed nothing instead of reporting it as done.
  0.1.0 was tagged but never published.

## 0.1.0 - 2026-09-28

- First release: Fabric Agent Adapter 0.4.0 and Observatory Log 0.12.1 as Claude Code
  plugins from one local marketplace, and through the `~/.agents/skills` hub for every
  other agent.
- Replaces the old single-member plugin installs, and moves shadowing
  `~/.claude/skills` entries and working-tree hub links into a restorable quarantine.
- Once-a-day update check at session start with a background update (`update.auto`).
