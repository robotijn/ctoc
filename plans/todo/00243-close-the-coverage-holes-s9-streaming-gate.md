---
iron_loop_verdict: true
title: "A sufficiency predicate that could not run is IGNORANCE, not sufficiency"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/streaming-gate-coverage-holes.test.js
  - src/lib/streaming-gate.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.698Z
gate_crossed: implementation → todo
---

# A sufficiency predicate that could not run is IGNORANCE, not sufficiency

**Scope (one line):** cover the dark ranges of `src/lib/streaming-gate.js`, starting with the
fail-closed arm of `sufficiencyFor` — the predicate whose verdict decides whether a plan crosses
a pre-build moment without a human.

## Implementation Details

### Target and ranges

`src/lib/streaming-gate.js` — measured **98.71 %** on 2026-08-31. Uncovered:
`381-382` · `471-476` · `496-498` · `628-629` · `823` · `1297-1298` · `1610-1611` · `1632-1633` ·
`1658-1659`.

### What the planner verified (read this session: lines 465-502)

`sufficiencyFor(root, ref)` builds a `closed(reason)` result — **471-476** — carrying
`enough: false`, empty id lists, `computed: null` (never `0`, because a predicate that could not
run knows neither the denominator nor the answered set) and `unboundAnswers: 0`. It returns
`closed('unavailable')` when `root` is not a non-empty string (line 478) and again from its catch
at **496-498** when `require('./streaming-precompute')` or `hasEnoughInformation` throws.

`471-476` being dark means `closed(...)` is never invoked in any test today — so neither the
guard path nor the fault path is exercised, and the whole "could not run" verdict is unverified.

Every other range in this file is **unread by the planner**. Read the code at Step 9.

### Seams — exact

- **471-476 via the guard:** call `sufficiencyFor(null, 'implementation/x.md')` and
  `sufficiencyFor('', ref)`. Assert the FULL shape, and specifically `computed === null` — not
  `0`. `computed: 0` would mean "we counted, there were none", which is the false-green reading
  the evidence composer renders as `unknown`. This case needs no mock at all.
- **496-498 via the catch:** patch `Module._load` for the resolved
  `src/lib/streaming-precompute.js` so the in-function `require` throws, restore in `finally`
  (the pattern in `tests/pretooluse-write-coverage.test.js`). Assert the same closed shape with
  `reason: 'unavailable'`. A mutant returning `enough: true` here would auto-cross a plan on a
  read error — that is what this case kills.
- If `sufficiencyFor` is not exported, reach it through its live caller (the sufficiency-crossing
  path) and assert the composed evidence string instead; confirm at Step 9 and say in the header
  which surface the case drives.
- The remaining ranges: classify at Step 9 and prefer fixture-driven cases (a questions file with
  a known shape) over mocks.

### The evidence contract this module must keep

The crossing record states the DENOMINATOR, not just the numerator: `<N> question(s) computed,
<M> answered …`, where a count that could not be established renders `unknown` and a genuine zero
renders the explicit phrase `no questions were computed`. If any new case touches the evidence
composer, it must assert those three renderings stay distinct. Never assert a shape that
collapses `unknown` into `0`.

### Wiring — the live call sites

No module is added. `src/lib/streaming-gate.js` is live in the pre-build crossing path and in the
menu screens. The new test file is reached by the gated suite.

### Security review

- Question ids and reasons are producer-authored and untrusted; the module strips control
  characters before they reach a record. A case should feed an id containing a control character
  and a terminal escape and assert it does not survive into the output.
- Fixtures under `os.tmpdir()`, removed in `after`; no secret; no shell.

## Test Plan (TDD-Red first)

- `sufficiencyFor with an unusable root returns enough:false with computed:null (never 0 — "could not count" is not "counted none")`
- `sufficiencyFor whose predicate module fails to load returns enough:false, unavailable — a read error must never auto-cross a plan`
- one case per remaining reachable range, named for its behaviour.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **`src/lib/streaming-gate.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here, recorded with what failed
   and why the code was wrong.
2. **`computed: null` is asserted explicitly in every closed case.** It is the single field that
   separates ignorance from a clean empty result, and an assertion that omitted it would let the
   two collapse.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/streaming-gate-coverage-holes.test.js` with the named cases. Run it; record every
case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read every range and classify it.
Confirm whether `sufficiencyFor` is exported and, if not, which live caller the cases drive.

### Step 10: IMPLEMENT
- Sub-item 1: the two `sufficiencyFor` cases (guard and loader fault).
- Sub-item 2: the remaining reachable cases, fixture-driven where possible.
- Sub-item 3: the control-character case for the untrusted-id path.
- Sub-item 4: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every loader patch restored. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder; one loader-patch helper. No sleeps, no retries.

### Step 13: SECURE
No untrusted text reaches an assertion message unstripped; nothing written outside
`os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states why `computed: null` matters and what a mutation of it would cause.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any path found where a
predicate fault could read as sufficiency.


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
