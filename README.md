# passioncode

> **PassionCode.ai — The agent-agnostic operating system for AI-native teams.**

Every PassionCode.ai agent skill, for Claude Code and every other agent on your machine,
installed and updated as one set:

```bash
npx passioncode@latest update
```

| Member | Skills |
|---|---|
| Fabric Agent Adapter | `creating-fabric-agents`, `adapting-projects-to-fabric`, `building-fabric-services` |
| Observatory Log | `explaining-changes`, `handling-secrets`, `tracking-resources` (+ its session hooks) |
| passioncode | the once-a-day update check |

Only PassionCode.ai products are members. Agents that people build for themselves stay
out of it, even when they implement Fabric protocols.

## How it installs

- **Claude Code** gets plugins from a local marketplace named `passioncode` at
  `~/.passioncode/current` — no GitHub access needed. A plugin that was installed from
  its old single-member marketplace (`fabric-agent-adapter@fabric-agent-adapter`,
  `observatory-log@observatory-log`) is replaced once the new one is verified.
- **Every other agent** (Cursor, Codex, Gemini, OpenCode, Kiro, Windsurf, Goose, …) gets
  the same skills through `~/.agents/skills`, linked from each channel that exists on
  the machine.
- Nothing is written to `~/.claude/skills`: a plain copy there shadows the plugin. Such
  copies, and hub entries that pointed at a repository's working tree, are moved into
  `~/.passioncode/quarantine/` — `npx passioncode restore` puts them back.
- Each version is an immutable release under `~/.passioncode/releases/<version>`.

## Staying current

At every Claude Code session start the `passioncode` plugin checks npm at most once a
day and, when a newer set is out, updates it in the background — it takes effect in
the next session. `npx passioncode config set update.auto off` makes it only say so.

```bash
npx passioncode status      # installed version, per-member channels, shadows
npx passioncode update --dry-run
npx passioncode uninstall
```

## Release (maintainers)

1. Tag every member at the version to ship; set `ref` to that tag in `family.json`.
2. Bump `version` here, add the CHANGELOG section.
3. `npm publish` — `prepublishOnly` vendors from tags only (`--release`), refuses
   credential-shaped strings, and runs the tests.
4. `npx passioncode@latest update` on this machine; restart the agents.
