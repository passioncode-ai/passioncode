# ADR-0001 — A separate launcher that vendors its members, sharing sshlg-skills' doctrine, not its code

Status: accepted · 2026-09-28

## Context

The operator chose a separate `passioncode` package over a second family inside
`sshlg-skills` (Fabric Dashboards brief, D-3), with the recommendation that the engine
be reused as a dependency. Measured on 2026-09-28: `sshlg-skills` 1.52.2 declares no
`main` or `exports`; its update probe, runner and hooks hard-code the name
`sshlg-skills` and `~/.sshlg-skills`; and its reusable planner builds `skills add
<owner/repo>` commands, which clone from GitHub — while the members live in private
repositories.

## Decision

`passioncode` vendors each member's committed bytes (git archive at a tag) into its npm
package and installs them from there: a local directory marketplace for Claude Code, the
`~/.agents/skills` hub for other agents. It adopts `sshlg-skills`' rules — one channel
per agent, no plain `~/.claude/skills` copies, reversible prune, one update clock — and
none of its code.

## Consequences

- Installing needs npm only, no GitHub credentials.
- Members are PassionCode.ai products only; an operator's personal agents are never
  members (operator, 2026-09-29).
- If `sshlg-skills` ever exports an engine, this launcher can adopt it without changing
  its install layout.
