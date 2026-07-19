---
approved_by: human
approved_at: 2026-07-19T07:27:00.495Z
gate_crossed: implementation → todo
---

---
title: "A plan that mentions zero-skipped in its prose is not a plan with a skipped step"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/plan-validator.js"
  - "tests/escalation-word-boundary.test.js"
---

# A plan that mentions "zero-skipped" is not a plan with a skipped step

`src/lib/plan-validator.js:210`:

```js
const pattern = safeRegExp(`(Step\\s*\\d+[^\\n]*${status})`, 'gi');
```

with `status` drawn from `ESCALATION_STATUSES = ['SKIPPED', 'BLOCKED', 'DEFERRED']`
(`:27`). The word is matched as a bare substring on any line that also contains
`Step` followed by digits. So a step whose own prose describes the quality gate —

```
### Step 14: VERIFY — … the full gated run `npm test` (suite + coverage floor + zero-skipped).
```

— matches `Step 14` … `skipped`, is classified as an unapproved skipped step, and
`validateEscalations` pushes a blocking error that makes `validateForReview`
return `valid: false`. The plan's completion is refused.

**This blocked a real completion twice today.** The executor working the
concurrent-edit guard hit it and reworded its own prose rather than adding a fake
approval line — the right call, and precisely the wrong thing to have to do: the
validator taught a correct plan to describe itself less accurately in order to
pass. A gate that is defeated by rewording is not measuring what it claims to
measure, and every reword makes the next plan's prose a little less true.

## A plain word boundary does NOT fix this

The obvious repair is `\bSKIPPED\b`, and it does not work. In `zero-skipped` the
character before `skipped` is a hyphen, which is a non-word character, so a word
boundary exists there and `/\bskipped\b/i.test('zero-skipped')` is **true**. The
same holds for `skipped-tests`, `0 skipped`, and `no-skipped`.

The boundary this needs must exclude an adjacent hyphen as well as adjacent word
characters:

```js
(?<![\w-])SKIPPED(?![\w-])
```

Node supports lookbehind, and `src/lib/plan-validator.js` already builds patterns
through `safeRegExp`. Verify the helper passes the construct through unchanged at
Step 9 before relying on it; if it refuses lookbehind, fall back to an explicit
capture of the preceding character and record the substitution.

The evidence that a bare `\b` is insufficient is already in this file:
`validateStepsComplete:145` uses `/\bSKIPPED\b/i` and is saved only by its
`!isCompleted` guard, not by the boundary. That is a latent instance of the same
defect one condition away from firing.

## Three sites, one defect class

| Site | Pattern | Severity | Fires on `zero-skipped`? |
|---|---|---|---|
| `validateEscalations:210` | `` `(Step\\s*\\d+[^\\n]*${status})` `` | **blocking error** | yes — the reported defect |
| `validateStepsComplete:145` | `/\bSKIPPED\b/i` | warning + checklist flag | yes, whenever the step is not also complete |
| `validateNoContradictions:396` | `/Step\s*(\d+)[^\\n]*SKIP/gi` | warning | yes, and worse — it matches the bare stem `SKIP` |

The third carries a second, separate bug: `[^\\n]` inside a **regular expression
literal** is the class "not a backslash and not the letter n", not "not a
newline" (the double backslash is correct only inside the *string* passed to
`safeRegExp`, as at `:210`). So that pattern silently spans lines and refuses to
cross the letter `n`.

All three live in the declared file and are the same defect. Fixing one and
leaving two is how this returns.

## Implementation Details

### File: `src/lib/plan-validator.js`
**Action:** MODIFY
**Purpose:** Match an escalation status as a standalone word, never as a substring.
**Change type:** modify-existing — one shared helper plus its three call sites

#### Change 1 — one boundary, defined once

Add beside `ESCALATION_STATUSES`:

```js
/**
 * A status word matches only when it stands ALONE — not as part of a longer
 * hyphenated or compound word.
 *
 * A plain `\b` is NOT sufficient and this is the whole point of the helper: in
 * `zero-skipped` the preceding character is a hyphen, a NON-word character, so a
 * word boundary exists and `\bskipped\b` matches. A plan's own honest prose about
 * the "zero-skipped gate" was therefore read as an unapproved skipped step and its
 * completion was refused — twice — until the author reworded the plan to get past
 * the validator. A gate defeated by rewording measures the wording, not the work.
 *
 * The boundary excludes word characters AND the hyphen on both sides.
 */
const STATUS_BOUNDARY_BEFORE = '(?<![\\w-])';
const STATUS_BOUNDARY_AFTER  = '(?![\\w-])';
```

