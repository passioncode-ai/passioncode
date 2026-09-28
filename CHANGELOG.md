# Changelog

## 0.1.1 - 2026-09-29

- `update --dry-run` says the plan changed nothing instead of reporting it as done.
  0.1.0 was tagged but never published.

## 0.1.0 - 2026-09-28

- First release: Fabric Agent Adapter 0.4.0 and Observatory Log 0.12.1 as Claude Code
  plugins from one local marketplace, and through the `~/.agents/skills` hub for every
  other agent.
- Replaces the old single-member plugin installs, and moves shadowing
  `~/.claude/skills` entries and working-tree hub links into a restorable quarantine.
- Once-a-day update check at session start with a background update (`update.auto`).
