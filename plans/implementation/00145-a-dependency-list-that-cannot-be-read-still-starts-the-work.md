---
title: "A dependency list that cannot be read still starts the work"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00131-a-mistaken-call-reads-as-a-verdict-about-the-plan, 00085-rejection-sends-a-plan-back-one-stage
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "src/areas/agent.js"
  - "tests/actions-scheduler.test.js"
  - "tests/an-unreadable-dependency-list-refuses-the-plan.test.js"
  - "tests/caller-error-is-not-a-verdict.test.js"
---

# A dependency list that cannot be read still starts the work

## What I measured, and where the report was wrong

The report came second-hand with an approximate line number. I read the code. The
defect is real; two details differ.

```
src/lib/actions.js:1295-1307   function planDependsOn(plan)
src/lib/actions.js:1306        return parts.filter((s) => s.toLowerCase() !== 'none' && isSafePlanSlug(s));
src/lib/actions.js:1355        for (const slug of planDependsOn(plan))   ← the only caller
```

**Discrepancy 1 — the line number.** The report said "roughly 1298". Line 1298 is the
`split`; the silent drop is the `filter` at **1306**, inside a function that begins at
1295. The plan uses the measured numbers, and Step 9 re-measures because two other
plans edit this file first.

**Discrepancy 2 — `planDependsOn` is NOT exported.** `module.exports` at `:2102-2135`
carries `taskSpecFromPlan` but not `planDependsOn`. The blast radius is one caller
inside this file, which makes the fix smaller than the report implied and means no
new export is needed to carry the richer answer — the wiring already exists.

Everything else in the report holds:

```js
// today
planDependsOn({ depends_on: undefined })                  → []
planDependsOn({ depends_on: '../../../../etc/passwd' })   → []
```

"This plan has no dependencies" and "this plan's dependencies could not be read"
return the identical value, and `taskSpecFromPlan` then builds a spec with
`blockedBy: []` and the scheduler claims the plan. Work starts whose prerequisites
were never checked. That is this repository's central defect class — a check
reporting a verdict on input it never received — pointed at the one component whose
whole job is deciding what may run.

The existing comment at `:1299-1305` calls the drop a documented choice. It is
defensible for one bad token among good ones. It is not defensible when it converts
"unreadable" into "unblocked", and the comment never distinguishes the two cases.

### The pinned tests prove the behaviour is current, not theoretical

`tests/actions-scheduler.test.js:146-200` asserts the drop in four places, in the
plainest possible words:

```js
assert.deepEqual(spec.blockedBy, [],
  'an unsafe depends_on token is ignored — never a scheduler blocker, never a throw');   // :168
assert.deepEqual(spec.blockedBy, [dep.task.id],
  'the valid dependency still blocks; the unsafe token is silently skipped');            // :190
```

Those assertions are the specification of the defect. They go RED under this slice and
are **tightened**, never deleted — see the file specification.

## The caller, checked before deciding — and the second half of the defect

The brief was right to insist on reading the caller first, because it changed the
shape of the fix.

`taskSpecFromPlan` (`:1332-1380`) **already throws** when a dependency is safe but
unresolvable (`:1366-1370`). That throw is caught by `startAgent` (`:1454-1459`) and
`advanceAgent` (`:1568-1573`), which push `{ plan, reason }` into `skipped[]` and walk
on to the next todo plan. So refusing costs no new architecture: the refusal path
exists, is tested, and does not stall the queue.

**But `skipped[]` is never shown to anybody.** Its only live consumer is
`src/areas/agent.js:67-80`, which reads exactly four fields:

```js
if (res && res.started)          … else if (res && res.drainStopped)
… else if (res && res.queued)    … else if (res && res.error)
```

`res.skipped` is never read, in that file or anywhere else in `src/`. A refused plan
sits in `todo/` and the human is told either "Agent started on <some other plan>" or
"No claimable plan in todo queue" — neither of which names the plan that was refused
or why. **This is already true today for the no-`files:` refusal**; this slice does
not introduce the invisibility, it inherits it, and a stricter return without a
visible surface would land the human in exactly the failure the brief warned about: a
plan blocked forever with no stated reason.

So the slice is two halves, and both are required:

