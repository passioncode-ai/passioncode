---
name: working-in-passioncode
description: >-
  Use when working in any passioncode-ai repository — "work on a PassionCode repo", "open a PR
  in passioncode-ai", "release", "tag a version", "which repo owns this", "bump the contract
  pin", "publish this to the public repo", "what license do we use", «работаю в репозитории
  PassionCode», «как тут принято», «где записать решение», «как выпустить релиз». Covers the org
  map, landing (protected and unprotected main, fast-forward, never force-push shared work,
  never touch another session's work), nightly CI and why a blocked run is not green,
  handoffs, decisions, ids and leases, secrets, licensing (AGPL-3.0 or commercial, CLA), the
  repository standard, the privacy gate, and releases, versions and pins; the knowledge base
  stays the source of truth. NOT for product UX, visual design or copy (super-ux,
  sheleg-design, copywriting), building Fabric agents or services (the fabric-agent-adapter
  skills), or repositories outside passioncode-ai.
license: AGPL-3.0-only OR LicenseRef-PassionCode-Commercial
compatibility: Any agent that can read files and run git. The gh CLI and a clone of passioncode-ai/org-index make the checks exact; without them follow the fallbacks in the body.
metadata:
  author: PassionCode.ai
---

# Working in PassionCode repositories

What belongs to no single repository — the vision, the principles, how to work, the rules, the
repository standard, the products and the licence — lives in one place: the organization's
**knowledge base**, `fabric-workspace/knowledge/` in a clone (org-index
`scripts/clone_all.sh` makes it), published at https://wiki.passioncode.ai/knowledge (sign-in
required; Fabric ADR-0093). [org-index](https://github.com/passioncode-ai/org-index) (private;
every member can read it) keeps the map (`repositories.json`), `ONBOARDING.md` and the checks
(`check_index.py`, `check_names.py`, `check_format.py`). This skill is the checklist that makes
those rules reach you while you work. It summarises; it does not replace. Where it and the
knowledge base disagree, **the knowledge base wins**; where a repository's own `AGENTS.md` is
stricter, **that file wins**.

## 0. The protocol — before and after every piece of work

**Before the first edit**, read the knowledge base (at least its `README.md`, `vision.md`,
`principles.md` and `how-to-work.md`), then the repository's `AGENTS.md`. The session-start hook
of this plugin prints that line in every passioncode-ai repository.

**After the work**, in the same run: update the repository's own docs in the change that changes
the behaviour; if a fact that crosses repositories changed — a product, a version, a plan row, a
principle, a rule — update the knowledge base page that owns it (`products.md`, `plans.md`, …);
land both; then publish (`node scripts/workspace.mjs sync` from a Fabric checkout) or leave it to
the scheduled sync. A page there is read as true: every claim carries its receipt.

## 1. Before the first edit

1. Read the knowledge base, then the repository's `AGENTS.md` (its `CLAUDE.md` imports
   it). `AGENTS.md` names the role, the test command and any local rule.
2. Find who owns what you are about to change: the table in org-index `README.md`,
   generated from `repositories.json`. Do not guess an owner from a directory name.
3. `git fetch origin`, then work in a worktree from `origin/main` on your own branch
   (`<who>/<topic>`, e.g. `agent/engine-update`):
   `git worktree add ../<repo>-<topic> -b <who>/<topic> origin/main`.
   Checkouts are shared by several sessions; never switch, reset, stash or check out
   over one.
4. An unmerged branch or a dirty tree you did not create is someone's work in
   progress. Leave it; ask before touching it.

No clone: `gh repo clone passioncode-ai/org-index`, then its `scripts/clone_all.sh` for the
knowledge base. No access at all: say so, follow the repository's `AGENTS.md`, and name that you
worked from it alone.

Also, before the first edit:

- **Read the organization's [CONTRIBUTING.md](https://github.com/passioncode-ai/.github/blob/main/CONTRIBUTING.md)**
  — the repository's `AGENTS.md` sends you there in its *Read first* block.
- **Names** (Fabric ADR-0090): PassionCode.ai is the organization; **Fabric** is the product,
  the CEO AI agent; Fabric's tools carry its full name before any short form (Fabric Inbox,
  Fabric Dashboards, Fabric Switchboard); the Fabric Agent Contract and Adapter make any agent
  Fabric-compatible; Project Observatory keeps its own name. Never "PassionCode app".
- **Code region markers**: fence a feature, module or special condition with
  `#region <slug> — docs: <path>#<anchor>` … `#endregion <slug>` in the file's comment syntax;
  the reference must resolve. Repositories that ship `check-regions` fail a broken one.

## 2. Landing on main

| `main` is | Land by |
|---|---|
| protected (today only `project-observatory-dashboard`) | a PR; the required checks green (three OS/Python combinations); linear history |
| unprotected (every other repository) | a PR, or a fast-forward push after the repository's local gate passes |

- Private repositories are on GitHub's free plan, which cannot protect a branch. The
  rules hold there **on your word**.
