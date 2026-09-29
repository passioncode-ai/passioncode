# passioncode

> **PassionCode.ai — The agent-agnostic operating system for AI-native teams.**

Every PassionCode.ai agent skill, for Claude Code and every other agent on your machine,
installed and updated as one set:

```bash
npx @passioncode-ai/passioncode@latest update
```

| Member | Skills |
|---|---|
| Fabric Agent Adapter | `creating-fabric-agents`, `adapting-projects-to-fabric`, `building-fabric-services` |
| Observatory Log | `explaining-changes`, `handling-secrets`, `tracking-resources` (+ its session hooks) |
| passioncode | `working-in-passioncode` (the organisation's working rules, for every contributor's agent) and the once-a-day update check |

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
npx passioncode status      # the installed release: its members, their channels, shadows
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
4. Merge, then tag the merge commit `vX.Y.Z` and push the tag. `.github/workflows/release.yml`
   validates, checks the tag against both manifests, creates the GitHub release from the
   CHANGELOG section, vendors every member **from its own repository** at its pinned tag,
   runs the tests, installs the packed tarball from a clean `HOME`, publishes
   `@passioncode-ai/passioncode` and waits until npm serves it. It runs when the repository
   variables `RELEASE_ENABLED` and `PUBLISH_NPMJS` are `true`; npm auth is trusted publishing
   (OIDC) or the `NPM_TOKEN` secret; a private member needs `MEMBERS_READ_TOKEN`.
   By hand, `npm publish` still works: `prepublishOnly` vendors from tags only (`--release`),
   refuses credential-shaped strings and runs the tests.
5. `npx @passioncode-ai/passioncode@<version> update` on each machine; restart the agents.

Vendoring clones every member from its own repository at its tag. A maintainer with
local clones can point the vendor at them instead — `PASSIONCODE_CHECKOUT_ROOT=<dir>`
reads a member from `<dir>/<repository name>`, and `PASSIONCODE_CHECKOUT_<MEMBER>=<path>`
(the member's name upper-cased, `-` as `_`) names one clone kept under another name.
`PASSIONCODE_VENDOR_CLONE=1` ignores both. `family.json` names no machine paths.

## License

Source-available under PolyForm Noncommercial or Internal Use; commercial license on
request (contact@passioncode.ai). SPDX:
`PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0` — see
[LICENSE](LICENSE). Versions up to and including v0.1.4 were released under the MIT
License and remain available under it. Contributions are accepted under [CLA.md](CLA.md)
([CONTRIBUTING.md](CONTRIBUTING.md)).
