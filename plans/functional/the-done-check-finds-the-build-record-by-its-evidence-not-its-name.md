---
title: "The done check finds the build record by its evidence, not by its heading name"
type: functional
status: functional
created: 2026-09-25
priority: medium
effort: small
files:
  - src/lib/plan-validator.js
  - tests/done-check-finds-the-richest-build-record.test.js
depends_on: none
---

# The done check finds the build record by its evidence, not by its heading name

## 1. ASSESS — Problem Understanding

A plan can carry more than one `## Execution Plan` section. The implementation
planner writes one (prose, one `### Step N` heading per step); when the plan
enters the build queue `src/lib/iron-loop.js` appends the canonical checkbox
template as a second one, and the executor ticks that second copy and writes its
evidence there. `extractStepBlocks` in `src/lib/plan-validator.js` has to decide
which of the candidate sections is the build record.

It decides by NAME. Today it prefers a heading matching
`^## Execution Plan \(Steps 8-16\)` and falls back to the first
`^## Execution Plan`. That fixed the common case — it is why nothing is blocked
in this repository today — but a name match is brittle to spelling, and the
spelling has already drifted. A census of every `## Execution Plan` heading in
this repository's plans and in the `ABC` project's plans:

```
344  ## Execution Plan (Steps 8-16)                                  matches
157  ## Execution Plan                                               the prose twin
  7  ## Execution Plan (Steps 8–16)                                  EN DASH — no match
  2  ## Execution Plan (Steps 7-15)                                  old numbering — no match
  1  ## Execution Plan (Iron Loop Steps 8–16 — canonical labels)     no match
  1  ## Execution Plan (Iron Loop Steps 8-16)                        no match
```

Eleven sections spell the build record in a way the name match cannot see. Nine
plan files carry two sections where the second is one of those spellings; all
nine are already in `plans/done/`, so nothing is refused today. The next plan
written that way, sitting in review, is refused for every required step while its
record is fully ticked — and the human reading the refusal is told there is an
unchecked checkbox in a file that contains none.

Measured, constructed from the real template: a plan whose second section is
headed `## Execution Plan — Build Record` and holds 18 ticked boxes and zero
unticked produces nine refusals reading
`review→done blocked: Step N (NAME) has an unchecked required checkbox`.

**Selecting on step headings does not fix this.** Both sections carry all nine
`### Step N` headings — verified on
`plans/review/00072-r1-per-request-ctoc-routing-hook.md`, where the prose section
at line 868 and the canonical section at line 988 each hold nine step headings.
Selecting the first section that holds a `### Step N` heading therefore selects
the prose twin, which is the defect. Selecting the first section that holds any
checkbox also selects the prose twin on that file, because the prose section was
backfilled with a ticked line under seven of its nine steps — Steps 12 and 15
carry none, so reading it yields two false refusals.

The discriminator has to be how much per-step checkbox evidence a section
actually holds.

**A second, separate defect in the same function's consumers.** When the wrong
section is read, every step block is found but holds no checkbox at all. The
refusal says `has an unchecked required checkbox`. The two facts are different
and the human cannot tell them apart:

- a checkbox exists in the block and is unticked — a real, honest refusal;
- the block holds no checkbox at all — the section read is probably the wrong one.

"No block found at all" is already a distinct message
(`Step N (NAME) is required but not addressed`, guarded on `present === true`),
so that half needs no change. The zero-checkbox case is the one that lies.

## 2. ALIGN — Approach

**Ruling taken (human, 2026-09-25): richest-evidence region wins.** Presented as
a matrix against the alternative of widening the name pattern to accept both
dash characters; the human chose evidence-based selection because a name match
selects on the section's label rather than on the thing the function exists to
read, and has now needed widening three times.

`extractStepBlocks` collects EVERY `^## Execution Plan…` candidate section
rather than the first, splits each into per-step blocks with the parsing it
already uses, and selects the candidate whose step blocks carry the most
checkbox evidence — counted as the number of step blocks holding at least one
`- [ ]` or `- [x]` line, never as a raw checkbox-line count, so a section with
one step block holding twenty boxes cannot outrank a section with nine step
blocks holding one box each.

