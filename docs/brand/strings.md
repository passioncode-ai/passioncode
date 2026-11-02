Contract: brand-contract v1

# Status strings

| Key | Text (en) | Location | Scenario | Status | Kind |
|---|---|---|---|---|---|
| status.npm.empty | npm latest: not checked | bin/passioncode.js:6 | SCN-001 | proposed | copy |
| status.npm.cached | npm latest (cached) | bin/passioncode.js:17 | SCN-001 | proposed | copy |
| status.npm.time | checked ${checkedAt} | bin/passioncode.js:8 | SCN-001 | proposed | copy |
| status.npm.unknown-time | check time unknown | bin/passioncode.js:8 | SCN-001 | proposed | copy |
| status.npm.stale | stale: older than installed | bin/passioncode.js:17 | SCN-001 | proposed | copy |

| restore.empty | Nothing to restore. | bin/passioncode.js:72 | SCN-004 | proposed | copy |
| uninstall.empty | Nothing was installed. | bin/passioncode.js:81 | SCN-005 | proposed | copy |
| help.1 | passioncode sets up and checks PassionCode.ai on this machine: the apps, their MCP servers, the skills | bin/passioncode.js:20 | SCN-007 | proposed | layout |
| help.2 | npx @passioncode-ai/passioncode@latest setup [--yes] [--with ids] [--without ids] [--train name\|none] [--no-apps] [--no-open] [--dry-run] [--json]: a new machine: install and configure everything; an existing one: check, repair, check again. doctor [--fix] [--json]: check everything (read-only); --fix repairs as setup does. update [--dry-run] [--json]: install or update the skill set and the apps' MCP registrations. status [--json]: what is installed where. restore: put back what the last update moved aside. config set update.auto on\|off: background updates at session start. uninstall: remove the set (quarantined items stay restorable) | bin/passioncode.js:22 | SCN-007 | proposed | layout |
| help.3 | App ids: switchboard, dashboards, observatory, inbox, fabric. Exit codes: 0 nothing failed, 1 a check or a step failed, 2 bad arguments. Claude Code gets plugins from the local "passioncode" marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after a change. | bin/passioncode.js:20 | SCN-007 | proposed | layout |
| args.unsupported | passioncode: unsupported arguments for ${cmd}; run passioncode help. | bin/passioncode.js:45 | SCN-007 | proposed | copy |

| hook.spawn-failed | [passioncode] could not start the background update; check that npx is on PATH and retry next session. | plugin/passioncode/hooks/session-start.js:64 | SCN-006 | proposed | copy |
| update.failed | ${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry; use passioncode restore for displaced files. | bin/passioncode.js:56 | SCN-003 | proposed | copy |
| update.done | PassionCode.ai ${r.version}: done. Restart your agent: skills load at session start. | bin/passioncode.js:129 | SCN-003 | proposed | copy |
| setup.install-question | Install ${pr.name} (early preview): ${i.note}? | lib/setup.js:140 | SCN-008 | proposed | copy |
| setup.steps-header | Your steps (sign-ins, consents and secrets in hidden prompts need you in person): | lib/setup.js:316 | SCN-008 | proposed | copy |
| hook.unreadable-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:160 | SCN-006 | proposed | copy |
| hook.untrusted-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but published by ${accounts}, not a trusted PassionCode publisher, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:162 | SCN-006 | proposed | copy |
| hook.updating | [passioncode] ${latest} is out (you have ${installed}); updating in the background; it takes effect next session. | plugin/passioncode/hooks/update-check.js:170 | SCN-006 | proposed | copy |

Humanization: on (own pass); diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