- A fast-forward means `git push origin HEAD:main` succeeds without `--force`. If
  `main` moved, rebase your own branch, re-run the gate, then push.
- Never force-push `main`, and never force-push a branch someone else has built on.
- Never put a merge commit on top of someone else's unpushed work.
- Release tags `vX.Y.Z` and contract tags `rev-N` never move. A mistake gets a new
  version.
- Commit subjects: imperative, at most 72 characters. An agent's commit ends with a
  `Co-Authored-By:` trailer naming the model.

## 3. Tests and CI

- **The local gate is the gate.** Run the repository's test command (its `AGENTS.md`,
  and the `test` field in `repositories.json`) before you push, and report each
  command with its exit code.
- Hosted CI runs **nightly at 23:00 Europe/Warsaw** on the default branch, not on every
  push. Dispatch a hosted run by hand only for an urgent candidate; never restore
  per-push triggers.
- **No CI result is not a green result.** Actions for the organisation's private
  repositories are held by the spending cap: a job that "failed in 3 s" never started.
  Read the annotation (`gh api repos/<owner>/<repo>/check-runs/<job-id>/annotations`)
  and report the run as blocked, never as passing.

## 4. Handoffs, decisions, ids and leases

- **Every task leaves a tracked handoff** in the owning repository:
  `docs/handoffs/<date>-<topic>.md` or `docs/runs/<date>-<topic>/README.md`. It states
  the objective, what was done, what is open, the decisions taken, the checks actually
  run (command and exit code) and **the exact next task**. Work across repositories
  keeps one index in org-index `docs/runs/`, naming each repository, branch and commit.
- **Decisions.** Cross-repository ones go in `fabric/docs/adr/`; a repository's own in
  its `docs/adr/` or `docs/DECISIONS.md`. Records are append-only; a reversal is a new
  record.
- **Ids.** In a repository with `.claude/agent-sync.json`, reserve an id before writing
  it: `agent_sync.py reserve <REGISTER>` (for example `ADR` in fabric). Reading the
  "next free id" line is not reserving it — two agents read the same number.
- **Leases.** Every enrolled repository guards its declared shared files (its
  `docs/AGENT_SYNC.md` lists them) under a git lease, a ref under
  `refs/agent-sync/leases/` on `origin`, so both machines see it. `acquire` → edit →
  `release`, on every path, failure included.
- **Receipts.** A claim that will be read as true carries `file:line`, a command and
  its output, or a test name. Documentation changes in the same change as the
  behaviour it describes.

agent-sync missing: `npx @ssheleg/agent-sync install`. If it cannot be installed, do
not edit a guarded file — say which file and why you stopped.

### The common backlog

The workspace's `knowledge/backlog.md` owns the aggregation contract. Each repository's
`docs/backlog-sources.json` declares the canonical local task sources and their vision goals.
Read those sources before choosing work. Update status only in the owning source under a lease,
keep stable IDs and closure receipts, and add a new source to the manifest in the same change.
A cross-repository task has one owner; other repositories link to it instead of copying status.
The common view at https://wiki.passioncode.ai/backlog is generated from these sources and their
commit identities. Never edit generated task status. Land the local change, publish through
Fabric's workspace sync, and check the published source commit before calling it current.

## 5. Secrets

- Never in Git, a chat message, an issue, a command argument, a URL query string or a
  log. `.env*` files are gitignored everywhere.
- Each machine keeps its own credentials; nothing is copied from one person's machine
  to another's. The operator issues a scoped credential when one is shared.
- A leaked value is rotated **and** the leak is recorded; deleting the message is not
  enough. With the Observatory plugin installed, its `handling-secrets` skill does this
  by slot name without printing the value.

## 6. Licensing and the repository standard

- **Every repository** is open source under the GNU AGPL-3.0, or available under a commercial
  license from PassionCode.ai (contact@passioncode.ai):
  `AGPL-3.0-only OR LicenseRef-PassionCode-Commercial` (Fabric ADR-0092; the knowledge base
  `licensing.md` owns it). Copyright: Siarhei Sheleh. No price or term is stated anywhere.
- `LICENSE`, `COMMERCIAL-LICENSE.md` and `CLA.md` are copied **byte for byte** from the knowledge
  base's `templates/`; every manifest and SKILL.md `license:` carries the expression.
- A version released earlier keeps its licence — MIT or PolyForm Noncommercial or Internal Use —
  and the README may say which. Never write that a released version changed.
- The README's `## License` section uses the knowledge base wording and names the earlier
  licences: "Open source under the GNU AGPL-3.0. A commercial license is available for use that
  does not meet the AGPL's terms — contact@passioncode.ai."
- Contributions are accepted under the repository's `CLA.md`; opening a pull request is the
  agreement, so a PR template never carries a CLA checkbox.
