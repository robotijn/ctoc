# Functional Plan: The honest "not-evaluated" plan verdict reaches every plan

> Created: 2026-07-27
> Refined: 2026-07-27 (Product Owner agent — functional-plan hardening pass)
> Status: Draft — human Gate-1 decision RECEIVED (2026-07-27): reading **(c) — split
>   the flag** was selected by the human. `iron_loop` keeps meaning "Steps 8-16 section
>   present"; a new `iron_loop_verdict` field independently gates verdict-writing, so
>   the honest not-evaluated verdict reaches every plan. Implement reading (c)'s
>   acceptance criteria in CAPTURE. The corpus-backfill remains out of scope (the
>   review-backlog rework sweep already touched the existing plans); this fix only
>   closes the code path that produced the gap.
> Author: CTO Chief (surfaced by the review-backlog rework sweep)

---

## 1. ASSESS - Problem Understanding

### Context
The plan critic no longer fabricates a score. `src/lib/iron-loop.js`'s `refineLoop`
(lines 303-344, confirmed by direct read) returns the honest `not-evaluated` verdict
(`status: 'not-evaluated'`, `evaluated: false`, `scores: null`, plus a
`deferredQuestions` entry carrying the `NOT EVALUATED — no automated critique was
performed on this plan.` warning). That was the win of the earlier "plan critic stops
reporting a score it did not earn" work.

The verdict only reaches a plan's body if `applyIronLoop` (in `src/lib/actions.js`)
actually calls `refineLoop` and then `appendDeferredQuestions`. Confirmed by direct
read: `applyIronLoop` opens with

```
if (metadata.iron_loop) {
  return; // Already has Iron Loop
}
```

at `src/lib/actions.js` line 603, and this is the FIRST thing the function does —
before `refineLoop` runs, before anything is appended. `applyIronLoop` itself is only
ever invoked from one place: `if (to === 'todo') applyIronLoop(planPath);` inside the
gate-crossing code (`src/lib/actions.js` line ~490-492), i.e. only on the
implementation → todo crossing, the moment a plan's technical design is accepted into
the build queue. So a plan that already carries `iron_loop: true` in its frontmatter
when it reaches that crossing never runs `refineLoop`, never runs `critique`, and
never gets `appendDeferredQuestions` called on it — it comes back byte-identical, with
no verdict of any kind, honest or otherwise.

**How a plan ends up flagged before ever receiving the honest verdict (the mechanism
that makes this a live bug, not a hypothetical one).** This part is inference from the
code, not independently verified against the actual repair-queue plan files — flagged
as such. `applyIronLoop`'s own comment (lines 611-619) documents that the honesty fix
changed WHEN the verdict section is appended: the prior condition was
`status === 'max-rounds'`, which "essentially never fired because the loop
early-accepted on round one," so historically almost no plan that passed through the
pre-fix `applyIronLoop` ever received a verdict in its body — but every one of them
still got `integrate()`'s Steps 8-16 template appended and `iron_loop: true` stamped,
because those two actions were never gated on the old condition. That is exactly the
state the stub's own diagnosis describes: "every plan in the repair queue carries that
flag." A plan in that state has the Steps 8-16 section (so re-running `integrate()` on
it would be wrong) but not the verdict (so skipping `refineLoop`/`appendDeferredQuestions`
on it is also wrong) — the single `iron_loop` boolean cannot express both facts at
once, and the line-603 guard picks the wrong one of the two.

The honesty-fix comment's own claim — "It now lands in every plan that reaches this
function" (line 617-618) — is true and yet incomplete: it correctly describes what
happens once `refineLoop` runs, but says nothing about which plans REACH the function
at all. The line-603 guard controls that, and it silently excludes exactly the plans
the honesty fix most needed to reach: the ones a pre-fix run already touched.

### Current State
- Primary honesty win holds: the fabricated-score code (the old five 1-to-5 dimension
  scores computed by grepping the template `generateExecutionPlan` had just written)
  is deleted. No plan can show a machine score it did not earn.
