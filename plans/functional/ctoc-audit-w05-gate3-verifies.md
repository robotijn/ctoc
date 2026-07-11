---
title: "W05 — Gate 3 Verifies Real Work"
created: "2026-07-11T00:00:00Z"
type: stub
parent_vision: "vision/ctoc-self-audit-remediation.md"
priority: HIGH
status: stub
depends_on: none
---

# W05 — Gate 3 Verifies Real Work

## Problem

Gate 3 (review → done) is structurally incapable of failing, and the machinery it
was supposed to trigger is dead:

- **`validateReviewToDone` can never return `valid:false`.** It sets `valid: true`
  and only ever pushes to a `warnings` array — there is no `errors` path and no
  code path that flips `valid` to false. This is the exact validator that
  `approveSubplans` runs per sibling on the review→done transition, so an
  unimplemented plan with unchecked Step 14 boxes and no approval crosses Gate 3
  as cleanly as a finished one.
- **The real VERIFY runner has zero callers.** `step-13-verify.js` exports
  `runVerify` (lint, typecheck, full test run, coverage ≥ 80%, 0 skipped), but a
  grep of `src/` finds no call site. The gate that is supposed to be enforced by
  running it never runs it, and never reads an artifact it produced.
- **Two of three in-progress→review paths skip validation.** Only one path calls
  `validateForReview`. `cleanupStaleInProgress` (in `actions.js`) and
  `moveToReviewAfterPush` (in `sync.js`) move plans into `review` without any
  validation gate, so a plan can reach the Gate-3 doorstep having been checked by
  nothing.
- **The documented circuit breaker is vapor.** CLAUDE.md and IRON_LOOP.md promise
  "max 3 kickbacks to the same step, max 5 total per plan, then escalate to the
  user." No counter, no persistence, and no escalation is implemented anywhere —
  a plan can bounce off the same step forever with no human ever being told.

## Scope

Make Gate 3 a gate that can say no, and make the paths into it honest.

1. Give `validateReviewToDone` a real failure path: return `valid:false` (an
   **error**, not a warning) when the `approved_by: human` marker is absent, when
   any required-step checkbox (notably Step 14 VERIFY) is unchecked, or when there
   is no VERIFY evidence for the plan.
2. Wire `runVerify` (or the artifact it writes) into the review gate so Gate 3
   consults actual verification output rather than assuming it.
3. Route both validation-skipping in-progress→review paths
   (`cleanupStaleInProgress`, `moveToReviewAfterPush`) through `validateForReview`
   so no plan reaches review unvalidated.
4. Implement kickback counters (per-step and per-plan) that persist across the
   loop and escalate to the human at 3 kickbacks to the same step and 5 total per
   plan.

**Does NOT touch:** the enforcement/PreToolUse hooks (W01), the approval-provenance
ledger or move-plan multi-hop guard (W02), agent-file frontmatter or registry
resolution (W03/W04), or the test-suite truthfulness rework (W06) — W06 supplies
the paired tests that catch this defect class, but the gate logic itself lives here.

## Story Map

**Goal:** Gate 3 rejects unverified, unapproved, or unimplemented work, and a plan
that keeps failing a step reaches the human instead of looping silently.

- **Success metric:** An unimplemented plan (unchecked Step 14 boxes, no approval,
  no VERIFY evidence) is REJECTED at review→done in an automated test; a 4th
  kickback to the same step raises a human-facing escalation. Both are red before
  this workstream and green after.

### Activity 1 — Make the review→done validator able to fail
- `[MVP]` As the CTOC maintainer, I want `validateReviewToDone` to return
  `valid:false` with an error when the human-approval marker is missing, so that an
  unapproved plan cannot cross Gate 3.
  - INVEST: Independent (own function), Valuable (gate can deny), Small, Testable.
- As the CTOC maintainer, I want the validator to error when any required-step
  checkbox — especially Step 14 VERIFY — is unchecked, so that unfinished plans are
  rejected.
- As the CTOC maintainer, I want the validator to error when no VERIFY evidence
  exists for the plan, so that "green tests" cannot be assumed rather than shown.

### Activity 2 — Enforce VERIFY and close the skip paths
- `[MVP]` As the CTOC maintainer, I want `runVerify` (or its persisted artifact)
  consulted by the review gate, so that Gate 3 reflects a real verification run.
  - INVEST: Independent, Valuable, Estimable, Small, Testable.
