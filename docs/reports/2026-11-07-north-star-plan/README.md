# What is left for the launcher, merged with the North Star (2026-11-07)

**The request (2026-11-07):** «давай составим план что осталось сделать на базе долгов, но смержи с виженом из north
star документа в fabric workspace». The North Star is fabric-workspace `knowledge/north-star.md` (`f0645de1`); the
estate's plan to it, which cuts every product at once, is fabric-workspace
`docs/plans/2026-11-07-remaining-to-north-star/README.md` (`89d255c5`). This page is the launcher's own cut, read from
[docs/backlog.md](../../backlog.md) at `8e65e1d`. A row's state changes only in the backlog; the next cut replaces this
page.

## What the North Star asks of the launcher

| North Star | The launcher's part | Where it stands |
| --- | --- | --- |
| §1 principle 9, §10: rebuildable in an hour | `setup` rebuilds a person's apps, skills, MCP registrations and rules from releases with a receipt per step | built; a new user's Observatory engine and empty vault (PC-150) and an honest install time (PC-156) are open (G14) |
| §2 and §11: one computer, several macOS accounts | each user's own apps, entries and processes; a service's port read only from this account's listener | built in 0.2.76: PC-145 to PC-149, PC-151, PC-152 (DEC-0154 HA-2); CT-254's open-connection rule is PC-163 |
| §5: one contract | `doctor` reads every family service by `fabric-service/0.1` | built; an agent waiting for its instance (DEC-0149) reads as a warning today (PC-164) |
| §13 step 4: members join from their machine | the «Join an organization» step after the train | part 1 of PC-89 shipped in 0.2.51; the join step waits on Fabric CO-337 (the 2026-11-21 slice) |
| §4: one system, Dashboards shows it | Dashboards' «Check setup» runs the launcher's `doctor` | at an old pin (PC-161, Dashboards' row) |
| G2: levels in every product | owner, administrator and architect commands approve automatically | PC-162, after the contract's CT-250 and Vesta's levels |
| G1: the measure | the launcher's anonymous counts of commands and errors | built (PC-123), shipped with 0.2.76; the site's privacy page is PC-137 |

## Where we are

- **38 rows not done** at `8e65e1d`; the estate plan counts 33 of them as open by the knowledge base's status rules
  (it leaves out PC-06, deferred, and the rows landed in `main` that wait for the release). Three rows are filed with
  this plan: PC-163, PC-164, PC-165.
- **0.2.76 is in `main` and not released.** It carries PC-123 to PC-128, PC-141 and PC-145 to PC-152. Three things
  stand before its tag (the order decided 2026-11-04, recorded in PC-123): the repository secret
  `PASSIONCODE_ANALYTICS_APP_KEY` (the operator's step: without it every release job stops before npm publish), the
  passioncode.ai privacy page and `/start` prompt (PC-137, the site project), and Fabric's switch text per product
  (Fabric CO-496, cut 2026-11-21).
- **The pause** (board thread `eefa7959`) holds every row filed after 2026-11-06 12:50 UTC; rows already started and
  waiting only on another project (PC-149, PC-152) were finished during it.

## The rows, by wave

### Wave 0: closing now, or waiting on a person

| Row | What | Waits on | Next act |
| --- | --- | --- | --- |
| 0.2.76 (PC-123 and the rest) | the release | the secret `PASSIONCODE_ANALYTICS_APP_KEY`; PC-137; CO-496 | date the CHANGELOG heading, tag, watch the run, confirm npm, update the local install ([handoff](../../handoffs/2026-11-04-launcher-0.2.76-pending.md)) |
| PC-161 | Dashboards moves its `DOCTOR_PIN` | the 0.2.76 release | the request on the board at the release |
| PC-149, PC-152 | blind readings (unit, seam, product) | the subagent quota, back on 2026-11-11 | a finding becomes its own row |

### Wave 1: to 2026-11-13

| Row | What | Waits on |
| --- | --- | --- |
| PC-165 | pin Fabric Agent Adapter v0.74.0 (its kit checks a listener's owner before any credential, HA-2) | the pause; read its changelog for the skills the launcher installs |
| PC-163 | HA-2 on the open connection (CT-254) | the contract's PR #250 merged and tagged |
| PC-164 | an agent waiting for its instance reads «waits for setup», not a degradation | the pause |
| PC-150 (G14) | Observatory's engine and an empty vault for a new macOS user | Observatory's answer on thread `19f910f2`, due 2026-11-13 |
| PC-142 | the organization's signature over each npm version (LC-16) | the pause |

### Wave 2: the organization slice, 2026-11-21

| Row | What | Waits on |
| --- | --- | --- |
| PC-89 part 2 | «Join an organization» after the train | Fabric CO-337 (Create organization), Observatory OBS-200 |
| PC-153 | a moved home noticed and repaired; a new installation id per machine | Observatory's machine-restore list |
| PC-154 | containers as the plan has them (TA-05: I-01, I-05, I-06) | Fabric I-06 |
| PC-155 | scenarios and docs for the second user, the join and the move | with each row above |

### Wave 3: after the slice

| Row | What | Waits on |
| --- | --- | --- |
| PC-162 (G2) | levels: who may run what without asking | the contract's CT-250 DEC; Vesta's levels |
| PC-156 (G14) | an honest install time, a timed receipt in `setup --json` | the site |
| PC-02, PC-08 | Fabric Switchboard's plugin and Fabric Inbox's skill join the family | PC-08's branch rebased onto `main` |

### Decisions only the operator can make

| Row | Decision |
| --- | --- |
| PC-04 | how `family.json` proves Observatory Log's provenance: accept `refVersions: "repository"`, or require the tag to name the plugin version |
| PC-07 | `validate.yml` still runs on every push and pull request while the organization's hosted checks run nightly: align it, or record why the launcher keeps per-change CI (its pull requests are merged on this CI today) |
| the release | the repository secret `PASSIONCODE_ANALYTICS_APP_KEY` |

### Follow-ups that block nothing (P3)

From the verification rounds of 0.2.65 to 0.2.76, none blocking: PC-111, PC-113, PC-121, PC-122, PC-133, PC-134, PC-136,
PC-138, PC-139, PC-140, PC-143, PC-144, PC-157, PC-158, PC-159, PC-160; PC-45 (brand lint in unchanged files); PC-06
(deferred). They are taken between waves, oldest first.

## Drift between the vision and the records

| # | The vision says | The records say | Fix |
| --- | --- | --- | --- |
| 1 | §11: the products' own checks are rows | the launcher's is built (PC-152, merged `11bf33d`) | the coordinator adds «launcher PC-152» to §11 |
| 2 | G14 names PC-150 and PC-156 | PC-153 (a moved home) and PC-154 (containers) serve the same rebuild | add them to G14 |
| 3 | §13 step 4: members join from their machine | the join step waits on CO-337 with no date of its own | the slice dates it |

## Next task

At the release: tag 0.2.76 once the secret, PC-137 and CO-496 are in place. When the pause lifts: PC-165, then PC-164;
PC-163 on CT-254's tag; PC-150 on Observatory's answer. A board request addressed to the launcher comes first.
