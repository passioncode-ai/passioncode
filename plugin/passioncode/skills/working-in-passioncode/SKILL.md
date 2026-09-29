---
name: working-in-passioncode
description: >-
  Use when working in any passioncode-ai repository — "work on a PassionCode repo", "open a PR
  in passioncode-ai", "release", "tag a version", "which repo owns this", "bump the contract
  pin", "publish this to the public repo", "what license do we use", «работаю в репозитории
  PassionCode», «как тут принято», «где записать решение», «как выпустить релиз». Covers the org
  map, landing (protected and unprotected main, fast-forward, never force-push shared work,
  never touch another session's work), nightly CI and why a blocked run is not green,
  handoffs, decisions, ids and leases, secrets, licensing (source-available, CLA, MIT
  schemas), the privacy gate before anything goes public, and releases, versions and pins;
  org-index stays the source of truth. NOT for product UX, visual design or copy (super-ux,
  sheleg-design, copywriting), building Fabric agents or services (the fabric-agent-adapter
  skills), or repositories outside passioncode-ai.
license: PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0
compatibility: Any agent that can read files and run git. The gh CLI and a clone of passioncode-ai/org-index make the checks exact; without them follow the fallbacks in the body.
metadata:
  author: PassionCode.ai
---

# Working in PassionCode repositories

The rules of the `passioncode-ai` organisation live in one place:
[org-index](https://github.com/passioncode-ai/org-index) (private; every member can
read it) — `README.md` for the map, `RULES.md` for the rules, `ONBOARDING.md` for a new
machine. This skill is the checklist that makes those rules reach you while you work.
It summarises; it does not replace. Where it and org-index disagree, **org-index wins**;
where a repository's own `AGENTS.md` is stricter, **that file wins**.

## 1. Before the first edit

1. Read the repository's `AGENTS.md` (its `CLAUDE.md` imports it). It names the role,
   the test command and any local rule.
2. Find who owns what you are about to change: the table in org-index `README.md`,
   generated from `repositories.json`. Do not guess an owner from a directory name.
3. `git fetch origin`, then work in a worktree from `origin/main` on your own branch
   (`<who>/<topic>`, e.g. `agent/engine-update`):
   `git worktree add ../<repo>-<topic> -b <who>/<topic> origin/main`.
   Checkouts are shared by several sessions; never switch, reset, stash or check out
   over one.
4. An unmerged branch or a dirty tree you did not create is someone's work in
   progress. Leave it; ask before touching it.

No org-index clone: `gh repo clone passioncode-ai/org-index`. No access at all: say so,
follow the repository's `AGENTS.md`, and name that you worked from it alone.

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
- **Leases.** `fabric` and `fabric-agent-contract` guard shared files (their
  `docs/AGENT_SYNC.md` lists them) under a git lease, a ref under
  `refs/agent-sync/leases/` on `origin`, so both machines see it. `acquire` → edit →
  `release`, on every path, failure included.
- **Receipts.** A claim that will be read as true carries `file:line`, a command and
  its output, or a test name. Documentation changes in the same change as the
  behaviour it describes.

agent-sync missing: `npx @ssheleg/agent-sync install`. If it cannot be installed, do
not edit a guarded file — say which file and why you stopped.

## 5. Secrets

- Never in Git, a chat message, an issue, a command argument, a URL query string or a
  log. `.env*` files are gitignored everywhere.
- Each machine keeps its own credentials; nothing is copied from one person's machine
  to another's. The operator issues a scoped credential when one is shared.
- A leaked value is rotated **and** the leak is recorded; deleting the message is not
  enough. With the Observatory plugin installed, its `handling-secrets` skill does this
  by slot name without printing the value.

## 6. Licensing — say it exactly

| Products | License |
|---|---|
| `fabric-switchboard`, `project-observatory-dashboard`, `fabric-dashboards`, and the contributor tools (`passioncode`, `fabric-agent-adapter`) | `PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0`; a commercial license on request (contact@passioncode.ai) |
| `project-observatory-contract` (the schemas) | MIT, so anyone can implement them |

- Call these products **source-available**, never "open source", "open-source" or
  "MIT". The short line: "Source-available under PolyForm Noncommercial or Internal
  Use; commercial license on request."
- Versions already released under MIT stay MIT, and each `LICENSE` names the last one.
  Never claim otherwise.
- Contributions are accepted under the repository's `CLA.md`; the PR template carries
  the "I agree to CLA.md" box.
- The PolyForm texts are verbatim; never edit them.

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
- **Engine** (`project-observatory-dashboard`): contributors send PRs; releases are cut
  with the maintainer's release tooling, which is maintainer-only. Machines then run
  `project-observatory full update --check` and `--apply`.
- **Launcher** (`passioncode`): members are tagged first, `family.json` refs point at
  those tags, the payload is vendored from tags only.
- **Contract pins.** `fabric-agent-contract` has no tags, so consumers pin commits, and
  the pins disagree (org-index `BACKLOG.md` X-4). Move a pin only in a release of the
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
path; and the one next task.