- Residual gap, confirmed by direct read of both files: on a plan whose frontmatter
  already has `iron_loop: true` when it crosses into the build queue, the human sees
  **no machine verdict at all** — not the honest one, not a fabricated one, nothing —
  rather than the explicit "not-evaluated / nothing machine-checked this" the honesty
  fix was built to guarantee.
- The gap is silent by construction: `applyIronLoop` returns `undefined` on the
  early-return path with no log line, no warning, no marker distinguishing "verdict
  intentionally withheld" from "verdict never considered."

### Impact
Not dangerous by itself — a missing verdict is strictly safer than a fabricated one,
and no plan can be mistaken for machine-approved because of this gap. But it is
incomplete honesty exactly at the moment the honesty principle matters most: when the
human decides a plan's technical design is sound enough to enter the build queue, and
then opens that same plan again to drive Steps 8-16 from it. Today, for every plan
that reaches that crossing already carrying `iron_loop: true`, that human-facing
artifact is silent on whether anything machine-checked it — which reads, to that
human, as indistinguishable from "nobody thought to check," even on plans where the
honest answer is simply "this was already handled, on a prior pass, under different
code."

---

## 2. ALIGN - Business Alignment

### Goal
Decide, and then encode, whether the honest "not-evaluated" verdict should reach every
plan the human actually reads at the build-queue crossing — including plans that were
already flagged `iron_loop: true` before this repair.

### Job to Be Done
When I am approving a plan's technical design to enter the build queue, and again when
I open that plan to drive Steps 8-16 from it, I want to know definitively whether an
automated critique ran on it, so I can decide whether I still need to review it myself
before treating any part of it as checked.

### Impact Map
- **Goal:** Preserve the honesty principle (Operating Lesson 5) at the one place it was
  quietly reopened: the human never reads a false "checked" signal, and never
  mistakes silence for "checked" either.
- **Actor:** The human crossing the implementation → todo gate, and the same human
  later opening that plan to execute Steps 8-16 from it.
- **Impact:** That human's read of "was this plan machine-checked?" changes from an
  accidental default (silence, indistinguishable between "intentionally skipped" and
  "the guard swallowed it") to a controlled one — either an explicit not-evaluated
  verdict is present, or its absence is a documented, intentional design fact the
  human can look up, not a gap nobody decided.
- **Deliverable:** One code change, in exactly the form the human selects among the
  three readings in CAPTURE below, plus a regression test that pins the chosen
  behavior for both a brand-new plan and an already-flagged plan, plus a comment at
  the `src/lib/actions.js` line-603 call site stating the chosen intent so it is never
  re-litigated.

### Success Metrics
*(Gated on the decision below — stated conditionally so the metric matches the answer.)*
- [ ] If the verdict should reach every plan (readings a or c): after processing, a
      plan that already carried `iron_loop: true` before this fix comes back **with**
      the explicit not-evaluated verdict written into its body, proven by a
      regression test that constructs exactly that plan state.
- [ ] If the early-return is correct as-is (reading b): the intent is **documented at
      the call site** so the next reader does not re-litigate it, a test pins the
      intended no-op behavior for an already-flagged plan, and the human is shown —
      not silently left to infer — which already-flagged plans have no verdict.
- [ ] The full CTOC quality gate (whole suite + coverage floor + zero skipped) is
      green under whichever reading is implemented. This metric does not fork; it
      applies identically regardless of which reading the human picks.

### Constraints
This touches plan-processing control flow (`actions.js`), adjacent to the gate
pipeline. Full Iron Loop, human at every gate. No new dependency is needed; the fix is
internal control flow plus, for reading (c) only, one additional frontmatter field.

---

## 3. CAPTURE - Requirements

### The decision this plan exists to resolve (THE fork — the human's call)
The early-return `if (metadata.iron_loop) return;` has **three defensible readings**,
each implying a different fix. The code cannot tell you which is intended, and this
plan does not pick one:

