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

Every repository is open source under the GNU AGPL-3.0, or available under a commercial
license from PassionCode.ai (contact@passioncode.ai): SPDX
`AGPL-3.0-only OR LicenseRef-PassionCode-Commercial` (Fabric ADR-0092). The owning page is the
knowledge base's `licensing.md`; the file list is its `repository-standard.md`, and org-index
`scripts/check_format.py` (rules F7–F11) checks it. The three licence files are **copied byte
for byte** from the knowledge base's `templates/` — never retyped, reflowed or "fixed".

| File | What it carries |
|---|---|
| `LICENSE` | `templates/LICENSE-AGPL-3.0.txt`, the unmodified AGPL-3.0 text (SHA-256 `0d96a4ff…abcb0`) |
| `COMMERCIAL-LICENSE.md` | `templates/COMMERCIAL-LICENSE.md` |
| `CLA.md` | `templates/CLA.md`, in every repository, private ones included |
| `SECURITY.md` | every public repository: report privately to contact@passioncode.ai |
| `CONTRIBUTING.md` | only when the repository adds rules; says contributions are accepted under `CLA.md` |
| `.github/pull_request_template.md` | a checkbox "I agree to CLA.md"; any existing template content is kept |
| `package.json` | `"license"` set to the SPDX expression; `files` ships `LICENSE` and `COMMERCIAL-LICENSE.md` |
| `.claude-plugin/plugin.json`, marketplace entries | `"license"` set to the SPDX expression |
| SKILL.md front matter | `license:` set to the SPDX expression |
| `pyproject.toml`, `Cargo.toml` | `license = "AGPL-3.0-only OR LicenseRef-PassionCode-Commercial"` |

- A version released earlier keeps the licence it was released under — MIT or PolyForm
  Noncommercial or Internal Use. Never write that it changed; the README may say which.
- Third-party code keeps its own licence and notice (vendored dependencies, imported templates).
- The operator's own agents are outside the organization and outside this licence: their
  licence is the operator's choice, and nothing about them is published.

## Wording

- The README section, word for word apart from the versions:

  ```markdown
  ## License

  Open source under the [GNU AGPL-3.0](LICENSE). A [commercial license](COMMERCIAL-LICENSE.md) is
  available for use that does not meet the AGPL's terms — contact@passioncode.ai.
  Versions before <first AGPL version> were released under <MIT | PolyForm Noncommercial or Internal Use>.
  ```

- "Source-available" and the PolyForm expression describe past releases only; never state
  them as the current licence.
- No price or term for the commercial licence is stated anywhere; point to
  contact@passioncode.ai.
- Positioning and names come from the knowledge base (`vision.md`, `principles.md` §2); do not
  restate a tagline from memory.

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
- Public documents do not link private repositories. org-index and the knowledge base
  (fabric-workspace `knowledge/`, published at wiki.passioncode.ai/knowledge) may be linked for
  the map and the rules only.
- Security and conduct contact: contact@passioncode.ai, plus GitHub private
  vulnerability reporting on a public repository.
