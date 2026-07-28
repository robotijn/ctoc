---
iron_loop_verdict: true
title: "An unflagged question blocks a gate instead of waving it through — the missing importance flag stops defaulting to the permissive value"
type: implementation
parent_plan: none
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/streaming-precompute.js"
  - "tests/question-blocking-default.test.js"
approved_by: human
approved_at: 2026-07-28T21:11:44.433Z
gate_crossed: implementation → todo
---

# An unflagged question blocks a gate instead of waving it through

## The defect, read on disk

`src/lib/streaming-precompute.js:529`:

```js
return !!question && (question.critical === true || question.important === true);
```

and the validator, at `:240-244`:

```js
if (question.critical !== undefined && typeof question.critical !== 'boolean') { … }
if (question.important !== undefined && typeof question.important !== 'boolean') { … }
```

**Both flags are OPTIONAL, and their absence resolves to the permissive value.** A
producer that omits them — a subagent that shortened its output, a future producer
written against the contract's mandatory fields only, a payload truncated mid-write —
emits questions that are, every one of them, non-blocking.

`hasEnoughInformation` at `:749-762` then computes:

```js
const unanswered = questions.filter((q) => !answers.ids.has(q.id));
const blocking = unanswered.filter(isBlockingQuestion);
if (blocking.length > 0) { … return enough:false … }
return { enough: true, reason: 'enough', unanswered, blocking: [], … };
```

**Twelve real, unanswered, unflagged questions produce `enough: true`.** The
`unanswered` array faithfully carries all twelve — and nothing consumes it as a
brake.

### Why it is not merely a display problem

`src/lib/streaming-gate.js:498-502` consumes that verdict as an **action**:

```js
if (sufficiency.enough === true && passesValidation
    && PRE_BUILD_DESTINATIONS.has(meta.toStage)
    && crossBySufficiency(projectRoot, plan.path, ref, stage, meta.toStage)) {
  continue;
}
```

The `continue` omits the plan from the returned list. **The caller crosses the gate
BEFORE rendering anything**, so those twelve unanswered questions are never displayed
to anyone. The human does not decline to answer them; the human never learns they
exist.

The two questions files live in this repository today both set `critical: true`
explicitly, so no live exploit is demonstrated — this is the same class as the
`classifySeverity` fail-secure hardening seventy lines away in `quality-agent.js`,
which was also defense-in-depth against a producer that had not yet misbehaved. The
argument for fixing it is identical, and stronger here, because the consequence is a
human gate rather than a surfaced finding.

## The fix: absence means UNKNOWN, and unknown blocks

An importance flag that was never set is not a statement that the question is
unimportant. It is the absence of a statement. **The producer must say so
positively, exactly as `approval-ledger.entryKind` requires provenance to be declared
positively rather than inferred from a default.**

| `critical` | `important` | Today | After |
|---|---|---|---|
| `true` | anything | blocking | blocking |
| `false` | `true` | blocking | blocking |
| `false` | `false` | non-blocking | **non-blocking** — a positive statement, honoured |
| absent | absent | **non-blocking** | **BLOCKING** — nothing was stated |
| `false` | absent | non-blocking | **BLOCKING** — only half was stated |
| absent | `false` | non-blocking | **BLOCKING** — only half was stated |

The fourth row is the defect. Rows five and six are the same defect wearing a partial
disguise, and a fix that only handles row four leaves them.

**Both flags must be present and boolean for a question to be non-blocking.** Anything
less is a question whose importance nobody declared, and an undeclared fork is exactly
what CTOC's Operating Lesson 15 says must become a question rather than a guess.

### The validator is tightened in the same slice, and that ordering matters

Making absence blocking WITHOUT tightening the validator leaves a silent trap: a
producer omits the flags, every question becomes blocking, the plan never crosses,
and nobody can tell whether the plan has real forks or a malformed producer. So
`validatePlanQuestions` gains a **warning-free hard requirement**: `critical` and
`important` are MANDATORY booleans on every question. A payload missing them is
refused at the write, with an error naming the question id and the missing key — so
the producer's defect surfaces at the producer, loudly, instead of manifesting as an
unexplained stuck gate three layers downstream.

**Refusing at the write is safe in the fail-closed direction**: a refused write leaves
no questions file, which `planQuestionsStatus` reports as `not-computed`, which
`hasEnoughInformation` already fails closed on. A malformed producer therefore
cannot cross a gate; it can only fail to generate.

