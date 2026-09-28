# passioncode — working in this repository

## Role

`passioncode` is the npm launcher that installs every PassionCode.ai agent skill for Claude
Code and every other agent on a machine, and keeps them current as one set
(`npx passioncode@latest update`). Members are vendored from their own repositories at a
pinned ref (`family.json`); Claude Code gets them from a local `passioncode` marketplace,
other agents through the `~/.agents/skills` hub (`README.md`).

## Build and test

```bash
npm test                    # node --test test/ — the launcher against a temp HOME and a fake claude CLI
npm run vendor              # build payload/ from the member checkouts named in family.json
npm run vendor:release      # the same, refusing any ref that is not a tag
claude plugin validate ./payload --strict
```

There is no hosted CI: vendoring reads private member repositories.

## Where things live

- `lib/launcher.js` (update, restore, status, uninstall), `bin/passioncode.js` (the CLI),
  `scripts/vendor.mjs` (the payload), `plugin/passioncode/` (the self-update SessionStart hook).
- Decisions: [docs/adr/](docs/adr/). What the launcher touches: [SECURITY.md](SECURITY.md).
- `payload/` is generated and never committed.

## Rules in this repository

- One channel per agent: nothing is ever written to `~/.claude/skills`.
- Nothing is deleted: every move goes to `~/.passioncode/quarantine/` and is undone by
  `passioncode restore`.
- A release vendors tagged bytes only (`npm run vendor:release`, run by `prepublishOnly`),
  and the vendor step refuses credential-shaped strings.
- Members are PassionCode.ai products only. An agent someone builds for themselves is never
  added, even when it implements a Fabric protocol.

## Organisation

This repository is one of the `passioncode-ai` repositories. **The org map, the shared
rules and onboarding live in [passioncode-ai/org-index](https://github.com/passioncode-ai/org-index)**
(private; readable by every org member):

- [README](https://github.com/passioncode-ai/org-index#repositories): which repository owns what, and how they connect
- [RULES.md](https://github.com/passioncode-ai/org-index/blob/main/RULES.md): branches, commits, CI, leases, secrets, handoffs
- [ONBOARDING.md](https://github.com/passioncode-ai/org-index/blob/main/ONBOARDING.md): setting up a new contributor's machine

Where this file is stricter than RULES.md, this file wins. A change to this repository's
role, dependencies or test command updates its row in `org-index/repositories.json` in the same change.
