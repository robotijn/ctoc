---
approved_by: human
approved_at: 2026-07-19T16:47:51.539Z
gate_crossed: implementation → todo
---

---
approved_by: human
approved_at: 2026-07-19T11:58:15.071Z
gate_crossed: implementation → todo
---

---
title: "A build that trips a ratchet can move it — ratchet files are in scope by rule, and a MECHANISM checks it"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00098-the-coverage-floor-stops-silently-dropping-to-80
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/documented-counts.js"
  - "src/lib/plan-validator.js"
  - "tests/plan-declares-count-moving-ratchets.test.js"
  - "tests/doc-counts.test.js"
  - "agents/planning/implementation-planner.md"
  - "CLAUDE.md"
---

# A build that trips a ratchet can move it

> **THIS SLICE WAS SPLIT BY THE HUMAN'S RULING.** It had grown to ten declared files
> spanning two independent subjects. The coverage-floor hardening moved to
> `plans/todo/00098-the-coverage-floor-stops-silently-dropping-to-80.md` — the urgent
> half, a live defect — and **this slice now depends on it**. This half keeps the
> original number and title because "ratchet files are in scope by rule" was always
> this plan's subject and origin story; the floor work was scope growth added during
> repair. Ordering derivation is below. See decisions 7-19.
>
> **Two earlier repairs also stand, both recorded below:** the headline mechanism
> originally targeted a file with **zero readers** (decision 8), and the human ruled
> that the rule must be a **mechanism, not an instruction** (decision 9).

Two slices in this wave had to edit a ratchet file outside their declared `files:`
because the change itself moved the ratchet:

- the concurrent-edit guard slice removed a live false-green site, so
  `.ctoc/false-green-baseline.json` went `220 → 219` and the fixed key had to be
  deleted (its decision 9);
- both it and the promote-parity slice added a test file, so `CLAUDE.md`'s
  documented test-file count went `420 → 421 → 422` (decisions 9 and 10).

Neither was avoidable and neither was predictable at planning time. **Nobody can
know in advance which ratchets a change will trip** — that is what makes them
ratchets. So the human ruled that ratchet files are in scope **by rule**, carried by
the plan generator rather than predicted per plan.

## Why this is enforced by code and not by a paragraph — the human's ruling

The first repair of this slice proposed carrying the rule as an instruction in the
plan generator, and recorded honestly that no test could prove a dispatched model had
obeyed it. The human ruled: **the rule must be a mechanism. Something checks the
finished plan; nothing relies on the planner having obeyed.**

His reasoning, recorded here because it is the design rationale and the next reader
needs it:

> Today produced repeated proof that **prose rules silently stop being true.** A
> documentation page describes a hook consulting a module that file never
> references. Six agents are ordered to call JavaScript with no tool that can
> execute JavaScript. A ten-round refinement loop has a decision layer nothing can
> reach. Every one of those was an instruction that read as a rule and had nothing
> behind it. **An instruction to a planner is the same shape** — and it would sit
> inside the slice whose whole subject is making a ratchet trustworthy.

The instruction to the planner is **kept** — it is how a plan gets written correctly
in the first place. The mechanism is what makes it **true**.

---

## THE MECHANISM

### What is actually enforceable — the surface is far narrower than it looks

Before designing a check, the honest question: which ratchet declaration actually
*grants* anything? `src/hooks/PreToolUse.Edit.js:58-65`:

```js
const WHITELIST = [
  '.gitignore', '.gitattributes',
  /^\.ctoc\//,        // ← both JSON baselines already writable, any plan, today
  /^\.local\//,
  /^plans\/.*\.md$/,
  /^VERSION$/,
];
```

| Ratchet | Declaration grants what? | Enforceable? |
|---|---|---|
| `.ctoc/false-green-baseline.json` | **nothing** — `^\.ctoc\//` already permits it | no, and nothing to enforce |
| `.ctoc/coverage-baseline.json` | **nothing** — same | no, and nothing to enforce |
| `CLAUDE.md` | **the write** — genuinely blocked without it | **YES — the whole enforceable surface** |

So the mechanism has exactly one job: **ensure a plan that will move a documented
count in `CLAUDE.md` has declared `CLAUDE.md`.** The other two entries are
convenience, grant nothing, and are deliberately unchecked. **A fence that also
policed them would be theatre** — it would report enforcement of a permission that
was never withheld.