| Reading | What it means | Implied action |
|---|---|---|
| (a) Idempotency guard | The flag means "the Steps 8-16 template section already exists; don't regenerate it" — and nothing more. It was never meant to also gate the verdict. | Decouple the two idempotency checks inside `applyIronLoop`: whether the Steps 8-16 section already exists gates `integrate()`; whether the not-evaluated verdict text already exists in the body gates `refineLoop`/`appendDeferredQuestions`, checked independently, using the SAME `iron_loop` field. |
| (b) Deliberate opt-out | `iron_loop: true` plans intentionally skip the critic once flagged — because the build-queue crossing is a one-time human decision, and re-verdicting a plan already accepted into the build queue would retroactively apply a new audit standard the human never asked for. | Keep the current behavior as-is; **document** the opt-out at the call site so it is not read as a bug; explicitly surface to the human which already-flagged plans have no verdict, rather than leaving that fact undiscoverable. |
| (c) Overloaded flag | One boolean field conflates two independent facts — "the Steps 8-16 section has been generated" and "the not-evaluated verdict has been written" — and a plan touched by pre-fix code can be true on the first and false on the second, a state the single flag cannot express. | **Split** the flag: keep `iron_loop: true` for section-generation idempotency, add a second field (e.g. `iron_loop_verdict: true`) tracked independently, so the honest verdict reaches every plan regardless of the first flag's state. |

Recommendation to inform the choice, not to pre-empt it: reading **(c)** best serves
the honesty principle — the whole point of the not-evaluated verdict is that the human
sees it, and today the plans that carry the flag are exactly the ones that never do,
because the flag was doing two jobs and only one of them is visible in its name. But
(a) achieves the same observable outcome with no new frontmatter field, and (b) is
genuinely defensible if the build-queue crossing really is meant to be a one-time,
non-retroactive decision — both cost less than (c) in different ways. This is
surfaced for the human's Gate-1 decision rather than guessed. **This recommendation is
advisory only; no reading has been selected by this plan.**

### Functional Requirements (finalized once the reading is chosen)
| ID | Requirement | Priority | Acceptance Criteria |
|----|-------------|----------|---------------------|
| FR-1 | Encode the chosen reading | Must | See "Acceptance Criteria (conditional on the chosen reading)" below — one concrete Given/When/Then set per reading, already written so whichever reading is picked has its criteria ready. |
| FR-2 | Document the intent at the call site | Must | `src/lib/actions.js`'s line-603 guard carries a comment stating why the branch behaves as it does under the chosen reading, so it is never re-litigated. Content of the comment differs per reading (see the "Implied action" column above); the requirement to have one does not. |

### User Stories

**As** the human approving a plan's technical design to enter the build queue,
**I want** every plan that reaches that point to either show me an explicit
not-evaluated verdict or make it discoverable — at the code level — why it doesn't,
**so that** I never mistake silence for "this was checked" on a plan I am about to
build from.

*INVEST check: Independent — buildable without any other open story; only FR-1/FR-2
must land first. Negotiable — describes the observable outcome, not which of the
three readings delivers it. Valuable — the benefit accrues to the human reading the
plan, not to the code. Estimable — one function, one call site, bounded. Small — fits
one Iron Loop cycle regardless of which reading is chosen. Testable — each reading's
Given/When/Then below is directly automatable.*

**As** a CTOC maintainer reading `src/lib/actions.js` after this fix ships,
**I want** the `iron_loop` flag's intended meaning fixed at its one call site,
**so that** I do not have to re-derive, from scratch, which of three plausible
readings is correct the next time I touch plan-processing control flow.

*INVEST check: Independent — documentation lands regardless of which reading is
chosen (only its content varies). Negotiable — states the need for a comment, not its
exact wording. Valuable — saves the next reader the exact re-investigation this plan
itself required. Estimable — a few lines. Small — trivially one cycle. Testable — a
comment's presence and content are grep-able / reviewable.*

**As** the human who ran the review-backlog repair sweep that surfaced this gap,
**I want** to be able to tell, for any plan already carrying `iron_loop: true`,
whether it has a verdict or is a known, documented gap,
**so that** "no verdict" never means "nobody looked," even for plans processed before
this fix existed.

