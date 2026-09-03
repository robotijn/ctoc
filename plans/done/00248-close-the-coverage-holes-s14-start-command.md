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
approved_at: 2026-09-03T10:22:50.465Z
gate_crossed: review → done
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
- [x] Write tests for the implementation — `tests/start-command-coverage-holes.test.js`, 7 cases (5 behavioural + 2 explicitly labelled guards)
- [x] Test error conditions — every case IS an error condition: an unreadable VERSION file, an unmapped key, a throwing area activation, an unreadable settings anchor
- [x] Run tests - expect RED (failing) — all 7 passed on the first run, as a coverage slice that changes no source must. RED provenance was therefore taken from MUTATION: five mutations, one per reachable range, each producing exactly one failing case and no other, each restored byte-for-byte (sha256 `1a7af9ef3d949cdfc6d47727f03a55639479fbaebac75d4fdb2e61adbab2aeb3` verified after every restore). Detail in the Execution Record.

### Step 9: PREPARE
- [x] Install dependencies if needed — none added
- [x] Check prerequisites — `npm test` run before any edit: PASS, coverage 99.28%, failed 0, skipped 0
- [x] Verify dev environment ready — the gate re-derived this file's ranges EXACTLY as the plan states: `249-250 470-472 477-481 596-597 601-604 690-693 957-973` at 96.39%
- [x] Create directories/config if needed — none; fixtures are temporary directories under the system temp directory

### Step 10: IMPLEMENT
- [x] Implement the feature according to requirements — sub-item 1: one fixture builder (`makeFixtureProject`) plus a stdout capture that restores in a `finally`; sub-item 2: the five reachable-range cases; sub-item 3: the header classifying all seven ranges
- [x] Add error handling — every injected fault is sentinel-guarded and every patch restored in a `finally`
- [x] Wire up integration points — no module added; `src/commands/start.js` is UNCHANGED (its sha256 matches the pre-slice snapshot and `git status` shows no modification) and the new test file is reached by the gated suite

### Step 11: REVIEW
- [x] Self-review all new code — no terminal simulated, no `isTTY` stubbed, no export added for testing, no existing test file touched, no assertion weakened, no baseline or exemption entry added
- [x] Verify integration points work together — faults are injected only at true module boundaries (`safe-fs`, the `streaming-render` module object, the pipeline/inbox area module objects)
- [x] Check error handling completeness — GREEN-BEFORE-IMPLEMENTATION accounting: all 7 cases were green before any change, which is expected of a slice that changes no source. The 5 behavioural cases are banked ONLY on their mutation evidence; the 2 cases named GUARD are banked as nothing at all — they exist so their paired case cannot pass by the fallback being permanently on.

### Step 12: OPTIMIZE
- [x] Remove redundant operations — one fixture builder, one stdout capture, one app-staging helper
- [x] Optimize critical paths — no sleeps, no retries, no polling; the whole file runs in about 5 ms
- [x] Simplify complex code — the pure plan-content view is rendered for the VERSION case, so no assertion depends on the filesystem

### Step 13: SECURE
- [x] Validate inputs (no path traversal) — every fixture root comes from `fs.mkdtempSync` under the system temp directory
- [x] Sanitize outputs — the setup case asserts that no reported path is absolute, so the message cannot leak the filesystem layout
- [x] No secrets in code — none; no network, no shell, no child process
- [x] Safe file operations — nothing is written outside the temporary fixtures; no case renders against this repository's own plan tree

### Step 14: VERIFY
- [x] Run lint + type check — run by `npm test` as part of the gate
- [x] Run ALL tests (TDD Green) — `npm test`: `[CTOC test-gate] PASS`, pass 11771, fail 0
- [x] Check coverage >= 80% — measured 99.31% against the enforced floor of 99 (up from 99.28%). `src/commands/start.js` moved 96.39% → 97.95%; the only ranges still dark are `601-604` and `957-973` — 22 lines, dark BY DECISION (terminal-only), not by omission
- [x] 0 skipped, 0 flaky tests — skipped 0

### Step 15: DOCUMENT
- [x] Update relevant documentation — the test file header is the documentation: every range, its class, its reason
- [x] Add JSDoc comments to new functions — the three helpers carry doc comments
- [x] Update CHANGELOG if needed — no changelog entry; the documented test-file count in CLAUDE.md moved 530 → 531, which is the only reason CLAUDE.md is declared in this plan