*(Two carve-outs are denied AHEAD of the `.ctoc/` whitelist and may never enter a
ratchet list: the approval ledger at `.ctoc/approvals/`, and the Gate-3 verify
evidence at `.ctoc/state/verify/`. Step 13 confirms it.)*

### The trigger condition, derived rather than chosen

The general premise of this slice is that ratchet movement is *unpredictable*. That
is true of the false-green count — but it is **NOT true of the documented counts**,
and that asymmetry is the only reason a mechanism is possible at all.

`tests/doc-counts.test.js` counts six artifact classes off disk and compares each to
a number parsed out of `CLAUDE.md` at runtime:

| Counted artifact | Pattern |
|---|---|
| test files | `tests/*.test.js` (flat) |
| library modules | `src/lib/*.js` (flat) |
| hooks | `src/hooks/*.js` (flat) |
| dashboard tabs | `src/tabs/*.js` (flat) |
| agent definitions | `agents/**/*.md`, excluding any `_`-prefixed path segment |
| skill files | `skills/**/*.md` |

**Creating a file in one of those classes moves a documented count, deterministically
and knowably at plan-authoring time.** That is the trigger:

> **A plan FAILS when it declares a path that (a) matches a counted-artifact pattern
> and (b) does not yet exist on disk — i.e. the plan will CREATE it — and the plan
> does NOT also declare `CLAUDE.md`.**

Everything else passes. No plan is asked to declare a ratchet it has no known reason
to touch.

### Why it does not cry wolf — MEASURED against the live queue

Both critics warned that a check demanding ratchet entries in *every* plan fires on
the majority and is disabled within a month; that failure mode is documented in this
repository. So the trigger was tested against the plans in `plans/todo/` **before**
being proposed, not after:

| Plan | Declares a NEW counted artifact? | Fence verdict |
|---|---|---|
| `00078` scheduler decision record | no — declares one `plans/**.md` file | **silent** ✓ |
| `00088` reachability fence | no — modifies an existing test file | **silent** ✓ (declares `CLAUDE.md` anyway; over-declaration is safe) |
| `00097` broken-implementation tests | no — modifies five existing test files | **silent** ✓ |
| `00082` this slice | yes — new `src/lib` + `tests` files | fires → declares `CLAUDE.md` ✓ |
| `00090` plan critic | yes — one new test file | fires → declares `CLAUDE.md` ✓ |
| `00085` rejection one stage back | **yes — `tests/reject-plan-stage-aware.test.js`** | **FIRED — and the plan had NOT declared `CLAUDE.md`** |

**Half the queue is untouched, including the two plans that modify test files without
creating any** — and the check caught a real defect on its first run. `00085` would
have added a test file, moved the documented count, and been unable to edit
`CLAUDE.md` to fix it: the exact deadlock this slice exists to remove, sitting in the
approved queue. **That plan has already been corrected** (it declares `CLAUDE.md` and
reads the live count at its Step 15; see its decision 14), which is what lets this
fence start green with **no debt baseline**.

**This is also the mechanism's own self-test.** This slice introduces
`src/lib/documented-counts.js` (a new `src/lib/*.js` → moves the library-module
count) and one new test file (→ moves the test-file count). The mechanism's
introduction trips the mechanism's own trigger, and this plan declares `CLAUDE.md`
accordingly. A fence whose own arrival does not satisfy it would be suspect.

### Where it lives, and why not in a test

| Placement | Verdict |
|---|---|
| a fence test only | **rejected** — its only consumer would be a test, and *a test is never a caller* (Operating Lesson 16). The shared module would land on the dead-export list on arrival, inside a slice about instruments telling the truth |
| `plan-validator.validateForQueue` | **chosen** — wired at `'implementation->todo'` (`plan-validator.js:849`), which is Gate 2: the exact moment a plan's declaration must be right, **before** a build is committed to it |

So:

- **`src/lib/documented-counts.js` (NEW)** — the ONE encoding of "what is a counted
  artifact": for each class, its pattern and its live disk counter, plus the check.
- **`src/lib/plan-validator.js`** — `validateForQueue` calls it and returns a hard
  ERROR (not a warning) naming the plan, the offending path, and the count it moves.
  This is the live call site; the module is reachable from a shipped root.