*INVEST check: Independent — testable without the other two stories landing first,
though its concrete acceptance criteria bifurcate by reading (below). Negotiable —
names the outcome (distinguishable states), not the mechanism (a second flag vs. a
documented list vs. a backfill). Valuable — directly closes the "byte-identical, no
verdict at all" gap named in ASSESS. Estimable — bounded by the same fix as FR-1.
Small — no separate implementation slice; it is satisfied by whichever of the three
Given/When/Then sets below the human selects. Testable — each reading's scenarios
below state the observable, checkable outcome.*

### Acceptance Criteria (conditional on the chosen reading)

One concrete scenario set per reading, written now so whichever reading the human
picks at Gate 1 already has its acceptance criteria — none of the three is assumed.

**If reading (a) — idempotency guard — is chosen:**

- [ ] **Scenario: A brand-new plan crosses into the build queue for the first time**
  Given a plan with no `iron_loop` field in its frontmatter
  When it crosses from implementation into the build queue
  Then the Steps 8-16 execution section is generated exactly once
  And the not-evaluated verdict is appended to the plan body
  And the plan's frontmatter is stamped `iron_loop: true`

- [ ] **Scenario: A plan already flagged `iron_loop: true` but missing the verdict text is reprocessed**
  Given a plan whose frontmatter already has `iron_loop: true`
  And its body does NOT contain the "## Deferred Questions" not-evaluated verdict
  When the plan is reprocessed through `applyIronLoop`
  Then the existing Steps 8-16 section is left untouched — not regenerated, not duplicated
  And the not-evaluated verdict IS appended to the plan body
  And a regression test constructs exactly this plan state (flag true, verdict absent) and asserts both outcomes together

- [ ] **Scenario: An already-verdicted plan is reprocessed without duplication**
  Given a plan whose body already contains the not-evaluated verdict
  When the plan is reprocessed through `applyIronLoop`
  Then the verdict section is not duplicated
  And the Steps 8-16 section is not regenerated

**If reading (b) — deliberate opt-out — is chosen:**

- [ ] **Scenario: A plan already flagged `iron_loop: true` is reprocessed**
  Given a plan whose frontmatter already has `iron_loop: true`, with or without a verdict already present in its body
  When the plan is reprocessed through `applyIronLoop`
  Then the function returns with the plan file byte-identical to before the call
  And a regression test pins this as the INTENDED behavior, with a comment explaining it is not the bug this plan describes

- [ ] **Scenario: The call site documents the opt-out**
  Given `src/lib/actions.js`'s `applyIronLoop` function, at the line-603 guard
  When a maintainer reads that guard
  Then an adjacent comment states plainly that `iron_loop: true` is a deliberate, one-time-only gate
  And names why: the build-queue crossing is a single human decision point, and re-verdicting a plan already accepted into it is out of scope
  And the comment references this plan by name so the reasoning is not lost