### The existing two questions files

Both already carry `critical` and `important` explicitly on every question and remain
valid unmodified. Verified by reading
`.ctoc/streaming/questions/review__00003-r2a-scheduler-lifecycle-honesty.md.json`.
**Do not modify them.** If Step 8 finds a stored question that would now be rejected,
that is a finding to report — not a licence to loosen the rule.

## Implementation Details

### File: `src/lib/streaming-precompute.js`
**Action:** MODIFY — `isBlockingQuestion` and `validatePlanQuestions` only

`isBlockingQuestion` returns `false` **only** when both flags are present, boolean,
and both `false`. Every other shape — including a non-object, a `null`, a string
`"true"`, or a missing key — returns `true`. Restate the intent in the function's own
comment: *the absence of a declaration is not a declaration of unimportance.*

`validatePlanQuestions` changes the two optional checks into presence-and-type
requirements, with errors that name the question id and the specific missing or
mistyped key. The existing `undefined`-tolerant branches are replaced, not
supplemented — leaving both paths would mean two rules disagreeing about the same
field.

The doc comments at `:40`, `:203` and `:208` state the contract with `critical?` and
`important?` marked optional. **Update all three**, or the file documents the opposite
of what it enforces — which is the precise failure `00184` exists to clean up in a
sibling module.

`hasEnoughInformation` and `crossBySufficiency` are **NOT** touched here. This slice
changes what counts as a fork; it does not change what is done with the verdict.

### File: `tests/question-blocking-default.test.js`
**Action:** CREATE

| # | Case | Assertion |
|---|---|---|
| 1 | `critical: true` blocks | `isBlockingQuestion` true |
| 2 | `important: true` blocks | true |
| 3 | both explicitly `false` does not block | **false** — the positive declaration is honoured, and a fix that broke this would make every question blocking forever |
| 4 | **both flags absent blocks** | true — the defect |
| 5 | **`critical: false`, `important` absent blocks** | true |
| 6 | **`critical` absent, `important: false` blocks** | true |
| 7 | non-boolean flags block | `critical: "true"` → true |
| 8 | a non-object question blocks | `null`, `undefined`, `42` → true |
| 9 | **end-to-end: twelve unflagged unanswered questions no longer read as enough** | build a fixture project, write a questions file bypassing the validator (write the JSON directly), call `hasEnoughInformation` → `enough === false`, `blocking.length === 12`. This is the defect measured end to end, not at the predicate |
| 10 | the validator refuses a question missing `critical` | `writePlanQuestions` returns `ok:false`, the error names the question id and the key, and **no file is written** |
| 11 | the validator refuses a non-boolean flag | same shape |
| 12 | a refused write leaves the gate closed | after case 10's refusal, `hasEnoughInformation` reports `not-computed`, never `enough` |
| 13 | the live stored questions still validate | read both real files under `.ctoc/streaming/questions/` and assert `validatePlanQuestions` accepts them — proving the tightening broke no existing data |

Case 9 must write its fixture JSON **directly to disk** rather than through
`writePlanQuestions`, because after this slice the writer refuses exactly that shape.
Reaching the predicate requires bypassing the writer, and that is intentional: it
reproduces the state a pre-tightening producer would have left behind.

Fixtures under `os.tmpdir()`, `path.join` throughout, teardown with
`fs.promises.rm(root, { recursive: true, force: true })`.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `isBlockingQuestion` | `hasEnoughInformation` (`streaming-precompute.js:750`) | `streaming-gate.pendingGateDecisions` → `/ctoc:menu` |
| `validatePlanQuestions` | `writePlanQuestions` (`:303`) and `planQuestionsStatus` (`:422`) | the questions sweeper, and every gate screen read |

Both functions are already called on every gate screen render. Nothing here is
reachable only from a test.

## Test Plan

Covered by `tests/question-blocking-default.test.js`. Cases 4, 5, 6 and 9 are the
defect; case 3 and case 13 are the regression guards that stop the fix from becoming
"everything blocks forever", which would be a worse instrument than the defect.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write the test file in full FIRST and run only it. **Cases 4, 5, 6, 7, 8, 9, 10, 11
and 12 must be RED.** Record case 9's red verbatim — `enough: true` with twelve
unanswered questions is the evidence, and it is the sentence that justifies this
slice. Cases 1, 2, 3 and 13 pass immediately; that is expected and is not a false
green, because they are the guards against over-correction.

