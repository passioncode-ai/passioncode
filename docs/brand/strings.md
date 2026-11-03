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
| setup.install-question | Install ${pr.name}${pr.preview ? ' (early preview)' : ''}${i.note ? ': ' + i.note : ''}? | lib/setup.js:140 | SCN-008 | proposed | copy |
| setup.install-question.preview | (early preview) | lib/setup.js:140 | SCN-008 | proposed | copy |
| setup.not-taken | Nothing was changed: ${were(names)} offered and not installed. The checks below still stand. | lib/setup.js:309 | SCN-009 | proposed | copy |
| setup.skipped | Nothing was changed: ${were(names)} not installed (see your steps below). The checks below still stand. | lib/setup.js:310 | SCN-009 | proposed | copy |
| setup.declined | You declined every offer; nothing was changed. The checks below still stand. | lib/setup.js:308 | SCN-009 | proposed | copy |
| setup.declined-not-taken | You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed. The checks below still stand. | lib/setup.js:307 | SCN-009 | proposed | copy |
| setup.in-place | Everything this command can set up is in place; nothing was changed. | lib/setup.js:325 | SCN-009 | proposed | copy |
| setup.steps-header | Your steps (sign-ins, consents and secrets in hidden prompts need you in person): | lib/setup.js:350 | SCN-008 | proposed | copy |
| setup.verify-line | ${product.app}, ${c.check}: ${c.detail} | lib/releases.js:220 | SCN-011 | proposed | layout |
| hook.unreadable-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:160 | SCN-006 | proposed | copy |
| hook.untrusted-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but published by ${accounts}, not a trusted PassionCode publisher, so it is not installed; see SECURITY.md. | plugin/passioncode/hooks/update-check.js:162 | SCN-006 | proposed | copy |
| hook.updating | [passioncode] ${latest} is out (you have ${installed}); updating in the background; it takes effect next session. | plugin/passioncode/hooks/update-check.js:170 | SCN-006 | proposed | copy |

Humanization: on (own pass); diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
