# Functional Plan: The honest "not-evaluated" plan verdict reaches every plan

> Created: 2026-07-27
> Status: Draft
> Author: CTO Chief (surfaced by the review-backlog rework sweep)

---

## 1. ASSESS - Problem Understanding

### Context
The plan critic no longer fabricates a score — `src/lib/iron-loop.js` returns the
honest `not-evaluated` verdict (`evaluated: false`, `scores: null`) so the human at
the technical-approach gate reads that nothing machine-checked the plan. That was the
win of the earlier "plan critic stops reporting a score it did not earn" work.

But the verdict is only written if the critic actually runs, and it does **not** run
for plans carrying `iron_loop: true`: `src/lib/actions.js` (around line 603)
early-returns `if (metadata.iron_loop) return;` before `refineLoop`. Every plan in
the repair queue carries that flag, so the honest verdict never lands where the human
reads it — the plan comes back byte-identical, with no verdict at all.

### Current State
- Primary honesty win holds: the fabricated-score code is deleted, so no plan can
  ever show a machine score it did not earn.
- Residual gap: on an `iron_loop` plan the human sees *no* machine verdict, rather
  than an explicit "not-evaluated / nothing machine-checked this."

### Impact
Not dangerous — a missing verdict is safer than a fabricated one. But it is
incomplete honesty exactly where the honesty principle matters most: the moment the
human decides whether a plan's technical approach is sound.

---

## 2. ALIGN - Business Alignment

### Goal
Decide, and then encode, whether the honest "not-evaluated" verdict should reach the
plans the human actually reads at the gate.

### Success Metrics
*(Gated on the decision below — stated conditionally so the metric matches the answer.)*
- [ ] If the verdict should reach every plan: after processing, an `iron_loop` plan
      comes back **with** the explicit not-evaluated verdict written into it, proven
      by a regression test.
- [ ] If the early-return is correct as-is: the intent is **documented at the call
      site** so the next reader does not re-litigate it, and a test pins the intended
      behavior.
- [ ] The full gate is green either way (whole suite + coverage floor + zero skipped).

### Constraints
This touches plan-processing control flow (`actions.js`), adjacent to the gate
pipeline. Full Iron Loop, human at every gate.

---

## 3. CAPTURE - Requirements

### The decision this plan exists to resolve (THE fork — the human's call)
The early-return `if (metadata.iron_loop) return;` has **three defensible readings**,
each implying a different fix. The code cannot tell you which is intended:

| Reading | What it means | Implied action |
|---|---|---|
| (a) Idempotency guard | The flag means "this plan already has its iron-loop section; don't re-inject." | Possibly no change — but write the verdict on the *first* pass, before the section exists. |
| (b) Deliberate opt-out | `iron_loop` plans intentionally skip the critic. | Keep as-is; **document** the opt-out at the call site so it is not read as a bug. |
| (c) Overloaded flag | One flag conflates "already injected" with "skip the critic," and they should be separate. | **Split** the flag so the honest verdict reaches every plan regardless of injection state. |

Recommendation to inform the choice, not to pre-empt it: reading **(c)** best serves
the honesty principle — the whole point of the not-evaluated verdict is that the
human sees it, and today the plans that carry the flag are exactly the ones that never
do. But (a)/(b) are defensible and cost nothing, so this is surfaced for the human's
Gate-1 decision rather than guessed.

### Functional Requirements (finalized once the reading is chosen)
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Encode the chosen reading | Must | Behavior matches the selected reading; a regression test pins it |
| FR-2 | Document the intent at the call site | Must | `actions.js` states why the branch behaves as it does, so it is never re-litigated |

### Out of Scope
- Reviving any form of fabricated/automated scoring — deleted for cause.

---

*Follows the CTOC Iron Loop (Steps 1-3). The design fork above must be answered by the
human before technical planning — it is not a documented-choice-under-ambiguity item;
it is a real fork that changes the outcome.*