- **`tests/doc-counts.test.js`** — refactored to consume the shared definitions
  instead of its own local `ROWS`. **One encoding, three consumers, no drift** — the
  same discipline `src/lib/gate-order.js` applies to the gate edges, and the exact
  anti-pattern `doc-counts.test.js`'s own header warns about at `:11-12` ("hard-coding
  would just relocate the drift — the same duplicate-literal anti-pattern this
  workstream exists to kill").
- **`tests/plan-declares-count-moving-ratchets.test.js` (NEW)** — proves it bites.

**The declared-files reader must be the multi-block-safe one.** A gate-stamped plan
carries a PREPENDED approval block ahead of its own frontmatter, so the single-block
reader (`plan-coverage.readPlanFiles`) returns `[]` for **every** plan in `todo/`.
`actions.js:1242-1277` exists precisely for this and documents it. Using the wrong
reader yields a fence that passes everything — a false green in the shape this wave
deletes.

### No debt baseline — the failures are fixed, not tolerated

The other two fences carry a debt list because they landed on hundreds of
pre-existing sites. Here the live scan flags **one** plan, and it is already fixed. A
baseline file for one entry would be a new ratchet invented inside a slice about
ratchets, and a debt list is the thing that rots.

**The fence starts with no baseline and must be green on arrival.** If the Step 9
scan finds **more than three offenders, STOP and report to the human** rather than
baselining them — that would mean the trigger is broader than this analysis and the
condition needs re-deriving, which is his call and not an executor's.

### WHAT THE MECHANISM CANNOT SEE — stated plainly

A fence honest about its limits is worth more than one implying completeness. This
one does not see:

1. **Undeclared creation.** It reads what a plan DECLARES. A plan that creates a
   counted artifact it never declared is invisible here. *Partially covered
   elsewhere*: `tests/` and `src/` are not whitelisted, so the PreToolUse hook blocks
   the undeclared write — a different mechanism, and the two do not compose into
   completeness.
2. **Deletions.** Removing a counted artifact also moves the count, and a `files:`
   entry for a file being DELETED is indistinguishable from one being MODIFIED. **A
   deletion-driven count move is not caught.** This is the largest hole and it is
   real: a slice that deleted a whole test file would slip straight through.
3. **The false-green and coverage baselines.** Genuinely unpredictable, and requiring
   no declaration anyway. Not attempted, by design — not an oversight.
4. **Glob declarations.** A plan declaring `tests/**` matches the pattern but names
   no specific new file. The check treats a glob as NON-triggering, because it cannot
   tell. A plan can therefore evade the fence by declaring a glob.
5. **Declaration is not intent.** A plan satisfies the fence by declaring `CLAUDE.md`
   and never touching it. The check proves *permission*, never *correctness* — the
   count itself is `doc-counts.test.js`'s job, at verify.
6. **Time-dependence.** Once the artifact exists, the trigger stops firing for that
   plan. Bounded deliberately by scoping the scan to `implementation/` and `todo/` —
   the pre-build stages, where absence reliably means "will be created".
7. **The ratchet BLOCK in the generator is unchecked.** The mechanism enforces the
   load-bearing implication (`CLAUDE.md` when a count moves), not that the planner
   emitted the two decorative `.ctoc/` entries. Those grant nothing, so there is
   nothing to enforce.

---

## Where plan-generating behaviour actually comes from — the retarget

The original target was wrong. Re-verified on disk:

| Claim | Evidence | Verdict |
|---|---|---|
| `.ctoc/templates/implementation-plan.md.template` is read by the pipeline | `grep -rn "implementation-plan.md.template" src/ agents/` → **no matches** | **FALSE — zero readers** |
| `init-project.js` reads it | `:587-588` reads `CLAUDE.md.template` and `IRON_LOOP.md.template` only | **FALSE** |
| `implementation-planner` names it | the agent carries an **inline** skeleton at `:419-428` and never names it | **FALSE** |

**The real generator is `agents/planning/implementation-planner.md`.** The dead
template is left untouched — whether an unread template is wired or deleted is the
human's call and belongs with the reachability work, not here.

## The second-order problem: three ratchet entries versus the one-to-three-files rule

