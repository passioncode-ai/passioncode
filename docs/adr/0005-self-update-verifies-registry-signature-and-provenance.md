# ADR-0005: The self-update also verifies npm's registry signature and the build provenance

Status: accepted · 2026-11-05 · backlog: PC-131 (items 2 and 4) · extends [ADR-0002](0002-self-update-trusts-named-publishers.md)

## Context

ADR-0002 made the hook install only a pinned version whose every npm maintainer and publisher is on
the plugin's trust list. That trusts what the npm registry says about who published, as read by the
probe; it does not check the bytes. LC-16 (fabric-workspace `knowledge/lifecycle.md`) asks every
product's update to verify an organization signature, and the PC-131 audit (2026-10-06) found that
no test refused a tampered package. Releases are published by `release.yml` through npm trusted
publishing with `--provenance` while the repository is public, so npm signs each version's integrity
with its registry key and records an SLSA provenance attestation (`npm view ... dist` on 2026-11-05:
0.2.60, 0.2.64, 0.2.66 to 0.2.70, 0.2.72, 0.2.74 and 0.2.75 all carry `https://slsa.dev/provenance/v1`).

## Decision

- The probe asks `npm view @passioncode-ai/passioncode version maintainers _npmUser dist --json` and
  records, besides the version and the accounts, `dist.integrity`, the registry's `dist.signatures`
  and the provenance attestation's `predicateType` (`verify` in `~/.passioncode/state.json`).
- `trust.json` pins npm's registry public key (`npmRegistryKeys`: `keyid` and the base64 DER key, as
  `https://registry.npmjs.org/-/npm/v1/keys` publishes it). The key ships with the plugin; the
  registry is never asked which key to trust.
- The hook installs a version on its own only when, besides ADR-0002's conditions, one recorded
  signature over `@passioncode-ai/passioncode@<version>:<integrity>` verifies (ECDSA P-256, SHA-256)
  with a pinned key of the same `keyid`, and the provenance type is `https://slsa.dev/provenance/v1`.
  Otherwise it spawns nothing and says why in one line ("its registry signature does not verify
  against the npm key pinned in this plugin" or "without a build provenance attestation"); with
  `update.auto` off it does not offer the manual command for such a version either.
- A state recorded by an older probe (no `verify`) installs nothing and starts a fresh probe at once,
  even when the last check is less than a day old.

## Consequences

- A package whose bytes differ from the ones npm signed, a version signed by another key, a forged
  or missing signature, and a version published without CI provenance (for example from a laptop
  with a stolen token) are refused. Tests: `test/self-update.test.js` (the refusal cases, a real
  0.2.75 signature checked against the shipped key in `test/fixtures/npm-dist-0.2.75.json`).
- The hook checks that the provenance attestation is present and of the SLSA v1 type; it does not
  verify the attestation's Sigstore bundle itself (that needs Sigstore's trust root and a network
  call). npm validates the bundle when the version is published, and the trusted-publisher identity
  (`github-actions-oidc`) is checked as before.
- `npx` downloads the tarball after the check and npm checks it against the integrity it reads at
  that moment; the hook pins the verified version, so a different tarball for the same version would
  need the registry itself to serve other metadata than it signed.
- When npm rotates its registry key, a release must add the new key to `trust.json` before npm signs
  with it. Machines with an older plugin then refuse automatic updates and say so; a person can update
  by hand (`npx @passioncode-ai/passioncode@<version> update`), as with a new publishing account.
- A manual `npm publish` without provenance is no longer installed automatically: releases go through
  `release.yml`. That workflow publishes without provenance while the repository is private
  (`.github/workflows/release.yml`, the publish step), so making the repository private would stop
  automatic updates on every machine until provenance comes back.
