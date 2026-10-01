# Dashboard routing distribution — 2026-10-01

Objective: distribute Fabric Agent Adapter 0.5.6 through the same set every supported
agent updates. `family.json` pins its released tag. Launcher 0.1.17 leaves the
Observatory Log member at plugin 0.13.0 (Project Observatory tag v0.10.0).

Source integration: [PR #23](https://github.com/passioncode-ai/passioncode/pull/23),
commit `d65767b`; tag `v0.1.17`.

Local checks actually run: `npm test` (91 passed),
`PASSIONCODE_VENDOR_CLONE=1 npm run vendor:release` (adapter v0.5.6 at
`1b473987feeeb04ee67a1122d6baadc83bc03816`),
`claude plugin validate ./payload --strict` (exit 0), and
`node scripts/smoke-pack.mjs` (PASS: update, status, unsupported dry-run,
uninstall, repeat uninstall, restore; temporary home and fake Claude).

[Release workflow](https://github.com/passioncode-ai/passioncode/actions/runs/36904444807)
completed successfully. [Registry and installed-machine receipt](dashboard-links-release.json)
verifies the canonical archive SHA-512 and the operator installation. Credentials, runtime configuration, payload and dependency
trees remain local-only. The launcher distributes skill instructions; it cannot
reload an already running agent's context or enforce a global final-answer hook.
