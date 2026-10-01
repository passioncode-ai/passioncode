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
| help.1 | passioncode — the PassionCode.ai skill set (family.json), for every agent on this machine | bin/passioncode.js:20 | SCN-007 | proposed | layout |
| help.2 | npx @passioncode-ai/passioncode@latest update [--dry-run] [--json]     install or update the whole set npx @passioncode-ai/passioncode@latest status [--json]                 what is installed where npx @passioncode-ai/passioncode@latest restore                         put back what the last update moved aside npx @passioncode-ai/passioncode@latest config set update.auto on\|off   background updates at session start npx @passioncode-ai/passioncode@latest uninstall                       remove the set (quarantined items stay restorable) | bin/passioncode.js:22 | SCN-007 | proposed | layout |
| help.3 | Claude Code gets plugins from the local "passioncode" marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after an update. | bin/passioncode.js:20 | SCN-007 | proposed | layout |
| args.unsupported | passioncode: unsupported arguments for ${cmd}; run passioncode help. | bin/passioncode.js:45 | SCN-007 | proposed | copy |

| hook.spawn-failed | [passioncode] could not start the background update; check that npx is on PATH and retry next session. | plugin/passioncode/hooks/session-start.js:64 | SCN-006 | proposed | copy |
| update.failed | ${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry; use passioncode restore for displaced files. | bin/passioncode.js:56 | SCN-003 | proposed | copy |

Humanization: on — own pass; diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
