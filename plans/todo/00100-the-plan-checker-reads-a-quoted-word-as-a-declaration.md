---
approved_by: human
approved_at: 2026-07-19T18:15:13.863Z
gate_crossed: implementation → todo
---

---
title: "The plan checker stops reading a quoted word as a declared step status — three builds were blocked by prose that was never a claim"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
blocks: 00103-the-last-mile-check-keeps-opting-itself-out
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/plan-validator.js"
  - "tests/escalation-word-boundary.test.js"
---

# The plan checker stops reading a quoted word as a declaration

## The defect, verified against the code and against the corpus

`src/lib/plan-validator.js:285-296`, read from disk:

```js
for (const status of ESCALATION_STATUSES) {
  const pattern = safeRegExp(`(Step\\s*\\d+[^\\n]*${statusWordPattern(status)})`, 'gi');
  const matches = region.match(pattern) || [];
  ...
      result.errors.push(
        `Step ${stepNum} marked as ${status} without escalation approval. ...`
```

The status word may appear **anywhere** after a step number on the same line. It
does not have to be a declaration; it only has to be present. The existing
word-boundary hardening (`statusWordPattern`, lines 62-83) correctly spares the
compound and quantified forms — the hyphenated compounds, the identifier forms, and
a zero count — and its comment says plainly why a plain `\b` is not enough. **None
of that helps a bare standalone word**, and a plan whose subject IS the skip counter
has to be able to write the bare word in its own prose.

The result is an error, not a warning: `result.valid = false`, and the plan cannot
complete.

### The three blocked builds, and what the prose actually said

The handover finding recorded in
`plans/review/00095-a-skipped-test-is-counted-as-a-skipped-test.md:741-756` is the
primary evidence, written by the executor it happened to:

> This plan was kicked back once at completion with "Step 9 marked as \<status\>"
> and "Step 14 marked as \<status\>". Neither step was skipped; both were executed
> in full. `src/lib/plan-validator.js:285-296` scans the Execution Plan region for
> `Step \d+[^\n]*<status>` and matched the phrase "record the verbatim
> `ℹ <word> N` line" on both step lines — prose naming the counter, read as a status
> declaration. […] The prose was reworded to "skip-count line" to get through, which
> loses no information but does NOT fix the detector.

**The offending text was inside backticks.** It was a quotation of a counter label
printed by the test runner. Three executors reworded their plans to get through;
none forged an approval line, which is the correct behaviour and also the reason
this stayed invisible — the gate was defeated by rewording, and every reword makes
the next plan's prose a little less true.

### The discriminator the corpus actually supports

Every false positive found on disk during planning is inside **inline code** or a
**quotation**. Every genuine declaration is bare prose. Measured, not assumed:

| Site | Text | Verdict wanted |
|---|---|---|
| `00095:603, :614` (as originally written) | the counter label, inside backticks | free it |
| `00081:296` | a step-and-status example, inside backticks | free it |
| `00081:158, :189, :190` | test-case illustrations, inside backticks | free it |
| `00095:742-743` | the kickback message, inside double quotes | free it |
| `00081` test case 2 | a step heading ending in the bare status word | **still catch** |
| `00012:129` | a step heading, status word **mid-line**, bare | **still catch** |

The last row is the one that decides the design. The fix proposed in the handover —
"require the status to be DECLARED: anchored as a trailing marker, or a colon form,
or bold" — **misses `00012:129`**, a genuine declaration in this repository's own
corpus that is none of those three shapes. A fix that frees everything is a fix that
catches nothing, so that proposal is recorded and rejected with its counter-example.

### The precedent is already in this file

`validateContradictions` (line 400-406) already does exactly this, for exactly this
reason:

