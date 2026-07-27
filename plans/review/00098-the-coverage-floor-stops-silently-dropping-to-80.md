---
approved_by: human
approved_at: 2026-07-19T16:43:31.685Z
gate_crossed: implementation → todo
title: "The coverage floor stops silently dropping to 80 — an unreadable floor refuses instead of guessing, and the stale number stops healing itself"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
blocks: 00082-ratchet-files-are-in-scope-by-rule, 00090-the-plan-critic-stops-reporting-a-score-it-did-not-earn
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/scripts/test-gate.js"
  - "tests/coverage-ratchet-direction.test.js"
  - ".ctoc/false-green-baseline.json"
  - "CLAUDE.md"
  - ".ctoc/templates/operating-lessons.md"
---

# The coverage floor stops silently dropping to 80

> **PROVENANCE.** This slice was split out of
> `plans/todo/00082-ratchet-files-are-in-scope-by-rule.md` by the human's ruling.
> That plan had grown to ten declared files spanning two independent subjects — a
> Gate-2 declaration mechanism, and this floor hardening. Each is coherent alone and
> together they exceeded the one-to-three sizing rule. **This is the urgent half:
> the mechanism is preventive, this is a live defect.** The declaration mechanism
> remains at `00082` and **depends on this slice**; the ordering derivation is below.

## The defect, verified by running it

`src/scripts/test-gate.js:220-229`, read on disk:

```js
function resolveThreshold(projectRoot) {
  try {
    const raw = safeFs.readFileSync(path.join(projectRoot, '.ctoc', 'coverage-baseline.json'), 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.minPct === 'number' && parsed.minPct > 0 && parsed.minPct <= 100) {
      return parsed.minPct;
    }
  } catch { /* no baseline file → aspirational default */ }
  return DEFAULT_THRESHOLD;
}
```

`DEFAULT_THRESHOLD = 80` (`:41`). The real floor is 99
(`.ctoc/coverage-baseline.json` reads `"minPct": 99`). **Every failure mode returns
80 silently, and the gate then prints a threshold and PASSES:**

| Input | Enforced floor | What the gate reports |
|---|---|---|
| baseline file absent | **80** | "threshold 80%" — and passes |
| baseline file corrupt or unparseable | **80** | same |
| `minPct` is the string `"99"` rather than the number `99` | **80** | same |
| the real repository today | 99 | correct |

**The floor drops nineteen points on a missing file, a corrupt file, or one value
changing type — and nothing says so.** The third row is the one to fear: it is a
single character in a JSON file, it looks correct to a human reading the diff, and
`typeof parsed.minPct === 'number'` sends it straight to the fallback.

This is the exact defect class this repository already fences: **a check reporting a
verdict on input it never received.** `CLAUDE.md` names the fixed exemplars, and one
of them is *this same file* — `test-gate.js`'s own output parsers return `null`,
never `0`, precisely so an unreadable input cannot be mistaken for a pass.
`resolveThreshold` does not follow its own file's rule.

**It is already tracked debt.** `.ctoc/false-green-baseline.json:219` lists it
verbatim:

```
"src/scripts/test-gate.js:silent-catch:resolveThreshold"
```

So the fence already saw it and it was tolerated so the fence could land. Paying it
down **moves that ratchet**: the entry leaves `findings` and `maxFindings` drops by
one (214 → 213 as read today). **Read the live count from the scanner — never trust
a number written in a plan**, including this one. `tests/false-green-fence.test.js`
case 6 fails loudly on unclaimed progress, which is the check that will tell you the
truth.

## The second half: a wrong number that heals itself

`CLAUDE.md` states the coverage floor **twice, with two different numbers**:

| Location | Says | Correct? |
|---|---|---|
| `CLAUDE.md:392` | **99** | yes — matches `.ctoc/coverage-baseline.json` |
| `CLAUDE.md:592` | **40** | **stale** |
| `.ctoc/templates/operating-lessons.md:71` | **40** | **stale — and this is the source** |

