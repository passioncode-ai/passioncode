# Security

Report vulnerabilities privately to the maintainers of the `passioncode-ai` organization.

What `passioncode update` touches: `~/.passioncode/` (releases, state, quarantine,
logs); Claude Code's plugin registry through the `claude plugin` CLI only;
`~/.agents/skills/<member skill>` and `<agent channel>/<member skill>` links; and
`~/.claude/skills/<member skill>`, which it moves into the quarantine once the plugin
that replaces it is verified. For a member's old single-member marketplace
(`legacyMarketplaces` in `family.json`), once that plugin is verified and nothing else
installed comes from it, it also moves the `extraKnownMarketplaces` entry out of
`~/.claude/settings.json` (a copy of the file is kept in the quarantine) and runs
`claude plugin marketplace remove <name>`. It never deletes: every move is listed in
`~/.passioncode/quarantine/<run>/moved.json` and undone by `passioncode restore`.

## The self-update and who it trusts

The SessionStart hook reads `~/.passioncode/state.json` and, at most once a day, starts
`npm view @passioncode-ai/passioncode version maintainers _npmUser --json`, detached, logging to
`~/.passioncode/logs/`. It records the latest version, the package's npm maintainers
and the account that published that version.

The hook installs a newer version on its own only when all of these hold:

- `update.auto` is on (the default);
- the recorded maintainers are not empty, and every maintainer **and** the publishing
  account is listed in `trust.json` inside the plugin (`npmPublishers`);
- the version is a plain `x.y.z`.

It then runs `npx --yes @passioncode-ai/passioncode@<that exact version> update --quiet`, detached, so
the version that was checked is the version that runs. In every other case it spawns
nothing: a version from an account outside the list is reported in one line naming the
account ("… not a trusted PassionCode publisher — not installing"); a name nobody has
published (npm E404) is silent; a failed check is shown once.

`trust.json` ships **empty**, so auto-update stays inert until the maintainers name the
npm account(s) that publish PassionCode. Adding an account there is a release decision:
it is reviewed like code and ships in the package. A person who wants no background
updates at all runs `npx passioncode config set update.auto off`.

The published package carries skill text only; the vendor step refuses to build when it
finds a credential-shaped string, or when the self plugin has no valid `trust.json`.
