# Security

Report vulnerabilities privately to contact@passioncode.ai. Do not open an issue that
carries credentials or a working exploit.

What `passioncode update` touches: `~/.passioncode/` (releases, state, quarantine,
logs); Claude Code's plugin registry through the `claude plugin` CLI only;
`~/.agents/skills/<member skill>` and `<agent channel>/<member skill>` links; and
`~/.claude/skills/<member skill>`, which it moves into the quarantine once the plugin
that replaces it is verified. For a member's old single-member marketplace
(`legacyMarketplaces` in `family.json`), once that plugin is verified and nothing else
installed comes from it, it also moves the `extraKnownMarketplaces` entry out of
`~/.claude/settings.json` (a copy of the file is kept in the quarantine) and runs
`claude plugin marketplace remove <name>`. Displaced files are moved rather than
deleted: a recovery record is written before the move in
`~/.passioncode/quarantine/<run>/moved.json`. `restore` processes the latest batch,
checkpoints completed entries and refuses to overwrite a conflicting user replacement.
`uninstall` removes owned links/plugins, clears the active release and disables
automatic updates; it retains release copies and recovery records. A failed removal
returns a nonzero exit code. See the [CLI recovery contract](docs/reference/cli.md).

## The self-update and who it trusts

The SessionStart hook reads `~/.passioncode/state.json` and reuses a check for up to
24 hours. An absent, invalid, future or expired timestamp starts
`npm view @passioncode-ai/passioncode version maintainers _npmUser --json`, detached, logging to
`~/.passioncode/logs/`. It records the latest version, the package's npm maintainers
and the account that published that version.

The hook installs a newer version on its own only when all of these hold:

- `update.auto` is on (the default);
- the npm probe exited successfully, the recorded maintainers are non-empty, the
  publisher is known, and every maintainer **and** the publishing
  account is listed in `trust.json` inside the plugin (`npmPublishers`);
  a release published by this repository's `release.yml` through npm trusted publishing
  appears as `github-actions-oidc` (npm's `npm-oidc-no-reply@github.com` identity, matched
  by email, never by display name), and only a maintainer can register that workflow;
- the version is a plain `x.y.z`.

It then runs `npx --yes @passioncode-ai/passioncode@<that exact version> update --quiet`, detached, so
the version that was checked is the version that runs. In every other case it spawns
nothing: a version from an account outside the list is reported in one line naming the
account ("… not a trusted PassionCode publisher — not installing"); a name nobody has
published (npm E404) is silent; a failed check is shown once.

The current allowlist lives in [`plugin/passioncode/trust.json`](plugin/passioncode/trust.json).
A missing or empty allowlist cannot authorize an update. Adding an account there is a release decision:
it is reviewed like code and ships in the package. A person who wants no background
updates at all runs `npx @passioncode-ai/passioncode@latest config set update.auto off`.

The package contains executable launcher code and member plugin hooks as well as
skill text. The vendor scans supported text-file sizes for credential-shaped strings
and rejects an invalid self-plugin trust list; that scan is not a proof that all
possible secrets or malicious code are absent. Review member code at its pinned tag.
Automatic updates trust the npm registry's attribution and the local cached state;
they do not independently verify signatures or sandbox the installed code.

Evidence: `update()`, `restore()` and `uninstall()` in `lib/launcher.js`;
`parseView()` and `decide()` in `plugin/passioncode/hooks/update-check.js`;
`scanForSecrets()` in `scripts/vendor.mjs`; regression tests in
`test/launcher.test.js` and `test/self-update.test.js`.
