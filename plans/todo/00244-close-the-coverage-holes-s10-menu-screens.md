---
iron_loop_verdict: true
title: "Close the dark ranges in the menu screens"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/menu-screens-coverage-holes.test.js
  - src/lib/menu-screens.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.166Z
gate_crossed: implementation → todo
---

# Close the dark ranges in the menu screens

**Scope (one line):** cover the six dark ranges of `src/lib/menu-screens.js` — the screens the
human actually reads — starting with the arm that stays silent when the working directory cannot
be read, because silence there is the absence of a claim and must never become a false claim.

## Implementation Details

### Target and ranges

`src/lib/menu-screens.js` — measured **99.19 %** on 2026-08-31. Uncovered:
`189-195` · `1050-1051` · `1140-1141` · `1310-1312` · `1439-1441` · `2308-2312`.

### What the planner verified (read this session: lines 183-196)

**188-195** is the catch of the "Working in <dir> — opened from this directory's parent project"
line builder. Its documented contract: the working directory could not be read (a deleted working
directory) or the relative path could not be computed, so it returns the empty string — **which
is the absence of a claim, not a claim that the root IS the working directory** — and the
dashboard still renders.

Every other range in this file is **unread by the planner**. Read the code at Step 9.

### Seams — exact

- **189-195:** `t.mock.method(process, 'cwd', () => { throw new Error('deleted working directory'); })`.
  That is the true boundary and the exact documented scenario. Assert the builder returns `''`
  **and** that the surrounding screen still renders (call the screen function and assert it
  produces its normal content minus that one line). Two mutations this kills: returning a
  fabricated "Working in ." line, and letting the throw escape and blank the dashboard.
- The remaining five ranges: classify at Step 9. These screens are pure string builders over data
  read from disk, so prefer a FIXTURE (a temp project whose plans, questions or state produce the
  branch) over any mock. Where a read must fail, use `t.mock.method(safeFs, …)` with a path
  sentinel.

### The rendering constraint this module carries

A screen is what the human reads, so a case must assert the human-visible content, not the
structure. Two specific traps, both already recorded in this repository:

1. A synthetic fixture can pass while the real screen is unreadable — the decision-matrix
   renderer was fixed test-first against four synthetic cases and the human's screen was still
   broken, because the real question file carries option fields over a thousand characters long.
   If a case in this slice renders a screen that consumes a persisted contract, drive it against
   the **captured real sample** in `tests/fixtures/golden-corpus/`, not an invented one.
   `tests/real-question-file-render.test.js` is the precedent — read it at Step 9 and do not
   modify it.
2. Never assert only that a string is non-empty. Assert the words the human reads.

### Wiring — the live call sites

No module is added. `src/lib/menu-screens.js` is live: `src/commands/start.js` renders these
screens. The new test file is reached by the gated suite.

### Security review

- Screen text must never carry a raw filesystem error, an absolute path or a user name — a
  dashboard string is pasted into issues. Assert repository-relative paths and fixed-vocabulary
  reasons where the range produces them.
- Fixtures under `os.tmpdir()`, removed in `after`; no secret; no shell.

## Test Plan (TDD-Red first)

- `the working-directory line stays silent when the working directory cannot be read — silence is the absence of a claim, not a claim`
- `the dashboard still renders when that line is absent`
- one case per remaining reachable range, named for the words the human reads.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **`src/lib/menu-screens.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here, recorded with what failed
   and why the code was wrong.
2. **A screen case that consumes a persisted contract uses the captured real sample**, never a
   shortened or redacted one: redaction is sanitisation, which is the exact defect the golden
   corpus exists to prevent.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/menu-screens-coverage-holes.test.js` with the named cases. Run it; record every case
RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read every range, classify it, and note
which of the five unread ranges consume a persisted contract (those must use the golden-corpus
sample). Read `tests/real-question-file-render.test.js` for the precedent without modifying it.

### Step 10: IMPLEMENT
- Sub-item 1: the deleted-working-directory case and the still-renders case.
- Sub-item 2: the remaining reachable cases, fixture-driven.
- Sub-item 3: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored. Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder. No sleeps, no retries.

### Step 13: SECURE
No absolute path, user name or raw filesystem error asserted as screen content; nothing written
outside `os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states which ranges are covered and which are left, and — for any screen case — which
sample it renders against and why.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any screen found to render
unreadably against a real captured sample (that would be a human-facing defect, not just a
coverage finding).


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
