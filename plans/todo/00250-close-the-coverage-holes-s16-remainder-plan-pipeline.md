---
iron_loop_verdict: true
title: "Remainder: the plan pipeline, plan state and the plan index"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-plan-pipeline-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.394Z
gate_crossed: implementation → todo
---

# Remainder: the plan pipeline, plan state and the plan index

**Scope (one line):** classify and cover the small dark ranges in the fourteen modules that
parse, validate, migrate and index plans.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/migration-safety-checker.js` | 952-953 · 1030-1031 · 1053-1054 · 1061-1062 · 1220-1221 |
| `src/lib/plan-validator.js` | 243-245 · 1124-1125 |
| `src/lib/project-root.js` | 169-179 |
| `src/lib/collapse-stacked-frontmatter.js` | 58-63 · 166-167 |
| `src/lib/frontmatter-merge.js` | 188-193 |
| `src/lib/state.js` | 147 · 150-151 |
| `src/lib/documented-counts.js` | 165-166 |
| `src/lib/traceability-matrix.js` | 64-65 · 201 |
| `src/lib/task-registry.js` | 578 |
| `src/lib/plan-index/conflict-detect.js` | 119-120 · 174-175 |
| `src/lib/plan-index/store.js` | 386-388 |
| `src/lib/plan-index/search.js` | 327-328 |
| `src/lib/plan-index/fusion.js` | 78 |
| `src/lib/plan-index/ollama-client.js` | 44-46 |

**The planner read only one of these: `src/lib/documented-counts.js` in full.** Its 165-166 is the
catch inside `checkPlanDeclaresCountMovers` that sets `counts = null` when `computeDocCounts`
throws — the fail-soft arm that yields a `null` count rather than throwing out of a validation
gate. Its assertion is therefore precise: with `computeDocCounts` made to throw, an offender is
still reported, with `currentCount: null` — **`null`, not `0`**, because nothing was counted.

Every other range in the table is unread by the planner. Step 9 PREPARE reads each one; where the
code disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The rule that applies to this family specifically

**A count or a verdict that could not be established is `null`, never `0`, and "could not read" is
never "found nothing".** Several ranges here are the arms that carry that distinction
(`documented-counts` 165-166 is a confirmed one). Where a case covers such an arm, assert the
`null`/unreadable value explicitly — an assertion that only checks "did not throw" lets the two
collapse, which is the false-green shape this repository fences.

Two further constraints:

- **`plan-index/ollama-client.js` must never reach the network in the suite.** Its 44-46 is
  likely a connection-failure arm; drive it against a closed local port or an injected client
  error, never a real endpoint, and assert the fail-soft value. If it cannot be covered without a
  request, report the range as uncovered with that reason — a fetching suite is worse than a dark
  line.
- **No case may move, approve or edit a real plan.** Every fixture is a temp project under
  `os.tmpdir()`; the repository's `plans/` tree is read-only to this slice, and nothing under
  `.ctoc/approvals/` is written at all.

### Seams

- Fixture-first: a temp project with plan files of the exact shape that triggers a branch
  (stacked frontmatter, a malformed `files:` block, a duplicate number, a missing heading).
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Dependency faults: `t.mock.method` on a required module's exports object (for example
  `computeDocCounts` on `src/lib/doc-counts.js`), or a `Module._load` patch restored in `finally`.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All fourteen are live: the validator runs at the queue transition, the state
and frontmatter modules are read by every plan operation, `documented-counts` is called by
`plan-validator.validateForQueue`, and the plan-index modules are driven by the index sync hook
and the duplicate guard. The new test file is reached by the gated suite.

### Security review

- No plan is moved or approved outside a temp fixture; no approval marker and no ledger entry is
  written anywhere real.
- No network request from `ollama-client` cases.
- No secret in a fixture; no host path in an assertion message; no shell.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour — for example
  `an unreadable component count is reported as null, never 0 — a null count means nobody counted`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended, and declaring
   fourteen modules would make the write permission far broader than the work. A defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **Grouped by family, one test file** — these fourteen are one subject: how a plan is read,
   checked and indexed.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-plan-pipeline-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all fourteen files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Confirm whether the `ollama-client` range can be reached offline.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders (per plan shape).
- Sub-item 2: the (a) cases, fixture-driven, with boundary mocks only where a real fault is
  required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function under
test mocked; every mock restored; no real plan touched. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
Shared fixture helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm no network request was made; confirm the repository's `plans/` and `.ctoc/approvals/` are
unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the fourteen
files.

### Step 15: DOCUMENT
The header names every range and its disposition.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any arm found to
report `0` where it meant "could not count".


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
