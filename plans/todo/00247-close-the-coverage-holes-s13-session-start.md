---
iron_loop_verdict: true
title: "Every optional session-start subsystem degrades to silence, provably"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/session-start-coverage-holes.test.js
  - src/hooks/SessionStart.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-08-31T14:59:34.307Z
gate_crossed: implementation → todo
---

# Every optional session-start subsystem degrades to silence, provably

**Scope (one line):** cover the nine dark ranges of `src/hooks/SessionStart.js` — each one the
catch that keeps a broken optional subsystem from breaking the human's session start.

## Implementation Details

### Target and ranges

`src/hooks/SessionStart.js` — measured **96.68 %** on 2026-08-31. Uncovered:
`138-139` · `166-168` · `189-190` · `200-201` · `237-238` · `318-319` · `345-346` · `371-372` ·
`568-569`.

### What the planner verified (read this session: lines 130-203)

| lines | subsystem | behaviour on a fault |
|---|---|---|
| 137-139 | plan-index backfill kick | `console.error('[CTOC] Plan-index backfill kick skipped:', message)` and continue |
| 165-168 | the Iron Loop self-check | `selfCheckSummary = 'Self-check skipped: <message>'` — the session still starts, and the human is told |
| 188-190 | the build-loop tick | `loopB = ''` — the status must never break session start |
| 199-201 | the while-you-were-away increment feed | `away = ''` — same |

Line 202 composes the output:
`console.log(context + (directive || '') + (resume || '') + (loopB || '') + (away || ''))`, so an
empty section is byte-for-byte invisible. That is the property each case must pin: a broken
optional subsystem contributes **nothing**, not a partial or an error string, to the model's
context — except the self-check, which deliberately contributes a visible "skipped" line.

`237-238`, `318-319`, `345-346`, `371-372` and `568-569` are **unread by the planner**. Read them
at Step 9; from their neighbourhood they are likely the same shape (the question-dispatch
directive, the resume injection, the lessons injection), but that must be read, not assumed.

### Seams — exact

Each arm wraps an in-function `require`, so the module loader is the boundary. The established
pattern: patch `Module._load` for one resolved filename, restore in `finally`.

```js
const origLoad = Module._load;
Module._load = function patched(request, parent, isMain) {
  let resolved = null;
  try { resolved = Module._resolveFilename(request, parent, isMain); } catch { /* ignore */ }
  if (resolved === LOOP_B_DRIVER_PATH) throw new Error('SIMULATED load failure');
  return origLoad.apply(this, arguments);
};
```

Targets, in order: `src/lib/plan-index/bootstrap.js`, `src/lib/iron-loop-enforcer.js`,
`src/lib/loop-b-driver.js`, `src/lib/increment-feed.js`, and whichever modules the five unread
ranges require.

**How to drive the hook.** Determine at Step 9 whether the entry function is exported. If it is,
call it in-process with `process.cwd()` pointed at a temp fixture, capturing
`process.stdout.write` and `process.stderr.write`. If it is not, spawn the hook as a child with a
`--require` preload that installs the loader patch, and assert on the child's stdout/stderr. Say
in the header which route each case takes.

**The output assertion is the load-bearing one.** For 189-190 and 200-201 the correct assertion is
that the injected context is **byte-for-byte identical** to a run where that subsystem is absent —
not merely that it "did not crash". Build the baseline by running the same fixture without the
fault and comparing. A mutant that emitted `undefined` or an error string into the model's context
reds there and nowhere else.

### The one thing a case must not do

`SessionStart` writes into a project (`.ctoc/index/`, `CLAUDE.md`) only inside its
project-identified guard. Every case must run against a temp fixture, and at least one case should
assert the documented negative: **the hook does not manufacture a project marker** where none
exists. `tests/session-start-does-not-fabricate-a-project.test.js` and
`tests/hooks-do-not-manufacture-the-project-marker.test.js` already hold that contract — read
them at Step 9 and do not modify them; add only what they do not cover.

### Wiring — the live call sites

No module is added. `src/hooks/SessionStart.js` is registered in `.claude-plugin/hooks.json` and
run by the Claude Code harness on every session start. The new test file is reached by the gated
suite.

### Security review

- No case may write into the repository: every run uses a temp working directory, removed in
  `after`. A case that accidentally identified the repository as its project would write
  `CLAUDE.md` — assert the fixture root afterwards to prove nothing leaked.
- No secret in a fixture; no absolute host path asserted; argument arrays, no shell.

## Test Plan (TDD-Red first)

- `a broken build-loop tick contributes nothing — the injected context is byte-for-byte unchanged`
- `a broken increment feed contributes nothing — same`
- `a broken self-check is reported as skipped, with the reason, and the session still starts`
- `a broken plan-index backfill kick is reported on stderr and the session still starts`
- one case per remaining reachable range, once classified.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **Byte-for-byte comparison against a fault-free baseline run** is used for the two
   "contributes nothing" arms, rather than a substring check. A substring check cannot tell an
   empty section from a section containing the word it happened to look for.
2. **`src/hooks/SessionStart.js` is declared in `files:` but no source change is intended** — the
   declaration exists so a defect this slice exposes can be fixed here.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/session-start-coverage-holes.test.js` with the named cases. Run it; record every
case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read the five unread ranges and classify
them. Determine whether the entry is exported (in-process) or must be spawned. Read the two
existing "does not manufacture a project" tests so this file adds only what they do not cover.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-fixture builder and the baseline (fault-free) run helper.
- Sub-item 2: the four verified arms.
- Sub-item 3: the five ranges once classified.
- Sub-item 4: the header — every range covered, every range left, each with its reason, and which
  route (in-process or spawned) each case takes.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function under
test mocked; every loader patch restored; nothing written into the repository. Account for every
case GREEN before implementation.

### Step 12: OPTIMIZE
One fixture builder; one loader-patch helper; one baseline run reused across the comparison cases
(recomputed per case only if the fixture changes).

### Step 13: SECURE
Assert the repository tree is unchanged after the suite; no secret; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states that each case pins "a broken optional subsystem contributes nothing to the
human's session", and which single subsystem each case breaks.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any subsystem whose failure
was found to leak text into the injected context.


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