The third row is what makes this more than a typo. `src/lib/claude-md-lessons.js`
confirms `.ctoc/templates/operating-lessons.md` is the **canonical source injected
into the project instructions**, and `CLAUDE.md:592` sits inside that injected
block. So **correcting `CLAUDE.md` alone is silently reverted by the next
`/ctoc:update`** — the wrong number heals itself back into place.

Both must be corrected together. Do **not** add a third statement of the number;
make the two existing ones agree and cite `.ctoc/coverage-baseline.json` as the
source of truth.

## Implementation Details

### File: `src/scripts/test-gate.js`
**Action:** MODIFY — `resolveThreshold` only
**Purpose:** A floor that cannot be read is not a floor of 80.

**Absent and unreadable are DIFFERENT facts and must stop being reported as the same
number.** That distinction is the whole fix:

- **Baseline ABSENT** → a legitimate state (a project that predates instrumentation).
  Keep the documented default, but **print an explicit line naming it as a default**.
  Silence is the failure mode; an announced default is honest.
- **Baseline PRESENT but unreadable, unparseable, or `minPct` of the wrong type or
  out of range** → **REFUSE**. Do not return a threshold. The gate exits non-zero
  with a message naming the file and the actual problem. **A corrupt floor is a
  broken instrument, not permission to enforce a weaker one.**

Collapsing the two into one number is the original defect. Collapsing them the other
way — refusing on absence — would break every uninstrumented project. The
distinction is the fix, not a detail of it.

Mirror the discipline already in this same file: the output parsers return `null`,
never the success value, so "I could not read my input" can never be mistaken for
"everything passed."

### File: `tests/coverage-ratchet-direction.test.js`
**Action:** CREATE
**Purpose:** Direction enforcement for the coverage ratchet — including the no-input path that no test has ever reached.

Modelled directly on `tests/false-green-fence.test.js` cases 5-8, the working
exemplar in this repository.

```js
/**
 * THE COVERAGE RATCHET ONLY TIGHTENS — AND AN UNREADABLE FLOOR IS NOT A FLOOR.
 *
 * .ctoc/coverage-baseline.json's `minPct` is the floor Step 14 VERIFY enforces.
 * Before this test, NOTHING checked its direction: tests/coverage-gate.test.js
 * asserts only that it is a number in (0,100] and that the gate reads it, so
 * `minPct` could be lowered from 99 to 40 in one line and the whole suite would
 * stay green. The comment in that file saying the baseline "may only be RAISED"
 * was prose, not a check.
 *
 * Worse, `resolveThreshold` returned DEFAULT_THRESHOLD (80) on ANY read failure —
 * absent, corrupt, or a `minPct` that was a string rather than a number — while
 * printing a threshold and passing. Cases 7-10 matter most, because that fallback
 * branch was the single line in the whole mechanism no test ever reached.
 *
 * HISTORICAL_FLOOR is the ratchet. RAISE it when you raise the baseline. Lowering
 * it is the one edit this file exists to make impossible to do quietly.
 */
const HISTORICAL_FLOOR = 99;
```

| # | Case | Assertion |
|---|---|---|
| 1 | **the floor never drops** | `baseline.minPct >= HISTORICAL_FLOOR`, with a message naming the current value, the historical floor, and the instruction never to lower either |
| 2 | the constant tracks the baseline | `HISTORICAL_FLOOR >= 99` — a second independent statement, so lowering requires editing two places in a file whose name says not to |
| 3 | the baseline is a usable floor | `minPct` is a finite number in `(0, 100]` (preserves what the existing test asserts, in the file that owns direction) |
| 4 | the baseline file exists and parses | absent or unparseable fails loudly rather than defaulting — a missing floor is not a floor of zero |
| 5 | the gate actually reads it | `resolveThreshold(repoRoot) === baseline.minPct`, so the enforced and recorded floors cannot drift |
| 6 | **raising is allowed** | a fixture baseline above the historical floor passes the same assertions — the ratchet tightens freely and only refuses to loosen |
| 7 | **a CORRUPT baseline REFUSES, it does not return 80** | fixture whose baseline is `{not json` → throws / the gate exits non-zero. It must NOT return a number |
| 8 | **a WRONG-TYPE `minPct` REFUSES** | fixture `{"minPct": "99"}` — the subtlest of the three and the likeliest in practice |
| 9 | **an OUT-OF-RANGE `minPct` REFUSES** | fixtures `{"minPct": 0}` and `{"minPct": 101}` |
| 10 | **an ABSENT baseline is allowed but ANNOUNCED** | fixture with no baseline file → the documented default applies AND the output names it as a default. Silence is the failure |