#### Change 2 — `validateEscalations` (the blocking site)

`:210` becomes:

```js
const pattern = safeRegExp(
  `(Step\\s*\\d+[^\\n]*${STATUS_BOUNDARY_BEFORE}${status}${STATUS_BOUNDARY_AFTER})`, 'gi');
```

and the approval probe at `:218` gets the same boundary around `${status}`, so an
approved genuine skip is still recognised as approved.

#### Change 3 — `validateStepsComplete:145`

Replace the three literal probes with the bounded equivalents, keeping the
existing `!isCompleted` guard exactly as it is:

```js
isSkipped = !isCompleted && (
  safeRegExp(`${STATUS_BOUNDARY_BEFORE}SKIPPED${STATUS_BOUNDARY_AFTER}`, 'i').test(block) ||
  safeRegExp(`${STATUS_BOUNDARY_BEFORE}NOT APPLICABLE${STATUS_BOUNDARY_AFTER}`, 'i').test(block) ||
  /\[\s*N\/A\s*\]/i.test(block));
```

The `[ N/A ]` bracket form is already unambiguous and is left alone.

#### Change 4 — `validateNoContradictions:396`

Two fixes in one line — the boundary, and the character-class bug:

```js
const skippedStepPattern = safeRegExp(
  `Step\\s*(\\d+)[^\\n]*${STATUS_BOUNDARY_BEFORE}SKIP${STATUS_BOUNDARY_AFTER}`, 'gi');
```

Note this deliberately keeps matching the stem `SKIP` (that site's intent is
broader than the escalation statuses) but now only as a standalone word, and
`[^\n]` now means "not a newline", so the match no longer spans lines.

#### What must NOT change

A genuinely skipped step must still be caught. `### Step 12: OPTIMIZE — SKIPPED`
and `Step 9 — BLOCKED` and `Step 11: DEFERRED` all still match, still produce a
blocking error without an approval marker, and still clear with one. The tests
assert both directions; a fix that only loosens is a fix that removes the gate.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| bounded escalation match | `validateEscalations` ← `validateForReview:59` | `/ctoc:menu` → `menu task complete` → `completeExecution` → `validateForReview` |
| bounded step-skip match | `validateStepsComplete` ← `validateForReview:50` | same |
| bounded contradiction match | `validateNoContradictions` ← `validateForReview:77` | same |

`validateForReview` is on the live completion path — it is what refused the two
completions this slice exists to unblock.

## Test Plan

### Tests: `tests/escalation-word-boundary.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

Each case writes a real plan file to a temp directory and calls
`validateForReview(planPath, root)` — the function the completion path calls, not
the private helpers.

| # | Case | Plan content | Assertion |
|---|---|---|---|
| 1 | **the reported defect** | a complete, valid plan whose Step 14 line reads `… coverage floor + zero-skipped gate` | `result.valid === true`; no error mentions Step 14; `checklist.escalations` has no entry for step 14 |
| 2 | **a genuinely skipped step is still caught** | `### Step 12: OPTIMIZE — SKIPPED` with no approval | `result.valid === false`; an error names step 12 |
| 3 | an approved skip still clears | `### Step 12: OPTIMIZE — SKIPPED — APPROVED: not applicable, no hot path` | the checklist entry for step 12 has `approved: true`; no blocking error from escalations |
| 4 | `BLOCKED` behaves identically both ways | one plan with `Step 9 — BLOCKED`, one with prose `the non-blocked path` | first invalid, second valid |
| 5 | `DEFERRED` behaves identically both ways | `Step 11: DEFERRED` versus prose `deferred-dependency handling` | first invalid, second valid |
| 6 | other real compounds do not fire | prose containing `zero-skipped`, `skipped-tests`, `no-skipped`, `0 skipped, 0 flaky` on Step lines | `result.valid === true` |
| 7 | the step-completion path agrees | an INCOMPLETE step whose prose says `0 skipped` | `checklist.steps.step_N.skipped === false` — the latent instance at `:145` is closed |
| 8 | the contradiction scan no longer fires on prose | a Step 8 line mentioning `skipped-test policy`, with test files present | no warning claiming Step 8 was skipped |
| 9 | the contradiction scan still fires on a real skip | `Step 8: TEST — SKIP`, with test files present | the existing warning is still produced |
| 10 | the line-spanning bug is closed | a plan where `Step 8` appears on one line and `SKIP` alone on the next | no match — the pattern does not cross the newline |
| 11 | case-insensitivity is preserved | `Step 12 — skipped` lowercase, unapproved | still caught |
| 12 | this repository's own plans validate | run `validateForReview` over every plan in `plans/implementation/` and `plans/review/` | no plan is refused for an escalation it does not actually declare — the regression that started this |