Tiebreak, stated rather than incidental: on an equal count the LAST candidate
wins, because the build template is appended after the planner's prose and the
later section is the more recent record. A zero-evidence outcome — no candidate
holds any checkbox — keeps today's behaviour exactly: the first candidate's
blocks are returned, so a legacy plan with a single prose section is read as it
is read now and no refusal changes.

The two sibling derivations in this file continue to read the FIRST region and
must not follow. `validateEscalations` scans for a declared unapproved skip;
pointing it at the richest section would drop a declaration written in the prose
twin and turn an error it raises today into silence. `validateStepLabels` checks
the human-written step labels; pointing it at the generated template would make
it assert against CTOC's own output. Both are load-bearing and deliberate; the
existing comment saying so is extended, not replaced.

Separately, `validateReviewToDone` splits its refusal in two. A required step
whose block holds at least one checkbox and is not complete keeps today's
message. A required step whose block holds NO checkbox reports that fact and
names the section that was read, so a wrong-section read is legible from the
refusal alone instead of needing a measurement to find.

**Scope boundary.** No plan file is edited. The nine two-section plans in
`plans/done/` are not touched and not re-crossed; they are evidence that the
spelling drifts, not work to redo. The heading spellings themselves are not
normalised — normalising them would change hashed plan specifications and read
as forged approvals, which is the same reason the original defect could not be
fixed by renaming headings.

## 3. CAPTURE — Acceptance Criteria

Behaviour, each one a runnable check in
`tests/done-check-finds-the-richest-build-record.test.js`:

1. GIVEN a plan with a prose `## Execution Plan` section carrying all nine
   `### Step N` headings and no checkboxes, AND a second section headed
   `## Execution Plan — Build Record` carrying every required step ticked,
   WHEN the done check runs, THEN it raises no unchecked-checkbox refusal.
   This case fails against the current code.
2. GIVEN the same shape with the second section headed with an EN DASH,
   `## Execution Plan (Steps 8–16)`, THEN it raises no unchecked-checkbox
   refusal. This is the spelling seven live sections use.
3. GIVEN a prose section backfilled with a ticked line under seven of nine
   steps and a canonical section with all nine ticked, THEN the canonical
   section is the one read — the two steps missing a box in the prose section
   raise nothing. This is the real shape of
   `plans/review/00072-r1-per-request-ctoc-routing-hook.md`.
4. GIVEN two candidate sections holding EQUAL per-step evidence, THEN the later
   one is read.
5. GIVEN a plan with a single prose section and no checkboxes anywhere, THEN the
   blocks returned are that section's — today's behaviour is unchanged, and a
   legacy plan's refusals do not move.
6. GIVEN a required step whose block holds a genuinely unticked checkbox, THEN
   the refusal still reads `has an unchecked required checkbox`.
7. GIVEN a required step whose block holds NO checkbox at all, THEN the refusal
   says so and names the section heading that was read, and is textually
   distinct from the message in (6).
8. GIVEN a plan with no `## Execution Plan` section at all, THEN `{}` is
   returned, as today.

Evidence the whole repository is unmoved, recorded as a measurement rather than
an assertion: the done check is run against all 134 plans in `plans/review/`
before and after, and the set of plans raising a checkbox refusal is identical
(zero, today). A single plan changing verdict is a finding to report, not a
number to accept.

Non-goals, so this is never "improved" into something flakier: no plan file is
rewritten, no heading is renamed, no section is added or removed, and the two
sibling derivations keep reading the first region.

## Decisions Taken Under Ambiguity

- Evidence is counted as step blocks holding at least one checkbox, not as raw
  checkbox lines. A raw count lets one verbose step block outrank a section that
  covers every step, which is the wrong direction for a check whose subject is
  per-step completeness.
- The new behavioural checks go in their own test file rather than into
  `tests/plan-validator.test.js`, which carries uncommitted edits from the
  stopped parser-fix build. Two changes editing one test file is the tangle this
  avoids; the new file names its own subject.