`agents/planning/implementation-planner.md:425` reads, verbatim:

```
files:                               # the FOCUSED file list for THIS slice only (~1–3),
```

and the sizing rule at `:43-45` mandates "~1–3 files per slice". Mandating three
ratchet entries in every plan fights that rule head-on.

**Resolution: separation, not exception.** The slice's own files are the ~1–3 WORK
SURFACE and the sizing rule governs them. Ratchet files are a CONDITIONAL WRITE
PERMISSION, emitted under a separate commented block, and **explicitly excluded from
the budget.** The skeleton emits:

```yaml
files:
  # THE SLICE'S OWN FILES — the work surface. ~1–3. The sizing rule governs THIS list.
  - <path/for/this/slice/only>
  # RATCHET FILES — in scope BY RULE, not by prediction, and NOT counted toward the
  # ~1–3 budget above: they are a conditional write permission, not planned work.
  # ENFORCED: a plan that CREATES a counted artifact (tests/*.test.js, src/lib/*.js,
  # src/hooks/*.js, src/tabs/*.js, agents/**/*.md, skills/**/*.md) MUST declare
  # CLAUDE.md — src/lib/documented-counts.js checks this at Gate 2 and the
  # transition FAILS without it. The two .ctoc/ entries below are already permitted
  # by the hook whitelist and are declared for legibility, not permission.
  - ".ctoc/false-green-baseline.json"
  - ".ctoc/coverage-baseline.json"
  - "CLAUDE.md"
```

The sizing prose at `:43-45` and `:425` gains one sentence excluding the ratchet
block from the count, so the two rules cannot be read as contradicting each other.

## Implementation Details

### File: `src/lib/documented-counts.js`
**Action:** CREATE
**Purpose:** The ONE encoding of the counted artifact classes, plus the Gate-2 check.

Exports:
- `COUNTED_CLASSES` — for each class: a `matches(relPath)` predicate and a `live(root)`
  disk counter. The single source `tests/doc-counts.test.js` also consumes.
- `movesDocumentedCount(relPath, projectRoot)` → the class name a path would move by
  being CREATED (matches a pattern AND does not exist on disk), else `null`.
- `checkPlanDeclaresCountMovers(declaredFiles, projectRoot)` →
  `{ ok, offenders: [{ path, countClass }] }`. `ok` is false when any offender exists
  and `CLAUDE.md` is absent from `declaredFiles`.

Cross-platform: normalise `path.sep` → `/` before matching. Glob entries (containing
`*`) are NON-triggering — blind spot 4, and the code comment must say so rather than
leaving a future reader to infer it is an oversight.

### File: `src/lib/plan-validator.js`
**Action:** MODIFY — `validateForQueue` only
**Purpose:** The live call site. Gate 2 fails when a count-mover is undeclared.

Read the plan's declared files with the **multi-block-safe** reader (the union of all
leading frontmatter blocks — `actions.js:1242-1277` documents why the single-block
reader returns `[]` for every plan in `todo/`). On `ok === false`, push a hard ERROR
naming each offending path, the count it moves, and the required `CLAUDE.md` entry.
A warning would be ignored; this must block.

### File: `tests/doc-counts.test.js`
**Action:** MODIFY — replace the local `ROWS` definitions with the shared ones
**Purpose:** One encoding, not two. **Every existing assertion and every documented
count stays** — only the source of the class definitions moves. This is a refactor,
not a re-specification: if any assertion would change meaning, stop and report.

### File: `tests/plan-declares-count-moving-ratchets.test.js`
**Action:** CREATE
**Purpose:** Prove the check bites, on planted plan fixtures.

