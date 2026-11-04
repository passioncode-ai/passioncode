# Anonymous usage and error counts

The launcher sends anonymous usage and error counts to PassionCode's own analytics host, on by default for new and
existing machines, so the product can be improved (PC-123; the operator's decision of 2026-11-04 for every PassionCode
product). This page is the event catalogue: an event's name is a time series and is never renamed or reused; a removed
event stays listed as retired with its date. `test/analytics.test.js` fails when an event the code sends is missing here.

## What is sent

One batch when a command ends, to `https://analytics.passioncode.ai` (the organization's Aptabase, app "PassionCode"),
with a two-second ceiling; a failed send is dropped and never kept for a later run
([lib/analytics.js](../lib/analytics.js)). Only the published package carries the App Key: the publish job writes it
from the release secret, so a checkout, a test or a fork sends nothing.

Every event carries the time, a random id for the run (`sessionId`) and the fields Aptabase's SDKs send: the launcher
version, the OS name and its kernel release (for example `Darwin 25.6.0`, not the macOS version), the locale, the
Node.js version, an SDK tag and a debug flag (true for `sandbox`). And four properties: `iid`, the id in the shared `PassionCode/installation.json` that every PassionCode app on the machine uses
(created once if absent, never rewritten; growth counts installations by it); `install_id`, always equal to `iid` (the
key questions across PassionCode apps join on, which the apps send too; kept for the family's compatibility, never a
second id); `surface`, `cli` (a value of its own is
added if the SessionStart hook ever sends); and `environment`, `production` for a release version `x.y.z` and `sandbox`
for any other (`-rc.N`, `-beta.N`, a build tag).

| Event | Status | Sent from | When | Properties | Added |
| --- | --- | --- | --- | --- | --- |
| `app_installed` | live | lib/analytics.js:132 | the first command on this machine that tries to send (a send that fails is not repeated, so an offline first run never reports it) | `existing`: `"true"` when the launcher was installed here before the counts existed (its `~/.passioncode/state.json` was there when the first run of a counting version started, whatever its flags; that answer is kept in `analytics.json`; so a machine an agent sets up with `setup --json` counts as a new install), `"false"` for a new install (a string, as every property: growth filters only string properties) | 2026-11-04 |
| `app_updated` | live | lib/analytics.js:133 | the first command after the launcher's version changed (an update the SessionStart hook ran is counted at the next command, so it can arrive a session late) | `from`: the previous version | 2026-11-04 |
| `app_active` | live | lib/analytics.js:136 | the first command of a UTC day on this machine (counts daily active machines; two commands that end at the same moment on a new day may both send it) | none | 2026-11-04 |
| `command_run` | live | lib/analytics.js:139 | every command, when it ends | `command`: `setup`, `doctor`, `update`, `status`, `restore`, `config`, `uninstall`, `permissions`, `analytics` or `help` (any other word is sent as `other`, never as typed; a new command gets a new value here in the same change, a removed one is marked retired and its value is never reused); `outcome`: `ok` (exit 0), `failed` (exit 1: a check or a step failed) or `usage` (exit 2: the words given were not a command the launcher takes); `duration`: `under-1s`, `1-10s`, `10-60s` or `over-60s` (the bounds are part of the series: other bounds would be a new property, never new meanings of these); `json`: `"true"` or `"false"` (strings) | 2026-11-04 |
| `app_error` | live | lib/analytics.js:140 | a command that ends with exit 1 | `where`: the command, as above; `code`: `other` (fixed codes per failure come later, each added here first) | 2026-11-04 |

Never sent: a path, a file or folder name, a user name, a rule, an argument, an app id the person typed, a token, an
error message or the content of any file. Properties are the fixed words above and nothing else.

## The notice and the switch

The first command that would send something prints, once per machine, on stderr:

> The PassionCode launcher sends anonymous usage and error counts to improve it. Turn them off for the launcher: npx @passioncode-ai/passioncode@latest analytics off (each PassionCode app has its own switch).

It is printed by the first run without `--json` or `--quiet`, whether a person or an agent runs it. The setup skill and the README's copy-prompt ask an agent to pass the line to the person word for word (the skill has it run `analytics status` once without `--json`, since its own commands all carry `--json`); another tool that runs the launcher without `--json` may show the notice to its agent only; until some run has shown the notice, nothing is sent and `analytics status` says so (reason `notice`). A `--json` or `--quiet` run never prints it and sends nothing until such a run has. After that, `--json` runs count too, so Fabric's setup check (it runs `doctor@latest --json`) counts toward `app_active`. The background update the SessionStart
hook starts sends nothing (from the 0.2.76 plugin on: an older installed hook's one last background update, the one that installs the new hook, is counted if the notice was already shown).

`npx @passioncode-ai/passioncode@latest analytics off` turns the counts off for the launcher alone (`on` turns them back
on, `status` says whether they are sent and why not); the choice is saved in `~/.passioncode/analytics.json` (under
`PASSIONCODE_HOME` when it is set), absent meaning on. `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` turns them off for
one process. Off sends nothing and stores nothing new. The shared `installation.json` field `analytics` belongs to the
apps; the launcher reads it once. At its first run of a counting version, a shared `analytics: false` (a "no" the
person already gave in a PassionCode app, such as Fabric's switch) is kept as the launcher's own off: nothing is sent,
`analytics status` says why, and `analytics on` turns the counts on for the launcher alone. After that one look the
launcher never reads the field again: one product's switch never turns another off later, so a "no" given in an app
after that does not reach the launcher; its own switch is `analytics off`. The person's own `analytics on` or `off` is
final: a shared "no" is not read over it.

Reading the launcher's own series: existing machines are counted from their first run without `--json` or `--quiet`
after 0.2.76 (or the setup skill's `analytics status`), so the early `existing` installs and daily active machines are a
floor that rises as machines run setup again, not adoption.

The host sees the connection's IP address and uses it for a country, a daily visitor hash and rate limits without storing
it; events are kept two years and the installation id is removed from them after 400 days.

## Breaks in other products' series

- From launcher 0.2.76 (released 2026-11-04 or later; the date is set when the tag is published), the launcher creates the
  shared `installation.json` at its first counted run, often before any PassionCode app starts. On machines set up with
  the launcher, the apps' `app_installed` then carries `first_passioncode_app` false more often. The drop is a change in
  measurement, not in what people do: read it as a break in the series.
