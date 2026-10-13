# ADR-0004 — `setup` sets up a new machine and repairs an existing one; `doctor` checks, read-only

Status: accepted · 2026-10-13 · brief: [docs/tasks/2026-10-13-setup-doctor.md](../tasks/2026-10-13-setup-doctor.md)

## Context

A new person was walked through the setup by hand: the launcher for the skills, then each app's
download page, its MCP registration command and its proving call, then each product's own
onboarding. The organization decided on 2026-10-10 that a coding agent does every setup step it
can ([agents-first](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/agents-first.md)),
and asked for one family setup entry that runs the products' own `onboard` guides
([fabric-agent-adapter#49](https://github.com/passioncode-ai/fabric-agent-adapter/issues/49)).
On 2026-10-13 the operator asked for one command and a doctor that checks the whole setup and
fixes what it can.

Every product release carries `SHA256SUMS`, `SHA256SUMS.asc` signed by the organization's release
key (passioncode-ai/.github `release-signing/`) and, on macOS, a Developer ID signature from team
`KJ35UYYL22`, notarized and stapled (each release's receipt says so). The site resolves versions
and checksums from GitHub's asset digests and checks no signature.

## Decision

1. **`setup` (alias `onboard`) is one idempotent command for a new machine and an existing setup**
   (operator, 2026-10-13: "if it is a new setup — set it up; if an old one — check that everything
   is set up correctly and fix the problems"). It always runs the doctor's checks first, plans,
   asks, applies, checks again, and prints a before → after table and one list of the steps that
   stay a person's. What it may apply:
   - **install** an absent app the person chose (all of them with `--yes`; Fabric only when its
     prerequisites are present or it is asked for with `--with fabric`), then open it once;
   - **update**: the skill set and the bundled MCP registrations (`passioncode update`);
   - **replace** an app that is outdated or fails its signature checks **and is not running**,
     from its latest verified release; the old bundle is moved to the person's Trash, never
     deleted, and put back if the copy fails; a running app is never touched — the person quits it
     or accepts the app's own update;
   - **kickstart** a family service that does not answer and whose descriptor names a launchd
     label: `launchctl kickstart gui/<uid>/<label>` (no `-k`: it starts, it never kills).
   On a healthy machine the plan is empty, nothing changes, and it exits 0.
2. **No unverified bytes.** An app is installed only after all of: `SHA256SUMS.asc` verifies
   against the release key bundled in the package (`lib/release-key.asc`, pinned by fingerprint
   `63B30DC324BD697487AA31944FAFB8AEC803B6A7`, checked in pure Node — no gpg); the asset's SHA-256
   equals its `SHA256SUMS` line **and** GitHub's digest; the extracted app passes
   `codesign --verify --strict`, names Team ID `KJ35UYYL22`, and passes `xcrun stapler validate` and
   `spctl --assess --type execute`. A failure removes the download and installs nothing. Sigstore
   attestations are not checked (that needs `gh`); the chain above does not depend on them.
3. **macOS installs apps; every system gets the rest.** Apps are installed on macOS; on other
   systems setup does the skills and MCP and names each app's download page.
4. **MCP registration generalises ADR-0003** to every stdio server inside an installed app
   bundle — `fabric-dashboards`, `switchboard` (`switchboard mcp`; skipped for Claude Code when the
   `switchboard` plugin already serves it) and `fabric` (`fabric-mcp --runner
   <claude-code|codex|kimi-code>`; Fabric has no Gemini runner). Fabric is an early preview, and
   every coding session in a Fabric project starts its server, which asks the person for
   consent: so only `setup` (and `doctor --fix`) registers it, never `update` alone, which the
   background self-update runs. An entry matches only with the same command and arguments — with ADR-0003's rules unchanged: absent means
   skipped, Claude Code through its CLI, never clobber, journalled and reversible. Observatory
   (a server in its own virtualenv) and Fabric Inbox (a remote server per person, its key in the
   keychain) register through their own `onboard`; setup lists that step and doctor checks it.
5. **`doctor [--json]` reads, and changes nothing**: prerequisites, each app's installed version
   against its latest release, its signature and Team ID, the Fabric service descriptors of family
   products and their `/.well-known/fabric-service`, each agent's MCP entry for each installed
   product, one proving call per distinct registered stdio command (`initialize`, `tools/list`,
   then one read-only tool). Fabric's server is never started: `fabric-mcp` enrols a session with
   Fabric's hub as soon as it starts, so doctor checks its entry and binary, and the agent's own
   `fabric_whoami` is its proving call (corrected 2026-10-13 after the seam review of PR #92),
   and the skill set (members, hub links, shadows). Every line names its state and the exact fix;
   exit 1 when a check fails. It is what a button and an agent run. **`doctor --fix` is setup's
   repair half**: the same update, replace and kickstart, with no new app installed and nothing
   opened. Neither ever stops or kills a process; an on-demand app that is not running is
   information, and its line names the documented way to open it.
6. **Agents know it.** The self plugin carries `setting-up-passioncode`; doctor saves its last
   result to `~/.passioncode/doctor.json`, and the SessionStart hook prints one line when that
   result has failures. The hook never runs doctor.

## Consequences

- One `npx @passioncode-ai/passioncode@latest setup` takes a Mac with Node 18 from nothing to the
  apps, the skills and the MCP servers for every agent on it; a person is left with sign-ins,
  consents and secrets, listed once.
- The launcher now downloads and installs signed apps. Its trust root is one bundled key, a
  pinned team ID and Apple's notarization; a new release key means a launcher release.
- `doctor` spawns the registered MCP commands, as an agent does at session start, and stops
  them when the proving call returns.
- Running `setup` again is the answer to "is my setup still right?": a new person and a returning
  one type the same command.
- The launcher still serves no MCP server of its own.
