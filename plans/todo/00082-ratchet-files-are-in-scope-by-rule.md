---
approved_by: human
approved_at: 2026-07-19T11:58:15.071Z
gate_crossed: implementation → todo
---

---
title: "A build that trips a ratchet can move it — ratchet files are in scope by rule, and direction is enforced"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - ".ctoc/templates/implementation-plan.md.template"
  - "tests/coverage-ratchet-direction.test.js"
---

# A build that trips a ratchet can move it

Two slices in this wave had to edit a ratchet file outside their declared `files:`
because the change itself moved the ratchet:

- the concurrent-edit guard slice removed a live false-green site, so
  `.ctoc/false-green-baseline.json` went `220 → 219` and the fixed key had to be
  deleted (its decision 9);
- both it and the promote-parity slice added a test file, so `CLAUDE.md`'s
  documented test-file count went `420 → 421 → 422` (decisions 9 and 10).

Neither was avoidable and neither was predictable at planning time. **Nobody can
know in advance which ratchets a change will trip** — that is what makes them
ratchets. So the human ruled that ratchet files are in scope **by rule**, carried
by the plan template, rather than predicted per plan.

## What the declared-files check actually protects — checked, not assumed

The instruction to write this slice came with a stated cost: widening every plan's
write surface means a ratchet moved in the *wrong* direction is no longer caught by
the declared-files check, so whatever enforces direction carries that weight alone.
The instruction also said to check what enforces direction today and to say so
plainly if nothing does. Both were checked. The finding is more specific than the
premise, in one direction and in the other.

**First: the declared-files check never guarded two of the three files.**
`src/hooks/PreToolUse.Edit.js:58-65`:

```js
const WHITELIST = [
  '.gitignore',
  '.gitattributes',
  /^\.ctoc\//,
  /^\.local\//,
  /^plans\/.*\.md$/,
  /^VERSION$/,
];
```

`^\.ctoc\//` means **both JSON baselines are already writable by any agent, in any
plan, today** — with two deliberate carve-outs denied ahead of the whitelist (the
approval ledger at `.ctoc/approvals`, and the Gate-3 verify-evidence directory).
So for `.ctoc/false-green-baseline.json` and `.ctoc/coverage-baseline.json` the
stated cost does not apply: there is no protection to lose. The only file that was
genuinely blocked is `CLAUDE.md`, which the guard slice edited anyway and recorded.

**Second: direction enforcement exists for one ratchet and not the other.**

| Ratchet | Direction enforced? | By what |
|---|---|---|
| `.ctoc/false-green-baseline.json` | **yes, in both directions** | `tests/false-green-fence.test.js` — case 5 fails if the live count exceeds `maxFindings`; case 6 fails if it is *below* it (unclaimed progress must be claimed); case 7 rejects phantom entries; case 8 requires every whitelist entry to be currently flagged **and** to carry a written justification |
| `.ctoc/coverage-baseline.json` | **no** | `tests/coverage-gate.test.js:226-234` asserts only that `minPct` is a number in `(0, 100]` and that the gate reads it. **Nothing prevents lowering it.** The comment at `:224-225` says "may only be RAISED" — that is prose, not a check |
| `CLAUDE.md` documented counts | not a direction ratchet | `tests/doc-counts.test.js` verifies the count matches disk; counts legitimately move both ways |

So `minPct` could go `99 → 40` in one line and the entire suite would stay green.
That hole is **open right now**, not created by this ruling — the file has always
been whitelisted. Widening the declared-files surface does not open it, but it does
make it the last thing standing, which is precisely the weight the human named.
Shipping a rule that says "every plan may write the ratchets" while the coverage
ratchet has no direction check would be knowingly handing out a lowerable floor.

This slice therefore does two things: carries the ratchet files in the template,
and closes the direction hole it just proved exists.

## Implementation Details

### File: `.ctoc/templates/implementation-plan.md.template`
**Action:** MODIFY
**Purpose:** Every new implementation plan declares the ratchet files it may need to move.

Add to the template's `files:` block, with the comment that explains why they are
there — so an author who has never tripped a ratchet still understands the entries
rather than deleting them as noise:

