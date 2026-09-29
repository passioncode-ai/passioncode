# Contributing

The working rules are the organisation's
([org-index RULES.md](https://github.com/passioncode-ai/org-index/blob/main/RULES.md));
this repository's own are in [AGENTS.md](AGENTS.md).

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

This repository is source-available under
`PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0`
([LICENSE](LICENSE)). Contributions are accepted under the
[Contributor License Agreement](CLA.md): tick its box in the pull request template.
