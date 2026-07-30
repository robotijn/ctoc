---
iron_loop_verdict: true
title: "A failed tool detection stops reporting lint and typecheck as passed — a verification of nothing is not a pass"
type: implementation
parent_plan: none
depends_on: 00208-a-shallow-clone-stops-reporting-that-every-test-passed
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/quality-agent.js"
  - "tests/vacuous-verification.test.js"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T14:47:44.084Z
gate_crossed: implementation → todo
---

# A failed tool detection stops reporting lint and typecheck as passed

> Rebased 2026-07-30: every line number below was re-verified against the current tree.
> The functions moved (the file grew), and the runner `runCommand` is now
> `runConfiguredCommand` (a no-shell argv runner for agent-writable config strings). The
> defect itself is present and unchanged. The sibling `00208` has landed (it now sits in
> review), so `runSmartTests` already carries its own not-verified guard.

## The defect, read on disk

`src/lib/quality-agent.js:586-607`:

```js
async function runLint(tools) {
  console.log('\n  Running lint...');
  for (const [lang, langTools] of Object.entries(tools)) {
    if (!langTools.lint) continue;
    // runConfiguredCommand: a NO-SHELL argv runner for agent-writable config strings.
    const result = runConfiguredCommand(langTools.lint, { allowFail: true, silent: true, label: `${lang} lint` });
    if (!result.success) { return { passed: false, errors: 1, warnings: 0, … }; }
  }
  console.log('   Lint passed');
  return { passed: true, errors: 0, warnings: 0 };
}
```

`runTypecheck` at `:612-632` is the same function with a different key (`langTools.typecheck`).
Both now invoke `runConfiguredCommand`, not the old `runCommand` — the vacuous-pass loop
structure is unchanged; only the runner name moved.

**When `tools` is empty, the loop body never executes, `Lint passed` is printed, and
{ passed: true, errors: 0 } is returned.** The same holds when `tools` is populated
but no entry carries a `lint` key — every iteration hits `continue`.

`errors: 0` is not a measurement here. It is a literal in a return statement on a path
where nothing was measured.

### Composed with its siblings, the whole gate goes green on nothing

`runTieredChecks` at `:1472-1489`:

```js
const tier1 = {
  lint: await runLint(tools), typecheck: await runTypecheck(tools),
  tests: await runSmartTests(tools), security: await runSecurityScan()
};
const tier1Passed = Object.values(tier1).every(r => r.passed);
```

**A failed language detection makes lint, typecheck and tests ALL pass vacuously**,
and `tier1Passed` is `true`. The push proceeds. `00208` fixes the tests leg; this
slice fixes the other two and the state that records the result.

Two further sites in the same file:

- **A zero-language detection is persisted as a passing quality run.** The tier status
  is written via `qualityState.updateTierStatus('tier1', { status: 'pass', … })` at
  `:1482-1485` with no record that nothing ran, so the *stored* history says this
  project passed its quality gate.
- **`:1671-1672`** — success-shaped defaults written into persisted state. The full
  block is `:1668-1674` (`qualityState.setCompleted`); the two lines this slice inverts are:
  ```js
  lint: tier1.lint || { passed: true, errors: 0, warnings: 0 },       // :1671
  typecheck: tier1.typecheck || { passed: true, errors: 0 },          // :1672
  ```
  A missing result object becomes a passing one. **The fallback for "this check
  produced no result" is the success value** — the same shape as the defect above,
  written straight into the record. The sibling `tests:` default (`:1669`) is
  `00208`'s and the `security:` default (`:1673`) is out of scope — both are left
  untouched here.

## The fix already exists in this codebase

`src/lib/step-13-verify.js:151-170`:

```js
// VERIFY passes ONLY when at least one substantive check actually RAN,
const substantive = countSubstantiveChecks(result);
if (substantive === 0) { … }
result.passed = result.errors.length === 0 && substantive > 0;
result.summary = buildSummary(result, substantive);
```

