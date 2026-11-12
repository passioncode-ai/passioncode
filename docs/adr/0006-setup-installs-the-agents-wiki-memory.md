# ADR-0006: `setup` installs the agents' wiki memory: Obsidian by its vendor's own chain, obsidian-wiki as a pinned tool

Status: accepted · 2026-11-12 · backlog: PC-178 · brief: [docs/tasks/2026-11-12-pc-178-memory.md](../tasks/2026-11-12-pc-178-memory.md) · amends [ADR-0004](0004-setup-installs-verified-apps-and-registers-their-mcp.md) decision 2

## Context

The operator, 2026-11-12: «давай передадим в анбординг скрипт passioncode организации установку сразу туда вместе с
софтом и обсидиан мемори вот эту чтобы она там работала и обсидиан вместе с ней конечно же». The PassionCode.ai setup
(`npx @passioncode-ai/passioncode@latest setup`) is to install the agents' wiki memory as well: the open-source
`obsidian-wiki` package (github.com/Ar9av/obsidian-wiki, MIT, PyPI `obsidian-wiki`) with a vault of its own, and the
Obsidian app a person reads that vault in, on every machine and for every macOS user (Studio spaces included). Only the
mechanics travel: no vault content of anyone's is shipped or read.

Two facts shape it. Obsidian's releases (`obsidianmd/obsidian-releases`, tag `v<x.y.z>`, the universal macOS image
`Obsidian-<x.y.z>.dmg`) carry no PGP-signed `SHA256SUMS`, so ADR-0004's chain cannot apply; each asset has GitHub's
`digest`, and the app is signed by Dynalist Inc.'s Developer ID, team `6JSW4SJWN9` (read on the operator's Mac with
`codesign -dv /Applications/Obsidian.app`, 2026-11-12; v1.15.0's image digest is
`sha256:d3f837e6fd3efaf65fa0bec987b18296982995d4ddae3171a7f7f67e0e2b7aa8`). And `obsidian-wiki setup` from 2026.11
registers two Claude Code hooks unless told `--no-hooks`; one of them (Stop) wakes every editing session in every
project, after every turn, to write into the vault. On the operator's machine that hook was rolled back the same day.

## Decision

1. **Obsidian is an app, verified by a chain of its own.** It is installed and replaced like the PassionCode.ai apps
   (`lib/catalog.js` `OBSIDIAN`, placement by `appPath`, PC-145 to PC-147: this user's `~/Applications`, never another
   user's copy, never while it runs), but `releases.installApp` checks it differently: the downloaded asset's SHA-256
   must equal GitHub's release asset `digest` (a release without one installs nothing), then the mounted app must pass
   `codesign --verify --strict`, name team `6JSW4SJWN9` (PassionCode.ai's own team does not pass for it), pass
   `xcrun stapler validate`, and pass `spctl --assess --type execute` with `source=Notarized Developer ID`. A failure
   installs nothing. Trust rests on Apple's notarization and the pinned team; GitHub's digest protects the transfer
   only, since whoever can publish the release sets it. A release train pins PassionCode.ai apps only, so Obsidian
   follows its latest release (it also updates itself inside the app). Other systems: `doctor` names
   https://obsidian.md/download, and setup installs no Obsidian.
2. **obsidian-wiki is a tool pinned by the launcher release**, like the skills (`family.json`), not by a train:
   `catalog.WIKI.pin`, `2026.11.4` at this decision. It is installed with `uv tool install obsidian-wiki==<pin>`, and an
   older one is brought up with `uv tool install --force obsidian-wiki==<pin>` only when `uv tool list` shows uv
   installed it (a copy another tool installed is named, not replaced). A newer one is left alone. Without `uv` on
   PATH (or where uv's installer puts it), setup names a step: install uv from its documented page
   (https://docs.astral.sh/uv/getting-started/installation/); the launcher never runs `curl | sh`.
3. **A vault only for a user who has none.** When neither `~/.obsidian-wiki/config` nor
   `$XDG_CONFIG_HOME/obsidian-wiki/config` (default `~/.config/obsidian-wiki/config`, where 2026.11 writes) exists,
   setup makes the vault: `~/Documents/Wiki`, or the folder `--wiki-vault` names (absolute); `git init -b main` in it
   when it has no `.git`; `obsidian-wiki setup --no-hooks --vault <dir>` with no terminal (its own questions are skipped);
   then, where Claude Code is (`~/.claude`), `obsidian-wiki hooks install --only SessionStart`: the read-only recap of the
   vault at session start. A folder that already holds files is never made a vault: the plan names it and asks for
   `--wiki-vault`. An existing config or vault is left exactly as it is: the launcher never runs `obsidian-wiki setup`
   over a config (the operator's decision records that it rewrote a person's custom keys).
4. **The Stop hook is never the launcher's.** Setup never registers it and never removes one someone registered;
   `doctor` names it as information (`memory.hooks.stop`), with its machine-wide effect and the person's choice
   (`gate: consent`) to remove it with `obsidian-wiki hooks uninstall --only Stop`. Hints `doctor` passes on from
   `obsidian-wiki doctor` are made safe the same way: `obsidian-wiki setup` gains `--no-hooks`, `hooks install` gains
   `--only SessionStart`.
5. **`doctor` reads the memory** (area `memory`): Obsidian (installed, version against its latest, signature and team,
   a copy in `/Applications` left as it is), obsidian-wiki (found by name on PATH or where uv puts it, version against
   the pin, a warning when it is not on PATH), the config and vault (`obsidian-wiki doctor --json`: its `fail` is a
   failure, its `warn` a warning, with the names of the checks that fail), and the hooks (SessionStart registered or
   not, Stop as above). Each fix carries `gate` per PC-171: null wherever an agent can do it.
6. **Selection.** The memory is offered by default with the apps (`--yes` takes it); `--with` and `--without` take
   `obsidian`, `wiki`, and `memory` for both; `--no-apps` leaves the memory out too, and so does a saved release train
   this launcher cannot use (setup installs nothing new until the train is usable). `doctor --fix` never makes a vault
   or installs obsidian-wiki; it brings an older one up to the pin.
7. **An agent folder that holds only skill folders is not that agent.** `obsidian-wiki setup` makes `skills` folders for
   every agent it knows (`~/.codex/skills`, `~/.gemini/skills`, and more), so the launcher no longer counts a folder that
   holds nothing but `skills` (and Gemini's `antigravity`) as Codex, Gemini or Kimi being installed, and registers no MCP
   server there (`lib/launcher.js` `agentFolder`). An empty folder still counts, as before.

## Consequences

- One `setup` gives a new machine a working wiki memory: the tool, its skills in each agent's own folder (written by
  obsidian-wiki's setup, its own channel, never by the launcher), a vault that is a Git repository, the session-start
  recap in Claude Code, and Obsidian to read it.
- The launcher now trusts one vendor beyond PassionCode.ai: Dynalist Inc.'s Developer ID and Apple's notarization for
  Obsidian, and PyPI (through uv) for obsidian-wiki at a pinned version. A new pin is a launcher release.
- `setup` runs `uv`, `git` and `obsidian-wiki` (each with no terminal, each capped in time); `doctor` runs
  `obsidian-wiki --version`, `doctor --json` and `hooks status --json`, which read only.
- `uninstall` and `restore` leave the memory alone: the tool, the vault and its hook are the person's once made.
