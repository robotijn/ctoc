---
approved_by: human
approved_at: 2026-07-20T09:18:53.897Z
gate_crossed: implementation → todo
---

---
title: "An empty plan is a broken file to be told about, not a decision with four options"
type: implementation
parent_plan: none
depends_on: 00151-the-gate-screens-say-the-moment-not-the-number
priority: CRITICAL
program: fresh-repository-first-run
iron_loop: true
files:
  - "src/lib/streaming-gate.js"
  - "tests/empty-plan-is-not-a-decision.test.js"
---

# An empty plan is a broken file, not a decision

What the owner was shown, verbatim:

```
The plan file has no body yet — it is empty.
Approve discuss-suggestion-with-editor across Gate 3?
  1. Check validation — Recommended — show exactly which checks fail, with the option to override.
  2. Approve — This plan FAILS validation — approving is refused here.
  3. Feedback → Functional — Send back to functional for requirements rework
  4. Rework → Implementation — Send back to implementation for technical rework
```

The screen knows the plan is empty — it says so on the first line. It knows the
plan fails validation — it says so inside option 2. Then it asks him to decide
anyway, and offers him an option whose own description tells him it will be refused.

## The deeper point, and it is the reason this is CRITICAL

**A menu that lists an option and then tells you it will refuse is the same shape as
every defect this codebase has spent two days removing: a surface presenting a
result it has already computed and then ignored.**

The five broken instruments were surfaces reporting verdicts on input they never
received. This is the mirror image — a surface that DID receive the verdict, printed
it, and then rendered the screen as though it had not. `planDecisionScreen` calls
`validateTransition` at line 909, stores the answer in `passes`, and uses it for
exactly one thing: reordering the options and choosing which sentence to put in the
description. **The option itself is offered either way.**

The cost is not one wasted click. It is that every other screen now has to be
second-guessed. A person who has been offered one self-refusing option cannot know
which of the next screen's options are real.

## What the human should see instead

An empty plan at a gate is not a decision to make. It is a broken artifact to be
told about. The honest screen is a statement plus the actions that can actually
work:

```
This plan is empty.

  The file exists and has no content — no title, no problem statement, nothing
  to build from. Nobody can decide anything about it, and nothing can be built
  from it.

  It is at the point where you would say whether it is finished.
```

and ONE question, with three options, all of which do something:

| option | what it does | why it is offered |
|---|---|---|
| **Write it** (recommended) | opens the plan for a discussion that gives it a body | the only action that turns this into something decidable |
| **Delete it** | removes the file | there is nothing in it, so nothing is lost — and on a fresh repository this is usually the right answer |
| **Leave it** | nothing changes | he is allowed to not deal with it now |

**No Approve.** Not greyed out, not last, not with an explanatory description —
absent. Validation has already answered; offering the option anyway is the defect.

**No "Check validation" either.** Its whole purpose is to show which checks fail.
The screen already says why: the plan is empty. A second screen that says "the plan
is empty" is navigation charging for information already given.

## A general rule, made checkable

> **An option whose description says it will be refused must not be an option.**

That is testable over any rendered screen: no option may carry a refusal phrase in
its description while remaining selectable. It generalises beyond empty plans and it
is asserted here over every screen this file produces.

## Implementation Details

### File: `src/lib/streaming-gate.js`
**Action:** MODIFY
**Purpose:** An empty plan is reported as broken, never offered as a decision.
**Change Type:** modify-existing — one predicate, one screen, one descriptor field

#### Change 1 — the predicate

```js
/**
 * A plan with nothing in it. `stripLeadingFrontmatter` drops every stacked
 * frontmatter block; what remains is what a human would read. A file carrying only
 * a `# Heading` and no other content counts as EMPTY: a title is a label, not a
 * plan, and nobody can decide whether a label is finished.
 */
function isEmptyPlan(content) { /* … */ }
```

It returns true when the body after `stripLeadingFrontmatter` — with a single
leading `# Heading` line also removed — contains no non-whitespace character.
Never throws; a non-string input is empty.

#### Change 2 — the broken-artifact screen

```js
function brokenPlanScreen(stage, file, projectRoot) { /* … */ }
```

Returns the `{ text, ask, actions }` contract with the statement above and the three
options. Actions:

- `Write it` → `claude:view-edit ${stage}/${file}`
- `Delete it` → `claude:delete ${stage}/${file}`
- `Leave it` → `''`

Every action string already exists in this file's vocabulary; nothing new is
invented for the broken case.

The "It is at the point where you would say whether it is finished" line comes from
`gateWords.moment(stage)`, so the human still learns WHERE the file sits — without a
number, and without being asked to act on it. When the plan is not at a gate the
line is omitted.

