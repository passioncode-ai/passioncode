# Security

Report vulnerabilities privately to contact@passioncode.ai. Do not open an issue that
carries credentials or a working exploit.

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
the launcher's own `trains/<name>.json` and the `train` it saved in `~/.passioncode/state.json`,
Claude Code's `~/.claude/settings.json` (only its `permissions` rules, for the `sessions.on-demand` row; nothing in it is
printed or sent), and the GitHub releases API. It starts each registered stdio MCP
server for one proving call and stops it (never Fabric's, which enrols a session as it starts), and writes only `~/.passioncode/doctor.json` and a
release cache, apart from the anonymous counts below that every command sends while they are on (`~/.passioncode/analytics.json`,
its notice marker, the shared `PassionCode/installation.json` created once if absent, and one request to
`https://analytics.passioncode.ai`).

`setup --train <name>` (or `none`) also writes that name into `~/.passioncode/state.json`; a train
changes which release is downloaded (the pinned tag instead of the latest), never how it is verified.
`setup` also downloads releases from GitHub into `~/.passioncode/downloads/` (removed after
each app), copies a verified app into `/Applications`, moves an app it replaces into `~/.Trash/`,
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
descriptor names launchd and that does not answer, and opens the apps it installed. It never
stops or kills a process, never replaces a running app, never asks for or stores a secret, and
never installs a byte whose signature, checksum, team or notarization does not verify. The trust
root is the release key bundled at `lib/release-key.asc`, pinned by fingerprint in
`lib/openpgp.js`; a new key needs a launcher release. `PASSIONCODE_RELEASE_KEY` replaces it for
tests and is named in setup's output whenever it is set.

## What `permissions` changes

`permissions` reads Claude Code's settings, the ledger and the declarations in `~/.passioncode/rules.d` (and looks up a
declared wildcard's program on PATH, as setup does) and changes nothing but the anonymous counts below. `permissions allow`, `remove` and `mode`
write the ledger `~/.passioncode/permissions.json`, and `allow` and `mode` create `~/.claude/settings.json` and its
folder when they are absent. `permissions allow` adds only rules
PassionCode offers, `permissions remove` takes out of `permissions.allow` only rules PassionCode offers or its ledger
names, and `permissions mode` sets only `permissions.defaultMode`; every other key and rule of the settings file stays,
a rule nobody offered is refused, and a file that cannot be read is never written. `bypassPermissions` lets Claude Code
act without any prompt but the few no mode skips; setup never sets a mode, only `permissions mode` does, for whoever runs it, a person
or a program, without checking which (PC-133 tracks a stronger gate for `bypassPermissions`). `--by` records who the caller says asked; it is not authentication
(PC-125).

## What anonymous counts send

Each command sends, when it ends, the events listed in [docs/analytics-events.md](docs/analytics-events.md) to
`https://analytics.passioncode.ai`: fixed words and counts, the time, a random id for the run, the launcher version, the
OS name and kernel release, the locale, the Node.js version (with the engine name `Node` and an empty build number), an
SDK tag, a debug flag and the installation id every PassionCode app on the machine shares (sent as `iid` and, with the
same value, `install_id`). Never a path, a name, a rule,
an argument, a token, an error message or a file's content: every property is a fixed word, the previous launcher
version or the installation id (`test/analytics.test.js` plants a home path, a user name, a rule
and a token and fails if one is sent, and checks the exact fields sent). Only the published
package carries the App Key; `analytics off`, `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` stop it, and a "no" already
given in a PassionCode app (the shared `installation.json` field `analytics: false`) is kept as the launcher's off (PC-123). The host
sees the connection's IP address and uses it for a country, a daily visitor hash and rate limits without storing it;
events are kept two years and the installation id is removed from them after 400 days
(from the live store; backups age out within their own retention). While the counts are on, every
command may write `~/.passioncode/analytics.json` and its notice marker and create the shared
`PassionCode/installation.json` (outside `~/.passioncode`) once if it is absent.

## The self-update and who it trusts

The SessionStart hook reads `~/.passioncode/state.json` and reuses a check for up to
24 hours. An absent, invalid, future or expired timestamp starts
`npm view --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org @passioncode-ai/passioncode version maintainers _npmUser dist --json`
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

It then runs `npx --yes --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org @passioncode-ai/passioncode@<that exact version> update --quiet`,
detached, so the version that was checked is the version that runs; npm checks the download against
the integrity it reads at that moment (up to a day after the check), so a different tarball for the
same version would need the registry itself to serve other metadata than it signed, or the person's own
npm settings (a proxy with `strict-ssl=false`, a custom `cafile`) to let something intercept that
download; the hook does not check the tarball's bytes against the integrity it verified (PC-142). In every other case it spawns
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
command uses your own npm settings, as any `npx` does. Then:
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
contact@passioncode.ai with the line and `~/.passioncode/logs/update-events.log`. The line is printed
at the start of a Claude Code session, into the agent's context; the agent passes it on when it sets
up or checks PassionCode. Other agents and a plain terminal never run the hook: there
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
