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

Every event carries the launcher version, the OS name and version and the locale (as Aptabase's SDKs do), `install_id`
and `iid` (the id in the shared `PassionCode/installation.json` that every PassionCode app on the machine uses, created
once if absent and never rewritten) and `environment` (`production`, or `sandbox` for a development version).

| Event | Status | Sent from | When | Properties | Added |
| --- | --- | --- | --- | --- | --- |
| `app_installed` | live | lib/analytics.js:100 | the first command on this machine that sends anything | none | 2026-11-04 |
| `app_updated` | live | lib/analytics.js:101 | the first command after the launcher's version changed | `from`: the previous version | 2026-11-04 |
| `app_active` | live | lib/analytics.js:104 | the first command of a UTC day | none | 2026-11-04 |
| `command_run` | live | lib/analytics.js:107 | every command, when it ends | `command`: `setup`, `doctor`, `update`, `status`, `restore`, `config`, `uninstall`, `permissions`, `analytics` or `help` (any other word is sent as `help`); `outcome`: `ok`, `failed` or `usage` (exit 0, 1, 2); `duration`: `under-1s`, `1-10s`, `10-60s` or `over-60s`; `json`: true or false | 2026-11-04 |
| `app_error` | live | lib/analytics.js:108 | a command that ends with exit 1 | `where`: the command, as above; `code`: `other` (fixed codes per failure come later, each added here first) | 2026-11-04 |

Never sent: a path, a file or folder name, a user name, a rule, an argument, an app id the person typed, a token, an
error message or the content of any file. Properties are the fixed words above and nothing else.

## The notice and the switch

The first command that would send something prints, once per machine, on stderr:

> PassionCode sends anonymous usage and error counts to improve it. Turn them off: npx @passioncode-ai/passioncode@latest analytics off

A `--json` run never prints it and sends nothing until a run in a terminal has. The background update the SessionStart
hook starts sends nothing.

`npx @passioncode-ai/passioncode@latest analytics off` turns the counts off for the launcher alone (`on` turns them back
on, `status` says whether they are sent and why not); the choice is saved in `~/.passioncode/analytics.json` (under
`PASSIONCODE_HOME` when it is set), absent meaning on. `PASSIONCODE_ANALYTICS=off` or `DO_NOT_TRACK=1` turns them off for
one process. Off sends nothing and stores nothing new. The shared `installation.json` field `analytics` belongs to the
apps and is not read: one product's switch never turns another off.