| # | Case | Assertion |
|---|---|---|
| 1 | **a new test file without `CLAUDE.md` FAILS** | fixture plan declaring `tests/new-thing.test.js` (absent on disk) → `ok === false`, offender named |
| 2 | a new test file WITH `CLAUDE.md` passes | same plus `CLAUDE.md` → `ok === true` |
| 3 | **modifying an EXISTING test file passes** | declares a test file that exists → silent. The no-cry-wolf property |
| 4 | a plan declaring only `plans/**.md` passes | the `00078` shape → silent |
| 5 | each of the six classes triggers | table-driven over `COUNTED_CLASSES`, so adding a class without a case is impossible |
| 6 | **a gate-stamped plan's files are READ** | fixture with a PREPENDED approval block → declared files are found. Guards the `[]`-for-everything false green |
| 7 | **Gate 2 actually blocks** | drive `validateTransition('implementation','todo')` on an offending plan → `valid === false` with the error text |
| 8 | glob declarations are non-triggering, and it is deliberate | `tests/**` → silent; the case title names it as blind spot 4 |
| 9 | Windows separators normalise | `tests\\x.test.js` triggers identically |
| 10 | **the live queue is clean** | scan `plans/implementation/` + `plans/todo/` → zero offenders |

### File: `agents/planning/implementation-planner.md`
**Action:** MODIFY
**Purpose:** The instruction half — how a plan gets written correctly in the first place.

The two-block `files:` skeleton above, the sizing-rule exclusion sentence, and a
guidance paragraph stating the rule, its limit (it permits the write, never the
direction), **and that it is now enforced at Gate 2 by
`src/lib/documented-counts.js`** — so an author who deletes the block as noise
discovers the check rather than a mystery failure.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented counts only
**Purpose:** This slice creates two counted artifacts and must move the counts it moves.

`src/lib/documented-counts.js` moves the library-module count;
`tests/plan-declares-count-moving-ratchets.test.js` moves the test-file count (stated
in **two** places). **Read the live counts from disk** — never trust a number written
in a plan. Change nothing else.

---

### Wiring — the live call sites

| change | live call site | root |
|---|---|---|
| `documented-counts.js` | `plan-validator.validateForQueue` (`:849`, `'implementation->todo'`) | `/ctoc:menu` → Gate 2 approval |
| | `tests/doc-counts.test.js` (second consumer of the same encoding) | `npm test` |
| generator skeleton | the agent CTO Chief dispatches at Steps 5-7 | every new plan's `files:` |

**The original wiring row here was FALSE and is corrected rather than deleted**: it
claimed `init-project.js` and the planner both generate plans from the dead template.
Neither does. That false claim is how a zero-reader target passed review, and deleting
it would erase the evidence of how.