```js
// Strip fenced code blocks before scanning. Code snippets in ``` / ~~~ fences
// […] are NOT file-creation claims; scanning them produced false "claimed as
// created" errors that blocked otherwise-complete plans at review (v6.9.86).
```

This slice extends that shipped, proven discipline to the escalation scan and adds
inline-code and quoted spans to what gets masked. It is not a new idea; it is the
same idea applied to the second scanner in the same file that needed it.

## Implementation Details

### File: `src/lib/plan-validator.js`
**Action:** MODIFY — add one masking helper; apply it at three call sites
**Purpose:** A word inside code or a quotation is a mention, not a claim.

**New helper `maskQuotedSpans(text)`** — returns text of **identical length** with
the contents of the following spans replaced by a filler character that is not a
letter, a digit, a backtick or a quote:

1. fenced blocks (` ``` ` and `~~~`), matching the existing strip in this file;
2. inline code spans — a run of N backticks, its content, and a matching run of N
   backticks;
3. double-quoted spans, straight and typographic (`"…"`, `“…”`).

Length preservation is load-bearing: three consumers report a step number parsed out
of the same line, and a mask that changes offsets would move it. Single quotes are
**not** masked — an apostrophe in ordinary prose would open a span that never closes
and would mask the rest of a paragraph. An unmatched backtick or quote masks
nothing; only balanced pairs count.

**Applied at three sites, all of which share the defect:**

| Site | Line | Effect |
|---|---|---|
| `validateEscalations` — the region scan | 275-287 | mask `region` before matching; the approval-proximity check at 295 must scan the **same masked text**, or an approval written inside backticks would stop counting |
| `validateStepsComplete` — the per-step block probes | 212-215 | mask `block` before `DECLARED_SKIPPED_RE` / `DECLARED_NOT_APPLICABLE_RE` / the bracket form. The two detectors must agree; one masked and one not is a new inconsistency |
| `validateContradictions` — pattern 3 | 484-486 | the fence strip already exists; extend `scanContent` to use the same helper so all three scans share one definition |

`statusWordPattern`, `STATUS_BOUNDARY_BEFORE`, `STATUS_BOUNDARY_AFTER`,
`STATUS_NOT_QUANTIFIED`, `ESCALATION_STATUSES` and the bracket form are **not
touched**. The masking runs *before* them; every guarantee they carry is preserved
unchanged.

**Bounded matching only.** Every pattern added here uses a lazy, bounded span with
no nested quantifier, compiled once at module load, and goes through `safeRegExp`
like everything else in this file. This module sits on a hook path; a pattern that
can backtrack quadratically on a long plan is a denial-of-service on the tool the
human uses every day.

### File: `tests/escalation-word-boundary.test.js`
**Action:** MODIFY — add a group; change no existing assertion
**Purpose:** Both directions, held together.

The existing file already states both directions in its header and already tests
them. This slice adds a group and **must not weaken a single existing case** — if
an existing case turns red, the code is wrong, not the case.

| # | Case | Assertion |
|---|---|---|
| 1 | **the reported defect, verbatim** | a step line quoting the runner's counter label inside backticks — the exact text from the handover finding | `result.valid === true`; no error names that step |
| 2 | a quoted kickback message | a step line containing the error message inside double quotes | valid |
| 3 | a fenced example | a fenced block inside the execution section containing a step heading with a bare status word | valid |
| 4 | typographic quotes | the same text in `“…”` | valid |
| 5 | **the trailing-marker declaration is still caught** | a step heading ending in the bare status word, unapproved | `result.valid === false`; an error names that step |
| 6 | **the MID-LINE declaration is still caught** | the `00012:129` shape — a step heading, prose, then the bare status word mid-line, unapproved | invalid. This is the case the rejected proposal would have missed |
| 7 | an approved declaration still clears | the genuine form followed by its approval clause | the checklist entry records `approved: true`; no blocking error |
| 8 | **an approval inside backticks does NOT clear a bare declaration** | genuine bare declaration; the approval clause written inside code | still invalid — masking must not become a way to launder an approval |
| 9 | an unmatched backtick masks nothing | one backtick, then a bare declaration | still invalid |
| 10 | an apostrophe masks nothing | `the executor's step` followed by a bare declaration | still invalid |
| 11 | step numbers still report correctly | a masked line and a genuine line in one region | the error names the genuine step's number, proving offsets survived masking |
| 12 | the two detectors agree | a plan where the per-step probe and the region scan see the same line | both classify it the same way |
| 13 | **the corpus measurement** | every plan under `plans/` is validated; the count of plans refused for a status word is recorded, and the file asserts a bound so a future loosening that frees everything fails here | see below |
| 14 | bounded matching | a synthetic plan with a long unmatched-backtick run and a long quote run validates within a fixed time budget |

