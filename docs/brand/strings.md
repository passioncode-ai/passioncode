Contract: brand-contract v1

# Status strings

| Key | Text (en) | Location | Scenario | Status | Kind |
|---|---|---|---|---|---|
| status.npm.empty | npm latest: not checked | bin/passioncode.js:10 | SCN-001 | proposed | copy |
| status.npm.cached | npm latest (cached) | bin/passioncode.js:21 | SCN-001 | proposed | copy |
| status.npm.time | checked ${checkedAt} | bin/passioncode.js:12 | SCN-001 | proposed | copy |
| status.npm.unknown-time | check time unknown | bin/passioncode.js:12 | SCN-001 | proposed | copy |
| status.npm.stale | stale: older than installed | bin/passioncode.js:21 | SCN-001 | proposed | copy |
| status.npm.refused | not installed automatically: ${REFUSED[refused] || 'refused'} | bin/passioncode.js:21 | SCN-001 | proposed | copy |
| status.npm.refused.signature | its signature does not verify | bin/passioncode.js:7 | SCN-001 | proposed | copy |
| status.npm.refused.provenance | no build provenance | bin/passioncode.js:7 | SCN-001 | proposed | copy |
| status.npm.refused.untrusted | its publisher is not trusted | bin/passioncode.js:7 | SCN-001 | proposed | copy |
| status.npm.refused.unreadable | its publisher could not be read | bin/passioncode.js:7 | SCN-001 | proposed | copy |
| restore.empty | Nothing to restore. | bin/passioncode.js:279 | SCN-004 | proposed | copy |
| uninstall.empty | Nothing was installed. | bin/passioncode.js:288 | SCN-005 | proposed | copy |
| restore.mcp-incomplete | Restore incomplete: ${incomplete.join('; ')}; kept. The rest of the batch was put back. Make the file and its folder readable and writable (for a link, the folder it points into) and run restore again; once any update has run since, delete the entry by hand (uninstall, which removes PassionCode too, also does). | lib/launcher.js:837 | SCN-004 | proposed | copy |
| uninstall.mcp-incomplete | Uninstall incomplete: ${kept.join('; ')}; kept. The rest of uninstall finished. Make the file and its folder readable and writable (for a link, the folder it points into) and retry uninstall. | lib/launcher.js:980 | SCN-005 | proposed | copy |
| help.1 | passioncode sets up and checks PassionCode.ai on this machine: the apps, their MCP servers, the skills | bin/passioncode.js:24 | SCN-007 | proposed | layout |
| help.2 | npx @passioncode-ai/passioncode@latest setup [--yes\|-y] [--with ids] [--without ids] [--train name\|none] [--no-apps] [--no-open] [--dry-run] [--allow-tools] [--allow-commands] [--offline] [--json] a new machine: install and configure everything; an existing one: check, repair, check again npx @passioncode-ai/passioncode@latest doctor [--fix] [--offline] [--json] check everything (changes nothing but the anonymous counts); --fix repairs as setup does npx @passioncode-ai/passioncode@latest update [--dry-run] [--quiet] [--json] install or update the skill set and the apps' MCP registrations npx @passioncode-ai/passioncode@latest status [--json] what is installed where npx @passioncode-ai/passioncode@latest restore [--json] put back what the last update moved aside npx @passioncode-ai/passioncode@latest config set update.auto on\|off [--json] background updates at session start npx @passioncode-ai/passioncode@latest uninstall [--json] remove the set (quarantined items stay restorable) npx @passioncode-ai/passioncode@latest permissions [allow\|remove <rule>...\|mode <mode>] [--by who] [--json] Claude Code's permission rules PassionCode installed, and its default mode; allow and remove change only PassionCode's rules npx @passioncode-ai/passioncode@latest analytics [on\|off\|status] [--json] anonymous usage and error counts (on by default) | bin/passioncode.js:26 | SCN-007 | proposed | layout |
| help.3 | onboard is another name for setup, install for update. --offline skips the check for newer app releases; --quiet prints nothing when an update succeeds; --allow-tools lets Claude Code use PassionCode's own tools without asking, --allow-commands run the commands setup lists (--yes never does either). App ids: switchboard, dashboards, observatory, inbox, fabric. Exit codes: 0 nothing failed (or only a plan was shown), 1 a check or a step failed, 2 bad arguments. Claude Code gets plugins from the local "passioncode" marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after a change. | bin/passioncode.js:38 | SCN-007 | proposed | layout |
| args.unsupported | passioncode: unsupported arguments for ${cmd}; run passioncode help. | bin/passioncode.js:235 | SCN-007 | proposed | copy |
| args.unsupported-setup | passioncode: unsupported arguments for ${cmd}; run passioncode help. App ids: ${IDS.join(', ')}. | bin/passioncode.js:84 | SCN-007 | proposed | copy |
| hook.spawn-failed | [passioncode] could not start the background update; check that npx is on PATH and retry next session. | plugin/passioncode/hooks/session-start.js:69 | SCN-006 | proposed | copy |
| update.failed | ${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry${saved ? '; use passioncode restore for displaced files' : ''}. | bin/passioncode.js:255 | SCN-003 | proposed | copy |
| update.done | PassionCode.ai ${r.version}: done. Restart your agent: skills load at session start. | bin/passioncode.js:255 | SCN-003 | proposed | copy |
| setup.install-question | Install ${pr.name}${pr.preview ? ' (early preview)' : ''}${i.note ? `: ${i.note}` : ''}? | lib/setup.js:184 | SCN-008 | proposed | copy |
| setup.install-question.preview | (early preview) | lib/setup.js:184 | SCN-008 | proposed | copy |
| setup.repairs-question | Apply ${repairs.length} repair(s): ${repairs.map((r) => r.detail).join('; ')}? | lib/setup.js:192 | SCN-008, SCN-009 | proposed | copy |
| setup.repair-update | install or refresh the skill set and register the apps\' MCP servers for every agent | lib/setup.js:90 | SCN-008, SCN-009 | proposed | copy |
| setup.repair-replace | reinstall ${pr.name} from ${from(pr)} (the current one goes to the Trash) | lib/setup.js:91 | SCN-009, SCN-014 | proposed | copy |
| setup.repair-kickstart | start the ${r.label} service through launchd | lib/setup.js:92 | SCN-009 | proposed | copy |
| setup.plan-install | install ${pr.name}${pr.preview ? ' (early preview)' : ''} from ${from(pr)} | lib/setup.js:73 | SCN-008 | proposed | copy |
| setup.install-note | needs ${missing.join(' and ')}${explicit ? '; installed because you asked for it' : '; skipped unless you ask for it (--with ' + pr.id + ')'} | lib/setup.js:74 | SCN-008, SCN-014 | proposed | copy |
| setup.install-note.declined | ; not installed (--with ${pr.id}) | lib/setup.js:380 | SCN-009, SCN-014 | proposed | copy |
| setup.install-note.train | ${setupStep} --with | lib/setup.js:379 | SCN-014 | proposed | copy |
| doctor.app-label | ${pr.name}${pr.preview ? ' (early preview)' : ''} | lib/doctor.js:192 | SCN-009, SCN-010 | proposed | layout |
| setup.not-taken | Nothing was changed: ${were(names)} offered and not installed.${stand(a)} | lib/setup.js:412 | SCN-009 | proposed | copy |
| setup.skipped | Nothing was changed: ${were(names)} not installed (see your steps below).${stand(a)} | lib/setup.js:413 | SCN-009 | proposed | copy |
| setup.declined | You declined every offer; nothing was changed.${stand(a)} | lib/setup.js:411 | SCN-008, SCN-009 | proposed | copy |
| setup.declined-not-taken | You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed.${stand(a)} | lib/setup.js:410 | SCN-008, SCN-009 | proposed | copy |
| setup.in-place | Everything this command can set up is in place; nothing was changed.${stand(a)} | lib/setup.js:477 | SCN-009 | proposed | copy |
| setup.in-place.tools | Everything else this command can set up is in place; nothing was changed.${stand(a)} | lib/setup.js:476 | SCN-009 | proposed | copy |
| setup.checks-stand |  The checks below still stand. | lib/setup.js:417 | SCN-008, SCN-009 | proposed | copy |
| setup.nothing-to-do | Nothing to do.${stand(a)} | lib/setup.js:445 | SCN-008 | proposed | copy |
| setup.would-skip | Nothing would change: ${names.join(' and ')} would not be installed (see the plan below).${stand(a)} | lib/setup.js:414 | SCN-008 | proposed | copy |
| setup.plan-footer | Run it with --yes to apply, or in a terminal to answer its questions. | lib/setup.js:470 | SCN-008 | proposed | copy |
| setup.plan-footer.dry-run | Run it without --dry-run (with --yes, or in a terminal) to apply. | lib/setup.js:469 | SCN-008 | proposed | copy |
| setup.plan-footer.dry-run.asks | Run it without --dry-run, in a terminal or with ${untaken.join(' and ')}, to apply. | lib/setup.js:469 | SCN-008 | proposed | copy |
| setup.plan-footer.train | Run it with --yes, or in a terminal, to apply. | lib/setup.js:470 | SCN-008, SCN-014 | proposed | copy |
| setup.plan-header | Plan (nothing was changed): | lib/setup.js:444 | SCN-008 | proposed | copy |
| setup.train-not-saved | The release train (${result.trainNotSaved}) was not saved. | lib/setup.js:461 | SCN-008 | proposed | copy |
| setup.plan-forget-train | forget the saved release train | lib/setup.js:427 | SCN-008 | proposed | copy |
| setup.plan-train | save release train ${t} | lib/setup.js:427 | SCN-008 | proposed | copy |
| setup.train-not-forgotten | The saved release train was not forgotten. | lib/setup.js:461 | SCN-008 | proposed | copy |
| setup.open-now | Open now: | lib/setup.js:517 | SCN-008 | proposed | layout |
| setup.still-open | Still open: | lib/setup.js:517 | SCN-009 | proposed | layout |
| setup.steps-header | Your steps (sign-ins, consents and secrets in hidden prompts need you in person): | lib/setup.js:521 | SCN-008 | proposed | copy |
| setup.closing.warnings | , ${a.warn} warning(s) | lib/setup.js:525 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.now | ${a.fail ? `${a.fail} problem(s)` : 'No problems'}${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor | lib/setup.js:526 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.after | ${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail})${warned}. Check again any time: npx @passioncode-ai/passioncode@latest doctor | lib/setup.js:527 | SCN-008, SCN-009 | proposed | copy |
| trains.not-a-name | "${id}" is not a release train name | lib/trains.js:19 | SCN-014 | proposed | copy |
| trains.unknown | no release train "${id}" in this launcher (known: ${list().join(', ')}) | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.none-shipped | no release train "${id}": this launcher ships no release train | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.unreadable | release train "${id}" cannot be read: ${error.message} | lib/trains.js:23 | SCN-014 | proposed | copy |
| trains.misnamed | release train file ${id}.json names "${doc.train}" | lib/trains.js:25 | SCN-014 | proposed | copy |
| trains.no-pin | release train "${id}" pins no app | lib/trains.js:27 | SCN-014 | proposed | copy |
| trains.unknown-app | release train "${id}" pins an unknown app "${app}" | lib/trains.js:29 | SCN-014 | proposed | copy |
| trains.bad-version | release train "${id}" pins ${app} at "${version}", not a version | lib/trains.js:30 | SCN-014 | proposed | copy |
| setup.tools-question | Let Claude Code use PassionCode's own tools without asking (allow ${result.permissions.rules.join(', ')})? | lib/setup.js:196 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-pending | allow ${result.permissions.rules.join(', ') \|\| "PassionCode's own tools"} in ${file} | lib/setup.js:305 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-done | allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins) | lib/setup.js:309 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-already | nothing to add in ${file}: each rule is already allowed, asked about or denied there | lib/setup.js:310 | SCN-008, SCN-009 | proposed | copy |
| permissions.link-loop | ${file}: too many levels of links | lib/permissions.js:220 | SCN-008, SCN-009 | proposed | error |
| permissions.unreadable | ${file} cannot be read: ${error.message} | lib/permissions.js:189 | SCN-008, SCN-009 | proposed | error |
| permissions.invalid-json | ${file} is not valid JSON: ${error.message} | lib/permissions.js:192 | SCN-008, SCN-009 | proposed | error |
| permissions.not-object | ${file} does not hold a settings object | lib/permissions.js:193 | SCN-008, SCN-009 | proposed | error |
| permissions.permissions-shape | ${file}: "permissions" is not an object | lib/permissions.js:195 | SCN-008, SCN-009 | proposed | error |
| permissions.list-shape | ${file}: "permissions.${list}" is not a list | lib/permissions.js:197 | SCN-008, SCN-009 | proposed | error |
| setup.tools-plan | let Claude Code use PassionCode's own tools without asking: allow ${rules.join(', ')} | lib/setup.js:426 | SCN-008 | proposed | copy |
| setup.tools-plan.how | (asked in a terminal, or --allow-tools) | lib/setup.js:450 | SCN-008 | proposed | copy |
| setup.tools-fails | A run with ${failing.join(' or ')} fails until that is fixed. | lib/setup.js:486 | SCN-008 | proposed | copy |
| setup.tools-unreadable | Claude Code's settings were not changed: ${tools.error} | lib/setup.js:484 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-hint | Claude Code still asks before it uses PassionCode's own tools. To allow them: ${D.NPX} setup --allow-tools | lib/setup.js:492 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-question | Let Claude Code run these commands without asking: ${result.commands.rules.map(commandLine).join('; ')}${wild}? | lib/setup.js:200 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-question.wild | ; a rule ending in * allows any arguments after its words | lib/setup.js:199 | SCN-008 | proposed | copy |
| setup.commands-rule | ${r.rule} (${r.why}${r.by ? `; declared by ${r.by}` : ''}) | lib/setup.js:425 | SCN-008 | proposed | copy |
| setup.commands-plan | let Claude Code run these commands without asking (asked in a terminal, or --allow-commands): | lib/setup.js:453 | SCN-008 | proposed | copy |
| setup.commands-plan.wild | (a rule ending in * allows any arguments after its words, options included) | lib/setup.js:455 | SCN-008 | proposed | copy |
| setup.commands-pending | allow ${result.commands.rules.map((r) => r.rule).join(', ') \|\| 'the rules for commands'} in ${file} | lib/setup.js:319 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-done | allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins${added.some(wildcard) ? '; a rule ending in * allows any arguments after its words' : ''}) | lib/setup.js:326 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-already | nothing to add in ${file}: each rule is already allowed, asked about or denied there | lib/setup.js:327 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-hint | Claude Code still asks before it runs ${cmds.rules.map((r) => r.rule).join(', ')}. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''} | lib/setup.js:497 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-hint-quiet | Claude Code's allow rules do not include PassionCode's own tools; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-tools | lib/setup.js:491 | SCN-008 | proposed | copy |
| setup.commands-hint-quiet | Claude Code's allow rules do not include ${cmds.rules.map((r) => r.rule).join(', ')}; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''} | lib/setup.js:495 | SCN-008 | proposed | copy |
| setup.commands-refused | Rules declared on this machine and not offered as declared: | lib/setup.js:500 | SCN-008 | proposed | copy |
| permissions.gh-merge | merge a pull request with the GitHub CLI; the rule cannot be limited to your repositories | lib/permissions.js:17 | SCN-008 | proposed | copy |
| permissions.rule-not-text | a rule is not text | lib/permissions.js:61 | SCN-008 | proposed | error |
| permissions.rule-mcp | ${rule}: a declared rule names a command; an MCP server's tools are not offered here | lib/permissions.js:62 | SCN-008 | proposed | error |
| permissions.rule-kind | ${rule}: a declared rule names a command, as Bash(<command>) | lib/permissions.js:64 | SCN-008 | proposed | error |
| permissions.rule-compound | ${rule}: a command with a quote, an escape, a substitution, a separator, a redirection or a character that is not plain text is not offered | lib/permissions.js:65 | SCN-008 | proposed | error |
| permissions.rule-any | ${rule}: it would allow any command | lib/permissions.js:68 | SCN-008 | proposed | error |
| permissions.rule-wildcard | ${rule}: a wildcard is allowed only at the end | lib/permissions.js:70 | SCN-008 | proposed | error |
| permissions.rule-cmd-wildcard | ${rule}: a .cmd or .bat file runs through cmd, which reads its arguments again; a wildcard is not offered | lib/permissions.js:80 | SCN-008 | proposed | error |
| permissions.rule-runner | ${rule}: a wildcard over ${program} could run any code; declare the exact command, or a command of your own | lib/permissions.js:81 | SCN-008 | proposed | error |
| permissions.rule-one-word | ${rule}: it would allow any command of ${program} | lib/permissions.js:82 | SCN-008 | proposed | error |
| permissions.rule-relative-path | ${rule}: PATH holds an empty or relative folder, which a shell reads from wherever it runs; a wildcard is not offered while it does | lib/permissions.js:87 | SCN-008 | proposed | error |
| permissions.rule-root-home | ${rule}: your home folder is the root folder, so no command there counts as your own; a wildcard is not offered | lib/permissions.js:89 | SCN-008 | proposed | error |
| permissions.rule-not-found | ${rule}: ${words[0]} is not found on PATH; a wildcard is offered only over a command installed in your home folder | lib/permissions.js:88 | SCN-008 | proposed | error |
| permissions.rule-outside-home | ${rule}: ${words[0]} is installed outside your home folder (${found}); a wildcard is offered only over a command of your own there | lib/permissions.js:90 | SCN-008 | proposed | error |
| permissions.rule-plain-name | ${rule}: name the program by its plain name, in lower case, without a path | lib/permissions.js:72 | SCN-008 | proposed | error |
| permissions.rule-wrapper | ${rule}: ${program} runs another program, so the rule could run any code | lib/permissions.js:79 | SCN-008 | proposed | error |
| permissions.declared-dir-unreadable | ${dir} cannot be read: ${error.message} | lib/permissions.js:142 | SCN-008 | proposed | error |
| permissions.rule-not-object | a rule is not an object | lib/permissions.js:157 | SCN-008 | proposed | error |
| permissions.rule-wildcard-end | ${rule}: a wildcard at the end needs :* or a space before it | lib/permissions.js:69 | SCN-008 | proposed | error |
| permissions.declared-unreadable | ${file} cannot be read: ${error.message} | lib/permissions.js:148 | SCN-008 | proposed | error |
| permissions.declared-shape | ${file} does not say who declares it ("by", 1 to 80 characters) and its rules ("rules") | lib/permissions.js:151 | SCN-008 | proposed | error |
| permissions.declared-why | ${file}: ${r.rule}: "why" says what it allows, in 1 to 200 characters | lib/permissions.js:160 | SCN-008 | proposed | error |
| permissions.declared-twice-file | ${file}: ${r.rule} is declared twice in this file; it is counted once | lib/permissions.js:161 | SCN-008 | proposed | error |
| permissions.declared-twice | ${file}: ${r.rule} is the same rule ${rules.find((x) => x.rule === r.rule).by} declares; it is counted once | lib/permissions.js:162 | SCN-008 | proposed | error |
| permissions.declared-by-control | ${file}: "by" holds a control or format character | lib/permissions.js:149 | SCN-008 | proposed | error |
| permissions.declared-why-control | ${file}: ${r.rule}: "why" holds a control or format character | lib/permissions.js:159 | SCN-008 | proposed | error |
| perm.title | Claude Code permissions in ${view.settingsFile} | bin/passioncode.js:174 | SCN-015 | proposed | copy |
| perm.mode | Default mode: ${!view.readable ? 'unknown (the settings file cannot be read)' : view.mode.value === null ? 'not set in this file (Claude Code asks before it edits files or runs commands, except what the allow rules let it do, unless a project or managed setting sets a mode)' : `${shown(String(view.mode.value))} (in this file; a project or managed setting can set another)`} | bin/passioncode.js:177 | SCN-015 | proposed | copy |
| perm.rules | PassionCode's rules: | bin/passioncode.js:179 | SCN-015 | proposed | copy |
| perm.when.removed | removed ${r.removedAt} by ${r.removedBy}${['allowed', 'asked', 'denied'].includes(r.state) ? ', and set again by hand since' : ''} | bin/passioncode.js:181 | SCN-015 | proposed | copy |
| perm.offered | Offered and not allowed yet: | bin/passioncode.js:187 | SCN-015 | proposed | copy |
| perm.allow-hint | To allow them: ${require('../lib/doctor').NPX} permissions allow <rule> | bin/passioncode.js:188 | SCN-015 | proposed | copy |
| perm.foreign | Other allow rules (not PassionCode's; never changed here): | bin/passioncode.js:190 | SCN-015 | proposed | copy |
| perm.refused | Rules declared on this machine and not offered as declared: | bin/passioncode.js:191 | SCN-015 | proposed | copy |
| doctor.auto-update-off | automatic updates are off (update.auto), by config set or by an uninstall by 0.2.75 or earlier; turning them on is your choice | lib/doctor.js:178 | SCN-010 | proposed | copy |
| doctor.sessions-unchecked | sessions Fabric starts on a board request: doctor checks the apps they need on macOS and Windows only | lib/doctor.js:378 | SCN-010 | proposed | copy |
| doctor.sessions-none | sessions Fabric starts on a board request: Fabric is not installed here | lib/doctor.js:380 | SCN-010 | proposed | copy |
| doctor.sessions | sessions Fabric starts on a board request, with Claude Code as the default agent: ${missing.length ? `missing ${missing.join(', ')}` : 'everything they need is in place'} | lib/doctor.js:409 | SCN-010 | proposed | copy |
| analytics.notice | The PassionCode launcher sends anonymous usage and error counts to improve it. Turn them off for the launcher: npx @passioncode-ai/passioncode@latest analytics off (each PassionCode app has its own switch). | lib/analytics.js:31 | SCN-016 | proposed | copy |
| analytics.status | Anonymous usage and error counts from the launcher: ${s.sending ? `on, sent to ${s.host}` : why[s.reason]}. Each PassionCode app has its own switch. | bin/passioncode.js:208 | SCN-016 | proposed | copy |
| analytics.why.off | turned off (analytics off) | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.shared-unreadable | off for now: the shared PassionCode installation file cannot be read or holds no usable id, so nothing is sent until it can be | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.unreadable | off for now: the switch file ${require('path').join(state, 'analytics.json')} cannot be read; analytics on or analytics off writes it again | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.off-elsewhere | off, because they were turned off in another PassionCode app before the launcher counted anything; analytics on turns them on for the launcher alone | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.env | off for this process (PASSIONCODE_ANALYTICS=off) | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.dnt | off for this process (DO_NOT_TRACK) | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.no-key | this build carries no App Key, so nothing is sent | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.why.notice | on, and this run shows their notice on stderr (unless another command is showing it right now); counts go to ${A.HOST} from then on | bin/passioncode.js:206 | SCN-016 | proposed | copy |
| analytics.save-failed | passioncode: the analytics switch could not be saved: ${error.message} | bin/passioncode.js:204 | SCN-016 | proposed | copy |
| analytics.usage | analytics takes on, off or status | bin/passioncode.js:200 | SCN-016 | proposed | error |
| perm.done | ${verb === 'allow' ? 'Allowed' : 'Removed'}: ${done.join(', ')} | bin/passioncode.js:145 | SCN-015 | proposed | copy |
| perm.mode-changed | Default mode: ${values[0]} (was ${r.from === null ? 'not set' : r.from}). | bin/passioncode.js:152 | SCN-015 | proposed | copy |
| perm.usage | passioncode: ${message}; run passioncode help. | bin/passioncode.js:164 | SCN-015 | proposed | error |
| perm.usage.by | --by needs who asked, for example "Fabric (operator)" | bin/passioncode.js:120 | SCN-015 | proposed | error |
| perm.usage.option | unknown option ${rest[n]} | bin/passioncode.js:121 | SCN-015 | proposed | error |
| perm.usage.by-text | --by is 1 to 80 characters of plain text | bin/passioncode.js:124 | SCN-015 | proposed | error |
| perm.usage.by-verb | --by goes with allow, remove or mode | bin/passioncode.js:126 | SCN-015 | proposed | error |
| perm.usage.rule | ${verb} needs at least one rule | bin/passioncode.js:141 | SCN-015 | proposed | error |
| perm.usage.mode | mode needs one of ${ledger.MODES.join(', ')} | bin/passioncode.js:150 | SCN-015 | proposed | error |
| perm.usage.verb | unknown permissions command ${verb} | bin/passioncode.js:155 | SCN-015 | proposed | error |
| ledger.not-offered | not a rule PassionCode offers: ${unknown.join(', ')} | lib/ledger.js:128 | SCN-015 | proposed | error |
| ledger.not-installed | not a rule PassionCode offers now or has in its ledger: ${foreign.join(', ')}; remove it in ${settingsFile} yourself | lib/ledger.js:144 | SCN-015 | proposed | error |
| ledger.mode | mode must be one of ${MODES.join(', ')} | lib/ledger.js:167 | SCN-015 | proposed | error |
| ledger.invalid-json | ${file} is not valid JSON: ${error.message} | lib/ledger.js:29 | SCN-015 | proposed | error |
| perm.when.installed | installed ${r.installedAt} by ${r.installedBy \|\| r.by} | bin/passioncode.js:182 | SCN-015 | proposed | copy |
| perm.when.none | not in the ledger (set before it, or by hand) | bin/passioncode.js:182 | SCN-015 | proposed | copy |
| perm.line | ${r.state.padEnd(8)} ${r.rule} (${r.why}; declared by ${r.by}; ${when}) | bin/passioncode.js:183 | SCN-015 | proposed | layout |
| perm.nothing | Nothing to ${verb}: ${verb === 'allow' ? 'each rule is already allowed, asked about or denied' : 'none of them is allowed there'}. | bin/passioncode.js:146 | SCN-015 | proposed | copy |
| perm.mode-same | Default mode is already ${values[0]}. | bin/passioncode.js:152 | SCN-015 | proposed | copy |
| ledger.unreadable | ${file} cannot be read: ${error.message} | lib/ledger.js:27 | SCN-015 | proposed | error |
| ledger.schema | ${file} is not a ${SCHEMA} ledger | lib/ledger.js:31 | SCN-015 | proposed | error |
| ledger.unwritable | ${file} cannot be written: ${error.message} | lib/ledger.js:44 | SCN-015 | proposed | error |
| setup.ledger-note | ; the permissions ledger was not updated (${error.message}) | lib/setup.js:422 | SCN-008, SCN-009, SCN-015 | proposed | error |
| setup.verify-line | ${product.app}, ${c.check}: ${c.detail} | lib/releases.js:220 | SCN-011 | proposed | layout |
| hook.unreadable-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:242 | SCN-006 | proposed | copy |
| hook.untrusted-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:245 | SCN-006 | proposed | copy |
| hook.unsigned | [passioncode] ${PACKAGE}@${latest} is on npm but its registry signature does not verify against the npm key pinned in this plugin, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:250 | SCN-006 | proposed | copy |
| hook.no-provenance | [passioncode] ${PACKAGE}@${latest} is on npm without a build provenance attestation, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:253 | SCN-006 | proposed | copy |
| hook.updating | [passioncode] ${latest} is out (you have ${state.installed}); updating in the background; it takes effect next session. | plugin/passioncode/hooks/update-check.js:263 | SCN-006 | proposed | copy |

Humanization: on (own pass); diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
