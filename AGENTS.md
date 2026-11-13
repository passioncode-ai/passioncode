# Working in passioncode

## Read first

1. The organization's
   [roadmap](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/roadmap.md) —
   every major feature and release across PassionCode.ai as `RM-*` tracks with owner, phase and
   state. It is the entry point: a task here that serves a track names it, and the track's status
   is edited only in the roadmap.
1a. **The course check, before every change** ([rules §0](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/rules.md#0-the-course-check-the-plan-and-the-north-star-before-every-change)):
   the [North Star](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/north-star.md) metric and
   gaps, and the [one plan in waves](https://github.com/passioncode-ai/fabric-workspace/blob/main/docs/plans/2026-11-11-unified/README.md).
   Name the track, plan row or gap the change serves; work that serves none goes to the board first.
1b. **The North Star sections this repository serves** (operator, 2026-11-13; [North Star §6](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/north-star.md#merged-with-the-north-star-validated-by-the-architect-operator-2026-11-13)
   «Merged with the North Star, validated by the architect»): [S4.1](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/system/prompt-onboarding.md)
   step 7 (each person's machine: `setup` and its doctor); §4 «One system, not a pile of tools» (`setup` installs the
   system's apps and registers their MCP as one set, [ADR-0004](docs/adr/0004-setup-installs-verified-apps-and-registers-their-mcp.md));
   §10 «Deployment and continuity» (each agent from its installer; the set stays current with `update`); §13 step 6
   (PassionCode's agents update skills); gap G14 (rows PC-153, PC-154). When the launcher's state changes against
   them (a release, a gap closed or opened, a «where we stand» fact), write fabric-workspace a board message naming
   the section and the evidence. Before each npm publication the architect's audit runs on this checkout
   (fabric-agents-database `tools/audit.py scan`, then `start`, judged by `playbooks/audit-agent.md`); a blocking gap
   holds the release (PC-200).
2. The PassionCode.ai knowledge base — `fabric-workspace/knowledge/` in your clone (org-index
   `scripts/clone_all.sh` makes it) or https://wiki.passioncode.ai/knowledge — at least its
   [README](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/README.md),
   vision, principles and how-to-work.
3. This file, then the organization's
   [CONTRIBUTING.md](https://github.com/passioncode-ai/.github/blob/main/CONTRIBUTING.md), then
   this repository's [CONTRIBUTING.md](CONTRIBUTING.md) (test first, one version, the CLA). This
   repository's files win where they differ from the organization's.

## What this repository is

PassionCode.ai launcher: `passioncode` is the npm launcher that sets up PassionCode.ai on a computer
with one command (`npx @passioncode-ai/passioncode@latest setup`: the apps from their verified
releases, their MCP servers for every agent, the agent skills listed in `family.json`), checks it
(`doctor`) and keeps the skills current as one set (`update`). Members are vendored from their own repositories at a
pinned ref (`family.json`); Claude Code gets them from a local `passioncode` marketplace,
other agents through the `~/.agents/skills` hub (`README.md`).

## Commands

```bash
npm test                    # scripts/test.mjs enumerates tests for Node 18+; temp HOME and a fake claude CLI; its own temp folder, removed after
npm run vendor              # build payload/ from the members in family.json: a shallow clone of repo@ref
npm run vendor:release      # the same, refusing any ref that is not a tag
PASSIONCODE_CHECKOUT_ROOT=<dir> npm run vendor   # read members from local clones <dir>/<repo name> instead
npm run vendor -- --clone   # ignore local clones (also PASSIONCODE_VENDOR_CLONE=1; PASSIONCODE_GIT_BASE replaces git@github.com:)
claude plugin validate ./payload --strict
```

There is nothing to install: the launcher has no dependencies and no lockfile, so `npm ci`
refuses to run here; `npm test` works on a fresh clone. `.gitattributes` checks every text file
out with LF on every platform (PC-99); a Windows clone made before it refreshes its files once,
on a clean tree, with `git rm --cached -r .` and then `git reset --hard`. Hosted workflows exist
(`validate.yml` runs `npm test` on Linux, macOS (PC-132) and Windows (PC-135); on Windows the cases that cannot run
there skip by name with their reason: POSIX links, paths and modes, signals (PC-116), a folder made unwritable (PC-115),
`test/setup.test.js`'s macOS simulation, and the PC-86, PC-88 and PC-89 doctor and
setup cases, which simulate Windows on Linux and macOS because their `reg` stand-in is a shell script, and the PC-143
cases of a Windows Node with no npm beside it, simulated with `PASSIONCODE_PLATFORM` because a real Node there has npm (on Windows itself
`test/windows.test.js` proves the real `reg` output parses and the junction links);
`release.yml` releases and publishes on a `v*` tag when `RELEASE_ENABLED` and `PUBLISH_NPMJS` are
`true`). The repository is public, so they run outside the organisation's
spending cap; the local gate above is still the evidence, and a skipped run is reported as skipped.
MCP: the launcher serves no MCP server. It registers the installed apps' servers for every
agent (ADR-0003, ADR-0004) and `doctor` makes one proving call to each (README,
"Quick start → MCP").

## Where things live

- `lib/launcher.js` (update, restore, status, uninstall), `lib/setup.js` and `lib/doctor.js`
  (setup and doctor, ADR-0004), `lib/catalog.js` (the apps: release, asset, MCP command, proving
  call, onboarding), `lib/releases.js` and `lib/openpgp.js` (verified downloads; the release key
  `lib/release-key.asc`), `lib/mcp-probe.js` (the proving call), `lib/permissions.js` and `lib/ledger.js` (Claude Code's
  rules setup offers, and the `permissions` command's ledger, PC-119 and PC-125), `bin/passioncode.js` (the CLI),
  `scripts/vendor.mjs` (the payload), `plugin/passioncode/` (the self-update SessionStart
  hook: `hooks/update-check.js` decides, `probe.js` asks npm, `session-start.js` acts;
  `trust.json` names the npm accounts allowed to publish and pins npm's registry key).
- `plugin/passioncode/skills/working-in-passioncode/`: the organisation's working rules as
  a skill for every contributor's agent; its trigger and scenario evals are in
  `test/evals/working-in-passioncode/`, held to the Agent Skills standard by `test/skill.test.js`.
- Tests: `test/launcher.test.js` (fake `claude` in `test/fake-claude.js`),
  `test/self-update.test.js` (fake `npm`/`npx` on PATH; on Windows named by `PASSIONCODE_NPM`/`PASSIONCODE_NPX`), `test/vendor.test.js` (a local bare remote),
  `test/skill.test.js` (the self plugin's skills).
- Decisions: [docs/adr/](docs/adr/). What the launcher touches: [SECURITY.md](SECURITY.md).
- `payload/` is generated and never committed.

## Local rules

- One channel per agent: nothing is ever written to `~/.claude/skills`.
- Nothing of the person's is deleted: every move goes to `~/.passioncode/quarantine/` and is undone by
  `passioncode restore`.
  The one exception is the launcher's own output: an update keeps the release it installed and
  the one it replaced, and removes older `~/.passioncode/releases/<version>` directories
  (reinstallable from npm; lifecycle contract LC-11, LC-15), and the `<link>.<pid>.lnk` temporary links a
  failed update left beside a link it replaces (PC-85).
- A release vendors tagged bytes only (`npm run vendor:release`, run by `prepublishOnly`),
  and the vendor step refuses credential-shaped strings.
- The self-update never runs a version it has not attributed: only a pinned
  `@passioncode-ai/passioncode@<x.y.z>` whose every npm maintainer and publisher is in `trust.json`
  ([ADR-0002](docs/adr/0002-self-update-trusts-named-publishers.md)), whose npm registry signature
  verifies with the key pinned there and which carries SLSA build provenance
  ([ADR-0005](docs/adr/0005-self-update-verifies-registry-signature-and-provenance.md)).
- Members are PassionCode.ai products only. An agent someone builds for themselves is never
  added, even when it implements a Fabric protocol.
- `family.json` names no machine paths: local clones are an environment override
  (`PASSIONCODE_CHECKOUT_ROOT`), never a committed path.
- `working-in-passioncode` summarises the knowledge base and org-index and points to them; it
  never restates a long document. A rule that changes there changes here in the next release,
  and so do the session-start lines, the read-first one and the course check
  (`plugin/passioncode/hooks/repo-rules.js` `rulesLine` and `courseLine`, held by
  `test/repo-rules.test.js`).
- The licence is the organization's (Fabric ADR-0092): `AGPL-3.0-only OR
  LicenseRef-PassionCode-Commercial`; `LICENSE`, `COMMERCIAL-LICENSE.md` and `CLA.md` byte for byte
  the knowledge base templates (`test/license.test.js`). v0.1.5–v0.1.11 stay PolyForm, v0.1.4 and
  earlier MIT.
- **Shared registers are edited under a lease.** [docs/AGENT_SYNC.md](docs/AGENT_SYNC.md)
  (generated from `.claude/agent-sync.json` by `agent_sync.py setup`; never edited by hand) lists
  the guarded files and the gate. Run `agent_sync.py acquire <file>` before editing one and
  `agent_sync.py release <file>` after, on every path including failure. The lease is a ref under
  `refs/agent-sync/leases/` on `origin`, so another contributor's agent sees it
  (`git ls-remote origin 'refs/agent-sync/leases/*'`); the record plane is local (`fs`), and
  `.agent-sync/` is git-ignored. No register here carries a "Next free ID" line, so nothing is
  reserved yet; a register that gains one is declared under `idRegisters` and taken with
  `agent_sync.py reserve <REG>`.

## Platforms

The organization's rule is every product on Mac, Windows and Linux
([knowledge/platforms.md](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/platforms.md)). This
repository meets it with these departures, for these reasons:

- It ships as an npm package (`@passioncode-ai/passioncode`, published with provenance), not an installer: there is no
  installer to sign or notarise on any system, and updates run through npm itself (the session hook's background
  update, README "Staying current").
- CI (`.github/workflows/validate.yml`) runs the whole gate on `ubuntu-latest`, `macos-latest` and `windows-latest`
  only, one Windows version, with Node 22.
- That workflow runs on every push and pull request, not only nightly: its three jobs take a few minutes, and a pull
  request is merged on their green result.

## Lifecycle

The org contract is [knowledge/lifecycle.md](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/lifecycle.md).

**Background footprint (LC-09).** The launcher owns no launchd job, login item, port, MCP server
or resident process. Everything it runs is started by a person or by Claude Code's SessionStart:

| What | Started by | Cadence | Cost | With no window | Stopped by |
|---|---|---|---|---|---|
| `passioncode setup / doctor` | a person or their coding agent | on demand | doctor: one short-lived process per registered MCP server (20 s cap), one GitHub API call per app (cached 30 min); setup: downloads, `codesign`/`spctl`, `ditto`, `launchctl kickstart`, `open` only for apps it installed; and, while the anonymous counts are on, one request to analytics.passioncode.ai at the end (2 s cap), `~/.passioncode/analytics.json`, its notice marker and, once, the shared `PassionCode/installation.json` | nothing | exits; the MCP servers it started are stopped when their proving call returns |
| `passioncode update / restore / uninstall` | a person, or the background update below | on demand | one `claude plugin` call per member (180 s cap each); and, while the anonymous counts are on, one request to analytics.passioncode.ai at the end (2 s cap), `~/.passioncode/analytics.json`, its notice marker and, once, the shared `PassionCode/installation.json` | nothing | exits; `~/.passioncode/update.lock` keeps one at a time (`test/lifecycle.test.js`) |
| `passioncode status / config / permissions / analytics / help` | a person or their coding agent | on demand | the command's own reads; and, while the anonymous counts are on, one request to analytics.passioncode.ai at the end (2 s cap), `~/.passioncode/analytics.json`, its notice marker and, once, the shared `PassionCode/installation.json` | nothing | exits |
| SessionStart hook `plugin/passioncode/hooks/session-start.js` | Claude Code, matcher `startup` only (not resume, clear or compact) | once per new session | 0.11–0.19 s, 2 processes (node + `git remote get-url`, 2 s cap), 5 s hook timeout; measured 2026-10-03 (lifecycle audit, passioncode-adapter §4) | nothing | exits |
| Probe `hooks/probe.js` → `npm view --registry=https://registry.npmjs.org --@passioncode-ai:registry=…` | the hook, detached | at most once a day (`checkedAt` older than 24 h), or at once when the saved check has no signature data for the latest version (`verify` missing or read for another), one at a time (`probe.pending`) | 1 node + 1 npm, one HTTPS call, 30 s cap | runs ≤ 30 s, then exits | its own timeout |
| Background update `npx --yes --cache=~/.passioncode/run/cache-<new> --logs-dir=~/.passioncode/logs/npm --logs-max=5 --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@<x.y.z> update --quiet` | the hook, only for a newer version from trusted publishers, signed by npm's pinned key and with build provenance, with a release installed and auto-update on | at most once per 10 min (`updatingSince`), usually never | as `update`, without the analytics request (the hook turns the counts off) | runs to completion (tens of seconds) | exits; refuses if another update holds the lock |
| Observatory Log hooks (vendored member) | Claude Code: SessionStart on every start/resume/clear/compact (15 s cap), Stop after every turn (20 s cap) | per session and per turn | owned by `passioncode-ai/project-observatory-dashboard` (`observatory/engine/skill/plugins/observatory-log/hooks/`) | nothing | exits |

Idle budget: zero — no process runs between sessions except a probe or update still inside its cap.

Update log (LC-12, LC-16): `~/.passioncode/logs/update-events.log` holds one line of codes per `update_check`
(`ready`/`current` once per answer, `check_failed`, with `npm` when there is no npm beside the Node on Windows, `signature_failed <reason>` once per version and reason),
`update_download` (`started`, `done`), `update_install` (`installed`, `failed`, with `spawn`, `cache` or `npm` (no npm beside the Node on Windows) when the hook could not start it) and `auto_update` (`on`, `off`);
`probe.log`, `update.log` and it move aside at 5 MB with five files kept, mode 0600 on macOS and Linux
(`hooks/update-log.js`, its copy `lib/update-log.js`). The probe and the background update run in
`~/.passioncode/run/` (a `package.json` with no dependencies the hook writes), so npm never takes the package from the session
project's `node_modules` or reads its `.npmrc`. `ready` means a newer version was seen, before the hook
checks it; `signature_failed` covers every refusal (publishers, signature, provenance) with its reason.

Where this change departs from LC-16 and LC-12 (said here as LC-16 asks; the launcher's other LC-16 differences, the
switch kept in `~/.passioncode/state.json` (`config.auto`), the npm metadata as the check's source and the cadence
in the table above, are older): the signature checked is npm's registry
key over npm's copy, not the organization's (PC-142 adds one), and the logs live in `~/.passioncode/logs/`, not
`~/Library/Logs/<Product>/`, with the rest of the launcher's state on all three platforms
([ADR-0005](docs/adr/0005-self-update-verifies-registry-signature-and-provenance.md)).

**Build retention (LC-15).** Output directories: `payload/` (written by `scripts/vendor.mjs`,
replaced whole on each run — one copy) and `*.tgz` from `npm pack` (`scripts/smoke-pack.mjs` packs
into a temp dir and removes it). Keep no tarball: releases live on npm and GitHub. On a machine
the launcher installs to, `~/.passioncode/releases/` holds the current and the previous release;
the update prunes the rest itself (`LC-15 after four updates only the current and the previous
release remain`). Cache cap: none beyond those, and `~/.passioncode/run/cache-*`, each background update's own new npm cache (about one
package copy, removed at every session start once older than an hour, except the one the last update runs from, recorded as
`updateCache` in `state.json`; uninstall leaves them, removing them by hand is safe while no update runs), with npm's own
debug logs in `~/.passioncode/logs/npm` (a 0700 folder, npm keeps five; npm writes them with its own mode, outside LC-12's
rotation; if that folder cannot be made, npm keeps its default place inside the update's cache folder and the update still runs); clean command: `rm -rf payload *.tgz`.

## Organisation

This repository is one of the `passioncode-ai` repositories. **The org map and onboarding live in [passioncode-ai/org-index](https://github.com/passioncode-ai/org-index)**
(private; readable by every org member):

- [README](https://github.com/passioncode-ai/org-index#repositories): which repository owns what, and how they connect
- [rules](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/rules.md): branches, commits, CI, leases, secrets, handoffs
- [ONBOARDING.md](https://github.com/passioncode-ai/org-index/blob/main/ONBOARDING.md): setting up a new contributor's machine

Where this file is stricter than the shared rules, this file wins. A change to this repository's
role, dependencies or test command updates its row in `org-index/repositories.json` in the same change.

## Shared backlog

[docs/backlog-sources.json](docs/backlog-sources.json) declares this repository's canonical
local task sources and their vision goals. The [common backlog contract](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/backlog.md)
owns aggregation; [the workspace backlog](https://wiki.passioncode.ai/backlog) is a derived view.
Edit a task only in its canonical source under an agent-sync lease, retain stable IDs and
closure receipts, and declare any new source in the manifest. Do not edit generated task
status in the workspace or copy another repository's task into a second editable row.
Land the source change, then run `node scripts/workspace.mjs sync` from a Fabric checkout
(or use the scheduled sync); check the published source commit before calling it current.

## After work

In the same run: update this repository's docs with the change; if a cross-repository fact changed
(a product, a version, a plan row, a principle), update the page in `fabric-workspace/knowledge/`
that owns it — a launcher release changes the launcher's and its members' rows in `products.md`
and `how-to-work.md`; land both; publish (`node scripts/workspace.mjs sync` from a Fabric checkout)
or leave it to the scheduled sync. Leave a handoff with the exact next task.
