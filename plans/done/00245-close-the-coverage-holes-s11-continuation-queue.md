---
iron_loop_verdict: true
title: "The build queue's fault arms skip a plan rather than authorise one"
type: implementation
iron_loop: true
parent_plan: close-the-coverage-holes
depends_on: none
priority: high
effort: small
files:
  - tests/continuation-queue-coverage-holes.test.js
  - src/lib/continuation-queue.js
  - CLAUDE.md
approved_by: human
approved_at: 2026-09-03T10:22:51.503Z
gate_crossed: review → done
---

# The build queue's fault arms skip a plan rather than authorise one

**Scope (one line):** cover the nine dark ranges of `src/lib/continuation-queue.js` — the module
that decides whether building continues and which plan is next — where each fault arm has a
deliberate, asymmetric direction that nothing has ever tested.

## Implementation Details

### Target and ranges

`src/lib/continuation-queue.js` — measured **96.52 %** on 2026-08-31. Uncovered:
`137-138` · `143-144` · `213-214` · `218-219` · `222-223` · `248-249` · `484-485` · `496-499` ·
`553-554`.

### What the planner verified (read this session: lines 125-264)

| lines | site | direction on a fault |
|---|---|---|
| 136-138 | `approvedFreeQueue` — `require('./state')` / `require('./approval-residency')` throws | `{ refs: [], depth: 0 }` — an empty queue, so nothing is authorised |
| 142-144 | `approvedFreeQueue` — `getPlansDir` throws | same |
| 161-168 | `approvedFreeQueue` — a per-plan classify fault | `continue` — **skip that plan**; an unclassifiable plan is never authorised work |
| 212-214 | `refHumanName` — the plan file cannot be read | name it from the slug alone; not a verdict |
| 217-219 | `refHumanName` — `parseMetadata` throws | fall back to an empty title |
| 221-223 | `refHumanName` — outer catch | return the slug |
| 247-249 | `blockingForkName` — the questions store faults | `null` — **keep building**; a read error is not a fork, and fabricating one would strand the human |

The two directions are deliberately opposite and both must be pinned: a queue fault withholds
authorisation, a questions fault does NOT invent a fork. A mutant swapping either direction
either strands the human or authorises unapproved work.

`484-485`, `496-499` and `553-554` are **unread by the planner**. Read them at Step 9.

### Seams — exact

- **136-138, 142-144:** patch `Module._load` for the resolved `src/lib/state.js` (and
  `src/lib/approval-residency.js`) so the in-function `require` throws; restore in `finally`.
  For 142-144, let the require succeed and make `getPlansDir` throw with
  `t.mock.method(require('../src/lib/state'), 'getPlansDir', …)` — the module re-requires it per
  call, so the cached exports object is the boundary.
- **161-168:** `t.mock.method(require('../src/lib/approval-residency'), 'isApprovedForCoverage', …)`
  throwing for one specific plan path and returning the real verdict for the others. Assert the
  faulting plan is ABSENT from `refs` and the healthy ones are present — that is the "skip, do
  not authorise" contract, and a mutant that let the fault through would empty the whole queue.
- **212-214:** a `ref` naming a plan file that does not exist → assert the name falls back to the
  slug and nothing throws.
- **217-219:** `t.mock.method(require('../src/lib/state'), 'parseMetadata', () => { throw … })`
  with a plan whose content has no `#` heading, so the title path is reached.
- **221-223:** patch `Module._load` for `src/lib/streaming-gate.js` so the in-function require
  throws → assert the slug is returned.
- **247-249:** patch `Module._load` for `src/lib/streaming-precompute.js` so it throws → assert
  `blockingForkName` returns `null` and the queue keeps building.

Fixtures: a temp project with `plans/todo/` and `plans/in-progress/` and a small approval ledger,
under `os.tmpdir()`, removed in `after`.

### Wiring — the live call sites

No module is added. `src/lib/continuation-queue.js` is live: the Stop hook
(`src/hooks/stop-continuation-gate.js`) consumes its decision. The new test file is reached by
the gated suite.

