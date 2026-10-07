---
title: "The plan checker does not read a quotation as a claim that the plan creates a file"
type: implementation
created: 2026-10-05
priority: medium
effort: small
depends_on: none
files:
  - src/lib/plan-validator.js
  - tests/plan-validator.test.js
---

# The plan checker does not read a quotation as a claim that the plan creates a file

## Problem Statement

When a build finishes, `completeExecution` in `src/lib/actions.js` (line 1021) runs `validateForReview` in `src/lib/plan-validator.js`. That runs `validateNoContradictions`, whose first pattern treats the words create, created, add, added or "new file" followed by a path, anywhere outside a fenced code block, as the plan's claim that it created that file. If the file does not exist, the plan is refused. The pattern does not recognise a quotation. A plan that quotes the old text it replaces, for example a table cell holding an agent's former sentence in double quotes, is refused for a file it never claimed.

The real case is the tool-grants plan `plans/review/plan-writing-agents-can-edit-and-search.md`. It had to reword its own faithful quotation of the vision-advisor's old instruction. Its table row at line 143 records "reworded at the owner's answer so the plan checker does not read it as a file this plan creates". A refusal at that point also records a kickback against the circuit breaker (`completeExecution` calls `recordStepKickback`). The only workaround, rewording a quotation, is the "gate defeated by rewording" that the module's own `maskQuotedSpans` comment calls a measurement of the wording rather than the work.

Fixed means two things. A create or add verb that sits inside a balanced double-quoted or typographically quoted span, on one line, is not a claim. Every claim written outside a quotation still errors, including one whose path is itself in quotes.

## Scope

This plan changes `validateNoContradictions` in `src/lib/plan-validator.js` and adds cases to `tests/plan-validator.test.js`. It does not change the script-reference pattern (pattern two, warnings only), the status-word scans, `maskQuotedSpans`, or any other validator.

Written by the implementation planner on 2026-10-05. Everything below was read from files in this repository; nothing was run. Claims are labelled **read**, **believed** or **to verify**.

## What was verified, and how

- **read**: `validateNoContradictions` (lines 673-834). Fenced blocks are stripped (lines 688-689), and backtick spans that contain a call are blanked (`INLINE_CALL_SPAN_RE`, line 690). The scan then runs `createdFilePattern` (line 701) over the result. Quotation spans are deliberately not masked for this pattern. The comment at lines 806-813 explains that masking its input would hide a real claim written in backticks.
- **read**: the reported text. It is an old agent sentence quoted inside a table cell, shown in the fenced block below because outside a fence this plan would trip the same checker. In it, the verb sits inside the double-quoted span. The backtick span holding the path has no parenthesis, so `INLINE_CALL_SPAN_RE` leaves it visible. The capture is `plans/functional/{slug}.md`. It contains a separator, so `isPathPlausible` accepts it (lines 161-164). The file does not exist, so the result is an error. Every guard Pattern 1 has (the call guard, the fused-verb guard and the plausibility guard) passes this text through.

  ```text
  | V6 | "### Single Plan: Direct Conversion", item 2, line 387 | "Create `plans/functional/{slug}.md` using `Write()` with this format:" | replace with the sentence below |
  ```

- **read**: the quotation patterns already exist and are linear: `"[^"\n]*"` and `“[^”\n]*”` at `MASKED_SPAN_PATTERNS` lines 113-114. Both are single-line by construction.
- **read**: the live callers are `completeExecution` (actions.js line 1021, the move from building to review) and the stale in-progress cleanup (actions.js line 2211). Both refuse on `valid === false`.
- **believed**: the original wording of the quotation is the text shown above. The plan now in `plans/review/` holds the reworded form (it adds "the file"). Step 9 confirms the original from git history before the test copies it.

## Implementation Details

### `src/lib/plan-validator.js`

1. Name the two quotation patterns once and reuse them, so the list of what counts as a quotation stays in one place:

   ```js
   // A quotation: balanced, single-line, double or typographic quotes. The single
   // quote is excluded for the reason maskQuotedSpans gives (an apostrophe never closes).
   const QUOTATION_PATTERNS = [
     safeRegExp('"[^"\\n]*"', 'g'),
     safeRegExp('“[^”\\n]*”', 'g'),
   ];
   ```

   `MASKED_SPAN_PATTERNS` becomes the three code-span patterns followed by `...QUOTATION_PATTERNS`. The masking itself does not change.