Cross-platform: `path.join`, `os.tmpdir()`, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

### File: `.ctoc/false-green-baseline.json`
**Action:** MODIFY — remove one paid-down entry
**Purpose:** Claim the progress; the fence fails loudly if you do not.

Remove `"src/scripts/test-gate.js:silent-catch:resolveThreshold"` from `findings` and
lower `maxFindings` to **the scanner's live count**. Do not trust `214 → 213`; read
it. The two structures (`findings` = debt, may only shrink, no per-entry
justification; `whitelist` = permanent exemption, starts empty, justification
required) are **not** otherwise touched — conflating them is what kills a fence.

### Files: `CLAUDE.md`, `.ctoc/templates/operating-lessons.md`
**Action:** MODIFY — the stale coverage-floor number only
**Purpose:** Stop the wrong number from healing itself back into place.

Correct `CLAUDE.md:592` (**40** → the live baseline value) and
`.ctoc/templates/operating-lessons.md:71` (the same stale **40**), which is the
canonical source injected into the project instructions per
`src/lib/claude-md-lessons.js`. `CLAUDE.md:392` already says 99 and is left alone.
Cite `.ctoc/coverage-baseline.json` as the source of truth; add no third statement.

**This slice also CREATES a test file**, which moves the documented test-file count
that `tests/doc-counts.test.js` verifies against disk (in two places: the
"Run all N test files" line and the "tests/  N test files" project-structure line).
**Read the live count from disk and update both** — see Step 15.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `resolveThreshold` refusal + announced default | `test-gate.js:main` | `npm test` — the gated entry point |
| coverage direction test | `resolveTestFiles()` → the suite | `npm test` |
| the two documentation corrections | read by the human and re-injected by `/ctoc:update` | `src/lib/claude-md-lessons.js` |

Nothing here is reachable only from a test: `resolveThreshold` is called by the gate's
own `main`, on every `npm test`.

## Test Plan

Covered by `tests/coverage-ratchet-direction.test.js` above. The load-bearing cases
are 7-10, which drive the fallback branch that no existing test reaches — that branch
is where the nineteen-point drop lives.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] `tests/coverage-ratchet-direction.test.js` written FIRST, twelve cases, run before any source change
- [x] TDD-RED observed: `tests 12 / pass 6 / fail 6` — cases 7, 8, 9, 10, 11 and 12 all red
- [x] The defect measured directly before the fix: absent, corrupt, `minPct` as the string `"99"`, `minPct` 0 and `minPct` 101 ALL returned 80; the real repository returned 99
- [x] Case 12's red output is the evidence verbatim: `[CTOC test-gate] coverage 100% (threshold 80%), skipped 0, failed 0` then `[CTOC test-gate] PASS`, on a project with NO baseline file at all
- [x] Ratchet proven to bite: `HISTORICAL_FLOOR` temporarily raised to 100, case 1 failed with the full never-lower message, constant restored to 99

### Step 9: PREPARE
- [x] Read from disk: `resolveThreshold`, `DEFAULT_THRESHOLD`, `main`, and the three `null`-returning parsers that are the exemplar
- [x] Read `tests/coverage-gate.test.js:215-250` — it asserts absent → 80, which the fix deliberately preserves, so no existing test needed changing
- [x] Read `.ctoc/coverage-baseline.json` (`minPct` 99) and measured the LIVE false-green count rather than trusting the plan's number
- [x] Confirmed via `src/lib/claude-md-lessons.js:42` that `.ctoc/templates/operating-lessons.md` is the canonical injected source

