---
iron_loop_verdict: true
title: "A shipped recipe is proven by running it — every state-changing instruction in the menu is executed against a fixture, because no check that reads it can tell it is wrong"
type: implementation
parent_plan: none
depends_on: 00185-every-stale-plan-cleanup-a-human-approves-does-nothing
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/recipe-harness.js"
  - "tests/shipped-recipes-execute.test.js"
  - ".ctoc/recipe-coverage.json"
  - "CLAUDE.md"
approved_by: human
approved_at: 2026-07-30T14:47:43.851Z
gate_crossed: implementation → todo
  - "src/lib/iron-loop-enforcer.js"
---

# A shipped recipe is proven by running it

## The question this plan answers, asked plainly

`00185` repairs one recipe that called a real function with arguments its real signature
could not accept. The question that matters more: **can any mechanism catch the next one,
or is the honest answer "a convention"?**

This plan states the answer as found, including the part that is negative.

### What a static check CANNOT do — established, not assumed

The obvious mechanism is to extract each `require('<path>').fn(a, b, c)` call from the
shipped instruction surfaces, resolve the module, and compare against the function's
declared parameters. **On this defect that check returns green.**

`executeCleanup(proposal, root, deps = {})` has `Function.prototype.length === 2`,
because a parameter with a default does not count toward `length`. The broken recipe
passed **three** arguments. Three arguments to a function accepting two-to-three is
arity-legal in every sense a static checker can measure. The call was wrong in the
*meaning* of each argument — a string where an object belonged — and JavaScript carries
no type at that boundary to compare against. (Verified against the current
`src/lib/stale-cleanup.js`: `function executeCleanup(proposal, root, deps = {})` — the
arity argument still holds exactly.)

The remaining static options were considered and are rejected with reasons:

| Candidate | Why it does not work |
|---|---|
| Arity comparison | green on the actual defect, as above. It would catch only a recipe passing more arguments than the function has parameters |
| Parameter-name heuristics (a parameter named `proposal` receiving `process.cwd()`) | guessing dressed as a check. It fires on correct code whenever a name is generic (`opts`, `input`, `target`) and stays silent whenever it is not. A fence whose verdict depends on identifier fashion is a fence nobody will trust after its third false positive |
| JSDoc `@param {object}` versus the literal passed | better, but every recipe would need complete and current JSDoc, and a stale docblock — a defect this repository has already shipped — makes the checker confidently wrong |
| Type inference across the boundary | not available in a dynamically typed language without a type checker over both the markdown and the module |

**So: reading the recipe cannot produce a trustworthy verdict.** That is the honest
finding, and it is the argument for the only mechanism that can.

### What CAN catch it: running it

Execute the recipe against a fixture seeded so that a specific observable change must
occur, then assert the change occurred. This yields a verdict on evidence rather than on
appearance, and it caught the defect in `00185` on the first run. It is the same
discipline this repository already applies to its own instruments: a check that reports a
verdict on input it never received is the false-green class the fence at
`src/lib/false-green-scan.js` exists to stop, and a recipe checker that never runs the
recipe is exactly that shape.

The cost is real and is stated rather than hidden: **each covered recipe needs a fixture
and an expectation, written by a human.** That cost is why this plan covers the recipes
that CHANGE STATE and does not pretend to cover all of them.

## Scope — the state-changing recipes, and only those

A recipe qualifies when executing it mutates the repository or the project's durable
state: it moves a plan, writes a setting, writes a ledger entry, writes to `.ctoc/`, or
deletes a file. A recipe that only reads and renders is out of scope; its failure is
visible on the screen the moment a human uses it, which is the opposite of this defect
class.

Enumerated from `src/commands/start.md` — the shipped menu instruction surface. It was
`src/commands/menu.md` when this plan was first drafted on 2026-07-20 and has since been
RENAMED to `start.md`; the recipes moved with it. Re-verified against the file as it stands
during the 2026-07-30 rebase, and to be re-enumerated once more at Step 9 because the file
keeps changing. Row anchors are approximate and shift on every edit to `start.md` — identify
each recipe by its `claude:` menu action and the function it calls, NOT by line number:

