---
iron_loop_verdict: true
title: "Remainder: the hooks, the three commands, and the release scripts"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: medium
effort: small
files:
  - tests/remainder-hooks-commands-coverage.test.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.460Z
gate_crossed: implementation → todo
---

# Remainder: the hooks, the three commands, and the release scripts

**Scope (one line):** classify and cover the small dark ranges in the eleven modules behind the
shipped commands, the stop gates, project initialisation and the release script.

## Implementation Details

### Targets and measured ranges (2026-08-31)

| file | uncovered lines |
|---|---|
| `src/lib/init-project.js` | 615-616 · 728-729 · 760-762 · 790-792 |
| `src/scripts/release.js` | 198-201 · 239-242 · 295-298 |
| `src/commands/update.js` | 140-141 · 204-211 |
| `src/commands/push.js` | 190-194 |
| `ctoc-routing-reminder.js` | 85-86 · 227-228 · 279-280 |
| `stop-continuation-gate.js` | 62-63 |
| `stop-test-gate.js` | 182-183 |
| `src/lib/settings.js` | 309-310 |
| `src/lib/v8-dispatcher.js` | 276 |
| `src/lib/tui.js` | 247-248 |
| `src/lib/cache.js` | 46 |

**Three paths in that table are ambiguous in the measurement handed to the planner and must be
resolved at Step 9 before anything is written:** `ctoc-routing-reminder.js`,
`stop-continuation-gate.js` and `stop-test-gate.js` were reported without a definite directory.
`src/hooks/UserPromptSubmit.js` requires `../lib/ctoc-routing-reminder`, so at least the routing
reminder has a `src/lib/` implementation; there may also be a `src/hooks/` file of the same name.
Locate each file for real (a directory listing, not a guess) and write the true path into the
header.

**The planner did not read any of these eleven files.** The table is the measurement, not an
analysis.

### The classification rule (from the approved parent plan, section 4)

**(a)** reachable → test it; **(b)** permission-gated or terminal-only → leave it and NAME it in
the header with the reason (a permission-gated case that cannot run announces a LOUD skip with a
printed reason); **(c)** dead → report it, never delete it.

Expect **(b)** to be the honest answer for parts of `src/lib/tui.js` — terminal rendering — and
possibly for parts of `update.js`. Naming those with a reason is the deliverable for them; faking
a terminal is not.

### The four rules that apply to this family specifically

1. **A stop gate must fail OPEN and stay escapable.** `stop-continuation-gate` blocks a premature
   stop but allows on any internal error, on a registered fork, on an exhausted budget, and under
   `CTOC_SKIP_CONTINUATION=1`. Any case here must assert the ALLOW direction on a fault. A mutant
   that made a gate fault into a block would trap the human in a loop — that is the mutation to
   kill.
2. **No case may run a real update, push, release or git operation.** `release.js` writes version
   numbers across files and `push.js` runs the quality gate: every case must run against a temp
   fixture project, and any git or network invocation must be intercepted at
   `child_process`. **Never invoke `git` against this repository from a test.**
3. **No case may modify `.ctoc/settings.yaml` or `.ctoc/quality-config.yaml` in the repository.**
   Those are command tables — their contents are obeyed, not merely believed — and they are
   protected precisely because writing them changes what runs on every commit. Fixture copies
   only.
4. **`init-project.js` creates `CLAUDE.md` and the `plans/` tree.** Every case runs in a temp
   directory, and the suite must assert afterwards that the repository's own `CLAUDE.md` and
   `plans/` are unchanged.

### Seams

- Fixture-first: a temp project, seeded with just enough to drive the branch.
- Child processes and git: `t.mock.method(require('node:child_process'), …)` guarded on the
  case's own argv; assert the module's verdict, not the spawn.
- Hooks with no export: spawn as a child with a `--require` preload that seeds `require.cache`
  for the module whose fault the case needs, exactly as `tests/pretooluse-write-coverage.test.js`
  does. Assert exit code and the documented stderr line.
- Filesystem faults: `t.mock.method(safeFs, …)` with a path sentinel.
- Never mock the function under test.

### Wiring — the live call sites

No module is added. All eleven are live: the three shipped commands (`/ctoc:start`, `/ctoc:push`,
`/ctoc:update`), the registered stop hooks, the initialisation path that runs when a project has
no `.ctoc/`, and the release script a human runs. The new test file is reached by the gated suite.

### Security review

- No git operation, no push, no release, no update against the repository.
- No command table in the repository is written.
- No secret in a fixture; no host path in an assertion message; argument arrays, no shell.
- Every temporary file removed in `after`.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the behaviour and the mutation it kills — for
  example `a fault inside the stop gate ALLOWS the stop — a gate that blocks on its own bug traps the human`.
- Every such case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.
- Every range classified (b) or (c) gets a header line with its reason and no test.

## Decisions Taken Under Ambiguity

1. **Only the test file is declared in `files:`.** No source change is intended; a defect this
   slice exposes goes through `src/lib/scope-growth.js` (`requestScopeGrowth`, all seven fields)
   to the human.
2. **The three ambiguous paths are resolved by looking, not by assuming** — and the true paths are
   written into the header, so the next reader does not repeat the ambiguity.
3. **Terminal-only ranges are named, not faked** — the same standing decision that governs the
   dashboard's interactive branch.
4. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/remainder-hooks-commands-coverage.test.js` with one named case per range classified
(a). Run it; record every case RED with its reason.

### Step 9: PREPARE
Resolve the three ambiguous file paths by listing the directories. Run the gate and re-derive the
uncovered ranges for all eleven files. Read every range and write the (a)/(b)/(c) classification,
with the enclosing function and the true path, into the header before asserting anything.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture builders.
- Sub-item 2: the in-process cases.
- Sub-item 3: the spawned hook cases with `--require` preloads.
- Sub-item 4: the header — every range, its class, its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline, exemption or command table changed;
no function under test mocked; every mock restored; no git operation performed. Account for every
case GREEN before implementation.

### Step 12: OPTIMIZE
Shared fixture and spawn helpers. No sleeps, no retries.

### Step 13: SECURE
Confirm the repository's `CLAUDE.md`, `plans/`, `.ctoc/settings.yaml` and
`.ctoc/quality-config.yaml` are byte-for-byte unchanged after the suite; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0` (or a LOUD skip with a printed reason), coverage at or above
the floor in `.ctoc/coverage-baseline.json`. Record the new percentage for each of the eleven
files.

### Step 15: DOCUMENT
The header names every range, its true file path, its class and its reason.

### Step 16: FINAL-REVIEW
Report: per-file coverage before and after; the resolved paths for the three ambiguous entries;
every range left, with its reason; any stop gate found to block on its own fault.


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