### Step 10: IMPLEMENT
- [x] `src/scripts/test-gate.js` — `resolveThreshold` now distinguishes ABSENT (default 80, announced) from PRESENT-but-untrustworthy (throws, naming the repository-relative path and the actual problem)
- [x] `src/scripts/test-gate.js` — `main` resolves the floor BEFORE spawning the suite, so a broken instrument is caught in milliseconds instead of after a full run
- [x] `tests/coverage-ratchet-direction.test.js` — twelve cases created
- [x] `.ctoc/false-green-baseline.json` — `resolveThreshold` entry removed, `maxFindings` lowered 214 → 213 (measured live)
- [x] `CLAUDE.md` + `.ctoc/templates/operating-lessons.md` — the stale 40 corrected in both, identically

### Step 11: REVIEW
- [x] No path in `resolveThreshold` returns a number it did not read; every non-absent failure throws
- [x] The absent case still returns 80, so no uninstrumented project regresses; `tests/coverage-gate.test.js` passes UNMODIFIED
- [x] Other ratchets inventoried — see "Other ratchets" below

### Step 12: OPTIMIZE
- [x] Still exactly one file read; no scanning or globbing added
- [x] Net faster on the failure path — a corrupt floor now refuses before the suite runs rather than after it

### Step 13: SECURE
- [x] Refusal messages name `.ctoc/coverage-baseline.json` (repository-relative), never an absolute path — asserted by case 7
- [x] Unparsed file contents are never echoed; only the single offending scalar, type-named and capped at 32 characters — asserted by case 7
- [x] All fixtures write under `os.tmpdir()` and are removed in `finally`; the real baseline is never touched

### Step 14: VERIFY
- [x] Lint clean at `--max-warnings 0` on both changed JavaScript files
- [x] Typecheck clean (`tests/typecheck.test.js`, fail 0)
- [x] Full gated run `npm test`: `tests 10078 / suites 1740 / pass 10078 / fail 0 / 0 skipped / todo 0`
- [x] `[CTOC test-gate] coverage 99.06% (threshold 99%), skipped 0, failed 0` → `[CTOC test-gate] PASS`
- [x] The 99 is READ, not assumed: the same binary now REFUSES a corrupt, wrong-typed or out-of-range floor instead of printing 80
- [x] Floor left at 99 — measured coverage moved 99.04 / 99.06 across runs, so raising it would buy strictness at the price of flakiness
- [x] Reachability and export-reachability fences green

### Step 15: DOCUMENT
- [x] `CLAUDE.md` records that the ratchet's direction is now a named test and that an unreadable floor refuses
- [x] The stale floor corrected in BOTH `CLAUDE.md` and `.ctoc/templates/operating-lessons.md`, identically, so the next update cannot revert it
- [x] Documented test-file count updated 432 → 433 in both places

### Step 16: FINAL-REVIEW
- [x] All steps above complete, full suite green, ratchet moved in the correct direction
- [x] One plan correction and one self-inflicted defect recorded below
- [x] Ready for human review at Gate 3

---

#### Other ratchets under `.ctoc/` — the Step 11 inventory

| Ratchet | Ceiling key | Reader's behaviour on unreadable input |
|---|---|---|
| `coverage-baseline.json` | `minPct` | **was the defect** — returned a weaker floor; now refuses |
| `export-reachability-baseline.json` | `maxDead` | fails **CLOSED** — a malformed baseline excuses nothing, so every dead export blocks. Correct |
| `reachability-baseline.json` | `maxUnreachable` | ceiling compared against a live scan; no weaker-value substitution |
| `typecheck-baseline.json` | `maxErrors` | direction enforced by `tests/typecheck.test.js`, which requires a numeric `maxErrors` and fails on a missing one |
| `watcher-baseline.json` | `maxLegacy` | `tests/watcher-shape.test.js` requires a numeric ceiling and fails on a missing one |