```yaml
files:
  # … the plan's own files …
  # RATCHET FILES — in scope BY RULE, not by prediction. A change cannot know in
  # advance which ratchet it will move: fixing a false-green site lowers a count,
  # adding a test file changes a documented count. A build that trips a ratchet
  # must be able to move it in the SAME unit of work, or the gate blocks its own
  # repair. Direction is NOT granted by this declaration and is enforced
  # separately — debt may only SHRINK, and a permanent exemption still needs a
  # written justification per entry.
  - ".ctoc/false-green-baseline.json"
  - ".ctoc/coverage-baseline.json"
  - "CLAUDE.md"
```

Add a short paragraph to the template's guidance prose stating the same rule in
words, and stating what the declaration does **not** grant: it permits the write,
never the direction.

### File: `tests/coverage-ratchet-direction.test.js`
**Action:** CREATE
**Purpose:** Give the coverage ratchet the direction enforcement the false-green ratchet already has.

Modelled directly on `tests/false-green-fence.test.js` cases 5-8, which are the
working exemplar in this repository.

```js
/**
 * THE COVERAGE RATCHET ONLY TIGHTENS.
 *
 * .ctoc/coverage-baseline.json's `minPct` is the floor Step 14 VERIFY enforces.
 * Before this test, NOTHING checked its direction: tests/coverage-gate.test.js
 * asserts only that it is a number in (0,100] and that the gate reads it, so
 * `minPct` could be lowered from 99 to 40 in one line and the whole suite would
 * stay green. The comment in that file saying the baseline "may only be RAISED"
 * was prose, not a check.
 *
 * HISTORICAL_FLOOR is the ratchet. RAISE it when you raise the baseline. Lowering
 * it is the one edit this file exists to make impossible to do quietly.
 */
const HISTORICAL_FLOOR = 99;
```

Cases:

| # | Case | Assertion |
|---|---|---|
| 1 | **the floor never drops** | `baseline.minPct >= HISTORICAL_FLOOR`, with a failure message naming the current value, the historical floor, and the instruction never to lower either |
| 2 | the constant tracks the baseline | `HISTORICAL_FLOOR >= 99` — a second, independent statement of the same fact, so lowering the baseline requires editing two places in a file whose name says not to |
| 3 | the baseline is a usable floor | `minPct` is a finite number in `(0, 100]` (preserves what the existing test asserts, in the file that owns direction) |
| 4 | the baseline file exists and parses | absent or unparseable fails loudly rather than defaulting — a missing floor is not a floor of zero |
| 5 | the gate actually reads it | `gate.resolveThreshold(repoRoot) === baseline.minPct`, so the enforced floor and the recorded floor cannot drift |
| 6 | **raising is allowed** | a fixture baseline above the historical floor passes the same assertions — the ratchet tightens freely and only refuses to loosen |

### What this slice deliberately does NOT do

- It does not touch `src/hooks/PreToolUse.Edit.js`. The whitelist already permits
  `.ctoc/`, and widening it further to cover `CLAUDE.md` would grant the write to
  every tool call in every project, not just to a plan that declares it. The
  template declaration is the narrower mechanism.
- It does not change `.ctoc/false-green-baseline.json`'s two structures. `findings`
  (debt, no per-entry justification, may only shrink) and `whitelist` (permanent
  exemption, starts empty, written justification per entry) stay separate.
  Conflating them is what kills a fence, and `tests/false-green-fence.test.js`
  cases 7 and 8 already hold that line.
- It does not retroactively add the ratchet files to plans already written. Their
  authors will hit the same block and record the same handover; that is visible and
  correct. The template governs new plans.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| ratchet entries in the template | `src/lib/init-project.js` and the implementation-planner both generate plans from this template | every new implementation plan's `files:` |
| coverage direction test | `npm test` → `src/scripts/test-gate.js` runs the whole suite | the gated entry point |

The template is a live input to plan generation, not documentation; the test runs
in the gate on every commit. Neither is dead on arrival.

## Test Plan

