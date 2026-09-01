---
iron_loop_verdict: true
title: "Remainder: the security scanners, tool detection and the audit chain"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-security-tooling-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.423Z
gate_crossed: implementation → todo
---

# Remainder: the security scanners, tool detection and the audit chain

**Scope (one line):** classify and cover the small dark ranges in the twelve modules that scan for
secrets and vulnerabilities, detect the project's tools, and record the audit chain.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/audit-chain.js` | 117-118 · 203-204 · 211 |
| `src/lib/tool-detector.js` | 282-283 · 688-690 |
| `src/lib/sast-runner.js` | 578-580 · 583-584 |
| `src/lib/sca-runner.js` | 375-377 · 380-381 |
| `src/lib/secrets-scanner.js` | 1154-1155 · 1164-1165 |
| `src/lib/quality-state.js` | 259-262 |
| `src/lib/eu-ai-act-helpers.js` | 324-326 |
| `src/lib/framework-detector.js` | 298-300 |
| `src/lib/framework-security-checker.js` | 452-453 |
| `src/lib/deployment.js` | 462-463 |
| `src/lib/regulatory-regime.js` | 155 |
| `src/lib/step-13-verify.js` | 134-135 |

**The planner did not read any of these twelve files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges and reads each one; where the code
disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The three rules that apply to this family specifically

1. **A scanner that found nothing because it could not look must say so.** The precedent is the
   secrets-scanner's own history: findings were once dropped silently. Where a range is a
   detection-failure or an unreadable-input arm, assert the module reports the failure — never an
   empty findings list that reads as "clean".
2. **A zero-tool detection is NOT a pass.** `tool-detector` feeds the quality agent, where
   `runLint`/`runTypecheck` return `{ passed: false, undetermined: true, ran: 0, errors: null }`
   on a zero-tool detection. Any case here must preserve that direction and must never assert a
   shape that lets "no tool found" read as "check passed".
   `tests/vacuous-verification.test.js` holds the contract — read it, do not modify it.
3. **Test fixtures for the secrets scanner use generic high-entropy values, never real provider
   formats.** No `sk_live_`, no `ghp_`, no `AKIA`. The platform's push protection rejects a push
   containing them, and the bypass is never to be used. This is not negotiable and it is not a
   weakening: a generic high-entropy string exercises the same detector path.

### Seams

- Fixture-first: a temp project whose files, manifest or lockfile trigger the branch.
- Child processes: the scanners spawn external tools. Inject at
  `t.mock.method(require('node:child_process'), 'spawnSync'|'execFileSync', …)` guarded on the
  case's own argv, and assert the module's VERDICT, not the spawn. Keep every fixture command an
  argv array with `shell: false`, and assert an overflow of an explicit `maxBuffer` is reported as
  a FAILURE, never as a pass.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Never mock the scanner under test.

### Wiring — the live call sites

No module is added. All twelve are live: the scanners run at Step 13 and on `/ctoc:push`, the
detectors feed initialisation and the quality agent, and the audit chain records dispatches. The
new test file is reached by the gated suite.

### Security review

- **No realistic credential in any fixture** (rule 3 above). Reference secrets by name, never by
  value, even in a test.
- No external security tool is actually executed against the repository; every spawn is either
  intercepted at the boundary or points at an inert argv command.
- No network request. If a range can only be covered by fetching an advisory database, report it
  as uncovered with that reason.
- Nothing written outside `os.tmpdir()`; no shell; no host path in an assertion message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `a scanner whose tool could not run reports NOT VERIFIED, never an empty clean result`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human. A defect in a security scanner is precisely a finding that must reach a human.
2. **Grouped by family, one test file** — these twelve are one subject: what CTOC scans for and
   what it detects.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-security-tooling-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all twelve files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Re-read `tests/vacuous-verification.test.js` so no new assertion contradicts it.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders.
- Sub-item 2: the (a) cases, with child-process interception at the boundary.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no scanner under
test mocked; every mock restored; the not-verified-versus-passed distinction preserved exactly.
Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers; one spawn-interception helper. No sleeps, no retries.

### Step 13: SECURE
Confirm no fixture carries a realistic credential; confirm no external tool ran against the
repository; confirm no network request; nothing written outside `os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the twelve
files.

### Step 15: DOCUMENT
The header names every range and its disposition, and states the fixture rule for secret-shaped
values so the next author does not reach for a real provider format.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any scanner found
to report clean on input it could not read.


---

## Execution Plan (Steps 8-16)

### Step 8: TEST (TDD Red)
- [ ] Write tests for the implementation
- [ ] Test error conditions
- [ ] Run tests - expect RED (failing)

### Step 9: PREPARE
- [ ] Install dependencies if needed
- [ ] Check prerequisites
- [ ] Verify dev environment ready
- [ ] Create directories/config if needed

### Step 10: IMPLEMENT
- [ ] Implement the feature according to requirements
- [ ] Add error handling
- [ ] Wire up integration points

### Step 11: REVIEW
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [ ] Remove redundant operations
- [ ] Optimize critical paths
- [ ] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

### Step 14: VERIFY
- [ ] Run lint + type check
- [ ] Run ALL tests (TDD Green)
- [ ] Check coverage >= 80%
- [ ] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [ ] Update relevant documentation
- [ ] Add JSDoc comments to new functions
- [ ] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