### Step 16: FINAL-REVIEW
- [x] Verify steps 8-15 completed correctly
- [x] All quality checks passed — gate PASS, fail 0, skipped 0, coverage 99.31%
- [x] Manual verification if needed — the five mutations ARE the manual verification: each broke exactly its own case and nothing else
- [x] Ready for human review


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.

## Execution Record

_Appended after the build. Not part of the approved text._

### The measurement, before and after

| | before | after |
|---|---|---|
| `src/commands/start.js` line coverage | 96.39 % | **97.95 %** |
| uncovered ranges in that file | `249-250 470-472 477-481 596-597 601-604 690-693 957-973` | `601-604 957-973` |
| whole-repository line coverage (scoped to `src/**`) | 99.28 % | 99.31 % |
| gate verdict | PASS (fail 0, skipped 0) | PASS (pass 11771, fail 0, skipped 0) |

The ranges re-derived at Step 9 from the gate's own report matched the plan exactly.

### Classification of every range

| range | class | outcome |
|---|---|---|
| `249-250` | (a) reachable | tested — an unreadable VERSION file leaves the header printing the unknown-version marker instead of crashing |
| `470-472` | (a) reachable | tested — the streaming view's back action leaves streaming and paints the classic dashboard |
| `477-481` | (a) reachable | tested — a key streaming does not map re-renders streaming and does not jump to another area |
| `596-597` | (a) reachable | tested — an area whose activation throws does not break moving to it |
| `690-693` | (a) reachable | tested — a settings file that cannot be read is reported as an unusable regime anchor, not a crash |
| `601-604` | (b) terminal-only | NAMED, not tested. `handleResize` is not exported and its only wiring is the resize listener registered inside the interactive-terminal branch. Reaching it otherwise would mean adding an export with no live caller. |
| `957-973` | (b) terminal-only | NAMED, not tested. The interactive-terminal branch, out of scope by the owner's standing decision. |

No range was (c) dead. Every one of the seven is live code.

**22 lines remain dark in this file, and they are dark by decision, not by omission.**

### Red provenance — the five mutations

All 7 cases were green on the first run, which is what a slice that changes no source
must produce. So the red was taken from mutation. Each mutation was applied to the
pristine file, the test file was run, and the file was restored from a byte-for-byte
snapshot whose sha256 (`1a7af9ef3d949cdfc6d47727f03a55639479fbaebac75d4fdb2e61adbab2aeb3`)
was re-verified after every restore.

| mutation | case that failed | other cases |
|---|---|---|
| line 249: fallback `'?.?.?'` → `'x.x.x'` | the unreadable-VERSION case | all still green |
| line 471: `app.streamView = false;` removed from the back arm | the back-action case | all still green |
| lines 479-480: the repaint-and-return removed, letting the key fall through | the unmapped-key case | all still green |
| line 595: the activation `catch` changed to rethrow | the activation-fault case | all still green |
| line 692: the anchor `catch` returning `false` → `true` | the unusable-anchor case | all still green |

Each mutation broke exactly one case and no other, so each case is pinned to its own
range and none is a line-toucher. `src/commands/start.js` is unchanged by this slice.

### Green-before-implementation accounting (Step 11)

All seven cases were green before the change. The five behavioural cases are banked
only on the mutation evidence above. The two cases named GUARD in the test file are
banked as nothing: they exist so their partner case cannot pass by the fallback being
permanently on (a readable VERSION file must print the real version; a readable inline
anchor must verify clean).

### Decisions taken during execution

1. **`src/commands/start.js` was not edited.** No test exposed a defect and no seam was
   needed, so the declared source file stays byte-for-byte as it was. The declaration
   existed only so a discovered defect could be fixed in place.
2. **The VERSION fallback is driven by loading the module a second time** with the
   VERSION read throwing at the `safe-fs` boundary, then discarding that instance and
   restoring the cached one. The alternative — exporting the version string — would have
   added a surface with no live caller.
3. **The screens are painted through mocked area renderers**, so no case reads this
   repository's plan tree. The mocks sit on the area module objects, never on the
   function under test.
4. **`handleResize` (601-604) is named terminal-only rather than exported for a test.**
   Its only registration is inside the interactive-terminal branch, so an export would be
   dead surface — the trade the reachability fence exists to refuse.

### For the human

Nothing here needs a decision. One thing worth knowing: this file's honest ceiling
without a terminal is about 98 %, because the last 22 lines are the interactive keyboard,
the resize listener and the auto-sync timers. Raising the repository floor is slice 20's
question, not this one's.