The finding: coverage was the **only** one whose reader substituted a weaker success
value for an unreadable input. The others either fail closed or refuse a non-numeric
ceiling outright. No sibling fix is required, which is why none is bundled here.

---

#### Original step prose (retained)

Step 8 — write `tests/coverage-ratchet-direction.test.js` in full and run ONLY that file. **Cases 7, 8, 9 and 10 MUST be RED today** — that is the whole point of this slice, since `resolveThreshold` currently returns 80 for all four and prints a passing threshold. Record each red verbatim, including the reported threshold, because "the gate said 80% and passed" is the evidence. Case 1 will pass immediately (the baseline is 99); that is expected and is NOT a false green — prove it bites by temporarily raising `HISTORICAL_FLOOR` above the baseline, watching it fail, and restoring it. Record both outputs. A ratchet test that has never been seen to fail is a ratchet nobody has tested.
Step 9 PREPARE — read from disk: `src/scripts/test-gate.js:180-260` in full (`resolveThreshold`, `DEFAULT_THRESHOLD`, `main`, and the `null`-returning output parsers that are the exemplar to mirror); `tests/false-green-fence.test.js` cases 5-8; `tests/coverage-gate.test.js:210-240` (so the new file complements rather than duplicates its assertions); `.ctoc/coverage-baseline.json`; `.ctoc/false-green-baseline.json` (locate the `resolveThreshold` entry and read the LIVE `maxFindings`); `CLAUDE.md:390-394` and `:588-596`; `.ctoc/templates/operating-lessons.md:65-75`; and `src/lib/claude-md-lessons.js` to confirm the template really is the injected source. Where the code disagrees with this plan, THE CODE WINS — record it.
Step 10 IMPLEMENT — one step, files as sub-items.
  - `src/scripts/test-gate.js` — `resolveThreshold` refuses on unreadable / corrupt / wrong-type / out-of-range, and ANNOUNCES the absent-baseline default.
  - `tests/coverage-ratchet-direction.test.js` — the ten cases.
  - `.ctoc/false-green-baseline.json` — remove the `resolveThreshold` entry; lower `maxFindings` to the LIVE measured count.
  - `CLAUDE.md` + `.ctoc/templates/operating-lessons.md` — the stale floor number, both places.
Step 11 REVIEW — confirm no path in `resolveThreshold` can return a number it did not read. Confirm the absent case still returns the documented default AND prints its announcement (a refusal there would break every uninstrumented project — that regression is as bad as the defect). Confirm `tests/coverage-gate.test.js` still passes unmodified; if it asserts the old fallback behaviour, the CODE is right and that test is corrected toward the real behaviour, never loosened. Report whether any OTHER ratchet exists under `.ctoc/`, and for each whether its direction is enforced **and whether its reader fails loud on unreadable input** — that second column is this slice's finding and is the one to look for elsewhere.
Step 12 OPTIMIZE — `resolveThreshold` still performs exactly one read; the test reads two small files once. No scanning, no globbing.
Step 13 SECURE — confirm the new refusal messages name a repository-relative path and never an absolute home directory, and that a corrupt baseline's contents are never echoed into output (a baseline file is not a secret store, but echoing unparsed file contents is how one becomes one). Confirm the fixtures write only under `os.tmpdir()` and never touch the real `.ctoc/coverage-baseline.json`.
Step 14 VERIFY — `node --test tests/coverage-ratchet-direction.test.js tests/coverage-gate.test.js tests/false-green-fence.test.js tests/doc-counts.test.js` green, then the full gated run `npm test`. Lint the changed JavaScript at `--max-warnings 0`. No git operations. **Report the enforced threshold the gate prints, verbatim — after this slice it must be 99, and it must be 99 because it was READ, not because it was assumed.**
Step 15 DOCUMENT — record in `CLAUDE.md` that the coverage floor's direction is now enforced by a named test AND that an unreadable floor now refuses rather than defaulting, so the next person to consider lowering it finds the check before the file. Correct the stale **40** at `CLAUDE.md:592` and at `.ctoc/templates/operating-lessons.md:71` — **both, or the next `/ctoc:update` reverts the fix.** Then update `CLAUDE.md`'s documented test-file count in BOTH places (the "Run all N test files" line and the "tests/  N test files" project-structure line), reading the live count from disk first — this slice adds a test file and `tests/doc-counts.test.js` compares that count against disk.
Step 16 FINAL-REVIEW — report files, tests, every verbatim output from Step 8 (the four red cases with their reported thresholds, the passing run, and the deliberately-failed ratchet run), the `maxFindings` movement with its LIVE measured value, the before/after documented test-file count, the Step 11 inventory of other ratchets with their fail-loud status, and every decision taken under ambiguity.