1. `planDependsOn` reports what it refused, and `taskSpecFromPlan` refuses the plan.
2. `src/areas/agent.js` shows the human what was refused and why.

Half 2 is not a follow-up. A module is done when a human can reach it.

## Why a refused slug must stay refused

An executor reading "unsafe token" could conclude the safety check is the problem and
widen `isSafePlanSlug`. That would be **strictly worse than the defect being fixed**,
and this plan says so in the code as well as here.

The rule at `:1040-1053` exists because a dependency slug becomes a path:
`path.join(root, 'plans', 'done', slug + '.md')` at `:1361-1362`, probed with
`existsSync`. A crafted slug is a traversal and an out-of-root existence oracle — the
exact attack `tests/actions-scheduler.test.js:171-176` fences by asserting every
`existsSync` argument resolves inside the project root.

**The rejection rule is correct and does not change.** `isSafePlanSlug` keeps its
predicate byte-for-byte: `/^[A-Za-z0-9._-]+$/`, plus the explicit `.`/`..` and
`includes('..')` rejections. Not one character of it moves.

The defect is not *that* the slug is rejected. The defect is that the rejection is
**discarded instead of reported**. The distinction, stated the way the fix must
implement it:

| | today | after |
|---|---|---|
| the slug is refused as unsafe | yes | yes, identically |
| it is joined into a path | never | never |
| `existsSync` probes for it | never | never — the refusal happens BEFORE any probe |
| the caller learns a token was refused | **no** | yes, by name |
| the plan runs | **yes** | no |

If a Step 11 diff shows `isSafePlanSlug` loosened by a single character, the slice has
inverted its own purpose and must not ship.

## The fail-closed direction, and what it costs

This is a scheduling decision, so "closed" needs naming rather than assuming.

**Chosen: refuse to run the plan when its dependency list cannot be read.** The
argument is that a dependency exists solely to gate work. A gate whose input is
unreadable and which opens anyway is not a gate. Running a plan whose prerequisites
were never checked can corrupt work already in flight — the dependent plan edits files
the unbuilt dependency was meant to create or move first — and that damage is not
undone by later noticing.

**The cost is a stalled plan, and it is bounded three ways.** The FIFO walk continues
past a refusal (`:1458`, `:1572`), so nothing queued behind it is blocked. The
refusal is deterministic and repeats on every start attempt, so it cannot be a
one-time message the human missed. And the remedy is one line of frontmatter in the
human's own plan file.

**What the human sees.** Pressing `g` in the Agent area, on this repository:

```
Agent started on 00132-… — 1 plan skipped: 00144-… (dependency list unreadable:
1 token refused as unsafe: "../../../../etc/passwd")
```

and when nothing at all is claimable:

```
No claimable plan in todo queue — 1 plan skipped: 00144-… (dependency list
unreadable: 1 token refused as unsafe: "../../../../etc/passwd")
```

The message names the plan, states that the dependency list could not be read, and
quotes the refused token so the human can fix the frontmatter. It never suggests
loosening anything.

## The survey the brief asked for: other silent drops in this module

I searched `src/lib/actions.js` for every `filter`, `catch`, `|| []` and `return []`
(4 filters, 19 catches, 8 bare `return []`) and read each in context. **Four more
sites drop input where the caller cannot tell dropped from absent.** None is fixed
here; all are reported.

**Site B — `planDeclaredFiles` (`:1262-1286`).** `catch { return []; }` at
`:1269-1271`: a frontmatter region that cannot be extracted reads as "declares no
files". This one **fails closed by accident** — `taskSpecFromPlan:1339` throws on an
empty list, so no plan starts. But the message says *"plan X declares no files: — add
a files: block"* when the truth may be *"I could not read this plan's frontmatter"*,
sending the human to edit a block that is already there. A misattributed reason, not a
false green. Not fixed here: it is a message change in a function this slice does not
otherwise touch.

**Site C — a SECOND `depends_on` parser: `parseDependsOn` (`:1935-1939`).** It splits
on `,` only; `planDependsOn` splits on `/[\s,]+/`. So `depends_on: alpha beta` is
**two dependencies to the scheduler and one token `"alpha beta"` to the batch-approval
path** (`listSubplans:1989` → `topoOrderByDependsOn:2008`). It applies no
`isSafePlanSlug` filter, which is safe there because it never joins a path — but two
parsers for one frontmatter key, disagreeing on separators, is a live inconsistency.
Not fixed here: unifying them changes batch-approval ordering, which has its own blast
radius.

