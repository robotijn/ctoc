---
title: "Every stale-plan cleanup a human approves silently does nothing — the shipped recipe calls the cleanup function with arguments it cannot accept"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/commands/menu.md"
  - "tests/shipped-cleanup-recipe-executes.test.js"
  - ".ctoc/reachability-baseline.json"
---

# Every stale-plan cleanup a human approves silently does nothing

## The defect, read on disk and executed

`src/commands/menu.md:54` ships this recipe for `claude:cleanup-exec`:

```js
require('{{CTOC_ROOT}}/src/lib/stale-cleanup').executeCleanup(process.cwd(), '<category-or-plan>', '<action>')
```

The shipped signature, `src/lib/stale-cleanup.js:334`:

```js
function executeCleanup(proposal, root, deps = {}) {
```

The recipe passes the project root where a **proposal object** belongs, and a
category or slug where the **root** belongs. Inside the function,
`proposal.plan` is `undefined` on a string, so `scan.filter((c) => c.plan === undefined)`
matches nothing, `cand` is `null`, and the function takes its fail-closed branch at
`:354-365`:

```js
return { plan: proposal.plan, action: 'noop', skipped: true };
```

The human who commissioned this plan ran it and got `{"action":"noop","skipped":true}`.

**The next instruction in that same recipe is "then show the result and return to the
inbox."** So the sequence a person actually experiences is: open the cleanup review,
read the evidence for each stale plan, approve, be shown a result — and nothing moved.
The subsystem whose entire purpose is telling the truth about plan state tells a lie at
the only point where it acts.

This is not arity-detectable. `executeCleanup` declares three parameters with the third
defaulted, so `fn.length` is 2 and a three-argument call is perfectly legal JavaScript.
It fails silently at the level of *meaning*, which is why nothing caught it.

### The category route has no implementation at all

The same recipe covers `<category-or-plan>`. `executeCleanup` has no category branch —
its `switch` at `:371-386` accepts only `archive-to-done`, `advance-via-reconciliation`,
`revert` and `delete`, and a category name falls to `default: return {action:'none',
skipped: true}`.

**That absence is by design, not an omission.** `plans/done/SP4-human-gated-cleanup-review.md:597`
specifies the batch as an executor-side loop over the category's members, each member
executed as its own single-plan proposal:

```
executeCleanup({ plan: m.plan, proposedAction: <category→action> }, root)
```

So the missing piece is not a branch inside the library. It is that the shipped recipe
never expresses the loop. `src/lib/menu-screens.js:1405` emits
`claude:cleanup-exec category <category>` and the recipe on the other end cannot act on it.

## Was the recipe ever correct? No — it was wrong from the first line

Established from the artifacts on disk, without any git operation:

1. `plans/done/SP4-human-gated-cleanup-review.md` specifies `executeCleanup(proposal, root, deps)`
   in **four independent places** — the In-Scope contract at `:198`, the testability
   requirement M8 at `:99`, the risk mitigation at `:254` ("Declare
   `executeCleanup(proposal, root, deps = {})` … **from the start**"), and the decision
   record at `:270`. There is no version of this function in any plan, in any test, or on
   disk that ever accepted `(root, target, action)`.
2. SP4's own `files:` list is `stale-cleanup.js`, `menu-screens.js`,
   `stale-classifier.test.js`. **`src/commands/menu.md` was never in scope of the plan
   that built the function.** The recipe was authored against a signature nobody checked.
3. The critical defect SP4 records at `:277` (decision D1) is a *different* bug in the
   *library* — `path.join(root,'plans',proposal.stage,…)` producing `plans/undefined/<slug>.md`.
   That one was genuinely fixed: stage is now re-derived at `:336-367`. The claim "fixed"
   in that plan is true of the library and says nothing about the recipe.

**Verdict: this is not a regression. The recipe never worked.** Which is worse, because
it means the feature has never once performed a cleanup a human approved, and the
subsystem shipped, passed review, and passed Gate 3 in that state.

### Why the test suite is green over a recipe that cannot work

`tests/stale-cleanup-human-gate.test.js:121-131` contains this, verbatim:

```js
// Mirrors EXACTLY how the executor maps a 'claude:cleanup-exec …' string to an
// executeCleanup proposal (the production contract under test).
function parseCleanupExec(str) { … }
```

The test defines its **own** correct mapping from the action string to a proposal, and
then tests the library against it. It is a faithful test of the *intended* contract and
it has never touched the *shipped* one. Thirteen tests pass over a recipe none of them
reads. **A test that re-implements the instruction under test cannot detect that the
shipped instruction differs from it.**

## The fix

### The per-plan recipe

```js
node -e "const c=require('{{CTOC_ROOT}}/src/lib/stale-cleanup.js');console.log(JSON.stringify(c.executeCleanup({plan:'<slug>',proposedAction:'<action>'},process.cwd())))"
```

For the override-delete action only, the proposal additionally carries
`explicitlyRejected:true` — without it `deletePlan` **throws** by construction
(`:379-381` and `:289`), which is the intended two-layer refusal and must not be
softened.

### The category recipe — the loop SP4 specified

`src/lib/menu-screens.js` exports `_buildCleanupItems` (`:2555`), which returns the same
`{items}` the confirm screen counted, each item carrying `.plan`, `.category` and
`.proposedAction`. The batch is that list, filtered and executed member by member:

```js
node -e "const s=require('{{CTOC_ROOT}}/src/lib/menu-screens.js');const c=require('{{CTOC_ROOT}}/src/lib/stale-cleanup.js');const {items}=s._buildCleanupItems(process.cwd());const out=items.filter(i=>i.category==='<category>').map(i=>c.executeCleanup({plan:i.plan,proposedAction:i.proposedAction},process.cwd()));console.log(JSON.stringify(out))"
```

The batch never carries `explicitlyRejected`, so a `delete` can never enter through it —
`executeCleanup` would throw rather than delete, which is the correct direction and is
asserted by a test case below.

Both forms name the module **with its `.js` extension**. That is not cosmetic: the
reachability fence's surface pattern anchors on the extension, and the extensionless form
is why `stale-cleanup.js` sits in the dead-code baseline today. The general regex defect
is `00187`; this slice fixes its own recipe and takes its own file out of the baseline.

## Implementation Details

### File: `src/commands/menu.md`
**Action:** MODIFY — the `claude:cleanup-exec` row at `:54` only

Replace the single row with a row that states both forms explicitly, keeps the existing
truthful parenthetical about re-derivation and corruption-safe move-aside, and adds one
sentence naming the delete guard. The `cleanup-exec` entry in the NAV-claude list at
`:90` is correct and is not touched.

**Quote the real signature in the row.** A recipe that carries
`executeCleanup(proposal, root, deps = {})` beside its own call is a recipe whose next
editor can see the contract without leaving the line.

### File: `tests/shipped-cleanup-recipe-executes.test.js`
**Action:** CREATE

This test **parses the recipe out of `src/commands/menu.md` and executes it**. It must
never contain a copy of the recipe — a copy is precisely the failure mode that kept
`stale-cleanup-human-gate.test.js` green for a recipe that could not run.

| # | Case | Assertion |
|---|---|---|
| 1 | the per-plan recipe is extractable | the `claude:cleanup-exec` row yields a `node -e` program containing `executeCleanup`; a row that does not is a failure naming the row |
| 2 | **the per-plan recipe actually moves a plan** | seed a fixture project with one `shipped-but-early` stale plan; substitute the fixture root and slug into the extracted program; run it with `spawnSync(process.execPath, ['-e', prog], {cwd: fixture})`; assert the plan file is now under `plans/done/` |
| 3 | **the result is not a silent no-op** | the program's stdout parses as JSON whose `action` is `archive-to-done` and whose `skipped` is not `true`. This is the defect, measured on the shipped text |
| 4 | today's broken form is proven broken | call `executeCleanup(root, 'slug', 'archive-to-done')` directly against the same fixture → `{action:'noop', skipped:true}` and the plan has NOT moved. The regression guard: if someone restores the old argument order, this case tells them exactly what it does |
| 5 | the category recipe is extractable | the same row yields a second `node -e` program containing `_buildCleanupItems` |
| 6 | **the category recipe moves every member** | fixture seeded with three plans of one category; run the extracted batch program; all three moved; stdout is a three-element JSON array with no `skipped:true` |
| 7 | the batch cannot delete | seed a `dead-on-arrival` plan, run the batch for that category, assert the plan was REVERTED and still exists on disk |
| 8 | a delete through the recipe requires the explicit flag | run the extracted per-plan program with action `delete` and no `explicitlyRejected` → non-zero exit, the plan still exists, stderr names the guard |
| 9 | a slug that is not stale is a safe no-op | run the per-plan program for an unseeded slug → `{action:'noop',skipped:true}`, exit 0, no file touched anywhere under `plans/` |
| 10 | the recipe names the module with its extension | the extracted program's `require` argument ends in `.js` — the reachability fence depends on it and a future edit that drops it re-kills the file |

Fixtures under `os.tmpdir()` with `path.join` throughout; teardown with
`fs.promises.rm(root, {recursive:true, force:true})`. Cases 2, 3, 6 and 7 need
`listStaleCandidates` to classify deterministically without git — reuse the namespace-spy
approach already proven in `tests/stale-cleanup-human-gate.test.js:146` rather than
inventing a second stubbing style, and if the spy cannot be applied across a `spawnSync`
boundary, seed the fixture so the real classifier reaches the intended category and record
which route was taken.

### File: `.ctoc/reachability-baseline.json`
**Action:** MODIFY

Adding the `.js` extension makes `src/lib/stale-cleanup.js` genuinely reachable from a
shipped instruction surface. `tests/reachability.test.js:206-213` asserts the live count
**equals** `maxUnreachable` — a count that DROPS reds the suite until the baseline is
tightened. So this slice must lower it in the same change.

**Measure, do not copy a number from this plan.** Run the analyzer, read the live count,
set `maxUnreachable` to it, and remove exactly the files that left. The expectation is
26 → 25 with `src/lib/stale-cleanup.js` removed. **A disagreement with that expectation
is a finding to report, not a number to overwrite.** `src/lib/menu-screens.js` is already
reachable and must not appear in the diff.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| the corrected per-plan recipe | `src/lib/menu-screens.js:1456,1485,1488,1492` emit `claude:cleanup-exec plan <slug> <action>`; the session model executes the recipe row | `/ctoc:menu` → `inbox cleanup` |
| the corrected category recipe | `src/lib/menu-screens.js:1405` emits `claude:cleanup-exec category <category>` | `/ctoc:menu` → `inbox cleanup` → `Approve a category ▸` |
| `src/lib/stale-cleanup.js` | the recipe above, now naming it with `.js` | the same menu route |

Nothing here is reachable only from a test. The screens that emit these strings ship
today and are covered by `tests/menu-screens-coverage.test.js:638-703`.

## Test Plan

Covered by `tests/shipped-cleanup-recipe-executes.test.js`. Cases 3 and 4 are the defect
measured from both ends — the shipped text working, and the old form provably not.
Cases 7, 8 and 9 are the guards that stop the fix from becoming a batch delete.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file in full FIRST and run only it against the UNMODIFIED `menu.md`.
**Cases 2, 3, 6 and 10 must be RED.** Record case 3's red verbatim — the shipped recipe
returning `{"action":"noop","skipped":true}` while a plan sits unmoved is the evidence
this slice exists for. Case 4 passes immediately and must keep passing after the fix;
it asserts the broken form is broken, not that the recipe is broken.

### Step 9: PREPARE
Read from disk: `src/lib/stale-cleanup.js:280-397` (the guard, the dispatcher, the
exports), `src/lib/menu-screens.js:1250-1500` (`_buildCleanupItems` and every screen that
emits an exec string) and `:2536-2560` (the export list, to confirm `_buildCleanupItems`
is exported), `src/commands/menu.md:40-56`, and `tests/stale-cleanup-human-gate.test.js:100-160`
(the spy helpers). Confirm `_buildCleanupItems` returns objects carrying `plan`,
`category` and `proposedAction`. **Where the code disagrees with this plan, THE CODE WINS
and the disagreement is reported.**

### Step 10: IMPLEMENT
- `src/commands/menu.md` — the `claude:cleanup-exec` row carries both correct forms, the
  quoted real signature, and the delete-guard sentence.
- `tests/shipped-cleanup-recipe-executes.test.js` — the ten cases.
- `.ctoc/reachability-baseline.json` — measured count, measured removals.

### Step 11: REVIEW
Confirm the test extracts the recipe from the file rather than restating it — a reviewer
who finds the recipe text duplicated in the test must reject the slice, because that is
the exact defect being repaired. Confirm no path in the batch recipe can reach `delete`.
Confirm the recipe passes `process.cwd()` as the SECOND argument in every form.

### Step 12: OPTIMIZE
The batch runs one `listStaleCandidates` scan per member through `executeCleanup`'s own
re-derivation, on top of the one `_buildCleanupItems` scan. That is deliberate and stays:
re-deriving per member is the D1/D8 correctness property that survives render-to-exec
drift, and the path is cold, human-triggered, and capped at 20 rows. Do not cache it.

### Step 13: SECURE
`<slug>` and `<category>` are interpolated into a `node -e` program. Assert in the test
that a slug containing a quote, a semicolon, a backslash or a newline cannot break out of
the string literal — and if it can, the recipe must pass the slug through `process.argv`
rather than string interpolation. Record which form was chosen and why. The existing
slug sanitation at the screen layer (SP4 `:652`) is a second layer, never the only one.

### Step 14: VERIFY
`node --test tests/shipped-cleanup-recipe-executes.test.js`, then every existing test
touching stale cleanup or menu screens, then the full gated `npm test`. Lint at
`--max-warnings 0`. No git operations. **Report the live reachability count before and
after**, and report whether any real plan under `plans/` moved during the run — the
fixture must be the only thing that ever moves.

### Step 15: DOCUMENT
No CLAUDE.md change is required; the recipe documents itself. If the executor changes the
interpolation form for the Step 13 reason, record that in the recipe row so the next
author does not revert it.

### Step 16: FINAL-REVIEW
Report the Step 8 reds verbatim, the before-and-after reachability count, the Step 13
decision, and every decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** build the general fence that would catch the *next* wrong-argument
  recipe. This slice proves ONE recipe executes. Generalizing that to every
  state-mutating recipe in `src/commands/menu.md` is `00186`, which depends on this one.
- It does **not** fix the reachability regex that mis-seeded the baseline. Adding `.js`
  to this one recipe works around it; `00187` fixes the pattern and removes
  `src/lib/plan-numbering.js` too.
- It does **not** touch `src/lib/stale-cleanup.js`. The library is correct. Every line of
  this defect is in the instruction.
- It does **not** touch `src/lib/menu-screens.js`. The screens emit the right strings
  already.
- It does **not** address the two `silent-catch` entries recorded against
  `stale-cleanup.js` in `.ctoc/false-green-baseline.json:167-168`. They are existing debt
  in `_appendLog` and belong to the false-green ratchet.
- It does **not** re-litigate SP4's design. The category batch stays an executor-side loop
  because that is what SP4 specified and what keeps `executeCleanup` a single-plan
  primitive with one fail-closed shape.

## Decisions Taken Under Ambiguity

1. **The batch is an executor-side loop, not a new category branch in `executeCleanup`.**
   SP4 `:597` specifies exactly this, and a category branch inside the library would give
   the function two fail-closed shapes (one per plan, one per batch) where it now has one.
   The recipe was the missing half all along; the library needs nothing.
2. **The recipe uses the underscore-prefixed export `_buildCleanupItems`.** The
   underscore signals internal-by-convention, so this is a deliberate crossing. The
   alternative — re-deriving category membership inside the `node -e` program — would put
   a second copy of the classification logic in a shipped instruction, and two
   implementations of "which plans are in this category" is how the confirm screen's count
   and the batch's effect start disagreeing. One derivation, one truth. The export is
   already public in `module.exports`; if a reviewer wants a non-underscore alias, that is
   a rename in a later slice, not a reason to duplicate logic here.
3. **The test executes the recipe in a child process rather than `eval`-ing it.**
   `spawnSync(process.execPath, ['-e', program])` is what the session model actually does.
   An in-process `eval` would test a different execution mode and would share module state
   with the test, which is how a green test over a broken recipe happens.
4. **The test parses the recipe out of `menu.md`; it never restates it.** This is the
   load-bearing choice of the whole slice. A test holding its own copy is a test of the
   copy — demonstrated by `tests/stale-cleanup-human-gate.test.js:121`, which has been
   green over this defect since the feature shipped.
5. **The baseline number is measured at Step 10, not written from this plan.** If `00187`
   lands first, both `stale-cleanup.js` and `plan-numbering.js` leave the set together and
   the expected 25 is wrong. Instructing the executor to measure makes the slice correct
   under either landing order.
6. **The `.js` extension is added to the recipe now, rather than waiting for `00187`.**
   Naming a file by its real name is correct independent of any fence, and it means this
   slice satisfies Operating Lesson 16 on its own: the module it repairs becomes reachable
   in the same unit of work.
7. **Case 4 keeps the broken call alive as an assertion.** Deleting it after the fix would
   remove the only executable record of what the defect did. It is a regression guard
   phrased as a description, and it costs one fixture.
