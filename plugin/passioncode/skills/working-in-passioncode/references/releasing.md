# Releasing in passioncode-ai

Load this when you cut a release, bump a version, move a pin or tag anything. Each
repository's own `README.md` and `AGENTS.md` hold the exact commands; this file is the
shape they share and the order that matters.

## Contents

- Rules for every release
- The launcher (`passioncode`)
- The adapter (`fabric-agent-adapter`)
- The engine (`project-observatory-dashboard`)
- Contract pins
- After a release

## Rules for every release

1. The local gate is green **before** the tag: the repository's test command, its
   validator, and `claude plugin validate <dir> --strict` for every plugin it ships.
2. Every version field moves together: `package.json`, `.claude-plugin/plugin.json`,
   `.claude-plugin/marketplace.json`, SKILL.md `metadata.version` where present, and the
   top `CHANGELOG.md` entry. A validator or test in each repository holds them in sync.
3. Land first, then tag the commit on `main`. A tag pushed without its branch is a
   release that a fresh clone cannot reach.
4. A tag never moves. If `vX.Y.Z` exists — even on a commit you would not have chosen —
   the next release is `vX.Y.Z+1`. Check with `git ls-remote --tags origin`.
5. Before pushing a `v*` tag, read `gh variable list -R passioncode-ai/<repo>`. With
   `RELEASE_ENABLED` and `PUBLISH_NPMJS` both `true`, the tag publishes to npm as soon as
   Actions runs — including a re-run after the spending cap is lifted.
6. A GitHub release carries the version's CHANGELOG section:
   `gh release create vX.Y.Z --title "vX.Y.Z" --notes-file <section>`.
7. Write the handoff (objective, done, open, decisions, checks with exit codes, next
   task) in the same change.

## The launcher (`passioncode`)

1. Tag every member at the version to ship, in its own repository.
2. Set each member's `ref` in `family.json` to that tag. A member whose own release has
   not happened yet keeps its old ref; the integrator moves it later.
3. Bump `package.json` and `plugin/passioncode/.claude-plugin/plugin.json`, add the
   CHANGELOG section.
4. Vendor from tags only, from the member repositories rather than local checkouts:
   `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release`.
5. `claude plugin validate ./payload --strict`, then the same for each
   `./payload/plugins/<member>`; `npm test`.
6. Land on `main` (fast-forward), tag, push the tag.
7. Installing the new set on a machine (`passioncode update`) is the integrator's step,
   not the releaser's.

`payload/` is generated and never committed. A local checkout is used for a member only
when `PASSIONCODE_CHECKOUT_ROOT` (or a per-member `PASSIONCODE_CHECKOUT_<MEMBER>`)
points at one; otherwise the member is shallow-cloned at its tag.

## The adapter (`fabric-agent-adapter`)

The README section "Validate this repository" is the gate:

```bash
python3 -m unittest discover -s test -v
python3 test/validate.py
node --test 'test/*.test.mjs'
claude plugin validate ./plugins/fabric-agent-adapter --strict
claude plugin validate . --strict
```

`test/validate.py` carries the version it expects (`VERSION`); bump it with the
manifests. Trigger and scenario evals change before the instructional prose they test.

## The engine (`project-observatory-dashboard`)

- Contributors open PRs; `main` is protected and requires the three OS/Python checks.
- The release itself — build, sign-off, wheel, `SHA256SUMS` — is cut by the maintainer's
  release tooling, which is maintainer-only. Do not reconstruct it.
- The privacy gate runs before every public release:
  `python3 tools/check_public_release.py`.
- Machines move to a release with `project-observatory full update --check`, then
  `--apply` (verified and reversible).

## Contract pins

- Consumers declare their own explicit contract pins. Read the actual lock or
  submodule commit, then the owning consumer backlog and shared workspace view;
  do not infer compatibility from matching version labels.
- Moving a pin is a compatibility change of the **consumer**: run the consumer's own
  validation against the new contract commit (for the adapter:
  `adapt_project.py check <bundle> --contract <checkout at the new commit>` for each
  profile), review what changed between the two commits, and ship it as a new consumer
  release. If the validation does not pass, leave the pin and report why.
- `project-observatory-contract` preserves historical immutable `rev-N` tags. Current
  Project Observatory schemas ship with the engine release and its per-file release pins;
  the engine publication checker refuses the retired `--stage` and `--publish` operations.

## After a release

- The org map (`org-index/repositories.json`) changes in the same change when a role,
  dependency or test command changed.
- Report: the tag, the commit it points at, the GitHub release URL, the gate commands
  with exit codes, and whether hosted CI ran, was blocked, or waits for the nightly run.
