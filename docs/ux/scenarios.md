# UX Scenarios

<!-- Managed with super-ux (ux-contract v4). Coverage is limited to launcher status. -->

## Index

| ID | Title | Feature | Persona | Traces | Status | Last audit |
|---|---|---|---|---|---|---|
| SCN-001 | Inspect cached npm version | status | Operator | REQ-1, REQ-2 | implemented | 2026-10-01 |
| SCN-002 | Read status without changing the installation | status | Automation | REQ-3 | implemented | 2026-10-01 |

## Personas

- **Operator:** a person checking the installed skill set after an update.
- **Automation:** a script reading machine-readable installation status.

## Scenarios

### SCN-001: Inspect cached npm version

- **Persona:** Operator
- **Feature:** status
- **Entry point:** `passioncode status`
- **Preconditions:** An installation may exist; the session-start probe may have saved a registry observation.
- **Steps:**
  1. Run `passioncode status`.
  2. Compare installed, package and cached npm versions; read when npm was checked.
- **Expected result:** The npm version is labelled cached, with its recorded timestamp. A cache below the installed stable version is explicitly labelled stale.
- **Alt paths:** No cached version: say not checked. Missing or invalid timestamp: say check time unknown. A cache equal to or above installed remains labelled cached, without claiming a live lookup.
- **UI elements:** First line of terminal output.
- **States covered:** empty, success, error
- **Errors & recovery:** Unknown check time does not crash status. A later session-start probe can refresh the observation; status itself does not perform a probe.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`, tests beginning `status labels cached npm observations` and `status reports an absent npm observation`.
- **Product:** unobserved

### SCN-002: Read status without changing the installation

- **Persona:** Automation
- **Feature:** status
- **Entry point:** `passioncode status --json`
- **Preconditions:** Saved state contains an npm observation; npm may be unavailable.
- **Steps:**
  1. Read JSON status.
  2. Use `latest` and `checkedAt` as the saved observation.
- **Expected result:** Existing JSON fields retain their raw values. Both text and JSON status leave state unchanged and do not invoke npm.
- **Alt paths:** With no observation, `latest` and `checkedAt` remain null.
- **UI elements:** JSON on stdout and process exit code.
- **States covered:** empty, success
- **Errors & recovery:** Network availability has no effect on reading locally saved status.
- **Status:** implemented
- **Coverage:** `test/launcher.test.js`, test beginning `status labels cached npm observations`.
- **Product:** unobserved
