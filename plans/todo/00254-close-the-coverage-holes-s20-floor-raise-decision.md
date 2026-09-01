---
iron_loop_verdict: true
title: "Measure the new coverage, and put the floor raise to the human as a decision"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: 00235-close-the-coverage-holes-s1-evidence-pack-main, 00236-close-the-coverage-holes-s2-enforcement-fault-arms, 00237-close-the-coverage-holes-s3-fail-open-contracts, 00238-close-the-coverage-holes-s4-actions, 00239-close-the-coverage-holes-s5-quality-agent, 00240-close-the-coverage-holes-s6-iron-loop-enforcer, 00241-close-the-coverage-holes-s7-dispatch-seat-liveness, 00242-close-the-coverage-holes-s8-app-runner, 00243-close-the-coverage-holes-s9-streaming-gate, 00244-close-the-coverage-holes-s10-menu-screens, 00245-close-the-coverage-holes-s11-continuation-queue, 00246-close-the-coverage-holes-s12-verify-claims, 00247-close-the-coverage-holes-s13-session-start, 00248-close-the-coverage-holes-s14-start-command, 00249-close-the-coverage-holes-s15-remainder-fences, 00250-close-the-coverage-holes-s16-remainder-plan-pipeline, 00251-close-the-coverage-holes-s17-remainder-security-tooling, 00252-close-the-coverage-holes-s18-remainder-hooks-commands, 00253-close-the-coverage-holes-s19-remainder-streaming-claims
priority: high
effort: small
files:
  - .ctoc/coverage-baseline.json
  - tests/coverage-ratchet-direction.test.js
approved_by: human
approved_at: 2026-08-31T14:59:34.723Z
gate_crossed: implementation → todo
---

# Measure the new coverage, and put the floor raise to the human as a decision

**Scope (one line):** run the gate over the finished set, record the measured number, present
"raise the floor from 99 to N?" to the human as a decision — and apply it only if the human says
yes, in the one edit that keeps the two statements of the floor in agreement.

**This slice must not raise the floor on its own. Ratchets are raised by the human** (parent plan,
Decision 3).

## Implementation Details

### Why this is a slice and not a step of another one

The floor can only be raised once every other slice has landed: it is the last true measurement.
That is why this slice depends on all nineteen others, and why it is the only one that touches
the baseline.

### The two places the floor is written, and why both move together

1. `.ctoc/coverage-baseline.json` → `minPct`, currently **99** (read this session; the file's own
   comment states it may only ever be RAISED, never lowered to make a failing run pass).
2. `tests/coverage-ratchet-direction.test.js` → `HISTORICAL_FLOOR`, which states the floor a
   SECOND time precisely so that lowering it requires editing two places, one of them a test whose
   name and failure message both say not to.

A raise therefore edits both, in one unit of work. Editing only the baseline leaves the two
disagreeing, which is what the direction test exists to catch.

### The measurement, and what "measured" means here

Run `npm test`. That runs the suite through `src/scripts/test-gate.js`, which scopes coverage with
`--test-coverage-include=src/**`. **Only that number counts.** `node --test tests/*.test.js`
enforces neither the coverage floor nor the zero-skipped gate, and an unscoped run reports a
meaningless figure inflated by every file the run transitively loads.

Record, from that run:
- the measured line-coverage percentage, scoped to `src/**`;
- `fail 0` and `skipped 0` (or, for a skip, the LOUD printed reason and the environment);
- the per-file percentage for each file the nineteen slices touched;
- the remaining uncovered line count, split into: still-reachable-but-untested, deliberately left
  (permission-gated or terminal-only, with reasons), and reported-dead.

The measurement environment matters and is already documented in the baseline: this is a
**normal-developer-machine floor** (macOS or Linux, non-root). Under a root runner or on Windows
the same tree measures a few tenths lower, because permission-gated branches cannot run there.
Record which environment produced the number.

### The decision, as it reaches the human

One line, in plain words, with the arithmetic visible — for example:

> Coverage measured N.NN% (was 99.04%). The floor is 99. Raise it to M? A floor at M means a
> future change that drops coverage below M fails the gate. Leaving it at 99 keeps the current
> margin. This is your call.

Present it flat: **no recommendation is manufactured here.** How much headroom to keep between the
measured value and the floor is an owner's decision about how much future variance to tolerate,
not a quality question with a best answer. State the measured number, the current floor, and what
each choice means; do not tilt it.

The parent plan's expectation was "one point under the new measured value (expected around 99.5)".
Present that as the arithmetic it is, not as a recommendation, and let the human choose the
number.

### If the human says no, or does not answer

The slice completes with the measurement recorded and **no file changed**. That is a complete
outcome, not a failure: the measurement is the deliverable, the raise is the human's.

## Test Plan (TDD-Red first)

Only when the human has answered with a number M:

1. **RED first:** set `HISTORICAL_FLOOR` in `tests/coverage-ratchet-direction.test.js` to M and
   run that test. It must FAIL, because `.ctoc/coverage-baseline.json` still says 99. That
   failure is the proof the two statements really are coupled — if it passes, the coupling is
   broken and that is a finding to report before anything else.
2. **GREEN:** set `minPct` to M in `.ctoc/coverage-baseline.json` and append to its `notes` field
   the reason, the measured value, the version and the date, in the form the existing notes use.
   Re-run: the direction test passes.
3. **The gate:** `npm test` passes at the new floor with real margin.

If the human declines, none of the three steps runs.

## Decisions Taken Under Ambiguity

1. **The raise is presented flat, with no recommendation.** The floor is a tolerance for future
   variance — an owner's decision. Manufacturing a recommendation on it would be steering while
   pretending to consult.
2. **The test moves first, the baseline second.** That order makes the coupling visible and turns
   the raise into a real red-to-green change rather than two independent edits.
3. **No new test file is created**, so no documented count moves and `CLAUDE.md` is not declared.
   `.ctoc/coverage-baseline.json` is declared for clarity, though the enforcement hook already
   permits `.ctoc/` writes — declaring it states the intent rather than granting anything.
4. **The floor is never lowered.** If the measured value comes in below 99 for any reason, that is
   a regression to fix in the slices, not a number to adjust here.

## Execution Plan

### Step 8: TEST
Only after the human's answer: set `HISTORICAL_FLOOR` to the chosen M in
`tests/coverage-ratchet-direction.test.js` and run it. Record the RED result and its message. If
it does not go red, stop and report the broken coupling.

### Step 9: PREPARE
Confirm all nineteen sibling slices have landed and the tree is clean. Confirm the machine is a
normal developer machine (non-root, POSIX) so the measurement is comparable with the recorded
floor; if it is not, say so and label the number accordingly.

### Step 10: IMPLEMENT
- Sub-item 1: run `npm test` and capture the scoped measurement, the pass and skip counts, and
  the per-file percentages.
- Sub-item 2: compose and present the decision line to the human — flat, with the arithmetic.
- Sub-item 3: **only on the human's answer**, set `minPct` to M and append the note recording the
  measured value, the reason, the version and the date.

### Step 11: REVIEW
Confirm no test was weakened anywhere in the batch, no baseline exemption or whitelist entry was
added by any slice, and the floor moved only upward and only by the human's answer.

### Step 12: OPTIMIZE
Nothing to optimise. Do not add a helper, a script or a report generator for a measurement the
gate already prints.

### Step 13: SECURE
The baseline is a ratchet: confirm the edit raises and never lowers, and that the note records the
real measured number, not a rounded or aspirational one.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor as it now stands. Record the final number.

### Step 15: DOCUMENT
Update the baseline's `notes` with the raise, its measured value, its date and its version, in the
existing form. If the human declined the raise, record the measurement in this plan and change no
file.

### Step 16: FINAL-REVIEW
Report to the human, in plain words: the measured coverage before and after the whole batch; the
remaining uncovered lines split into still-untested, deliberately left (with reasons) and
reported-dead; every real defect the batch exposed; and whether the floor moved, to what, and on
whose answer.


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