**Case 13 must fail loudly on input it cannot read.** It enumerates the plan files,
counts what it read, asserts the count is greater than zero, and rethrows any read
error with the path attached. A corpus check that silently reads nothing and reports
"no plans refused" is the defect class this repository fences.

Cross-platform: `path.join`, `os.tmpdir()`, existing fixture helpers in the file.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `maskQuotedSpans` | `validateEscalations`, `validateStepsComplete`, `validateContradictions` — all inside `validateForReview` | `src/lib/actions.js` on the review transition, and `src/hooks/human-gate-check.js` |
| the new cases | the suite | `npm test` |

The helper is private to the module and reachable from the exported
`validateForReview` on the first call; it is not exported and not called only from a
test.

## What this slice does NOT fix

1. **The known non-zero-count gap stays open.** A count greater than zero before the
   word is still read as a declaration. The module's own comment documents that
   deliberately, and it is indistinguishable in shape from a real declaration on a
   numbered step. Unchanged here.
2. **It does not change what counts as an approval.** The approval clause vocabulary
   and the proximity rule are untouched; only the text they are matched against is
   masked identically.
3. **It does not touch the step-label checker.** `src/hooks/validate-plan-steps.js`
   remains a standalone script and is out of scope.
4. **It does not reword any existing plan.** Plans already reworded to get through
   stay as they are; freeing them retroactively is the human's call.
5. **It does not make a genuinely un-executed step passable.** Both directions are
   asserted, and case 8 exists specifically so masking cannot launder an approval.
6. **It does not address the metadata path** (`skipped_steps` / `skips_approved`),
   which reads frontmatter and never had this defect.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Extend `tests/escalation-word-boundary.test.js` with the fourteen cases and run ONLY
that file before touching `src/`. Cases 1, 2, 3 and 4 must be **RED** — they are the
reported defect and their red output is the evidence. Cases 5, 6, 7, 9, 10 and 12
must be green immediately, and their staying green after the change is the proof the
gate was not loosened. Case 8 must be red or green as measured — record which, since
if it is already green today the masking must not turn it red. Record every output
verbatim. Run case 13 against the corpus **before** the change and record the count
of refused plans; that number is the before half of the measurement this slice owes.

