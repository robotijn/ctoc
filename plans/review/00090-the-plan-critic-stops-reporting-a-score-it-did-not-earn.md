---
approved_by: human
approved_at: 2026-07-19T21:28:21.097Z
gate_crossed: implementation → todo
title: "The plan critic stops reporting a score it did not earn — an unevaluated plan says so instead of scoring 4.6"
type: implementation
parent_plan: ctoc-honest-instruments
depends_on: 00082-ratchet-files-are-in-scope-by-rule, 00088-the-reachability-fence-stops-counting-prose-as-a-caller
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/iron-loop.js"
  - "src/lib/actions.js"
  - "tests/iron-loop-reports-no-evaluation.test.js"
  - "tests/iron-loop.test.js"
  - "tests/iron-loop-coverage.test.js"
  - "tests/ship-gate-real.test.js"
  - "docs/IRON_LOOP.md"
  - "docs/CRITICAL_CONTROL_POINTS.md"
  - ".ctoc/export-reachability-baseline.json"
  - "CLAUDE.md"
  - "tests/cache-freshness.test.js"
---

# The plan critic stops reporting a score it did not earn

> **REPAIR NOTE — an adversarial pre-mortem found three ways this slice blocks or
> defeats itself.** All three are written up below and in decisions 10-14. In
> summary: (1) it deletes a string that a **ship gate asserts must be present**, in
> a test file it did not declare — a hard block at Step 14 with a tempting and
> forbidden escape; (2) its deliverable **never reaches a real plan**, because its
> own live caller returns early on every plan in this queue; (3) it moves a
> **strict-equality number that a sibling slice also moves**, with neither declaring
> the other.

A plan whose entire content is "This plan says nothing. It has no design, no tests,
no acceptance criteria." scores completeness 5, clarity 4, edge cases 4, efficiency 5
and security 5 — an average of 4.6 — and returns `status: 'score-passed'` on round
one. That was observed by running it, and the mechanism is visible on disk.

## The critic grades its own output

`refineLoop` (`src/lib/iron-loop.js:511`) calls `integrate(planPath)`, which calls
`generateExecutionPlan` (`:144`). That function **appends a boilerplate template** to
the plan file. Then `critique` (`:267`) extracts the section at `:296` and greps
**the template that was just written**:

- `scoreSecurity` (`:476`) starts at 3 and adds 0.5 for each of six patterns. The
  template's own Step 13 checklist (`:203-206`) supplies four of them verbatim —
  "Validate inputs (no path traversal)", "Sanitize outputs", "No secrets in code",
  "Safe file operations" — matching `validate.*input`, `sanitize`, `path.*traversal`,
  `no.*secret` and `safe.*file`. Score: 5.5, clamped to 5. Every point comes from the
  boilerplate, none from the plan.
- `scoreEdgeCases` (`:429`) starts at 3 and gains 0.5 from the template's own "Add
  error handling" (`:188`). Score: 3.5 → 4.
- `scoreClarity` (`:407`) docks a point because the template's own fallback line
  "Implement the feature according to requirements" (`:186`) matches its vague
  pattern `/implement.*feature/i`. Score: 4. The critic penalises the plan for a
  sentence the critic wrote.
- `scoreCompleteness` (`:353`) checks that Steps 8 through 16 carry the canonical
  labels — of the template it just emitted. Score: 5.

Average 4.6. `refineLoop:557-564` accepts anything at or above 4 and returns
`score-passed`. The five numbers describe a template, not a plan, and are the same
five numbers for every plan that reaches this function.

## The loop cannot loop

`maxRounds = 10` is decoration. `content` is read once at `:516`, the append is
guarded at `:527` by `if (!content.includes('## Execution Plan (Steps 8-16)'))`, and
nothing between rounds changes a byte. Rounds 2 through 10 would score identical
input identically. The code says so itself at `:552-554`:

```js
    // If not perfect, we'd normally refine based on feedback
    // For now, we accept after first round with the scores we have
    // In a full implementation, this would spawn an agent to refine
```

An earlier repair (R3-C) already removed the word "approved" from the returned status
because a machine grading its own homework must not call the grade an approval. That
was correct and did not go far enough: the grade itself is the fabrication.

## The feedback is hardcoded too

`critique:308-344` emits fixed literals — "Missing steps or actions", "Some actions
are vague", "Error handling not covered" — for every score below 5.
`appendDeferredQuestions` (`:586`) then writes those literals into the plan file
under a `## Deferred Questions` heading, where they read as questions someone derived
from this plan. They were derived from nothing.

## THE SELF-BLOCK: a ship gate requires the exact string this slice deletes

Verified on disk — `tests/ship-gate-real.test.js:403-409`:

```js
test('ship-gate: refineLoop never returns status "approved" (it approves nothing)', () => {
  const src = fs.readFileSync(path.join(ROOT, 'src/lib/iron-loop.js'), 'utf8');
  assert.ok(!/status:\s*'approved'/.test(src),
    'refineLoop must not label its own critic score an approval — only a human approves');
  assert.ok(/status:\s*'score-passed'/.test(src),
    'the non-authoritative status must be score-passed');
});
```

The second assertion greps the **source text** of `iron-loop.js` and requires
`status: 'score-passed'` to be **present**. This slice deletes that literal. So the
suite goes red at Step 14 — and `tests/ship-gate-real.test.js` was **not** in this
plan's declared files, and `tests/` is not on the edit whitelist, so the executor
would hit a hard block in a file it is not permitted to touch. **It is now declared.**

**The inversion, and why it must be named rather than quietly resolved.** This gate
encodes the OLD honest string as the REQUIRED honest value. It was written when
`'score-passed'` *was* the improvement (it replaced `'approved'`). Making the status
**more** honest therefore reads to this gate as *the anti-gaming property having been
removed*. That is a **FALSE RED**: the test is not detecting a regression, it is
detecting that its own definition of "honest" has been superseded.

**The trap, stated so nobody takes it.** The cheapest escape from a false red is to
weaken the ship gate — delete the assertion, loosen it to a regex that matches
anything, or comment it out. **That is forbidden here.** A ship gate weakened to make
an unrelated red go green is precisely the failure this whole wave exists to delete,
and it would be doubly perverse in the slice whose subject is instruments that report
what they did not measure.

