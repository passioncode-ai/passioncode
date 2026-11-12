# Security

Report vulnerabilities privately to contact@passioncode.ai. Do not open an issue that
carries credentials or a working exploit.

Claude Code's files in this document: every `~/.claude` path and `~/.claude.json` means the folder `CLAUDE_CONFIG_DIR`
names when it is set (its `.claude.json` inside it), as Claude Code itself reads them (PC-129). In a session Fabric
Switchboard launched, its home is that folder: settings, plugins and MCP servers then go to the person's own folder that
`SWITCHBOARD_CLAUDE_SOURCE_DIR` names (`~/.claude.json` when that folder is `~/.claude`), and with a Switchboard before
0.7.14, which names none, to `~/.claude`, because Switchboard rebuilds the home's settings at every launch (SB-259).

What `passioncode update` touches (setup and doctor: [below](#what-setup-and-doctor-touch); every command also the
[anonymous counts](#what-anonymous-counts-send) while they are on): `~/.passioncode/` (releases, state, quarantine,
logs); Claude Code's plugin registry through the `claude plugin` CLI only;
`~/.agents/skills/<member skill>` and `<agent channel>/<member skill>` links (junctions on Windows); and
`~/.claude/skills/<member skill>`, which it moves into the quarantine once the plugin
that replaces it is verified. For a member's old single-member marketplace
(`legacyMarketplaces` in `family.json`), once that plugin is verified and nothing else
installed comes from it, it also moves the `extraKnownMarketplaces` entry out of
`~/.claude/settings.json` (a copy of the file is kept in the quarantine; a file that is a link is written where it
points and keeps its permission bits, PC-120) and runs
`claude plugin marketplace remove <name>`. For each installed app with an MCP server in its
bundle (Fabric Dashboards, Fabric, Fabric Switchboard) it also registers that entry for every
agent that is present: through
`claude mcp add --scope user` for Claude Code (it never writes `~/.claude.json` itself),
and in `~/.codex/config.toml`, `~/.gemini/settings.json` and `~/.kimi-code/mcp.json`,
copying each existing file into the quarantine first (each of the three files, like `~/.claude/settings.json`, is
written where a link points and keeps its permission bits; a new one is private, mode 600 on macOS and Linux, PC-120 and PC-126); an entry that already exists is
left alone and reported. Displaced files are moved rather than
deleted: a recovery record is written before the move in
`~/.passioncode/quarantine/<run>/moved.json`. `restore` processes the latest batch,
checkpoints completed entries and refuses to overwrite a conflicting user replacement.
`uninstall` removes owned links/plugins and clears the active release (with nothing
installed the session hook installs nothing), and leaves the update switch as the person set it; it retains the current and previous release copies and recovery
records. Each update removes the launcher's own older releases (its output, reinstallable
from npm) and keeps the one it replaced for rollback. A failed removal
returns a nonzero exit code. See the [CLI recovery contract](docs/reference/cli.md).

## What `setup` and `doctor` touch

`doctor` reads: `~/.claude.json`, `~/.codex/config.toml`, `~/.gemini/settings.json`,
`~/.kimi-code/mcp.json` (entry names, commands and arguments; environment values are passed to
the server it starts and never printed), the Fabric service descriptors (never their token
files), the apps' `Info.plist` (on Windows, the apps' uninstall entries through `reg query` and their install folders),
the launcher's own `trains/<name>.json` and the `train` and `wiki` (the vault it made, PC-178) it saved in `~/.passioncode/state.json`,
Claude Code's `~/.claude/settings.json` (only its `permissions` rules, for the `sessions.on-demand` row; nothing in it is
printed or sent), and the GitHub releases API. It starts each registered stdio MCP
server for one proving call and stops it (never Fabric's, which enrols a session as it starts), and writes only `~/.passioncode/doctor.json` and a
release cache, apart from the anonymous counts below that every command sends while they are on (`~/.passioncode/analytics.json`,
its notice marker, the shared `PassionCode/installation.json` created once if absent, and one request to
`https://analytics.passioncode.ai`). For the agents' wiki memory (PC-178, [ADR-0006](docs/adr/0006-setup-installs-the-agents-wiki-memory.md))
it reads Obsidian's `Info.plist` and signature like an app's and the names of the `obsidian-<version>.asar` files in
`~/Library/Application Support/obsidian` (the version Obsidian updated itself to) and obsidian-wiki's config file (only
its vault path), runs `uv --version`, `uv tool list` (a copy counts as uv's only when uv lists it) and `brew --prefix`
(Homebrew counts only where this user can write its `bin`), and runs `obsidian-wiki --version`, `obsidian-wiki doctor
--json` and `obsidian-wiki hooks status --json`, which read the
person's obsidian-wiki config, vault and Claude Code hooks and change nothing; it reads the names of the bundled skills
in the obsidian-wiki package that command belongs to, and the entries with those names in obsidian-wiki's global skills
folders (the twelve under the home folder, `$HERMES_HOME/skills` and the Hermes profiles): whether each is a link and
where it points, and whether a folder holds `SKILL.md`, never their content; it reads whether `~/.claude/settings.json`
is a link and where it points, and whether the script a registered SessionStart command names is there; doctor prints only check names, states,
details and hints, never a page of the vault.

`setup --train <name>` (or `none`) also writes that name into `~/.passioncode/state.json`, and a vault setup made is
written there as `wiki` (its path and time, PC-178), the only vault whose missing SessionStart hook setup registers again; a train
changes which release is downloaded (the pinned tag instead of the latest), never how it is verified.
`setup` also downloads releases from GitHub into `~/.passioncode/downloads/` (removed after
each app), copies a verified app into the person's own `~/Applications` (made when absent; a copy in `/Applications` the
person owns and may replace stays there, another user's is never touched, PC-145, PC-146), moves an app it replaces
into `~/.Trash/`,
runs `update` (above), on the person's own yes (a terminal question, default no, or `--allow-tools`) merges
Claude Code's rules for PassionCode's own MCP tools (`mcp__fabric`, `mcp__fabric-dashboards`, `mcp__switchboard`,
`mcp__plugin_switchboard_switchboard`, `mcp__observatory`) into `permissions.allow` in `~/.claude/settings.json`,
keeping every other key and rule, and the file's permission bits and link, so Claude Code uses those
tools without asking (PC-117; `uninstall` leaves them, the person removes them; each rule allows every tool of the
server registered under its name, shell commands and other servers need rules of their own, and an `ask` or `deny`
rule or a managed policy still wins); on a yes of its own (a second question, or `--allow-commands`) it merges rules
for shell commands the same way: `Bash(gh pr merge:*)` and the rules an agent of the person's own
declares in `~/.passioncode/rules.d/` (who declared a rule is what its file says, not checked), refusing a declared rule that is not in a plain form and could allow more than it says (a path or wrapper
program, a quote, substitution, separator or redirection, a wildcard too early, any wildcard over a shell, an
interpreter or a program whose options run other code, and any wildcard over a program not installed in the person's
home folder; `docs/reference/cli.md` lists them, PC-119), records every rule it added in a private ledger when it can write it (the rules stand without it)
(`~/.passioncode/permissions.json`: the rule, who declared it, from where and when, PC-125), runs `launchctl kickstart gui/<uid>/<label>` for a family service whose
descriptor names launchd and that does not answer, and opens the apps it installed. For the agents' wiki memory
(PC-178) it installs Obsidian like an app, verified by its own chain (the image against GitHub's digest, then Developer
ID team `6JSW4SJWN9`, the stapled ticket and Gatekeeper: Obsidian publishes no signed checksums); runs
`uv tool install obsidian-wiki==<pin>` (or `--force` to bring an older copy uv lists up to the pin), which takes the
package from PyPI; asks `xcode-select -p` (on macOS, first, so no install dialog opens) and `git --version` before a vault
step; and, for a user with no obsidian-wiki config, makes the vault folder (`~/Documents/Wiki` or
`--wiki-vault`, never one that holds files), runs `git init -b main` in it, `obsidian-wiki setup --no-hooks --vault <dir>`
with no terminal (which writes `~/.config/obsidian-wiki/config` and its writing profile `WRITING.md` beside it, and links obsidian-wiki's own skills into each agent's
skills folder, creating that folder for agents that are not installed too, where the set's own skills are then linked
like any agent's skills folder; that setup, and obsidian-wiki's version refresh after an upgrade or an install over an existing config, delete or replace a
skill of the same name as one of its 40 bundled ones in every agent's global skills folder, so neither runs, and obsidian-wiki is not installed, while such a
skill of the person's is there: the step is named unavailable with each clashing entry, and the launcher never moves or
deletes them) and, where Claude Code is installed, its SessionStart recap: one entry in the literal
`~/.claude/settings.json`, whatever `CLAUDE_CONFIG_DIR` names (where Claude Code reads another folder the hook is not
registered and `doctor` says so). obsidian-wiki never writes that file: `obsidian-wiki hooks install --only SessionStart`
runs with a throwaway home, and the launcher adds the entry it wrote with its own writer, which follows a link, keeps
the file's permission bits and makes a new file private (obsidian-wiki's own writer would make it `0644` and replace a
link). The upgrade carries the extras, `--with` requirements and Python uv recorded for obsidian-wiki (`uv tool dir`,
`uv-receipt.toml`) and stops, naming it, on anything else the receipt holds (a requirement given as a URL, path, Git
source or editable; an unknown key or table). A vault step that fails removes what it made (the folder, its `.git`, and what the
step added to obsidian-wiki's config folder: the config and `WRITING.md`, or the folder when the step made it), and when the same run installed obsidian-wiki a
step that fails before the vault stands uninstalls it again (`uv tool uninstall obsidian-wiki`); a failure writing the SessionStart entry after the vault stands keeps the vault and obsidian-wiki and records the vault; the error names the kept vault and the cause, the same step is among the person's steps, and once the cause is fixed, the next `setup` registers the entry. An older
obsidian-wiki is brought up with `uv tool install --force` and then `obsidian-wiki list` with its update check off
(`OBSIDIAN_WIKI_NO_UPDATE_CHECK=1`), whose stale refresh records the new version and keeps every other key of the
config (the same `list` runs right after installing obsidian-wiki over an existing config); a `list` that asks for
`obsidian-wiki setup` fails the step instead. It never registers or removes obsidian-wiki's
Stop hook, never runs `obsidian-wiki setup` over an existing config (setup rewrites the config), never replaces a working
Obsidian for its version, and never runs an installer script from the network (a missing uv is `brew install uv` where
Homebrew is, else a person's step with uv's installer). `uninstall` and `restore` leave the memory as it is. It never
stops or kills a process, never replaces an app that is running for this user (another user's process running from
this user's copy does not count, PC-151; that user restarts it, PC-149), never asks for or stores a secret, and
never installs a PassionCode.ai app whose signature, checksum, team or notarization does not verify. Their trust
root is the release key bundled at `lib/release-key.asc`, pinned by fingerprint in
`lib/openpgp.js`; a new key needs a launcher release. The agents' wiki memory has two trust roots of its own (PC-178,
[ADR-0006](docs/adr/0006-setup-installs-the-agents-wiki-memory.md)): Obsidian is trusted through its Developer ID team
`6JSW4SJWN9` and Apple's notarization, with GitHub's asset digest guarding only the transfer (whoever publishes the
release sets it); obsidian-wiki comes from PyPI through uv, pinned by version, not by hash, and uv may fetch a Python to
run it. `PASSIONCODE_RELEASE_KEY` replaces the release key for
tests and is named in setup's output whenever it is set.

## What `permissions` changes

`permissions` reads Claude Code's settings, the ledger and the declarations in `~/.passioncode/rules.d` (and looks up a
declared wildcard's program on PATH, as setup does) and changes nothing but the anonymous counts below. `permissions allow`, `remove` and `mode`
write the ledger `~/.passioncode/permissions.json`, and `allow` and `mode` create `~/.claude/settings.json` and its
folder when they are absent. `permissions allow` adds only rules
PassionCode offers, `permissions remove` takes out of `permissions.allow` only rules PassionCode offers or its ledger
names, and `permissions mode` sets only `permissions.defaultMode`; every other key and rule of the settings file stays,
a rule nobody offered is refused, and a file that cannot be read is never written. `bypassPermissions` lets Claude Code
act without any prompt but the few no mode skips; setup never sets a mode, only `permissions mode` does; `bypassPermissions` only on a person's yes in a terminal or
with `--confirm-bypass`, which a program can pass, so the flag records a choice, it does not prove a person made it
(PC-133). A rule taken out with `permissions remove` is not added back by setup until it is named again with
`permissions allow`. `--by` records who the caller says asked; it is not authentication
(PC-125).

## What anonymous counts send

Each command sends, when it ends, the events listed in [docs/analytics-events.md](docs/analytics-events.md) to
`https://analytics.passioncode.ai`: fixed words and counts, the time, a random id for the run, the launcher version, the
OS name and kernel release, the locale, the Node.js version (with the engine name `Node` and an empty build number), an
SDK tag, a debug flag and the installation id every PassionCode.ai app on the machine shares (sent as `iid` and, with the
same value, `install_id`). Never a path, a name, a rule,
an argument, a token, an error message or a file's content: every property is a fixed word, the previous launcher
version or the installation id (`test/analytics.test.js` plants a home path, a user name, a rule
and a token and fails if one is sent, and checks the exact fields sent). Only the published
package carries the App Key; `analytics off`, `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` stop it, and a "no" already
given in a PassionCode.ai app (the shared `installation.json` field `analytics: false`) is kept as the launcher's off (PC-123). The host
sees the connection's IP address and uses it for a country, a daily visitor hash and rate limits without storing it;
events are kept two years and the installation id is removed from them after 400 days
(from the live store; backups age out within their own retention). While the counts are on, every
command may write `~/.passioncode/analytics.json` and its notice marker and create the shared
`PassionCode/installation.json` (outside `~/.passioncode`) once if it is absent.

## The self-update and who it trusts

The SessionStart hook reads `~/.passioncode/state.json` and reuses a check for up to
24 hours. An absent, invalid, future or expired timestamp starts
`npm view --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode version maintainers _npmUser dist --json`
(npm's own registry whatever registry, or scope registry, the person's npm uses, because the pinned key speaks only for it), detached, logging to
`~/.passioncode/logs/`. It records the latest version, the package's npm maintainers,
the account that published that version, and from `dist` the version's integrity, the npm
registry's signatures over it and the type of its provenance attestation. A record from an
older probe, or one read for another version (an older plugin that probed since), starts a fresh
probe at once and installs nothing meanwhile. Each check, refusal, download, install and
change of the switch is a line of codes in `~/.passioncode/logs/update-events.log` (a refusal once per
version and reason, a check once per answer); the probe and update logs and this one move aside at
5 MB, five files kept, mode 0600 on macOS and Linux. `update_check ready` means a newer version
was seen, before the hook checks it; a refusal (of publishers, signature or provenance) is
`update_check signature_failed` with its reason.

The hook installs a newer version on its own only when all of these hold:

- a release is installed (after `uninstall` none is, so the hook starts nothing; an update it had already started still finishes);
- `update.auto` is on (the default);
- the npm probe exited successfully, the recorded maintainers are non-empty, the
  publisher is known, and every maintainer **and** the publishing
  account is listed in `trust.json` inside the plugin (`npmPublishers`);
  a release published by this repository's `release.yml` through npm trusted publishing
  appears as `github-actions-oidc` (npm's `npm-oidc-no-reply@github.com` identity, matched
  by email, never by display name), and only a maintainer can register that workflow;
- one of npm's signatures over `@passioncode-ai/passioncode@<version>:<integrity>` verifies
  with an npm registry key pinned in `trust.json` (`npmRegistryKeys`, copied from
  `https://registry.npmjs.org/-/npm/v1/keys`): npm signed the integrity the check recorded;
- the version carries an SLSA provenance attestation (`https://slsa.dev/provenance/v1`), as every
  release built by `release.yml` does; which builder made it is not checked here;
- the version is a plain `x.y.z`.

It then runs `npx --yes --cache=~/.passioncode/run/cache-<new> --logs-dir=~/.passioncode/logs/npm --logs-max=5 --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@<that exact version> update --quiet`
(on Windows, where `npx` and `npm` are `.cmd` files that a process started without a shell cannot run, the hooks
run npm's own `npx-cli.js` and `npm-cli.js` from beside the Node that runs them, through that Node: the npm in that
Node's own folder, which is the bundled one unless a global upgrade replaced it there, PC-135; with no npm there they start
nothing and the session line names the fix, PC-143; `PASSIONCODE_NPM` and `PASSIONCODE_NPX`, when set, replace npm and
npx, and `PASSIONCODE_PLATFORM` the system, as the development overrides in docs/reference/cli.md replace what they name),
detached, so the version that was checked is the version that runs; npm checks the download against
the integrity it reads at that moment (up to a day after the check), so a different tarball for the
same version would need the registry itself to serve other metadata than it signed, or the person's own
npm settings (a proxy with `strict-ssl=false`, a custom `cafile`) to let something intercept that
download; the hook does not check the tarball's bytes against the integrity it verified (PC-142).
The probe and the update run in `~/.passioncode/run/`, which holds a `package.json` with no dependencies, never in
the session's project: started there, npm would run a copy from that project's `node_modules`
without downloading or checking anything and read that project's `.npmrc`. `--workspaces=false` keeps
npm from walking up to a monorepo root above that folder, and the update installs through a cache of
its own (a new `~/.passioncode/run/cache-*` folder each time; without one the update does not start),
so a copy an earlier `npx` cached is not reused; npm's debug logs go to `~/.passioncode/logs/npm` (when that folder cannot be made, npm keeps its default
log place, inside the update's cache folder and removed with it, and the update still runs, without `--logs-dir`).
A global install of that exact version (`npm install -g`) would still be used as it is (PC-142). In every other case it spawns
nothing: a version from an account outside the list is reported in one line naming the
account ("… not a trusted PassionCode publisher, so it is not installed"), and a version whose
signature does not verify or that has no provenance is reported the same way and not offered as a
manual command either ([ADR-0005](docs/adr/0005-self-update-verifies-registry-signature-and-provenance.md)); a name nobody has
published (npm E404) is silent; a failed check is shown once. A refused version is still
`@latest` on npm: the refusal stops only the automatic update, and any `npx …@latest` command
runs the refused version. So while a refusal stands, the hook's own lines name the installed
version instead, and `status` adds "not installed automatically" with the reason.

**If a session shows such a line.** Keep working on the version you have and run commands as
`npx @passioncode-ai/passioncode@<installed version> …` (the line names it), not `@latest`; such a
command uses your own npm settings, as any `npx` does, and run inside a project it can use a copy
in that project's `node_modules`: run it from your home folder. Then:
an npm registry key rotation and tampering print the same signature line; it is a rotation when
`https://registry.npmjs.org/-/npm/v1/keys` lists a keyid whose `expires` is empty or still in the future
(keys that already expired do not count) and that the `trust.json` of the version the line says to
keep using lacks
(`https://github.com/passioncode-ai/passioncode/blob/v<kept version>/plugin/passioncode/trust.json`),
and then the CHANGELOG names the launcher release that pins it, which you install by hand once
(`npx @passioncode-ai/passioncode@<that version> update`). A registry mirror or proxy cannot cause
the line, because the check reads npm's registry itself; a network that reaches only a mirror makes
the check fail instead ("the daily update check failed" once per new error), and then updates are
by hand. Any other refusal, a signature that does not verify with no new key listed above all, may
mean tampering: report it to
contact@passioncode.ai with the line, `~/.passioncode/logs/update-events.log` and, if an update ran,
`~/.passioncode/logs/update.log` and `~/.passioncode/logs/npm/` (if it exists; when that folder could not be made, npm's
logs are in `_logs` inside the newest `~/.passioncode/run/cache-*` folder, which an hour later is swept). The line is printed
at the start of a Claude Code session, into the agent's context; the setup skill and the README's prompt
tell the agent to pass it on when it sets up or checks PassionCode. When the last check failed while a
refusal stands, the hook says so at every session start and still names the version to keep, and
`status` shows the refusal. Other agents and a plain terminal never run the hook: there
`npx @passioncode-ai/passioncode@<installed version> status` shows a refusal without running `@latest`. A plugin of 0.2.75
or earlier, installed by hand again, checks only the publishers until it updates.

The current allowlist lives in [`plugin/passioncode/trust.json`](plugin/passioncode/trust.json).
A missing or empty allowlist cannot authorize an update. Adding an account there is a release decision:
it is reviewed like code and ships in the package. A person who wants no background
updates at all runs `npx @passioncode-ai/passioncode@latest config set update.auto off`.

The package contains executable launcher code and member plugin hooks as well as
skill text. The vendor scans supported text-file sizes for credential-shaped strings
and rejects an invalid self-plugin trust list; that scan is not a proof that all
possible secrets or malicious code are absent. Review member code at its pinned tag.
Automatic updates verify npm's registry signature against the pinned key and require a
provenance attestation of the SLSA type; they do not verify the attestation's Sigstore bundle or
its builder (npm checks the bundle at publish time), the signature is npm's and not a PassionCode
release key's (LC-16 asks for the organization's; [ADR-0005](docs/adr/0005-self-update-verifies-registry-signature-and-provenance.md)
says why and what is open), they trust the local cached state, and they do not sandbox the
installed code. When npm rotates its registry key, a release adds the new key first; an older
plugin then refuses automatic updates and says so. A pinned key npm retires or revokes stays
trusted until a release removes it. The release workflow publishes only with provenance and its
registry receipt runs these same checks on the published version (`scripts/check-registry.mjs`).

Evidence: `update()`, `restore()` and `uninstall()` in `lib/launcher.js`;
`parseView()`, `readDist()`, `registrySigned()` and `decide()` in `plugin/passioncode/hooks/update-check.js`;
`scanForSecrets()` in `scripts/vendor.mjs`; regression tests in
`test/launcher.test.js` and `test/self-update.test.js`.