2. In `validateNoContradictions`, after `scanContent` is built, build a quotation-only mask of it. Blanking keeps the same length, exactly as `maskQuotedSpans` does:

   ```js
   let quoted = scanContent;
   for (const pattern of QUOTATION_PATTERNS) {
     quoted = quoted.replace(pattern, (span) => span.replace(NON_NEWLINE_RE, ' '));
   }
   ```

3. In the Pattern 1 loop, after the call guard and before the fused-verb guard:

   ```js
   // A verb INSIDE a quotation is quoted text, not this plan's claim. Only the verb's
   // position decides: a claim whose PATH is quoted keeps its verb outside the span
   // and still errors. Same length, so the offset is exact.
   if (quoted[match.index] === ' ') continue;
   ```

   The verb always starts with a letter, so the character at `scanContent[match.index]` is never a space. A space at the same offset in `quoted` therefore means the verb was blanked as part of a quotation.

4. Extend the function's header comment ("A CITATION is not a claim") with this fifth shape and its limit: an unbalanced quote masks nothing. An inch mark used as a quote on the same line (`5" wide; …; 6" tall`) can pair with a later quote and hide a claim between them. That is the same limit `maskQuotedSpans` already carries for the status scans, and it is stated rather than engineered around.

No new pattern is built at run time. No new import is added.

### Wiring — the live call sites

| What | Live call site | Root |
|---|---|---|
| the quotation rule in `validateNoContradictions` | `validateForReview` → `actions.completeExecution` (line 1021) and the stale in-progress cleanup (line 2211) | the building-to-review move, reached from the menu and from the iron-loop executor's completion |

## Test plan (written first, Step 8)

All cases go in `tests/plan-validator.test.js`, beside the existing `00260` cases, and drive `validator.validateNoContradictions(content, testDir)` against the per-test temporary project the file already builds. The inputs are listed in the fenced block below, one per case, because written outside a fence several of them would be refused by this very checker.

```text
case 1  (the original row, confirmed at Step 9)
| V6 | "### Single Plan: Direct Conversion", item 2, line 387 | "Create `plans/functional/{slug}.md` using `Write()` with this format:" | replace with the sentence below |
case 2  The old line read “Create `src/lib/gone-typographic-xyz.js` for the feature.”
case 3  Created "src/lib/gone-quoted-path-xyz.js" for the feature.
case 4  | row | Created `src/lib/gone-cell-xyz.js` | done |
case 5  The "plan says: created `src/lib/gone-unbalanced-xyz.js`
case 6  "quoted words" and then created `src/lib/gone-after-quote-xyz.js`
```

1. **The real refusal, byte for byte.** Case 1's row is added to `MISREAD_CORPUS`, labelled with its source. Expected: no "claimed as created" error. Red today.
2. **A typographic quotation** (case 2). Expected: no error. Red today.
3. **Teeth: a claim whose path is quoted** (case 3). Expected: still errors and names `gone-quoted-path-xyz.js`. Green today and must stay green.
4. **Teeth: a table cell with no quotation** (case 4). Expected: still errors.
5. **Teeth: an unbalanced quote masks nothing** (case 5, one quote only). Expected: still errors.
6. **Teeth: a claim after a closed quotation on the same line** (case 6). Expected: still errors.
7. **Through the live entry.** Write a temporary plan file holding case 1's row under `## Scope` and a complete `## Execution Plan`. Call `validator.validateForReview(planPath, testDir)` and assert that no error contains "claimed as created". This proves the rule reaches the gate a human sees, not only the helper.

The paths in cases 2 to 6 are deliberately absent from disk, so a case that stops erroring is a real loss of teeth, never a file that happens to exist.

## Security review

- **No new input surface.** Plan text was already scanned; the new mask is a length-preserving copy built with two existing linear patterns.
- **Failing direction.** The change can only remove a match, so it loosens a checker. The teeth cases 3 to 6 pin every shape that must still refuse. The stated limit (an inch mark pairing with a later quote) is the only known way a real claim can now pass, and it requires a quote character on the same line as the claim.
- **No dynamic pattern**: the existing `safeRegExp` path is used, which the security lint already accepts in this file.

