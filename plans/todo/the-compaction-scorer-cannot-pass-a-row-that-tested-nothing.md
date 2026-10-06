---
iron_loop_verdict: true
iron_loop: true
title: "The compaction scorer cannot pass a row that tested nothing"
depends_on: none
files:
  - tests/compaction-eval/score.js
  - tests/compaction-eval.test.js
approved_by: human
approved_at: 2026-10-06T19:14:16.374Z
gate_crossed: implementation → todo
---

# The compaction scorer cannot pass a row that tested nothing

## Problem statement

Three reviews of the agent compaction rollout (2026-10-06) found that the smoke-check scorer compares the compacted agent only against the original, so three kinds of row pass while testing nothing:

1. **A "clean" fixture that is not clean for this agent.** When the original already raises an important-or-higher finding, `shortfalls()` can never report `serious-false-finding` (it needs `!original.seriousFalse`), so the row proves nothing about false alarms. This happened for the devil's-advocate and red-team critics.
2. **A planted defect both versions miss.** `smokeVerdict()` records the note `both-missed-planted-defect` and the row stays `ok`, so the verdict is PASS.
3. **Unread conditions on clean rows.** `evaluate()` returns early for `kind: 'clean'`, so `fields`, `fields_contain`, `forbid` and `require` written on a clean fixture are silently never checked.

## Technical approach

All changes are in `tests/compaction-eval/score.js`; the live call site is unchanged: `node tests/compaction-eval/score.js` → `run()` → `scoreRuns()` → `smokeVerdict()`, and `run()` already prints each row's fixture name and status and maps INCOMPLETE to exit 4.

- **`smokeVerdict()`**, per row, after the existing `baseline-invalid` rule (which keeps precedence):
  - clean row with `original.seriousFalse === true`, not cleared by a rerun whose original is not serious-false → status `baseline-not-clean`.
  - planted row with `!original.found && !compacted.found`, not cleared by a rerun in which either version found it → status `planted-missed-by-both`. The `both-missed-planted-defect` note is removed (the status replaces it).
  - verdict: any of `baseline-invalid`, `baseline-not-clean`, `planted-missed-by-both` → `INCOMPLETE`, ahead of FAIL/RERUN/PASS.
- **`evaluate()`**: a clean fixture carrying `require`, `forbid`, `fields` or `fields_contain` throws `clean fixture <name> carries <key>, which the scorer never reads on a clean plan`. `main()` turns that into a harness error, exit 5, naming the fixture. Same shape as the existing `id_prefix` throw.

## Decisions Taken Under Ambiguity

- For the unread clean-row conditions I chose **refuse** over **apply**: applying needs a new clean-row shortfall type and a rule for an original that fails its own condition, for no condition any author has asked for; refusing is one guard and makes an unread condition impossible to write. If a clean fixture ever needs a field condition, apply it then.
- The existing test "a planted defect both versions missed is reported and not counted" asserts the contract this plan replaces; it is rewritten to assert INCOMPLETE (tightened, never loosened).

## Committed summaries whose verdict would change (history, not rewritten)

- `.ctoc/eval/premortem-critic/2026-10-06/summary.json` — PASS would become INCOMPLETE: `clean-idempotent-webhook` has `seriousFalse: true` in BOTH versions → `baseline-not-clean`.
- `.ctoc/eval/implementation-planner/2026-10-06/summary.json` — unchanged (every planted row found by both; the clean row serious-false in neither).
- `.ctoc/eval/harness-probe/2026-10-06/summary.json` — unchanged (its one planted row found by both).
- No devil's-advocate or red-team summary is committed under `.ctoc/eval/`, so their non-clean clean fixtures appear in no committed verdict.

## Acceptance criteria

- [ ] A clean row whose original raises an important-or-higher finding has status `baseline-not-clean`; the verdict is INCOMPLETE and the command exits 4 with the fixture named on its row line.
- [ ] A rerun whose original is not serious-false clears `baseline-not-clean`.
- [ ] A planted row both versions miss has status `planted-missed-by-both`; the verdict is INCOMPLETE (exit 4).
- [ ] A clean fixture with `require`, `forbid`, `fields` or `fields_contain` is refused with a message naming the fixture and the key; the command exits 5.
- [ ] Every existing test in `tests/compaction-eval.test.js` other than the one rewritten above passes unchanged.

## Execution Plan

- [x] **Step 8: TEST** — In `tests/compaction-eval.test.js` section "4. the smoke rule": add `baseline-not-clean` (with and without a clearing rerun), add `planted-missed-by-both`, rewrite the both-missed test to expect INCOMPLETE; in the `evaluate` section add one refusal test per key; add one end-to-end run through `score.js` exiting 4 on a non-clean clean fixture. Run them and see each fail.
- [x] **Step 9: PREPARE** — Confirm the current suite is green with `node --test tests/compaction-eval.test.js` before editing.
- [x] **Step 10: IMPLEMENT** — `score.js`: the two new statuses and their INCOMPLETE ordering in `smokeVerdict()`; the clean-fixture refusal in `evaluate()`; remove the replaced note; update the header comment's status and exit-code wording.
- [ ] **Step 11: REVIEW** — Check status precedence (`baseline-invalid` first), that the rerun clearing mirrors the existing `baseline-invalid` rule, and that no PASS path remains for either new row kind.
- [x] **Step 12: OPTIMIZE** — No new helper unless the two rerun-clearing checks share it; no new file.
- [ ] **Step 13: SECURE** — The refusal message names fixture and key only, never payload text.
- [x] **Step 14: VERIFY** — `npm test`: all tests, coverage at or above the floor in `.ctoc/coverage-baseline.json`, zero skipped.
- [x] **Step 15: DOCUMENT** — The header comment of `score.js` lists the two new statuses and the clean-fixture refusal.
- [ ] **Step 16: FINAL-REVIEW** — Every acceptance criterion maps to a passing test; the committed summaries are untouched.


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
- [ ] Self-review all new code
- [ ] Verify integration points work together
- [ ] Check error handling completeness

### Step 12: OPTIMIZE
- [x] Remove redundant operations
- [x] Optimize critical paths
- [x] Simplify complex code

### Step 13: SECURE
- [ ] Validate inputs (no path traversal)
- [ ] Sanitize outputs
- [ ] No secrets in code
- [ ] Safe file operations

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
- [ ] Verify steps 8-15 completed correctly
- [ ] All quality checks passed
- [ ] Manual verification if needed
- [ ] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

- Step 8: twelve tests added or rewritten in `tests/compaction-eval.test.js`; ten seen red before the change (the two rerun-clearing and precedence guards already held and stay as regression guards).
- Step 10: `notes` was only ever filled by the replaced `both-missed-planted-defect` note, so the field is removed from each row and from the printed row line rather than left always empty.
- Step 14: `npm run lint` clean; `npm test` PASS — coverage 99.9% (floor 99%), 0 skipped, 0 failed.