### Step 9: PREPARE
Read from disk: `streaming-precompute.js:200-260` (the validator),
`:505-535` (`isBlockingQuestion` and its comment), `:728-763`
(`hasEnoughInformation`), and `streaming-gate.js:471-528` (`pendingGateDecisions`, to
confirm the verdict is consumed as an action). Read both live questions files under
`.ctoc/streaming/questions/` and confirm they carry both flags. Grep the whole
repository for other callers of `isBlockingQuestion` and `validatePlanQuestions`
before changing either. **Where the code disagrees with this plan, THE CODE WINS.**

### Step 10: IMPLEMENT
- `src/lib/streaming-precompute.js` — `isBlockingQuestion` inverted to fail closed;
  `validatePlanQuestions` requires both flags as booleans; the three doc comments
  corrected.
- `tests/question-blocking-default.test.js` — the thirteen cases.

### Step 11: REVIEW
Confirm no path returns non-blocking without having read two present booleans.
Confirm the validator's error messages name the question id — an error that says only
"a question is invalid" is unactionable when a payload holds twelve. Confirm no
existing test asserted the old permissive default; if one does, the CODE is right and
that test is corrected toward the real behaviour, **never loosened**.

### Step 12: OPTIMIZE
Two boolean comparisons per question. Nothing added to any read path.

### Step 13: SECURE
Validator errors quote the question id, which is producer-authored — pass it through
`stripCtl` and cap its length, so a hostile id cannot inject control characters into a
gate screen. Never echo an entire rejected question object into an error.

### Step 14: VERIFY
`node --test tests/question-blocking-default.test.js` plus every existing test file
touching streaming questions or the gate, then the full gated run `npm test`. Lint at
`--max-warnings 0`. No git operations. **Report whether any plan currently in
`plans/functional/` or `plans/implementation/` changes its sufficiency verdict as a
result — that is the blast radius, and it must be measured rather than assumed.**

### Step 15: DOCUMENT
Record in `CLAUDE.md`'s streaming-questions section that both importance flags are
mandatory and that an undeclared flag blocks. Update the documented test-file count in
both places, reading the live count from disk first.

### Step 16: FINAL-REVIEW
Report every verbatim Step 8 red (case 9 especially), the blast radius from Step 14,
whether any stored questions file was rejected, and every decision taken under
ambiguity.

## What this plan does NOT fix

- It does **not** address the empty questions list. A file with **zero** questions has
  no unflagged question to block, so it still yields `enough: true` and still crosses.
  That is `00182`, and this slice does not weaken or duplicate it.
- It does **not** change what the gate DOES with `enough: true` — the crossing at
  `streaming-gate.js:498` is untouched.
- It does **not** update the producer agent definitions to emit both flags. They are
  the writer's problem and surface loudly at the write after this change.
- It does **not** correct the stale comment block at `streaming-gate.js:334-341`; that
  is `00184`.

## Decisions Taken Under Ambiguity

1. **Both flags must be present, not just one.** Requiring only `critical` would leave
   the row-six shape (`critical` absent, `important: false`) permissive, which is the
   same defect with one fewer character. A partial fix here reads as a complete one.
2. **The validator is tightened in the SAME slice as the predicate.** Splitting them
   would create an interval in which a malformed producer's questions all block with
   no explanation — a stuck gate whose cause is invisible. The loud refusal at the
   write is what makes the strict predicate diagnosable.
3. **The write refusal is fail-closed and was checked, not assumed.** A refused write
   leaves no file → `not-computed` → `enough: false`. Verified against
   `planQuestionsStatus:391-393` and `hasEnoughInformation:733-737`.
4. **Case 9 writes its fixture directly rather than through the writer.** After the
   tightening the writer refuses that shape, so the predicate is unreachable through
   the front door. Bypassing it is the only way to test the state a pre-tightening
   producer leaves on disk, and that state exists in the wild.
5. **Explicit `false, false` is preserved as non-blocking.** A producer that has
   genuinely judged a question to be a resolvable detail must be able to say so, or
   the tiering system collapses and every question becomes a gate. The fix targets
   silence, not judgement.
6. **The two live questions files are read but never modified.** If one failed the new
   validator that would be a finding about the producer, not permission to relax the
   rule.
