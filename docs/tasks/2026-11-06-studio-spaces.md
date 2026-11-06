# The launcher on a shared Mac, a machine move and an organization

Status: specification, 2026-11-06; rows PC-145 to PC-156 in [the backlog](../backlog.md) and the existing PC-89 part 2.
Read at launcher `86d50e7` against the organization's plan, fabric-workspace `6cb6cbb6`:
`docs/plans/2026-11-04-studio-spaces/` (README, runbook, access, placement), `knowledge/plans.md`,
`knowledge/integration.md` (X-9, I1-1, I2-1) and the field review's I-01, I-05, I-06, I-25.

## Why

The operator, 2026-11-05 (relayed on the Fabric board, thread `1fe66e6e`):
every project checks its code against the move to another machine and the joining of an organization, writes a
detailed specification for each gap and closes them in waves. The plan puts three things on the launcher:

- README "Owner rows to file": `setup` under a second macOS user on the same Mac, the apps already in `/Applications`.
- Runbook 2.7: `setup` with both permission sets, the apps per user in `~/Applications` (Fabric, Switchboard, Inbox,
  the Observatory app), Fabric's hub port per user from Fabric 0.3.16 (CO-505: 47071 for the first user, 47072 for the second).
- Runbook 3.1: the Observatory engine under the organization's user with its own empty vault, "by the launcher's setup".

And N-12 (X-9, settled 2026-10-28): the "Join an organization" step of PC-89, after Fabric CO-337 (2026-11-21).

## What the launcher did at the reading (`86d50e7`)

| Area | Today | Where |
| --- | --- | --- |
| Apps folder | `/Applications`, unless `PASSIONCODE_APPLICATIONS` is set; `~/Applications` is never used | `lib/catalog.js:76-77`, `docs/reference/cli.md:515` |
| An app already there | counted as installed whatever its owner; an outdated one is replaced by staging inside `/Applications` and moving the old bundle into the running user's `~/.Trash` | `lib/setup.js:67`, `lib/releases.js:224-243` |
| No administrator rights | `/Applications` is `root:admin 775`: a standard user gets a raw `EACCES` from `ditto`, no pre-check, no human step | `lib/releases.js:224-233` |
| The override | with `PASSIONCODE_APPLICATIONS=~/Applications` and no such folder, `fs.readdirSync` throws `ENOENT`; the value is not kept, so the session hook's update and a later `doctor` go back to `/Applications` | `lib/releases.js:226` |
| Observatory | installs the app only; the engine and the vault are the guide's `project-observatory full onboard`; the launcher holds no vault code | `lib/catalog.js:42-48` |
| Ports and tokens | no hub port and no `FABRIC_HUB_PORT`; `doctor` probes `/.well-known/fabric-service` of the descriptors in the user's own services folder, sending no token, but does not check who owns the listener | `lib/doctor.js:80-90`, `:349-371` |
| "In use" | `pgrep -f "<appDir>/Contents/MacOS/"` across every user, unanchored: another user's copy counts as in use | `lib/releases.js:143-145` |
| Moved home | `~/.passioncode` (train, MCP registrations, ledger, `rules.d`, `releases/` with an absolute `current` link), `~/.agents/skills`, MCP entries with absolute app paths, and the shared `installation.json` id travel as they are; nothing detects a move | `lib/launcher.js:53-66`, `:600`; `lib/analytics.js:42-62` |
| Organization | no join command and no personal or organization context | `bin/passioncode.js:26-37` |
| Train | `organization-r1` pins Fabric 0.3.15 (before CO-505), Switchboard 0.7.0, Dashboards 0.8.15, Observatory 0.30.0, Inbox 0.77.3 | `trains/organization-r1.json:6-12` |

## The gaps

