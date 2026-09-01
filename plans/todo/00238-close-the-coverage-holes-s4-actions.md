---
iron_loop_verdict: true
title: "Close the dark ranges in the plan-operations module (actions.js)"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/actions-coverage-holes.test.js
  - src/lib/actions.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.553Z
gate_crossed: implementation → todo
---

# Close the dark ranges in the plan-operations module

**Scope (one line):** classify every uncovered range in `src/lib/actions.js` and write a
behavioural test for each reachable one — the module that creates, moves and approves plans is
the largest single hole in the long tail (63 lines).

## Implementation Details

### Target

`src/lib/actions.js` — measured **97.47 %** on 2026-08-31. Uncovered ranges as reported by the
gate on that date:

`56-58` · `150-151` · `185-187` · `202-203` · `236-252` · `514-515` · `562` · `596-598` ·
`762-763` · `777-778` · `1069-1073` · `1138` and beyond.

**The tail beyond 1138 was not enumerated in the measurement handed to the planner and the
planner did not read it.** Step 9 PREPARE re-derives the complete list from the gate's own
report; the list above is a starting map, not the specification.

### What the planner verified

Read this session: `src/lib/actions.js` lines 225-264 only. In that window, **236-252 is
`logPlanIndexError(root, source, err)`** — a best-effort writer to
`.ctoc/logs/plan-index-sync.json` that never throws: it creates the log directory, reads and
re-parses an existing log (with its own inner catch resetting to `[]`), pushes a timestamped
entry, caps the log at 500 entries, and writes it back. Its own outer catch (249-251) swallows
everything.

Every other range in this file is **unread by the planner**. Do not treat the parent plan's
prose or this file as knowledge about them: read the code.

### The classification rule (from the approved parent plan, section 4)

For each uncovered range, classify it as exactly one of:

- **(a) reachable behaviour** → write a behavioural test that a mutation would break.
- **(b) permission-gated or terminal-only** → leave it, and NAME it in the test file's header
  with the reason. A permission-gated case that cannot run must announce a LOUD skip with a
  printed reason, never a silent no-op.
- **(c) dead** → report it in this plan's `## Decisions Taken Under Ambiguity` and at Step 16.
  **Do not delete it.** Deletion needs its own plan and a reachability-baseline update.

### The dominant seam in this module

`actions.js` uses `safeFs` for its filesystem work and `require`s siblings for plan indexing.
Two boundaries, both real, both already used elsewhere in this suite:

```js
// filesystem fault, guarded by a sentinel so only this case's path throws
const real = safeFs.writeFileSync;
t.mock.method(safeFs, 'writeFileSync', (p, d, o) => {
  if (String(p).includes('CTOC-FAULT-SENTINEL')) throw new Error('injected');
  return real(p, d, o);
});

// module-load fault (the pattern in tests/pretooluse-write-coverage.test.js)
const origLoad = Module._load; /* patch for one resolved filename; restore in finally */
```

For `logPlanIndexError` specifically: it is internal, so drive it through the caller that logs a
plan-index sync failure (find that caller at PREPARE by reading the call sites of
`logPlanIndexError` in the module). Assert the log FILE's content — a timestamped entry naming
the source and the message — not the return value; the function returns nothing. Also cover the
inner reset arm at 243 by planting an unparseable `plan-index-sync.json` first and asserting the
new log is a one-entry array (a mutant that keeps the corrupt value reds).

**Never mock the function under test.** Every fault is injected at `safeFs`, at the module
loader, or by the fixture's own on-disk state.

### Fixtures

A real project tree under `os.tmpdir()` (`fs.mkdtempSync`) with `plans/<stage>/` directories and
`.ctoc/`, removed in `after`. Never operate on the repository's own `plans/` tree — a test that
moves a real plan would cross a human gate.

### Wiring — the live call sites

No module is added. `src/lib/actions.js` is already live: `src/commands/start.js` and the tab
modules call its plan operations. The new test file is reached by the gated suite (`npm test` →
`src/scripts/test-gate.js`).

### Security review

- No plan is moved or approved outside the temp fixture; no approval marker or ledger entry is
  written anywhere real.
- No secret in a fixture; no absolute path or error text from the host in an assertion message.
- All paths via `path.join`; no shell.

## Test Plan (TDD-Red first)

- One `it` per reachable range, named for the behaviour and the mutation it kills — never
  "covers line N".
- `logPlanIndexError` gets at least three: the happy append, the corrupt-log reset, and the
  500-entry cap boundary (a mutant widening the slice reds it).
- Every case is RED before the change (every range is uncovered today). A case GREEN on the
  first run means the map is stale: account for it at Step 11 and say so.
- Ranges classified (b) or (c) get no test — they get a header line each, with the reason.

## Decisions Taken Under Ambiguity

1. **`src/lib/actions.js` is declared in `files:` but no source change is intended.** The
   declaration exists so that a defect this slice exposes can be fixed in the same unit of work
   rather than through a quiet edit elsewhere. Any fix must be recorded here with what failed
   and why the code — not the test — was wrong.
2. **The unenumerated tail beyond line 1138 is re-derived, not guessed.** The planner did not
   read it and does not pretend to have.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/actions-coverage-holes.test.js` with one named case per reachable range. Run
`node --test tests/actions-coverage-holes.test.js` and record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive `src/lib/actions.js`'s complete uncovered-line list (including the
tail beyond 1138). Read every range in the current code, note the enclosing function, and write
the (a)/(b)/(c) classification into the test file's header before writing any assertion.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builder.
- Sub-item 2: the reachable cases, boundary-injected.
- Sub-item 3: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored. Account for every case that was GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder, one mock helper. No sleeps, no retries.

### Step 13: SECURE
Nothing written outside the temp fixture; no shell; no secret; no host path in a message.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record `src/lib/actions.js`'s new percentage.

### Step 15: DOCUMENT
The header lists every previously-uncovered range and its disposition, so the next reader can
tell "tested" from "deliberately left" from "unreachable" without re-deriving it.

### Step 16: FINAL-REVIEW
Report: the file's coverage before and after; every range left as permission-gated or dead, with
its reason; and any real defect the new tests exposed.


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