7. **The doc comments are corrected in the same change as the code.** A contract
   comment that says `critical?` above code that requires `critical` is how the next
   producer gets written wrong, and this repair set already contains one instance of a
   comment outliving its code.

## Decisions Taken During Implementation

1. **Case 9 as planned is unreachable; the real end-to-end behaviour is `invalid`, and
   it is a STRONGER fail-closed (FINDING).** The plan predicted that a directly-written
   flagless questions file reaches `isBlockingQuestion` through `hasEnoughInformation`
   with `blocking.length === 12` / reason `open-forks`. It does NOT. `planQuestionsStatus`
   RE-VALIDATES the questions on read (`streaming-precompute.js` ~line 430), so after
   the tightening the flagless file classifies as `invalid` FIRST and the gate predicate
   fails closed there — `enough: false`, reason `invalid`, `blocking: []` — never reaching
   the predicate. The security outcome the plan wanted (the gate never crosses on a
   flagless file) is achieved one layer earlier and more strongly (a malformed file is
   invalid, not merely full of forks). Case 9 was split: **9a** asserts the true end-to-end
   fix (`enough:false`, reason `invalid`) and RECORDS that BEFORE the fix this exact file
   yielded `enough: true` (the captured RED); **9b** proves `isBlockingQuestion` IS reached
   end-to-end for WELL-DECLARED forks (twelve valid `critical:true` questions →
   `blocking.length === 12`, reason `open-forks`), which is the Lesson-16 wiring proof.

2. **`isBlockingQuestion` is exported for the unit tests, and the export is genuinely
   live (not a dead test-only export).** The export-reachability fence credits it via its
   internal call in `hasEnoughInformation` (definition + one real internal call ≥ 2), so
   `tests/export-reachability.test.js` stays green with no baseline change. Verified.

3. **Large existing-test blast radius, corrected toward the new contract — NOT loosened.**
   The mandated both-flags-mandatory validator rejects every existing fixture that used
   the OLD single-flag shape. Suite-wide this turned **68 tests red across 7 files**
   (`streaming-precompute`, `streaming-gate`, `answers-bind-to-plan-revision`,
   `streaming-questions-sweeper`, `streaming-human-loop-e2e`, `plan-question-screen`,
   `menu-critique-first`). Every one was a fixture encoding the permissive contract this
   plan explicitly replaces (Operating Lesson 14: correct the fixture toward the real
   behaviour). The fix was mechanical and intent-preserving: a fork question keeps its
   `true` flag and gains the missing `false` one (`critical:true` → `critical:true,
   important:false`); a question a test treats as non-blocking (a `normal`/detail question,
   previously unflagged) gains `critical:false, important:false`. No behavioural assertion
   was weakened, no case deleted, no range widened. The plan declared only two files; this
   blast radius is beyond the declared scope and is reported as a finding — the plan
   under-budgeted the test-suite churn of tightening the validator.

4. **CLAUDE.md was NOT edited (deviation from the plan's Step 15, per the build brief).**
   The plan's Step 15 asks to record the mandatory-flags contract and update a test-file
   count in `CLAUDE.md`. The executor brief explicitly forbids editing `CLAUDE.md` (its
   counts are auto-generated later). The contract is instead documented where it is
   enforced: in the three corrected doc comments and the `isBlockingQuestion` /
   `validatePlanQuestions` comments in `streaming-precompute.js`.

5. **Validator error messages name the id and are injection-safe.** The id is
   producer-authored and echoed into an error that can reach a gate screen, so it passes
   through a local `safeQuestionId` (control characters stripped, length capped at 80);
   the whole rejected question object is never echoed (Step 13 SECURE).

6. **Live-plan blast radius measured, not assumed: ZERO.** The only stored questions
   files on disk are for two `review/` plans (`00003`, `00004`); both already carry both
   flags on every question, so both remain valid and neither changes its sufficiency
   verdict. No plan in `plans/functional/` or `plans/implementation/` has a questions
   file, so none can flip.


## Deferred Questions

_Written by the Iron Loop integrator (src/lib/iron-loop.js), which performs NO
quality evaluation. These entries are the integrator's own report on itself, not
findings from a critic that read this plan._

- **evaluation**: NOT EVALUATED — no automated critique was performed on this plan. The refinement loop appended the Steps 8-16 template and assessed nothing. (The scores this step used to report were computed from that same template, not from the plan.) A human or a real critic must review this plan before it is built.
