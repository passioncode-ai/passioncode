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
| `setup` (alias `onboard`) | `--yes`/`-y`, `--with <ids>`, `--without <ids>`, `--train <name>`/`none`, `--no-apps`, `--no-open`, `--dry-run`, `--offline`, `--json` | Setup result described below | Check, install absent apps, repair, check again ([ADR-0004](../adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md)) |
| `doctor` | `--fix`, `--offline`, `--json` | Doctor result described below; with `--fix`, a setup result | Read-only check of everything; `--fix` runs setup's repairs without new apps |
| `update` (alias `install`) | `--dry-run`, `--quiet`, `--json` | `{ version, steps, moved }` | Install the bundled payload and the apps' MCP registrations; preserve displaced files in quarantine |
| `status` | `--json` | Status object described below | Read local installation and cached npm observation |
| `restore` | `--json` | Array of restored paths/marketplace descriptions, and one note per MCP registration removed or kept | Restore the latest quarantine batch; retry unfinished entries |
| `uninstall` | `--json` | Array of removed links/plugin IDs, and one note per MCP registration removed or kept | Remove owned links/plugins, clear active release, disable auto-update |
| `config set update.auto on` or `off` | `--json` | `{ auto: boolean }` | Persist the automatic-update preference |
| `help`, `--help`, `-h`, or no command | None | Text only | Print usage |

Exit codes: **0** means the command completed (an update can include explicitly
skipped steps; `doctor` and `setup` found no failing check); **1** means an
operation or supported config value failed, or a `doctor`/`setup` check still
fails; **2** means an unknown command or unsupported arguments. `--quiet` suppresses
successful update output, including JSON, but never hides failed update steps.
`--dry-run` exists only for update/install: `uninstall --dry-run` and misspelled
flags fail before any mutation. Runtime errors go to stderr, including with
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
failures. Doctor writes nothing else and starts, stops or opens nothing.

| Area | What is read | A failure means |
|---|---|---|
| prerequisites | Node ≥ 18; coding agents present; Docker answering and the Supabase CLI when Fabric is installed | Node too old; Docker or the Supabase CLI missing (a stopped Docker is a warning) |
| skills | `status`: the set installed, each member's plugin, hub links, shadows, legacy copies | the set is missing or broken |
| apps (macOS) | each installed app's version against its latest release; `codesign --verify --strict`, team `KJ35UYYL22`, `xcrun stapler validate`; running or not | the signature, team or ticket does not hold (an outdated app is a warning) |
| mcp | each present agent's entry for each installed app's server; one proving call per distinct registered command (never Fabric's: it enrols a session as it starts, so its entry and binary are checked) | a bundled server is not registered, points at a missing file, or its proving call fails (an Observatory or Inbox server not yet added by its own onboarding is a warning) |
| services | each family Fabric service descriptor's `/.well-known/fabric-service` on loopback | the service does not answer (degraded is a warning) |

`setup` returns `{ version, platform, mode, plan, actions, before, after,
humanSteps, planOnly, ok, keyOverride }`. `mode` is `new` (no skill set and no
app) or `existing`. `plan` items are `install` (an absent app; `selected` false
for Fabric without its prerequisites unless `--with fabric`), `update`,
`replace` (an outdated or damaged app nothing runs from: not the app, not an agent's MCP server from its bundle; a `pgrep` that cannot answer counts as in use) and `kickstart` (a
launchd service that does not answer), each with the check ids that caused it.
`actions` are what ran, with `outcome` `done` or `failed` and `error`. `before`
and `after` are doctor results; `humanSteps` lists, once each, every remaining
fix, each product's onboarding for apps installed in this run, and the restart.

Questions are asked only on a terminal: one per absent app and one for the
repairs. Without a terminal and without `--yes`, or with `--dry-run`, the plan
is returned with `planOnly: true`, nothing changes, and the exit code is 0.
`setup` exits 1 when an action failed or a check still fails after the
repairs. `doctor --fix` is `setup --yes` with no `install` items and nothing
opened.

`--train <name>` follows a release train (`trains/<name>.json`): `install` and
`replace` take the pinned release (`GET /repos/<repo>/releases/tags/v<version>`)
instead of the latest, and the name is saved as `train` in
`~/.passioncode/state.json` (not with `--dry-run`, whose plan still uses it).
`--train none` removes it. An unknown name exits 2 before anything is checked.
On a train, `doctor` compares each pinned app with its pin: equal is `ok`, an
older one is `warn` with a `replace` repair (macOS; on Windows the fix names the
pinned version's download page), a newer one is `warn` with no repair. One
`train` check counts the apps at their pin; a saved train this launcher does not
ship is `fail` with the fix `setup --train none`.

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
   installed and the one it replaced — the newest other release when it replaced
   none — and remove older ones and `*.partial` copies a killed update left
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

## Uninstall and reinstall

Uninstall removes only links targeting this launcher's active release/hub, including
equivalent relative links. Other user files stay in place. Failed plugin removal
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
| `~/.agents/skills` | Shared skill hub |
| Existing paths in `CHANNELS` in `lib/launcher.js` | Supported agent channels; an absent channel is not created |
| `~/.claude/skills` | Shadowing entries may be quarantined after replacement verification |
| `PASSIONCODE_HOME` | Override launcher state/release/quarantine/log root; agent directories still use the user's home |
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