**Note on reachability:** `documented-counts.js` has a live non-test caller by
construction (`plan-validator.js`). Had the check lived only in a fence test, its only
consumers would have been tests — and *a test is never a caller* — so it would have
landed on the dead-export list on arrival. That constraint chose the placement.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/plan-declares-count-moving-ratchets.test.js` in full and run ONLY that file. Cases 1, 5, 6 and 7 MUST be red today (no check exists). Cases 3, 4 and 8 must be GREEN before and after — they pin the no-cry-wolf property, and a red there means the trigger is too broad and must be narrowed before Step 10. **Case 10 must be GREEN**, because the one plan the trigger flagged (`00085`) has already been corrected; if it is RED, a new offender has entered the queue — record which plan, and if the count exceeds three, STOP (Step 9). Record every output verbatim.
- [x] TEST — TDD red-first (fix round); adversarial re-review confirmed real/adversarial tests.
### Step 9: PREPARE — read from disk: `tests/doc-counts.test.js` in full (the six classes and their live counters — the definitions being MOVED, not reinvented); `src/lib/plan-validator.js:820-870` (`validateTransition`, `validateForQueue`); `src/lib/actions.js:1242-1277` (the multi-block declared-files reader and WHY the single-block one returns `[]`); `agents/planning/implementation-planner.md` (confirm the inline skeleton at `:419-428` and the sizing rule at `:43-45`/`:425`); `src/hooks/PreToolUse.Edit.js:58-89` (re-confirm the whitelist finding against the code, not this plan's quotation). **Re-run `grep -rn "implementation-plan.md.template" src/ agents/`** — if it now has a reader, the code wins and the retarget must be revisited before implementing. **Then scan `plans/implementation/` + `plans/todo/` with the new check and record the offender list. If it names more than three plans, STOP and report — the trigger is broader than this analysis and re-deriving it is the human's call, not an executor's.**
- [x] PREPARE — plan ancestry + code confirmed against the real implementation.
### Step 10: IMPLEMENT — one step, files as sub-items.
- [x] IMPLEMENT — declared files implemented (backfill defect fixed); full gated npm test green.
  - `src/lib/documented-counts.js` — the shared classes, `movesDocumentedCount`, `checkPlanDeclaresCountMovers`.
  - `src/lib/plan-validator.js` — `validateForQueue` calls the check; hard ERROR, multi-block reader.
  - `tests/doc-counts.test.js` — consume the shared definitions; every assertion and count preserved.
  - `tests/plan-declares-count-moving-ratchets.test.js` — cases 1-10.
  - `agents/planning/implementation-planner.md` — the two-block skeleton, the exclusion sentence, the guidance paragraph naming the enforcement.
  - `CLAUDE.md` — the two documented counts this slice moves, read live from disk.
### Step 11: REVIEW — confirm the counted-artifact classes are defined in EXACTLY ONE place and that `doc-counts.test.js` no longer carries its own copy, with every one of its assertions preserved. Confirm `validateForQueue` uses the multi-block reader — a single-block read makes the fence pass everything, so verify by driving case 6. Confirm the emitted skeleton still parses as valid plan frontmatter (generate one and validate it through `plan-validator`). Confirm the sizing rule and the ratchet block no longer contradict each other read end to end. Confirm no existing test asserts an exact `files:` length or an exact skeleton body that this change breaks; if one does, the code is right and the test is corrected toward the new reality, never loosened.
- [x] REVIEW — adversarial iron-loop-critic REVIEW + fix re-review (2026-07-30): CLEARS Gate 3.
### Step 12: OPTIMIZE — the check runs once per plan over an already-read frontmatter; the disk-existence test is one `existsSync` per declared path. No globbing, no directory walk per path.
### Step 13: SECURE — the check reads plan frontmatter and tests path existence; it executes nothing. Confirm path normalisation cannot escape the project root (a declared `../../etc/x` must not be probed), that both separators normalise, and that no error message leaks an absolute home path. **Confirm no ratchet entry in the emitted skeleton names anything under `.ctoc/approvals/` or `.ctoc/state/verify/`** — both are denied ahead of the whitelist precisely because a write there would forge an approval or fabricate Gate-3 evidence, and neither may ever enter this list.
- [x] SECURE — security-scanner SECURE / adversarial re-review (2026-07-30): no block/critical.
### Step 14: VERIFY — `node --test tests/plan-declares-count-moving-ratchets.test.js tests/doc-counts.test.js tests/plan-validator*.test.js` green, then the full gated run `npm test`. Lint the changed JavaScript at `--max-warnings 0`. No git operations. **`00098` must have landed first** — see the ordering section; this slice's verification runs through the gate that slice repairs.
- [x] VERIFY — full gate recorded to .ctoc/state/verify/<slug>.json: passed=true, coverage >=99%, 0 skipped, 0 failed.
### Step 15: DOCUMENT — the generator's guidance paragraph states the rule, its limit, and its enforcement. **`documented-counts.js`'s module header states the trigger condition and ALL SEVEN blind spots**, so the next reader cannot mistake it for total — the deletion hole especially, since it is the one a future maintainer is most likely to assume is covered. Update `CLAUDE.md`'s documented library-module and test-file counts, reading the live values from disk first.
### Step 16: FINAL-REVIEW — report files, tests, the Step 8 red and green evidence verbatim (especially cases 3, 4 and 8 proving the no-cry-wolf property), the Step 9 offender scan result, the grep result for the dead template, the before/after documented counts, and every decision taken under ambiguity.
- [x] FINAL-REVIEW — fix re-review verdict (2026-07-30): CLEARS Gate 3.

## Ordering — why this slice lands SECOND

Declared in frontmatter: `depends_on: 00098-the-coverage-floor-stops-silently-dropping-to-80`.

Both slices declare `CLAUDE.md`, so they cannot build concurrently — the scheduler
serialises them on file conflict regardless, but the mechanical reason is the weaker
one. The semantic reason:

> **This slice is a NEW FENCE, and its Step 14 verifies it by running `npm test` —
> the gate whose floor reader is the defect `00098` fixes.** Verifying a new fence
> with an instrument already known to substitute 80 for "I could not read my input"
> is exactly the circularity both slices exist to remove. Fix the instrument, then
> use it.

That derivation is independent of, and agrees with, the coordinator's reading (live
defect before preventive mechanism) — with one addition: the live-defect argument
alone makes the order a *preference*, and the circularity argument makes it a
*requirement*.

**No `blocks:` edge on `00090` is carried here.** That edge originated in the
coverage-floor freeze, never in the declaration mechanism, so it moved with `00098`.
This slice and `00090` both declare `CLAUDE.md` and are therefore serialised on file
conflict by the scheduler, but there is no semantic dependency between them in either
direction.

## Decisions Taken Under Ambiguity

1. **The stated cost is reported as smaller than stated, with evidence.** The
   instruction assumed the declared-files check was protecting the ratchet files.
   `PreToolUse.Edit.js:61` whitelists `^\.ctoc\//`, so both JSON baselines were
   already writable by any agent in any plan. Only `CLAUDE.md` was genuinely blocked.
   Reporting the premise back as given would have overstated what this change gives up.