The concept is already named, implemented, and shipped: **`errors.length === 0` is
never sufficient on its own; a check must also have RUN.** `countSubstantiveChecks`
(defined at `:183`) counts a lint/typecheck/tests check only when its result carries
`ran === true`; `buildSummary` at `:255` even special-cases `substantive === 0` (at
`:274`) so the human-readable output says so.

**Reuse the concept.** `countSubstantiveChecks` itself is shaped for the VERIFY
result object (`result.checks.{lint,types,tests}.ran === true`) and is not directly
callable here, so this slice adopts the *pattern* — a ran-count carried alongside the
verdict — rather than importing a function that does not fit. Step 9 reads that module
first and confirms the shape; if it turns out importable, importing beats reimplementing
and the plan defers to what the code says.

## What each function must return instead

Both `runLint` and `runTypecheck` gain a `ran` count and a third outcome:

| Situation | `passed` | `ran` | What is printed |
|---|---|---|---|
| tools detected, all commands succeed | `true` | n ≥ 1 | `Lint passed (n tool(s))` |
| tools detected, a command fails | `false` | n | unchanged |
| **no tool carries a lint command** | **`false`** | **0** | **`Lint NOT VERIFIED — no lint tool was detected`** |

The third row is the change, and `passed: false` is the deliberate choice. The
alternatives were considered and rejected in the decision record below: a `skipped`
flag that `tier1Passed` ignores would reproduce the defect one field to the left,
which is precisely how this class of defect propagates.

The `errors` field must also stop lying. On the not-verified path it is `null`, never
`0` — mirroring `test-gate.js`'s parsers, which return `null` rather than the success
value **specifically so an unreadable input cannot be mistaken for a clean one**. To
match the existing not-verified idiom in this same file (`undeterminedTestsResult` at
`:360`, `unreadableTestsResult` at `:575`, both of which set `passed: false` plus
`undetermined: true` and an explanatory `output` string), the not-verified lint/typecheck
result should carry the same `undetermined: true` marker and a message — the lint/typecheck
result shape differs from the test shape (`errors`/`warnings` vs `passCount`/`failed`),
so this is the shared PATTERN, not a byte-identical object.

### The two persisted-state sites

- `runTieredChecks` records the ran-counts alongside the tier status, so the stored
  history distinguishes "passed four checks" from "ran none".
- `:1671-1672` — the `|| { passed: true, … }` defaults become
  `|| { passed: false, ran: 0, errors: null, reason: 'no result produced' }`. **A
  check that produced no result did not pass.** The presence of a result object is
  the precondition for a verdict, not an optional detail.

## Implementation Details

### File: `src/lib/quality-agent.js`
**Action:** MODIFY — `runLint` (`:586-607`), `runTypecheck` (`:612-632`), the
`runTieredChecks` state write (`:1482-1485`), and the `:1671-1672` defaults

Count the tools that actually carry a command for each check. Return the
not-verified result when the count is zero, with a message naming which check and why.
Thread `ran` through into the persisted tier status. Invert the two success-shaped
lint/typecheck defaults.

**`runSecurityScan` (`:1059`) is NOT touched.** Whether it has the same shape was not
established, and changing it on suspicion inside a slice about a different function is
how scope creep enters. If Step 9's reading finds the same defect there, **report it
as a finding and leave it** — a new plan is the human's to schedule.

**`runSmartTests` (`:825`) is NOT touched** — that is `00208`, which this slice depends
on. It already returns `undeterminedTestsResult(...)` on an undetermined detection, so its
leg of the tier is already fixed. Both slices edit this file, so they cannot build
concurrently, and the dependency makes the order explicit rather than leaving it to the
scheduler's file-conflict serialisation.