## Ordering — why this slice lands FIRST

Declared in frontmatter: `blocks: 00082-…, 00090-…`.

**Against `00082` (the declaration mechanism).** Both slices declare `CLAUDE.md`, so
they cannot build concurrently — the scheduler serialises them on file conflict
regardless, but the semantic reason is stronger than the mechanical one:

> **`00082` is a new fence, and its Step 14 verifies it by running `npm test` — the
> gate whose floor reader is the defect this slice fixes.** Verifying a new fence
> with an instrument already known to substitute 80 for "I could not read my input"
> is exactly the circularity both slices exist to remove. Fix the instrument, then
> use it.

That is an independent derivation and it agrees with the coordinator's reading ("the
live defect before the preventive mechanism"), with one addition: the live-defect
argument alone would leave the order a preference, and the circularity argument makes
it a requirement.

**Against `00090` (the plan critic).** `00090` deletes a substantial body of covered
code and its own Step 14 forbids the corrective move. This slice **freezes** the
floor at 99 and makes lowering it require editing two places. That freeze must exist
before the deletions are measured against it, or the floor moves underneath them
silently — which is the same defect in a slower form. *(This `blocks` edge was
carried across from `00082`, where it originated: it was always the floor freeze that
created the coupling, never the declaration mechanism.)*

## The cross-plan deadlock, and the escape route — READ THIS

`00090` deletes covered code; this slice freezes the floor. If those deletions drop
measured coverage below 99, the two plans deadlock: the floor may not be lowered and
the deleted code may not be restored, and the cheapest escape for an unattended
builder is the exact edit both plans forbid.

The ordering fixes the sequence but not the corner, so the escape route is written in
words in both plans:

> **If coverage falls below the floor after a DELETION of covered code, the floor is
> not the thing that is wrong and neither is the deletion.** Measure the real
> percentage, report it with the before/after numbers, and **STOP — surface it to
> the human as a fork.** Do not lower `HISTORICAL_FLOOR`, do not lower `minPct`, do
> not restore deleted dead code to inflate the denominator, and do not add tests
> written solely to raise a number. Deleting untested dead code normally RAISES
> coverage; a fall means something else moved, and that is a finding, not a chore.

## Decisions Taken Under Ambiguity

1. **Absent and unreadable are treated DIFFERENTLY, and that is the fix rather than
   a detail of it.** An absent baseline is a legitimate state and keeps the
   documented default — but must ANNOUNCE it. A present-but-unreadable baseline is a
   broken instrument and REFUSES. Collapsing them into one number is the original
   defect; collapsing them the other way would break every uninstrumented project.
2. **The refusal is a hard non-zero exit, not a warning.** A warning printed above a
   passing run is indistinguishable from the current behaviour to anyone reading a
   green result, and the whole defect is that a broken read looks like a pass.
3. **Direction is enforced by a constant inside the test, not by reading version
   control.** Reading the previous value from history inside a test is fragile
   (shallow clones, detached checkouts, packaged installs) and would make the gate
   depend on repository shape. A committed constant converts a quiet one-line JSON
   tweak into an explicit edit to a test whose name and message both say never to do
   it — the same protection `tests/false-green-fence.test.js` provides.