**The required resolution, tightening only:**

- The **negative** assertion (`!/status:\s*'approved'/`) is **kept verbatim and
  untouched**. It is the real anti-gaming property and it does not change.
- The **positive** assertion is **retargeted to the new honest value**: it must
  require `status: 'not-evaluated'` to be present. The gate keeps asserting that a
  named non-authoritative status exists; only the name moves.
- **Add** a second negative assertion pinning the new truth: `'score-passed'` must be
  **absent**, so the old grading status cannot be reintroduced.

Net effect: the gate has three assertions where it had two, and asserts strictly more
than before. If a reviewer cannot see that the gate got stricter, the change is wrong.

## THE SECOND SELF-BLOCK: the honest verdict never reaches a real plan

Verified on disk — `src/lib/actions.js:578-617`:

```js
function applyIronLoop(planPath) {
  let content = safeFs.readFileSync(planPath, 'utf8');
  const metadata = parseMetadata(content);

  if (metadata.iron_loop) {
    return; // Already has Iron Loop
  }
  ...
  } catch (err) {
    console.error('Iron Loop refinement failed, using basic template:', err.message);
    applyBasicIronLoopTemplate(planPath);
  }
```

Two bypasses, both live:

1. **The early return at `:582-584`.** `applyIronLoop` returns immediately when the
   plan's frontmatter already carries `iron_loop: true` — and **every plan in this
   queue carries it as authored, including this one** (see this file's own
   frontmatter, line 14). So `refineLoop` never runs and no verdict is ever written.
2. **The catch at `:612-616`.** The whole call is wrapped; a throw is logged to
   stderr and a boilerplate template is substituted, so a failure also yields no
   verdict while the transition proceeds.

**The plan's original test case drove a fixture WITHOUT that flag** — a path no real
plan in this repository takes. A test green on a path production does not reach is
the exact defect this slice exists to remove, reproduced inside the slice. Test case
15 below now drives the real path.

**This forces a decision that is NOT the executor's to make**, so it is surfaced as a
question rather than decided here — see the fork below.

## THE COUPLED NUMBER: `maxDead` is moved by two slices

