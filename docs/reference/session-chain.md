# Sessions started by Fabric: what the launcher prepares

A board request that no live session takes makes Fabric start a session of the machine's default agent in the
project's folder. That session gets the request, does the work, reports on the request's thread and ends. Nobody
is at the keyboard to answer a prompt, so everything the session needs must already be on the machine. This page
says which part of that chain belongs to the launcher, which to Fabric and which to Fabric Switchboard, and what the
launcher does not do yet (PC-124).

The rule and the flow are Fabric's:
[its specification at `39b68cca`](https://github.com/passioncode-ai/fabric/blob/39b68cca01112b590b499fd5659953de33960dab/docs/evidence/specs/2026-11-04-on-demand-sessions.md),
sections 2 to 5.

## Who does what

| Step | Owner | Where it is decided |
| --- | --- | --- |
| Find a request nobody took (2 minutes of grace, at most 2 such sessions per machine and 1 per project) and watch the run | Fabric | the specification, §3.1, §3.3 and §3.6 |
| Choose the agent: Switchboard's default agent, Claude Code when none is set | Fabric and Switchboard | the specification, §2 |
| Start that agent with no person present (`claude -p`, or `codex exec` for Codex), on an account with room, and record the run, on macOS and Windows | Fabric Switchboard (`switchboard dispatch`, new in wave 1) | the specification, §3.5 and §4 |
| Set the permission mode the session runs in | Fabric (`agentPermissions` in its settings) | the specification, §2 |
| Install the apps, their MCP servers in each agent, the skill set and Claude Code's rules for PassionCode's tools and commands | the launcher (`setup`) | this page, below |
| Take the request, do the work, report and end | Fabric Agent Adapter (`working-with-fabric`) | the specification, §4 |
| Keep a readable record of the rules `setup` added, for Fabric's permissions screen | the launcher (`permissions`, from 0.2.75, PC-125) | the CLI contract of 0.2.75 |
| Check that the default agent's prerequisites are in place | the launcher (`doctor`, the `sessions.on-demand` row, from 0.2.76) | [CLI contract: setup and doctor](cli.md#setup-and-doctor) |

## What the launcher installs today

- **The apps.** `setup` installs Fabric, Fabric Switchboard and the other apps on macOS
  ([lib/setup.js:63](../../lib/setup.js#L63)); on Windows and Linux it names each app's download page, and on Windows
  `doctor` reads which version of each app is installed ([README: set it up](../../README.md#set-it-up-with-your-coding-agent)). The apps are listed in
  [lib/catalog.js:21](../../lib/catalog.js#L21).
- **The MCP servers in each agent.** The apps' servers, Fabric's `fabric-mcp` among them, are registered in Claude Code,
  Codex, Gemini CLI and Kimi Code ([lib/catalog.js:14](../../lib/catalog.js#L14)). `fabric-mcp` is started with the
  agent's runner name, so a session it starts enrolls in the project as that agent
  ([lib/catalog.js:60](../../lib/catalog.js#L60)).
- **The skills.** The skill set ([family.json](../../family.json)) carries Fabric Agent Adapter, whose
  `working-with-fabric` skill is what a started session follows to take the request, report and end.
- **Claude Code's rules.** `setup` offers two sets, each with its own question, default no, and never taken by
  `--yes` alone: the rules for PassionCode's own tools (`mcp__fabric` and the others,
  [lib/permissions.js:11](../../lib/permissions.js#L11), or `--allow-tools`) and the rules for commands (the
  launcher's `Bash(gh pr merge:*)`, [lib/permissions.js:16](../../lib/permissions.js#L16), and the rules an agent of
  the person's own declares in `~/.passioncode/rules.d/`, or `--allow-commands`). Without them, a session Fabric starts
  stops at the first prompt for these tools unless Fabric's permission mode lets it act without asking.

The launcher sets no permission mode during `setup`. `permissions mode` (from 0.2.75) sets
`permissions.defaultMode` in Claude Code's settings only when a person or Fabric's screen asks for it.

## Not done yet

- On Windows the launcher does not install the apps; it names their download pages. A Windows machine needs Fabric and
  Fabric Switchboard installed by hand before Fabric can start a session there.
- `doctor` checks the prerequisites as one row, `sessions.on-demand` (from 0.2.76), for Claude Code only: when
  Switchboard names another default agent, that agent's prerequisites are not checked yet, so a machine without
  Claude Code reads as information, not as a warning.
- Which agent is the default and which permission mode a started session gets are read from Switchboard and Fabric;
  the launcher neither sets nor reports them.
