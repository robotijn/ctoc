---
iron_loop_verdict: true
title: "The last-mile driver reports a launch failure as a failure"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/app-runner-coverage-holes.test.js
  - src/lib/app-runner.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.671Z
gate_crossed: implementation → todo
---

# The last-mile driver reports a launch failure as a failure

**Scope (one line):** cover the dark ranges of `src/lib/app-runner.js` — the Step 14 check that
drives the declared entry point — where the arms nothing has exercised are exactly the ones that
must never report `applicable: false` when a real drive went wrong.

## Implementation Details

### Target and ranges

`src/lib/app-runner.js` — measured **98.05 %** on 2026-08-31. Uncovered:
`163-164` · `610` · `619-620` · `638` · `815-816` · `932-934` · `1117-1125` · `1133-1134` ·
`1193-1194`.

### What the planner verified (read this session: lines 1110-1139)

- **1116-1125** is the driver's launch-failure arm: when `spawnSync` returns a `proc.error`, it
  returns `{ applicable: true, launched: false, responded: false, evidence: { shape },
  durationMs: 0, errors: ['app-runner driver failed to launch: <message>'] }`. The load-bearing
  fact is `applicable: true` — a failed launch is a FAILURE, never "no app to launch". That is
  the exact false-green shape this module was fixed to avoid, and it is unasserted today.
- **1129-1134** is the result-marker parse: on a `JSON.parse` failure it falls through to the
  error result below (1136+), which is partly covered.

Every other range in this file is **unread by the planner**. Read the code at Step 9.

### Seams — exact

- **1117-1125:** `t.mock.method(require('node:child_process'), 'spawnSync', …)` returning
  `{ error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }), stdout: '', stderr: '' }`
  for the driver invocation only (guard on the argv the case expects, pass everything else
  through to the real function). Assert the full returned object, `applicable: true` first — a
  mutant flipping it to `false` is the defect this case exists to kill.
- **1133-1134:** mock `spawnSync` to return stdout that contains the result marker followed by
  invalid JSON. Assert the function returns the error-shaped result, still `applicable: true`,
  and does NOT throw.
- The remaining ranges: classify at Step 9 and pick the smallest real seam — the declared
  entry-point path reads `.ctoc/settings.json`, so several arms are reachable with a FIXTURE
  declaration (a command that exits non-zero, a command whose output omits the `expect`
  substring, a command that exceeds `timeout_ms`) and need no mock at all. Those three are the
  documented FAIL cases (`tests/last-mile-drives-entry-point.test.js` holds the contract — read
  it at Step 9 and do not modify it; write only what it does not already cover).

### Non-goals, restated so they are not "improved" into the tests

No browser automation, no screenshot, no network call, no multi-step interaction, no warm-up run,
**no retry**. A retry turns a flaky check into a slow check that lies. A timeout case must use a
small declared `timeout_ms` and an inert sleeping command
(`process.execPath -e "setTimeout(()=>{},5000)"`), never a real application.

### Wiring — the live call sites

No module is added. `src/lib/app-runner.js` is live: Step 14's last-mile check runs it. The new
test file is reached by the gated suite.

### Security review

- Every fixture command is an argv array with no shell; a declared command containing a shell
  operator is rejected by the module by contract, and a case should prove that if it is not
  already proven.
- The module's evidence artifact records only a byte count and a matched flag, never stdout
  (stdout may carry a secret). **Any new case must assert that property, never print captured
  output into a message.**
- Fixtures under `os.tmpdir()`, removed in `after`.

## Test Plan (TDD-Red first)

- `a driver that fails to LAUNCH is applicable:true, launched:false, with the launch error — never applicable:false`
- `a result marker followed by unparseable JSON yields the error result, not a throw`
- one case per remaining reachable range, named for its behaviour.
- Every case RED before the change. A case GREEN on the first run means
  `tests/last-mile-drives-entry-point.test.js` already covers it — say so at Step 11 and delete
  the duplicate rather than banking it.

## Decisions Taken Under Ambiguity

1. **`src/lib/app-runner.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here, recorded with what failed
   and why the code was wrong.
2. **Fixture-driven where possible, mocked only at `child_process`.** The declared-entry-point
   arms are reachable with a real inert command; only the spawn-error arm genuinely needs a mock,
   because a launch failure cannot be produced reliably across platforms.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/app-runner-coverage-holes.test.js` with the named cases. Run it; record every case
RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read every range and classify it. Read
`tests/last-mile-drives-entry-point.test.js` to find what is already covered, so this file adds
only what is missing and modifies nothing.

### Step 10: IMPLEMENT
- Sub-item 1: the fixture project with a declared entry point in `.ctoc/settings.json`.
- Sub-item 2: the two mocked `spawnSync` cases.
- Sub-item 3: the fixture-driven cases for the remaining reachable ranges.
- Sub-item 4: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no retry, warm-up or sleep introduced; no
function under test mocked; every mock restored. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder; small timeouts; no sleeps beyond the one deliberate timeout case.

### Step 13: SECURE
No captured stdout in any message or artifact; no shell; no secret; nothing written outside
`os.tmpdir()`.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states plainly that a failed drive is a FAILURE, never `applicable: false`, and that
the cases exist to keep it that way.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any place where a real
drive failure could still be reported as not-applicable.


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