Covered by `tests/coverage-ratchet-direction.test.js` above. The template change
is additionally verified at Step 14 by generating a plan from the template and
asserting the ratchet entries are present and parse as valid frontmatter — done
through the existing template-consuming path, not by string-matching the template
file, so the test proves the entries survive generation rather than merely
existing in the source.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/coverage-ratchet-direction.test.js` in full and run ONLY that file. Case 1 will pass immediately (the current baseline is 99). That is expected and is NOT a false green: prove the test bites by temporarily setting `HISTORICAL_FLOOR` above the baseline, watching it fail, and restoring it — record both outputs verbatim. A ratchet test that has never been seen to fail is a ratchet nobody has tested.
### Step 9: PREPARE — read from disk: `.ctoc/templates/implementation-plan.md.template` in full; `tests/false-green-fence.test.js` cases 5-8 (the exemplar to mirror); `tests/coverage-gate.test.js:210-240` (to avoid duplicating its assertions rather than complementing them); `.ctoc/coverage-baseline.json`; and `src/hooks/PreToolUse.Edit.js:58-89` to re-confirm the whitelist finding against the code rather than this plan's quotation.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `.ctoc/templates/implementation-plan.md.template` — the three ratchet entries in `files:`, the explanatory comment, and the guidance paragraph.
  - `tests/coverage-ratchet-direction.test.js` — the six cases.
### Step 11: REVIEW — confirm the template still parses as valid plan frontmatter after the addition (generate one and validate it through `src/lib/plan-validator.js`). Confirm no existing test asserts an exact `files:` length or an exact template body that this change breaks; if one does, the code is right and the test is corrected toward the new reality, never loosened. Report whether any OTHER ratchet exists in the repository that this slice did not cover — search for baseline/threshold JSON under `.ctoc/` and name each with whether its direction is enforced.
### Step 12: OPTIMIZE — the test reads two small files once; no scanning, no globbing.
### Step 13: SECURE — the template grants a plan the right to write `CLAUDE.md`, which is a documentation file, never a gate or an approval record. Confirm explicitly that no ratchet entry names anything under `.ctoc/approvals/` (the approval ledger) or the verify-evidence directory — both are denied ahead of the whitelist for exactly this reason, and neither may ever enter this list.
### Step 14: VERIFY — `node --test tests/coverage-ratchet-direction.test.js tests/coverage-gate.test.js tests/false-green-fence.test.js tests/doc-counts.test.js` green, then the full gated run `npm test`. Lint the new test file. No git operations.
### Step 15: DOCUMENT — the template's guidance paragraph states the rule and its limit in plain words. Add one line to the repository's own `CLAUDE.md` quality section recording that the coverage floor's direction is now enforced by a named test, so the next person to consider lowering it finds the check before the file.
### Step 16: FINAL-REVIEW — report files, tests, both verbatim outputs from Step 8 (the passing run and the deliberately-failed run), the Step 11 inventory of other ratchets, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **The stated cost is reported as smaller than stated, with evidence.** The
   instruction assumed the declared-files check was protecting the ratchet files.
   `src/hooks/PreToolUse.Edit.js:61` whitelists `^\.ctoc\//`, so both JSON baselines
   were already writable by any agent in any plan. Only `CLAUDE.md` was genuinely
   blocked. Reporting the premise back as it was given would have overstated what
   this change gives up.
2. **The real exposure is reported as larger than stated, with evidence, and is
   closed here.** The coverage floor has no direction enforcement at all — a fact
   that is true today, independent of this ruling. Shipping "every plan may write
   the ratchets" without closing it would knowingly distribute a lowerable floor.
   The fix is in scope because the ruling is what makes it load-bearing.
3. **Direction is enforced by a constant inside the test, not by reading history.**
   Reading the previous value from version control inside a test is fragile (shallow
   clones, detached checkouts, packaged installs) and would make the gate depend on
   repository shape. A committed constant converts a quiet one-line JSON tweak into
   an explicit edit to a test whose name and message both say never to do it. That
   is the same protection level `tests/false-green-fence.test.js` provides, and it
   is the strongest available without a server-side check.
4. **The floor is asserted twice (cases 1 and 2).** Redundant on purpose: lowering
   the floor then requires editing the baseline *and* the constant, so it cannot
   happen as a single incidental change.
5. **`CLAUDE.md` is granted to every plan through the template rather than added to
   the hook whitelist.** The whitelist grants every tool call in every project; the
   template grants only plans that carry the declaration, and the grant is visible
   in each plan's own frontmatter where a reviewer sees it.
6. **The template is the mechanism, so existing plans are unaffected.** Retrofitting
   the ratchet entries into plans already at a gate would edit approved scope after
   approval. Their authors hit the block, record the handover, and the reviewer sees
   it — visible and correct.
7. **Step 8 requires the test to be seen failing.** A ratchet test written against a
   baseline that already satisfies it is green from birth, which is indistinguishable
   from a test that asserts nothing. Deliberately inverting it once and recording
   both outputs is the only evidence that it bites.
