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
  `observatory-log@observatory-log`) is replaced once the new one is verified, and that
  marketplace is unregistered and taken out of `settings.json` once nothing installed
  comes from it.
- **Every other agent** (Cursor, Codex, Gemini, OpenCode, Kiro, Windsurf, Goose, …) gets
  the same skills through `~/.agents/skills`, linked from each channel that exists on
  the machine.
- Nothing is written to `~/.claude/skills`: a plain copy there shadows the plugin. Such
  copies, and hub entries that pointed at a repository's working tree, are moved into
  `~/.passioncode/quarantine/` — `npx passioncode restore` puts them back.
- Each version is an immutable release under `~/.passioncode/releases/<version>`.

## Staying current

At every Claude Code session start the `passioncode` plugin checks npm at most once a
day and, when a newer set is out **and every npm account that publishes it is in the
plugin's `trust.json`**, updates to that exact version in the background — it takes
effect in the next session. A version published by anyone else is named and not
installed ([SECURITY.md](SECURITY.md#the-self-update-and-who-it-trusts)).
`npx passioncode config set update.auto off` makes it only say so.

```bash
npx passioncode status      # installed version, per-member channels, shadows
npx passioncode update --dry-run
npx passioncode uninstall
```

## Release (maintainers)

1. Tag every member at the version to ship; set `ref` to that tag in `family.json`.
2. Bump `version` in `package.json` and `plugin/passioncode/.claude-plugin/plugin.json`
   (a test holds them and the CHANGELOG in sync), add the CHANGELOG section.
3. The npm account that publishes must be listed in `plugin/passioncode/trust.json`
   (`npmPublishers`), and be the package's only kind of maintainer — otherwise every
   installed hook refuses the update and says so.
4. `npm publish` — `prepublishOnly` vendors from tags only (`--release`), refuses
   credential-shaped strings, and runs the tests. Members are read from `checkout` when
   it exists, otherwise shallow-cloned from `repo` over SSH with your own key
   (`npm run vendor -- --clone` forces the clone).
5. `npx passioncode@<version> update` on this machine; restart the agents.