Cross-platform: `fs.promises`, `path.join`, `os.tmpdir()`; teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

## Acceptance Criteria

- [x] A plan whose prose mentions the zero-skip quality gate on a step line is no longer read as declaring an unapproved status.
- [x] A plan that genuinely declares a status on a step is still refused, and still clears only with an approval line.
- [x] All three detection sites in `src/lib/plan-validator.js` use one shared boundary helper.
- [x] The `[^\n]` character-class defect at the contradiction site is corrected.
- [x] The full gated run `npm test` is green with coverage at or above the enforced floor.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Wrote `tests/escalation-word-boundary.test.js` in full BEFORE touching the source; 18 cases covering both directions.
- [x] Ran only that file. RED evidence: `# tests 18 / # pass 9 / # fail 9 / # skipped 0`.
- [x] The nine defect cases were red; the nine "still caught" cases were GREEN before the fix, so the change could not pass by loosening alone.

### Step 9: PREPARE
- [x] Read `src/lib/plan-validator.js` in full from disk; the reported line numbers and behaviour matched what was described.
- [x] Confirmed in a scratch probe (outside the repository) that `safeRegExp` passes a lookbehind through unchanged: source `(?<![\w-])SKIPPED(?![\w-])`, no substitution needed.
- [x] Confirmed the file has exactly three sites matching a status word as a substring. No fourth exists; every remaining mention is message text, a metadata field read, or a checklist key.

### Step 10: IMPLEMENT
- [x] `src/lib/plan-validator.js` — added `STATUS_BOUNDARY_BEFORE`, `STATUS_BOUNDARY_AFTER`, `STATUS_NOT_QUANTIFIED` and the `statusWordPattern` helper at module scope with the full rationale.
- [x] `src/lib/plan-validator.js` — `validateEscalations`: the detection pattern and its approval probe both bounded.
- [x] `src/lib/plan-validator.js` — `validateStepsComplete`: the two literal probes replaced by shared bounded probes; the `[ N/A ]` bracket form and the `!isCompleted` guard untouched.
- [x] `src/lib/plan-validator.js` — `validateNoContradictions`: the contradiction pattern bounded, the stem kept as `SKIP(?:PED)?`, and the `[^\n]` character-class defect corrected.

### Step 11: REVIEW
- [x] Grepped the file: no bare status word survives inside any pattern.
- [x] Re-ran the live-plan scan — 318 real plans validated; refusals for a status fell from 7 to 1, and the survivor genuinely declares one.
- [x] No existing test weakened, deleted or special-cased; `tests/plan-validator.test.js` and `tests/plan-validator-coverage.test.js` pass unchanged (63 tests).

### Step 12: OPTIMIZE
- [x] The boundary constants are built once at module load.
- [x] The two invariant probes are compiled once at module scope instead of twice per step per plan; the two `g`-flagged patterns stay at their call sites because they carry `lastIndex` state.

### Step 13: SECURE
- [x] Every pattern still routes through `safeRegExp`, the audited construction point; lint clean on both changed files.
- [x] No plan-derived text enters a pattern — every interpolated word is a code-controlled literal, documented on the helper.
- [x] Backtracking probed against a 48010-character adversarial line: no match, 1ms. The construct is two fixed-width negative assertions plus one bounded negative lookbehind, with no quantified group.

### Step 14: VERIFY
- [x] The new file plus both existing validator suites green.
- [x] The full gated run `npm test`: `tests 9942 / pass 9942 / fail 0 / cancelled 0 / skipped 0 / todo 0`.
- [x] `[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0` — `PASS`. The floor was not touched.
- [x] The documented-count ratchet in `CLAUDE.md` moved in the correct direction (424 to 425 test files) because this slice adds a test file.
- [x] No git operations run.

