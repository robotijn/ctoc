---
title: "Export the saved notes as text"
type: implementation
priority: medium
files:
  - src/export.js
  - tests/export.test.js
  - src/cli.js
  - src/index.js
  - tests/cli.test.js
  - README.md
  - CHANGELOG.md
approved_by: human
approved_at: 2026-10-01T09:12:00.000Z
gate_crossed: implementation → todo
---

# Export the saved notes as text

## Problem statement

Users want to copy all their saved notes at once. The `notes` command must print every note as plain text, one note per line.

## Technical approach

One pure function, `exportNotes(notes)`, in `src/export.js`, with its tests in `tests/export.test.js`, wired into the
existing `notes` command (`src/cli.js`, the `bin` entry of `package.json`) as `notes export`, with
an end-to-end test in `tests/cli.test.js`. No network, no new dependency; the command reads only the
notes file it already reads (`src/notes.json`). Step 6.5 THREAT MODEL ran at design time:
threat-modeler found no new trust boundary (the command takes no argument; it prints the notes the user already holds); the record is the Step 13 line below.

## Acceptance criteria

- [x] `notes export` prints every note, one per line.
- [x] `exportNotes` returns the joined text for the examples in the tests.
- [x] An empty notes list gives an empty result, never throws.
- [x] npm test passes with 0 failed, 0 skipped.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Write tests for the implementation (unit-test-writer, e2e-test-writer)
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

Record: 5 unit tests in `tests/export.test.js` and 1 end-to-end test in `tests/cli.test.js`; all 6 failed before the implementation existed.

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready

Record: sast-scanner, dependency-checker, secrets-detector and quality-gate baseline: 0 findings.

### Step 10: IMPLEMENT
- [x] Implement `exportNotes(notes)` in `src/export.js`
- [x] Error handling: a non-list gives "", null notes and notes without text are skipped, a newline inside a note becomes a space
- [x] Wire it: `src/cli.js` runs it for `notes export`

Record: 3 files changed (`src/export.js`, `src/cli.js`, `src/index.js` export).

### Step 11: REVIEW
- [x] Self-review all new code

Record: iron-loop-critic with code-reviewer, code-smell-detector, dead-code-detector, duplicate-code-detector, consistency-checker, complexity-analyzer and type-checker: 0 blocking findings, one naming suggestion applied.

### Step 12: OPTIMIZE
- [x] Remove redundant operations

Record: complexity-reducer: cyclomatic complexity 3, no change needed. Not performance-critical.

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

Record: security-scanner, sast-scanner, secrets-detector, dependency-checker and dependency-auditor ran on every file in `files:`; 0 findings. No new dependency. input-validation-checker: the command takes no argument; it prints the notes the user already holds. threat-modeler re-validated the Step 6.5 record: it still holds.

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

Record: quality-gate-runner: `npm run lint` (ESLint, `eslint.config.js`) 0 errors, `npm run typecheck` (TypeScript checkJs over `src/`) 0 errors, `npm test` 6 pass, 0 failed, 0 skipped, coverage 100% of lines and branches of `src/export.js`; smoke-test-runner ran `notes export` and passed; a second run gave the same result (not flaky).

### Step 15: DOCUMENT
- [x] README: `notes export` documented
- [x] CHANGELOG: one line under 1.4.0

Record: documentation-updater and changelog-generator.

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed

Record: technical-debt-tracker: no debt accepted. observability-checker: a command-line tool, nothing to log beyond its output. Synthesizer minimal change list (1 change, the naming fix from Step 11) approved and applied. The 14 quality dimensions were reviewed by iron-loop-critic: none below its bar.