### Security review

- Plan names reaching a human are run through the human-naming path; a case should feed a plan
  whose heading contains a control character and assert it does not survive into the returned
  name.
- No approval is minted anywhere: the fixture's ledger is a fixture, and nothing under
  `.ctoc/approvals/` in the repository is read or written.
- Fixtures under `os.tmpdir()`; no secret; no shell.

## Test Plan (TDD-Red first)

- `a per-plan classify fault SKIPS that plan and keeps the rest — an unclassifiable plan is never authorised work`
- `a questions-store fault does NOT invent a fork — the queue keeps building`
- `an unreadable plan is named from its slug, which is not a verdict about the plan`
- one case per remaining reachable range, named for its direction.
- Every case RED before the change. A case GREEN on the first run means the map is stale —
  account for it at Step 11, never bank it.

## Decisions Taken Under Ambiguity

1. **`src/lib/continuation-queue.js` is declared in `files:` but no source change is intended** —
   the declaration exists so a defect this slice exposes can be fixed here, recorded with what
   failed and why the code was wrong.
2. **Both fault directions are asserted explicitly in the same file**, so a future edit that
   "makes them consistent" fails a named test. They are deliberately not symmetric.
3. **A dead range is reported, never deleted** (parent plan, Decision 2).

## Execution Plan

### Step 8: TEST
Write `tests/continuation-queue-coverage-holes.test.js` with the named cases. Run it; record
every case RED with its reason.

### Step 9: PREPARE
Run the gate and re-derive this file's uncovered ranges. Read 484-485, 496-499 and 553-554 in the
current code, classify them, and confirm the seven mapped ranges above still sit where the table
says.

### Step 10: IMPLEMENT
- Sub-item 1: the temp-project fixture with a small ledger and two stages of plans.
- Sub-item 2: the loader-patch and boundary-mock cases.
- Sub-item 3: the three unread ranges, once classified.
- Sub-item 4: the header — every range covered, every range left, each with its reason.

### Step 11: REVIEW
No existing test touched; no assertion weakened; no baseline or exemption added; no function
under test mocked; every loader patch and mock restored. Account for every case GREEN before
implementation.

### Step 12: OPTIMIZE
One fixture builder; one loader-patch helper. No sleeps, no retries.

### Step 13: SECURE
No approval minted or read outside the fixture; no control character survives into a returned
name; nothing written outside `os.tmpdir()`; no shell.

### Step 14: VERIFY
`npm test` — `fail 0`, `skipped 0`, coverage at or above the floor in
`.ctoc/coverage-baseline.json`. Record the file's new percentage.

### Step 15: DOCUMENT
The header states the two opposite fault directions and why they must stay opposite.

### Step 16: FINAL-REVIEW
Report: coverage before and after; every range left, with its reason; any arm whose real
direction differed from the table above.


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

## Execution Record (Steps 8–16)

**Step 8 TEST.** Wrote `tests/continuation-queue-coverage-holes.test.js` — 11 named cases, one
per dark range plus a control-character case. First run: **11 pass, 0 fail**. No case was red,
which is the expected shape for a coverage slice that changes no behaviour, so red provenance
was taken from MUTATION instead of banked: 11 mutants, one per arm, each applied to
`src/lib/continuation-queue.js`, the single matching case run under `--test-name-pattern`, and
the file restored and SHA-256-verified byte-for-byte after every run. Every mutant was killed by
exactly one case (cases run 1, fail 1, restored true, 11/11). The mutants: each fault arm made to
throw instead of returning its safe value; the fork-check arm made to FABRICATE a fork
(`return refHumanName(...)` in place of `return null`); and the naming call made to bypass the
sanitiser (`return title || slug` in place of `return humanPlanName(title, slug)`).

**Step 9 PREPARE.** Re-derived from the gate. The seven ranges the planner mapped sat exactly
where the table said. The three unread ranges classified as (a) REACHABLE BEHAVIOUR:

- `484-485` — `nextBuildable`, the `state` load / `getPlansDir` arm: a fault authorises NOTHING
  (the empty `{buildable, blocked, inversions, missingDeps}`).
- `496-499` — `nextBuildable`, per-plan read/parse: a plan enumerated and then gone is SKIPPED,
  and the healthy plans still build. This is the documented race, reproduced by really deleting
  the file between enumeration and the build-order read.
- `553-554` — `approvedQueueBannerLine`, outer catch. Reachable only through a CONTRACT
  VIOLATION by `state.getPlansDir` (a non-string return makes `path.join` throw outside the
  enumerator’s own try — every other fault inside the enumerator is already isolated). Injected
  as such and named in the test-file header, since it is defence in depth for a session-start
  path that must never crash a session.

**Step 10 IMPLEMENT.** One test file. `src/lib/continuation-queue.js` was NOT changed — no test
exposed a defect, and every arm behaved exactly as the plan’s table said. Confirmed clean by
`git status` and by the mutation harness’s post-run hash check.

**Step 11 REVIEW.** No existing test touched, no assertion weakened, no baseline or exemption
entry added, no function under test stubbed. Faults are injected only at true boundaries — the
module loader (restored in a `finally`), the `state` / `approval-residency` / `streaming-gate` /
`streaming-precompute` module objects via `t.mock.method` (auto-restored), and the real
filesystem. All 11 cases were green before any change; every one is accounted for by its killed
mutant above, and none is banked as evidence of new behaviour.

**Step 12 OPTIMIZE.** One fixture builder (`makeApprovedPlan`, minting a real Gate-2 ledger
entry), one loader-patch helper (`failLoadOf`), one arming helper (`afterForkCheck`). No sleeps,
no retries, no timing dependence.

**Step 13 SECURE.** Fixtures under `os.tmpdir()`, removed in every `finally`; nothing in the
repository is read or written and no approval is minted outside each fixture’s own ledger; no
shell, no network, no secret. The control-character case asserts that a bell character in a plan
heading never survives into the name a human reads, and its mutant (bypassing the sanitising
naming call) is killed.

**Step 14 VERIFY.** `npm test` from the repository root, output captured to a file and its last
lines read directly:

```
[CTOC test-gate] coverage 99.21% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] corpus claims: verified 3  refuted 0  unverifiable 0  (offline ledger gate: PASS)
[CTOC test-gate] PASS
```

`src/lib/continuation-queue.js`: **96.52 % → 100.00 %** line coverage, no uncovered ranges left.
No new module, so the reachability and export fences are unaffected.

**Step 15 DOCUMENT.** The test-file header states the three opposite fault directions and why
they must stay opposite, lists every range with the direction it pins, and records that no range
is left uncovered. `CLAUDE.md`’s documented test-file count moved 526 → 527 in both places (the
only reason that file is declared).

**Step 16 FINAL-REVIEW.** Coverage before 96.52 %, after 100.00 %. No range left uncovered. No
arm’s real direction differed from the planner’s table.

## Decisions Taken During Execution

1. **Red provenance by mutation, not by weakening.** Every case was green on the first run
   because this slice adds no behaviour. Rather than bank that, each case was proven to fail
   against a mutated module and the module restored with a verified hash. The harness is a
   scratch script; it is not shipped.
2. **`553-554` is covered through a contract violation, and says so.** The banner’s outer catch
   cannot be reached by any ordinary filesystem fault, because the enumerator beneath it already
   isolates them. Rather than call the range dead or fake it, the case injects the one thing that
   can reach it — `getPlansDir` returning a non-string — and the header names that classification.
3. **The naming step is observed through a marker, not by its return value.** A dropped inner
   catch in the naming path returns the same slug as the working code, so a value assertion alone
   would have missed the mutant. `humanPlanName` is temporarily replaced with an observable
   marker at the `streaming-gate` boundary, which makes “the naming step ran with an empty title”
   distinguishable from “the fault escaped to the outer catch”.