4. **The floor is asserted twice (cases 1 and 2), redundantly on purpose.** Lowering
   it then requires editing the baseline *and* the constant, so it cannot happen as
   a single incidental change.
5. **Step 8 requires the ratchet test to be seen failing.** A ratchet test written
   against a baseline that already satisfies it is green from birth, which is
   indistinguishable from a test that asserts nothing. Inverting it once and
   recording both outputs is the only evidence that it bites.
6. **The `maxFindings` movement is MEASURED, never predicted.** `214 → 213` is what
   was read at planning time and is deliberately written as an illustration, not a
   target. `tests/false-green-fence.test.js` case 6 fails on unclaimed progress, so a
   stale number fails loudly — but reading the live count is the instruction, because
   a plan that hands an executor a number invites the executor to make reality match
   the plan.
7. **The stale floor number is corrected in TWO files, not one.** The pre-mortem
   named `CLAUDE.md` alone. Reading further found `.ctoc/templates/operating-lessons.md:71`
   carrying the same stale 40, and `src/lib/claude-md-lessons.js` confirms that
   template is the canonical source injected into the project instructions — so
   fixing `CLAUDE.md` alone would be reverted by the next `/ctoc:update`. A wrong
   number that heals itself is worse than a wrong number, because the second person
   to notice it finds a file that already looks corrected.
8. **This slice was SPLIT OUT of `00082` by the human's ruling, and carries the
   `blocks: 00090` edge with it.** The coupling with `00090` was always created by
   the floor freeze, never by the declaration mechanism, so the edge belongs here.
   `00082` retains its original title and subject; see its own decision record.
9. **The ordering against `00082` is derived from CIRCULARITY, not only from
   urgency.** Both touch `CLAUDE.md` so they cannot build concurrently, and the live
   defect argues for this one first. The stronger reason: `00082` is a new fence
   whose Step 14 verifies it by running the very gate whose floor reader is broken
   here. Fix the instrument, then use it to check the new fence.
10. **EXECUTION CORRECTION — the announcement does NOT belong inside
    `resolveThreshold`'s default behaviour, and the full run proved it.** The plan
    said the absent case must "print an explicit line". Implemented literally — a
    default sink writing to stdout — it produced a REGRESSION of the very kind this
    slice removes: `tests/coverage-gate.test.js` calls `resolveThreshold` on a
    baseline-less temp directory, its announcement leaked into the suite output that
    the gate re-prints, and the real gate's report then read
    `enforcing the DEFAULT floor of 80%` directly above `threshold 99%`. A false alarm
    inside the report is the same defect wearing the opposite coat. Corrected:
    `notice` defaults to a no-op, `main` supplies the reporting sink, and case 12
    drives the real command line to prove the announcement is genuinely emitted where
    a human reads it. The announcement is the REPORT's job, not the library's.
11. **The floor is resolved BEFORE the suite is spawned, which the plan did not
    specify.** Refusing after a multi-minute run is honest but wasteful, and it leaves
    a window in which the gate has results but no threshold to judge them against.
    Resolving first means the gate can never reach a verdict it would have had to
    guess a threshold for, and it makes the refusal test cheap enough to be a real
    subprocess test rather than a mock.
12. **The floor stays at 99 and was NOT ratcheted up.** Measured coverage read 99.04%
    and 99.06% across two runs of this slice. Raising the floor to 99.0-something
    would buy strictness at the price of a flaky gate, which is a worse instrument.
    Reported, not moved — per the plan's own instruction.
13. **`tests/coverage-gate.test.js` was NOT modified.** Its absent-baseline case
    asserts `resolveThreshold(empty) === 80`, which is exactly the behaviour the fix
    preserves, so the existing test remained correct and untouched. No test was
    weakened, deleted or special-cased anywhere in this slice.
