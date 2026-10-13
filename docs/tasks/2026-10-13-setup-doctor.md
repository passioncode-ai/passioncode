# Brief — one-command setup and a doctor (2026-10-13)

Track: fabric-workspace roadmap **RM-09** (interactive onboarding that installs the ecosystem), with
RM-07/RM-08 (one journey) and RM-15 (the site's `/start/`). It is the "family setup entry" of
[agents-first](https://github.com/passioncode-ai/fabric-workspace/blob/main/knowledge/agents-first.md#each-products-part),
filed as [fabric-agent-adapter#49](https://github.com/passioncode-ai/fabric-agent-adapter/issues/49).

## The ask (operator, 2026-10-13)

Onboarding today is a manual explanation: go to the site, install this, start the apps, open Claude
Code, configure it. Make it one command, or a prompt pasted into a coding agent that does it all;
and a **doctor** that checks the setup — run by hand, from a button, or by the agent itself — fixes
what it safely can and verifies the rest.

## Source ledger (harvested before deciding)

| Source | What it gave |
|---|---|
| `lib/launcher.js`, ADR-0001…0003, `docs/reference/cli.md`, `docs/ux/scenarios.md` | update/status/restore/uninstall; MCP registration rules for one server (ADR-0003) |
| fabric-workspace `knowledge/agents-first.md`, roadmap RM-07/08/09/15 | the family setup entry runs each product's own `onboard`; human gates stay human |
| passioncode-ai/.github `release-signing/README.md` | every release: `SHA256SUMS` + `SHA256SUMS.asc` (key `63B3 0DC3 24BD 6974 87AA 3194 4FAF B8AE C803 B6A7`) + Sigstore attestations |
| Product releases (measured 2026-10-13 with `gh release view`) | asset names per OS; receipts name `Developer ID Application … (KJ35UYYL22)`, notarized and stapled |
| Products' docs: Switchboard `docs/AGENT-ONBOARDING.md`, Inbox `docs/agents/onboard.md` (B-79), Dashboards `src/core/setup.ts` (FD-39), Observatory `full onboard`, Fabric `fabricMcpMain.ts` | MCP command, registration and proving call of each |
| Site `releases/current.json`, `worker/releases.js` | the site trusts GitHub's asset digest (and `SHA256SUMS` for Switchboard); it checks no signature |
| retro / verification ledger / code graph | none found in this repository |

## Decisions (grill, decided on the recommended answer — the operator delegated them)

| # | Question | Decision |
|---|---|---|
| D1 | Where does the one command live? | In the launcher: `npx @passioncode-ai/passioncode@latest setup` (alias `onboard`, the name in fabric-agent-adapter#49). No `curl \| sh`: Node 18 is the one prerequisite, and a shell pipe would be a second, unsigned trust path. |
| D2 | How is a download trusted? | Stricter than the site: `SHA256SUMS.asc` verified in the launcher against the bundled, fingerprint-pinned release key (no gpg needed); the asset's SHA-256 must equal both its `SHA256SUMS` line and GitHub's digest; on macOS the extracted app must pass `codesign --verify --strict`, carry Team ID `KJ35UYYL22`, pass `xcrun stapler validate` and `spctl --assess` (source Notarized Developer ID). Any failure installs nothing and removes the download. |
| D3 | Which apps does setup install? | Apps that are **absent**, on macOS, from their latest release. An installed app is never replaced: each updates itself through its own signed updater; doctor reports it outdated. Other OSes: skills and MCP only, apps named with their download page. |
| D4 | Fabric (early preview, needs Docker or OrbStack and the Supabase CLI)? | Offered, labelled early preview; with `--yes` it is installed only when Docker answers and the Supabase CLI is present, otherwise it becomes a listed human step. |
| D5 | Interactive or not? | Interactive in a terminal (one question per app). `--yes` accepts the plan; `--with`/`--without <ids>`, `--no-apps`, `--no-open`, `--dry-run`, `--json`. Without a terminal and without `--yes` it prints the plan and changes nothing. |
| D6 | Which MCP servers does the launcher register? | The stdio servers inside installed app bundles — `fabric-dashboards` (ADR-0003), `fabric` (`fabric-mcp --runner <agent>`), `switchboard` (`switchboard mcp`) — under ADR-0003's rules, for Claude Code, Codex CLI, Gemini CLI and Kimi Code. Observatory (its own virtualenv) and Inbox (a remote server per person, key in the keychain) register through their own `onboard`; setup lists that step. ADR-0004. |
| D7 | What is a proving call? | Doctor starts each registered stdio server exactly as the agent would, sends `initialize` and `tools/list`, then one read-only tool: `list_services` (Dashboards), `switchboard_accounts` (Switchboard), `observatory_status` (Observatory). Fabric gets `initialize` only: `fabric_whoami` enrols a session, so it is left to the agent. Inbox is HTTP with a keychain helper: its own `prove`. |
| D8 | What may `--fix` change? | Only what `update` already may: install/refresh the skill set and add missing MCP registrations. Never installs or replaces an app, never starts, stops or kills a process, never rewrites a person's entry. |
| D9 | Starting services? | Doctor reads; it never starts an app. A stopped on-demand app is information, with the documented way to open it; a machine with a lifecycle supervisor starts it through that. |
| D10 | Exit codes? | doctor: 0 nothing failed (warnings allowed), 1 at least one check failed, 2 bad arguments. setup: 0 done or plan-only, 1 a step failed, 2 bad arguments. |
| D11 | How does an agent "already know" doctor? | A new skill `setting-up-passioncode` in the self plugin (separate trigger from `working-in-passioncode`, which is for contributors), and the SessionStart hook prints one line when the last saved doctor result has failures (it never runs doctor itself). |
| D12 | The button? | Fabric Dashboards (FD) and Fabric (M) get a backlog row with the spec — "Check setup" runs `doctor --json` and shows the lines. Not built here: both checkouts have other sessions' release branches in flight. |
| D13 | Version | 0.2.0 — new commands. |

## REQ table (frozen; adding is free, removing needs the operator)

| REQ | Requirement | Verified by |
|---|---|---|
| REQ-1 | `setup` detects OS, agents and prerequisites and prints one plan | `test/setup.test.js` plan tests |
| REQ-2 | `setup` installs absent apps only from signed, verified releases; any failed check installs nothing | `test/setup.test.js` tamper/foreign-key/team-id tests; `test/openpgp.test.js` |
| REQ-3 | `setup` installs the skills and registers every installed product's stdio MCP server for every present agent, idempotently | `test/setup.test.js` registration + rerun tests |
| REQ-4 | `setup` prints one consolidated list of human steps; never asks for or stores a secret | `test/setup.test.js` human-steps test; code review |
| REQ-5 | `setup` is interactive by default; `--yes`, `--with/--without`, `--no-apps`, `--dry-run`, `--json` | CLI tests |
| REQ-6 | `doctor` checks versions vs latest, signatures, services, MCP registrations + proving calls, skills/shadows, prerequisites; each line names state and fix | `test/doctor.test.js` |
| REQ-7 | `doctor --fix` applies only the safe fixes and re-checks; exit codes as D10 | `test/doctor.test.js` |
| REQ-8 | doctor never starts, stops or kills a process | code review + test that no `open` is spawned by doctor |
| REQ-9 | Agent skill `setting-up-passioncode` + session-start line from the saved doctor result | `test/skill.test.js`, hook test |
| REQ-10 | Copy-prompt (one paragraph) in README and on the site | docs test + site check |
| REQ-11 | Site `/start/` leads with the command and copy-prompt, steps kept as fallback, 10 locales, checks green, deployed and verified live | site `npm run check`, `npm run build`, `extract-public-copy.py --check`, `verify-live.py` |
| REQ-12 | "Check setup" button: backlog rows in Fabric Dashboards and Fabric + roadmap note | the rows' links |
| REQ-13 | Released by tag (0.2.0), npm confirmed, local install updated, backlog closed with receipts | release run, `npm view`, `status` |
| REQ-14 | Docs in the same change: README, `docs/reference/cli.md`, `docs/ux/scenarios.md`, SECURITY.md, ADR-0004, CHANGELOG | `test/docs.test.js` |

## Carry-over ledger

| Item | Home |
|---|---|
| Replacing an outdated installed app from setup (now: its own updater) | backlog row after release |
| Windows/Linux app installs (signed `.exe`/AppImage with `.sig`) | backlog row after release |
| Sigstore attestation check (needs `gh`); the GPG + digest + codesign chain is the launcher's | recorded in ADR-0004 |
