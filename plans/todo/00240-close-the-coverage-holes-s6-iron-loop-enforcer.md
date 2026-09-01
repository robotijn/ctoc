---
iron_loop_verdict: true
title: "Close the dark ranges in the self-check enforcer"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/iron-loop-enforcer-coverage-holes.test.js
  - src/lib/iron-loop-enforcer.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.613Z
gate_crossed: implementation → todo
---

# Close the dark ranges in the self-check enforcer

**Scope (one line):** classify every uncovered range in `src/lib/iron-loop-enforcer.js` — the
module that runs the fences (false-green, reachability, agent-honesty, unexecutable-instruction,
golden-corpus, claim-census) — and write a behavioural test for each reachable one.

## Implementation Details

### Target

`src/lib/iron-loop-enforcer.js` — measured **96.60 %** on 2026-08-31. Uncovered ranges as
reported by the gate on that date:

`480-481` · `851-854` · `859-863` · `908-912` · `971-977` · `1026-1027` · `1032-1037` ·
`1075-1079` · `1088-1092` · `1096-1099` and beyond.

Step 9 PREPARE re-derives the complete list from the gate's own report.

### What the planner verified

Read this session: lines 845-874 only. In that window:

- **850-854** is the malformed-baseline catch of the unexecutable-instruction check: on a
  `JSON.parse` failure it calls `excused.clear()`, so **a malformed baseline excuses NOTHING and
  every finding blocks**. That is the load-bearing behaviour and it is dark today.
- **859-865** is the block-severity finding it returns when fresh findings remain, including the
  first-ten summary and the `+N more` suffix.

Every other range in this file is **unread by the planner**. Read the code.

### The one seam this file mostly needs: on-disk state, not mocks

The enforcer's checks read baselines and walk the tree. Most dark arms are reachable with a
FIXTURE, no mock at all:

- a malformed `.ctoc/unexecutable-instruction-baseline.json` (invalid JSON) → assert the check
  returns a **block** finding even though the baseline nominally excuses the key. A mutant that
  kept partially-parsed keys, or that treated an unreadable baseline as "all clear", reds here.
  This is the same fail-closed family as the coverage gate's `resolveThreshold`.
- a baseline whose `debt` or `exemptions` entries are the wrong shape (non-string key, missing
  `key`) → assert they excuse nothing.
- more than ten fresh findings → assert the summary lists exactly ten keys and ends with
  `+N more` (a mutant widening the slice reds it).

Where a fault genuinely must be injected (an unreadable directory, a throwing walk), inject at
`safeFs` with a path sentinel, never on the check under test.

Several checks are **thorough-mode only** (they walk the whole tree). Call
`checkAllInvariants({ root: fixture, mode: 'thorough' })` for those and `mode: 'fast'` for the
rest; a range that only runs in one mode is not dark, it is mode-gated — say which mode reaches
it in the header.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### Fixtures

A temp project under `os.tmpdir()` with the `.ctoc/` baselines the check under test reads,
removed in `after`. Never point the enforcer at the repository root in a way that writes to it.

### Wiring — the live call sites

No module is added. `src/lib/iron-loop-enforcer.js` is live: `src/hooks/SessionStart.js` calls
`checkAllInvariants({ mode: 'fast' })` on every session start (verified this session at
SessionStart.js lines 161-168), and the Tools screen runs it on demand. The new test file is
reached by the gated suite.

### Security review

- No baseline in the repository is written or read for mutation; every baseline under test is a
  fixture copy under `os.tmpdir()`.
- **No new whitelist or exemption entry is added to any real baseline** — that is the one move
  this plan forbids outright.
- No secret in a fixture; no host path in an assertion message; no shell.

## Test Plan (TDD-Red first)

- One `it` per reachable range, named for the behaviour and the mutation it kills — for example
  `a malformed unexecutable-instruction baseline excuses NOTHING (an unreadable ledger must never read as all clear)`.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Ranges classified (b) or (c) get a header line each, with the reason.

## Decisions Taken Under Ambiguity

1. **`src/lib/iron-loop-enforcer.js` is declared in `files:` but no source change is intended** —
   the declaration exists so a defect this slice exposes can be fixed in the same unit of work,
   recorded here with what failed and why the code was wrong.
2. **Fixture baselines only.** A test that edited a real baseline would be the exact move the
   parent plan forbids, even transiently.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/iron-loop-enforcer-coverage-holes.test.js` with one named case per reachable range.
Run it and record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the complete uncovered-line list for this file. Read every range, note
the enclosing check and which mode (`fast` / `thorough`) reaches it, and write the (a)/(b)/(c)
classification into the header before asserting anything.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builder, with per-case baseline seeding.
- Sub-item 2: the reachable cases, mostly fixture-driven; boundary mocks only where a real fault
  is required.
- Sub-item 3: the header — every range covered, every range left, each with its reason and its
  mode.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no real baseline changed; no exemption added; no
check under test mocked; every mock restored. Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder shared across the cases. No sleeps, no retries — a thorough-mode walk over a
small fixture is fast; do not cache a result between cases (a cached run is a check that did not
run).

### Step 13: SECURE
Nothing written outside the temp fixture; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header lists every previously-uncovered range, its disposition and the mode that reaches it.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any fence whose fail-closed
arm did NOT behave as documented — that would be a finding about the fences themselves.


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