2. **Only `CLAUDE.md` is enforced, and the omission is deliberate.** Checking the two
   JSON baselines would report enforcement of a permission that was never withheld —
   theatre, and the kind that makes a reader trust a fence further than it reaches.
3. **`CLAUDE.md` is granted through the generator plus the Gate-2 check, not the hook
   whitelist.** The whitelist grants every tool call in every project; this grants
   only plans that declare it, visibly, in their own frontmatter where a reviewer
   sees it.
4. **The generator governs new plans; existing plans are untouched** — except `00085`,
   already corrected, which is what lets this fence start green with no baseline.
5. **Step 8 requires the new test to be seen failing**, and equally requires cases 3,
   4 and 8 to be seen PASSING before the change — a fence proven only by its reds is
   half-proven, and the half nobody checks is the false-alarm half.
6. **The one-to-three-files rule is resolved by SEPARATION.** Two labelled blocks and
   one sentence excluding the ratchet block from the count. The distinction is real:
   the slice's own files are planned WORK; ratchet files are a conditional PERMISSION
   used only if the change happens to trip one.
7. **This slice keeps the original number and title.** "Ratchet files are in scope by
   rule" was always this plan's subject, and its origin story — two slices forced to
   edit ratchet files outside their declared scope — is entirely about declaration.
   The coverage-floor work was scope growth added during repair, so it left as the
   new slice rather than displacing the original identity.
8. **RETARGETED from a file with zero readers.** `grep -rn` returns nothing;
   `init-project.js:587-588` reads two other templates; the planner carries an inline
   skeleton. The slice would have shipped, reported success, and changed nothing —
   Operating Lesson 16 failing inside the slice meant to make ratchets movable. The
   plan's own wiring table asserted the false claim, which is how it passed review;
   that row is corrected in place, not deleted, so the failure mode stays visible.
9. **THE RULE IS A MECHANISM, PER THE HUMAN'S RULING.** The prior repair recorded
   that no test could prove a dispatched model obeyed an instruction, and surfaced it
   as a fork. He ruled for enforcement, and his reasoning is recorded near the top
   because it is the design rationale: three separate instructions were proven hollow
   the same day, and an instruction to a planner is the same shape. The instruction
   is KEPT — it is how a plan gets written right the first time — and the check is
   what makes it true.
10. **The trigger is CREATION of a counted artifact, derived from
    `doc-counts.test.js` rather than chosen from a menu.** Ratchet movement is
    unpredictable in general — that is this slice's own premise — but the DOCUMENTED
    COUNTS are the exception: creating a file in one of six classes moves a count
    deterministically and knowably at authoring time. That asymmetry is the only
    reason a mechanism is possible, and the check claims nothing beyond it.
11. **The no-cry-wolf property was MEASURED against the live queue before proposing
    the trigger, not asserted after.** Six plans examined: silent on the three that
    touch no count, fires on the three that do. Both critics named "fires on the
    majority and gets disabled" as the failure mode, and this repository has
    documented it happening.
12. **The check lives in `plan-validator.validateForQueue`, not in a fence test.** A
    test-only home would give `documented-counts.js` no caller but tests — and a test
    is never a caller — so it would land on the dead-export list on arrival, inside a
    slice about instruments telling the truth. Gate 2 is also where the failure helps
    most: pre-build, before an executor is committed to a plan it cannot complete.
