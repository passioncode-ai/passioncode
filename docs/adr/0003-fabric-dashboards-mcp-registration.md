# ADR-0003 — The launcher registers the Fabric Dashboards MCP server for every agent

Status: accepted · 2026-10-12

## Context

`passioncode update` put the skills in place for every agent but left each agent's MCP
configuration alone, so the Fabric Dashboards MCP server — the way an agent lists,
starts and reads the machine's Fabric services — was registered by hand on each machine,
per agent. Hand-set entries drift and new agents never get one. Measured on 2026-10-12
on the operator's machine: `~/.claude.json`, `~/.gemini/settings.json` and
`~/.kimi-code/mcp.json` each carried a hand-written `fabric-dashboards` entry, and
`~/.codex/config.toml` carried none.

## Decision

`update` (and `install`) registers the server — name `fabric-dashboards`, stdio, the app
bundle's `Resources/bin/fabric-dashboards-mcp`, no arguments, no environment — for every
supported agent that is present: Claude Code (through its own CLI,
`claude mcp add --scope user fabric-dashboards -- <binary>`, detected by that CLI; the
result is read back from `~/.claude.json`), Codex CLI (`~/.codex/config.toml` →
`["mcp_servers"."fabric-dashboards"]`, detected by the `~/.codex` directory), Gemini CLI
(`~/.gemini/settings.json` → `mcpServers`) and Kimi Code (`$KIMI_CODE_HOME/mcp.json`,
default `~/.kimi-code/mcp.json`). The rules are the launcher's own:

- **Absent means skipped.** Without the app bundle's binary — every non-macOS machine —
  the step reports and does nothing; the launcher stays usable without Fabric
  Dashboards. An agent that is not present gets no registration and no invented config.
- **Claude Code writes its own file.** Every running Claude Code session rewrites
  `~/.claude.json` as a whole, so a second writer there loses one side's change. The
  launcher only reads that file; it adds and removes the entry with `claude mcp add` and
  `claude mcp remove --scope user`, the way it already drives `claude plugin`.
- **Never clobber.** An entry that already points at the same command is left alone; one
  that points elsewhere (or is not a stdio server) is reported and kept. A config file
  that does not parse fails the step instead of being rewritten. The Codex TOML is
  edited by appending one table, never by re-serialising the file; a config that already
  names the server some other way (an inline `fabric-dashboards = { … }` under
  `[mcp_servers]`, or a `[mcp_servers.fabric-dashboards.env]` sub-table) is left alone,
  because a second declaration of the key would make Codex refuse the whole file.
- **Reversible, nothing deleted.** A file is copied into the run's quarantine before the
  launcher first rewrites it; each registration is recorded in `moved.json` before the
  file changes (undo with
  `passioncode restore`) and in `state.json` (`mcpRegistrations`, removed by
  `passioncode uninstall`). Removal happens only while the entry is still exactly what
  the launcher wrote, compared at every depth — a hand edit since then (a changed
  command, an added `env` variable) is kept. An entry the launcher did not add
  is never adopted, so uninstall never removes a hand-set registration.

## Consequences

- One `npx @passioncode-ai/passioncode@latest update` brings a machine to "skills,
  plugins and the Fabric Dashboards MCP" for every agent on it, and re-running it is a
  no-op.
- Each change is backed up first and reversible, but an agent that caches its MCP
  configuration needs a restart to see the server, as with skills.
- The launcher writes three agent-owned config files (Codex, Gemini, Kimi) and asks
  Claude Code's CLI to change the fourth.
- A fifth agent means a new target in `mcpFileTargets` and a test; the detection rules
  (Claude Code's CLI, a directory for the rest) are the ones this machine shows.
