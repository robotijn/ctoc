---
approved_by: human
approved_at: 2026-07-13T20:53:24.493Z
gate_crossed: review → done
---

---
iron_loop: true
approved_by: human
approved_at: 2026-07-13T19:14:57.861Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-13T11:01:11.605Z
gate_crossed: functional → implementation
---

---
title: "W05 — Gate 3 Verifies Real Work"
created: "2026-07-11T00:00:00Z"
type: feature
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
depends_on: none
---

# W05 — Gate 3 Verifies Real Work

> **SIP1 INDEX.** This functional-derived implementation plan has been
> decomposed by the implementation-planner (Iron Loop Steps 5-7) into **5 small,
> dependency-ordered implementation slices**, each a cohesive module-plus-test
> unit with its own Steps 8-16. This file is now the INDEX of that set; the
> ASSESS / ALIGN / CAPTURE sections below remain the shared functional context
> every slice reads. Build the slices one at a time in `depends_on` order (plans
> are always sequential). Gates 2 (implementation→todo) and 3 (review→done) are
> approved for ALL siblings at once via
> `approveSubplans('ctoc-audit-w05-gate3-verifies', <fromStage>)` in
> `src/lib/actions.js` — ONE human decision per batch, each sibling still stamped
> `approved_by: human`.

## Slices (dependency-ordered)

| # | Slice file | Scope (one line) | Files | depends_on |
|---|---|---|---|---|
| s1 | `ctoc-audit-w05-s1-verify-evidence.md` | Give `runVerify` a real caller: persist + read a `.ctoc/state/verify/<slug>.json` VERIFY artifact. | `src/lib/step-13-verify.js` (+ test) | — |
| s2 | `ctoc-audit-w05-s2-gate3-can-fail.md` | Make `validateReviewToDone` return `valid:false` on missing marker / unchecked required-step box / absent-or-failing-or-stale VERIFY evidence; `approveSubplans` inherits the skip. | `src/lib/plan-validator.js` (+ test) | s1 |
| s3 | `ctoc-audit-w05-s3-cleanup-validated.md` | Route `cleanupStaleInProgress`'s in-progress→review move through `validateForReview`; observable, reasoned skip. | `src/lib/actions.js` (+ test) | — |
| s4 | `ctoc-audit-w05-s4-sync-validated.md` | Route `moveToReviewAfterPush`'s in-progress→review rename through `validateForReview`; return `{ moved:false, reason }`. | `src/lib/sync.js` (+ test) | — |
| s5 | `ctoc-audit-w05-s5-circuit-breaker.md` | New `circuit-breaker.js`: per-step (>3) + per-plan (>5) kickback counters persisted in plan frontmatter, escalating and surviving restart. | `src/lib/circuit-breaker.js` (+ test) | — |

