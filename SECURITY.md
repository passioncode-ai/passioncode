# Security

Report vulnerabilities privately to the maintainers of the `passioncode-ai` organization.

What `passioncode update` touches: `~/.passioncode/` (releases, state, quarantine,
logs); Claude Code's plugin registry through the `claude plugin` CLI only;
`~/.agents/skills/<member skill>` and `<agent channel>/<member skill>` links; and
`~/.claude/skills/<member skill>`, which it moves into the quarantine once the plugin
that replaces it is verified. It never deletes: every move is listed in
`~/.passioncode/quarantine/<run>/moved.json` and undone by `passioncode restore`.

The SessionStart hook reads `~/.passioncode/state.json`, may start `npm view passioncode
version` once a day and, with `update.auto` on, `npx --yes passioncode@latest update` —
both detached, logging to `~/.passioncode/logs/`. The published package carries skill
text only; the vendor step refuses to build when it finds a credential-shaped string.