- **The repository standard** (the knowledge base `repository-standard.md`): README first heading
  `# <Full name>`, `## Quick start for a new teammate` (Install, Configure, MCP — the registration
  command and one proving call verified with a real client in a temporary config — and Develop)
  and `## License`; `AGENTS.md` opens with the template's *Read first* block and ends with
  *After work*; `CLAUDE.md` starts with `@AGENTS.md`; `SECURITY.md` in public repositories.
  org-index `python3 scripts/check_format.py` checks it (offline: siblings `org-index`,
  `fabric-workspace` and the repository, then `--offline --repo <repo>`); it reports 0 before
  you call a repository done.
- The operator's own agents are outside the organization and this licence: their licence is the
  operator's choice, and nothing about them is published.

Read [publishing](references/publishing.md) when adding or changing a license, a
manifest's `license` field, `CLA.md` or a PR template.

## 7. Before anything goes public

A public repository, the site, the organisation profile, an npm tarball or a release
note is public. Before it ships:

- Run the repository's privacy gate. The engine's is
  `python3 tools/check_public_release.py`; a name published on purpose goes in
  `tools/public-identifiers.json` **with a reason** — a review decision, never a way to
  silence a finding.
- **The operator's personal agents never appear** on PassionCode.ai surfaces, examples,
  evals, docs or families. Use neutral names such as `example-agent`. The launcher's
  members are PassionCode.ai products only.
- No absolute home paths (`/Users/<name>/…`, the operator's own project root) in code,
  tests or public documents. Those in existing documents are the operator's layout,
  not requirements.
- Product metadata names **PassionCode.ai** (`https://passioncode.ai/`) as author, not a
  person. Security reports go to contact@passioncode.ai (and GitHub private
  vulnerability reporting where a public repository offers it).

Read [publishing](references/publishing.md) before a first public release or a change
to a public surface.

## 8. Releases, versions and pins

- One version, everywhere: every manifest, the plugin and the top `CHANGELOG.md` entry
  move together. Each repository's validator or test holds them in sync.
- A pushed `v*` tag can **publish to npm**: the launcher's and the adapter's
  `release.yml` publish when the repository variables `RELEASE_ENABLED` and
  `PUBLISH_NPMJS` are `true`. Check `gh variable list -R passioncode-ai/<repo>` before
  pushing a tag; publishing is a release decision, not a side effect.
- **Signing (knowledge rules §11).** A published build is signed only in CI, in the
  repository's protected `release` environment, through `passioncode-ai/.github@v1`
  (`apple-signing`, `notarize`, `sign-sums`, `release-publish`). A member of
  `release-approvers` who is not the tag's author approves it. No release key lives on a
  laptop, and a locally signed build is a debug build: never attach it. You act as the person
  whose account you use, so never approve a release you started; start it and say whose
  approval is pending. A published release is never rewritten. Rehearse on `vX.Y.Z-rc.N` with
  `publish=false`.
- **Engine** (`project-observatory-dashboard`): contributors send PRs. A `vX.Y.Z` tag on the
  reviewed release commit runs its `release.yml`, which signs and publishes in CI. Machines then
  run `project-observatory full update --check` and `--apply`.
- **Launcher** (`passioncode`): members are tagged first, `family.json` refs point at
  those tags, the payload is vendored from tags only.
- **Contract pins.** `fabric-agent-contract` consumers carry explicit commit pins;
  compatibility work is tracked in the owning consumer backlog and the derived workspace view. Move a pin only in a release of the
  consumer, and only when its own validation passes against the new commit.

Read [releasing](references/releasing.md) for the step-by-step of each repository's
release.

## 9. Which skill does what here

The table in org-index `README.md` → "What an agent uses for each infrastructure
project" is the map: the Observatory plugin `observatory-log` (`explaining-changes`,
`handling-secrets`, `tracking-resources`), the `fabric-agent-adapter` plugin
(`creating-fabric-agents`, `adapting-projects-to-fabric`, `building-fabric-services`),
`agent-sync` for leases, and `maintaining-fabric-workspace` inside a fabric checkout.
What the product does for its users, how it looks and how it reads are not this
skill's: `super-ux`, `sheleg-design` and `copywriting`.

## Gotchas

- A private repository's hosted job "failed" in seconds: that is the spending cap, not
  a test failure — and not a pass either.
- With the release variables on, re-running an old release workflow once Actions is
  back **publishes that old tag to npm**. Decide before re-running.
- On macOS the system `python3` is 3.9, too old for the Observatory. Use a current
  Python (`ONBOARDING.md` §2).
- `gh auth status` can report an invalid token while `git` over SSH works. Attempt the
  operation before calling it blocked.
- A sentence that says "on this Mac" or names `~/…` in someone's document describes
  the operator's machine. Do not copy it into yours.

## Completion format

Report: the repository and branch; the landed commit or the PR URL; each gate command
with its exit code; the hosted CI state (ran, blocked, or nightly pending); the handoff
path; the knowledge base page you updated, or that no cross-repository fact changed; and the
one next task.
