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
approved_at: 2026-09-03T10:22:50.245Z
gate_crossed: review → done
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
4. **Every case was green on its first run, and that is recorded rather than banked.** With no
   behaviour change intended, a characterisation test of current behaviour cannot be red. Red
   provenance was supplied by mutation instead (Step 8 table) and by the before/after coverage
   measurement, so no case is a line-toucher.
5. **The three remaining dark ranges are unreachable, and no test pretends otherwise.** Asserting
   the source text of the caps to "cover" them would be a text match dressed as a reachability
   claim. They are recorded in the test file header and in the Step 16 report for the human.

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
- [x] Write tests for the implementation
- [x] Test error conditions
- [x] Run tests - expect RED (failing)

### Step 9: PREPARE
- [x] Install dependencies if needed
- [x] Check prerequisites
- [x] Verify dev environment ready
- [x] Create directories/config if needed

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements
- [x] Add error handling
- [x] Wire up integration points

### Step 11: REVIEW
- [x] Self-review all new code
- [x] Verify integration points work together
- [x] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [x] Validate inputs (no path traversal)
- [x] Sanitize outputs
- [x] No secrets in code
- [x] Safe file operations

### Step 14: VERIFY
- [x] Run lint + type check
- [x] Run ALL tests (TDD Green)
- [x] Check coverage >= 80%
- [x] 0 skipped, 0 flaky tests

### Step 15: DOCUMENT
- [x] Update relevant documentation
- [x] Add JSDoc comments to new functions
- [x] Update CHANGELOG if needed

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed
- [x] Manual verification if needed
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record (Steps 8–16)

**Step 8 TEST.** Wrote `tests/menu-screens-coverage-holes.test.js` (9 cases). First run:
`tests 9 · pass 9 · fail 0 · skipped 0` — **every case green before any source change, by
construction**: this slice makes no behaviour change (Decision 1), so a characterisation case
of existing behaviour cannot be red. That is stated, never banked. The red that matters was
established two ways instead:
- the ranges were dark in the gate report before the change (99.19 %) and light after (99.60 %);
- **mutation provenance** — each target was mutated in `src/lib/menu-screens.js`, the file
  restored byte-for-byte after each (`git diff` clean), and the suite re-run:
  | mutation | result |
  |---|---|
  | the disclosure catch returns a fabricated `Working in .` line | fail 1 |
  | the disclosure catch rethrows (the throw escapes) | fail 2 |
  | the escalations catch rethrows instead of failing open | fail 1 |
  | the migration door drops its `… and N more` line | fail 1 |

**Step 9 PREPARE.** Ran the gate first and re-derived the ranges from its own report rather than
from the plan: identical to the plan's list — `189-195 · 1050-1051 · 1140-1141 · 1310-1312 ·
1439-1441 · 2308-2312`, file at 99.19 %, whole project 99.14 %. Read
`tests/real-question-file-render.test.js` for the precedent; it was not modified. No range in this
file consumes one of the five captured golden-corpus contracts, so no captured sample applies; the
one persisted contract that is touched (the approval-ledger migration notice) is seeded through its
**real writer**, `gateMigration.writePendingNotice`, not by hand-written JSON.

**Step 10 IMPLEMENT.** Tests only — `src/lib/menu-screens.js` is unchanged (`git diff` empty for
it). Three ranges covered through the public surface (`buildDashboardTable`, `route(['inbox',…])`),
never by calling the function under test through a stub:
- 189-195, the working-directory disclosure: `process.cwd` made to throw at the true boundary, with
  a positive control from the same fixture that renders the real `Working in ../..` line, so the
  silence is a contrast rather than a vacuous absence.
- 1050-1051, the escalations door: `t.mock.method(inbox, 'listEscalations', …)` throws; the door
  still opens, the deploy-ready half still renders its row, and no raw error text reaches the screen.
- 1140-1141, the migration door: 23 withheld violations written through the real writer; exactly 20
  rows plus `… and 3 more`.

**Step 11 REVIEW.** No existing test touched, no assertion weakened, no baseline or exemption
entry added, no `--test-coverage-include` change. Every mock restored in a `finally` (the `chdir`
too). Two first-draft cases that asserted **source text** to "cover" the unreachable ranges were
deleted before completion: a text match is not evidence about reachability, and shipping one would
have been the bullshit-detector antipattern. The unreachable ranges are recorded in the test file's
header instead, and the one behavioural claim that keeps the task-mutator tail unreachable (an
unknown subcommand is refused at the dispatcher) is asserted for real.

**Step 12 OPTIMIZE.** One `beforeEach` fixture, two small seed helpers, no sleeps, no retries; the
new file runs in ~60 ms.

**Step 13 SECURE.** Fixtures under `os.tmpdir()`, removed in `afterEach`; no shell, no network, no
secret. Cases assert that the rendered screens contain no absolute path (`os.tmpdir()`) and no raw
injected error text.

**Step 14 VERIFY.** `npm test` from the repository root, captured whole, last lines read:
`[CTOC test-gate] coverage 99.17% (threshold 99%), skipped 0, failed 0` · `[CTOC test-gate] PASS`
(exit 0). `src/lib/menu-screens.js`: **99.19 % → 99.60 %**; project **99.14 % → 99.17 %**.
Lint clean on the new file (`npx eslint`). The reachability and export-reachability fences and the
documented-count tests pass.

**Step 15 DOCUMENT.** The test file header states, range by range, what is covered and what is left
with the reason. `CLAUDE.md`'s test-file count moved 525 → 526 (the new file), which the
documented-count tests confirm.

**Step 16 FINAL-REVIEW.** Coverage before 99.19 %, after 99.60 %. Three ranges remain dark and all
three are **unreachable, not untested** — reported, never deleted (plan Decision 3):
`1310-1312` and `1439-1441` are `truncated++` branches in the verified-proposals and clean-up
screens whose fan-out cap is applied twice with the same constant (the list is sliced to the cap
before it is rendered, so the render loop's `rows >= cap` test can never fire); `2308-2312` is the
`return undefined` tail of the task mutator, whose only caller routes exactly `start` and `fail`
into it. No screen was found to render unreadably; nothing human-facing is broken by this slice.