**Build order.** s1 → s2 (s2 consumes s1's `readVerifyEvidence`). s3, s4, s5 are
independent and may be built in any order relative to each other and to s1/s2.
Max dependency-chain depth: 2 (s1→s2). No cycles.

**Acceptance-criteria coverage.** M1/M2 → s2; M3 → s2 (integration; no
`approveSubplans` code change); M4 → s1 (evidence) + s2 (consultation); M5 → s3;
M6 → s4; M7/M8/M9 → s5. Every parent metric maps to exactly one slice's tests.

**One resolved contradiction (see s5).** The parent's same-step threshold is
stated inconsistently (M7 + the "4th occurrence" scenario + CLAUDE.md say
escalate on the 4th; the persistence scenario's parenthetical says the 3rd). s5
resolves it to **escalate-on-exceed (4th same-step / 6th per-plan)** — matching
the majority and CLAUDE.md — and rewrites the M9 persistence test to prove
persistence under that same rule.

## 1. ASSESS

### Business Context

Gate 3 (review → done) is the human's last line of defense before work ships —
CLAUDE.md names it explicitly: "Prevents shipping unreviewed code." Every other
promise CTOC makes about quality (14-dimension review, `0 skipped` coverage,
circuit-breaker escalation instead of silent looping) is only real if something
actually evaluates it before the plan lands in `done/`. A gate whose validator is
structurally incapable of returning `valid:false` is not a stricter gate with a
bug — it is not a gate. It is a green light with a door frame around it. This is
one finding (C9) inside the broader `ctoc-self-audit-remediation` vision: a
seven-agent adversarial audit, re-verified against the running code, found the
5485-green test suite is a false green over a non-functional enforcement layer.
W05 is the workstream that makes the specific mechanism this codebase calls
"Gate 3" — plus the circuit breaker that is supposed to stop a plan from looping
forever against it — actually do the job its own documentation claims.

**Job to be done:** When I (the CTOC maintainer) approve a batch of sibling plans
from `review` to `done` via `approveSubplans`, I want the validator it runs per
sibling to be capable of rejecting an unfinished, unapproved, or unverified plan,
so that I can trust a `done/` plan was actually checked rather than merely moved.

**Impact Map:**
- **Goal:** Restore Gate 3 as a real human-approval checkpoint (vision success
  criterion 4: "Gate 3 can fail, Step 14 VERIFY is actually enforced, every
  in-progress→review path is validated, and the circuit breaker is real").
- **Actor:** The CTOC maintainer (human CTO) who calls `approveSubplans` /
  `approvePlan` at review→done, and every CTOC user running with permission
  prompts disabled, for whom this validator — not human re-reading of every
  line — is the practical backstop.
- **Impact:** An unfinished/unapproved/unverified plan is rejected at the
  review→done transition instead of silently crossing it; a plan that keeps
  failing the same step reaches the human instead of looping forever.
- **Deliverable:** A `validateReviewToDone` that can return `valid:false` with
  errors; a review gate that consults real VERIFY output; two closed
  validation-skip paths; a real, persistent, escalating kickback counter.

### Current State (verified against the running code)

- **`validateReviewToDone` cannot fail.** `src/lib/plan-validator.js:535-562`
  defines the function: it sets `result.valid = true` at construction
  (line 540) and the function body never reassigns `valid`. The
  `hasApproval` check (line 547) and the `hasUnresolved` check (line 555) each
  only ever `push` to `result.warnings` (lines 551, 558) — there is no
  `result.errors.push(...)` anywhere in the function and no `result.valid =
  false` anywhere in the function. There is no code path, for any input, that
  makes this function return `valid:false`.
- **This is not a spare/unused validator — it is the one `approveSubplans`
  runs.** `src/lib/actions.js:1028`: `const validator = fromStage ===
  'implementation' ? validateForQueue : validateReviewToDone;`. For
  `fromStage === 'review'` (the review→done batch), `approveSubplans` calls
  `validateReviewToDone` per sibling (line 1042) and only skips a sibling
  when `validation.valid === false` (line 1047) — a condition that, per the
  above, can never occur. Every sibling batch-approved from `review` passes
  unconditionally, regardless of its Step 14 checkbox state or whether it
  even has an `approved_by: human` marker.
- **The real VERIFY runner has zero callers.** `src/lib/step-13-verify.js`
  exports `runVerify(projectPath)`, which runs `ctoc quality --tier=1` or
  falls back to direct lint/typecheck/test/coverage commands and returns a
  `passed`/`checks`/`errors` result. No file under `src/` calls `runVerify`.
  Step 14 VERIFY, as implemented, never executes; nothing reads or persists
  the result it would produce, and `validateReviewToDone` does not look for
  any such artifact.
- **Two of three in-progress→review paths skip `validateForReview`
  entirely.** `src/lib/plan-validator.js:35` defines `validateForReview`,
  which does check step completeness and escalation statuses (unlike
  `validateReviewToDone`, it can actually fail). But:
  - `cleanupStaleInProgress` (`src/lib/actions.js:829-860`) calls
    `movePlan(plan.path, 'review', root)` directly (line 855) for every
    orphaned in-progress plan with no call to `validateForReview` anywhere
    in the function.
  - `moveToReviewAfterPush` (`src/lib/sync.js:122-145`) calls
    `safeFs.renameSync(planPath, newPath)` directly (line 139) with no call
    to `validateForReview` anywhere in the function.
  - Only the primary manual in-progress→review action runs
    `validateForReview`. A plan that goes stale (cleanup path) or is synced
    post-push (sync path) reaches the review/Gate-3 doorstep having been
    checked by nothing.
- **The documented circuit breaker does not exist in code.** CLAUDE.md and
  `docs/IRON_LOOP.md` both state: "Max 3 kickbacks to the same step, max 5
  total kickbacks per plan. If exceeded, escalate to the user." No file
  under `src/lib/` defines a kickback counter, increments one, persists one,
  or contains an escalation call keyed off a kickback count. There is
  presently no call site anywhere in the codebase where a step failure is
  recorded as a "kickback" event at all — the mechanism is undocumented in
  code as well as unimplemented.

### Impact

- **Immediate:** Any plan — including one with unchecked Step 14 boxes, no
  `approved_by: human` marker, and no verification ever run — crosses Gate 3
  the instant a human calls `approveSubplans`/`approvePlan` from `review`,
  because the validator backing that call cannot object. The four human
  gates CLAUDE.md calls "mandatory approval points" collapse to three real
  ones at the moment work actually ships.
- **Compounding:** Because two of three paths into `review` skip
  `validateForReview`, a plan can arrive at the (already-toothless)
  review→done gate having never been checked at all, at any point in its
  lifecycle — not even by the weaker, in-progress-only validator.
  `runVerify`'s zero callers means "Step 14 VERIFY" is a checklist item an
  agent ticks, not a command that ran; nothing distinguishes a genuinely
  passing suite from a checkbox someone (or some agent) checked.
  Compounding trust: an agent or a human can loop on the same failing step
  indefinitely with no escalation, so both symptoms of the underlying defect
  — unverified work reaching `done/`, and stuck plans nobody is told about —
  are invisible from the CLI. This is the exact blind spot the parent vision
  identifies: tests assert structure ("the function returns without
  throwing"), not truth ("the gate actually rejected the bad input").

## 2. ALIGN

Metrics — each is directly test-drivable against the functions/paths verified
above, with a fixture-plan-in / result-out shape:

| # | Metric | Test shape |
|---|---|---|
| M1 | `validateReviewToDone` returns `valid:false` with a non-empty `errors[]` for every one of: missing `approved_by: human`; an unchecked Step 14 VERIFY checkbox; absent VERIFY evidence. | Three fixture plans (one defect each) → assert `valid === false` and the specific error string. |
| M2 | `validateReviewToDone` returns `valid:true` for a fixture plan with all three conditions satisfied. | One fully-compliant fixture → assert `valid === true`, `errors.length === 0`. Prevents "always reject" overcorrection. |
| M3 | `approveSubplans('parent', 'review')` skips (does not move) a sibling whose fixture plan fails M1, and reports it in `skipped[]` with a reason. | Integration test over `approveSubplans` with a mixed batch (1 good, 1 bad sibling) → assert `approved` excludes the bad slug and `skipped` includes it with a non-empty reason. |
| M4 | The review→done path consults real VERIFY output: a fixture plan whose VERIFY evidence records a failing run is rejected; a fixture plan whose VERIFY evidence records a passing run is not rejected on that basis. | Two fixtures differing only in recorded VERIFY outcome → assert opposite `valid` results attributable to the VERIFY check. |
| M5 | `cleanupStaleInProgress` does not move a plan into `review` whose content would fail `validateForReview`, and reports/logs the reason instead of silently relocating it. | Fixture in-progress plan missing required-step content → assert it is NOT present in `plans/review/` after the function runs, and the skip is observable (return value or `.ctoc/logs/cleanup.json` entry). |
| M6 | `moveToReviewAfterPush` does not rename a plan into `review` whose content would fail `validateForReview`. | Same shape as M5, applied to the sync-triggered path. |
| M7 | A plan kicked back to the same step 3 times does not escalate; the 4th kickback to that step produces an observable human-facing escalation. | Simulate 4 sequential kickback-record calls for the same `(plan, step)` pair → assert no escalation after call 3, an escalation artifact/marker/message after call 4. |
| M8 | A plan that accumulates 5 total kickbacks across any steps does not escalate on the per-plan counter; the 6th produces an observable human-facing escalation, independent of which step it targets. | Simulate 6 kickback-record calls spread across ≥2 distinct steps for one plan → assert escalation fires only after the 6th. |
| M9 | Kickback counts persist across a simulated process restart (re-require the module / reload from disk) rather than living only in an in-memory variable. | Record 2 kickbacks, reload the counter source from disk, record a 3rd → assert the reload did not reset the count to 0. |

## 3. CAPTURE

### Acceptance Criteria

- [x] **Scenario: Rejects a plan missing the human-approval marker**
  Given a plan in `review` with all Step 14 VERIFY boxes checked and valid
  VERIFY evidence, but no `approved_by: human` marker
  When `validateReviewToDone` runs on it (as `approveSubplans` invokes it per
  sibling on the review→done batch)
  Then it returns `valid:false` with a non-empty `errors[]` naming the missing
  approval marker
  And `approveSubplans` reports this sibling in `skipped[]` rather than moving
  it to `done/`

- [x] **Scenario: Rejects a plan with an unchecked Step 14 VERIFY checkbox**
  Given a plan in `review` with a valid `approved_by: human` marker and VERIFY
  evidence present, but at least one Step 14 VERIFY checkbox unchecked
  When `validateReviewToDone` runs on it
  Then it returns `valid:false` with a non-empty `errors[]` naming the
  incomplete step
  And the plan is NOT moved to `done`

- [x] **Scenario: Rejects a plan with no VERIFY evidence at all**
  Given a plan in `review` with a valid approval marker and all Step 14
  checkboxes checked, but no recorded VERIFY run for this plan
  When `validateReviewToDone` runs on it
  Then it returns `valid:false` with a non-empty `errors[]` naming the missing
  VERIFY evidence
  And the plan is NOT moved to `done`

- [x] **Scenario: Accepts a genuinely finished plan**
  Given a plan in `review` with a valid `approved_by: human` marker, all
  required-step checkboxes checked (including Step 14 VERIFY), and VERIFY
  evidence recording a passing run
  When `validateReviewToDone` runs on it
  Then it returns `valid:true` with an empty `errors[]`
  And `approveSubplans` includes this sibling in `approved[]` and moves it to
  `done`

- [x] **Scenario: A failed real verification run blocks the transition**
  Given a plan whose recorded VERIFY evidence reports a failed test run (or
  coverage below 80%, or a skipped test)
  When the review→done gate evaluates the plan
  Then the transition is blocked and the specific VERIFY failure is surfaced
  in the returned error, not merely a generic "not approved" message

- [x] **Scenario: Stale-cleanup path is validated identically to the manual path**
  Given an orphaned in-progress plan that would fail `validateForReview` (e.g.
  a required step left unaddressed)
  When `cleanupStaleInProgress` processes it
  Then the plan is NOT moved into `review`
  And the skip is recorded (in the cleanup log or the function's return value)
  with the validation reason, rather than being silently left in place with no
  explanation

- [x] **Scenario: Post-push sync path is validated identically to the manual path**
  Given a plan submitted via `moveToReviewAfterPush` that would fail
  `validateForReview`
  When the sync path processes it
  Then the plan is NOT renamed into `review`
  And the caller receives an observable failure result naming the validation
  reason (mirroring the shape of the cleanup-path result)

- [x] **Scenario: Same-step kickback escalates on the 4th occurrence**
  Given a plan that has been kicked back to the same Iron Loop step 3 times
  When a 4th kickback to that same step occurs
  Then the system raises a human-facing escalation identifying the plan and
  the step
  And no such escalation exists after the 1st, 2nd, or 3rd kickback to that
  step

- [x] **Scenario: Per-plan total kickback escalates on the 6th occurrence across different steps**
  Given a plan that has accumulated 5 kickbacks spread across two or more
  different steps (none of which individually reached 3 on its own)
  When a 6th kickback (to any step) occurs for that plan
  Then the system raises a human-facing escalation identifying the plan and
  the total count
  And this escalation is distinct from the same-step escalation (fires purely
  on the cross-step total)

- [x] **Scenario: Kickback counts survive a process restart**
  Given a plan with 2 recorded kickbacks to a given step, persisted before the
  process exits
  When the process restarts and a 3rd kickback to that same step occurs
  Then the same-step escalation fires (3 recorded kickbacks trigger it, per
  the escalate-at-3 rule), proving the count was not reset to 0 by the restart

### Scope

#### In Scope
- Give `validateReviewToDone` a real failure path with an `errors[]` and
  `valid:false` for: missing `approved_by: human`; any unchecked required-step
  checkbox (notably Step 14 VERIFY); absent VERIFY evidence. *(Criteria:
  "Rejects a plan missing the human-approval marker," "Rejects a plan with an
  unchecked Step 14 VERIFY checkbox," "Rejects a plan with no VERIFY evidence
  at all," "Accepts a genuinely finished plan.")*
- Consult real VERIFY output (the `runVerify` result or a persisted artifact of
  it) from the review→done path, and surface the specific failure when it
  reports a failed run. *(Criterion: "A failed real verification run blocks
  the transition.")*
- Route `cleanupStaleInProgress`'s in-progress→review move through
  `validateForReview`, with the skip observable and reasoned. *(Criterion:
  "Stale-cleanup path is validated identically to the manual path.")*
- Route `moveToReviewAfterPush`'s in-progress→review move through
  `validateForReview`, with the same observable-skip contract. *(Criterion:
  "Post-push sync path is validated identically to the manual path.")*
- Implement a per-step kickback counter, persisted, that escalates to the
  human at the 4th kickback to the same step. *(Criterion: "Same-step
  kickback escalates on the 4th occurrence.")*
- Implement a per-plan total kickback counter, persisted, that escalates to
  the human at the 6th kickback across any steps. *(Criterion: "Per-plan
  total kickback escalates on the 6th occurrence across different steps.")*
- Kickback-count persistence across process restarts. *(Criterion: "Kickback
  counts survive a process restart.")*

#### Out of Scope
- **The enforcement/PreToolUse hooks and the exit-code protocol they use** —
  covered by W01 (`ctoc-audit-w01-*`), a sibling workstream of the same
  vision.
- **The approval-provenance ledger, marker forgery resistance, and
  move-plan.js multi-hop gate guard** — covered by W02
  (`ctoc-audit-w02-*`). W05 assumes `approved_by: human` is the marker the
  validator checks for; making that marker unforgeable is W02's job, not
  this one.
- **Agent-file frontmatter placement and registry path resolution** —
  covered by W03/W04.
- **Building the paired invariant/truthfulness tests that catch this defect
  class in general (skip-guard false-greens, coverage instrumentation)** —
  covered by W06. W06 supplies the general test-suite-honesty rework; W05
  supplies the specific failing-then-passing tests for the gate logic
  described in the Test Strategy below, which is a narrower, in-scope
  deliverable of this stub, not W06's broader mandate.
- **Choosing which escalation channel (menu banner, status file, log entry)
  the human sees** — the *fact* of an observable escalation is in scope
  (asserted by the acceptance criteria); the specific UI/channel is an
  implementation choice, deferred to Steps 5-7.
- **Re-architecting the Iron Loop step model or the plan-stage set** — out of
  scope per the parent vision; W05 makes the existing gate/breaker model
  work as documented, not a different model.

### Story Breakdown (INVEST)

| Story | I | N | V | E | S | T |
|---|---|---|---|---|---|---|
| **[MVP]** As the CTOC maintainer, I want `validateReviewToDone` to return `valid:false` with an error when the `approved_by: human` marker is missing, so that an unapproved plan cannot cross Gate 3. | Y — own function, no dependency on other stories | Y — no implementation prescribed | Y — directly restores gate-can-deny | Y — single-file, single-branch change | Y — one Iron Loop cycle | Y — Given/When/Then above |
| As the CTOC maintainer, I want the validator to error when any required-step checkbox — especially Step 14 VERIFY — is unchecked, so that unfinished plans are rejected. | Y — shares the function but is an independent branch | Y | Y — closes the specific C9 unimplemented-plan case | Y | Y | Y |
| As the CTOC maintainer, I want the validator to error when no VERIFY evidence exists for the plan, so that "green tests" cannot be assumed rather than shown. | Y | Y | Y — this is the story that makes "green" mean something | Y (once the evidence shape from the next story is decided) | Y | Y |
| **[MVP]** As the CTOC maintainer, I want `runVerify` (or its persisted artifact) consulted by the review gate, so that Gate 3 reflects a real verification run. | Y | Y — doesn't prescribe runner-vs-artifact | Y — the load-bearing fix; without it "VERIFY evidence" has nothing to check | Y | Y | Y |
| As the CTOC maintainer, I want `cleanupStaleInProgress` to route its in-progress→review move through `validateForReview`, so that stale-cleanup cannot smuggle an unvalidated plan into review. | Y — isolated to one function | Y | Y — closes one of the two named skip paths | Y | Y | Y |
| As the CTOC maintainer, I want `moveToReviewAfterPush` to route its move through `validateForReview`, so that the post-push path is validated identically to the primary path. | Y — isolated to one function, independent of the cleanup-path story | Y | Y — closes the second named skip path | Y | Y | Y |
| **[MVP]** As the CTOC maintainer, I want per-step kickback counters that escalate to the human at 3 kickbacks to the same step, so that a plan cannot silently loop forever on one step. | Y — new counter, no dependency on the validator stories above | Y — doesn't prescribe storage location | Y — directly restores a documented safety promise | Y — needs a persistence decision (see Decisions below) but is otherwise self-contained | Y | Y |
| As the CTOC maintainer, I want a per-plan total-kickback counter that escalates at 5, so that death by a thousand kickbacks across different steps still reaches me. | Y — shares persistence with the previous story but is a distinct counter and a distinct escalation condition | Y | Y | Y | Y | Y |

All eight stories pass INVEST. The two counter stories (per-step, per-plan)
share a persistence mechanism but deliver value independently — the per-step
counter alone already stops the tightest, most damaging loop (a plan hammering
one step forever), so they may ship in either order or in parallel slices.

### Files Likely Touched

- `src/lib/plan-validator.js` — `validateReviewToDone` (add the `errors[]` /
  `valid:false` path); likely reuses or calls into the existing
  `validateStepsComplete` helper (already used by `validateForReview`) rather
  than re-implementing step-checkbox parsing.
- `src/lib/step-13-verify.js` — `runVerify` needs an actual caller and,
  depending on the runner-vs-artifact decision below, a function to persist
  its result so `validateReviewToDone` can read evidence without re-running
  the full suite synchronously inside a validation call.
- `src/lib/actions.js` — `cleanupStaleInProgress` (insert the
  `validateForReview` call before `movePlan`, mirror the skip/log contract
  already used by the primary in-progress→review action); `approveSubplans`
  is unchanged in structure (it already calls `validateReviewToDone` and
  already honors `valid:false` — it inherits the fix for free once the
  validator can fail).
- `src/lib/sync.js` — `moveToReviewAfterPush` (insert the `validateForReview`
  call before `safeFs.renameSync`, return an observable `{ moved: false,
  reason }` shape consistent with its existing `{ moved: false, reason:
  'auto-move disabled' }` early return).
- A new kickback-counter module (e.g. `src/lib/circuit-breaker.js`) — record
  a kickback for `(planSlug, step)`, read per-step and per-plan totals,
  expose an escalation check. No existing call site in the codebase currently
  marks a step failure as a "kickback" event; Steps 5-7 (implementation
  planner) must also identify or create the call site that invokes this
  module when a plan is sent back to a prior step, since none exists today.
- Kickback-counter persistence target — plan frontmatter (recommended; see
  Decisions Taken Under Ambiguity) — meaning the plan file itself
  (`plans/**/*.md`) is also touched by every kickback-recording write, not
  only by the new module that writes it.

### Test Strategy

Every test below must be RED against the current code (verified above) and
GREEN only after the corresponding fix — no test is written against
speculative future behavior.

1. **`validateReviewToDone` failure-path tests** (new or extended
   `tests/plan-validator.test.js` or a new
   `tests/gate3-review-to-done.test.js`): fixture plans for each of the three
   defect conditions (missing marker, unchecked Step 14 box, missing VERIFY
   evidence) plus one fully-compliant fixture. RED today because
   `result.valid` is hardcoded `true` with no `errors.push` path to flip it;
   GREEN once the errors path exists. Directly covers M1/M2.
2. **`approveSubplans` integration test**: a mixed two-sibling batch (one
   compliant, one carrying a defect) run through `approveSubplans(parentSlug,
   'review')`. RED today because both siblings are unconditionally approved
   (the `validation.valid === false` branch at `actions.js:1047` is
   currently unreachable for this validator); GREEN once
   `validateReviewToDone` can return `valid:false` and the bad sibling lands
   in `skipped[]`. Covers M3.
3. **VERIFY-consultation test**: two fixtures identical except for recorded
   VERIFY outcome (pass vs. fail), asserting the review gate's result differs
   because of that recorded outcome specifically (not because of an
   unrelated checkbox difference). RED today because nothing reads VERIFY
   evidence at all; GREEN once the review path consults it. Covers M4.
4. **`cleanupStaleInProgress` validation-gate test**: an orphaned in-progress
   fixture plan that would fail `validateForReview`, run through
   `cleanupStaleInProgress`, asserting it is absent from `plans/review/`
   afterward and the skip is logged/returned with a reason. RED today
   because the function moves every orphaned plan unconditionally; GREEN
   once the `validateForReview` call gates the move. Covers M5.
5. **`moveToReviewAfterPush` validation-gate test**: same shape as (4)
   applied to the sync path, asserting the rename does not occur and an
   observable failure result is returned. RED today (no validation call
   present); GREEN after. Covers M6.
6. **Circuit-breaker same-step test**: simulate 4 sequential kickback-record
   calls for one `(plan, step)` pair; assert no escalation artifact exists
   after calls 1-3 and one exists after call 4. RED today because no
   counter/escalation code exists to call at all — this test cannot even be
   written against current code without a stub target, so it is written
   against the new module's intended interface and is RED by "module does
   not exist" until the module ships. Covers M7.
7. **Circuit-breaker per-plan test**: simulate 6 kickback-record calls spread
   across ≥2 distinct steps for one plan; assert escalation fires only after
   call 6, independent of any single step reaching 3. Covers M8.
8. **Circuit-breaker persistence test**: record 2 kickbacks, reload the
   counter source from disk (re-require the module or re-read the plan
   frontmatter, per whichever persistence target ships), record a 3rd, and
   assert the same-step escalation still fires at exactly 3 — proving state
   survived the reload rather than resetting. Covers M9.

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** This is a technical remediation workstream; a
  BMC is N/A. Proceeded without kicking back per the vision decomposition
  brief.
- **Kickback-counter persistence target: plan frontmatter (recommended).**
  The vision leaves the store unspecified ("whether they live in
  `.ctoc/state/` or plan frontmatter is an implementation choice"). This
  refinement makes the call: **plan frontmatter** (e.g. a `kickback_counts:`
  block recording per-step counts and a running total), not a separate
  `.ctoc/state/` file. Reasoning: the counter travels with the plan file it
  describes, survives independently of any separate state directory being
  present or writable, is visible to the human simply by opening the plan
  (consistent with how `approved_by: human` and Step checkboxes already live
  in-file), and needs no new file-lifecycle handling (creation, cleanup on
  plan move/delete) beyond what plan files already get. The rejected
  alternative — a keyed `.ctoc/state/kickbacks.json` — was set aside because
  it is an extra source of truth that can drift from the plan it describes
  and is invisible when reading the plan directly. If Steps 5-7 (the
  implementation planner) find a concrete technical blocker to
  frontmatter-based counters (e.g. write contention from concurrent
  background agents editing the same plan file), that constraint must be
  documented and escalated rather than silently switched to a different
  store.
- **VERIFY evidence means a persisted `runVerify` artifact, not (only)
  checkbox state.** The vision permitted either "invoking `runVerify`
  directly at the gate or consulting a persisted VERIFY artifact"; this
  refinement resolves the narrower question of what counts as "VERIFY
  evidence" for the review→done check specifically. Decision: the primary
  VERIFY-evidence check must consult a **persisted artifact produced by an
  actual `runVerify` execution** for this plan (pass/fail, per-check detail,
  and a timestamp not older than the plan's last content change), not merely
  whether the Step 14 checkboxes in the plan body are ticked. Reasoning: a
  checkbox is self-reported by whichever agent or human edits the plan file
  — exactly the same trust problem the parent vision names for
  `approved_by: human` (finding C4: "self-asserted text in an
  agent-writable file"). An artifact tied to an actual command run closes
  the loophole a checkbox cannot. Step 14 checkbox state remains a secondary
  check (both must hold — belt and suspenders), but is not sufficient on its
  own to satisfy "VERIFY evidence exists." Whether the artifact lives
  alongside the kickback counters in plan frontmatter or in a separate
  `.ctoc/state/verify/` location is left to Steps 5-7, since unlike the
  kickback counters this data is produced by a tool run rather than authored
  by a human/agent, and the durability tradeoff differs.
- **Escalation channel unspecified.** The vision requires escalation "to the
  human" but not the medium (menu banner, status message, log entry). Left
  to implementation; the acceptance criteria assert an observable
  human-facing escalation exists, not which channel carries it.
- **Kickback call site does not yet exist and must be located or created.**
  Confirmed during ASSESS: no file under `src/lib/` currently marks any
  event as a "kickback" at all — the mechanism is undocumented in code, not
  merely unenforced. This refinement flags (rather than silently assumes)
  that Steps 5-7 must first identify where a step-failure-and-retry
  currently happens in the Iron Loop flow (or add that call site) before the
  counters described here can be wired to real events; the acceptance
  criteria are written against the counter/escalation module's behavior
  directly (via simulated record calls) so they do not block on that
  call-site decision being made first.


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
