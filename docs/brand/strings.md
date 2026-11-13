Contract: brand-contract v1

# Status strings

| Key | Text (en) | Location | Scenario | Status | Kind |
|---|---|---|---|---|---|
| status.npm.empty | npm latest: not checked | bin/passioncode.js:15 | SCN-001 | proposed | copy |
| status.npm.cached | npm latest (cached) | bin/passioncode.js:27 | SCN-001 | proposed | copy |
| status.npm.time | checked ${checkedAt} | bin/passioncode.js:18 | SCN-001 | proposed | copy |
| status.npm.unknown-time | check time unknown | bin/passioncode.js:18 | SCN-001 | proposed | copy |
| status.npm.stale | stale: older than installed | bin/passioncode.js:27 | SCN-001 | proposed | copy |
| status.npm.refused | not installed automatically: ${REFUSED[refused] || 'refused'} | bin/passioncode.js:27 | SCN-001 | proposed | copy |
| status.npm.refused.signature | its signature does not verify | bin/passioncode.js:9 | SCN-001 | proposed | copy |
| status.npm.refused.provenance | no build provenance | bin/passioncode.js:9 | SCN-001 | proposed | copy |
| status.npm.refused.untrusted | its publisher is not trusted | bin/passioncode.js:9 | SCN-001 | proposed | copy |
| status.npm.refused.unreadable | its publisher could not be read | bin/passioncode.js:9 | SCN-001 | proposed | copy |
| restore.empty | Nothing to restore. | bin/passioncode.js:319 | SCN-004 | proposed | copy |
| uninstall.empty | Nothing was installed. | bin/passioncode.js:338 | SCN-005 | proposed | copy |
| restore.mcp-incomplete | Restore incomplete: ${incomplete.join('; ')}; kept. The rest of the batch was put back. Make the file and its folder readable and writable (for a link, the folder it points into) and run restore again; once any update has run since, delete the entry by hand (uninstall, which removes PassionCode too, also does). | lib/launcher.js:950 | SCN-004 | proposed | copy |
| uninstall.mcp-incomplete | Uninstall incomplete: ${kept.join('; ')}; kept. The rest of uninstall finished. Make the file and its folder readable and writable (for a link, the folder it points into) and retry uninstall. | lib/launcher.js:1126 | SCN-005 | proposed | copy |
| help.1 | passioncode sets up and checks PassionCode.ai on this machine: the apps, their MCP servers, the skills, the agents' wiki memory | bin/passioncode.js:30 | SCN-007, SCN-018 | proposed | layout |
| help.2 | ${NPX} setup [--yes\|-y] [--with ids] [--without ids] [--train name\|none] [--wiki-vault dir] [--no-apps] [--no-open] [--dry-run] [--allow-tools] [--allow-commands] [--offline] [--json] a new machine: install and configure everything; an existing one: check, repair, check again ${NPX} doctor [--fix] [--offline] [--json] check everything (changes nothing but the anonymous counts); --fix repairs as setup does ${NPX} update [--dry-run] [--quiet] [--json] install or update the skill set and the apps' MCP registrations ${NPX} status [--json] what is installed where ${NPX} restore [--json] put back what the last update moved aside ${NPX} config set update.auto on\|off [--json] background updates at session start ${NPX} uninstall [--json] remove the set (quarantined items stay restorable) ${NPX} permissions [allow\|remove <rule>...\|mode <mode> [--confirm-bypass]] [--by who] [--json] Claude Code's permission rules PassionCode installed, and its default mode; allow and remove change only PassionCode's rules ${NPX} analytics [on\|off\|status] [--json] anonymous usage and error counts (on by default) | bin/passioncode.js:32 | SCN-007 | proposed | layout |
| help.3 | onboard is another name for setup, install for update. --offline skips the check for newer app releases; --quiet prints nothing when an update succeeds; --allow-tools lets Claude Code use PassionCode's own tools without asking, --allow-commands run the commands setup lists (--yes never does either). Ids for --with and --without: switchboard, dashboards, observatory, inbox, fabric (the apps); obsidian, wiki, or memory for both (the agents' wiki memory). A new vault goes in ~/.wiki; --wiki-vault names an absolute folder or one that starts with ~/. Exit codes: 0 nothing failed in what the run covered (the memory.* rows of a part named in leftOut do not count, except a failing Obsidian signature), or only a plan was shown, 1 a check or a step failed, 2 bad arguments. Claude Code gets plugins from the local "passioncode" marketplace; other agents get the same skills through ~/.agents/skills. Restart your agent after a change. | bin/passioncode.js:44 | SCN-007, SCN-018 | proposed | layout |
| args.unsupported | passioncode: unsupported arguments for ${cmd}; run passioncode help. | bin/passioncode.js:275 | SCN-007 | proposed | copy |
| hook.spawn-failed | [passioncode] could not start the background update; check that npx is on PATH and retry next session. | plugin/passioncode/hooks/session-start.js:181 | SCN-006 | proposed | copy |
| hook.npm-missing | [passioncode] there is no npm beside the Node in ${nodeDir}, so automatic updates cannot be checked or installed; reinstall that Node.js with npm (with the tool that installed it), or put a Node.js that has npm first on PATH, then start Claude Code again: the next session checks again.${now} | plugin/passioncode/hooks/update-check.js:357 | SCN-006 | proposed | copy |
| hook.npm-missing.manual |  To update now, run in a terminal where npx works: npx --yes ${REGISTRY_ARGS.join(' ')} ${PACKAGE}@${latest} update | plugin/passioncode/hooks/update-check.js:355 | SCN-006 | proposed | copy |
| hook.cache-failed | [passioncode] could not start the background update: its folder ${shown(path.join(DIR, 'run'))} cannot be written; make it writable (or remove it) and it is tried again next session. | plugin/passioncode/hooks/session-start.js:176 | SCN-006 | proposed | copy |
| hook.logs-failed | [passioncode] could not start the background update: its log folder ${shown(path.join(DIR, 'logs'))} cannot be written; make it writable (or remove it) and it is tried again next session. | plugin/passioncode/hooks/session-start.js:180 | SCN-006 | proposed | copy |
| hook.state-unwritable | [passioncode] ${shown(STATE)} cannot be written, so no background update starts; make it and its folder writable and it is tried again next session. | plugin/passioncode/hooks/session-start.js:93 | SCN-006 | proposed | copy |
| update.failed | ${failed.length} step(s) failed. Completed steps remain applied. Fix the cause and retry${saved ? '; use passioncode restore for displaced files' : ''}. | bin/passioncode.js:295 | SCN-003 | proposed | copy |
| update.done | PassionCode.ai ${r.version}: done. Restart your agent: skills load at session start. | bin/passioncode.js:295 | SCN-003 | proposed | copy |
| setup.install-question | Install ${pr.name}${pr.preview ? ' (early preview)' : ''} into ${path.dirname(catalog.appPath(pr, { home }))}${i.note ? `: ${i.note}` : ''}? | lib/setup.js:257 | SCN-008 | proposed | copy |
| setup.install-question.preview | (early preview) | lib/setup.js:257 | SCN-008 | proposed | copy |
| setup.repairs-question | Apply ${repairs.length} repair(s): ${repairs.map((r) => r.detail).join('; ')}? | lib/setup.js:265 | SCN-008, SCN-009 | proposed | copy |
| setup.repair-update | install or refresh the skill set and register the apps\' MCP servers for every agent | lib/setup.js:131 | SCN-008, SCN-009 | proposed | copy |
| setup.repair-replace | reinstall ${pr.name} from ${from(pr)}${blocked ? '' : ' (the current one goes to the Trash)'} | lib/setup.js:132 | SCN-009, SCN-014 | proposed | copy |
| setup.repair-kickstart | start the ${r.label} service through launchd | lib/setup.js:135 | SCN-009 | proposed | copy |
| setup.plan-install | install ${pr.name}${pr.preview ? ' (early preview)' : ''} into ${path.dirname(catalog.appPath(pr, { home }))} from ${from(pr)} | lib/setup.js:86 | SCN-008 | proposed | copy |
| setup.install-note | needs ${missing.join(' and ')}${explicit ? '; installed because you asked for it' : '; skipped unless you ask for it (--with ' + pr.id + ')'} | lib/setup.js:88 | SCN-008, SCN-014 | proposed | copy |
| setup.install-note.declined | ; not installed (--with ${pr.id}) | lib/setup.js:492 | SCN-009, SCN-014 | proposed | copy |
| setup.install-note.train | ${setupStep} --with | lib/setup.js:491 | SCN-014 | proposed | copy |
| doctor.app-label | ${pr.name}${pr.preview ? ' (early preview)' : ''} | lib/doctor.js:250 | SCN-009, SCN-010 | proposed | layout |
| setup.not-taken | Nothing was changed: ${were(names)} offered and not installed.${stand(a)} | lib/setup.js:565 | SCN-009 | proposed | copy |
| setup.skipped | Nothing was changed: ${were(names)} not installed (see your steps below).${stand(a)} | lib/setup.js:566 | SCN-009 | proposed | copy |
| setup.declined | You declined every offer; nothing was changed.${r.blocked ? ` ${blockedToo(r.blocked)}` : ''}${stand(a)} | lib/setup.js:562 | SCN-008, SCN-009 | proposed | copy |
| setup.declined-not-taken | You declined every other offer, and ${were(r.notTaken)} not installed; nothing was changed.${r.blocked ? ` ${blockedToo(r.blocked)}` : ''}${stand(a)} | lib/setup.js:561 | SCN-008, SCN-009 | proposed | copy |
| setup.in-place | Everything this command can set up is in place; nothing was changed.${stand(a)} | lib/setup.js:647 | SCN-009 | proposed | copy |
| setup.in-place.tools | Everything else this command can set up is in place; nothing was changed.${stand(a)} | lib/setup.js:646 | SCN-009 | proposed | copy |
| setup.checks-stand |  The checks below still stand. | lib/setup.js:579 | SCN-008, SCN-009 | proposed | copy |
| setup.nothing-to-do | Nothing to do.${stand(a)} | lib/setup.js:610 | SCN-008 | proposed | copy |
| setup.asked-step-fails | Nothing was changed: the step you asked for cannot run until Claude Code's settings are fixed.${stand(a)} | lib/setup.js:610 | SCN-008 | proposed | copy |
| setup.would-skip | Nothing would change: ${names.join(' and ')} would not be installed (see the plan below).${stand(a)} | lib/setup.js:567 | SCN-008 | proposed | copy |
| setup.plan-footer | Run it with --yes to apply, or in a terminal to answer its questions. | lib/setup.js:638 | SCN-008 | proposed | copy |
| setup.plan-footer.dry-run | Run it without --dry-run (with --yes, or in a terminal) to apply. | lib/setup.js:637 | SCN-008 | proposed | copy |
| setup.plan-footer.dry-run.asks | Run it without --dry-run, in a terminal or with ${untaken.join(' and ')}, to apply. | lib/setup.js:637 | SCN-008 | proposed | copy |
| setup.plan-footer.train | Run it with --yes, or in a terminal, to apply. | lib/setup.js:638 | SCN-008, SCN-014 | proposed | copy |
| setup.plan-header | Plan (nothing was changed): | lib/setup.js:608 | SCN-008 | proposed | copy |
| setup.train-not-saved | The release train (${result.trainNotSaved}) was not saved. | lib/setup.js:629 | SCN-008 | proposed | copy |
| setup.plan-forget-train | forget the saved release train | lib/setup.js:589 | SCN-008 | proposed | copy |
| setup.plan-train | save release train ${t} | lib/setup.js:589 | SCN-008 | proposed | copy |
| setup.train-not-forgotten | The saved release train was not forgotten. | lib/setup.js:629 | SCN-008 | proposed | copy |
| setup.open-now | Open now: | lib/setup.js:693 | SCN-008 | proposed | layout |
| setup.still-open | Still open: | lib/setup.js:693 | SCN-009 | proposed | layout |
| setup.steps-header | Your steps (sign-ins, consents and secrets in hidden prompts need you in person): | lib/setup.js:697 | SCN-008 | proposed | copy |
| setup.closing.warnings | , ${a.warn} warning(s) | lib/setup.js:701 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.now | ${a.fail ? `${a.fail} problem(s)` : 'No problems'}${warned}. Check again any time: ${D.NPX} doctor | lib/setup.js:702 | SCN-008, SCN-009 | proposed | copy |
| setup.closing.after | ${a.fail ? `${a.fail} problem(s) remain` : 'No problems remain'} (before: ${b.fail})${warned}. Check again any time: ${D.NPX} doctor | lib/setup.js:703 | SCN-008, SCN-009 | proposed | copy |
| setup.refuse-root | passioncode: run ${cmd === 'doctor' ? 'doctor --fix' : 'setup'} as yourself, without sudo: it installs into your own home folder, and what root installs there you could not replace. | bin/passioncode.js:120 | SCN-008 | proposed | error |
| trains.not-a-name | "${id}" is not a release train name | lib/trains.js:19 | SCN-014 | proposed | copy |
| trains.unknown | no release train "${id}" in this launcher (known: ${list().join(', ')}) | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.none-shipped | no release train "${id}": this launcher ships no release train | lib/trains.js:22 | SCN-014 | proposed | copy |
| trains.unreadable | release train "${id}" cannot be read: ${error.message} | lib/trains.js:23 | SCN-014 | proposed | copy |
| trains.misnamed | release train file ${id}.json names "${doc.train}" | lib/trains.js:25 | SCN-014 | proposed | copy |
| trains.no-pin | release train "${id}" pins no app | lib/trains.js:27 | SCN-014 | proposed | copy |
| trains.unknown-app | release train "${id}" pins an unknown app "${app}" | lib/trains.js:29 | SCN-014 | proposed | copy |
| trains.bad-version | release train "${id}" pins ${app} at "${version}", not a version | lib/trains.js:30 | SCN-014 | proposed | copy |
| setup.tools-question | Let Claude Code use PassionCode's own tools without asking (allow ${result.permissions.rules.join(', ')})? | lib/setup.js:269 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-pending | allow ${result.permissions.rules.join(', ') \|\| "PassionCode's own tools"} in ${file} | lib/setup.js:411 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-done | allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins) | lib/setup.js:416 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-already | nothing to add in ${file}: each rule is already allowed, asked about or denied there | lib/setup.js:417 | SCN-008, SCN-009 | proposed | copy |
| permissions.link-loop | ${file}: too many levels of links | lib/permissions.js:224 | SCN-008, SCN-009 | proposed | error |
| setup.kept-out | Left out, because you removed ${names.length === 1 ? 'it' : 'them'} with permissions remove: ${names.join(', ')}. To add one back: ${D.NPX} permissions allow <rule> | lib/setup.js:662 | SCN-008, SCN-015 | proposed | copy |
| permissions.bypass-needs-yes | bypassPermissions lets Claude Code use every tool and run every command without asking you; set it in a terminal, or add --confirm-bypass | bin/passioncode.js:186 | SCN-015 | proposed | error |
| permissions.bypass-question | bypassPermissions lets Claude Code use every tool and run every command without asking you. Set it as Claude Code's default mode? [y/N] | bin/passioncode.js:187 | SCN-015 | proposed | copy |
| permissions.bypass-declined | passioncode: the default mode was not changed. | bin/passioncode.js:188 | SCN-015 | proposed | copy |
| permissions.confirm-misplaced | --confirm-bypass goes with mode bypassPermissions | bin/passioncode.js:154 | SCN-015 | proposed | error |
| permissions.unreadable | ${file} cannot be read: ${error.message} | lib/permissions.js:191 | SCN-008, SCN-009 | proposed | error |
| permissions.invalid-json | ${file} is not valid JSON: ${error.message} | lib/permissions.js:194 | SCN-008, SCN-009 | proposed | error |
| permissions.not-object | ${file} does not hold a settings object | lib/permissions.js:195 | SCN-008, SCN-009 | proposed | error |
| permissions.permissions-shape | ${file}: "permissions" is not an object | lib/permissions.js:197 | SCN-008, SCN-009 | proposed | error |
| permissions.list-shape | ${file}: "permissions.${list}" is not a list | lib/permissions.js:199 | SCN-008, SCN-009 | proposed | error |
| setup.tools-plan | let Claude Code use PassionCode's own tools without asking: allow ${rules.join(', ')} | lib/setup.js:588 | SCN-008 | proposed | copy |
| setup.tools-plan.how | (asked in a terminal, or --allow-tools) | lib/setup.js:618 | SCN-008 | proposed | copy |
| setup.tools-fails | A run with ${failing.join(' or ')} fails until that is fixed. | lib/setup.js:657 | SCN-008 | proposed | copy |
| setup.tools-unreadable | Claude Code's settings were not changed: ${tools.error} | lib/setup.js:655 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-hint | Claude Code still asks before it uses PassionCode's own tools. To allow them: ${D.NPX} setup --allow-tools | lib/setup.js:668 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-question | Let Claude Code run these commands without asking: ${result.commands.rules.map(commandLine).join('; ')}${wild}? | lib/setup.js:273 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-question.wild | ; a rule ending in * allows any arguments after its words | lib/setup.js:272 | SCN-008 | proposed | copy |
| setup.commands-rule | ${r.rule} (${r.why}${r.by ? `; declared by ${r.by}` : ''}) | lib/setup.js:587 | SCN-008 | proposed | copy |
| setup.commands-plan | let Claude Code run these commands without asking (asked in a terminal, or --allow-commands): | lib/setup.js:621 | SCN-008 | proposed | copy |
| setup.commands-plan.wild | (a rule ending in * allows any arguments after its words, options included) | lib/setup.js:623 | SCN-008 | proposed | copy |
| setup.commands-pending | allow ${result.commands.rules.map((r) => r.rule).join(', ') \|\| 'the rules for commands'} in ${file} | lib/setup.js:426 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-done | allowed ${added.join(', ')} in ${file} (an ask or deny rule for them still wins${added.some(wildcard) ? '; a rule ending in * allows any arguments after its words' : ''}) | lib/setup.js:433 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-already | nothing to add in ${file}: each rule is already allowed, asked about or denied there | lib/setup.js:417 | SCN-008, SCN-009 | proposed | copy |
| setup.commands-hint | Claude Code still asks before it runs ${cmds.rules.map((r) => r.rule).join(', ')}. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''} | lib/setup.js:673 | SCN-008, SCN-009 | proposed | copy |
| setup.tools-hint-quiet | Claude Code's allow rules do not include PassionCode's own tools; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-tools | lib/setup.js:667 | SCN-008 | proposed | copy |
| setup.commands-hint-quiet | Claude Code's allow rules do not include ${cmds.rules.map((r) => r.rule).join(', ')}; its default mode in your user settings, ${quiet}, decides what it does without them. To allow them: ${D.NPX} setup --allow-commands${cmds.rules.some((r) => wildcard(r.rule)) ? ' (a rule ending in * allows any arguments after its words)' : ''} | lib/setup.js:671 | SCN-008 | proposed | copy |
| setup.commands-refused | Rules declared on this machine and not offered as declared: | lib/setup.js:676 | SCN-008 | proposed | copy |
| permissions.gh-merge | merge a pull request with the GitHub CLI; the rule cannot be limited to your repositories | lib/permissions.js:17 | SCN-008 | proposed | copy |
| permissions.rule-not-text | a rule is not text | lib/permissions.js:63 | SCN-008 | proposed | error |
| permissions.rule-mcp | ${rule}: a declared rule names a command; an MCP server's tools are not offered here | lib/permissions.js:64 | SCN-008 | proposed | error |
| permissions.rule-kind | ${rule}: a declared rule names a command, as Bash(<command>) | lib/permissions.js:66 | SCN-008 | proposed | error |
| permissions.rule-compound | ${rule}: a command with a quote, an escape, a substitution, a separator, a redirection or a character that is not plain text is not offered | lib/permissions.js:67 | SCN-008 | proposed | error |
| permissions.rule-any | ${rule}: it would allow any command | lib/permissions.js:70 | SCN-008 | proposed | error |
| permissions.rule-wildcard | ${rule}: a wildcard is allowed only at the end | lib/permissions.js:72 | SCN-008 | proposed | error |
| permissions.rule-cmd-wildcard | ${rule}: a .cmd or .bat file runs through cmd, which reads its arguments again; a wildcard is not offered | lib/permissions.js:82 | SCN-008 | proposed | error |
| permissions.rule-runner | ${rule}: a wildcard over ${program} could run any code; declare the exact command, or a command of your own | lib/permissions.js:83 | SCN-008 | proposed | error |
| permissions.rule-one-word | ${rule}: it would allow any command of ${program} | lib/permissions.js:84 | SCN-008 | proposed | error |
| permissions.rule-relative-path | ${rule}: PATH holds an empty or relative folder, which a shell reads from wherever it runs; a wildcard is not offered while it does | lib/permissions.js:89 | SCN-008 | proposed | error |
| permissions.rule-root-home | ${rule}: your home folder is the root folder, so no command there counts as your own; a wildcard is not offered | lib/permissions.js:91 | SCN-008 | proposed | error |
| permissions.rule-not-found | ${rule}: ${words[0]} is not found on PATH; a wildcard is offered only over a command installed in your home folder | lib/permissions.js:90 | SCN-008 | proposed | error |
| permissions.rule-outside-home | ${rule}: ${words[0]} is installed outside your home folder (${found}); a wildcard is offered only over a command of your own there | lib/permissions.js:92 | SCN-008 | proposed | error |
| permissions.rule-plain-name | ${rule}: name the program by its plain name, in lower case, without a path | lib/permissions.js:74 | SCN-008 | proposed | error |
| permissions.rule-wrapper | ${rule}: ${program} runs another program, so the rule could run any code | lib/permissions.js:81 | SCN-008 | proposed | error |
| permissions.declared-dir-unreadable | ${dir} cannot be read: ${error.message} | lib/permissions.js:144 | SCN-008 | proposed | error |
| permissions.rule-not-object | a rule is not an object | lib/permissions.js:159 | SCN-008 | proposed | error |
| permissions.rule-wildcard-end | ${rule}: a wildcard at the end needs :* or a space before it | lib/permissions.js:71 | SCN-008 | proposed | error |
| permissions.declared-unreadable | ${file} cannot be read: ${error.message} | lib/permissions.js:150 | SCN-008 | proposed | error |
| permissions.declared-shape | ${file} does not say who declares it ("by", 1 to 80 characters) and its rules ("rules") | lib/permissions.js:153 | SCN-008 | proposed | error |
| permissions.declared-why | ${file}: ${r.rule}: "why" says what it allows, in 1 to 200 characters | lib/permissions.js:162 | SCN-008 | proposed | error |
| permissions.declared-twice-file | ${file}: ${r.rule} is declared twice in this file; it is counted once | lib/permissions.js:163 | SCN-008 | proposed | error |
| permissions.declared-twice | ${file}: ${r.rule} is the same rule ${rules.find((x) => x.rule === r.rule).by} declares; it is counted once | lib/permissions.js:164 | SCN-008 | proposed | error |
| permissions.declared-by-control | ${file}: "by" holds a control or format character | lib/permissions.js:151 | SCN-008 | proposed | error |
| permissions.declared-why-control | ${file}: ${r.rule}: "why" holds a control or format character | lib/permissions.js:161 | SCN-008 | proposed | error |
| perm.title | Claude Code permissions in ${view.settingsFile} | bin/passioncode.js:214 | SCN-015 | proposed | copy |
| perm.mode | Default mode: ${!view.readable ? 'unknown (the settings file cannot be read)' : view.mode.value === null ? 'not set in this file (Claude Code asks before it edits files or runs commands, except what the allow rules let it do, unless a project or managed setting sets a mode)' : `${shown(String(view.mode.value))} (in this file; a project or managed setting can set another)`} | bin/passioncode.js:217 | SCN-015 | proposed | copy |
| perm.rules | PassionCode's rules: | bin/passioncode.js:219 | SCN-015 | proposed | copy |
| perm.when.removed | removed ${r.removedAt} by ${r.removedBy}${['allowed', 'asked', 'denied'].includes(r.state) ? ', and set again by hand since' : ''} | bin/passioncode.js:221 | SCN-015 | proposed | copy |
| perm.offered | Offered and not allowed yet: | bin/passioncode.js:227 | SCN-015 | proposed | copy |
| perm.allow-hint | To allow them: ${require('../lib/doctor').NPX} permissions allow <rule> | bin/passioncode.js:228 | SCN-015 | proposed | copy |
| perm.foreign | Other allow rules (not PassionCode's; never changed here): | bin/passioncode.js:230 | SCN-015 | proposed | copy |
| perm.refused | Rules declared on this machine and not offered as declared: | bin/passioncode.js:231 | SCN-015 | proposed | copy |
| doctor.auto-update-off | automatic updates are off (update.auto), by config set or by an uninstall by 0.2.75 or earlier; turning them on is your choice | lib/doctor.js:237 | SCN-010 | proposed | copy |
| doctor.skills-shadowed | shadowed by ${path.join(skillsDir, m.shadows.join(', '))} | lib/doctor.js:230 | SCN-010 | proposed | copy |
| doctor.sessions-unchecked | sessions Fabric starts on a board request: doctor checks the apps they need on macOS and Windows only | lib/doctor.js:540 | SCN-010 | proposed | copy |
| doctor.sessions-none | sessions Fabric starts on a board request: Fabric is not installed here | lib/doctor.js:542 | SCN-010 | proposed | copy |
| doctor.sessions | sessions Fabric starts on a board request, with Claude Code as the default agent: ${missing.length ? `missing ${missing.join(', ')}` : 'everything they need is in place'} | lib/doctor.js:574 | SCN-010 | proposed | copy |
| doctor.app-shared | ${label}: the copy in ${copy.path} is ${whose}, left as it is${links} | lib/catalog.js:222 | SCN-017 | proposed | layout |
| doctor.mcp-shared | ${agent.name}: ${m.name} runs from ${other.path}, not from your copy in ${path.dirname(at)} | lib/doctor.js:375 | SCN-017 | proposed | layout |
| doctor.mcp-shared-launcher | ${runs}; setup points it at yours | lib/doctor.js:376 | SCN-017 | proposed | layout |
| doctor.mcp-shared-person | ${runs}; the launcher did not set this entry | lib/doctor.js:379 | SCN-017 | proposed | layout |
| doctor.mcp-shared-remove | claude mcp remove --scope user ${m.name} | lib/doctor.js:378 | SCN-017 | proposed | copy |
| doctor.service-foreign-user | port ${port} belongs to another OS account (${owner.owner}); doctor sent it nothing and did not read its answer | lib/doctor.js:130 | SCN-017 | proposed | copy |
| doctor.service-owner-untold | the owner of port ${port} cannot be told (${owner.reason || 'no owner in the socket table'}); doctor sent it nothing and did not read its answer | lib/doctor.js:130 | SCN-017 | proposed | copy |
| doctor.service-down | nothing listens on port ${port} | lib/doctor.js:125 | SCN-017 | proposed | copy |
| doctor.service-foreign-user-fix | another OS account's program holds port ${w.port}: ask whoever runs it to stop it, then run doctor again | lib/doctor.js:524 | SCN-017 | proposed | copy |
| doctor.service-owner-untold-fix | run doctor again; if it repeats, check who listens on port ${w.port} | lib/doctor.js:524 | SCN-017 | proposed | copy |
| doctor.service-table-restricted-fix | this system shows doctor only its own sockets, so it cannot tell who answers on port ${w.port}; check the service ${doctorCmd ? `with ${doctorCmd}` : 'in Fabric Dashboards'} | lib/doctor.js:524 | SCN-017 | proposed | copy |
| doctor.service-setup | waits for setup: ${w.setup.join(', ')} | lib/doctor.js:517 | SCN-009 | proposed | copy |
| doctor.service-setup-fix | finish its setup: a person fills ${w.setup.join(', ')}${doctorCmd ? `; ${doctorCmd} names the steps` : ''} | lib/doctor.js:524 | SCN-009 | proposed | copy |
| analytics.notice | The PassionCode launcher sends anonymous usage and error counts to improve it. Turn them off for the launcher: ${require('./launcher').npxCommand()} analytics off (each PassionCode app has its own switch). | lib/analytics.js:31 | SCN-016 | proposed | copy |
| analytics.status | Anonymous usage and error counts from the launcher: ${s.sending ? `on, sent to ${s.host}` : why[s.reason]}. Each PassionCode app has its own switch. | bin/passioncode.js:248 | SCN-016 | proposed | copy |
| analytics.why.off | turned off (analytics off) | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.shared-unreadable | off for now: the shared PassionCode installation file cannot be read or holds no usable id, so nothing is sent until it can be | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.unreadable | off for now: the switch file ${require('path').join(state, 'analytics.json')} cannot be read; analytics on or analytics off writes it again | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.off-elsewhere | off, because they were turned off in another PassionCode app before the launcher counted anything; analytics on turns them on for the launcher alone | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.env | off for this process (PASSIONCODE_ANALYTICS=off) | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.dnt | off for this process (DO_NOT_TRACK) | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.no-key | this build carries no App Key, so nothing is sent | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.why.notice | on, and this run shows their notice on stderr (unless another command is showing it right now); counts go to ${A.HOST} from then on | bin/passioncode.js:246 | SCN-016 | proposed | copy |
| analytics.save-failed | passioncode: the analytics switch could not be saved: ${error.message} | bin/passioncode.js:244 | SCN-016 | proposed | copy |
| analytics.usage | analytics takes on, off or status | bin/passioncode.js:240 | SCN-016 | proposed | error |
| perm.done | ${verb === 'allow' ? 'Allowed' : 'Removed'}: ${done.join(', ')} | bin/passioncode.js:173 | SCN-015 | proposed | copy |
| perm.mode-changed | Default mode: ${values[0]} (was ${r.from === null ? 'not set' : r.from}). | bin/passioncode.js:192 | SCN-015 | proposed | copy |
| perm.usage | passioncode: ${message}; run passioncode help. | bin/passioncode.js:204 | SCN-015 | proposed | error |
| perm.usage.by | --by needs who asked, for example "Fabric (operator)" | bin/passioncode.js:147 | SCN-015 | proposed | error |
| perm.usage.option | unknown option ${rest[n]} | bin/passioncode.js:148 | SCN-015 | proposed | error |
| perm.usage.by-text | --by is 1 to 80 characters of plain text | bin/passioncode.js:151 | SCN-015 | proposed | error |
| perm.usage.by-verb | --by goes with allow, remove or mode | bin/passioncode.js:153 | SCN-015 | proposed | error |
| perm.usage.rule | ${verb} needs at least one rule | bin/passioncode.js:169 | SCN-015 | proposed | error |
| perm.usage.mode | mode needs one of ${ledger.MODES.join(', ')} | bin/passioncode.js:178 | SCN-015 | proposed | error |
| perm.usage.verb | unknown permissions command ${verb} | bin/passioncode.js:195 | SCN-015 | proposed | error |
| ledger.not-offered | not a rule PassionCode offers: ${unknown.join(', ')} | lib/ledger.js:139 | SCN-015 | proposed | error |
| ledger.not-installed | not a rule PassionCode offers now or has in its ledger: ${foreign.join(', ')}; remove it in ${settingsFile} yourself | lib/ledger.js:155 | SCN-015 | proposed | error |
| ledger.mode | mode must be one of ${MODES.join(', ')} | lib/ledger.js:178 | SCN-015 | proposed | error |
| ledger.invalid-json | ${file} is not valid JSON: ${error.message} | lib/ledger.js:29 | SCN-015 | proposed | error |
| perm.when.installed | installed ${r.installedAt} by ${r.installedBy \|\| r.by} | bin/passioncode.js:222 | SCN-015 | proposed | copy |
| perm.when.none | not in the ledger (set before it, or by hand) | bin/passioncode.js:222 | SCN-015 | proposed | copy |
| perm.line | ${r.state.padEnd(8)} ${r.rule} (${r.why}; declared by ${r.by}; ${when}) | bin/passioncode.js:223 | SCN-015 | proposed | layout |
| perm.nothing | Nothing to ${verb}: ${verb === 'allow' ? 'each rule is already allowed, asked about or denied' : 'none of them is allowed there'}. | bin/passioncode.js:174 | SCN-015 | proposed | copy |
| perm.mode-same | Default mode is already ${values[0]}. | bin/passioncode.js:192 | SCN-015 | proposed | copy |
| ledger.unreadable | ${file} cannot be read: ${error.message} | lib/ledger.js:27 | SCN-015 | proposed | error |
| ledger.schema | ${file} is not a ${SCHEMA} ledger | lib/ledger.js:31 | SCN-015 | proposed | error |
| ledger.unwritable | ${file} cannot be written: ${error.message} | lib/ledger.js:44 | SCN-015 | proposed | error |
| setup.ledger-note | ; the permissions ledger was not updated (${error.message}) | lib/setup.js:584 | SCN-008, SCN-009, SCN-015 | proposed | error |
| setup.verify-line | ${product.app}, ${c.check}: ${c.detail} | lib/releases.js:246 | SCN-011 | proposed | layout |
| setup.blocked-folder | ${where} is not writable for you, so nothing is downloaded: ${appsDir() ? 'unset PASSIONCODE_APPLICATIONS to use ~/Applications, or ' : ''}${how} | lib/catalog.js:234 | SCN-017 | proposed | layout |
| setup.blocked-folder.how | make it writable (in Finder, Get Info: untick Locked, and under Sharing & Permissions give yourself Read & Write) | lib/catalog.js:233 | SCN-017 | proposed | copy |
| setup.blocked-folder.how-admin | ask an administrator to let you write it | lib/catalog.js:233 | SCN-017 | proposed | copy |
| setup.blocked-foreign | ${where} is another user's copy, left as it is, so nothing is downloaded: ${appsDir() ? 'unset PASSIONCODE_APPLICATIONS to use ~/Applications, or set it to a folder of your own' : 'ask an administrator to move it'} | lib/catalog.js:230 | SCN-017 | proposed | layout |
| setup.install-note.blocked-needs | ; it also needs ${missing.join(' and ')} | lib/setup.js:87 | SCN-017 | proposed | copy |
| doctor.app-version-unknown.blocked | if its signature check fails too, setup cannot reinstall it: | lib/doctor.js:305 | SCN-017 | proposed | copy |
| setup.blocked | Nothing was changed: ${need(result.blocked)} a folder you can write; the steps below say which.${stand(a)} | lib/setup.js:642 | SCN-017 | proposed | layout |
| setup.would-block | Nothing would change: ${need(names)} a folder you can write (see the plan below).${stand(a)} | lib/setup.js:575 | SCN-017 | proposed | layout |
| setup.left-blocked | Not installed or replaced: ${need(names)} a folder you can write; the steps below say which. | lib/setup.js:576 | SCN-017 | proposed | layout |
| setup.declined-blocked | Not asked about: ${need(names)} a folder you can write; the steps below say which. | lib/setup.js:564 | SCN-017 | proposed | layout |
| hook.unreadable-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but who published it could not be read, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:265 | SCN-006 | proposed | copy |
| hook.untrusted-publisher | [passioncode] ${PACKAGE}@${latest} is on npm but published by ${[...new Set(untrusted)].join(', ')}, not a trusted PassionCode publisher, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:268 | SCN-006 | proposed | copy |
| hook.unsigned | [passioncode] ${PACKAGE}@${latest} is on npm but its registry signature does not verify against the npm key pinned in this plugin, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:273 | SCN-006 | proposed | copy |
| hook.no-provenance | [passioncode] ${PACKAGE}@${latest} is on npm without a build provenance attestation, so it is not installed; ${keep()} | plugin/passioncode/hooks/update-check.js:276 | SCN-006 | proposed | copy |
| hook.updating | [passioncode] ${latest} is out (you have ${state.installed}); updating in the background; it takes effect next session. | plugin/passioncode/hooks/update-check.js:286 | SCN-006 | proposed | copy |
| hook.keep | keep using ${state.installed} (npx ${PACKAGE}@${state.installed}, not @latest) and see ${SECURITY_URL}. | plugin/passioncode/hooks/update-check.js:226 | SCN-006 | proposed | copy |
| hook.check-failed | [passioncode] the daily update check failed: ${oneLine(state.checkError)} (log: ~/.passioncode/logs/probe.log). | plugin/passioncode/hooks/update-check.js:240 | SCN-006 | proposed | copy |
| hook.refusal-standing | [passioncode] ${PACKAGE}@${standing[0]} was not installed (${REFUSED[standing[1]] || 'refused'}) and the last check could not tell whether that changed; ${keep()} | plugin/passioncode/hooks/update-check.js:256 | SCN-006 | proposed | copy |
| hook.refusal-standing-npm-missing | [passioncode] ${PACKAGE}@${standing[0]} was not installed (${REFUSED[standing[1]] || 'refused'}), and nothing is checked until there is npm beside this Node; ${kept} | plugin/passioncode/hooks/update-check.js:252 | SCN-006 | proposed | copy |
| hook.refusal-standing-npm-back | [passioncode] ${PACKAGE}@${standing[0]} was not installed (${REFUSED[standing[1]] || 'refused'}); npm is beside this Node again and the check runs now; ${keep()} | plugin/passioncode/hooks/update-check.js:254 | SCN-006 | proposed | copy |
| hook.refusal-standing-kept | keep using ${state.installed} and see ${SECURITY_URL}. | plugin/passioncode/hooks/update-check.js:251 | SCN-006 | proposed | copy |
| status.npm.not-checked-refused | npm latest: not checked (${cause}; ${refusedVersion} not installed automatically: ${REFUSED[refused] || 'refused'}) | bin/passioncode.js:16 | SCN-001 | proposed | copy |
| status.npm.not-checked-npm-missing | npm latest: not checked (${cause}) | bin/passioncode.js:14 | SCN-001 | proposed | copy |
| status.npm.cause-npm-missing | no npm beside this Node | bin/passioncode.js:13 | SCN-001 | proposed | copy |
| status.npm.cause-failed | last check failed | bin/passioncode.js:13 | SCN-001 | proposed | copy |
| hook.manual | [passioncode] ${latest} is out (you have ${state.installed}): npx ${REGISTRY_ARGS.join(' ')} ${PACKAGE}@${latest} update | plugin/passioncode/hooks/update-check.js:288 | SCN-006 | proposed | copy |
| hook.setup-check | [passioncode] the setup check of ${when} found ${fails} problem(s) | plugin/passioncode/hooks/session-start.js:207 | SCN-013 | proposed | copy |
| setup.memory-install-vault | install ${catalog.WIKI.name} ${memory.PIN} with uv (the agents' wiki memory) and make its vault in ${vault} | lib/setup.js:108 | SCN-018 | proposed | copy |
| setup.memory-install | install ${catalog.WIKI.name} ${memory.PIN} with uv (the agents' wiki memory); your wiki config keeps its keys, apart from ${memory.KEPT_APART} | lib/setup.js:109 | SCN-018 | proposed | copy |
| setup.memory-vault | make the agents' wiki vault in ${vault} with obsidian-wiki setup --no-hooks | lib/setup.js:110 | SCN-018 | proposed | copy |
| setup.memory-question | ${i.detail[0].toUpperCase()}${i.detail.slice(1)}? | lib/setup.js:255 | SCN-018 | proposed | layout |
| setup.memory-step | The wiki memory: ${i.note} | lib/setup.js:498 | SCN-018 | proposed | layout |
| setup.memory-name | the wiki memory | lib/setup.js:145 | SCN-018 | proposed | copy |
| setup.repair-tool | bring ${catalog.WIKI.name} up to ${memory.PIN} with uv tool install --force (its vault stays as it is, and the config's keys too apart from ${memory.KEPT_APART}) | lib/setup.js:133 | SCN-018 | proposed | copy |
| memory.vault-problem.not-folder | is not a folder | lib/memory.js:190 | SCN-018 | proposed | copy |
| memory.vault-problem.holds-files | already holds files | lib/memory.js:193 | SCN-018 | proposed | copy |
| doctor.memory-wiki-absent | ${catalog.WIKI.name} (the agents' wiki memory): not installed | lib/memory.js:492 | SCN-018 | proposed | copy |
| doctor.memory-wiki-behind | ${catalog.WIKI.name} ${t.version}; this launcher pins ${PIN} | lib/memory.js:518 | SCN-018 | proposed | copy |
| doctor.memory-wiki-unread | ${catalog.WIKI.name} at ${t.bin}: its version could not be read; this launcher pins ${PIN} | lib/memory.js:509 | SCN-018 | proposed | copy |
| doctor.memory-wiki-other-tool | bring it to ${PIN} with the tool that installed it (uv does not list it) | lib/memory.js:519 | SCN-018 | proposed | copy |
| doctor.memory-wiki-pinned | ${catalog.WIKI.name} ${t.version} (pinned by this launcher) | lib/memory.js:524 | SCN-018 | proposed | copy |
| doctor.memory-wiki-ahead | ${catalog.WIKI.name} ${t.version}, ahead of this launcher's pin ${PIN}; never taken back | lib/memory.js:524 | SCN-018 | proposed | copy |
| doctor.memory-wiki-path | ${catalog.WIKI.name} is in ${path.dirname(t.bin)}, which is not on your PATH, so agents and its hooks cannot run it by name | lib/memory.js:530 | SCN-018 | proposed | copy |
| doctor.memory-wiki-path-fix | uv tool update-shell, then open a new terminal | lib/memory.js:530 | SCN-018 | proposed | copy |
| doctor.memory-vault-none | no wiki vault yet (obsidian-wiki has no config) | lib/memory.js:539 | SCN-018 | proposed | copy |
| doctor.memory-vault-passes | obsidian-wiki doctor passes | lib/memory.js:572 | SCN-018 | proposed | copy |
| doctor.memory-hooks-none | Claude Code starts a session without a recap of the wiki (obsidian-wiki's SessionStart hook is not registered) | lib/memory.js:613 | SCN-018 | proposed | copy |
| doctor.memory-hooks-unreachable | obsidian-wiki's SessionStart hook is registered but cannot reach the package, so it ends silently | lib/memory.js:619 | SCN-018 | proposed | copy |
| doctor.memory-hooks-ok | Claude Code starts each session with a recap of the wiki (obsidian-wiki's SessionStart hook) | lib/memory.js:621 | SCN-018 | proposed | copy |
| doctor.memory-hooks-stop | obsidian-wiki's Stop hook is registered: after every turn of every Claude Code session, in every project, it asks the agent to write into the wiki; the launcher never registers it | lib/memory.js:624 | SCN-018 | proposed | copy |
| memory.done-installed | installed ${catalog.WIKI.name} ${PIN} | lib/memory.js:700 | SCN-018 | proposed | copy |
| memory.done-vault | made the wiki vault ${vault} | lib/memory.js:790 | SCN-018 | proposed | copy |
| memory.done-hook | registered its SessionStart recap for Claude Code | lib/memory.js:806 | SCN-018 | proposed | copy |
| memory.no-uv | uv is not installed (${UV_PAGE}); nothing was installed | lib/memory.js:681 | SCN-018 | proposed | copy |
| memory.folder-taken | ${vault} ${problem}; no vault was made (choose another folder with --wiki-vault <dir>) | lib/memory.js:720 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-other-system | ${ob.name}: setup installs it on macOS; on this system download it from ${ob.page} | lib/doctor.js:402 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-absent | ${ob.name} (where you read the agents' wiki memory): not installed | lib/doctor.js:412 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-team | (its Developer ID team is ${ob.team}) | lib/doctor.js:435 | SCN-018 | proposed | copy |
| releases.obsidian-digest-ok | ${assetName}: SHA-256 matches GitHub's digest (${product.name} publishes no signed SHA256SUMS) | lib/releases.js:213 | SCN-018 | proposed | copy |
| releases.obsidian-digest-differs | ${assetName}: SHA-256 ${got} differs from GitHub's digest ${asset.digest}; nothing was installed | lib/releases.js:212 | SCN-018 | proposed | copy |
| releases.obsidian-no-digest | ${release.tag} publishes no SHA-256 digest for ${assetName}; nothing unverified is installed | lib/releases.js:201 | SCN-018 | proposed | copy |
| setup.plan-install.vendor | its latest release, checked by ${pr.name}'s own Developer ID signature, its notarization and GitHub's digest | lib/setup.js:73 | SCN-018 | proposed | copy |
| setup.repair-hook | register obsidian-wiki's SessionStart recap for Claude Code again; the launcher writes the entry, keeping the file private | lib/setup.js:134 | SCN-018 | proposed | copy |
| setup.memory-open-vault | Open the wiki vault ${v} in Obsidian once to read what your agents remember: ${route(v)}. | lib/setup.js:510 | SCN-018 | proposed | copy |
| memory.needs-uv.brew | needs uv: brew install uv, then run setup again | lib/memory.js:150 | SCN-018 | proposed | copy |
| memory.needs-uv.person | needs uv: a person installs it with the installer its page names (${UV_PAGE}), then runs setup again | lib/memory.js:151 | SCN-018 | proposed | copy |
| memory.uv-step.person | a person installs uv with the installer its page names (${UV_PAGE}) | lib/memory.js:151 | SCN-018 | proposed | copy |
| memory.needs-git.mac | needs git: install Apple's command line tools (xcode-select --install), then run setup again | lib/memory.js:160 | SCN-018 | proposed | copy |
| memory.needs-git | needs git: install it (${GIT_PAGE}), then run setup again | lib/memory.js:162 | SCN-018 | proposed | copy |
| memory.refresh | run: obsidian-wiki list (an ordinary command: it records the installed version and package path and refreshes the skills, keeping every other key of the config); ${NEVER} | lib/memory.js:32 | SCN-018 | proposed | copy |
| doctor.memory-wiki-shadow | ${t.bin} is found on PATH before uv's copy in ${path.dirname(t.uvCopy)}, so agents run that one | lib/memory.js:527 | SCN-018 | proposed | copy |
| doctor.memory-wiki-shadow-fix | remove it with the tool that installed it (pip uninstall obsidian-wiki, or pipx uninstall obsidian-wiki) | lib/memory.js:527 | SCN-018 | proposed | copy |
| doctor.memory-hooks-elsewhere | obsidian-wiki's SessionStart hook is registered where this Claude Code does not read it: obsidian-wiki writes its hooks only to ${hooksFile(home)}; this Claude Code reads ${claude.settings} | lib/memory.js:597 | SCN-018 | proposed | copy |
| doctor.memory-hooks-elsewhere-none | obsidian-wiki writes its hooks only to ${hooksFile(home)}; this Claude Code reads ${claude.settings}, so it starts sessions without a recap of the wiki | lib/memory.js:598 | SCN-018 | proposed | copy |
| doctor.memory-hooks-unreadable | obsidian-wiki's hooks could not be read (${h.error}) | lib/memory.js:592 | SCN-018 | proposed | copy |
| doctor.memory-vault-unread | wiki vault: obsidian-wiki doctor could not be read (${(r.err \|\| r.out \|\| `exit ${r.code}`).trim().split('\n')[0]}) | lib/memory.js:552 | SCN-018 | proposed | copy |
| memory.done-hook-repair | registered obsidian-wiki's SessionStart recap for Claude Code | lib/memory.js:862 | SCN-018 | proposed | copy |
| memory.vault-step-failed | ${message}; nothing of the vault step was kept | lib/memory.js:777 | SCN-018 | proposed | copy |
| memory.setup-no-config | obsidian-wiki setup --no-hooks --vault ${vault} wrote no config | lib/memory.js:788 | SCN-018 | proposed | copy |
| memory.uv-installed-but | uv installed obsidian-wiki, but ${t ? `it reads ${t.version \|\| 'no version'}` : 'it does not answer'} | lib/memory.js:698 | SCN-018 | proposed | copy |
| memory.list-failed | obsidian-wiki list (it records the new version): ${lastLine(l)} | lib/memory.js:877 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-outdated | ; ${latest.version} is out (Obsidian updates itself inside the app) | lib/doctor.js:427 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-admin |  (the copy an administrator installed in ${path.dirname(admin)}) | lib/doctor.js:424 | SCN-018 | proposed | copy |
| doctor.memory-obsidian-admin-fix | an administrator reinstalls Obsidian from ${ob.page} | lib/doctor.js:436 | SCN-018 | proposed | copy |
| doctor.train-unusable-fix | first make the release train usable: ${fix} | lib/doctor.js:467 | SCN-014, SCN-018 | proposed | copy |
| args.unsupported-setup | passioncode: unsupported arguments for ${cmd}; run passioncode help. Ids: ${IDS.join(', ')}. | bin/passioncode.js:102 | SCN-007 | proposed | copy |
| args.wiki-vault-relative | --wiki-vault takes an absolute folder, or one that starts with ~/ (not ${value}) | bin/passioncode.js:72 | SCN-007, SCN-018 | proposed | copy |
| setup.restart | Restart your coding agents: skills and MCP servers load when a session starts. | lib/setup.js:533 | SCN-008, SCN-018 | proposed | copy |
| setup.memory-download-obsidian | Obsidian is where you read the wiki vault ${v}: download it from ${ob.page}, then open the vault in it: ${route(v)}. | lib/setup.js:511 | SCN-018 | proposed | copy |
| memory.report-installed | installed ${catalog.WIKI.name} ${PIN} with uv | lib/memory.js:699 | SCN-018 | proposed | copy |
| memory.report-vault | made the wiki vault ${vault} (a Git repository) with obsidian-wiki setup --no-hooks | lib/memory.js:789 | SCN-018 | proposed | copy |
| memory.vault-problem.unreadable | cannot be read (${error.code \|\| error.message}) | lib/memory.js:192 | SCN-018 | proposed | copy |
| memory.hook-no-tool | obsidian-wiki is not installed | lib/memory.js:828 | SCN-018 | proposed | copy |
| memory.upgrade-no-uv | uv is not installed (${UV_PAGE}) | lib/memory.js:893 | SCN-018 | proposed | copy |
| memory.upgrade-reads | uv installed obsidian-wiki ${PIN}, but it reads ${after ? after.version \|\| 'no version' : 'nothing'} | lib/memory.js:911 | SCN-018 | proposed | copy |
| doctor.memory-hooks-skills-elsewhere | ; obsidian-wiki's skills are likewise only in ${path.join(home, '.claude', 'skills')} | lib/memory.js:599 | SCN-018 | proposed | copy |
| memory.undo-failed | removing ${vault} failed (${error.code \|\| error.message}): remove it, then run setup again | lib/memory.js:747 | SCN-018 | proposed | copy |
| doctor.memory-wiki-uncomparable | ${catalog.WIKI.name} ${t.version} (not a version this launcher compares); this launcher pins ${PIN} | lib/memory.js:510 | SCN-018 | proposed | copy |
| memory.fix-reported | obsidian-wiki reports ${name} ${check.status \|\| 'warn'}: ${detail}; ${READ_DOCTOR}; ${NEVER} | lib/memory.js:217 | SCN-018 | proposed | copy |
| memory.fix-never | never `obsidian-wiki setup`, a bare `obsidian-wiki hooks install`, or obsidian-wiki's wiki-setup skill | lib/memory.js:29 | SCN-018 | proposed | copy |
| memory.fix-missing-files | create the missing files by hand (${detail}); ${NEVER} | lib/memory.js:215 | SCN-018 | proposed | copy |
| doctor.memory-config-broken | obsidian-wiki's config ${config} cannot be read (${broken}); setup makes no vault while it is there | lib/memory.js:542 | SCN-018 | proposed | copy |
| doctor.memory-config-broken-fix | repair or remove ${config}, then ${NPX} setup --with wiki | lib/memory.js:542 | SCN-018 | proposed | copy |
| doctor.memory-vault-unread-fix | run: obsidian-wiki doctor --json (it answered no report); repair through ${NPX} setup --with wiki where it offers one; its session-hooks line asking for a hooks install is expected, since the launcher registers only SessionStart; ${NEVER} | lib/memory.js:552 | SCN-018 | proposed | copy |
| doctor.memory-hooks-unreadable-fix | run: obsidian-wiki hooks status --json (it exits 1 while the Stop hook is not registered, which is expected: the launcher never registers it); ${NEVER} | lib/memory.js:592 | SCN-018 | proposed | copy |
| memory.done-upgrade-brought | brought ${catalog.WIKI.name} ${before.version} up to ${PIN}; the vault is as it was, and the config's keys too apart from ${KEPT_APART} | lib/memory.js:921 | SCN-018 | proposed | copy |
| memory.done-upgrade-forced | installed ${catalog.WIKI.name} ${PIN} with uv tool install --force; the vault is as it was, and the config's keys too apart from ${KEPT_APART} | lib/memory.js:922 | SCN-018 | proposed | copy |
| uninstall.memory-stays | \nThe agents' wiki memory stays: ${parts.join(', and ')}. | bin/passioncode.js:336 | SCN-005, SCN-018 | proposed | copy |
| memory.list-asks-setup | obsidian-wiki list did not record ${PIN} (it asks for obsidian-wiki setup); read \`obsidian-wiki doctor --json\`; repair through \`${NPX} setup --with wiki\` where it offers one; ${NEVER} | lib/memory.js:881 | SCN-018 | proposed | copy |
| memory.hook-link-done | registered obsidian-wiki's SessionStart recap for Claude Code in ${linked}, where the link ${file} points (the link stays) | lib/memory.js:861 | SCN-018 | proposed | copy |
| memory.hook-link-already | obsidian-wiki's SessionStart recap is registered already in ${linked \|\| file} | lib/memory.js:846 | SCN-018 | proposed | copy |
| memory.hook-link-unread | obsidian-wiki hooks install --only SessionStart wrote no settings the launcher could read (${e.code \|\| e.name}) | lib/memory.js:852 | SCN-018 | proposed | copy |
| memory.hook-link-no-entry | obsidian-wiki hooks install --only SessionStart wrote no SessionStart entry | lib/memory.js:854 | SCN-018 | proposed | copy |
| doctor.memory-hooks-link-fix-ours | ${NPX} setup (the launcher adds the entry to ${where}${linked ? `, where the link ${hooksFile(home)} points, keeping the link` : ''}) | lib/memory.js:611 | SCN-018 | proposed | copy |
| doctor.memory-hooks-link-fix | add obsidian-wiki's SessionStart entry (its command for ${HOOK_SCRIPTS.SessionStart}) to ${where} by hand, keeping the file's permissions; never \`obsidian-wiki hooks install\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER} | lib/memory.js:612 | SCN-018 | proposed | copy |
| doctor.memory-hooks-stop-link-fix | remove obsidian-wiki's Stop entry (its command for ${HOOK_SCRIPTS.Stop}) from ${linked \|\| hooksFile(home)} by hand, keeping the file's permissions; never \`obsidian-wiki hooks uninstall\` (it rewrites the file without them${linked ? ' and replaces the link' : ''}); ${NEVER} | lib/memory.js:625 | SCN-018 | proposed | copy |
| doctor.memory-wiki-absent-fix | ${route.step}, then ${NPX} setup --with wiki | lib/memory.js:491 | SCN-018 | proposed | copy |
| doctor.memory-wiki-behind-uv-first | ${route.step}, then ${NPX} setup | lib/memory.js:519 | SCN-018 | proposed | copy |
| memory.undo-config-failed | removing ${f} failed (${error.code \|\| error.message}): remove it, then run setup again | lib/memory.js:753 | SCN-018 | proposed | copy |
| memory.clash-note | obsidian-wiki's setup and its version refresh would replace ${list.length === 1 ? 'a skill of yours that shares a name with one of its own' : `${list.length} skills of yours that share a name with its own`} (${capped(list)}); move or rename ${list.length === 1 ? 'it' : 'them'} | lib/memory.js:335 | SCN-018 | proposed | copy |
| doctor.memory-wiki-clash | ${list.length === 1 ? 'a skill of yours shares a name' : `${list.length} skills of yours share a name`} with one of obsidian-wiki's, which its setup and its version refresh would replace: ${capped(list)} | lib/memory.js:344 | SCN-018 | proposed | copy |
| doctor.memory-wiki-clash-fix | move or rename ${list.length === 1 ? 'it' : 'them'} | lib/memory.js:347 | SCN-018 | proposed | copy |
| doctor.memory-wiki-clash-fix-then | ${fix}, then ${then} | lib/memory.js:349 | SCN-018 | proposed | copy |
| doctor.memory-vault-refresh-after-clash | first ${clashVerb(clashed)} memory.wiki.clash names; then ${REFRESH} | lib/memory.js:568 | SCN-018 | proposed | copy |
| memory.no-vault-clash | ${clashNote(clashed)}; no vault was made | lib/memory.js:718 | SCN-018 | proposed | copy |
| memory.no-upgrade-clash | ${clashNote(clashed)}; nothing was upgraded | lib/memory.js:897 | SCN-018 | proposed | copy |
| memory.hook-shape-hooks | ${file}: "hooks" is not an object; nothing was changed | lib/memory.js:839 | SCN-018 | proposed | copy |
| memory.hook-shape-start | ${file}: "hooks.SessionStart" is not a list of groups, each with a "hooks" list; nothing was changed | lib/memory.js:842 | SCN-018 | proposed | copy |
| memory.receipt-cannot-carry | uv's record for obsidian-wiki has ${name} as ${other.join(', ')}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself) | lib/memory.js:1014 | SCN-018 | proposed | copy |
| setup.obsidian-no-vault | Obsidian: the agents' wiki vault comes with the wiki memory's setup step, which names its path; once it is made, open it in Obsidian (choose Open folder as vault, press Cmd+Shift+G and paste that path). | lib/catalog.js:100 | SCN-018 | proposed | copy |
| doctor.memory-hooks-none-fix | obsidian-wiki hooks install --only SessionStart | none (no fix names it since PC-178 round 6) | SCN-018 | retired 2026-11-12 | copy |
| doctor.memory-vault-upgrade-first | bring obsidian-wiki up to ${PIN} first, by the route memory.wiki names; its upgrade records the version | lib/memory.js:566 | SCN-018 | proposed | copy |
| memory.undo-links | , and the ${unlinked} skill links obsidian-wiki's setup made were removed | lib/memory.js:776 | SCN-018 | proposed | copy |
| memory.receipt-held | uv's record for obsidian-wiki has ${held.join(', ')}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself) | lib/memory.js:1002 | SCN-018 | proposed | copy |
| uninstall.memory-wiki-part | obsidian-wiki, its vault and SessionStart hook' : here.vault ? 'obsidian-wiki and its vault' : here.hook ? 'obsidian-wiki and its SessionStart hook' : 'obsidian-wiki | bin/passioncode.js:334 | SCN-005, SCN-018 | proposed | copy |
| memory.xdg-relative | XDG_CONFIG_HOME is a relative path (${v}), which obsidian-wiki reads from the folder it runs in; set it to an absolute folder, or unset it, then run setup again | lib/memory.js:67 | SCN-018 | proposed | copy |
| memory.xdg-no-install | ${xdg}; nothing was installed | lib/memory.js:670 | SCN-018 | proposed | copy |
| memory.xdg-no-change | ${xdg}; nothing was changed | lib/memory.js:821 | SCN-018 | proposed | copy |
| doctor.memory-vault-unordered | obsidian-wiki ${t.version \|\| '(its version could not be read)'} is installed, a version this launcher cannot order against its pin ${PIN}, so it leaves the recorded version to you; ${NEVER} | lib/memory.js:565 | SCN-018 | proposed | copy |
| doctor.memory-hooks-script-missing | obsidian-wiki's SessionStart hook is registered, but the script its command runs is not there: ${gone} | lib/memory.js:617 | SCN-018 | proposed | copy |
| doctor.memory-hooks-script-missing-fix | remove that entry from ${linked \|\| hooksFile(home)} by hand, keeping the file's permissions; then ${NPX} setup --with wiki registers it again for the vault the launcher made; ${NEVER} | lib/memory.js:618 | SCN-018 | proposed | copy |
| memory.no-install-clash | ${clashNote(before)}; nothing was installed | lib/memory.js:687 | SCN-018 | proposed | copy |
| memory.no-refresh-clash | ${clashNote(clashed)}; its version was not recorded | lib/memory.js:875 | SCN-018 | proposed | copy |
| memory.undo-folders | , with the empty skills folders it made | lib/memory.js:776 | SCN-018 | proposed | copy |
| memory.receipt-unreadable | uv's record for obsidian-wiki has a ${key} list with ${why}, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself) | lib/memory.js:934 | SCN-018 | proposed | copy |
| doctor.train-then-memory | first make the release train usable: ${fix}; then ${c.fix} | lib/doctor.js:466 | SCN-018 | proposed | copy |
| doctor.memory-config-relative-fix | ${XDG_FIRST}, then ${NPX} setup --with wiki | lib/memory.js:454 | SCN-018 | proposed | copy |
| memory.uninstalled-again | ${error.message}; obsidian-wiki was uninstalled again (uv tool uninstall obsidian-wiki) | lib/memory.js:708 | SCN-018 | proposed | copy |
| memory.uninstall-failed | ${error.message}; uv tool uninstall obsidian-wiki failed (${lastLine(un)}): run it yourself | lib/memory.js:709 | SCN-018 | proposed | copy |
| setup.memory-unrecorded | ; the vault was not recorded in the launcher's state file (${a.unrecorded}), so a missing SessionStart hook will not be offered as a repair | lib/setup.js:380 | SCN-018 | proposed | copy |
| memory.receipt-before-table | text before its first table | lib/memory.js:994 | SCN-018 | proposed | copy |
| memory.receipt-unknown-table | a [${n}] table | lib/memory.js:996 | SCN-018 | proposed | copy |
| memory.unreadable-entry | ${at} could not be read (${code}) | lib/memory.js:266 | SCN-018 | proposed | copy |
| memory.wiki-broken | obsidian-wiki is installed by uv but does not run (its Python may be gone, or its command is not on this PATH) | lib/memory.js:1036 | SCN-018 | proposed | copy |
| memory.reinstall-recorded | reinstall it with uv, with what uv recorded: ${args.join(' ')} | lib/memory.js:1057 | SCN-018 | proposed | copy |
| memory.reinstall-plain | reinstall it with uv (uv tool install --force obsidian-wiki, with the extras and requirements you gave it) | lib/memory.js:1058 | SCN-018 | proposed | copy |
| doctor.memory-xdg-first | first ${XDG_FIRST}; then ${row.fix} | lib/memory.js:448 | SCN-018 | proposed | copy |
| doctor.memory-xdg-step | set XDG_CONFIG_HOME to an absolute folder, or unset it | lib/memory.js:440 | SCN-018 | proposed | copy |
| doctor.memory-error | the wiki memory could not be checked: ${error.message \|\| error} | lib/doctor.js:448 | SCN-018 | proposed | copy |
| doctor.memory-error-fix | fix what it names, then ${NPX} doctor | lib/doctor.js:448 | SCN-018 | proposed | copy |
| setup.memory-unchecked | could not be checked (${error.message \|\| error}); fix that, then run setup again | lib/setup.js:100 | SCN-018 | proposed | copy |
| memory.hook-kept | ${done.join(', ')} (kept); its SessionStart recap was not registered: ${reason}; fix that, then run setup again, which registers it | lib/memory.js:802 | SCN-018 | proposed | copy |
| memory.hook-settings-unchanged | ; Claude Code's settings file was not changed | lib/memory.js:801 | SCN-018 | proposed | copy |
| memory.undo-unreadable | reading obsidian-wiki's skills folders failed (${error.code \|\| error.message}): remove the skill links its setup made, then run setup again | lib/memory.js:761 | SCN-018 | proposed | copy |
| memory.receipt-array-tables | an array of tables ([[...]]) | lib/memory.js:995 | SCN-018 | proposed | copy |
| setup.memory-kept-step | The wiki memory: ${a.error} | lib/setup.js:500 | SCN-018 | proposed | copy |
| memory.clash-unreadable | ${capped(bad)}: repair the link or the permissions | lib/memory.js:336 | SCN-018 | proposed | copy |
| doctor.memory-clash-unreadable | ${capped(bad)}, where obsidian-wiki's setup links its skills | lib/memory.js:345 | SCN-018 | proposed | copy |
| memory.undo-config-unread | reading ${cdir} failed (${error.code \|\| error.message}): remove what obsidian-wiki setup wrote there, then run setup again | lib/memory.js:750 | SCN-018 | proposed | copy |
| memory.receipt-quoted-key | a quoted key (${m[2]}) | lib/memory.js:998 | SCN-018 | proposed | copy |
| setup.memory-unchecked-detail | the agents' wiki memory could not be checked: ${need.unchecked} | lib/setup.js:108 | SCN-018 | proposed | copy |
| memory.config-form-repo | ${config} points ${key} outside obsidian-wiki's package, which its version refresh would replace with the package path; remove that line, then run setup again | lib/memory.js:1160 | SCN-018 | proposed | copy |
| memory.config-form | ${config} writes ${key} ${form}, which obsidian-wiki's version refresh would rewrite; write it once as ${key}="...", then run setup again | lib/memory.js:1169 | SCN-018 | proposed | copy |
| memory.config-form.repeated | more than once | lib/memory.js:1078 | SCN-018 | proposed | copy |
| memory.config-form.export | after export | lib/memory.js:1079 | SCN-018 | proposed | copy |
| doctor.memory-config-form-repo-fix | remove the ${form.key} line from ${form.config}, then ${NPX} setup | lib/memory.js:1223 | SCN-018 | proposed | copy |
| doctor.memory-config-form-fix | write ${form.key} once as ${form.key}="..." in ${form.config}, then ${NPX} setup | lib/memory.js:1231 | SCN-018 | proposed | copy |
| memory.done-shadow | its SessionStart recap was not registered: ${shadowNote(home, shadow)} | lib/memory.js:797 | SCN-018 | proposed | copy |
| memory.clash-verb.skills | move or rename the skills | lib/memory.js:1219 | SCN-018 | proposed | copy |
| memory.clash-verb.folders | repair the folders | lib/memory.js:1219 | SCN-018 | proposed | copy |
| memory.capped-more | , and ${list.length - 5} more | lib/memory.js:1214 | SCN-018 | proposed | copy |
| memory.upgrade-stays | ${error.message}; obsidian-wiki ${PIN} stays installed while its config records another version, so its next command asks for obsidian-wiki setup | lib/memory.js:914 | SCN-018 | proposed | copy |
| memory.upgrade-put-back | ${error.message}; obsidian-wiki was put back to ${before.version} (uv ${back.join(' ')}) | lib/memory.js:916 | SCN-018 | proposed | copy |
| memory.upgrade-put-back-failed | ${error.message}; putting obsidian-wiki back to ${before.version} failed (${lastLine(b)}): obsidian-wiki ${PIN} stays installed while its config records ${before.version}, so its next command asks for obsidian-wiki setup; run uv ${back.join(' ')} yourself | lib/memory.js:917 | SCN-018 | proposed | copy |
| memory.receipt-inline-key | uv's record for obsidian-wiki has a quoted or dotted key in a requirement, which the launcher cannot carry into a reinstall; nothing was upgraded (bring it to ${PIN} with uv yourself) | lib/memory.js:1008 | SCN-018 | proposed | copy |
| memory.read-doctor | read `obsidian-wiki doctor --json` (its session-hooks hint asking for a bare hooks install is expected: the launcher registers only SessionStart) | lib/memory.js:219 | SCN-018 | proposed | copy |
| memory.config-form.spaced | with spaces around = | lib/memory.js:1080 | SCN-018 | proposed | copy |
| memory.config-form.single-quotes | in single quotes | lib/memory.js:1081 | SCN-018 | proposed | copy |
| memory.config-form.trailing | with text after its value | lib/memory.js:1082 | SCN-018 | proposed | copy |
| memory.config-form.bom | starts with a byte order mark | lib/memory.js:1076 | SCN-018 | proposed | copy |
| memory.config-form.breaks | with Windows line endings, a control character or a line break obsidian-wiki reads differently | lib/memory.js:1077 | SCN-018 | proposed | copy |
| memory.config-form-bom-note | ${config} starts with a byte order mark: save it without one, then run setup again | lib/memory.js:1167 | SCN-018 | proposed | copy |
| memory.config-form-breaks-note | ${config} is written ${form}, which obsidian-wiki's version refresh would rewrite; save it with plain line endings (\\n) and no control characters, then run setup again | lib/memory.js:1168 | SCN-018 | proposed | copy |
| memory.form-step.remove | remove the ${form.key} line memory.vault.config-form names | lib/memory.js:1171 | SCN-018 | proposed | copy |
| memory.form-step.save | save the config as memory.vault.config-form names | lib/memory.js:1174 | SCN-018 | proposed | copy |
| memory.form-step.rewrite | rewrite the ${form.key} line memory.vault.config-form names | lib/memory.js:1174 | SCN-018 | proposed | copy |
| doctor.memory-config-form-bom-fix | save ${form.config} without a byte order mark, then ${NPX} setup | lib/memory.js:1229 | SCN-018 | proposed | copy |
| doctor.memory-config-form-breaks-fix | save ${form.config} with plain line endings (\\n) and no control characters, then ${NPX} setup | lib/memory.js:1230 | SCN-018 | proposed | copy |
| doctor.memory-form-first | first ${formStep(form)}; then ${fix} | lib/memory.js:492 | SCN-018 | proposed | copy |
| doctor.memory-vault-refresh-form | first ${formStep(spaced)}; then ${REFRESH} | lib/memory.js:567 | SCN-018 | proposed | copy |
| doctor.memory-hooks-form-first | first ${formStep(form)}; then ${NPX} setup | lib/memory.js:611 | SCN-018 | proposed | copy |
| doctor.memory-wiki-own-fix | put the folder of that obsidian-wiki's command on your PATH, then ${NPX} doctor; the launcher never installs another copy over it | lib/memory.js:485 | SCN-018 | proposed | copy |
| memory.own-note | your own obsidian-wiki (its package ${at}) is installed outside uv, and its command is not on this PATH; put its command folder on PATH: the launcher never installs another copy over it | lib/memory.js:1259 | SCN-018 | proposed | copy |
| memory.config-form.relative | as a relative path | lib/memory.js:1084 | SCN-018 | proposed | copy |
| memory.uv-install-failed | uv tool install obsidian-wiki==${PIN}: ${lastLine(r)} | lib/memory.js:689 | SCN-018 | proposed | copy |
| memory.git-init-failed | git init -b main ${vault}: ${(g.err \|\| g.out \|\| `exit ${g.code}`).trim().split('\n')[0]} | lib/memory.js:781 | SCN-018 | proposed | copy |
| memory.wiki-setup-failed | obsidian-wiki setup --no-hooks --vault ${vault}: ${lastLine(s)} | lib/memory.js:787 | SCN-018 | proposed | copy |
| memory.hooks-install-failed | obsidian-wiki hooks install --only SessionStart: ${lastLine(h)} | lib/memory.js:850 | SCN-018 | proposed | copy |
| memory.uv-failed | uv ${args.join(' ')}: ${lastLine(r)} | lib/memory.js:909 | SCN-018 | proposed | copy |
| memory.receipt-open-string | a string that does not end on its line | lib/memory.js:941 | SCN-018 | proposed | copy |
| memory.receipt-escaped | an escaped character | lib/memory.js:942 | SCN-018 | proposed | copy |
| memory.receipt-comment | a comment | lib/memory.js:945 | SCN-018 | proposed | copy |
| memory.receipt-no-end | no end | lib/memory.js:949 | SCN-018 | proposed | copy |
| memory.own-installed | ${ownNote(own)}; nothing was installed | lib/memory.js:680 | SCN-018 | proposed | copy |
| memory.broken-installed | ${BROKEN}; nothing was installed | lib/memory.js:678 | SCN-018 | proposed | copy |
| memory.form-installed | ${configFormNote(spaced)}; nothing was installed | lib/memory.js:684 | SCN-018 | proposed | copy |
| memory.xdg-no-vault | ${xdg}; no vault was made | lib/memory.js:716 | SCN-018 | proposed | copy |
| memory.clash-no-vault | ${clashNote(late)}; no vault was made | lib/memory.js:785 | SCN-018 | proposed | copy |
| memory.shadow-unchanged | ${shadowNote(home, shadow)}; nothing was changed | lib/memory.js:823 | SCN-018 | proposed | copy |
| memory.form-unchanged | ${configFormNote(form)}; nothing was changed | lib/memory.js:826 | SCN-018 | proposed | copy |
| memory.form-not-recorded | ${configFormNote(spaced)}; its version was not recorded | lib/memory.js:873 | SCN-018 | proposed | copy |
| memory.xdg-unchanged | ${xdg}; nothing was changed | lib/memory.js:821 | SCN-018 | proposed | copy |
| memory.xdg-unchanged-upgrade | ${xdg}; nothing was changed | lib/memory.js:891 | SCN-018 | proposed | copy |
| memory.form-not-upgraded | ${configFormNote(spaced)}; nothing was upgraded | lib/memory.js:900 | SCN-018 | proposed | copy |
| setup.memory-open-route.mac | choose Open folder as vault, press Cmd+Shift+G and paste ${v} | lib/setup.js:508 | SCN-018 | proposed | copy |
| setup.memory-open-route | choose Open folder as vault and type or paste ${v} | lib/setup.js:508 | SCN-018 | proposed | copy |
| setup.obsidian-guide-vault | Obsidian: open the wiki vault ${v} in it once to read what your agents remember (${route(v)}); your agents write it without the app. | lib/setup.js:524 | SCN-018 | proposed | copy |
| memory.config-form-relative-note | ${config} writes ${key} as a relative path, which obsidian-wiki would read against whatever folder it runs in; remove that line, or write it as ${PKG_PATH}, then run setup again | lib/memory.js:1163 | SCN-018 | proposed | copy |
| memory.config-form-utf8-note | ${config} is not saved as UTF-8, which obsidian-wiki cannot read; save it as UTF-8, then run setup again | lib/memory.js:1166 | SCN-018 | proposed | copy |
| memory.config-form.utf8 | not saved as UTF-8 | lib/memory.js:1075 | SCN-018 | proposed | copy |
| memory.form-step.relative | remove the ${form.key} line memory.vault.config-form names, or write it as ${PKG_PATH} | lib/memory.js:1172 | SCN-018 | proposed | copy |
| doctor.memory-config-form-relative-fix | remove the ${form.key} line from ${form.config}, or write it as ${PKG_PATH}, then ${NPX} setup | lib/memory.js:1226 | SCN-018 | proposed | copy |
| doctor.memory-config-form-utf8-fix | save ${form.config} as UTF-8, then ${NPX} setup | lib/memory.js:1228 | SCN-018 | proposed | copy |
| memory.vault-problem.quote | has a double quote, a line break or a control character in its path | lib/memory.js:178 | SCN-018 | proposed | copy |
| memory.join-hints | ${parts.join('; ')}${shared ? `; ${READ_DOCTOR}` : ''} | lib/memory.js:224 | SCN-018 | proposed | layout |
| memory.clash-note-end | ${parts.join('; ')}, then run setup again | lib/memory.js:337 | SCN-018 | proposed | copy |
| memory.undo-link-failed | removing ${p} failed (${error.code \|\| error.message}): remove it, then run setup again | lib/memory.js:764 | SCN-018 | proposed | copy |
| memory.hook-already-late | obsidian-wiki's SessionStart recap is registered already in ${linked \|\| file} | lib/memory.js:856 | SCN-018 | proposed | copy |
| memory.vault-note | ${dir} ${problem}; ${problem === CHARS_PROBLEM \|\| problem === APOS_PROBLEM ? 'choose another folder' : 'choose an empty or new folder'} with --wiki-vault <dir> | lib/memory.js:196 | SCN-018 | proposed | copy |
| memory.config-form.quote | with a double quote, a line break or a control character in its value | lib/memory.js:1083 | SCN-018 | proposed | copy |
| memory.pkg-path | an absolute path to obsidian-wiki's package folder (.../obsidian_wiki/_data) | lib/memory.js:1145 | SCN-018 | proposed | copy |
| memory.move-vault | move the vault to a folder whose path has no double quote, line break or control character, then write OBSIDIAN_VAULT_PATH="<new path>" once | lib/memory.js:1146 | SCN-018 | proposed | copy |
| memory.config-form-quote-vault-note | ${config} writes ${key} with a double quote, a line break or a control character in its value, which obsidian-wiki's config cannot hold; ${MOVE_VAULT}, and run setup again | lib/memory.js:1164 | SCN-018 | proposed | copy |
| memory.form-step.move | move the vault as memory.vault.config-form names | lib/memory.js:1173 | SCN-018 | proposed | copy |
| doctor.memory-config-form-quote-fix | ${MOVE_VAULT} in ${form.config}, then ${NPX} setup | lib/memory.js:1227 | SCN-018 | proposed | copy |
| memory.kept-apart | the version and package path obsidian-wiki's refresh records, and, with the same meaning, quotes around a bare value or an empty vault line where there was none | lib/memory.js:31 | SCN-018 | proposed | copy |
| memory.vault-abs | OBSIDIAN_VAULT_PATH="<absolute path>" | lib/memory.js:1147 | SCN-018 | proposed | copy |
| memory.config-form-remove-note | ${config} writes ${key} ${form}, which obsidian-wiki's version refresh would rewrite; remove that line, then run setup again | lib/memory.js:1165 | SCN-018 | proposed | copy |
| memory.config-form.outside | outside obsidian-wiki's package | lib/memory.js:1085 | SCN-018 | proposed | copy |
| memory.apos-problem | starts or ends with an apostrophe, which obsidian-wiki's recap strips | lib/memory.js:180 | SCN-018 | proposed | copy |
| memory.config-form.apostrophe | with an apostrophe at the start or end of its value | lib/memory.js:1086 | SCN-018 | proposed | copy |
| memory.move-apos | move the vault to a folder whose path neither starts nor ends with an apostrophe, then write OBSIDIAN_VAULT_PATH="<new path>" once | lib/memory.js:1148 | SCN-018 | proposed | copy |
| memory.config-form-apostrophe-note | ${config} writes ${key} with an apostrophe at the start or end of its value, which obsidian-wiki's recap strips, so it would read another folder; ${MOVE_APOS}, and run setup again | lib/memory.js:1162 | SCN-018 | proposed | copy |
| doctor.memory-config-form-apostrophe-fix | ${MOVE_APOS} in ${form.config}, then ${NPX} setup | lib/memory.js:1225 | SCN-018 | proposed | copy |
| memory.legacy-why | obsidian-wiki's SessionStart recap reads ${legacy} while its commands read ${configDir(home)}, so it would recap another vault | lib/memory.js:400 | SCN-018 | proposed | copy |
| memory.why-xdg-step | set XDG_CONFIG_HOME to an absolute folder, or unset it | lib/memory.js:411 | SCN-018 | proposed | copy |
| memory.why-unread | obsidian-wiki's config ${config} cannot be read (${error.code \|\| error.message}) | lib/memory.js:414 | SCN-018 | proposed | copy |
| memory.why-folder | obsidian-wiki's config ${config} is a folder, not a file | lib/memory.js:417 | SCN-018 | proposed | copy |
| memory.why-empty | obsidian-wiki's config ${config} names no vault (its OBSIDIAN_VAULT_PATH line is empty or missing) | lib/memory.js:429 | SCN-018 | proposed | copy |
| doctor.memory-vault-why-fix | ${why.step}, then ${NPX} setup --with wiki | lib/memory.js:461 | SCN-018 | proposed | copy |
| doctor.memory-legacy-fix | ${l.step}, then ${NPX} setup | lib/memory.js:470 | SCN-018 | proposed | copy |
| doctor.memory-hooks-legacy-fix | ${l.step}, then ${NPX} setup | lib/memory.js:591 | SCN-018 | proposed | copy |
| memory.vault-abs-step-home | write the vault's absolute path (${value} with its home spelled out) once as ${VAULT_ABS} | lib/memory.js:1157 | SCN-018 | proposed | copy |
| memory.vault-abs-step | write the vault's absolute path (the folder \`obsidian-wiki setup\` ran in, joined with ${value}) once as ${VAULT_ABS} | lib/memory.js:1158 | SCN-018 | proposed | copy |
| memory.config-form-vault-relative-note | ${config} writes ${key} as a relative path (${value}), which obsidian-wiki's recap would read against each session's folder; ${vaultAbsStep(value)}, then run setup again | lib/memory.js:1161 | SCN-018 | proposed | copy |
| doctor.memory-config-form-vault-relative-fix | ${vaultAbsStep(form.value)} in ${form.config}, then ${NPX} setup | lib/memory.js:1224 | SCN-018 | proposed | copy |
| setup.obsidian-config-unnamed | Obsidian: open your wiki vault in it once to read what your agents remember (choose Open folder as vault); setup names none here: ${w.why}; the wiki memory step above clears it, then open the vault. | lib/setup.js:526 | SCN-018 | proposed | copy |
| memory.xdg-tilde | XDG_CONFIG_HOME starts with ~ (${v}), which obsidian-wiki's SessionStart recap reads as a relative folder while its commands read your home; set it to an absolute folder, or unset it, then run setup again | lib/memory.js:66 | SCN-018 | proposed | copy |
| memory.legacy-step | move what ${legacy} holds into ${configDir(home)} and remove ${legacy} | lib/memory.js:400 | SCN-018 | proposed | copy |
| memory.why-folder-step | remove the folder ${config} (setup then writes its own config), or replace that folder with obsidian-wiki's config file | lib/memory.js:417 | SCN-018 | proposed | copy |
| memory.why-empty-replace | replace the empty OBSIDIAN_VAULT_PATH line in ${config} with ${VAULT_ABS} | lib/memory.js:430 | SCN-018 | proposed | copy |
| memory.why-empty-missing | write ${VAULT_ABS} once in ${config} | lib/memory.js:430 | SCN-018 | proposed | copy |
| doctor.memory-hooks-recaps-nothing | obsidian-wiki's SessionStart hook is registered, but it recaps nothing while memory.vault names why | lib/memory.js:620 | SCN-018 | proposed | copy |
| memory.shadow-note | ${l.why}; ${l.step}, then run setup again | lib/memory.js:1192 | SCN-018 | proposed | copy |

Humanization: on (own pass); diagnostic labels retained after review, no further
wording changes. Version values and timestamps remain verbatim observations.
