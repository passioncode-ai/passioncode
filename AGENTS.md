# passioncode — working in this repository

Read this file and the organization's
[CONTRIBUTING.md](https://github.com/passioncode-ai/.github/blob/main/CONTRIBUTING.md) before the
first edit, then this repository's [CONTRIBUTING.md](CONTRIBUTING.md) (test first, one version,
the CLA). This repository's files win where they differ from the organization's.

## Role

`passioncode` is the npm launcher that installs every PassionCode.ai agent skill for Claude
Code and every other agent on a machine, and keeps them current as one set
(`npx @passioncode-ai/passioncode@latest update`). Members are vendored from their own repositories at a
pinned ref (`family.json`); Claude Code gets them from a local `passioncode` marketplace,
other agents through the `~/.agents/skills` hub (`README.md`).

## Build and test

```bash
npm test                    # node --test 'test/*.test.js' — the launcher against a temp HOME and a fake claude CLI
npm run vendor              # build payload/ from the members in family.json: a shallow clone of repo@ref
npm run vendor:release      # the same, refusing any ref that is not a tag
PASSIONCODE_CHECKOUT_ROOT=<dir> npm run vendor   # read members from local clones <dir>/<repo name> instead
npm run vendor -- --clone   # ignore local clones (also PASSIONCODE_VENDOR_CLONE=1; PASSIONCODE_GIT_BASE replaces git@github.com:)
claude plugin validate ./payload --strict
```

There is nothing to install: the launcher has no dependencies and no lockfile, so `npm ci`
refuses to run here; `npm test` works on a fresh clone. Hosted workflows exist (`validate.yml`
runs `node --test`; `release.yml` releases and publishes on a `v*` tag when `RELEASE_ENABLED` and
`PUBLISH_NPMJS` are `true`). The repository is public, so they run outside the organisation's
spending cap; the local gate above is still the evidence, and a skipped run is reported as skipped.

## Where things live

- `lib/launcher.js` (update, restore, status, uninstall), `bin/passioncode.js` (the CLI),
  `scripts/vendor.mjs` (the payload), `plugin/passioncode/` (the self-update SessionStart
  hook: `hooks/update-check.js` decides, `probe.js` asks npm, `session-start.js` acts;
  `trust.json` names the npm accounts allowed to publish).
- `plugin/passioncode/skills/working-in-passioncode/`: the organisation's working rules as
  a skill for every contributor's agent; its trigger and scenario evals are in
  `test/evals/working-in-passioncode/`, held to the Agent Skills standard by `test/skill.test.js`.
- Tests: `test/launcher.test.js` (fake `claude` in `test/fake-claude.js`),
  `test/self-update.test.js` (fake `npm`/`npx` on PATH), `test/vendor.test.js` (a local bare remote),
  `test/skill.test.js` (the self plugin's skills).
- Decisions: [docs/adr/](docs/adr/). What the launcher touches: [SECURITY.md](SECURITY.md).
- `payload/` is generated and never committed.

## Rules in this repository

- One channel per agent: nothing is ever written to `~/.claude/skills`.
- Nothing is deleted: every move goes to `~/.passioncode/quarantine/` and is undone by
  `passioncode restore`.
- A release vendors tagged bytes only (`npm run vendor:release`, run by `prepublishOnly`),
  and the vendor step refuses credential-shaped strings.
- The self-update never runs a version it has not attributed: only a pinned
  `@passioncode-ai/passioncode@<x.y.z>` whose every npm maintainer and publisher is in `trust.json`
  ([ADR-0002](docs/adr/0002-self-update-trusts-named-publishers.md)).
- Members are PassionCode.ai products only. An agent someone builds for themselves is never
  added, even when it implements a Fabric protocol.
- `family.json` names no machine paths: local clones are an environment override
  (`PASSIONCODE_CHECKOUT_ROOT`), never a committed path.
- `working-in-passioncode` summarises org-index and points to it; it never restates a long
  document. A rule that changes in org-index changes here in the next release.

## Organisation

This repository is one of the `passioncode-ai` repositories. **The org map, the shared
rules and onboarding live in [passioncode-ai/org-index](https://github.com/passioncode-ai/org-index)**
(private; readable by every org member):

- [README](https://github.com/passioncode-ai/org-index#repositories): which repository owns what, and how they connect
- [RULES.md](https://github.com/passioncode-ai/org-index/blob/main/RULES.md): branches, commits, CI, leases, secrets, handoffs
- [ONBOARDING.md](https://github.com/passioncode-ai/org-index/blob/main/ONBOARDING.md): setting up a new contributor's machine

Where this file is stricter than RULES.md, this file wins. A change to this repository's
role, dependencies or test command updates its row in `org-index/repositories.json` in the same change.