## Acceptance criteria

1. The real table row from the tool-grants plan, in its original quoted wording, produces no "claimed as created" error. The same holds through `validateForReview`.
2. A typographically quoted claim produces no error.
3. A claim whose verb is outside any quotation still errors, including when its path is quoted, when it sits in a table cell, when the line has an unbalanced quote, and when it follows a closed quotation.
4. `npm test` passes: fail 0, skipped 0, coverage at or above the floor in `.ctoc/coverage-baseline.json`. The linter reports zero warnings on `src/lib/plan-validator.js`.

## Questions for the owner

None. The one choice here (whether to also exempt template placeholders) is recorded below as a decision.

## Decisions Taken Under Ambiguity

1. **Only the verb's position decides.** Masking the whole quotation from Pattern 1 would also hide a real claim whose path is written in quotes (test case 3). The comment at lines 806-813 records the same hazard for backticks.
2. **Template placeholders are not exempted.** The real case's path is a template (`{slug}`). Treating `{`, `}`, `<` or `>` in a capture as "not a file" would have fixed it too, but the 00260 discipline in this function adds a rejection only for a refusal actually observed. No refusal of a placeholder outside a quotation was found. The quotation rule alone fixes the reported case.
3. **Pattern two (script references) is left as it is.** It only warns, and no warning on a quotation was reported.
4. **Single quotes stay unmasked**, for the reason `maskQuotedSpans` gives: an apostrophe opens a span that never closes.

## Neighbours (seen, not built here; scheduling is the owner's)

- **The same verb pattern has no left word boundary.** `created?` matches inside longer words. The existing fused-verb guard handles the case seen so far (a verb syllable inside a slug); others are possible. Not observed as a refusal.

## Execution Plan

### Step 8: TEST
- [ ] Write test cases 1 to 7 in `tests/plan-validator.test.js` (case 1 uses the wording shown above; Step 9 corrects it if git history differs).
- [ ] Run `node --test tests/plan-validator.test.js`. Expect RED on cases 1, 2 and 7, and GREEN on the teeth cases 3 to 6. Record the failing lines.

### Step 9: PREPARE
- [ ] Read the git history of `plans/review/plan-writing-agents-can-edit-and-search.md` (or its earlier location) and record the original wording of the quoted row. Update case 1 to match it byte for byte.
- [ ] Record `node --version`.
- [ ] Run the extended Pattern 1 over every plan file under `plans/` in a scratch run. Record each claim that the new rule stops reporting, with its file and line, so the loosening is measured, not assumed. Every dropped claim must have its verb inside a quotation; any other dropped claim stops the build and is reported.

### Step 10: IMPLEMENT
- [ ] `src/lib/plan-validator.js`: `QUOTATION_PATTERNS`, `MASKED_SPAN_PATTERNS` reusing them, the quotation-only mask in `validateNoContradictions`, the verb-position guard, and the header comment's fifth shape and its limit.
- [ ] Run `node --test tests/plan-validator.test.js`. Expect GREEN.

### Step 11: REVIEW
- [ ] Dispatch `iron-loop-critic` on the diff. It should attack whether the verb offset can ever point at a quote character, whether any teeth case could pass vacuously, and whether the Step 9 list of dropped claims holds a real claim.

### Step 12: OPTIMIZE
- [ ] Build the quotation-only mask once per call, never per match.

### Step 13: SECURE
- [ ] Dispatch `security-scanner` on the diff. Confirm no pattern is built from plan text, both patterns are linear, and the loosening is bounded to quoted verbs.

### Step 14: VERIFY
- [ ] Run `npm test`: fail 0, skipped 0, coverage at or above `.ctoc/coverage-baseline.json` `minPct`.
- [ ] Run `npm run lint`: zero warnings, including the regular-expression safety rules.

### Step 15: DOCUMENT
- [ ] Confirm the header comment of `validateNoContradictions` lists the quotation shape and its limit.

### Step 16: FINAL-REVIEW
- [ ] Show the owner, in full, the result of `validateForReview` on a scratch plan holding the real row: refused before the change, accepted after.
- [ ] Dispatch `iron-loop-critic` for the final review against the acceptance criteria.
- [ ] Hand the result to the owner for his decision to call it done.
