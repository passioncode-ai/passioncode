# Publishing and licensing in passioncode-ai

Load this before a first public release, a change to a public surface (a public
repository, the site, the organisation profile, an npm package, a release note), or any
change to a license, a manifest's `license` field, `CLA.md` or a PR template.

## Contents

- The license, file by file
- Wording
- The privacy gate
- Names, paths and authorship

## The license, file by file

The source-available expression is
`PolyForm-Noncommercial-1.0.0 OR LicenseRef-PolyForm-Internal-Use-1.0.0`; a commercial
license is offered on request at contact@passioncode.ai. The schemas in
`project-observatory-contract` are MIT instead. To relicense a repository, copy the
`LICENSE` of one already relicensed (this launcher's, for instance) and change only the
MIT-history sentence — the copyright line and the Required Notice stay as they are.

| File | What it carries |
|---|---|
| `LICENSE` | the copyright line, the two licenses, a one-paragraph summary marked as not part of either license, one sentence naming which earlier releases stay MIT, the Required Notice, then both PolyForm texts verbatim |
| `CLA.md` | the contributor license agreement, at the repository root |
| `CONTRIBUTING.md` | says contributions are accepted under `CLA.md` |
| `.github/pull_request_template.md` | a checkbox "I agree to CLA.md"; any existing template content is kept |
| `package.json` | `"license"` set to the SPDX expression |
| `.claude-plugin/plugin.json`, marketplace entries | `"license"` set to the SPDX expression |
| SKILL.md front matter | `license:` set to the SPDX expression |
| `pyproject.toml` | `license` as an SPDX expression (PEP 639), which needs `setuptools>=77` in `build-system` |
| `Cargo.toml` | `license-file = "LICENSE"` instead of `license`, and `publish = false` |

- The PolyForm texts are copied verbatim. Never edit, abridge or "fix" them.
- The MIT sentence names the real last MIT release — for example "Versions up to and
  including v0.8.1 of this repository were released under the MIT License; those
  releases remain available under MIT." For a repository with no release: "Commits
  before <sha> …".
- A published MIT release stays MIT. Never write that it changed.

## Wording

- The products are **source-available**. Never "open source", "open-source" or "MIT"
  for them — in a README, the site, the profile, a description or JSON-LD.
- The short line: "Source-available under PolyForm Noncommercial or Internal Use;
  commercial license on request."
- The tagline is "The agent-agnostic operating system for AI-native teams." and "A
  toolkit for AI-native teams."; the category line is "From vibe coding to passion
  coding."

## The privacy gate

- The engine's gate: `python3 tools/check_public_release.py`. It scans the tree and
  the blob history and prints categories and counts, never the matched values. The
  maintainer adds `--private-denylist <local file>`; that list is never committed, never
  copied into a repository and never printed.
- A name that is published on purpose goes in `tools/public-identifiers.json` with a
  reason. Adding one is a review decision.
- Other public repositories run the checks their own `AGENTS.md` names. Where there is
  none, grep your change for home paths, host names and personal names before pushing.

## Names, paths and authorship

- The operator's personal agents never appear on PassionCode.ai surfaces, examples,
  evals, docs or the launcher's member list. Examples use neutral names:
  `example-agent`, `alpha-web`, `beta-api`, `example.com`.
- No absolute home paths in code, tests or public documents. Read the ones in older
  documents as the operator's layout.
- Product metadata: author and owner **PassionCode.ai**, URL `https://passioncode.ai/`.
  The site names the author by first name only; do not add full names or biographies to
  product surfaces.
- Public documents do not link private repositories. org-index may be linked for the
  map and the rules only.
- Security and conduct contact: contact@passioncode.ai, plus GitHub private
  vulnerability reporting on a public repository.
