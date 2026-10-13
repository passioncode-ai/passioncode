# ADR-0004 — `setup` installs verified apps and registers their MCP; `doctor` checks and fixes only what `update` may

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

1. **`setup` (alias `onboard`)** plans, asks, then applies, in this order: prerequisites and agents
   detected → absent apps installed → the skill set (`update`) → MCP registrations → apps it
   installed opened → one list of the steps that stay a person's.
2. **No unverified bytes.** An app is installed only after all of: `SHA256SUMS.asc` verifies
   against the release key bundled in the package (`lib/release-key.asc`, pinned by fingerprint
   `63B30DC324BD697487AA31944FAFB8AEC803B6A7`, checked in pure Node — no gpg); the asset's SHA-256
   equals its `SHA256SUMS` line **and** GitHub's digest; the extracted app passes
   `codesign --verify --strict`, names Team ID `KJ35UYYL22`, and passes `xcrun stapler validate` and
   `spctl --assess --type execute`. A failure removes the download and installs nothing. Sigstore
   attestations are not checked (that needs `gh`); the chain above does not depend on them.
3. **Absent apps only.** An app already in `/Applications` is never replaced or moved: each
   product updates itself through its own signed updater; `doctor` reports it outdated. Apps are
   installed on macOS only; on other systems setup does the skills and MCP and names the
   download page.
4. **MCP registration generalises ADR-0003** to every stdio server inside an installed app
   bundle — `fabric-dashboards`, `fabric` (`fabric-mcp --runner <claude-code|codex|kimi-code>`;
   Fabric has no Gemini runner) and `switchboard` (`switchboard mcp`; skipped for Claude Code when
   the `switchboard` plugin already serves it) — with ADR-0003's rules unchanged: absent means
   skipped, Claude Code through its CLI, never clobber, journalled and reversible. Observatory
   (a server in its own virtualenv) and Fabric Inbox (a remote server per person, its key in the
   keychain) register through their own `onboard`; setup lists that step and doctor checks it.
5. **`doctor [--fix] [--json]`** reads: prerequisites, each app's installed version against its
   latest release, its signature and Team ID, the Fabric service descriptors of family products
   and their `/.well-known/fabric-service`, each agent's MCP entry for each installed product,
   one proving call per distinct registered stdio command (`initialize`, `tools/list`, then one
   read-only tool; Fabric `initialize` only, because `fabric_whoami` enrols a session), and the
   skill set (members, hub links, shadows). Every line names its state and the exact fix.
   `--fix` applies only what `update` may already change — the skill set and missing MCP
   registrations — then checks again. It never installs or replaces an app and never starts,
   stops or kills a process: an on-demand app that is not running is information, and the fix
   line names the documented way to open it.
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
- The launcher still serves no MCP server of its own.
