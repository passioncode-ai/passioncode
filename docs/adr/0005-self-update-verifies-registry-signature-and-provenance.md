# ADR-0005: The self-update also verifies npm's registry signature and the build provenance

Status: accepted · 2026-11-05 · backlog: PC-131 (items 2 to 4), PC-142 · extends [ADR-0002](0002-self-update-trusts-named-publishers.md)

## Context

ADR-0002 made the hook install only a pinned version whose every npm maintainer and publisher is on
the plugin's trust list. That trusts what the npm registry says about who published, as read by the
probe; it does not check the bytes. LC-16 (fabric-workspace `knowledge/lifecycle.md`) asks every
product's update to verify an organization signature, and the PC-131 audit (2026-10-06) found that
no test refused a tampered package. Releases are published by `release.yml` through npm trusted
publishing with `--provenance`, so npm signs each version's integrity with its registry key and
records an SLSA provenance attestation: `npm view @passioncode-ai/passioncode@<v> dist --json` on
2026-11-05 shows every version from 0.2.50 to 0.2.75 carrying `https://slsa.dev/provenance/v1` and a
signature by keyid `SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`.

## Decision

- The probe asks `npm view --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org
  --workspaces=false @passioncode-ai/passioncode version maintainers _npmUser dist --json` and records, besides the version and the accounts,
  `dist.integrity`, the registry's `dist.signatures`, the provenance attestation's `predicateType` and
  the version they were read for (`verify` in `~/.passioncode/state.json`). It asks npm's registry
  whatever registry the person's npm uses, for the scope too (`--@passioncode-ai:registry`, which npm
  prefers over `--registry`): the pinned key speaks only for it, and a mirror that drops signatures or
  serves other bytes would otherwise decide what installs.
- `trust.json` pins npm's registry public key (`npmRegistryKeys`: `keyid` and the base64 DER key, as
  `https://registry.npmjs.org/-/npm/v1/keys` publishes it). The key ships with the plugin; the
  registry is never asked which key to trust. A pinned key that is not ECDSA P-256 verifies nothing,
  and the release build refuses a `trust.json` whose keys the hook would not load.
- The hook installs a version on its own only when, besides ADR-0002's conditions, one recorded
  signature over `@passioncode-ai/passioncode@<version>:<integrity>` verifies (ECDSA P-256, SHA-256)
  with a pinned key of the same `keyid`, and the provenance type is `https://slsa.dev/provenance/v1`.
  Otherwise it spawns nothing and says why in one line that names the installed version to keep
  using and links SECURITY.md; with `update.auto` off it does not offer the manual command for such
  a version either, and while a refusal stands the hook's other lines name the installed version, not
  `@latest` (which would run the refused version). `status` shows the refusal.
- A state recorded by an older probe (no `verify`), or whose `verify` was read for another version (an
  older plugin's probe keeps it beside its own answer: `verify` carries the time of the check that
  wrote it), installs nothing and starts a fresh probe at once.
- The update runs `npx --yes --cache=~/.passioncode/run/cache --registry=https://registry.npmjs.org --@passioncode-ai:registry=https://registry.npmjs.org --workspaces=false @passioncode-ai/passioncode@<version> update --quiet`;
  the manual command offered with `update.auto` off carries the same two flags.
- `release.yml` publishes only with provenance (it stops when the repository is not public), and its
  registry receipt (`scripts/check-registry.mjs`) runs the hook's own signature and provenance checks
  on the published version, so a release installed plugins would refuse fails in CI (after publishing:
  the version is already `latest`, and README's release steps say to publish a corrected one at once).
  It checks the new release's `trust.json`, not the previous one on people's machines (PC-142).
- Each check, refusal, download, install and switch change is a line of codes in
  `~/.passioncode/logs/update-events.log` (LC-16's log events), and the update logs rotate at 5 MB,
  five files kept (LC-12).

## Consequences

- Metadata whose integrity npm did not sign, a version signed by another key, a forged or missing
  signature, and a version published without provenance (for example from a laptop with a stolen
  token) are refused by the hook; bytes that differ from that integrity are refused by npm's own
  check when `npx` downloads them, when the metadata npm reads then is the signed one (see below). Tests: `test/self-update.test.js` (the refusal cases, a real 0.2.75
  signature checked against the shipped key in `test/fixtures/npm-dist-0.2.75.json`),
  `test/registry.test.js` (the release receipt), `test/vendor.test.js` (the build's key rule).
- The hook checks that the provenance attestation is present and of the SLSA v1 type; it does not
  verify the attestation's Sigstore bundle (that needs Sigstore's trust root and a network call) nor
  which repository or workflow built the version. The attestation sits in metadata the registry
  signature does not cover. npm validates the bundle at publish time, and the trusted-publisher
  identity (`github-actions-oidc`) is checked as before.
- `npx` downloads the tarball up to a day after the check, and npm checks it against the integrity
  it reads at that moment; the hook pins the verified version, so a different tarball for the same
  version would need the registry itself to serve other metadata than it signed, or the person's own
  npm settings (a proxy with `strict-ssl=false`, a custom `cafile`) to let something intercept that
  download. The hook does not check the tarball's bytes against the integrity it verified (PC-142).
  The probe and the update run in `~/.passioncode/run/` (a `package.json` with no dependencies), not in the session's
  project, whose `node_modules` npm would otherwise run from without downloading, and whose `.npmrc` it
  would read.
- **LC-16 is not fully met.** LC-16 asks for the organization's signature over the package (for a
  CLI, `SHA256SUMS` signed by the organization's release key, or an updater key that also signs the
  version). npm's key attests npm's copy, not PassionCode's; the launcher is distributed by npm and
  the bundled release key (`lib/release-key.asc`) signs the apps' downloads, not npm packages.
  Signing each npm version with the organization's key, and checking it here, is PC-142.
- **LC-12's log location is not met.** The update logs stay in `~/.passioncode/logs/` (with the
  rest of the launcher's state on all three platforms) rather than `~/Library/Logs/<Product>/`; the
  rotation, mode and code-only lines follow LC-12 and LC-16.
- When npm rotates its registry key, a release must add the new key to `trust.json` before npm signs
  with it. Machines with an older plugin then refuse automatic updates and say so; a person can update
  by hand (`npx @passioncode-ai/passioncode@<version> update`), as with a new publishing account. A
  key npm retires or revokes stays trusted until a release removes it: the pinned key carries no
  expiry. A scheduled check of npm's keys against `trust.json` is part of PC-142.
- `release.yml` cannot publish while the repository is private, because npm gives provenance only to
  a public repository and a release without it would install nowhere.