**The plan is not named by its slug.** An empty plan has no title, and
`planTitle()` falls back to `plan.name` — the filename. Printing that would show a
filename to a human who has been told repeatedly that work is named by what it
does. The statement therefore says "This plan is empty" and shows the filename only
in the small print as the thing to find on disk, labelled as a filename.

#### Change 3 — `planDecisionScreen` branches first

Immediately after the plan content is read (`:868-873`), before the title is
computed and before any gate logic:

```js
if (isEmptyPlan(content)) return brokenPlanScreen(stage, file, projectRoot);
```

First, deliberately. An empty plan has no product question to ask either — the
precomputed-questions branch above the gate branch would be asking about a document
with no content.

#### Change 4 — `pendingGateDecisions` marks it, and does not hide it

Each descriptor gains `broken: boolean`, set from `isEmptyPlan(plan.content)`.

The empty plan is **NOT removed from the list.** Removing it would make the file
invisible — a broken artifact nobody is told about, which is a different and worse
failure than being asked about it. It stays, marked, and `gateScreenAt` renders
`brokenPlanScreen` for a broken descriptor instead of the approval question.

#### Change 5 — `buildOptions` never offers a self-refusing option

`buildOptions` (`:1018-1034`) currently builds an `Approve` option whose description
reads "This plan FAILS validation — approving is refused." Since the option is
refused, it is not built at all when `passesValidation` is false. The remaining
options are `Open the plan` (which becomes the recommended one, as it already is)
and `Skip for now`.

This is the general rule applied at the one other site that breaks it, and it
matters beyond empty plans: any plan failing validation for any reason stops being
offered an approval that will be refused.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `isEmptyPlan` | `planDecisionScreen` (Change 3), `pendingGateDecisions` (Change 4) | the shipped entry-point screen |
| `brokenPlanScreen` | `planDecisionScreen`, `gateScreenAt` | same |
| the `broken` descriptor field | `gateScreenAt` — its first and only reader, in this slice | same |

Neither function is exported; the tests drive `planDecisionScreen`,
`gateScreenAt` and `pendingGateDecisions`, which is what a human reaches.

## Test Plan

### Tests: `tests/empty-plan-is-not-a-decision.test.js`
**Action:** CREATE
**Framework:** `node:test`

Every case seeds a real plan file on disk and drives the real screen function.

| # | Case | Fixture | Assertion |
|---|---|---|---|
| 1 | **the owner's exact case** | a plan in `review/` whose file is frontmatter only | `planDecisionScreen` text says the plan is empty; options are exactly `Write it`, `Delete it`, `Leave it` |
| 2 | **Approve is absent, not merely last** | same | no option's label is `Approve`; `actions` has no `Approve` key; no action value starts `stream approve` |
| 3 | **Check validation is absent** | same | no option labelled `Check validation`; no `validate ` action |
| 4 | **the send-back options are absent** | same | neither send-back label appears — there is nothing to send back |
| 5 | **a title-only plan is empty too** | body is exactly `# Some title` | same screen as case 1 |
| 6 | **a plan with one real sentence is NOT empty** | `# T\n\nWe will do the thing.` | the ordinary gate screen renders, with its approval option |
| 7 | **stacked frontmatter does not count as content** | two frontmatter blocks, no body | the empty screen |
| 8 | **every offered option does something** | case 1's screen | every option label has an entry in `actions`; `Leave it` maps to `''` and every other maps to a non-empty action |
| 9 | **the general rule — no self-refusing option** | render `planDecisionScreen`, `gateScreenAt` and `streamingGateScreen` over a project holding an empty plan, a valid plan and a plan that fails validation for a NON-empty reason | across every rendered screen, no option description matches `/\brefus(e|ed|es)\b|\bwill be rejected\b/i` |
| 10 | **a failing non-empty plan is not offered Approve either** | a plan with a body that fails `validateTransition` | no `Approve` option; `Open the plan` leads |
| 11 | **the empty plan is NOT hidden** | `pendingGateDecisions` over a project with one empty plan | the descriptor is present with `broken: true` — the file is surfaced, never silently dropped |
| 12 | **the streaming screen renders the broken screen for it** | `streamingGateScreen` over that project | the empty-plan statement renders, and no approval question is asked |
| 13 | **the filename is labelled, never presented as the work's name** | case 1 | the text does not contain the bare slug as a title; where the filename appears it is preceded by a word marking it as a filename |
| 14 | **no gate number** | every screen above | each fails `/\bgates?\s*[0-9]/i` |
| 15 | **an unreadable plan file is broken, not empty** | a plan path that is a directory | the screen renders, says it could not read the file, and offers no approval |
| 16 | **a whitespace-only body is empty** | frontmatter then `\n\n   \n\t\n` | the empty screen |

Case 9 is the general rule and the reason this slice matters past its own fixture.
Case 11 is what keeps the fix from becoming a different dishonesty.

Cross-platform: `path.join`, `os.tmpdir()`, `fs.promises.rm` teardown.

