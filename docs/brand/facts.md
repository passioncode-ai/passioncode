Contract: brand-contract v1

# Status facts

| Fact | Value | Source | Checked | Review by | Public |
|---|---|---|---|---|---|
| Registry observation | `latest` and `checkedAt` belong to a saved probe | `plugin/passioncode/hooks/update-check.js`, `recordProbe()` | 2026-10-01 | A change to probe persistence | yes |
| Status data | Installed release, package payload and saved npm observation are separate fields | `lib/launcher.js`, `status()` | 2026-10-01 | A change to the status contract | yes |
| Mutation failures | Unsupported arguments fail before mutation of the setup (the anonymous counts still count the run); runtime failures return a nonzero exit code | `bin/passioncode.js`, `main()`; launcher regressions | 2026-10-01 | A dispatch change | yes |
| Recovery | Latest batch, per-entry checkpoints and conflict refusal; no release rollback | `lib/launcher.js`, `restore()`; restore regressions | 2026-10-01 | A recovery change | yes |
| Publisher attribution | Known publisher and all readable maintainers must be on the allowlist | `plugin/passioncode/hooks/update-check.js`, `decide()`; self-update regressions | 2026-10-01 | A trust-policy change | yes |
| Anonymous counts | On by default from 0.2.76, a notice once per machine before anything is sent, `analytics off` for the launcher alone; sent to analytics.passioncode.ai, kept two years, the installation id removed from the live store after 400 days | `lib/analytics.js`; `docs/analytics-events.md`; passioncode-platform `infra/analytics/README.md` | 2026-11-04 | A change to what is sent or kept | yes |

No fixed version number is a standing brand claim.