13. **`doc-counts.test.js` is refactored to consume ONE shared encoding.** A second
    copy of the class definitions is exactly the duplicate-literal anti-pattern that
    file's own header warns against at `:11-12`. Every assertion and every documented
    count is preserved; only the source of the definitions moves.
14. **NO DEBT BASELINE.** The live scan flags one plan and it is already fixed. A
    baseline for one entry would invent a new ratchet inside a slice about ratchets,
    and a debt list is what rots. More than three offenders at Step 9 STOPS the work
    rather than baselining them.
15. **The seven blind spots are written into the plan AND required in the module
    header.** The largest is deletions: a `files:` entry for a file being deleted is
    indistinguishable from one being modified, so a deletion-driven count move is not
    caught. A fence implying completeness is worse than one honest about its edges,
    and this one is deliberately narrow — it covers `CLAUDE.md`, the only ratchet
    whose declaration grants anything.
16. **SPLIT PER THE HUMAN'S RULING; the coverage-floor half is now `00098` and this
    slice DEPENDS on it.** The combined plan had ten declared files across two
    independent subjects and exceeded the sizing rule it was itself amending.
17. **The ordering is derived from CIRCULARITY, not only from urgency.** Both slices
    touch `CLAUDE.md` so they cannot build concurrently, and the live defect argues
    for `00098` first. The stronger reason, and the one that makes it a requirement
    rather than a preference: this slice is a new fence whose Step 14 verifies it by
    running the very gate whose floor reader `00098` repairs.
18. **The `blocks: 00090` edge moved to `00098`, not kept here.** The coupling was
    always created by the floor freeze, never by the declaration mechanism. Keeping a
    copy here would be a second encoding of one dependency — the same duplicate
    hazard decision 13 removes from the counts.
19. **`CLAUDE.md` is declared BY THIS SLICE'S OWN RULE.** It creates a `src/lib/*.js`
    and a `tests/*.test.js`, so it trips its own trigger and must declare the file it
    is about to move. A fence whose own arrival violated it would be evidence the
    trigger was wrong.

## Decisions Taken During Implementation

*(Follow-up defect fix, TDD red-first, against the shared declared-files reader this
mechanism depends on. Not part of this slice's declared `files:` — recorded here because
it repairs the parser that makes this slice's generator output legible.)*

1. **Root cause, one fix, shared reader.** The critical defect lived in
   `parseFilesField` (`src/lib/stale-detector.js`), the ONE declared-files reader shared
   by `plan-validator.validateForQueue` (the Gate-2 call site of THIS slice's fence),
   `plan-declares-count-moving-ratchets.test.js`, and the stale detector. Its block-list
   loop broke at the FIRST non-dash line, so a YAML comment inside a `files:` block made
   every entry after it invisible — and this slice's own generator emits exactly that
   shape (labelled `# THE SLICE'S OWN FILES` / `# RATCHET FILES` comment blocks between
   the work-surface files and the ratchet files). One guard in the shared function fixes
   every caller; patching a single caller would have left the siblings broken.
2. **YAML block-sequence semantics.** Interspersed blank lines and full-line `#`
   comments are now SKIPPED, not terminators; the sequence ends ONLY at a new
   non-indented top-level `key:` line or the `---` delimiter. A trailing top-level key is
   never captured as a file. An indented non-dash line is neither a valid entry nor a
   terminator, so it is skipped rather than ending the block.
3. **`:608` test renamed, not weakened (Lesson 14).** `stale-detector-cheap.test.js`'s
   "block-list stops at first non-dash line" asserted the buggy contract by NAME while
   its fixture (a top-level `status:` key) exercised only correct top-level-key
   termination. The fixture and assertion are unchanged; the name is tightened to "ends
   at a new top-level key". One new red-first case pins the comment/blank-skip behavior
   (it returned `[]` against the old break-at-first-non-dash reader); a second new case
   pins the trailing-key non-capture — that one is a green-before regression guard, not a
   red-first proof (the old reader broke at the comment and coincidentally returned the
   same result), and it guards against a wrong fix that would parse a `key: value` line
   as an entry.
4. **Scope kept minimal.** No `CLAUDE.md`, no VERSION bump, no plan stage move — the fix
   touches only the shared reader and its direct unit test; it creates no counted
   artifact, so this slice's own ratchet fence does not fire.