### File: `tests/vacuous-verification.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | **`runLint({})`** | `passed: false`, `ran: 0`, `errors: null`; output says NOT VERIFIED, **not** `Lint passed`. The defect |
| 2 | **`runTypecheck({})`** | same shape |
| 3 | tools present but none carries `lint` | `passed: false`, `ran: 0` — the `continue`-only path |
| 4 | one tool with a succeeding lint command | `passed: true`, `ran: 1` — unbroken |
| 5 | one tool with a failing lint command | `passed: false`, `ran: 1` — a run failure and a non-run are distinguishable by `ran` |
| 6 | two tools, one fails | `passed: false`; `ran` reflects what executed |
| 7 | **`errors` is `null` on the not-verified path, never `0`** | asserted explicitly, both functions |
| 8 | **`tier1Passed` is false when detection is empty** | the composition test: an empty `tools` map must not produce a passing tier |
| 9 | **the persisted tier status records the ran counts** | a stored run with zero substantive checks is not stored as a plain `pass` |
| 10 | **the `:1671-1672` defaults are failure-shaped** | a missing `tier1.lint` yields `passed: false`, not `passed: true` |
| 11 | output distinguishes "no findings" from "did not run" | the two messages differ, and neither reads as the other |
| 12 | `runSecurityScan` is unmodified | a guard against scope creep into an unread function |

Fixtures pass synthetic `tools` objects directly — no temporary project needed for
most cases. Where a command must run, use a trivially portable one and assert on the
result shape rather than the tool's own output. Cross-platform: no shell scripts, no
assumption that any particular linter is installed. Note that `runLint`/`runTypecheck`
now shell out through `runConfiguredCommand`, which refuses a shell-operator command as
a FAILED check — a fixture that must simulate a run failure can use that refusal, and one
that must simulate success uses a portable single-word command.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `runLint`, `runTypecheck` | `runTieredChecks:1475-1476` | `/ctoc:push` quality gate |
| tier status ran-counts | `qualityState.updateTierStatus:1482` | the persisted quality history |
| the `:1671-1672` defaults | the `setCompleted` persisted-state write at `:1668-1674` | `/ctoc:push` |

All three are on the live push path today. Nothing here is reachable only from a test.

## Test Plan

Covered by `tests/vacuous-verification.test.js`. Cases 1, 2, 7, 8 and 10 are
load-bearing. Case 8 is the one that matters most: the individual functions could each
be fixed while the composition still passes, and the composition is what the push
command actually consults.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file in full FIRST and run only it. **Cases 1, 2, 3, 7, 8, 9, 10 and 11
must be RED.** Record case 8's red verbatim — a passing tier-1 verdict on an empty
tools map is the evidence, and it is the sentence that lets a push proceed on nothing.

### Step 9: PREPARE
Read from disk: `src/lib/quality-agent.js:583-632` (`runLint`, `runTypecheck`),
`:1472-1500` (`runTieredChecks` and the `updateTierStatus` write), `:1660-1690` (the
`setCompleted` defaults), `undeterminedTestsResult` (`:360`) and `unreadableTestsResult`
(`:575`) (the existing not-verified result shapes in this file — **match their
`passed:false` + `undetermined:true` + explanatory-`output` pattern rather than inventing
a third**); `src/lib/step-13-verify.js:150-290` (`countSubstantiveChecks` at `:183`,
`buildSummary` at `:255` — and decide whether the function is importable here or only the
pattern is); `src/lib/quality-state.js` for `updateTierStatus` (`:408`) and its stored
shape. Note the runner is `runConfiguredCommand`, not `runCommand`. Confirm `00208` has
landed (it is now in review). **Where the code disagrees with this plan, THE CODE
WINS — record it.**

### Step 10: IMPLEMENT
- `src/lib/quality-agent.js` — `ran` counts and the not-verified outcome in `runLint`
  (`:586-607`) and `runTypecheck` (`:612-632`); ran-counts threaded into the tier status
  (`:1482-1485`); the two success-shaped lint/typecheck defaults inverted (`:1671-1672`).
- `tests/vacuous-verification.test.js` — the twelve cases.

### Step 11: REVIEW
Confirm no path returns `passed: true` without `ran >= 1`. Confirm `errors` is `null`
and never `0` wherever nothing was measured. Confirm the not-verified result matches
the `undetermined:true` pattern `undeterminedTestsResult` already uses in this file.
**Report whether `runSecurityScan` (`:1059`) has the same defect — as a finding, without
fixing it.**

### Step 12: OPTIMIZE
One counter per loop. No new work on any path.