**Site D — `listSubplans` (`:1976-1983`).** `catch { /* fail-open */ }` on a plan file
that cannot be read: the slice falls back to first-block metadata and, if that lacks
`parent_plan`, **drops out of its parent's batch silently**. A human batch-approving a
parent then approves a set that is quietly short one sibling. Real, same family, not
fixed here — it is a Gate-2 enumeration question, not a scheduling one.

**Site E — `topoOrderByDependsOn` (`:2015`, and the cycle fallback below it).**
Out-of-batch edges are dropped and cycle remnants are appended in input order, both
silently. Documented best-effort, and it affects approval **order** only — never
whether work runs. Reported for completeness; I do not consider it a defect.

**Not defects, checked and cleared.** `recordRefinementGate:714` (advisory, no verdict
channel, explicitly fail-open) and the liveness read at `:1828-1831` (fail-open with an
age backstop that still guards). Both state their trade-off in the code.

So: **finding none was not the result.** Four siblings found, one fixed, three
reported with the reason each is out of scope.

## What this slice does NOT fix

1. **It does not loosen `isSafePlanSlug` by one character.** The rejection rule is
   correct; only its silence is wrong.
2. **It does not fix sites B, C, D or E above.** Each is named with its location and
   its reason for exclusion, for the human to schedule.
3. **It does not persist the skipped list.** The Agent-area message is transient. It
   is also repeatable — the plan stays in `todo/` and is re-walked on every start — so
   the human cannot miss it by looking away once. A durable refusal log is a separate
   surface.
4. **It does not change what a *resolvable* dependency does.** A satisfied dependency
   still adds no blocker; a live one still contributes its task id; a safe-but-missing
   one still throws with today's message, word for word.
5. **It does not touch `completeExecution`, `completeTaskPlan`, `startExecution`,
   `approvePlan`, or the registry.** Nor `src/lib/iron-loop.js`,
   `src/lib/real-path-confinement.js` or `src/lib/plan-coverage.js`.
6. **It does not audit other modules** for silent drops. The survey covered
   `src/lib/actions.js`, as instructed.

## Implementation Details

### Dependency graph

```
isSafePlanSlug (:1049, UNCHANGED predicate)
      │
      └──used by──> planDependsOn (:1295, return shape CHANGES)
                          │
                          └──only caller──> taskSpecFromPlan (:1355, REFUSES on refused[])
                                                  │
                                    ┌─────────────┴─────────────┐
                            startAgent (:1455)          advanceAgent (:1569)
                                    └──── skipped[] ────┬──────┘
                                                        │
                                       src/areas/agent.js handleKey (:67, NEW read)
                                                        │
                                              the human pressing `g`
```

No cycle. No new export. No orphan: the one new surface is read by the one live route.

### File: `src/lib/actions.js`
**Action:** MODIFY — `planDependsOn`'s return shape and its single caller's guard
**Purpose:** "I could not read the dependencies" stops being spelled the same way as
"there are no dependencies".