- As the CTOC maintainer, I want `cleanupStaleInProgress` to route its
  in-progress→review move through `validateForReview`, so that stale-cleanup cannot
  smuggle an unvalidated plan into review.
- As the CTOC maintainer, I want `moveToReviewAfterPush` to route its move through
  `validateForReview`, so that the post-push path is validated identically to the
  primary path.

### Activity 3 — Make the circuit breaker real
- `[MVP]` As the CTOC maintainer, I want per-step kickback counters that escalate to
  the human at 3 kickbacks to the same step, so that a plan cannot silently loop.
  - INVEST: Independent, Valuable, Small, Testable.
- As the CTOC maintainer, I want a per-plan total-kickback counter that escalates at
  5, so that death by a thousand kickbacks across different steps still reaches me.

## Rough acceptance criteria (Given/When/Then)

- **Rejects the unfinished plan.** Given a plan in `review` with unchecked Step 14
  VERIFY boxes, no `approved_by: human` marker, and no VERIFY evidence, When
  `validateReviewToDone` runs (as `approveSubplans` invokes it per sibling), Then it
  returns `valid:false` with an error and the plan is NOT moved to `done`.
- **Accepts a real finished plan.** Given a plan with all required-step boxes
  checked, a valid approval marker, and VERIFY evidence present, When the validator
  runs, Then it returns `valid:true`.
- **VERIFY is consulted.** Given a plan whose VERIFY artifact reports a failed test
  run, When the review gate evaluates it, Then the gate blocks the transition and
  surfaces the failure.
- **Skip paths are closed.** Given a plan moved by `cleanupStaleInProgress` (or
  `moveToReviewAfterPush`), When it lands in `review`, Then `validateForReview` has
  run against it (asserted via its effect/marker), not been bypassed.
- **Same-step escalation.** Given a plan that has been kicked back to the same step
  3 times, When a 4th kickback to that step occurs, Then the system escalates to the
  human rather than looping.
- **Per-plan escalation.** Given a plan that has accumulated 5 total kickbacks across
  any steps, When a 6th occurs, Then the system escalates to the human.

## Findings addressed

- **C9** — Gate 3's validator can never return `valid:false`; the VERIFY runner has
  zero callers; two of three in-progress→review paths skip validation; the
  documented circuit breaker is implemented nowhere.

## INVEST status (per story)

| Story | I | N | V | E | S | T |
|---|---|---|---|---|---|---|
| Validator errors on missing approval `[MVP]` | Y | Y | Y | Y | Y | Y |
| Validator errors on unchecked required-step box | Y | Y | Y | Y | Y | Y |
| Validator errors on absent VERIFY evidence | Y | Y | Y | Y | Y | Y |
| Wire runVerify/artifact into review gate `[MVP]` | Y | Y | Y | Y | Y | Y |
| Route cleanupStaleInProgress through validateForReview | Y | Y | Y | Y | Y | Y |
| Route moveToReviewAfterPush through validateForReview | Y | Y | Y | Y | Y | Y |
| Per-step kickback counter + escalate at 3 `[MVP]` | Y | Y | Y | Y | Y | Y |
| Per-plan kickback counter + escalate at 5 | Y | Y | Y | Y | Y | Y |

All stories pass INVEST. Each is buildable and testable in isolation; the two
counter stories share a persistence mechanism but deliver value independently
(per-step alone already stops the tightest loop).

## Decisions Taken Under Ambiguity

- **No Business Model Canvas.** This is a technical remediation workstream; a BMC is
  N/A. Proceeded without kicking back per the vision decomposition brief.
- **VERIFY wiring left as runner-or-artifact.** The vision permits either invoking
  `runVerify` directly at the gate or consulting a persisted VERIFY artifact. The
  implementation planner (Steps 5–7) will choose; the behavior asserted here
  ("Gate 3 reflects a real verification run") holds under either.
- **Escalation channel unspecified.** The vision requires escalation "to the human"
  but not the medium (menu alert, status message, log). Left to implementation; the
  acceptance criteria assert an observable human-facing escalation, not a channel.
- **Circuit-breaker state store unspecified.** Kickback counters need persistence
  across the loop; whether they live in `.ctoc/state/` or plan frontmatter is an
  implementation choice. Behavior (escalate at 3/step, 5/plan) is what tests drive.