| Recipe (menu action) | Program | State it changes |
|---|---|---|
| `create-plan` | `plan-numbering.allocatePlanNumber(process.cwd())` | stakes an atomic claim file under `.ctoc/` (exclusive-create) — a wrong or colliding number is silent |
| Plan-number repair | `plan-numbering.renumberImplementationPlans(process.cwd())` | renames implementation-plan files and rewrites every `parent_plan`/`depends_on` reference |
| `cleanup-exec` | `stale-cleanup.executeCleanup(proposal, root)` | moves or deletes plan files — the recipe `00185` repairs (its shipped call form passes a string where the `proposal` object belongs; `executeCleanup`'s real arity is `(proposal, root, deps = {})`, `length === 2`) |
| `set-environment` | `settings.setSetting('general','environment',…)` | writes `.ctoc/settings.json` |
| `env-keep-defaults` | `settings.setSetting('general','environment_prompt_dismissed',true,…)` | writes `.ctoc/settings.json` |
| `dismiss-stale` | `stale-detector.scanCheapCandidates` + `dismissStale` | writes the dismissal store |
| `set-compliance-regime` | `compliance-regime.writeActiveProfiles` / `declineComplianceRegime` | writes the regime marker |
| `approve-stubs` / Ledger backfill | `src/scripts/ledger-backfill.js --vision` (and `--plan … --stage … --reason …`) | writes the approval ledger |

The read-only `Plan-number check` recipe (`plan-numbering.findNumberCollisions`) is OUT of
scope — it only reads and renders, and its failure is visible on screen the moment a human
runs it. `plan-numbering.nextImplementationPlanNumber` (the pure read-only helper the first
draft cited as the `create-plan` recipe) is no longer that recipe; the shipped `create-plan`
recipe now calls the claim-staking `allocatePlanNumber`, which is why it is in scope.

**Every one of these in-scope recipes is a `node -e` or `node <script>` program with a real
signature on the other end, and not one of them is executed by any test today.**

## What this builds

### `src/lib/recipe-harness.js` — extraction and execution

- `extractRecipes(markdownPath)` → `[{ row, label, program, kind }]`. Parses fenced and
  inline `node -e "…"` and `node "<path>" <args>` programs out of a shipped instruction
  file, preserving the row label so a failure names the menu action a human would click.
  Placeholders (`{{CTOC_ROOT}}`, `${CLAUDE_PLUGIN_ROOT}`, `<slug>`, `<action>`,
  `<category>`, `<category-or-plan>`, `{env}`, `{profile}`) are returned as a declared
  `placeholders` list rather than silently substituted — an unrecognised placeholder is
  an ERROR, never a guess, because guessing a substitution is how a harness produces a
  green run over a recipe it never really executed.
- `runRecipe(program, { root, substitutions })` → `{ code, stdout, stderr, json }`.
  Substitutes declared placeholders, runs via `spawnSync(process.execPath, ['-e', program],
  { cwd: root })` with a bounded timeout, and returns the parsed stdout when it is JSON.
  **`maxBuffer` is set explicitly and an overflow is reported as a FAILURE**, never
  swallowed — an `execSync` overflowing its default buffer and recording a passing suite
  as a failure is one of the five documented false-green signatures in this repository.

Both functions return structured results and throw only on programmer error (which
includes a `markdownPath` that does not exist on disk — a moved or renamed target is a
LOUD throw naming the missing path, never a silent zero-recipe result). Nothing here
catches an error and continues.

### `.ctoc/recipe-coverage.json` — the ratchet, and the honest gap

Two separate structures, mirroring `.ctoc/reachability-baseline.json`, because conflating
them is what kills a fence:

- `covered` — recipes with a fixture and an assertion. **May only ever GROW.**
- `uncovered` — state-changing recipes that exist and have no fixture yet, each with a
  one-line reason. **May only ever SHRINK.** This list is the honest statement that the
  mechanism is partial. A new state-changing recipe added to `start.md` and absent from
  BOTH lists fails the test — so the fence catches the *arrival* of an unchecked recipe
  even before anyone writes its fixture.

There is no whitelist. A read-only recipe is not in either list because it is out of
scope by definition, and the test's scope predicate — not a per-entry exemption — is what
excludes it.

### `tests/shipped-recipes-execute.test.js` — the fence

| # | Case | Assertion |
|---|---|---|
| 1 | extraction finds every `node` program in `start.md` | the extracted count matches a live scan AND is NON-ZERO — a harness that extracts zero programs from `start.md` (its target file moved/renamed, or the parser regressed) FAILS rather than reporting an empty match as green; a row whose program cannot be parsed FAILS naming the row |
| 2 | every extracted program's `require` targets resolve | each required path exists on disk, with the `.js` extension |
| 3 | **every named function exists on the resolved module** | `typeof mod[fn] === 'function'`; a recipe naming a function that is not exported fails here. This is the one static check that IS trustworthy, and it is cheap |
| 4 | **every covered recipe executes and produces its declared effect** | one sub-case per `covered` entry: seed fixture, run, assert the specific observable change |
| 5 | **no covered recipe returns a silent no-op** | for each, stdout parses and does not report `skipped:true` where the fixture was seeded for a real action. This is `00185`'s defect, generalized |
| 6 | the coverage ledger is complete | every state-changing recipe in `start.md` appears in `covered` or `uncovered`; the in-scope scan MUST be non-empty (a zero-length in-scope set FAILS — an empty ledger otherwise passes vacuously); a new recipe in neither list FAILS with the row text and instructions to add a fixture |
| 7 | the ratchet only tightens | `covered` count never falls below the file's recorded number; `uncovered` never rises |
| 8 | `uncovered` entries are honest | every entry names a recipe that still exists in `start.md`; a phantom entry FAILS |
| 9 | a deliberately broken recipe is caught | a fixture markdown file containing `executeCleanup(process.cwd(), 'x', 'y')` — the historical defect, still the shape of the shipped `cleanup-exec` recipe until `00185` lands — is detected by the harness as producing a no-op. **The harness is tested on the bug it exists to find**, or nobody can tell whether it works |
| 10 | no fixture run touches the real repository | assert `plans/` under the real root is byte-identical before and after the suite |

## Implementation Details

Fixtures under `os.tmpdir()`, `path.join` everywhere, `fs.promises.rm` teardown.
Cross-platform: `process.execPath` rather than the string `node`, and no shell — the
programs are passed as an argument array, so a program containing `&&` or `|` is a
parse-time failure rather than a shell invocation.

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `extractRecipes`, `runRecipe` | `tests/shipped-recipes-execute.test.js` | `npm test` |

**This is the one case in this repository where a test is the legitimate only caller**, and
the reason must be stated rather than assumed: the harness is an *instrument*, in the same
class as `src/lib/false-green-scan.js` (called from `tests/false-green-fence.test.js` and
from `iron-loop-enforcer`) and `src/lib/reachability.js`. If the reachability fence flags
`recipe-harness.js` as unreachable at Step 14, **do not add it to the baseline** — wire it
into `src/lib/iron-loop-enforcer.js`'s check list as a named check, exactly as the
false-green scan is wired, and record that this was done. A new dead file created by the
plan that polices dead files would be an embarrassment the ratchet is right to catch.

## Test Plan

Covered by `tests/shipped-recipes-execute.test.js`. Case 9 is the load-bearing one: a
harness that has never been shown catching the historical defect is an unvalidated
instrument, and this repository has shipped five of those. Case 1's non-zero clause is the
second load-bearing one after this rebase: the recipe file was RENAMED (`menu.md` →
`start.md`) once already, and a harness that silently extracts nothing when its target
moves is the exact false-green shape this whole plan exists to fence.

## Execution Plan (Steps 8-16)

### Step 8: TEST
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Write the test file FIRST. Case 9 must be RED before the harness exists and GREEN after —
record both verbatim. Cases 1, 2 and 3 must be RED at first run because the harness does
not exist. Case 6 will initially list every state-changing recipe as uncovered; that is
the correct starting state and it is not a failure.

### Step 9: PREPARE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
**Re-enumerate the state-changing recipes from `src/commands/start.md` as it stands** — do
not trust this plan's table, which was re-verified on 2026-07-30 and will drift again.
`00185` repairs the `cleanup-exec` recipe (the shipped `executeCleanup(process.cwd(), …)`
call form that passes a string where the `proposal` object belongs), so confirm its FIXED
shape on disk before covering it. Identify each recipe by its menu action, never by line
number. For each, read the target module and confirm the named export exists — the
2026-07-30 rebase confirmed `plan-numbering.allocatePlanNumber`/`renumberImplementationPlans`/`findNumberCollisions`,
`settings.setSetting`, `stale-detector.scanCheapCandidates`/`dismissStale`,
`compliance-regime.writeActiveProfiles`/`declineComplianceRegime`, and
`src/scripts/ledger-backfill.js` all exist, but re-verify at build time. Read
`src/lib/false-green-scan.js` for the five signatures this harness must not itself commit,
and the live-ratchet section of `tests/reachability.test.js` (the `NO NEW DEAD FILE` /
count-may-only-shrink assertions, ~line 135 onward) for the ratchet shape to mirror. Read
`src/lib/iron-loop-enforcer.js`'s check registration in case Step 14 requires the wiring
above.

### Step 10: IMPLEMENT
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
- `src/lib/recipe-harness.js` — `extractRecipes`, `runRecipe`, explicit `maxBuffer`,
  bounded timeout, no shell, no silent catch, and a LOUD throw when `markdownPath` is
  absent.
- `tests/shipped-recipes-execute.test.js` — the ten cases plus one sub-case per covered
  recipe.
- `.ctoc/recipe-coverage.json` — `covered` seeded with every recipe that got a fixture in
  this slice; `uncovered` carrying the rest, each with a reason.

**Seed `covered` with what was actually written, never with what was intended.** A
coverage ledger claiming a fixture that does not exist is the same lie in a new file.

### Step 11: REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Confirm no extraction path substitutes an unrecognised placeholder. Confirm no `catch`
swallows a failure into a pass. Confirm the harness throws (not zero-returns) on a missing
target file. Confirm each covered case asserts a specific observable change and not merely
exit code zero — a recipe can exit zero and do nothing, which is this entire defect class.

### Step 12: OPTIMIZE
One child process per covered recipe. Report the added wall-clock time at Step 14; if it
exceeds roughly ten seconds, group fixtures by recipe rather than caching results. **Do
not memoize a run** — a cached execution is a recipe that was not executed.

### Step 13: SECURE
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Programs are executed with no shell and with a bounded timeout, in a temporary directory,
never against the real root. Substituted values are drawn from a fixed fixture set, never
from the environment. `stdout` is capped and, where a recipe could surface a path from the
host, only its length and a match flag are asserted rather than its contents.

### Step 14: VERIFY
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
`node --test tests/shipped-recipes-execute.test.js`, then the full gated `npm test`. Lint
at `--max-warnings 0`. No git operations. **Report the added runtime, the covered count,
the uncovered count with reasons, and whether the reachability fence flagged
`recipe-harness.js`** — and if it did, that the enforcer wiring was added rather than a
baseline entry.

### Step 15: DOCUMENT
Add a short section to `CLAUDE.md` beside the false-green fence describing this one: what
it covers, what it deliberately does not, and the sentence that a shipped recipe is proven
by running it. Update the documented module and test counts from a live count on disk.

### Step 16: FINAL-REVIEW
- [x] Complete — evidence in this plan's Execution Log / Executor Verification section; REVIEW (iron-loop-critic) and SECURE (security-scanner) re-confirmed clean 2026-07-30, full suite green (npm test exit 0).
Report case 9 both ways, the coverage ledger as written, the runtime cost, and every
decision taken under ambiguity.

## What this plan does NOT fix

- It does **not** cover read-only recipes. Their failure is visible on the screen; the
  fixture cost is not repaid.
- It does **not** cover the agent definitions under `agents/**`, which also carry
  executable recipes. Extending the harness to those surfaces is separate work and is the
  human's to schedule. `src/commands/start.md` is where the state-changing recipes live
  today.
- It does **not** detect a recipe that runs correctly but does the *wrong* thing. The
  fixture asserts the effect its author declared; a wrong declaration passes.
- It does **not** overlap the two fences already owned elsewhere. **One fence per
  invariant, or the two drift and the human trusts neither.**

  | Invariant | Owner |
  |---|---|
  | an order to an agent to run code its `tools:` grant cannot execute | `00110` |
  | a document naming a task kind the accepted vocabulary rejects, or a setting nothing reads | `00073` |
  | **a shipped recipe whose call the real signature cannot accept** | **this plan** |

  `00110` builds `src/lib/unexecutable-instruction-scan.js`, which does not exist on disk
  yet. **This plan neither creates nor edits that module**, and that plan must not grow a
  recipe-execution check. The invariants are genuinely different: theirs is an instruction
  with no receiver, this one is an instruction whose receiver rejects it silently.
- It does **not** claim completeness. The `uncovered` list is the size of the gap, in the
  file, where nobody has to take anyone's word for it.

## Decisions Taken Under Ambiguity

1. **The mechanism executes rather than reads, and the negative finding is recorded in the
   plan itself.** Static arity checking returns green on the defect that commissioned this
   work; that fact belongs in the record, or someone rebuilds the cheap checker in a year
   and believes it.
2. **Scope is state-changing recipes only.** Covering all recipes would multiply the
   fixture cost for the class whose failures are already visible. The line is drawn on
   observable state change, which is checkable, rather than on importance, which is not.
3. **`uncovered` is a first-class structure, not a whitelist.** It says out loud that the
   fence is partial. A fence that implied completeness it does not have would be a second
   instance of the defect it was built to catch.
4. **Case 9 tests the harness against the historical bug.** An instrument that has never
   been shown to catch anything is an unvalidated instrument. The fixture is three lines
   and it is the difference between a fence and a decoration.
5. **A test as the sole caller is accepted here and nowhere else.** The harness is an
   instrument, matching the established pattern of `false-green-scan.js` and
   `reachability.js`. The escape route if the fence disagrees is to WIRE it into the
   enforcer, never to add a baseline entry — recorded in the wiring table so the executor
   cannot take the easy exit.
6. **Unrecognised placeholders are an error, not a substitution.** Guessing what
   `<category-or-plan>` meant is precisely how the broken recipe survived: it read as
   plausible. A harness that guesses inherits the failure it exists to detect.
7. **Nothing is memoized.** A cached recipe execution is a verdict on input the run never
   received, which is the exact false-green signature this repository fences.
8. **A missing target file is a LOUD throw and a zero-recipe extraction FAILS (rebase,
   2026-07-30).** The recipe surface was renamed once already (`menu.md` → `start.md`); a
   harness that silently reads nothing when its target moves is the very false-green shape
   this plan fences. `extractRecipes` throws on an absent path, and Case 1 asserts a
   NON-ZERO extracted count, so a re-pointed or regressed harness fails red instead of
   passing on an empty set.

### Build-time decisions (executor, 2026-07-30)

9. **Covered set = 4 recipes, seeded from what was actually written.** `create-plan`
   (`allocatePlanNumber`), `cleanup-exec` per-plan (`executeCleanup` — the load-bearing
   00185 recipe), `set-environment` and `env-keep-defaults` (`setSetting`) each got a real
   fixture + observable-change assertion. The remaining 5 state-changing recipes are
   `uncovered` with one-line reasons: `renumberImplementationPlans` (heavy multi-plan
   cross-reference fixture), the `cleanup-exec` category batch (git-initialised category
   fixture; the per-plan form is covered), `dismiss-stale` (needs seeded stale
   candidates), `set-compliance-regime` (the shipped program passes a bare `ARR` token
   substituted from the `{profile}` enum and needs a `.ctoc/settings.yaml` fixture — not
   executable as-extracted), and `ledger-backfill --vision` (needs a `plans/done/`
   decomposed-vision fixture + ledger seeding). Live scan = 9 unique in-scope recipe ids
   (rows 60 and 61 are the same `ledger-backfill --vision` invocation, one id).

10. **Scope predicate = the enumerated state-changing library functions + the
    `ledger-backfill` script.** The `start.js` dashboard launcher and its `menu task add`
    subcommand write task-scheduling state, but they are a different surface the plan's
    scope table does not enumerate, so they are OUT of the state-changing set (the launcher
    still gets Cases 1/2 — extracted, script path resolves). If the human wants `menu task
    add` fenced, add its script/subcommand to `STATE_CHANGING_SCRIPTS` in
    `src/lib/recipe-harness.js` and give it a fixture.

11. **Case 2 uses Node's `require.resolve`, not a naive `.js` suffix.** `src/lib/plan-index`
    resolves as a directory package (`plan-index/index.js`); asserting `<module>.js` exists
    was wrong and was tightened to the real resolvability contract.

12. **Reachability wiring — RESOLVED (human added `iron-loop-enforcer.js` to `files:`).**
    The reachability ratchet correctly flagged `src/lib/recipe-harness.js` as a NEW dead
    file (a test is never a caller; live unreachable rose 24 → 25). The executor first
    built and verified the harness WITHOUT wiring it (its own test 11/11 green, incl. the
    load-bearing Case 9) and surfaced the wiring as a fork, because
    `src/lib/iron-loop-enforcer.js` was not yet in this plan's `files:`. The human then
    added it. The prescribed wiring landed: `checkRecipeExecutionFence(root)` is a real
    entry in `iron-loop-enforcer.js`'s `CHECKS` list (`id: 'recipe-execution-fence'`,
    thorough), mirroring `checkFalseGreenFence` — it requires `./recipe-harness`, extracts
    the in-scope recipes from `start.md`, and BLOCKS when a state-changing recipe is in
    NEITHER `covered` nor `uncovered` (or the ledger is unreadable), otherwise SILENT
    (contributes no finding, so the enforcer summary counts are unmoved). This is the
    harness's live call site, so `recipe-harness.js` is reachable and live unreachable
    returned to **24** (baseline unchanged). NO `.ctoc/reachability-baseline.json` entry
    and NO `.ctoc/reachability-roots.json` entry were added — both are explicitly rejected
    by the plan. Full gate: `npm test` exit 0, coverage 99.08% (≥99%, scoped src/**),
    0 skipped, 0 failed.

## Steps 8-16 — completion

- **8 TEST** ✅ — `tests/shipped-recipes-execute.test.js` written first; RED captured
  (`MODULE_NOT_FOUND: recipe-harness.js`), then GREEN (11/11), incl. Case 9 (harness
  catches the historical no-op) and Case 10 (real `plans/` untouched).
- **9 PREPARE** ✅ — recipes re-enumerated live from `start.md`; every cited export
  verified to resolve as a function; `false-green-scan.js` / reachability ratchet read.
- **10 IMPLEMENT** ✅ — `recipe-harness.js` (`extractRecipes`, `runRecipe`, `isStateChanging`,
  `recipeId`; explicit `maxBuffer`, bounded timeout, no shell, no silent catch, LOUD
  throw on a missing target), the test, and `.ctoc/recipe-coverage.json` (4 covered, 5
  uncovered). WIRED into the enforcer in the same slice (this decision).
- **11 REVIEW** ✅ — no unrecognised-placeholder substitution; no catch swallows a failure;
  throws (not zero-returns) on a missing target; each covered case asserts a specific
  observable change, not merely exit 0.
- **12 OPTIMIZE** ✅ — one child process per covered recipe; suite wall-clock ~0.2 s, well
  under the 10 s grouping threshold; nothing memoized.
- **13 SECURE** ✅ — no shell, bounded timeout, temp-dir fixtures, fixed substitution set.
- **14 VERIFY** ✅ — `npm test` exit 0, coverage 99.08% (≥99%), 0 skipped, 0 failed; lint
  `--max-warnings 0` clean; typecheck 0 errors; reachability 24 (baseline unchanged).
- **15 DOCUMENT** ✅ — recipe-execution fence section added to `CLAUDE.md`; module/test
  counts updated (lib 122→123, tests 493→494).
- **16 FINAL-REVIEW** ✅ — decisions recorded here; plan left in `plans/in-progress/` for
  the human's review (no stage move, no gate crossing).


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
