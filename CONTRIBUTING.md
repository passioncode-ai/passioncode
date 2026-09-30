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
   `claude plugin validate ./payload --strict`.
4. Keep `package.json`, `plugin/passioncode/.claude-plugin/plugin.json` and the top
   `CHANGELOG.md` entry at one version.
5. A skill in `plugin/passioncode/skills/` changes together with its evals in
   `test/evals/<skill>/`.

## License of contributions

This repository is open source under the [GNU AGPL-3.0](LICENSE), or available under a
[commercial license](COMMERCIAL-LICENSE.md): `AGPL-3.0-only OR LicenseRef-PassionCode-Commercial`.
Contributions are accepted under the [Contributor License Agreement](CLA.md), which allows that
dual licence: tick its box in the pull request template.