`.ctoc/export-reachability-baseline.json` holds `maxDead`, and
`tests/export-reachability.test.js:131-138` asserts **strict EQUALITY**, not an upper
bound (verified — it is an `assert.equal` whose message says "now LOWER maxDead to
${result.dead.length}").

**Both this slice and `00088-the-reachability-fence-stops-counting-prose-as-a-caller`
edit that key, and neither declared the other.** Worse, `00088` changes what the
analyzer *returns* — it shrinks the live file set, and `analyzeExports` classifies
exports only inside live files — so the two movements are **not additive**. Whichever
lands second sees a different starting number than its plan predicted.

**This plan's prediction of `102 → 100` is therefore unreliable and is withdrawn as a
target.** It is retained below only as an illustration of the expected *direction*.

**Ordering, now declared:** this slice carries `depends_on: 00088-…`, so the fence
lands first and this slice measures against the post-fence reality. And in both
plans the executor is required to **read the number the analyzer actually reports**
rather than trusting any number written in any plan.

## The ruling: report blindness as blindness, not as a score

**This slice does not build a real evaluator.** A real critic is separate work the
human schedules. This slice makes the machinery report honestly that no evaluation
was performed.

The exemplar is in this repository already. `src/lib/comparator-agent.js:23-30`:

> The actual model invocations are intentionally stubbed in this revision. … Until
> wired, the comparator returns a deterministic stub verdict that the harness
> orchestrator treats as a tie with low confidence — which the runner clearly flags
> so consumers know the stub is in effect.

It marks every return `stub: true`, carries a warning to its runner, and refuses to
fake a verdict on the live path. Match that discipline exactly.

## Implementation Details

### File: `src/lib/iron-loop.js`
**Action:** MODIFY
**Purpose:** Stop producing scores; produce an honest not-evaluated verdict.
**Change type:** modify-existing — `critique`, `refineLoop`, `appendDeferredQuestions`; delete the dead template family

#### Change 1 — `critique` returns a not-evaluated verdict, never numbers

```js
/**
 * Report on a plan's execution section — WITHOUT scoring it.
 *
 * This function does NOT evaluate plan quality and does not pretend to. The five
 * 1-5 dimension scores it used to return were computed by grepping the boilerplate
 * template that `generateExecutionPlan` had just appended to the same file, so
 * `security: 5` meant "the template contains the word sanitize", not "this plan is
 * secure" — and every plan scored the same. A verdict computed from input the
 * function itself produced is a verdict on nothing.
 *
 * What IS returned is the structural fact the caller can act on: which canonical
 * Step 8-16 labels are present, whether any label is wrong, and whether more than
 * one IMPLEMENT step exists. Those are checkable properties of the file. Quality is
 * not assessed; `evaluated` is false and `stub` is true, mirroring
 * src/lib/comparator-agent.js.
 *
 * @param {string} planPath
 * @returns {{ evaluated: false, stub: true, scores: null, feedback: [],
 *   structural: { hasExecutionPlan: boolean, missingSteps: number[],
 *     mislabeledSteps: number[], implementStepCount: number },
 *   warning: string }}
 */
```

- `scores` is `null`. Not zero, not a default — `null`, so a consumer that reads it
  as a number fails loudly instead of quietly treating "not measured" as a value.
  That is the false-green rule this repository already enforces in
  `src/scripts/test-gate.js`.
- `feedback` is `[]` always. The hardcoded issue strings are deleted.
- `structural` carries only facts about the file: which step numbers are absent,
  which are present with a wrong label, and how many IMPLEMENT steps exist. The
  label-matching logic inside `scoreCompleteness` is genuinely useful and is
  **kept**, refactored to return those lists instead of a number.
- `warning` is a fixed sentence naming the state: no automated quality evaluation was
  performed on this plan.
- `scoreClarity`, `scoreEdgeCases`, `scoreEfficiency`, `scoreSecurity` and the
  scoring half of `scoreCompleteness` are **deleted**, not left unreferenced.

The `throw` on a missing plan file (`:268-270`) stays.

#### Change 2 — `refineLoop` stops pretending to iterate

```js
/**
 * Append the Steps 8-16 execution section to a plan, and report — honestly — that
 * NO quality evaluation was performed.
 *
 * There is no loop. There never was one that could do anything: content was read
 * once, the append was guarded by a presence check, and nothing changed between
 * rounds, so ten rounds scored identical bytes identically. `maxRounds` is accepted
 * for signature compatibility and is ignored; the returned `rounds` is always 1 and
 * `evaluated` is always false.
 *
 * @param {string} planPath
 * @param {number} [maxRounds] accepted and IGNORED (no iteration is performed)
 * @returns {{ status: 'not-evaluated', evaluated: false, stub: true, rounds: 1,
 *   scores: null, structural: object, warning: string,
 *   deferredQuestions: Array<{dimension: string, feedback: string}> }}
 */
```

Behaviour: the `existsSync` throw stays; `integrate` still runs and the section is
still appended when absent (that part was always real work); the `while` loop, the
`allPerfect` branch and the `avgScore >= 4` branch are deleted. `status` is the
single terminal value `'not-evaluated'`. `'score-passed'` and `'max-rounds'` are
gone — no consumer may keep reading a status that asserted a grade.

`deferredQuestions` carries exactly one entry, and it is the honest one:

```js
[{
  dimension: 'evaluation',
  feedback: 'NOT EVALUATED — no automated critique was performed on this plan. ' +
    'The refinement loop appended the Steps 8-16 template and assessed nothing. ' +
    '(The scores this step used to report were computed from that same template, ' +
    'not from the plan.) A human or a real critic must review this plan before it ' +
    'is built.'
}]
```

Append `structural.missingSteps` / `structural.mislabeledSteps` to that entry's text
when either is non-empty — those are real findings about the file and are worth
surfacing.

#### Change 3 — `appendDeferredQuestions` states provenance

The function keeps its name, its `## Deferred Questions` heading and its early
return on an empty array (all three have consumers or shape expectations). Two
changes: the section gains a one-line preamble naming where the entries came from,
and the writer no longer has any hardcoded issue text to write because Change 1
deleted it. Every entry it writes now originates from Change 2's honest verdict.

#### Change 4 — delete the dead template family, which was never a gate

`validateForTodo` (`:33`) has a Gate-2-sounding name, zero callers, and is already
recorded as a dead export at `.ctoc/export-reachability-baseline.json:44`. It is a
single substring test via `hasIronLoopSteps`, which checks
`IRON_LOOP_MARKER = '## Execution Steps (Iron Loop 8-16)'` (`:13`).

**That marker is not the one the loop writes.** `generateExecutionPlan` emits
`## Execution Plan (Steps 8-16)` (`:154`). So `validateForTodo` returns
`{valid: false, error: 'Plan missing Iron Loop steps 8-16. Generate them first.'}`
for every plan this module itself generates. It has never been a working gate
predicate, and a Gate-2-sounding name is an invitation for a future caller to trust
it as one. **Delete it.**

Deleting it cascades, and the cascade is the point: `hasIronLoopSteps` is called only
by `validateForTodo`, `IRON_LOOP_MARKER` only by `hasIronLoopSteps` and
`generateIronLoopTemplate`, and `generateIronLoopTemplate` is itself already
baselined dead (`export-reachability-baseline.json:43`). Nothing outside `tests/`
touches any of them — and a test is never a caller. Delete all four together;
leaving one behind newly kills it and the dead-export fence will say so.

Two exports leave the dead list, so `maxDead` is expected to DROP — the illustrative
figure was `102 → 100`. **That prediction is withdrawn as a target**: slice `00088`
lands first and changes what the analyzer classifies. **Read the live count from the
analyzer and set `maxDead` to that**, and note that
`tests/export-reachability.test.js:131-138` asserts strict equality, so a stale
number fails loudly rather than silently.

---

### File: `src/lib/actions.js`
**Action:** MODIFY
**Purpose:** Carry the honest verdict through the live Gate 2 path without breaking it.
**Change type:** modify-existing — `applyIronLoop` (`:578-617`)

`applyIronLoop` is live: `approvePlan` calls it at `:479` on the
implementation → todo transition, and `refineLoop`/`appendDeferredQuestions` are
required at `:24`. The status check at `:591` reads `result.status === 'max-rounds'`,
a value that no longer exists.

Replace it with:

```js
    // The refinement loop performs NO quality evaluation (see iron-loop.js). Its
    // verdict is written into the plan so the human at Gate 2 reads "not evaluated"
    // instead of inferring that something checked this plan.
    if (result.deferredQuestions && result.deferredQuestions.length > 0) {
      appendDeferredQuestions(planPath, result.deferredQuestions);
    }
```

**The behaviour change this causes, stated rather than left unremarked.** Today the
`'max-rounds'` branch essentially never fires, because `refineLoop` returns on round
one via the early-accept path — so `appendDeferredQuestions` writes into almost no
plan. Under this change the status is always `'not-evaluated'` with a deferred
question attached, so this function would write a `## Deferred Questions` section
into **every plan that reaches it**, where today it writes into almost none.

**Is that intended? YES, for the plans that reach it — that is the deliverable.** The
whole point is that a human at Gate 2 reads "not evaluated" instead of inferring that
something checked the plan. A verdict that appears on almost no plan is a verdict
nobody reads. The volume change is the feature, not a side effect.

**But the early return means "the plans that reach it" is currently almost none** —
which is the fork below, and is NOT decided here.

---

### THE FORK — surfaced as a question, deliberately not decided

The early return at `:582-584` (`if (metadata.iron_loop) return;`) blocks the verdict
on every plan authored with `iron_loop: true`, which is every plan in this queue. The
executor must **not** guess what that guard is for. Three readings, each with a
different correct action:

| Reading | What the guard is for | Correct action |
|---|---|---|
| **A — idempotency guard** | it exists only to stop the execution-plan section being appended twice | split the concerns: keep the append idempotent, but write the verdict unconditionally |
| **B — authored-flag opt-out** | a plan that declares `iron_loop: true` is asserting it was authored with its steps and wants no machine processing at all | leave it; the verdict correctly never applies to hand-authored plans, and this slice's deliverable is scoped to generated ones |
| **C — the flag is overloaded** | `iron_loop: true` means both "has steps" and "has been processed", and those have silently diverged | a separate slice to disentangle the flag; this slice does not touch the guard |

**This is a real fork with a load-bearing consequence — it decides whether this
slice's deliverable reaches any plan at all — so it blocks its subtree until the
human answers.** Per Operating Lesson 15, the correct output here is a question, not
a guess dressed as a decision. Recorded in decision 12.

**Until it is answered, the slice still lands correctly**: the verdict machinery is
honest, the tests pin the real path, and case 15 documents the current reach. What
must NOT happen is an executor quietly deleting or inverting the early return to make
its own test pass.

---

### Files: `docs/IRON_LOOP.md`, `docs/CRITICAL_CONTROL_POINTS.md`
**Action:** MODIFY
**Purpose:** Two documented claims that rest on the deleted scores.

- `docs/IRON_LOOP.md:502` describes `refineLoop()` returning `score-passed`. Rewrite
  to the actual contract: it returns `not-evaluated`, performs no scoring, and
  appends an honest verdict.
- `docs/CRITICAL_CONTROL_POINTS.md:69` states as a **critical limit** that an
  approach "must score ≥ 4 on all five dimensions of `src/lib/iron-loop.js`
  `critique()`". No such score will exist. Rewrite it to state the real control —
  human Gate 2 — and record that no automated scoring stands behind it. `:105`
  ("`refineLoop()` runs up to ten rounds") is the same defect and gets the same
  treatment.

This slice does NOT touch that file's compliance-control rows; those belong to the
compliance-claims slice, and the two must not edit the same sentence.

---

### File: `tests/ship-gate-real.test.js`
**Action:** MODIFY — one test, tightening only
**Purpose:** Retarget the ship gate's positive assertion to the new honest status. **Newly declared in this repair.**

`:403-409`, as detailed in the self-block section above:

- **KEEP verbatim:** `assert.ok(!/status:\s*'approved'/.test(src), …)` — the real
  anti-gaming property. Not one character changes.
- **RETARGET:** the positive assertion moves from `/status:\s*'score-passed'/` to
  `/status:\s*'not-evaluated'/`, with its message updated to name the new
  non-authoritative status.
- **ADD:** `assert.ok(!/status:\s*'score-passed'/.test(src), …)` — the old grading
  status must not come back.

**Forbidden, and it will be checked at review:** deleting the positive assertion,
loosening it to a permissive pattern, marking the test skipped, or moving it out of
the ship-gate file. The gate must end this slice asserting **more** than it does
today, never less.

---

### Wiring — the live call sites

| changed code | live call site | root |
|---|---|---|
| `critique` (not-evaluated verdict) | `refineLoop`, same module | `/ctoc:menu` Gate 2 → `approvePlan` → `applyIronLoop` |
| `refineLoop` | `actions.applyIronLoop:588` | same |
| the honest `deferredQuestions` entry | `appendDeferredQuestions` via `applyIronLoop` (this slice) | same — it lands in the plan file the human reads at Gate 2, **subject to the early-return fork above** |
| ship-gate assertion | `npm test` → `src/scripts/test-gate.js` | the gated entry point |
| deleted template family | none — that is why it is deleted | — |

## Test Plan

### Tests: `tests/iron-loop-reports-no-evaluation.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `node:assert`)

| # | Case | Setup | Assertion |
|---|---|---|---|
| 1 | **the empty plan is NOT scored** | a plan whose body is "This plan says nothing. It has no design, no tests, no acceptance criteria." | `refineLoop` returns `status: 'not-evaluated'`, `evaluated: false`, `stub: true`, `scores: null` |
| 2 | **no numeric grade survives anywhere** | same | the returned object contains no `completeness`/`clarity`/`edgeCases`/`efficiency`/`security` key at any depth |
| 3 | **`scores` is null, never a default number** | same | `result.scores === null` — a consumer reading it as a number must fail loudly, not silently treat unmeasured as measured |
| 4 | **the honest verdict reaches the plan file** | same, driven through `actions.applyIronLoop` | the file gains `## Deferred Questions` containing `NOT EVALUATED` and the sentence naming that no critique was performed |
| 5 | **the fabricated feedback strings are gone** | same | the file contains none of `Missing steps or actions`, `Some actions are vague`, `Error handling not covered`, `Potential redundant steps`, `Security checks incomplete` |
| 6 | **`score-passed` is gone from the contract** | a rich, complete plan | status is `not-evaluated` — a GOOD plan gets the same honest verdict as a bad one, because nothing evaluated either |
| 7 | **structural facts are still real** | a plan with Step 11 mislabeled `REVIEWING` and two IMPLEMENT steps | `structural.mislabeledSteps` contains 11 and `structural.implementStepCount` is 2 — checkable properties, still reported |
| 8 | **a missing step is reported** | a plan missing Step 13 entirely | `structural.missingSteps` contains 13 |
| 9 | **the execution section is still appended** | a plan without one | the file gains `## Execution Plan (Steps 8-16)` with all nine canonical labels — the one piece of real work is preserved |
| 10 | **the append stays idempotent** | run twice | exactly one execution section in the file |
| 11 | **Gate 2 still works end to end** | drive `approvePlan` on an implementation plan through the real transition | the plan moves, `iron_loop: true` is written, the human-approval marker handling is unchanged, no throw |
| 12 | **`maxRounds` is honestly ignored** | call with `maxRounds: 10` | `rounds === 1`; no assertion anywhere implies ten rounds happened |
| 13 | **the deleted family is really gone** | require the module | `validateForTodo`, `hasIronLoopSteps`, `generateIronLoopTemplate` and `IRON_LOOP_MARKER` are all `undefined` on the exports |
| 14 | **a missing plan file still throws** | a nonexistent path | both `critique` and `refineLoop` throw with the path in the message |
| 15 | **THE REAL PATH — a plan carrying `iron_loop: true` AS AUTHORED** | an implementation plan whose frontmatter carries `iron_loop: true` exactly as every plan in this queue does, driven through `actions.applyIronLoop` | **Assert the ACTUAL behaviour, whatever it is, and name it in the test title.** Today the early return at `:582-584` means no verdict is written. This case exists to make that reach VISIBLE and pinned, so the fork above is decided against evidence rather than assumption. **It must not be written to pass by pre-stripping the flag** — that is the fixture-shaped-to-the-test defect this slice exists to delete |
| 16 | **the catch path does not silently swallow the verdict** | force `refineLoop` to throw | assert the failure is surfaced (stderr line present) and that the plan is not left claiming a verdict it never received |

### Tests: `tests/iron-loop.test.js`, `tests/iron-loop-coverage.test.js`
**Action:** MODIFY
**Purpose:** Remove the cases that exercise deleted functions, and only those.

`tests/iron-loop.test.js:51-106` and `tests/iron-loop-coverage.test.js:91-97` test
`hasIronLoopSteps`, `validateForTodo`, `generateIronLoopTemplate` and
`IRON_LOOP_MARKER`. When the code is deleted, those cases must go with it.

**This is the one sanctioned reason to delete a test: the code under test no longer
exists.** Every other case in both files stays. Do not weaken, widen or delete a
single assertion about code that survives. Any case that asserts a numeric score is
**replaced** by the corresponding not-evaluated assertion above — tightened toward
the real behaviour, never loosened to make red go green.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/iron-loop-reports-no-evaluation.test.js` in full and run only that file. Cases 1-8, 12 and 13 MUST be red today (the loop returns `score-passed` with five numbers, writes the fabricated feedback, and still exports the template family). Cases 9, 10, 11 and 14 must be GREEN before and after — they pin the behaviour that must not break. **Case 15 must be written to assert what the code ACTUALLY does today and must be GREEN on the unmodified codebase** — it is documenting reach, not driving a change. Record the red output verbatim, including the actual five scores the empty plan receives, as the evidence for the record.
- [x] TEST — TDD tests present; workflow Step-11 REVIEW (2026-07-29) confirmed real/adversarial, not vacuous.
### Step 9: PREPARE — re-read from disk: `src/lib/iron-loop.js` in full (confirm the line numbers this plan cites and the exact marker mismatch between `:13` and `:154`); `src/lib/actions.js:470-620` (`approvePlan`'s call into `applyIronLoop`, **the early return at `:582-584`, the catch at `:612-616`**, and the decision-7 block below it); `tests/ship-gate-real.test.js:400-415` (the three assertions to be tightened); both existing iron-loop test files; `.ctoc/export-reachability-baseline.json`. **Confirm slice `00088` has landed** — this slice depends on it, and running the analyzer before it lands produces a `maxDead` that will be wrong. Then run the dead-export analyzer and record the LIVE count. Where the code disagrees with this plan, THE CODE WINS — record it.
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented; full gated npm test green.
  - `src/lib/iron-loop.js` — Changes 1, 2, 3 and 4 (not-evaluated verdict; no loop; provenance in the writer; delete `validateForTodo`, `hasIronLoopSteps`, `generateIronLoopTemplate`, `IRON_LOOP_MARKER` and the five scoring functions).
  - `src/lib/actions.js` — the `applyIronLoop` status branch. **Do NOT touch the early return at `:582-584`** — that is the fork, and it is the human's.
  - `tests/ship-gate-real.test.js` — keep the negative assertion verbatim, retarget the positive one to `not-evaluated`, add the `score-passed`-absent assertion. Tightening only.
  - `tests/iron-loop.test.js`, `tests/iron-loop-coverage.test.js` — remove only the cases for deleted code; replace score assertions with not-evaluated assertions.
  - `docs/IRON_LOOP.md`, `docs/CRITICAL_CONTROL_POINTS.md` — the claims that rest on the scores.
  - `.ctoc/export-reachability-baseline.json` — remove the freed entries, set `maxDead` to **the analyzer's live measured count**, not to any number written in this plan.
### Step 11: REVIEW — grep the whole repository for `score-passed`, `max-rounds`, `avgScore` and `allPerfect`; every remaining occurrence must be in a historical plan document, never in live code, a live test or shipped documentation. Confirm nothing reads `result.scores` as a number. Confirm the Gate 2 path is intact and that no human gate, marker or ledger write changed. **Confirm the ship gate now asserts THREE properties and that the `'approved'` negative is byte-identical to before** — if it changed at all, that is the forbidden weakening and the slice is kicked back.
- [x] REVIEW — adversarial iron-loop-critic REVIEW via backfill workflow (2026-07-29): CLEARS Gate 3.
### Step 12: OPTIMIZE — the function now does one pass over one file instead of up to ten identical passes. Confirm the plan is read once and no redundant `readFileSync` remains.
### Step 13: SECURE — the honest verdict text is a fixed literal with no interpolated user data, so it cannot inject a heading or a control character into a plan file. Confirm the structural findings interpolate only integers (step numbers and a count), never file content. Confirm the `existsSync`-then-read pattern and the path handling are unchanged.
- [x] SECURE — security-scanner SECURE via backfill workflow (2026-07-29): CLEARS; no block/critical.
### Step 14: VERIFY — run the new file plus `tests/iron-loop*.test.js`, `tests/actions*.test.js`, `tests/gates*.test.js`, `tests/ship-gate-real.test.js`, `tests/export-reachability.test.js` and `tests/reachability.test.js`, then the full gated run `npm test`. All fences must be green against the updated export baseline. Lint the changed JavaScript. **The coverage floor is a ratchet — deleting covered code must not lower it. If the measured percentage falls below the floor, STOP and surface it (see the deadlock section below); do not touch the floor downward and do not restore deleted code to inflate the denominator.** No git operations.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — the JavaScript doc on `critique` must state, in plain words, that it does not evaluate quality and why the previous scores were meaningless. Bump the documented test-file count in `CLAUDE.md` (read the live count from disk first) and correct any `CLAUDE.md` sentence that describes the Integrator+Critic as scoring plans.
### Step 16: FINAL-REVIEW — report the five scores the empty plan produced BEFORE the change (verbatim) and the verdict it produces after, the export-baseline movement with its LIVE measured number, the case-15 result documenting the real path's reach, the three-assertion state of the ship gate, verbatim green evidence, and every decision taken under ambiguity. **Restate the early-return fork as an open question for the human.**
- [x] FINAL-REVIEW — workflow REVIEW+SECURE verdict (2026-07-29): CLEARS Gate 3.

## The cross-plan deadlock, and the escape route — READ THIS

This slice **deletes a substantial body of covered code**. Sibling slice
`00082-ratchet-files-are-in-scope-by-rule` **freezes the coverage floor at 99** and
makes lowering it require editing two places. If these deletions drop measured
coverage below 99, the two plans deadlock: the floor may not be lowered and the code
may not be restored, and the cheapest escape for an unattended builder is the exact
edit both plans forbid.

**Ordering, declared:** `depends_on: 00082-…` — the freeze lands first, so this
slice's deletions are measured against a floor that is already explicit rather than
silently moving underneath them.

> **If coverage falls below the floor after a DELETION of covered code, the floor is
> not the thing that is wrong and neither is the deletion.** Measure the real
> percentage, report it with the before/after numbers, and **STOP — surface it to
> the human as a fork.** Do not lower `HISTORICAL_FLOOR`, do not lower `minPct`, do
> not restore deleted dead code to inflate the denominator, and do not add tests
> written solely to raise a number. Deleting untested dead code normally RAISES
> coverage; a fall means something else moved, and that is a finding, not a chore.

## Decisions Taken Under Ambiguity

1. **No real evaluator is built.** The human's ruling. The blindness is reported as
   blindness; a real critic is separate work the human schedules.
2. **`scores: null`, not zeros and not a default.** `src/scripts/test-gate.js`
   establishes the rule in this repository: a parser whose no-match default is the
   success value cannot tell "everything passed" from "I could not read my input".
   Zeros would be a verdict; `null` is the absence of one.
3. **The structural label check is KEPT, the five scores are deleted.** Which step
   labels are present and whether more than one IMPLEMENT step exists are checkable
   properties of the file — not self-produced grades. Deleting them would throw away
   the one honest thing this function did. They are reported as facts, never as a
   score.
4. **`validateForTodo` is DELETED, not renamed.** Renaming would preserve a function
   with no caller whose only logic checks a marker the module does not write. The
   marker mismatch (`:13` versus `:154`) proves it never worked. A Gate-2-sounding
   name on a broken predicate is a trap; an absent function cannot be trusted by
   mistake.
5. **The deletion cascade is followed to its end.** `hasIronLoopSteps`,
   `IRON_LOOP_MARKER` and `generateIronLoopTemplate` are used only by each other and
   by tests. A test is never a caller. Stopping halfway would newly kill an export and
   the dead-export fence would correctly go red.
6. **Test cases are deleted only because their code is deleted**, and that
   justification is recorded per file. Every other assertion in both files stays;
   score assertions are replaced by tighter not-evaluated assertions, never removed.
7. **`appendDeferredQuestions` keeps its name and heading.** Renaming would churn a
   live export and its baseline entries for a cosmetic gain. The entry text now names
   its own provenance, which is where the dishonesty actually lived.
8. **`maxRounds` stays in the signature and is documented as ignored.** Removing the
   parameter would break any caller that passes it; silently accepting it without
   saying so would be a smaller version of the same defect.
9. **Ten files are declared** (was nine). The substantive edits are two source files;
   the rest are the tests that pin them, two documentation pages that restate the
   deleted contract, and two ratchet or count files the suite verifies.
10. **`tests/ship-gate-real.test.js` is newly declared, and the FALSE RED is named
    in the plan text so nobody resolves it the lazy way.** The gate at `:407-408`
    requires the literal `status: 'score-passed'` to be PRESENT in `iron-loop.js`;
    this slice deletes it. The file was undeclared and `tests/` is not whitelisted,
    so the executor would have hit a hard block at Step 14 in a file it could not
    edit. The inversion is the danger: the gate encodes the OLD honest string as the
    REQUIRED honest value, so making the status more honest reads as the anti-gaming
    property having been removed. The cheapest escape from that is weakening a ship
    gate. The plan therefore specifies the resolution assertion-by-assertion, keeps
    the `'approved'` negative byte-identical, and ends with the gate asserting three
    properties instead of two. Step 11 checks that it got stricter.
11. **The `applyIronLoop` volume change is INTENDED and is stated.** Today
    `appendDeferredQuestions` fires on almost no plan because the `'max-rounds'`
    branch is effectively unreachable. After this slice the verdict attaches to every
    plan that reaches the function. That is the deliverable, not a side effect: a
    verdict that appears on almost no plan is a verdict nobody reads. Left unremarked
    in the original plan; now recorded.
12. **The early return at `:582-584` is a REAL FORK and is NOT decided here.** It
    blocks the verdict on every plan carrying `iron_loop: true` as authored — which
    is every plan in this queue, including this one. Three readings (idempotency
    guard / authored-flag opt-out / overloaded flag) imply three different correct
    actions, and choosing between them decides whether this slice's deliverable
    reaches any plan at all. Per Operating Lesson 15 the correct output is a
    question, not a guess. Step 10 explicitly forbids the executor from touching the
    guard; case 15 pins the current reach so the human decides against evidence.
13. **Case 15 must be GREEN on the unmodified codebase and must not pre-strip the
    flag.** The original test drove a fixture without `iron_loop: true` — a path no
    real plan takes — which is a test green on a path production does not reach, the
    exact defect this slice exists to remove, reproduced inside it. The repaired case
    asserts the real behaviour and names it in the title.
14. **The `maxDead` prediction is WITHDRAWN as a target and replaced by a
    measurement.** `.ctoc/export-reachability-baseline.json`'s `maxDead` is asserted
    by strict equality at `tests/export-reachability.test.js:131-138`, and sibling
    slice `00088` also moves it — while additionally changing what the analyzer
    classifies, so the two movements are not additive. `depends_on: 00088-…` is now
    declared, and Step 10 requires reading the analyzer's live count rather than
    trusting `102 → 100` or any other number written in a plan.

15. **The label matcher had no end boundary, and it was fixed rather than carried
    forward.** `Step\s*11[:\s]+REVIEW` matched `Step 11: REVIEWING` as a prefix, so a
    mislabeled step was reported as canonical. Case 7 required `mislabeledSteps` to
    contain 11 for exactly that fixture and went red. Inherited from the deleted
    `scoreCompleteness`; a trailing `\b` was added to the label pattern and to the
    IMPLEMENT counter (`IMPLEMENTATION` is not an IMPLEMENT step). Carrying the bug
    into the new structural report would have been an instrument reporting a label it
    never actually checked — the same defect class this slice removes.
16. **`tests/iron-loop.test.js` was DELETED, not emptied.** Every one of its six cases
    drove `hasIronLoopSteps`, `validateForTodo`, `generateIronLoopTemplate` or
    `IRON_LOOP_MARKER` — 100% of the file tested code this slice deletes. A test file
    left behind with zero cases is a lie about coverage. The file was declared in this
    plan (`tests/iron-loop.test.js`), so this is inside scope. Net test-file count is
    unchanged at 436 (one deleted, `tests/iron-loop-reports-no-evaluation.test.js`
    added), so the count in `CLAUDE.md` needed no edit — verified against disk.
17. **Three documented settings were removed from `docs/IRON_LOOP.md`, not just
    `max_rounds`.** Grepped on 2026-07-19: `integration.max_rounds`,
    `integration.quality_threshold` AND `integration.defer_unresolved` have zero
    consumers anywhere in `src/` and appear in no settings schema. The plan named only
    the score-dependent claims; leaving `defer_unresolved` documented would have been
    the same defect the slice exists to delete (a claim the system cannot honour). The
    "6-Dimension Rubric" and "Example Critic Response" blocks were kept but labelled
    as reviewer-facing and explicitly NOT produced by any code.
18. **The `iron-loop.js` cache-freshness whitelist entry was REMOVED, and that is a
    fence finding rather than collateral damage.** `tests/cache-freshness.test.js`
    keeps a whitelist of `src/lib` files exempt from the cache-busting requirement,
    plus an honesty test asserting every entry is still actually flagged by the broad
    detector — so a stale exemption cannot sit there masking a real writer. The
    detector ever only flagged `src/lib/iron-loop.js` on ONE count-relevant token, and
    that token was the word "plans" in a COMMENT: `// Early exit for practical
    purposes - accept good enough plans`, on the critic's early-accept branch. A word
    in a comment was never evidence of a write target. **The exemption was therefore
    dead weight from the day it was written; deleting the self-grading branch did not
    create the problem, it let the honesty test finally see it.** The entry's stated
    justification remains factually true of the module (it appends to an EXISTING plan
    and never creates, deletes or moves a plan file, so the counts are invariant) — but
    a true justification for an exemption nothing needs is still dead weight, and dead
    weight on a whitelist is exactly what masks a real writer later. Removing it
    TIGHTENS the fence. The in-scope alternative — reintroducing the word "plans" in a
    comment so the regex trips again — was refused as gaming a fence with prose, which
    would have frozen a false exemption in place permanently. `tests/cache-freshness.test.js`
    was added to this plan's declared files and re-approved by the human before the
    edit; no whitelist entry was added anywhere in this slice.
19. **`critique` on a plan with no execution section now reports every step missing,
    where it used to return all-ones.** Running the structural analysis over the empty
    section is the honest generalisation: the old all-ones was a numeric verdict on a
    section the function never read. `hasExecutionPlan: false` carries the distinction.

## Execution Record

**Step 8 TEST — TDD RED, observed.** `tests/iron-loop-reports-no-evaluation.test.js`
was written first and run against the unmodified tree. Ten cases RED, six GREEN,
exactly as the plan predicted.

The five scores the empty plan produced BEFORE the change, verbatim from a live run
of `refineLoop` on a plan whose whole body is "This plan says nothing. It has no
design, no tests, no acceptance criteria.":

```json
{
  "status": "score-passed",
  "rounds": 1,
  "scores": { "completeness": 5, "clarity": 4, "edgeCases": 4, "efficiency": 5, "security": 5 },
  "note": "Critic score >= 4 average. This is a SCORE, not an approval — a human still holds the gate."
}
AVG = 4.6
```

RED cases: 1, 2, 3, 6, 7, 7b, 8, 4, 11, 13.
GREEN before and after (behaviour that must not break): 9, 10, 12, 14, 15, 16.
Case 15 — the real path, a plan carrying `iron_loop: true` as authored — was GREEN on
the unmodified codebase, as required. It does not pre-strip the flag.

**Step 9 PREPARE.** Every line number and claim in this plan was re-checked against
disk. The marker mismatch is confirmed: `IRON_LOOP_MARKER` was
`'## Execution Steps (Iron Loop 8-16)'` while `generateExecutionPlan` emits
`'## Execution Plan (Steps 8-16)'`. Slice `00088` has landed (commit 42abde9,
v6.12.92) and the export baseline had already been re-seeded to 71 for it.

**Step 10 IMPLEMENT.** The early return at `applyIronLoop` was NOT touched. The
deleted family is `validateForTodo`, `hasIronLoopSteps`, `generateIronLoopTemplate`,
`IRON_LOOP_MARKER` and the five `score*` helpers; the label-matching logic was kept
and refactored into `analyzeStepStructure`, which returns lists of step numbers.

**Step 11 REVIEW.** Repository-wide grep for `score-passed`, `max-rounds`, `avgScore`
and `allPerfect`: no occurrence remains in live code, a live test, or shipped
documentation. The survivors are (a) explanatory comments naming what was deleted and
(b) the ship gate's own new negative assertion. Nothing reads `result.scores` as a
number. The Gate 2 path is intact and pinned by case 11 end to end; no human gate,
approval marker or ledger write changed.

Ship gate, verified by diff: the `'approved'` negative assertion is **byte-identical**
(it does not appear in the diff at all). The positive was retargeted to
`not-evaluated`. A third assertion was added requiring `'score-passed'` to be ABSENT.
Two assertions became three — strictly stricter.

**Step 12 OPTIMIZE.** One pass over one file replaces up to ten identical passes. The
`while` loop, the `allPerfect` branch and the `avgScore >= 4` branch are gone.
`refineLoop` now reads the plan once for its own guard; `integrate` and `critique`
each read by path because that is their public signature, and `critique` MUST read
after the append or it would report on stale bytes. No redundant read remains that
could be removed without changing a public signature.

**Step 13 SECURE.** The verdict text is a fixed literal. The only interpolated values
are integers (step numbers), asserted in
`tests/iron-loop-coverage.test.js` ("Only integers are interpolated — never a line of
plan content"), so no plan content can inject a heading or a control character into a
plan file. The `existsSync`-then-read pattern and all path handling are unchanged.

## Verification Evidence

**Ratchet 1 — the dead-export fence, MEASURED live, never predicted.**
`analyzeExports` reported **71** before and **69** after; the two entries that left
are `src/lib/iron-loop.js#validateForTodo` and
`src/lib/iron-loop.js#generateIronLoopTemplate`, both resolved by DELETION.
`.ctoc/export-reachability-baseline.json` `maxDead` moved 71 → 69 and both entries
were removed from the list. The plan's illustrative `102 → 100` was correctly
withdrawn: the real starting point was 71, not 102. `tests/export-reachability.test.js`
(strict equality) passes: 16/16.

**Ratchet 2 — the coverage floor. NOT MOVED, and not movable downward.** Floor is 99.
Measured **before: 99.06%**, **after: 99.08%** — the before figure taken by running the
same gate against a pristine copy of the tree at HEAD. The floor was not touched and no
deleted code was restored to inflate the denominator.

> **Deleting the dead code RAISED coverage; it did not lower it.** This slice was
> written expecting a possible drop below the floor, and a deadlock section was
> prepared for it. The opposite happened, and the reason generalises: the deleted code
> was dead-but-COVERED — tests existed for `validateForTodo`, `generateIronLoopTemplate`
> and all five `score*` helpers — so removing it took roughly equal numerator and
> denominator out, while the tests that remained were denser. A future reader weighing
> whether to delete dead code should know the measurement went the helpful way here
> rather than assume a deletion costs coverage.

**Ratchet 3 — the cache-freshness whitelist shrank by one entry**, from the
`iron-loop.js` exemption that the honesty test correctly identified as dead weight
(decision 18). An exemption removed is a fence tightened. No entry was added.

**The file-reachability fence** passes unchanged (21/21) — no file this slice created
is unreachable; `tests/` is not scanned by either fence, and a test is never a caller.

**Lint** is clean on every changed JavaScript file (`npx eslint` exit 0).

**Step 14 — the full gated run, verbatim:**

```
ℹ tests 10199
ℹ suites 1758
ℹ pass 10199
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
[CTOC test-gate] coverage 99.08% (threshold 99%), skipped 0, failed 0
[CTOC test-gate] PASS
```

(Measured src line coverage varies by a hundredth between runs — 99.06% and 99.08%
were both observed on the final tree; both are above the floor of 99, which was not
touched.)

**One further failure was found and fixed at Step 14, and it was the executor's own.**
A `CLAUDE.md` edit added a parenthetical to the Step 7 row of the Iron Loop step table,
and `tests/registry-integrity.test.js` reads that column as a list of dispatchable
AGENT slugs — so the words "agent-driven", "iron-loop" and "not-evaluated" were parsed
as three agents that resolve to no file. The table cell was restored to agent slugs
only and the honesty note moved to a paragraph below the table, where it belongs and
where no parser mistakes it for a dispatch target. The test was not weakened.

## Step 16 Final-Review Report

**The single Step-14 failure was a scope boundary, not a defect in the work.** It was
the cache-freshness whitelist-honesty test naming `iron-loop.js` as a dead-weight
exemption (decision 18). The executor STOPPED rather than fix a file the plan did not
declare, and refused the in-scope escape of reintroducing the word "plans" in a comment
to make the detector trip again. The human extended the plan's declared files by
`tests/cache-freshness.test.js` and re-approved; the entry was then removed, which
tightens the fence. Final gate numbers are recorded above and below.

### THE MEASUREMENT THAT MATTERS MOST — the honest verdict does NOT reach a real plan

This is the finding to read first, because it converts a suspicion into a measurement.

Case 15 drives `actions.applyIronLoop` on a plan whose frontmatter carries
`iron_loop: true` **exactly as every plan in this repository is authored** — the flag is
not pre-stripped, because a fixture shaped to reach a path production never takes is
the precise defect this slice exists to delete. The result:

> **The plan file comes back BYTE-IDENTICAL.** No execution section. No
> `## Deferred Questions`. No verdict. `assert.equal(after, before)` passes.

`applyIronLoop` returns at its early guard (`if (metadata.iron_loop) return;`) before
`refineLoop` is ever called. So the deliverable of this slice — a human at Gate 2
reading "not evaluated" instead of inferring that something checked the plan — reaches
only plans that arrive WITHOUT the flag, which is approximately none of them today.

The machinery is now honest. Its REACH is the open question, and that question is the
human's.

### THE OPEN FORK — restated for the human, and NOT decided

**Does the honest verdict need to reach plans authored with `iron_loop: true`?**

Case 15 answers the evidence question the plan asked. Driven on a plan whose
frontmatter carries `iron_loop: true` exactly as every plan in this repository does,
`applyIronLoop` returns at its early guard and leaves the file **byte-identical** — no
execution section, no `## Deferred Questions`, no verdict. So today the deliverable
reaches only plans that arrive WITHOUT the flag. The guard was not touched, as the plan
requires. The three readings (idempotency guard / authored-flag opt-out / overloaded
flag) and their three different correct actions stand exactly as written above.

## What this plan does NOT fix

- **It does not evaluate plan quality.** After this slice, no automated critique
  exists. A bad plan and a good plan receive the same honest verdict: not evaluated.
  Gate 2 is, and always was, the human's — this slice stops a machine-generated
  number from standing beside it looking like a second opinion.
- **It does not resolve the `iron_loop: true` early return.** That is the fork above,
  and it is the human's. Until it is answered, the honest verdict reaches only plans
  that arrive without the flag.
- It does not add the agent-driven refinement the deleted comment imagined
  ("this would spawn an agent to refine"). That is the separate work.
- It does not change any human gate, approval marker or ledger behaviour.
- It does not touch `docs/CRITICAL_CONTROL_POINTS.md`'s regulatory-control rows;
  those belong to the compliance-claims slice.
