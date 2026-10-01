# Contributing

This file adds to the organization's default
[CONTRIBUTING.md](https://github.com/passioncode-ai/.github/blob/main/CONTRIBUTING.md); where the
two differ, this file wins. The organisation's full working rules are in the knowledge base,
[fabric-workspace `knowledge/rules.md`](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/rules.md)
(private, for members); this repository's own are in [AGENTS.md](AGENTS.md).

1. Branch from `origin/main` in a worktree; never switch a shared checkout.
2. Write the failing test first (`test/`), then the change.
3. Run the gate before you push: `npm test`. A release also runs
   `PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` and
   `claude plugin validate ./payload --strict`, followed by `node scripts/smoke-pack.mjs`.
4. Keep `package.json`, `plugin/passioncode/.claude-plugin/plugin.json` and the top
   `CHANGELOG.md` entry at one version.
5. A skill in `plugin/passioncode/skills/` changes together with its evals in
   `test/evals/<skill>/`.

## Documentation and recovery checks

The [documentation index](docs/README.md) names each contract's owner. Behaviour
changes update the [CLI contract](docs/reference/cli.md), affected scenarios and
their named regression evidence in the same change. `npm test` includes the
documentation gate and its negative test; `node scripts/check-docs.mjs` runs the
address/evidence checks alone. They resolve local Markdown targets, anchors,
source locations and test names, but do not judge prose correctness.

Run `actionlint` when changing workflows. The reusable validation workflow accepts
the release ref so a manual release validates its selected tag, not the branch the
workflow was dispatched from. `node scripts/check-registry.mjs PACKAGE VERSION`
waits separately for metadata and the canonical tarball, then verifies SHA-512.
Each phase allows 60 attempts with 10-second intervals and 15-second request
timeouts; an already-published version must pass this receipt too. The local
HTTP fixtures in `test/registry.test.js` cover metadata/archive propagation,
persistent 404, corrupt bytes and the wrong version. A tag release still needs the vendor and strict
plugin checks above; a successful source test run is not a publication receipt.

`scripts/test.mjs` enumerates explicit test paths so `npm test` also works on
Node 18, whose test runner does not expand quoted globs. Packed smoke uses the
Node executable that runs it and a fake Claude CLI; it does not test a live
Claude installation or npm publication.

Inside this source checkout, invoke `node bin/passioncode.js ...`. To test the
published CLI through `npx`, run it outside the package checkout: npm can select
the local package and fail to resolve its unlinked binary. Release 0.1.16 was
verified through a fresh temporary npm cache and from `/tmp`; see its
[release receipt](docs/handoffs/2026-10-01-release-0.1.16.md#published-release-receipt).

Run mutation/recovery tests only in isolated homes. Keep generated `payload/`,
tarballs, temporary homes and coordination state local-only. See the latest
[handoff](docs/handoffs/2026-10-01-launcher-audit.md) for exact verification scope.

## License of contributions

This repository is open source under the [GNU AGPL-3.0](LICENSE), or available under a
[commercial license](COMMERCIAL-LICENSE.md): `AGPL-3.0-only OR LicenseRef-PassionCode-Commercial`.
Contributions are accepted under the [Contributor License Agreement](CLA.md), which allows that
dual licence: tick its box in the pull request template.