Each row names what is needed, the check that accepts it and what it waits on. P1 blocks wave 3 of the runbook
(the organization's space).

### PC-145 (P1): apps per user in `~/Applications`

Decision as built (2026-11-06, PR #277): no choice is kept in `state.json`; every run applies one placement rule
(`lib/catalog.js` `appPath`): this user's `~/Applications` copy; else a `/Applications` copy this user owns whose folder
and bundle they may write, which stays there (a single-user Mac keeps `/Applications`, the plan's placement.md); else
`~/Applications`. `doctor`'s row for a copy left in `/Applications` is information, not a warning, since there is
nothing for the user to fix. Question 1 below is answered by that rule and by the plan.

Needed: install into `~/Applications`, making the folder when it is absent; keep the choice in `state.json` so
`update`, `doctor` and the session hook use the same folder; `doctor` reads this user's copy first. An existing
`/Applications` copy owned by the same user may stay where it is (question 1 below decides whether it moves).
Accept: under a second macOS user with no `~/Applications`, `setup --yes` installs Fabric, Switchboard, Dashboards,
Inbox and the Observatory app there; a later plain `doctor` and a session-start update read and use those paths.
Waits on: the plan's decision that apps are per user (README "The apps themselves"); Dashboards FD-145 and
Switchboard SB-251 for their own handlers.

### PC-146 (P1): another user's app is never ours

Needed: a bundle in `/Applications` owned by another uid, or not writable by this user, is "shared, not yours":
plan a per-user install, never replace, move or Trash it; `doctor` names it as a copy that may answer
`fabric-dashboards://` and `fabric-inbox://` before this user's.
Accept: copies another user installed in `/Applications` are byte-identical after `setup` under the first and the second user;
each user has its own copy; `doctor` warns about the shared one.
Waits on: runbook 3.5 (who removes the shared copies).

### PC-147 (P1): `setup` without administrator rights

Needed: with PC-145 nothing needs an administrator; when a target is still not writable, the plan says so and names
the human step before anything is downloaded.
Accept: `setup --yes` as a standard user exits 0 and asks for no password.
Waits on: PC-145.

### PC-148 (P1): the train for a shared Mac

Needed: re-pin `organization-r1`: Fabric 0.3.16 or later (CO-505), the Dashboards release with FD-145, the
Switchboard release with SB-251 and SB-242, Observatory 0.33.0. Until then a fresh install of the second user on the train
gets Fabric 0.3.15, whose hub takes 47070 and meets the first user's.
Accept: `setup --train organization-r1` under the second user leaves Fabric's `hub.json` naming 47072 with no
`FABRIC_HUB_PORT`; `doctor`'s train rows read ok.
Waits on: Fabric 0.3.16 published; the train record (SD-4) in fabric-workspace.

### PC-89 part 2 (P1, existing row): "Join an organization"

Needed: a join step per macOS user that calls Fabric's join interface (the root fingerprint compared over a second
channel, ADR-0178), enrolls the Observatory node (OBS-200), connects Switchboard (`org connect`, SB-159) and keeps
the train; records the context in `state.json`; `doctor` shows it; one organization per macOS user (CX-22).
Accept: under the organization's user the join leaves the machine listed in Vesta; under a personal user,
`doctor` shows `personal` and no organization.
Waits on: Fabric CO-337 (2026-11-21), Vesta, Observatory OBS-200, Switchboard SB-159.

### PC-149 (P2): the launcher's MCP entries follow the per-user copy

Needed: entries the launcher registered (`state.json` `mcpRegistrations`) and that point at `/Applications/...` are
re-pointed at `~/Applications/...` when PC-145 moves the app, with the backup and `restore` as today; an entry the
person wrote stays theirs (`lib/launcher.js:717-721`).
Accept: after the move, `~/.claude.json`, `~/.codex/config.toml` and the others name only this user's binaries;
`restore` puts the old entries back.
Waits on: PC-145.

### PC-150 (P2): the Observatory engine and an empty vault per user

Needed: either `setup` runs Observatory's own non-interactive "new install, new empty vault, never import" command,
or runbook 3.1 names that command instead of "the launcher's setup". The launcher never reads or writes a vault.
Accept: under the second user, `project-observatory --version` reads 0.33.0 and `vault.py list` is empty; the first user's vault
is untouched (its digest unchanged).
Waits on: Observatory's row "a second, independent install per macOS user"; question 2 below.

### PC-151 (P2): "in use" counts only this user's processes

Needed: `pgrep -U <uid>` with an anchored path, so another user's running copy neither blocks an update nor counts
as in use.
Accept: a test where a foreign uid runs `/Users/x/Applications/Fabric.app` leaves this user's copy not in use.
Waits on: nothing.

### PC-152 (P2): `doctor` checks who owns a loopback listener

Needed: before `doctor` calls a local service healthy (and before any later token to 127.0.0.1), check that the
listener belongs to this uid; a foreign owner is a failed row. One rule for the family, from the contract
(fabric-agent-contract took the norm, board `a8daa413`), not a launcher-only check.
Accept: with two users, a foreign process on this user's service port makes `doctor` say the port belongs to another
user, not that the service answers.
Waits on: the contract's DEC on ports and listener owners; Fabric CO-505 (`hub.json`).

### PC-153 (P2): a moved home is noticed and repaired

Needed: `doctor` notices a restored home (dangling links, missing apps, another machine) and `setup` rebuilds the
links and registrations; the installation id is made anew per machine (a machine fingerprint beside it), agreed
with Dashboards, which reads the same file. The train, the ledger and `rules.d` carry over.
Accept: a MacBook home's `~/.passioncode`, `~/.agents`, `.claude*` and `installation.json` copied to a fresh user:
`doctor` names the move, `setup --yes` repairs it, the new machine gets a new id.
Waits on: Observatory `machine-restore` (what it copies, question 6); Dashboards.

### PC-154 (P2): containers as the plan has them (TA-05: I-01, I-05, I-06)

Needed: check `docker` as an app opened from the Dock sees it; Colima with the `docker` formula is the default text
(OrbStack was removed from a shared Mac, Q2); on consent install Colima, `docker` and `supabase`.
Accept: a clean macOS user with Colima: `doctor`'s docker row is ok and its fix names Colima.
Waits on: Fabric's I-06 decision.

### PC-155 (P2): scenarios and docs for the new paths

Needed: scenarios first (`docs/ux/scenarios.md`): a second user on the same Mac, the join, the move; then
`docs/reference/cli.md` and the README.
Accept: each new behaviour has a scenario and a test name.
Waits on: nothing; written with each row above.

### PC-156 (P3): an honest install time (I-25)

Needed: `setup --json` carries a timed receipt (start, end, steps), which the site's claim can cite.
Accept: a clean run under a new user produces a receipt with its duration.
Waits on: the site (passioncode-ai.github.io).

## Questions for fabric-workspace

1. Is `~/Applications` the rule for every user on every Mac (the MacBook too), or only where the `/Applications` copy
   is another user's or not writable? Who removes the shared copies, and when (runbook 3.5)? May the launcher move a
   copy the same user owns from `/Applications` to `~/Applications`?
2. Runbook 3.1: which Observatory command installs the engine under a new user with a new, empty vault and no import?
   Should the launcher call it, or should the runbook name it?
3. Which versions form `organization-r1` for a shared Mac, when is Fabric 0.3.16 published, and who records the re-pin?
4. CO-337: what shape does the join take (a command, a deep link, a call to the hub on the user's port)? Should the
   launcher call it or open Fabric's screen? One organization per macOS user?
5. Does Observatory's `machine-restore` copy `~/.passioncode`, `~/.agents/skills`, `~/.claude.json` and
   `installation.json`? Should the installation id be new per machine (a rule shared with Dashboards)?
6. Is "never ask for an administrator's password" the target for `setup` in every space?

## Waves

1. PC-151, PC-155 (scenarios for the second user), then PC-145, PC-146, PC-147 together: one branch, one release.
2. PC-148 once Fabric 0.3.16 and the FD-145 and SB-251 releases are out; PC-149.
3. PC-150 and PC-153 after the answers to questions 2 and 5; PC-152 after the contract's DEC; PC-154 after I-06.
4. PC-89 part 2 after CO-337 (2026-11-21); PC-156 with the site.
