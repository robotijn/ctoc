---
iron_loop_verdict: true
title: "Classify the dashboard command's dark ranges — test what is reachable, name what is terminal-only"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/start-command-coverage-holes.test.js
  - src/commands/start.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.336Z
gate_crossed: implementation → todo
---

# Classify the dashboard command's dark ranges

**Scope (one line):** for `src/commands/start.js`, test every uncovered range that is reachable
without an interactive terminal, and NAME the rest as terminal-only — the interactive branch is
out of scope by the human's standing decision, and faking it is the coverage theatre this
repository refuses.

## Implementation Details

### Target and ranges

`src/commands/start.js` — measured **96.39 %** on 2026-08-31. Uncovered:
`249-250` · `470-472` · `477-481` · `596-597` · `601-604` · `690-693` · `957-973`.

**`957-973` is the interactive-terminal branch and is OUT OF SCOPE by the human's standing
decision** (parent plan, section 4). It is not to be tested, not to be faked, and not to be
counted as a gap — it is to be NAMED in the test file's header as terminal-only, with that
reason.

### What the planner verified (read this session: lines 462-489)

`470-472` and `477-481` sit inside the **keypress handler**: 469-472 is the streaming view's
`back` action toggling to the classic dashboard, and 477-481 is the deliberate "streaming owns
the screen" arm where an unmapped key re-renders instead of leaking to the numeric shortcuts
below. Both are pure state transitions over an `app` object followed by a `render()` call.

`249-250`, `596-597`, `601-604` and `690-693` are **unread by the planner**. Read them at Step 9.

### The classification question this slice must answer honestly

For each range, exactly one of:

- **(a) reachable without a terminal** — the handler is exported, or the module accepts an
  injected key event / `app` object, so the branch can be driven in-process. Test it: assert the
  resulting `app` state (for example `app.streamView === false` after `back`) and that `render`
  was called, using an injected render spy at the module's own seam, never by mocking the handler.
- **(b) terminal-only** — the branch can be reached only through a real interactive terminal. Do
  NOT simulate a terminal, do NOT stub `process.stdin.isTTY`, do NOT fake a keypress stream that
  the production path does not use. Name the range in the header with the reason. `957-973` is
  already known to be in this class.
- **(c) dead** — report it in `## Decisions Taken Under Ambiguity` and at Step 16; never delete.

The honest answer for several of these may be (b), and a smaller number of new tests with an
accurate header is a better outcome than a larger number that fake a terminal. **The coverage
floor is a normal-dev-machine floor, declared, not chased** — the same standing decision that
governs the permission-gated branches.

### Seams

- If the keypress handler is exported (confirm at Step 9), call it directly with a key object of
  the shape the real `readline` emits (`{ name: 'left' }`, `{ name: 'q' }`, …) and a constructed
  `app`, and assert the resulting state.
- If it is not exported, check whether `start.js` exposes a pure router the handler delegates to.
  If neither exists, the range is (b): say so rather than exporting the handler purely to test it
  — adding an export with no live caller would create the dead surface the reachability fence
  exists to catch.

### Wiring — the live call sites

No module is added. `src/commands/start.js` is the dashboard entry, run by `/ctoc:start`. The new
test file is reached by the gated suite.

### Security review

- No case may render against the repository's real plan tree in a way that writes to it; use a
  temp fixture project.
- No absolute host path in an assertion; no secret; no shell.

## Test Plan (TDD-Red first)

- One `it` per range classified (a), named for the human-visible behaviour — for example
  `an unmapped key in the streaming view re-renders and does NOT jump to another area`.
- Every such case RED before the change.
- Every range classified (b) or (c) gets a header line with its reason and **no test**. The header
  is the deliverable for those, and it is not a lesser one: a named, reasoned gap is honest; a
  faked terminal is not.

## Decisions Taken Under Ambiguity

1. **No terminal is simulated and no `isTTY` is stubbed.** The human's standing decision on
   `957-973` generalises to the whole interactive surface: those branches are declared, not
   chased.
2. **No export is added purely to make a branch testable.** That would trade a dark line for a
   dead export, which the reachability fence names as the worse defect.
3. **`src/commands/start.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here.
4. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/start-command-coverage-holes.test.js` with one named case per range classified (a).
Run it; record each RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read `249-250`, `596-597`, `601-604` and
`690-693`, and classify every range (a)/(b)/(c) — writing the classification and its reason into
the header **before** any assertion is written.

### Step 10: IMPLEMENT
- Sub-item 1: the temp fixture project and the render spy at the module's own seam.
- Sub-item 2: the (a) cases.
- Sub-item 3: the header — every range, its class, and its reason, with `957-973` named as
  terminal-only by the human's standing decision.

### Step 11: REVIEW
No terminal simulated; no export added for testing; no existing test touched; no assertion
weakened; no baseline or exemption added. Account for every case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder. No sleeps, no retries.

### Step 13: SECURE
Nothing written outside the temp fixture; no shell; no secret.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage, and state plainly how many
lines remain dark **by decision** rather than by omission.

### Step 15: DOCUMENT
The header is the documentation: every range, its class, its reason.

### Step 16: FINAL-REVIEW
Report: coverage before and after; the exact line count left terminal-only by decision; and — if
it is the case — that the honest outcome for this file was a small number of tests, which is a
result, not a shortfall.


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