### Step 9: PREPARE
Read from disk: `src/lib/plan-validator.js:24-100` (the boundary helper and its
derivation), `:180-240` (the per-step probes), `:264-320` (the region scan),
`:395-500` (the existing fence strip and pattern 3); the whole of
`tests/escalation-word-boundary.test.js`; `src/lib/regex-utils.js` for `safeRegExp`'s
contract; and the handover finding at
`plans/review/00095-a-skipped-test-is-counted-as-a-skipped-test.md:741-756`. Confirm
on disk which scans are region-scoped and which see the whole document — the answer
decides how many call sites the helper needs. Where the code disagrees with this
plan, **the code wins** — record the discrepancy.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/plan-validator.js` — `maskQuotedSpans`, applied at the three named sites,
  patterns compiled once at module load through `safeRegExp`.
- `tests/escalation-word-boundary.test.js` — the fourteen cases.

### Step 11: REVIEW
Confirm every pre-existing case in the test file passes **unmodified** — not one
assertion weakened, no range widened, no case deleted. Confirm the masking preserves
length exactly, by assertion rather than by inspection. Confirm the two detectors
classify identically. Confirm the helper is used at every site that matches a status
word, and that no site was left on the old text.

### Step 12: OPTIMIZE
Patterns compiled once at module load, never inside a loop. The masking is one pass
per scanned region, and the region is already extracted. Confirm the added cost on a
real plan is negligible and that no pattern has a nested quantifier.

### Step 13: SECURE
Every pattern goes through `safeRegExp`. No plan-derived text is interpolated into a
pattern — the helper's patterns are fixed literals, and the status words remain
code-controlled constants. Confirm the bounded-time case passes on a pathological
input, and that error messages continue to name a step number and a status, never
plan contents.

### Step 14: VERIFY
Run `node --test` on `tests/escalation-word-boundary.test.js`,
`tests/plan-validator.test.js`, `tests/plan-validator-coverage.test.js`,
`tests/gates.test.js`, `tests/approveplan-validates.test.js` and
`tests/greenfield-journey.test.js`. Then the full gated run `npm test`; record
`tests`, `suites`, `pass`, `fail`, the zero-skipped counter and the coverage line
verbatim. The coverage floor must not be lowered. **Then re-run the corpus
measurement and report both halves**: how many plans were refused before, how many
after, and — the number that matters most — how many genuine declarations are still
caught. If the after-count of caught declarations is zero, the change freed
everything and **must not ship**. Lint every changed file at `--max-warnings 0`. No
git operations.

### Step 15: DOCUMENT
Extend the block comment above the boundary helper: the boundary rules handle
compound and quantified forms, and the masking handles quoted and coded ones — two
different problems, both necessary, neither replacing the other. Name the
counter-example that rejected the trailing-marker proposal, so nobody re-proposes it.
Update the test-file count only if a file was added (this slice adds none).

### Step 16: FINAL-REVIEW
Report the two paths, the Step 8 verbatim red, the before-and-after corpus
measurement with both numbers, the verbatim green from Step 14, an explicit
restatement of the six things this slice does NOT fix, and every decision taken
under ambiguity.

## Ordering

`depends_on: none`. It **blocks**
`00103-the-last-mile-check-keeps-opting-itself-out`: that slice's subject is a
verdict whose name is one of the status words this checker matches, so writing it
honestly requires this fix — otherwise its author reaches for the same rewording
that hid this defect in the first place.

No sibling in this batch declares `src/lib/plan-validator.js` or
`tests/escalation-word-boundary.test.js`. The concurrently-edited
`src/lib/reachability.js` is untouched here.

## Decisions Taken Under Ambiguity

1. **The handover's proposed fix is rejected, with a counter-example.** Requiring a
   trailing marker, a colon form, or bold would free the mid-line declaration at
   `00012:129` — a genuine, unapproved declaration in this repository's own corpus.
   Freeing it would convert a blocking error into silence, which is worse than the
   defect being fixed.
2. **Masking, not pattern tightening.** The boundary rules already encode hard-won
   knowledge about compound forms; rewriting them risks reopening the defects they
   closed. Masking sits in front of them, changes nothing they guarantee, and
   matches the strip already shipped in this same file.
3. **The mask preserves length.** Three consumers report a step number parsed from
   the same line. A shorter mask would move offsets and misreport which step was
   named — a checker that names the wrong step is worse than one that names none.
4. **Single quotes are not masked.** An apostrophe in ordinary prose opens a span
   that never closes, and masking to end of paragraph would blind the checker
   wholesale. Double and typographic quotes are unambiguous; the apostrophe is not.
5. **Unbalanced delimiters mask nothing.** Treating a lone backtick as opening a
   span to end of region is exactly how a checker is quietly turned off. Only
   balanced pairs count, and case 9 pins it.
6. **The approval clause is matched against the SAME masked text.** Masking one and
   not the other would let an approval written inside backticks clear a real
   declaration — a forgery surface created by a fix for a false positive. Case 8
   exists to make that impossible.
7. **The corpus measurement ships as a test case, not as a one-off script.** A
   number measured once and written into a plan decays the day after. As a case it
   is re-measured on every gated run, and a future loosening that frees everything
   fails there.
8. **The known non-zero-count gap is left open deliberately.** It is documented in
   the module, indistinguishable in shape from a real declaration, and closing it
   would need the same judgment call that produced this defect. Recorded, not
   changed.
