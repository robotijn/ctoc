---
iron_loop_verdict: true
title: "Remainder: the fences and scanners — their own dark arms"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-fences-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.367Z
gate_crossed: implementation → todo
---

# Remainder: the fences and scanners

**Scope (one line):** classify and cover the small dark ranges in the eight fence and scanner
modules — the checks that judge the rest of the codebase, and whose own unexercised arms are the
ones most likely to make a fence report a verdict it never earned.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/unexecutable-instruction-scan.js` | 190 · 242-243 · 271-272 · 439-440 · 504-505 · 521-522 |
| `src/lib/false-green-scan.js` | 345-347 · 428 · 564 |
| `src/lib/agent-honesty-scan.js` | 75-76 · 78-79 · 169-170 |
| `src/lib/human-facing-scan.js` | 284-285 · 507-508 |
| `src/lib/recipe-harness.js` | 68 · 150-151 · 264-268 |
| `src/lib/declared-breadth.js` | 144-145 · 161-162 |
| `src/lib/wiring.js` | 92-93 |
| `src/lib/reachability.js` | 155 |

**The planner did not read any of these eight files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges from the gate's own report and
reads each one; where the code disagrees with anything in this plan, the code wins and the drift
is reported.

### The classification rule (from the approved parent plan, section 4)

Each range is exactly one of: **(a)** reachable behaviour → write a test a mutation would break;
**(b)** permission-gated or terminal-only → leave it and NAME it in the header with the reason (a
permission-gated case that cannot run announces a LOUD skip with a printed reason, never a silent
no-op); **(c)** dead → report it in `## Decisions Taken Under Ambiguity` and at Step 16, and
**never delete it**.

### What to expect, and the two rules that apply here specifically

These modules share one shape: they walk a tree, read a baseline, and return findings. So:

1. **A fence that cannot look must not report "clean".** Several of these ranges will be the
   fail-closed arms (an unreadable file, an unreadable baseline, a count below a non-vacuity
   floor). Where a range is one of those, the assertion must be that the module reports
   `available: false` / a failure / an explicit unreadable count — **never an empty findings list**.
   That is the same family as `stale-detector.js`'s `unreadCount` and the coverage gate's
   `resolveThreshold`, both of which fail closed by design.
2. **Never add a baseline entry to make a case pass.** Every baseline these modules read
   (`.ctoc/false-green-baseline.json`, `.ctoc/unexecutable-instruction-baseline.json`,
   `.ctoc/reachability-baseline.json`, `.ctoc/recipe-coverage.json`) has two deliberately separate
   structures — debt that may only shrink, and an exemption list that starts empty and requires a
   written justification. **This slice adds nothing to either.** Every baseline under test is a
   fixture copy under `os.tmpdir()`.

### Seams

- **Fixture-first.** These are pure-ish analysers: a temp tree with the exact file shapes that
  trigger a branch is a stronger test than a mock, and needs no restoration.
- **Filesystem faults:** `t.mock.method(safeFs, 'readFileSync'|'readdirSync'|'statSync', …)` with
  a path sentinel so only the case's own path throws.
- **Never mock the scanner under test**, and never assert only "returned an array" — assert the
  finding, its key, and its direction.

### Wiring — the live call sites

No module is added. All eight are live: `src/lib/iron-loop-enforcer.js` runs the fences as named
checks (`false-green-fence`, `agent-honesty-fence`, `unexecutable-instruction-fence`,
`golden-corpus-fence`, and the reachability and recipe checks), and each has a ratchet test file.
The new test file is reached by the gated suite (`npm test` → `src/scripts/test-gate.js`).

### Security review

- No real baseline is written; no exemption added anywhere.
- Fixture trees live under `os.tmpdir()` and are removed in `after`.
- `recipe-harness.js` EXECUTES shipped recipes: any case touching it must keep the harness's own
  rules — explicit `maxBuffer` with an overflow reported as a FAILURE, no memoization, no shell,
  and a loud throw on a missing target. Do not introduce a case that runs a recipe against the
  repository.
- No secret; no host path in an assertion message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `an unreadable agent definition makes the census report NOT available, never an empty missing list`.
- Every such case RED before the change. A case GREEN on the first run means an existing ratchet
  test already reaches it and the map is stale — account for it at Step 11 and delete the
  duplicate; never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** This slice intends no source change, and
   declaring eight modules would make the write permission far broader than the work. If a case
   exposes a real defect in one of them, the executor files it through
   `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields) so the human sees it and
   decides — a defect in a fence is exactly the kind of finding that must reach a human rather
   than be quietly patched.
2. **Grouped by family, one test file.** These eight are one subject — the checks that judge the
   codebase — and the work surface stays a single file.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-fences-coverage.test.js` with one named case per range classified (a).
Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all eight files. Read every range in the
current code and write the (a)/(b)/(c) classification, with the enclosing function, into the
header before any assertion is written. Read each module's existing ratchet test so this file
adds only what is missing and modifies nothing.

### Step 10: IMPLEMENT
- Sub-item 1: the fixture-tree builders (one per module shape).
- Sub-item 2: the (a) cases, fixture-driven, with sentinel-guarded filesystem faults only where a
  real fault is required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; **no baseline entry or exemption added
anywhere**; no scanner under test mocked; every mock restored. Account for every case GREEN
before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers; no memoized analysis between cases (a cached run is a check that did not
run). No sleeps, no retries.

### Step 13: SECURE
Confirm no recipe was executed against the repository; nothing written outside `os.tmpdir()`; no
shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the eight
files.

### Step 15: DOCUMENT
The header names every range and its disposition, so a later reader can tell tested from
deliberately-left from unreachable without re-deriving it.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; and — most
importantly — any fence found to report "clean" on input it could not read.


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