## What this slice does NOT fix

- **Why a plan existed on a fresh repository at all.** This slice makes the screen
  honest about an empty plan; it does not stop one appearing. That is the
  fresh-repository slice.
- **Other degenerate artifacts.** A plan with a body but no acceptance criteria, or
  one with corrupt frontmatter, still renders the ordinary screen. Only emptiness
  and unreadability are handled. Widening the notion of "broken" without evidence
  of which shapes actually occur would be guessing.
- **The validation detail screen.** `validate <ref>` still exists and still works;
  it is simply no longer offered as the way out of an empty plan.
- **`stream approve` itself.** It still routes through the gate-safe `approvePlan`
  and still refuses. This slice stops OFFERING the refusal; it does not change what
  happens if something else calls it.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/empty-plan-is-not-a-decision.test.js` in full, run ONLY that file, record the red output verbatim. Cases 1, 2, 3, 4, 5, 7, 9, 10, 11, 12 and 16 MUST be red. The red evidence MUST include the full rendered screen for case 1, so the defect is reproduced as the owner saw it.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/streaming-gate.js` at `:182-223` (`stripLeadingFrontmatter`, `renderPlanBody`), `:856-984` (`planDecisionScreen`), `:1018-1034` (`buildOptions`), `:1072-1119` (`gateScreenAt`) and `:471-528` (`pendingGateDecisions`). The landed code WINS over this plan's line numbers. Confirm `src/lib/gate-words.js` exists; if it does not, the preceding slice has not landed — STOP and report.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/streaming-gate.js` — Changes 1 through 5.
### Step 11: REVIEW — confirm no screen this file produces offers an option it will refuse (case 9 proves it; also read every remaining option-building site and list them with a justification). Confirm the empty plan still APPEARS in `pendingGateDecisions` — a fix that hides the file is a worse defect than the one being fixed. Confirm the broken branch runs before the product-question branch, not after.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — `isEmptyPlan` runs on content already read; no extra file read. Confirm `pendingGateDecisions` does not read each plan a second time to compute `broken`.
### Step 13: SECURE — the broken screen renders a filename. Confirm it passes through `stripCtl` and that the traversal guard `isUnsafePlanFile` has already rejected any path-bearing name before this screen is reached. Case 15's directory fixture proves the read failure is handled rather than thrown.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — `node --test tests/empty-plan-is-not-a-decision.test.js tests/gate-words.test.js tests/streaming-gate.test.js tests/menu-protocol.test.js tests/e2e-menu-lifecycle.test.js` green, then the full gated run `npm test`. Lint the changed file. No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — a JavaScript doc on `brokenPlanScreen` stating the general rule in one sentence: an option whose description says it will be refused must not be an option. Record on `isEmptyPlan` the decision that a title-only file counts as empty, and why.
### Step 16: FINAL-REVIEW — report the screen BEFORE and AFTER, verbatim, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## Decisions Taken Under Ambiguity

1. **A statement plus three actions, not a question with four options.** The owner
   asked whether the honest screen might be a statement plus one action. Three
   survive the test "does this do something a human might want": writing it, deleting
   it, and leaving it. Reducing to one would remove the delete, which on a fresh
   repository is the answer most of the time.
2. **`Delete it` is offered although it is destructive.** There is nothing in the
   file, so nothing is lost. Withholding it would force the human to a file manager
   to clean up a mess the product made.
3. **`Write it` is recommended.** It is the only option that turns the file into
   something decidable. Delete is right more often on a fresh repository, but
   recommending deletion of a file whose provenance is unknown is a stronger claim
   than the screen can support.
4. **A title-only plan counts as EMPTY.** A heading is a label. Nobody can judge
   whether a label is finished, so the screen would be equally dishonest. Case 5
   pins this; it is the judgement most likely to be argued with.
5. **The empty plan stays in `pendingGateDecisions`, marked.** Excluding it would
   make it invisible — the file would sit at a gate forever with nothing ever saying
   so. Nothing is hidden; it is surfaced honestly instead of being asked about
   dishonestly.
6. **`buildOptions` is fixed in the same slice.** It is the same defect at a second
   site: an approval offered against a verdict already computed. Fixing only the
   empty case would leave the general rule stated and unenforced at the one place
   that already breaks it.
7. **"Check validation" is dropped from the empty screen, not kept as a courtesy.**
   Its entire content is "the plan is empty", which the screen already says. An
   option that navigates to information already on screen is the product charging
   for what it has given.
8. **The filename is shown but labelled.** The standing rule is that work is never
   named by a number or a slug. An empty plan has no name, so the file is identified
   as a file — the only honest way to point at something with no title.
9. **Only emptiness and unreadability are treated as broken.** Other degenerate
   shapes may exist; inventing handling for shapes not observed would be guessing,
   and the observed shape is the one the owner hit.
