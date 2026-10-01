Contract: brand-contract v1

# Status facts

| Fact | Value | Source | Checked | Review by | Public |
|---|---|---|---|---|---|
| Registry observation | `latest` and `checkedAt` belong to a saved probe | `plugin/passioncode/hooks/update-check.js`, `recordProbe()` | 2026-10-01 | A change to probe persistence | yes |
| Status data | Installed release, package payload and saved npm observation are separate fields | `lib/launcher.js`, `status()` | 2026-10-01 | A change to the status contract | yes |
| Mutation failures | Unsupported arguments fail before mutation; runtime failures return a nonzero exit code | `bin/passioncode.js`, `main()`; launcher regressions | 2026-10-01 | A dispatch change | yes |
| Recovery | Latest batch, per-entry checkpoints and conflict refusal; no release rollback | `lib/launcher.js`, `restore()`; restore regressions | 2026-10-01 | A recovery change | yes |
| Publisher attribution | Known publisher and all readable maintainers must be on the allowlist | `plugin/passioncode/hooks/update-check.js`, `decide()`; self-update regressions | 2026-10-01 | A trust-policy change | yes |

No fixed version number is a standing brand claim.
