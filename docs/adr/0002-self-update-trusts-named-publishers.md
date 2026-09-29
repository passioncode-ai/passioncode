# ADR-0002 — The self-update runs only a pinned version from named npm publishers

Status: accepted · 2026-09-29

## Context

The `passioncode` plugin's SessionStart hook ran `npx --yes passioncode@latest update`
whenever `npm view passioncode version` reported something newer, with auto-update on by
default. Measured on 2026-09-29: `npm view passioncode` answered **E404** — the unscoped
name was unclaimed. Whoever registered it first would have had their code run, unasked,
on every machine that has the plugin. Claiming the name closes today's hole but not the
class: a stolen or added maintainer account, or a typo-squat after a rename, is the same
exposure.

## Decision

- The probe records who publishes: `npm view passioncode version maintainers _npmUser
  --json` → the latest version, the package's maintainers and the account that
  published that version. E404 is recorded as `published: false`, not as an error.
- A trust list ships inside the plugin, `plugin/passioncode/trust.json`
  (`npmPublishers`), reviewed like code. The hook starts an update only when the
  maintainers are known and non-empty and every maintainer and the publisher is on it.
- What runs is pinned: `npx --yes passioncode@<verified x.y.z> update --quiet`, never
  `@latest`.
- Anything else spawns nothing. An untrusted publisher is named in one line; an
  unpublished name is silent; a failed check is shown once.
- The list ships empty. Auto-update is inert until the maintainers name their account.

## Consequences

- Adding or changing a publishing account needs a release that carries the new list:
  machines on the old list refuse the new publisher and say so, which is the intent.
- The check trusts the npm registry's own record of maintainers and publisher; it does
  not verify package signatures or provenance. Moving to `npm audit signatures` /
  provenance attestations would be a further step, not a replacement for the list.
- A person can still update by hand at any time (`npx passioncode@<version> update`).