### Step 13: SECURE
`runConfiguredCommand` output can carry absolute paths and, on a misconfigured project,
tokens from a tool's own diagnostics. Confirm the not-verified messages contain no
command output at all — they describe the absence of a tool, so they have nothing
legitimate to echo. Confirm no detected tool command string is interpolated into a shell
in a newly added path (`runConfiguredCommand` already refuses shell-operator strings as a
failed check — do not add a code path that bypasses it).

### Step 14: VERIFY
`node --test tests/vacuous-verification.test.js` plus every existing quality-agent and
quality-state test, then the full gated run `npm test`. Lint at `--max-warnings 0`. No
git operations. **Report what `/ctoc:push`'s quality gate now reports for THIS
repository** — a project with real detected tools must still pass, and if it does not,
the detection is the finding, not the gate.

### Step 15: DOCUMENT
Record in `CLAUDE.md`'s quality-gate section that a check with zero detected tools
reports NOT VERIFIED and fails the tier. Update the documented test-file count in both
places from the live disk count.

### Step 16: FINAL-REVIEW
Report every Step 8 red verbatim, the Step 14 result for this repository, the
`runSecurityScan` finding, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** fix `runSmartTests` — `00208`.
- It does **not** examine or change `runSecurityScan`. Whether it shares this shape is
  reported as a finding at Step 11 and left for the human to schedule.
- It does **not** improve tool DETECTION. If the detector is wrong, this slice makes
  that loud instead of silent — which is the whole gain, and is not the same as fixing
  the detector.
- It does **not** retroactively correct persisted quality history. Existing stored runs
  keep whatever they recorded; only new runs carry ran-counts. **Rewriting stored
  history to say a past run verified nothing would be inventing a measurement nobody
  took.**
- It does **not** touch `runFullTests` (`:734`), whose counter discipline was confirmed
  correct and is the exemplar.

## Decisions Taken Under Ambiguity

1. **A zero-tool check FAILS rather than being marked skipped.** A `skipped` flag that
   `tier1Passed` does not consult would move the defect one field to the left and
   leave the gate green — which is exactly how this class propagates. Failing loudly is
   correct: a project with no lint tool has not been linted, and a gate that says
   otherwise is lying about the only thing it exists to report.
2. **This will fail loudly on projects that genuinely have no linter**, and that is
   accepted rather than softened. A project with no lint tool should learn that from
   its quality gate rather than receive a green tick. Softening it here would require
   a policy decision about which checks are optional per project — **that is the
   human's to make and is deliberately not decided in this slice.**
3. **`errors: null`, never `0`, on the not-verified path.** `0` is a measurement.
   `test-gate.js`'s parsers already return `null` for exactly this reason, and
   `CLAUDE.md` names that file as the fixed exemplar.
4. **The `|| { passed: true }` defaults are inverted rather than removed.** Removing
   them would throw on a missing result; inverting them records the absence honestly
   and keeps the write path total. Only the lint (`:1671`) and typecheck (`:1672`)
   defaults are inverted; `tests:` is `00208`'s and `security:` is out of scope.
5. **`countSubstantiveChecks` is adopted as a PATTERN, with importing preferred if
   Step 9 finds it fits.** It is shaped for the VERIFY result object
   (`result.checks.{lint,types,tests}.ran === true`). The plan states the preference
   and defers to what the code says rather than pre-committing to a copy.
6. **`runSecurityScan` is reported, not fixed.** It was not read during planning, and
   changing an unread function on suspicion inside a slice about two others is scope
   creep. Naming it in the review output surfaces it for the human to schedule.
7. **Persisted history is not rewritten.** Backfilling old runs with a verdict nobody
   measured would manufacture evidence — the same defect this repair set exists to
   remove, applied to the past.
8. **This slice depends on `00208` rather than merging with it.** Same file, so they
   serialise regardless; the explicit dependency makes the order intentional. They stay
   separate because `00208` is a scope fix with an in-file exemplar and this one
   changes what "pass" means across three sites — a crash in the larger change must not
   lose the more urgent one.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
