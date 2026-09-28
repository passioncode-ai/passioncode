# Changelog

## 0.1.0 - 2026-09-28

- First release: Fabric Agent Adapter 0.4.0, Observatory Log 0.12.0, Mobile Publisher
  0.1.0 and Asset Foundry 0.2.0 skills as Claude Code plugins from one local
  marketplace, and through the `~/.agents/skills` hub for every other agent.
- Replaces the old single-member plugin installs, and moves shadowing
  `~/.claude/skills` entries and working-tree hub links into a restorable quarantine.
- Once-a-day update check at session start with a background update (`update.auto`).