1. **`planDependsOn(plan)` returns `{ slugs: string[], refused: string[] }`** instead
   of a bare array. Module-private, one caller, so no export changes and nothing dead
   is created.
   - `raw == null` → `{ slugs: [], refused: [] }`. Absent is still absent.
   - The `none` sentinel is dropped into neither list — it is a declaration of no
     dependencies, not a refusal. `depends_on: none` must remain indistinguishable
     from an absent key, and Step 8 pins that.
   - Every remaining token is partitioned: passes `isSafePlanSlug` → `slugs`; fails →
     `refused`, **verbatim**, uncleaned (sanitising is the message builder's job, at
     the point of display, not the parser's).
   - Pure. Never throws. No filesystem access. No path is built from a refused token
     at any point — the partition is a string test only.
2. **A block comment above the function** replacing `:1299-1305`. It states: the
   rejection rule is a path-traversal guard and must not be widened; a refused token
   is reported, never accepted and never dropped; and the reason the old silent drop
   was wrong, in one sentence, so the next author does not restore it as a
   simplification.
3. **`taskSpecFromPlan` (`:1355`) refuses BEFORE resolving anything.** Read
   `{ slugs, refused }`; if `refused.length > 0`, throw immediately — ahead of the
   `taskRegistry.load` at `:1352` and every `existsSync` at `:1363`. Refusing first is
   what keeps the existence-oracle guarantee trivially true rather than argued: a
   refused token cannot reach a probe because no probe has run yet.
   The message must contain, in this order: the plan name; the words *dependency list
   unreadable*; the count of refused tokens; and up to **three** refused tokens, each
   passed through the module's control-character strip and truncated to 40 characters
   (matching the existing truncation at `:1064`), with a `+N more` tail beyond three.
   It must state that the tokens were **refused as unsafe** and that the fix is to
   correct the plan's `depends_on` — never to relax the check.
   Then iterate `slugs` with the existing loop body, **unchanged**: registry lookup,
   `done/`/`review/` probe, and today's throw for a safe-but-unresolvable dependency
   with today's exact wording.
4. Update the `taskSpecFromPlan` JSDoc (`:1309-1331`) — the `blockedBy` bullet gains
   the refusal case, and `@throws` names it.

**Nothing else in this file changes.** Not `isSafePlanSlug`, not `planDeclaredFiles`,
not `parseDependsOn`, not `listSubplans`, not `topoOrderByDependsOn`, not
`completeTaskPlan`, not the `skipped[]` plumbing in `startAgent`/`advanceAgent` — that
plumbing already carries the message and needs no edit.

### File: `src/areas/agent.js`
**Action:** MODIFY — `handleKey`, the `g` branch only
**Purpose:** A refused plan says so to the person who pressed the key.

1. Add a module-private `summarizeSkipped(skipped)` → `string`. `''` when the argument
   is not a non-empty array (defensive: some `startAgent` returns omit the field).
   Otherwise `" — N plan(s) skipped: <first plan name> (<first reason>)"`, plus
   `+N more` when there is more than one. The plan name and the reason both go through
   the already-imported `stripCtl`, and the whole suffix is capped at 160 characters so
   one hostile plan cannot blow up the status line.
2. Append the suffix to the `started`, `queued` and `error` branches. The
   `drainStopped` branch is untouched (nothing was walked, so nothing was skipped).
   The final `else` gains the suffix too — "Nothing to start (todo queue empty)" is
   reachable with a non-empty `skipped[]`, and that combination is precisely the
   invisible case.
3. **The existing message text of every branch is preserved verbatim**; the suffix is
   appended. No branch changes its condition, and the `x` branch is not touched.

The reason strings are already bounded at their source, so the cap is a second belt,
not the only one.

### File: `tests/an-unreadable-dependency-list-refuses-the-plan.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe`/`it`/`assert`), temp-directory fixtures in the
style of `tests/actions-scheduler.test.js:31-69` (two-block gated frontmatter, so the
merged-frontmatter reader is under test, not a simplified plan).

| # | Case | Assertion |
|---|---|---|
| 1 | **unreadable ≠ empty — the whole slice** | in ONE case: a plan with no `depends_on` key builds a spec with `blockedBy: []`; a plan with `depends_on: ../../../../etc/passwd` **throws**. Assert both, and assert the two outcomes differ in KIND, not merely in text. A fix that only logs and still returns a spec fails here |
| 2 | `depends_on: none` is empty, not refused | builds a spec, `blockedBy: []`, no throw — the sentinel is a declaration, not a fault |
| 3 | an absent `depends_on` key is empty | builds a spec, `blockedBy: []` |
| 4 | each unsafe shape refuses | parameterised over the three shapes at `:147-151` (dotdot traversal, NUL byte, path separator); each throws |
| 5 | **a valid dependency beside an unsafe one still refuses** | `depends_on: '../../../../etc/passwd live-dep'` throws even though `live-dep` is live and resolvable. Partial success is the defect in miniature |
| 6 | the refusal names the plan, the count and the token | message matches the plan name, `/dependency list unreadable/`, the count, and a truncated form of the token |
| 7 | the refusal instructs fixing the plan, never the check | message does NOT match `/isSafePlanSlug/` and does not suggest allowing the token; it DOES name `depends_on` |
| 8 | **no `existsSync` probe leaves the root, and none happens at all for a pure refusal** | wrap `safeFs.existsSync` as at `:158-166`; for an all-unsafe `depends_on` the recorded call list contains no dependency probe, proving refusal precedes resolution |
| 9 | the refused token is never joined into a path | no recorded argument contains the token's distinctive substring |
| 10 | `startAgent` records the refusal in `skipped[]` and claims the NEXT plan | two todo plans, the head unreadable; head appears in `skipped[]` with the reason, the second is claimed, `started === true` |
| 11 | `advanceAgent` behaves identically | the mirror of case 10 |
| 12 | the refused plan stays in `todo/` | it is not moved to `in-progress/`, and no registry task is created for it |
| 13 | a safe-but-unresolvable dependency throws with TODAY's message | the existing behaviour, pinned so this slice does not disturb it |
| 14 | a satisfied dependency still adds no blocker | unchanged behaviour, pinned |
| 15 | **the Agent area shows the refusal** | drive `agent.handleKey({ sequence: 'g' }, app)` against a stubbed `actions.startAgent` returning a realistic refusal; assert `app.message` names the skipped plan AND carries the reason. The stub replaces only the boundary function, never the logic under test |
| 16 | the summary is bounded and control-stripped | a skipped entry whose plan name carries an escape sequence and whose reason is 5000 characters produces a message with no control characters and within the cap |
| 17 | an empty or absent `skipped` changes no message | the four existing message texts are byte-identical to today's when nothing was skipped |

Case 1 is the case the brief named, and case 17 is what proves the rest of the surface
did not shift underneath it.

### File: `tests/actions-scheduler.test.js`
**Action:** MODIFY — the four assertions at `:146-200` that pin the silent drop
**Purpose:** Follow the corrected contract; tighten, never loosen.

- `:154-177` — the parameterised `SKIPS an unsafe depends_on token` case. Rename to
  state the new truth (*REFUSES the plan*), change `spec = taskSpecFromPlan(...)` to
  an `assert.throws`, and **keep the out-of-root `existsSync` loop exactly as it is**
  — it is the security assertion and it must still pass, now over a call list that is
  shorter rather than merely clean.
- `:180-192` — `a VALID depends_on beside an unsafe token still resolves`. This is the
  assertion whose premise this slice reverses: it now REFUSES. The comment
  *"the unsafe token is silently skipped"* is replaced with one naming the refusal.
- `:194-199` — unchanged. A normal `depends_on` is unaffected, and its staying green
  is the no-regression evidence.
- The `describe` heading at `:146` is retitled from *path-traversal guard* to name the
  refusal, since the guard is now reported rather than silent.

**No other case in this 500-line file is touched.** If an unrelated case turns red,
the code is wrong, not the case.

### File: `tests/caller-error-is-not-a-verdict.test.js`
**Action:** MODIFY — one case, and ONLY IF the file exists
**Purpose:** Retire a deliberately-pinned known loss when the loss is repaired.

Plan 00131 ships this file with a case (its blueprint's case 15) that pins
`planDependsOn`'s silent drop and carries a comment naming it as a known, unfixed loss
pointing at 00131's "does NOT fix" section. That case asserts exactly the behaviour
this slice repairs, so it goes RED the moment this lands.

Step 9 checks whether the file exists. **If 00131 has not shipped, the file does not
exist and nothing is done to it** — it is declared so that coverage permits the edit
if it is there, not because its existence is assumed. If it does exist, that one case
is inverted to assert the refusal, and its comment is replaced with a pointer to this
plan. **No other case in that file is read or changed.** If its pinning case has
moved or is worded differently than 00131's blueprint describes, record the
discrepancy and follow the file, not this plan.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `planDependsOn`'s `{ slugs, refused }` | `taskSpecFromPlan` (`src/lib/actions.js:1355`) | `/ctoc:menu` → Agent area → `g`, via `startAgent`/`advanceAgent` |
| the refusal throw | `startAgent:1456` / `advanceAgent:1570` catch → `skipped[]` | the same key press |
| `summarizeSkipped` | `agent.handleKey` `g` branch (`src/areas/agent.js:67-80`) | `/ctoc:menu` → Agent area → `g` |
| the new cases | the suite | `npm test` |

Every new function has a live caller in this slice, and the chain terminates at a key a
human presses. Nothing is added that only a test calls.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Write `tests/an-unreadable-dependency-list-refuses-the-plan.test.js` and run ONLY that
file before touching `src/`. Cases 1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15 must be **RED**.
Case 1's red is the defect stated as an assertion — record its output verbatim, because
it is the evidence that the two inputs currently produce the same answer. Cases 2, 3,
13, 14, 16, 17 must be **GREEN immediately** on unchanged code; they are the
no-regression guarantees and their staying green is the whole safety argument.

Then run `tests/actions-scheduler.test.js` unmodified and record its output: it must be
GREEN, because it currently pins the defect. Record that too. A test suite that is
green on the defect and red on the fix is the thing being corrected, and both halves
belong in the record.

### Step 9: PREPARE
Read from disk, in full: `src/lib/actions.js` — `isSafePlanSlug` (`:1040-1053`),
`planDeclaredFiles` (`:1262-1286`), `planDependsOn` (`:1288-1307`), `taskSpecFromPlan`
(`:1309-1380`), `startAgent` (`:1382-1500`), `advanceAgent` (`:1527-1606`),
`parseDependsOn` (`:1928-1940`), `listSubplans` (`:1942-1996`),
`topoOrderByDependsOn` (`:1998-2040`) and `module.exports` (`:2102-2135`). Then
`src/areas/agent.js` in full (95 lines).

**Every line number in this plan was measured before two other plans edited this file.
Re-measure all of them and record every discrepancy. Where the code disagrees with
this plan, the code wins.** Specifically confirm: `planDependsOn` is still not
exported; `taskSpecFromPlan` is still its only caller; `skipped[]` is still unread
outside `src/areas/agent.js`; and `isSafePlanSlug`'s predicate is still what this plan
quotes.

Enumerate every call site of `taskSpecFromPlan` across `src/` and `tests/`. Check
whether `tests/caller-error-is-not-a-verdict.test.js` exists and, if so, locate its
pinning case. Settle the file-conflict question in "Ordering and file conflicts" before
writing a line.

### Step 10: IMPLEMENT
One step, files as sub-items.
- `src/lib/actions.js` — `planDependsOn`'s `{ slugs, refused }` partition and its new
  block comment; `taskSpecFromPlan`'s refuse-before-resolve guard and message; the
  JSDoc update.
- `src/areas/agent.js` — `summarizeSkipped` and its four call sites in the `g` branch.
- `tests/an-unreadable-dependency-list-refuses-the-plan.test.js` — the seventeen cases.
- `tests/actions-scheduler.test.js` — the four measured assertions.
- `tests/caller-error-is-not-a-verdict.test.js` — one case, only if the file exists.

*(Five files is above the one-to-three sizing. They are one unit: a return-shape
contract, the one production caller that must refuse, the human surface that makes the
refusal visible, and the two existing test files that pin the old behaviour and go red
the instant the contract changes. Splitting them leaves the suite red between two
slices, which is worse than one slightly large slice. The human surface in particular
cannot be deferred: a stricter return with no visible reason is a different failure,
not a smaller one.)*

### Step 11: REVIEW
Diff `isSafePlanSlug` and confirm it is **byte-identical**. If it moved by one
character, stop — the slice has inverted its purpose. Confirm no path is constructed
from any refused token on any path through the code. Confirm the refusal precedes
`taskRegistry.load` and every `existsSync`. Confirm the safe-but-unresolvable message
is word-for-word today's. Confirm the four Agent-area message texts are unchanged when
`skipped` is empty. Confirm no assertion in either existing test file was weakened, no
range widened, no case deleted, and that each changed assertion asserts strictly more
than it did.

### Step 12: OPTIMIZE
`planDependsOn` now allocates two arrays where it allocated one, once per plan per
scheduler walk — against a walk that reads every todo plan from disk. Confirm the
partition is a single pass, not a double `filter`, and that no message is built on the
success path (the refusal string must be constructed only when there is something to
refuse).

### Step 13: SECURE
The security surface is the whole point of this slice, so review it deliberately:
- **The traversal guard is intact and unwidened** — the predicate diffed at Step 11.
- **No new oracle.** The refused token is reported to the human who owns the plan
  file; it is never used to probe the filesystem. Confirm case 8's recorded call list
  contains no dependency probe for a refused plan.
- **No injection into the status line.** The token reaches a terminal, so `stripCtl`
  and the length cap are load-bearing, not cosmetic. Confirm both apply on every path
  and that the cap is applied AFTER stripping, not before.
- **No leak.** The message carries the plan name and the offending token — both from
  the human's own plan file — and never a filesystem path, a plan body, or a registry
  internal.
- Cross-platform: no separator is hardcoded; the token test is a character-class
  predicate, and any path built anywhere in the touched code uses `path.join`.

### Step 14: VERIFY
Run `node --test` on `tests/an-unreadable-dependency-list-refuses-the-plan.test.js`,
`tests/actions-scheduler.test.js`, `tests/actions-coverage.test.js`,
`tests/scheduler-enforced.test.js`, `tests/task-registry.test.js`,
`tests/task-reconcile.test.js`, `tests/greenfield-journey.test.js`,
`tests/subplan-decomposition.test.js`, and — if it exists —
`tests/caller-error-is-not-a-verdict.test.js`. Then the full gated run `npm test`;
record `tests`, `suites`, `pass`, `fail`, the zero-skipped counter and the coverage
line **verbatim**. The coverage floor may rise, never fall. Lint every changed file at
`--max-warnings 0`. Run the false-green fence and confirm no baseline entry was added
and no whitelist entry was created. **No git operations.**

Then drive the human path: the declared entry point, into the Agent area, with a todo
plan carrying an unreadable `depends_on`, and read the message off the screen. Record
it verbatim. If a human cannot read why the plan was refused, this slice is not done,
whatever the suite says.

### Step 15: DOCUMENT
The block comment above `planDependsOn` states the rule in full: an unreadable
dependency list is not an empty one; a refused token is reported and the plan does not
run; the rejection rule is a path-traversal guard and widening it to "fix" a refusal
would reintroduce the oracle this guard exists to close. Name the original defect in
one sentence so the next author understands the cost of restoring the silent filter as
a simplification. Document `summarizeSkipped`'s bound and why it exists. Update the
`taskSpecFromPlan` JSDoc contract for the new refusal.

### Step 16: FINAL-REVIEW
Report: the five paths; the Step 8 verbatim red for case 1 and the verbatim green of
the unmodified `actions-scheduler` suite; the re-measured line numbers from Step 9 with
every discrepancy against this plan; the Step 14 numbers verbatim and the Agent-area
message read off the real screen; the four sibling silent-drop sites (B, C, D, E) named
with locations, restated as recommendations for the human to schedule; an explicit
restatement of the six things this slice does NOT fix; and every decision taken under
ambiguity.

## Ordering and file conflicts

**`depends_on: 00131-a-mistaken-call-reads-as-a-verdict-about-the-plan,
00085-rejection-sends-a-plan-back-one-stage`.** Both sit in `todo/`, both declare
`src/lib/actions.js`, and both are `depends_on: none` — so the chain depth here is 2,
inside the limit. They are dependencies rather than mere conflicts for two reasons:
00131 edits `completeTaskPlan`'s guard returns in the same file and ships the test file
this slice must then update, and 00085 edits `rejectPlan` in the same file. Three
agents in one 2100-line file is how an edit gets clobbered.

There is a small irony worth stating plainly: **this plan's own `depends_on` line is
read by the very function it repairs.** Under the current code, a typo that made either
slug unsafe would cause this plan to start with its dependencies unread.

**Conflict — `src/areas/agent.js` is declared by
`plans/implementation/00086-a-registry-read-error-cannot-blank-the-dashboard.md`**,
which rewrites `handleKey`'s `g` branch to refuse under an unknown registry state and
adds an Unknown render block. That plan is in `implementation/`, **before Gate 2**, so
it cannot be a `depends_on` target — `taskSpecFromPlan` refuses a dependency with no
registry task that is not in `done/` or `review/`, which would make this plan
unstartable. It is therefore recorded as a conflict, not a dependency.

**Step 9 must settle it before a line is written.** If 00086 has shipped, build on its
`handleKey` and add the skipped suffix to whatever branches it left; the suffix is
additive and composes with a refusal branch. If 00086 is in flight in another
executor's hands, **STOP and report** — do not edit around it. If it has not started,
proceed and note in the Step 16 report that 00086 will need to preserve the suffix.

**Not declared and not to be touched:** `src/lib/real-path-confinement.js` and
`src/lib/plan-coverage.js` are under concurrent edit by another executor. Neither is
required by this slice.

## Decisions Taken Under Ambiguity

1. **Refuse to run, rather than warn and run.** A dependency exists to gate work; a
   gate that opens on unreadable input is not a gate. The cost is a stalled plan, and
   it is bounded: the FIFO walk continues past the refusal so nothing queued behind is
   blocked, and the refusal repeats on every start attempt so it cannot be missed once.
   Running a plan whose prerequisites were never checked can corrupt work in flight,
   and that is not undone by noticing later.

2. **The human-visible surface ships in THIS slice, not as a follow-up.** The brief
   named the failure mode exactly: refusal without a visible reason is a plan blocked
   forever in silence. `skipped[]` is currently read by nothing, so a stricter return
   alone would produce that failure. The surface is small — one helper and four
   appends — and the alternative is a well-tested invisible refusal.

3. **`{ slugs, refused }` rather than a throw from `planDependsOn` itself.** The parser
   is pure and has one caller; throwing from it would move the refusal decision into a
   function that has no business making it, and would make the mixed case (one valid
   token, one refused) impossible to describe. The caller owns the policy; the parser
   reports the facts.

4. **No new export, and no `planDependsOnResult` sibling.** 00131 correctly declined to
   add one because it would have been unwired and therefore dead. Here the caller is in
   the same file and is modified in the same slice, so the richer answer is consumed
   the moment it exists. `module.exports` does not change.

5. **`depends_on: none` stays empty, and is not a refusal.** It is a declaration of no
   dependencies — the shape most plans in this repository use, including both of this
   plan's own dependencies' frontmatter. Treating the sentinel as unreadable would
   refuse most of the queue. Pinned by case 2.

6. **A mixed list refuses the whole plan.** A plan declaring one valid and one
   unreadable dependency has an unreadable dependency list. Honouring the valid half is
   partial success, which is the defect in miniature — the plan would run with one
   prerequisite checked and one unknown. This reverses the premise of the existing
   assertion at `tests/actions-scheduler.test.js:190`, which is why that assertion is
   changed rather than kept.

7. **Refuse BEFORE resolving anything.** Ordering the refusal ahead of
   `taskRegistry.load` and every `existsSync` makes the no-oracle property true by
   construction instead of by argument, and case 8 asserts it against the recorded call
   list.

8. **The refused token is quoted back to the human, truncated and control-stripped.**
   Without the token the human cannot find the offending line; with it unbounded, a
   plan file could inject escape sequences into a terminal. Bounded at 40 characters
   per token, three tokens, 160 characters of suffix, stripped before capping —
   matching the existing truncation at `src/lib/actions.js:1064`.

9. **The skipped summary is transient, not persisted.** A durable refusal log is a new
   surface with its own lifecycle. The refusal is deterministic and recurs on every
   start attempt, so a transient message is honest and repeatable. Named in "does NOT
   fix" so the human can schedule the durable version if the transient one proves
   insufficient.

10. **The four sibling sites are reported, not fixed.** Site B is a wrong reason on a
    path that already fails closed; site C changes batch-approval parsing; site D is a
    Gate-2 enumeration question; site E affects ordering only. Each has its own blast
    radius, and scheduling belongs to the human. Bundling them would turn a scheduler
    fix into an open-ended audit of a 2100-line file.

11. **`tests/caller-error-is-not-a-verdict.test.js` is declared but conditionally
    edited.** It may not exist when this slice runs. Declaring it costs nothing and
    prevents a coverage refusal at exactly the wrong moment; assuming its contents
    would be a guess, so Step 9 reads it and the file wins over this plan.

12. **The existing out-of-root `existsSync` assertion loop is kept verbatim.** It is
    the security fence, it still passes, and rewriting it while changing the behaviour
    it guards would make it impossible to tell a preserved guarantee from a rewritten
    one.
