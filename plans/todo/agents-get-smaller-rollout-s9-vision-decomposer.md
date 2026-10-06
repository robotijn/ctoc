---
iron_loop_verdict: true
iron_loop: true
title: "Agents get smaller — slice 9: the vision decomposer, compacted by hand with every order kept"
type: implementation
created: 2026-10-06
priority: high
effort: medium
parent_plan: agents-get-smaller-rollout
depends_on: agents-get-smaller-without-losing-findings-pilot, agents-get-smaller-rollout-s0-harness
files:
  - agents/planning/vision-decomposer.md
  - tests/vision-decomposer-compaction.test.js
  - tests/compaction-eval/vision-decomposer/baseline-agent.md
  - tests/compaction-eval/vision-decomposer/rule-inventory.json
  - tests/compaction-eval/vision-decomposer/contract.js
  - tests/compaction-eval/vision-decomposer/expectations.json
  - tests/compaction-eval/vision-decomposer/fixtures/**
  # RATCHET FILES — this slice creates tests/*.test.js, which moves the documented count
  - "CLAUDE.md"
  - "README.md"
approved_by: human
approved_at: 2026-10-06T18:01:53.925Z
gate_crossed: implementation → todo
---

# Agents get smaller — slice 9: the vision decomposer

## Problem statement

`agents/planning/vision-decomposer.md` is 37,496 bytes and was dispatched 4 times in the seven
recorded weeks (3 in September, 1 in October; **read**), about 0.6 a week. At the pilot's ratio the
compaction removes about 12,600 bytes, about 7,200 bytes or 2,500 tokens a week (**derived**). It
has no method file. Fixed means: compacted by the rollout's method (the index), every order kept
and checked, at most its new ceiling, and no worse than the original on its smoke check.

## Technical approach

### What is compacted

Only the agent file; baseline at `tests/compaction-eval/vision-decomposer/baseline-agent.md`.

### What leaves, and what stays (by heading, **read**; byte sizes per section are measured at Step 9)

- **Leaves:** the history and reasons in `## Methodology: Vision to Goals to Activities to Stories`
  (the method's origin; its steps stay), `## References`, `## Tools Used` (a description of the
  grant), the second copy of each output template that Phases 1 to 3 and `## Output` both carry, and
  examples beyond five across Phase 3b and `## Handling Edge Cases`.
- **Stays, every order:** the v7 principles, the Pre-Decomposition Gate, Phases 0 to 8 with their
  limits (two to four goals, two to three activities per goal, two to five stories per activity),
  the story-splitting patterns (reference the agent applies), the dependency and ordering rules, the
  self-validation checklist, the stub format with `parent_vision` as a stage-prefixed path, the human
  checkpoint, the hand-off to the product owner, the edge cases' rules, the anti-patterns' rules,
  `## Writing topics to the streaming store`, `## Deterministic core — use the library, never
  re-implement`, the shared searching rule and `## Honest status (shared rule)` word for word.

### Pins (read only)

| Pin | Where it is held |
|---|---|
| the topics contract the Build-flow path writes (its keys and shape) | `tests/streaming-render.test.js` (four references; Step 9 reads exactly which literals) |
| zero unexecutable-order findings (the file is on the fence's fixed list of files that must stay clean) | `tests/unexecutable-instruction-fence.test.js` |
| frontmatter byte for byte (`tools: Read, Write, AskUserQuestion, Edit, Grep, Glob`) | `tests/agent-tool-grants.test.js` |
| other named readers | `tests/architecture-invariants.test.js`, `tests/corpus-audit-ledger.test.js` |
| honest status, discipline words, gate words, compliance claims, peer dispatch | the fences named in the index |

### Size

Expected after: about 24,900 bytes. `maxBytes` is the achieved size and may only fall.

### Smoke check (three fixtures, six runs)

- **Mode:** scratch. The decomposer writes functional stubs, so each run works in a copy outside the
  repository.
- **Path exercised:** the decomposition of a vision plan into functional stubs (the `decompose` WORK
  action in `src/commands/start.md`), which holds most of the file's orders. The Build-flow topics
  path is guarded by the inventory, the review and `tests/streaming-render.test.js`.
- **The human checkpoint in print mode:** the agent holds `AskUserQuestion`, which a print-mode run
  cannot answer, so a run may stop at Phase 8 before writing stubs. The adapter accepts the
  decomposition from either place: the stubs written under `plans/functional/`, or, when the run
  stopped at the checkpoint, the decomposition in its final message. Both versions meet the same
  condition, and the record states which happened.
- **Brief:** copied at Step 8 from the `decompose` WORK dispatch, naming the fixture's vision plan.
- **Contract adapter (`contract.js`):** valid when a decomposition was produced in either place —
  goals, activities and stories identifiable by the baseline's own template headings (copied at
  Step 8) — or, when the gate refused, no stub was written; and every stub written has frontmatter
  that parses with `parent_vision` set. Findings: `gate-refused` (normal) when no stub is written
  and the missing element is named; `order-respected` (normal) when the stub that needs another's
  data lists it in `depends_on`, or the decomposition orders them so; `question-raised` (important)
  for any question or needs-input status other than the checkpoint's own question, which is the
  agent's normal flow (its wording copied from the baseline at Step 8).

| # | Fixture (a vision plan) | What it holds | Rule most at risk | Counts as found when |
|---|---|---|---|---|
| 1 | `vision-without-a-problem` | an outcome but no problem statement and no user | the Pre-Decomposition Gate, whose reasons are cut | `gate-refused` present |
| 2 | `report-needs-imported-data` | a report story that needs the import story's data | Phase 4, dependency ordering, whose templates are merged | `order-respected` present |
| 3 | `clean-two-goal-vision` | a well-formed vision, two goals | — | clean: `question-raised` absent |

**The clean fixture is verified before any run** (Step 8): `iron-loop-critic` reads the vision for any
defect of severity important or higher — a missing problem statement, an unmeasurable outcome, a
goal count outside the limits; whatever it finds is fixed in the fixture and recorded.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the compacted decomposer | the `decompose` WORK dispatch and the Build-flow idea submit in `src/commands/start.md` | the owner's decompose action and idea submit in `/ctoc:start` |
| `contract.js` | `tests/vision-decomposer-compaction.test.js`; `score.js` at Step 14 | `npm test`; the session's Step 14 run |

### Security review

Every order the baseline gives about where the decomposer writes is in the inventory with anchors.
Fixtures hold no credential-shaped string; runs happen in a scratch copy.

### Conflicts with other plans

- This slice builds before `plans/todo/00301-…-s41-vision-decomposer.md` (decision 3 below); that
  slice must be re-planned against the compacted text, inside this file's `maxBytes` and keeping
  every inventoried anchor.
- `plans/todo/dispatched-agents-route-their-questions-to-the-session.md` (approved) edits this
  file; both orders work, and if it builds first the baseline is its result.
- `plans/review/00110-agents-told-to-run-code-they-cannot-run.md` is built; its text is in the
  baseline.

## Acceptance criteria

1. The baseline is committed with its sha256 and commit in the inventory.
2. Every unit is classified; every order is anchored from the original, each anchor unique;
   `tests/vision-decomposer-compaction.test.js` passes the ten inventory checks and the adapter's
   cases; the order floor in the test is the count at extraction.
3. Every pin stands; every named test and fence passes unchanged.
4. The file is at most `maxBytes` (the achieved size); expected about 24,900 bytes; a miss is
   reported with its reason and no order dropped.
5. One copy of each template remains; at most five examples remain.
6. The clean fixture was verified before any run; the smoke check ran (six runs plus any
   one-fixture rerun) with verdict PASS, recorded with the low-power statement and what the runs
   did at the human checkpoint; the median tokens and duration per version are recorded.
7. The `RESULTS.md` section is written in the index's shape.
8. `CLAUDE.md` and `README.md` show the true test-file count in this slice's worktree (the main
   session reconciles it at merge); `npm test` passes; the linter reports zero warnings.

## Decisions Taken Under Ambiguity

1. **The smoke check exercises the vision-to-stubs path**, which holds most of the orders; the
   topics path is guarded by its existing test and the inventory.
2. **The adapter reads the decomposition from the stubs or from the final message**, so a run that
   stops at the human checkpoint is still scored, the same way in both versions, at no extra run.
3. **Compaction goes first, before the approved "improved three times" slice on this agent
   (`00301`).** Decided by the CTO Chief, 2026-10-06: the owner's current priority is speed, and
   this file's size ceiling then forces later improvement rounds to stay compact instead of
   re-growing the agent. `00301` is re-planned against the compacted text.
4. **The smoke check is three fixtures — two planted defects most at risk from this compaction and
   one verified-clean plan — one run per version, six headless runs.** Decided by the CTO Chief,
   2026-10-06: the pilot proved the method and the owner asked for cheap benchmarks. The rule
   inventory and the side-by-side review of every cut unit remain the main guard.

## Execution Plan

### Step 8: TEST
- [ ] Confirm the pilot and slice 0 are done and the agent file has no uncommitted change; copy the baseline; record sha256 and commit.
- [ ] Write `tests/vision-decomposer-compaction.test.js` (with adapter cases for both forms: stubs written, and a decomposition in the final message), the three fixtures, `expectations.json` with its matchers, and the brief.
- [ ] Verify the clean fixture: dispatch `iron-loop-critic` to read it for any defect of important or higher; fix and record.
- [ ] Run the test; expect RED; record the failing lines.

### Step 9: PREPARE
- [ ] Re-read every pin and reader, recording what `tests/streaming-render.test.js` holds; measure section sizes with `units.js`.
- [ ] Confirm `00301` has not built (this slice goes first); check whether the question-routing plan has built and, if so, record that the baseline is its result.

### Step 10: IMPLEMENT
- [ ] `contract.js`; label every unit in `rule-inventory.json`.
- [ ] Compact by hand in the original section order; set `maxBytes`; the test GREEN.
- [ ] `CLAUDE.md` (two places) and `README.md`: the test-file count; run every fence in the pin table.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` with the baseline, the compacted agent and the inventory: every `cut` unit read side by side with the original, every `merged` order (the templates above all), tightened orders for changed meaning.

### Step 12: OPTIMIZE
- [ ] Remove any repeat the review found.

### Step 13: SECURE
- [ ] Dispatch `security-scanner`: the write-location orders present with their anchors; fixtures clean.

### Step 14: VERIFY
- [ ] `npm test`: fail 0, skipped 0, coverage at or above the floor; the linter: zero warnings.
- [ ] The session runs the smoke check (scratch mode): six runs, scoring, a one-fixture rerun only where a fixture shows a shortfall, cleaning.
- [ ] Record the results, the median tokens and duration per version in this plan; append the section to `.ctoc/audit/speed-and-size/benchmarks/RESULTS.md`.
- [ ] On a confirmed FAIL: back to Step 10.

### Step 15: DOCUMENT
- [ ] The execution record: one line per group moved out; the same summary in the commit message.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full: one phase before and after, the inventory counts, the smoke-check table, the size and token numbers.
- [ ] Dispatch `iron-loop-critic` against the acceptance criteria; hand the result to the owner for the OK to call it done.


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
