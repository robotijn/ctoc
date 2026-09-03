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

## Execution Record

**Files written (all three declared; nothing else touched).**

- `tests/iron-loop-enforcer-coverage-holes.test.js` — NEW, 16 cases in 7 groups.
- `CLAUDE.md` — the documented test-file count only, 539 → 540 (two places: the
  `node --test` line and the architecture tree). Required because a new file in a
  counted class moves that count and `tests/doc-counts.test.js` enforces it.
- `src/lib/iron-loop-enforcer.js` — **NOT CHANGED.** It was declared so a defect this
  slice exposed could be fixed in the same unit of work. No test exposed a defect that
  needed a code change, so the file is byte-identical to its committed state
  (sha256 `63cbcbc3b3b2671165152331d907c0293570aa05becf57179efee3f7b742af34`,
  verified before and after every mutation run below).

**Step 9 PREPARE — the range map re-derived from the gate, not from this plan.** A
full `npm test` was run BEFORE any change. It reported `src/lib/iron-loop-enforcer.js`
at **96.94 %** with ten uncovered ranges:

`480-481 · 851-854 · 859-863 · 971-977 · 1026-1027 · 1032-1037 · 1075-1079 ·
1088-1092 · 1096-1099 · 1233-1237`

This differs from the map in this plan's own text in two ways, and the gate's report
is the source of truth: `908-912` was reported COVERED by that run (the plan lists it),
and `1233-1237` is present (the plan does not list it). Every range was read in the
source and classified. **All ten are (a) reachable.** None is (b) permission-gated or
terminal-only; none is (c) dead. The full map, with the enclosing check and the mode
that reaches it, is the header of the new test file.

**Step 10 IMPLEMENT — one shared temp-project builder, fixtures only, no mocks.**
Every case builds a real project under `os.tmpdir()` and removes it in `afterEach`. No
function under test is stubbed and no boundary fake was needed: every arm is reachable
with a file on disk. No baseline in this repository is read for mutation or written,
and **no entry was added to any real baseline** — the one move the parent plan forbids
outright.

**Step 8 TEST — every case was GREEN on its first run, and none is banked.** This
slice adds no behaviour; it makes existing dark behaviour asserted, so "red first" here
means proving each case can go red. Red provenance was established by MUTATION: the arm
each case names was flipped in `src/lib/iron-loop-enforcer.js`, the test file was run as
a child process, and the file was restored from the original bytes with its sha256
re-verified. **Eleven mutants, ten killed by exactly the case that names them** (and by
no other case). The eleventh is the finding below.

**Step 11 REVIEW.** No existing test file was opened for edit; no assertion anywhere was
weakened; no case deleted. The two neighbouring enforcer test files are untouched, and
the live-repo case in `tests/iron-loop-enforcer.test.js` asserts exactly what it did
before. Six of the sixteen new cases are deliberate CONTRAST guards (the same fixture
with the fault removed must be SILENT) — without them a fence that ignored its baseline
entirely would pass the fault cases.

**Step 12 OPTIMIZE.** One `mkTmp`/`write`/`findingById` trio shared by every case; no
sleeps, no retries, no cached enforcer result between cases (a cached run is a check
that did not run). The whole file runs in ~150 ms.

**Step 13 SECURE.** Nothing is written outside the temp fixture; no shell; no secret; no
host path in an assertion message. The mutation harness wrote only to the one declared
source file and restored it byte-for-byte.

**Step 15 DOCUMENT.** The test file header carries the complete range map — every
previously-uncovered range, its disposition, the check that owns it and the mode that
reaches it — plus the two findings below.

## Decisions Taken During Execution

1. **An eleventh range, `908-912`, was covered although the pre-change gate run
   reported it as already covered.** That is `checkReachabilityFence`'s
   unreadable-baseline arm. It was reported COVERED by the run that opened this slice
   and UNCOVERED by the next run over byte-identical source, so some other test in the
   suite reaches it only incidentally. An arm whose entire subject is fail-closed
   reporting must not depend on that, so it is now pinned deterministically by two
   cases here (block on the baseline, not on the orphan; and the contrast). This is
   inside the plan's stated target — the plan's own text names `908-912`.
2. **The malformed-baseline cases were rewritten after the first mutation run.** The
   obvious fixture (a baseline that is simply not JSON) asserts a true contract but does
   NOT pin `excused.clear()`: `JSON.parse` is the first statement in the `try`, so
   nothing has been added when it throws and the clear has nothing to clear. The mutant
   removing it SURVIVED. The case now uses the only shape that reaches the line with
   something to drop — `{"debt":["…"],"exemptions":{}}`, which parses, adds the key, then
   throws on the non-iterable second loop — and the mutant is killed. Both shapes are
   asserted; the unparseable one is annotated for what it actually pins.
3. **No source change was made.** Decision 1 of this plan anticipated one only if a test
   exposed a defect. The one thing a test exposed is a dead defensive line (below), and
   the parent plan's Decision 2 says a dead range is reported, never deleted.

### Findings for the human

1. **`excused.clear()` in `checkGoldenCorpusFence` cannot change any verdict — it is a
   defensive no-op.** Its `try` adds keys from `parsed.findings` and then calls
   `Object.keys(parsed.exemptions || {})`, and `Object.keys` never throws for a JSON
   value. So no input exists that adds a key and then throws, which is the only way the
   clear could remove one. Verified by exhaustive probe over the JSON value kinds
   (`{}`, `0`, `1`, `"ab"`, `[]`, `null`, `true`) and confirmed by mutation: deleting the
   line kills no test. Its sibling in `checkUnexecutableInstructionFence` is genuinely
   load-bearing (its second loop is a `for…of`, which does throw on a non-iterable). The
   line is REPORTED, not removed — deletion is the human's call and needs its own plan.
   The fence's real fail-closed behaviour is unaffected and is asserted here: an
   unparseable golden-corpus baseline still blocks, via the `try`/`catch` itself.
2. **Coverage attribution for `checkReachabilityFence`'s unreadable-baseline arm was
   unstable across two gated runs of identical source** (covered, then uncovered). No
   test in the suite targets that arm by name, so whatever reached it did so
   incidentally. This slice removes the exposure by pinning the arm directly, but the
   instability itself is a signal about some other test and is not chased here.

## Verification Evidence

**Step 14 VERIFY — `npm test` from the repository root** (the only run that enforces the
coverage floor and the zero-skipped gate), captured to a file and read from its last
lines. No pipe that could hide the exit status.

```
[CTOC test-gate] coverage 99.81% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
EXIT=0
```

- tests 11924 · pass 11924 · **fail 0** · **skipped 0** · cancelled 0 · todo 0.
- Whole-repository line coverage **99.75 % → 99.81 %** (floor 99, untouched).
- **`src/lib/iron-loop-enforcer.js`: 96.94 % → 100.00 % lines, zero uncovered ranges**
  (branch 89.61 % → 91.39 %, function 94.67 % → 100.00 %).
- Lint: `npx eslint tests/iron-loop-enforcer-coverage-holes.test.js --max-warnings 0`
  clean. Type check runs inside the gated suite (`tests/typecheck.test.js`) and passed
  with it.
- `.ctoc/coverage-baseline.json` was NOT touched. Raising the floor is slice 20's
  question for the human, not this slice's.