- [ ] **Scenario: Legacy plans without a verdict are made discoverable, not left silently unaccounted for**
  Given one or more plans flagged `iron_loop: true` by pre-fix code, with no verdict text in their bodies
  When the human asks which already-flagged plans have no machine verdict
  Then that list is producible (a script, a doc, or a menu surface — implementer's choice) rather than requiring the human to open every plan individually
  And the plan's own documentation states this gap is accepted and will not be retroactively backfilled by this fix

**If reading (c) — overloaded flag, split — is chosen:**

- [ ] **Scenario: A brand-new plan crosses into the build queue for the first time**
  Given a plan with neither `iron_loop` nor `iron_loop_verdict` set
  When it crosses from implementation into the build queue
  Then both fields become `true`
  And both the Steps 8-16 section and the not-evaluated verdict are written exactly once

- [ ] **Scenario: A legacy plan carries the old single flag but no verdict flag**
  Given a plan with `iron_loop: true` already set and no `iron_loop_verdict` field present
  When the plan is reprocessed through `applyIronLoop`
  Then the Steps 8-16 section is left untouched, guarded independently by `iron_loop`
  And the not-evaluated verdict IS appended, guarded independently by the absent `iron_loop_verdict`
  And `iron_loop_verdict: true` is then stamped
  And a regression test proves the two fields are checked independently — never combined into one condition — so a future edit cannot silently recouple them

- [ ] **Scenario: A fully-processed plan under the new scheme is not reprocessed**
  Given a plan with both `iron_loop: true` and `iron_loop_verdict: true`
  When the plan is reprocessed through `applyIronLoop`
  Then nothing is written — no duplicate section, no duplicate verdict

**Reading-independent (applies no matter which is chosen):**

- [ ] **Scenario: The full quality gate is green**
  Given the chosen reading is implemented and its regression test(s) added
  When `npm test` runs
  Then the whole suite passes, coverage is at or above the enforced floor, and zero tests are skipped

### Scope

#### In Scope
- Fixing the interaction between the `iron_loop` metadata flag and verdict-writing in
  `src/lib/actions.js`'s `applyIronLoop`, per whichever reading (a/b/c) the human
  selects at Gate 1.
- A regression test covering, at minimum, the "already-flagged, no verdict" plan
  state named in ASSESS — this is the exact state the bug lives in, and every
  reading's acceptance criteria above name it explicitly.
- A comment at the `src/lib/actions.js` line-603 call site stating the chosen intent.
- For reading (b) specifically: a way for the human to discover which already-flagged
  legacy plans have no verdict (script, doc, or menu surface — implementer's choice).
- For reading (c) specifically: introducing and wiring the second frontmatter field.

#### Out of Scope
- Reviving any form of fabricated/automated scoring — deleted for cause; this plan
  does not reopen that.
- Retroactively backfilling a verdict onto every historical plan already sitting in
  `done/`, `review/`, or elsewhere outside the active repair queue — the review-backlog
  rework sweep that surfaced this gap is the mechanism for touching those plans, not
  this fix. This plan closes the code path that would keep producing the gap; it does
  not itself re-walk the whole plan corpus.
- Choosing between readings (a), (b), and (c) — that choice is the human's Gate-1
  decision, not something this plan or its author decides.

### Risks

- **Risk:** Whichever reading is chosen, the two idempotency concerns (section
  generation vs. verdict writing) are easy to accidentally recombine in a future edit,
  silently reintroducing this exact bug.
  Likelihood: MEDIUM — the two concerns look like one boolean until you read the
  history in ASSESS.
  Impact: MEDIUM — a silent regression back to today's gap, on the exact honesty
  guarantee this fix exists to restore.
  Mitigation: Write the regression test as two separate assertions in the same test
  file, one per plan state (fresh plan; already-flagged-no-verdict plan), so a future
  edit that recouples the guards fails both, not one silently.

- **Risk (reading (c) only):** introducing a second frontmatter field
  (`iron_loop_verdict`) risks other code that reads plan metadata (e.g.
  `plan-validator.js`, `stale-detector.js`) not accounting for it and misclassifying
  plan state.
  Likelihood: LOW — `parseMetadata` is generic YAML parsing; the field is additive.
  Impact: LOW — at worst a stale-detector false positive/negative on plan state, not a
  gate violation.
  Mitigation: Before shipping reading (c), search every reader of `metadata.iron_loop`
  across `src/` to confirm none of them also needs to read the new field.

- **Risk (reading (b) only):** documenting the gap as accepted, without a companion
  way to see which specific plans lack a verdict, leaves those plans permanently
  unaudited with no human-visible signal that they are in that state — which is
  functionally the same silence ASSESS describes, just now labeled "intentional."
  Likelihood: HIGH — this is the exact state the repair sweep found today.
  Impact: MEDIUM — not dangerous per ASSESS, but the invisibility compounds the more
  plans accumulate in this state.
  Mitigation: Even under reading (b), ship the discoverability scenario above (listing
  already-flagged, verdict-less plans) so opting out is a seen decision, not a silent one.

---

*Follows the CTOC Iron Loop (Steps 1-3). The design fork above must be answered by the
human before technical planning — it is not a documented-choice-under-ambiguity item;
it is a real fork that changes the outcome. No reading has been picked by this plan.*
