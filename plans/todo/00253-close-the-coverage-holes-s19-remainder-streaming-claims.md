---
iron_loop_verdict: true
title: "Remainder: the streaming store, the continuation state, the inbox and the claim fetcher"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-streaming-claims-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.489Z
gate_crossed: implementation → todo
---

# Remainder: the streaming store, the continuation state, the inbox and the claim fetcher

**Scope (one line):** classify and cover the small dark ranges in the twelve modules behind the
questions store, the build-continuation state, the inbox surfaces and the citation fetcher.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/claim-fetcher.js` | 233-237 · 254-257 · 531-533 · 553-554 |
| `src/lib/streaming-render.js` | 297-303 |
| `src/lib/sufficiency-audit.js` | 221-225 |
| `src/lib/increment-feed.js` | 83-84 · 92-93 |
| `src/lib/inbox.js` | 119-120 |
| `src/lib/continuation.js` | 84-85 |
| `src/lib/stale-cleanup.js` | 189-190 |
| `src/lib/state-manager.js` | 51-52 |
| `src/lib/ledger-backfill.js` | 218-219 |
| `src/lib/corpus-claims.js` | 44-45 |
| `src/lib/streaming-precompute.js` | 687 |
| `src/tabs/vision.js` | 182 |

**The planner did not read any of these twelve files.** The table is the measurement handed to the
planner, not an analysis. Step 9 PREPARE re-derives the ranges and reads each one; where the code
disagrees with this plan, the code wins and the drift is reported.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

### The four rules that apply to this family specifically

1. **`claim-fetcher.js` is the network module. The gated suite performs NO network access.** Every
   case must use the module's own offline seam (`noNetwork`, an injected fetcher, a closed
   loopback port) — read the module's options at Step 9. If a range cannot be reached offline,
   report it as uncovered with that reason. A fetching suite is a worse outcome than a dark line,
   and this is not a trade the executor may make.
2. **The streaming store is agent-write-denied and a questions file is a believed artifact.** No
   case may write into the repository's `.ctoc/streaming/`. Fixtures only, under `os.tmpdir()`.
3. **A renderer that consumes a persisted contract is driven against the CAPTURED REAL sample**
   in `tests/fixtures/golden-corpus/`, never an invented one. The precedent is recorded: a
   decision-matrix renderer passed four synthetic tests while the human's screen was still
   unreadable, because the real file carries option fields over a thousand characters long. If a
   `streaming-render.js` case renders anything, it renders the real sample. Captures are never
   shortened or redacted — redaction is sanitisation, the exact defect.
4. **`stale-cleanup.js` deletes things.** No case may delete anything outside its temp fixture, and
   the suite must assert the repository's `plans/` tree is unchanged afterwards.

### Seams

- Fixture-first: a temp project with a questions store, a continuation state file, an inbox and a
  small ledger, seeded per case.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel — several of these ranges are
  two-line read-failure arms, which this seam reaches directly.
- Dependency faults: `Module._load` patched for one resolved filename, restored in `finally`.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All twelve are live: the questions store is read by `/ctoc:start` and written
by the precompute path, the continuation state is consumed by the Stop hook, the inbox and the
vision tab are dashboard surfaces, and the claim fetcher is called by
`src/scripts/verify-claims.js`. The new test file is reached by the gated suite.

### Security review

- **No network request from any case.**
- Nothing written into `.ctoc/streaming/`, `.ctoc/approvals/` or `.ctoc/state/verify/` in the
  repository — all three are agent-write-denied for good reason, and a test is not an exception.
- Question ids and option text are producer-authored and untrusted: a case should feed a control
  character and a terminal escape and assert neither survives into rendered output.
- Nothing deleted outside `os.tmpdir()`; no secret; no shell; no host path in an assertion
  message.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `an unreadable questions file is reported as unreadable, never as "no questions"`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **Offline or not at all** for the claim fetcher; the range is reported uncovered rather than
   the suite made to fetch.
3. **Grouped by family, one test file** — these twelve are one subject: what the human is shown
   between builds, and the state behind it.
4. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-streaming-claims-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the uncovered ranges for all twelve files. Read every range and write
the (a)/(b)/(c) classification, with the enclosing function, into the header before asserting
anything. Read `src/lib/claim-fetcher.js`'s offline options and confirm which ranges are reachable
without a request. Read `tests/real-question-file-render.test.js` and the golden-corpus manifest
for the render precedent, and modify neither.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders (questions store, continuation state, inbox,
  ledger).
- Sub-item 2: the (a) cases, fixture-driven, with sentinel-guarded faults where required.
- Sub-item 3: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function under
test mocked; every mock restored; no write into any agent-write-denied directory. Account for
every case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm no network request; confirm `.ctoc/streaming/`, `.ctoc/approvals/`, `.ctoc/state/verify/`
and `plans/` in the repository are unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the twelve
files.

### Step 15: DOCUMENT
The header names every range and its disposition, and states plainly that this file performs no
network access and writes into no protected directory.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; every range left, with its reason; any range left
uncovered because covering it would have meant fetching (named, with the reason).


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
