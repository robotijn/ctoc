---
iron_loop_verdict: true
title: "Close the dark ranges in the quality agent"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: medium
files:
  - tests/quality-agent-coverage-holes.test.js
  - src/lib/quality-agent.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.581Z
gate_crossed: implementation → todo
---

# Close the dark ranges in the quality agent

**Scope (one line):** classify every uncovered range in `src/lib/quality-agent.js` — the module
that runs lint, typecheck and the test selection on every push — and write a behavioural test
for each reachable one.

## Implementation Details

### Target

`src/lib/quality-agent.js` — measured **96.59 %** on 2026-08-31. Uncovered ranges as reported by
the gate on that date:

`250-251` · `263-264` · `769-770` · `951-970` · `1062-1063` · `1208-1211` · `1502-1505` ·
`1697-1699` · `1714-1731` · `1749` and beyond.

**The tail beyond 1749 was not enumerated in the measurement handed to the planner.** Step 9
PREPARE re-derives the complete list from the gate's own report.

### What the planner verified

Read this session: lines 940-979 only. In that window, **951-970 is the incremental
test-selection path**: when the affected-test set is empty it logs "No tests affected by
changes.", updates the file-hash cache and returns
`{ passed: true, passCount: 0, failed: 0, skipped: 0, flaky: 0 }`; otherwise it runs only the
affected tests via `runSpecificTests(tools, affected.tests)` and updates the hash cache when the
run passed. The full-suite branch immediately above (940-949) is already covered.

Every other range in this file is **unread by the planner**. Read the code; do not plan from
this file's prose.

### Two constraints specific to this module

1. **This module is where "a check with zero detected tools reports NOT VERIFIED and FAILS its
   tier" lives** (`runLint` / `runTypecheck` carry a `ran` count; a zero-tool detection returns
   `{ passed: false, undetermined: true, ran: 0, errors: null }`, and `errors` is `null` — never
   `0` — because nothing was measured). Any new test in this area must assert that distinction,
   never blur it. `tests/vacuous-verification.test.js` already holds that contract: **do not
   modify it, and do not write an assertion that contradicts it.**
2. **The command tables are an obeyed surface, not a believed one.** `quality-agent` runs the
   lint/typecheck/test commands from `.ctoc/quality-config.yaml` as an argv program with
   `shell: false`. Every test here must keep that shape: fixtures may declare a command, but it
   must be a real argv array, never a shell string, and the fixture command must be inert (for
   example `process.execPath -e ""`), never something that touches the repository.

### The classification rule (from the approved parent plan, section 4)

Each uncovered range is exactly one of: **(a)** reachable behaviour → test it; **(b)**
permission-gated or terminal-only → leave it and NAME it in the header with the reason (a
permission-gated case that cannot run announces a LOUD skip with a printed reason); **(c)** dead
→ report it, never delete it.

### Seams

- **Tool detection:** the module resolves tools through `src/lib/tool-detector.js`. Inject a
  detection result through the fixture project's own configuration where possible; where the
  boundary must be faked, fake `tool-detector`'s exported method with `t.mock.method`, never the
  quality-agent function under test.
- **Test selection (951-970):** drive the real selection path with a fixture project whose
  changed-file set maps to zero affected tests, then to one. Assert the RETURNED result object
  (`passCount: 0` and `passed: true` for the empty case) and that the hash cache was updated —
  a mutant skipping `updateFileHashes` would make every subsequent run re-select everything.
- **Child processes:** where the module spawns, inject at `child_process` with
  `t.mock.method(require('node:child_process'), 'spawnSync'|'execFileSync', …)` guarded by a
  sentinel argument, so only the case's own invocation is intercepted. Assert the module's
  verdict, not the spawn.
- **Filesystem faults:** `t.mock.method(safeFs, …)` with a path sentinel.

### Fixtures

A temp project under `os.tmpdir()` with `.ctoc/` and a minimal `.ctoc/quality-config.yaml`,
removed in `after`. Never run a real lint or test command against the repository from inside a
test — that would nest a suite inside the suite.

### Wiring — the live call sites

No module is added. `src/lib/quality-agent.js` is live: `src/commands/push.js` and the detached
git post-commit hook run it. The new test file is reached by the gated suite.

### Security review

- No fixture command is a shell string; every one is an argv array with `shell: false`.
- No secret in a fixture; no host path or command string in an assertion message.
- Nothing written outside the temp fixture.

## Test Plan (TDD-Red first)

- One `it` per reachable range, named for the behaviour and the mutation it kills.
- The 951-970 pair gets two cases: zero affected tests (assert the exact zeroed result and the
  hash-cache update) and a non-empty affected set (assert only the selected tests ran).
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Ranges classified (b) or (c) get a header line each, with the reason.

## Decisions Taken Under Ambiguity

1. **`src/lib/quality-agent.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed in the same unit of work,
   recorded here with what failed and why the code was wrong.
2. **No existing quality test is modified**, above all `tests/vacuous-verification.test.js`,
   whose contract this slice must reinforce rather than touch.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/quality-agent-coverage-holes.test.js` with one named case per reachable range. Run
`node --test tests/quality-agent-coverage-holes.test.js`; record every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive the complete uncovered-line list for this file, including the tail
beyond 1749. Read every range, note its enclosing function, and write the (a)/(b)/(c)
classification into the header before asserting anything. Re-read
`tests/vacuous-verification.test.js` so no new assertion contradicts it.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture with an inert argv command table.
- Sub-item 2: the reachable cases, boundary-injected.
- Sub-item 3: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every mock restored; the not-verified-versus-passed distinction preserved
exactly. Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder, one mock helper. No sleeps, no retries.

### Step 13: SECURE
No shell; no real lint/test command run against the repository; no secret; no command string in
a message.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header lists every previously-uncovered range and its disposition.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any real defect exposed —
in particular any place where a zero-tool detection could still read as a pass.


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
