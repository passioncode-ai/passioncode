Contract: brand-contract v1

# Status strings

| Key | Text (en) | Location | Scenario | Status | Kind |
|---|---|---|---|---|---|
| status.npm.empty | npm latest: not checked | bin/passioncode.js:6 | SCN-001 | proposed | copy |
| status.npm.cached | npm latest (cached) | bin/passioncode.js:17 | SCN-001 | proposed | copy |
| status.npm.time | checked ${checkedAt} | bin/passioncode.js:8 | SCN-001 | proposed | copy |
| status.npm.unknown-time | check time unknown | bin/passioncode.js:8 | SCN-001 | proposed | copy |
| status.npm.stale | stale: older than installed | bin/passioncode.js:17 | SCN-001 | proposed | copy |
| restore.empty | Nothing to restore. | bin/passioncode.js:147 | SCN-004 | proposed | copy |
| uninstall.empty | Nothing was installed. | bin/passioncode.js:156 | SCN-005 | proposed | copy |
| help.1 | passioncode sets up and checks PassionCode.ai on this machine: the apps, their MCP servers, the skills | bin/passioncode.js:20 | SCN-007 | proposed | layout |
| help.2 | npx @passioncode-ai/passioncode@latest setup [--yes\|-y] [--with ids] [--without ids] [--train name\|none] [--no-apps] [--no-open] [--dry-run] [--offline] [--json] a new machine: install and configure everything; an existing one: check, repair, check again npx @passioncode-ai/passioncode@latest doctor [--fix] [--offline] [--json] check everything (read-only); --fix repairs as setup does npx @passioncode-ai/passioncode@latest update [--dry-run] [--quiet] [--json] install or update the skill set and the apps' MCP registrations npx @passioncode-ai/passioncode@latest status [--json] what is installed where npx @passioncode-ai/passioncode@latest restore [--json] put back what the last update moved aside npx @passioncode-ai/passioncode@latest config set update.auto on\|off [--json] background updates at session start npx @passioncode-ai/passioncode@latest uninstall [--json] remove the set (quarantined items stay restorable) | bin/passioncode.js:22 | SCN-007 | proposed | layout |
| help.3 | onboard is another name for setup, install for update. --offline skips the check for newer app releases; --quiet prints nothing when an update succeeds. App ids: switchboard, dashboards, observatory, inbox, fabric. Exit codes: 0 nothing failed (or only a plan was shown), 1 a check or a step failed, 2 bad arguments. Claude Code gets plugins from the local "passioncode" marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after a change. | bin/passioncode.js:31 | SCN-007 | proposed | layout |
| args.unsupported | passioncode: unsupported arguments for ${cmd}; run passioncode help. | bin/passioncode.js:120 | SCN-007 | proposed | copy |
| args.unsupported-setup | passioncode: unsupported arguments for ${cmd}; run passioncode help. App ids: ${IDS.join(', ')}. | bin/passioncode.js:75 | SCN-007 | proposed | copy |
| hook.spawn-failed | [passioncode] could not start the background update; check that npx is on PATH and retry next session. | plugin/passioncode/hooks/session-start.js:66 | SCN-006 | proposed | copy |
| update.failed | ${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry; use passioncode restore for displaced files. | bin/passioncode.js:131 | SCN-003 | proposed | copy |
| update.done | PassionCode.ai ${r.version}: done. Restart your agent: skills load at session start. | bin/passioncode.js:131 | SCN-003 | proposed | copy |
| setup.install-question | Install ${pr.name}${pr.preview ? ' (early preview)' : ''}${i.note ? `: ${i.note}` : ''}? | lib/setup.js:140 | SCN-008 | proposed | copy |
| setup.install-question.preview | (early preview) | lib/setup.js:140 | SCN-008 | proposed | copy |
| setup.plan-install | install ${pr.name}${pr.preview ? ' (early preview)' : ''} from ${from(pr)} | lib/setup.js:70 | SCN-008 | proposed | copy |
| setup.install-note | needs ${missing.join(' and ')}${explicit ? '; installed because you asked for it' : '; skipped unless you ask for it (--with ' + pr.id + ')'} | lib/setup.js:71 | SCN-008, SCN-014 | proposed | copy |
| setup.install-note.declined | ; not installed (--with ${pr.id}) | lib/setup.js:288 | SCN-009, SCN-014 | proposed | copy |
| setup.install-note.train | ${setupStep} --with | lib/setup.js:287 | SCN-014 | proposed | copy |
| doctor.app-label | ${pr.name}${pr.preview ? ' (early preview)' : ''} | lib/doctor.js:188 | SCN-009, SCN-010 | proposed | layout |
| setup.not-taken | Nothing was changed: ${were(names)} offered and not installed.${stand(a)} | lib/setup.js:320 | SCN-009 | proposed | copy |
| setup.skipped | Nothing was changed: ${were(names)} not installed (see your steps below).${stand(a)} | lib/setup.js:321 | SCN-009 | proposed | copy |
| setup.declined | You declined every offer; nothing was changed.${stand(a)} | lib/setup.js:319 | SCN-008, SCN-009 | proposed | copy |
| setup.declined-not-taken | You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed.${stand(a)} | lib/setup.js:318 | SCN-008, SCN-009 | proposed | copy |
| setup.in-place | Everything this command can set up is in place; nothing was changed.${stand(a)} | lib/setup.js:357 | SCN-009 | proposed | copy |
| setup.checks-stand |  The checks below still stand. | lib/setup.js:325 | SCN-008, SCN-009 | proposed | copy |
| setup.nothing-to-do | Nothing to do.${stand(a)} | lib/setup.js:340 | SCN-008 | proposed | copy |
| setup.would-skip | Nothing would change: ${names.join(' and ')} would not be installed (see the plan below).${stand(a)} | lib/setup.js:322 | SCN-008 | proposed | copy |
| setup.plan-footer | Run it with --yes to apply, or in a terminal to answer its questions. | lib/setup.js:353 | SCN-008 | proposed | copy |
| setup.plan-footer.dry-run | Run it without --dry-run (with --yes, or in a terminal) to apply. | lib/setup.js:352 | SCN-008 | proposed | copy |
| setup.plan-footer.train | Run it with --yes, or in a terminal, to apply. | lib/setup.js:353 | SCN-014 | proposed | copy |
| setup.plan-header | Plan (nothing was changed): | lib/setup.js:339 | SCN-008 | proposed | copy |
| setup.train-not-saved | The release train (${result.trainNotSaved}) was not saved. | lib/setup.js:348 | SCN-008 | proposed | copy |
| setup.plan-forget-train | forget the saved release train | lib/setup.js:327 | SCN-008 | proposed | copy |
| setup.plan-train | save release train ${t} | lib/setup.js:327 | SCN-008 | proposed | copy |
| setup.train-not-forgotten | The saved release train was not forgotten. | lib/setup.js:348 | SCN-008 | proposed | copy |
| setup.open-now | Open now: | lib/setup.js:378 | SCN-008 | proposed | layout |
| setup.still-open | Still open: | lib/setup.js:378 | SCN-009 | proposed | layout |
| setup.steps-header | Your steps (sign-ins, consents and secrets in hidden prompts need you in person): | lib/setup.js:382 | SCN-008 | proposed | copy |
| setup.closing.warnings | , ${a.warn} warning(s) | lib/setup.js:386 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.now | ${a.fail ? `${a.fail} problem(s)` : 'No problems'}${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor | lib/setup.js:387 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.after | ${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail})${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor | lib/setup.js:388 | SCN-008, SCN-009 | proposed | copy |
| trains.not-a-name | "${id}" is not a release train name | lib/trains.js:19 | SCN-014 | proposed | copy |
| trains.unknown | no release train "${id}" in this launcher (known: ${list().join(', ')}) | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.none-shipped | no release train "${id}": this launcher ships no release train | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.unreadable | release train "${id}" cannot be read: ${error.message} | lib/trains.js:23 | SCN-014 | proposed | copy |
| trains.misnamed | release train file ${id}.json names "${doc.train}" | lib/trains.js:25 | SCN-014 | proposed | copy |
| trains.no-pin | release train "${id}" pins no app | lib/trains.js:27 | SCN-014 | proposed | copy |
| trains.unknown-app | release train "${id}" pins an unknown app "${app}" | lib/trains.js:29 | SCN-014 | proposed | copy |
| trains.bad-version | release train "${id}" pins ${app} at "${version}", not a version | lib/trains.js:30 | SCN-014 | proposed | copy |
| setup.verify-line | ${product.app}, ${c.check}: ${c.detail} | lib/releases.js:220 | SCN-011 | proposed | layout |
| hook.unreadable-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:160 | SCN-006 | proposed | copy |
| hook.untrusted-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:162 | SCN-006 | proposed | copy |
| hook.updating | [passioncode] ${latest} is out (you have ${state.installed}); updating in the background; it takes effect next session. | plugin/passioncode/hooks/update-check.js:170 | SCN-006 | proposed | copy |

Humanization: on (own pass); diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