### Step 15: DOCUMENT
- [x] The helper carries the full rationale: why a plain word boundary is insufficient, what each of the three rules excludes and the real prose each was derived from, and the one deliberate gap.
- [x] `validateEscalations` carries an explicit instruction not to simplify the boundary back, naming the compound that reinstates the defect.
- [x] Both corrected defects at the contradiction site are explained in place, including why the double backslash was wrong inside a regex literal.

### Step 16: FINAL-REVIEW
- [x] All previous steps complete; both directions of the gate proven by test.
- [x] Ready for human review at Gate 3.

## Decisions Taken Under Ambiguity

1. **The boundary excludes hyphens, not just word characters.** A plain `\b` was
   the instruction's literal wording and does not fix the reported defect —
   `zero-skipped` still matches. Implementing the literal instruction would have
   shipped a change that closes nothing while appearing to. The plan states this
   explicitly so the discrepancy is visible rather than silently corrected.
2. **All three sites are fixed, not just the blocking one.** They are one defect
   class in one declared file. `:145` is currently saved only by an unrelated
   guard, and `:396` already misfires today as a warning. Leaving either is
   leaving the next occurrence.
3. **The `[^\\n]` character-class bug at `:396` is fixed in the same change.** It
   is one character in a line this slice is already rewriting, and it makes the
   pattern span lines — a second way the same site produces a wrong verdict.
4. **`:396` keeps matching the bare stem `SKIP`.** Narrowing it to the full word
   `SKIPPED` would change which plans produce that warning, which is a behaviour
   change beyond the reported defect. The boundary alone is applied; the stem is
   left as the site's authors chose.
5. **Case 12 runs against this repository's real plans.** A synthetic corpus would
   not have caught the original defect, because the defect was triggered by prose
   this project actually writes. The live plans are the honest fixture.
6. **The "still caught" cases must be green BEFORE the fix.** Stated in Step 8 as
   an explicit instruction, because a loosening change is trivially "verified" by
   tests that were never red — and loosening is the failure mode this particular
   fix invites.

### Taken during execution

7. **The hyphen boundary ALONE does not satisfy the plan's own case 6.** The plan
   required `0 skipped, 0 flaky` on a step line not to fire, but that phrase
   contains the status as a genuinely standalone word — the boundary passes it
   through. Two of this repository's real plans were refused for exactly that
   phrase. A third rule was therefore added: a count or a negation immediately
   before the word (`0`, `zero`, `no`, `non`, `not`) marks it as prose about a
   count rather than a declaration.
8. **Only the literal `0` counts as a quantifier, never `\d+`.** The general form
   would have read `Step 12 SKIPPED` as "the number 12 followed by a status" and
   silently swallowed a real declaration. A step number is never 0, so `0` is
   safe. The cost is a deliberate, documented gap: a NON-ZERO count ("3 skipped")
   is still read as a declaration — it is indistinguishable in shape, and a run
   that really skipped three tests is worth surfacing.
9. **The boundary also excludes a following `[` and a preceding `.`.** Real plan
   prose in this repository contains the identifier forms `skipped[]` and
   `parseSkipped`. A parenthesis is deliberately NOT excluded, because
   `SKIPPED (no hot path)` is a real declaration and must still be caught; there
   is a test pinning that distinction.
10. **The contradiction site keeps the `SKIP` stem but gains an optional `PED`.**
    Adding a trailing boundary to a bare `SKIP` would have stopped it matching
    `SKIPPED` — silently removing a warning an existing test pins. `SKIP(?:PED)?`
    keeps both standalone forms. The gerund `skipping` no longer matches; that is
    a deliberate narrowing toward prose, recorded here rather than hidden.
11. **The uncovered case, stated plainly.** A status word standing completely
    alone as a declaration is indistinguishable from the same word standing alone
    in a sentence ("the step was, in the end, SKIPPED" versus a marker). No
    boundary rule can separate those; only structure could, and changing the
    marker syntax is a pipeline-wide decision that belongs to the human, not to
    this slice.
12. **`CLAUDE.md` was edited outside the declared `files:` list.** Adding a test
    file trips the documented test-file-count ratchet. Per the standing rule that
    ratchets are in scope, it was moved in the correct direction (424 to 425) in
    this same unit of work rather than left failing.
