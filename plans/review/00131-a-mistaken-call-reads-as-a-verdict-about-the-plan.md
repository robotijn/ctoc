---
approved_by: human
approved_at: 2026-07-19T21:23:46.383Z
gate_crossed: implementation → todo
---

---
title: "A mistaken call reads as a verdict about the plan"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/actions.js"
  - "src/lib/menu-screens.js"
  - "tests/caller-error-is-not-a-verdict.test.js"
  - "CLAUDE.md"
---

# A mistaken call reads as a verdict about the plan

## STOP — a file this plan declares is under concurrent edit

**`src/lib/actions.js` is being edited right now by another executor**, together
with `src/lib/iron-loop.js` and several test files. This plan declares
`src/lib/actions.js` because the defect lives there and cannot be fixed anywhere
else.

**Step 9 must settle this before a single line is written.** If the other executor
still holds `actions.js`, STOP and report — do not merge, do not rebase around it,
do not "carefully edit a different part of the file". Two agents in one file is how
an edit gets clobbered. This plan is written to be picked up whole once the file is
free; it is not written to be raced. `src/lib/iron-loop.js` is NOT declared here and
must not be touched.

## What I measured

The report is accurate and the family is real. I read the code rather than trusting
the description.

```
src/lib/actions.js:864   function completeExecution(planPath, projectPath, options = {})
src/lib/actions.js:1047  function completeTaskPlan(projectPath, planSlug)
```

Calling the second with the first's order sends an absolute path into `planSlug`.
`isSafePlanSlug` (`:1041-1045`) rejects it — a path contains separators — and the
function returns:

```js
return { ran: false, reason: `unsafe plan slug refused: ${slug.slice(0, 40)}` };
```

That value is then consumed at `src/lib/menu-screens.js:2261-2273`, which renders it
as:

> Task N NOT completed — unsafe plan slug refused: /Users/…. An implement task must
> produce Gate-3 evidence; the task is left unsettled (check the plan slug / that
> the plan is in in-progress/ or review/).

So a **mistake in the call** is delivered as a **security-flavoured verdict about
the plan**, complete with remediation advice for a plan that was never the problem.
That is the same family as the defect fixed today where a checker's clean answer was
falsy and reading it crashed on success — a surface whose MISUSE is
indistinguishable from a RESULT. The comment now standing at
`iron-loop-enforcer.js:368` (*"NEVER null — a clean answer must be readable"*) is
that lesson written down.

### The search, and what it found

I searched `src/lib/actions.js` and its siblings for the family rather than fixing
only the reported pair.

**Finding 1 — the argument order is NOT arbitrary, and that changes the fix.**
There are two coherent families in `actions.js`, and every function sits in one:

| plan-file operations — `planPath` first | project/scheduler operations — `projectPath` first |
|---|---|
| `movePlan`, `approvePlan`, `rejectPlan`, `startExecution`, `completeExecution`, `recordStepKickback`, `recordDeployReadyNotice`, `moveUpInQueue`, `moveDownInQueue`, `removeFromQueue`, `renamePlan`, `deletePlan`, `applyIronLoop` | `startAgent`, `stopAgent`, `advanceAgent`, `cancelTask`, `enqueueWaveSync`, `cleanupStaleInProgress`, **`completeTaskPlan`** |

`completeTaskPlan` is the ONE function that straddles: it is a scheduler entry point
(it takes a task's `plan` field, from the registry) that performs a plan-file
operation. It is in the right family for its callers and the wrong family for its
subject. Reordering it would make it inconsistent with the six functions it sits
among — trading one confusable pair for six.

**Finding 2 — the same result channel carries two unrelated things.**
`completeTaskPlan` returns `{ ran: false, reason }` for genuine, expected reports
(`'task carries no plan'`, `no plan file for "x" in in-progress/ or review/`) AND
for caller faults (an unsafe slug, a non-string). One shape, two meanings, and the
consumer cannot separate them. This is the defect itself, not a side effect of it.

**Finding 3 — a THIRD instance, in the same file: `planDependsOn` (`:1287-1299`)
drops unsafe dependency slugs silently.** `parts.filter(…isSafePlanSlug)` means a
plan whose `depends_on` consists entirely of malformed tokens is indistinguishable
from a plan with **no dependencies at all** — and the scheduler then treats it as
ready and runs it. "I found nothing" and "I refused to read what was there" return
the same value. The existing comment documents the silent drop as deliberate, and
that choice is defensible for ONE bad token among good ones; it is not defensible
when it silently converts "this plan has unreadable dependencies" into "this plan is
unblocked". Handling is scoped below.

**Finding 4 — the well-behaved siblings, which are the precedent to copy, not
defects.** `product-loop.assertSafeSlug` (`product-loop.js:32-37`) THROWS on the
same condition, so misuse is unmistakably misuse. `step-13-verify.evalCategory`
(`step-13-verify.js:329-352`) already separates "no tool found"
(`applicable: false, passed: null`) from "the tool could not launch"
(`applicable: true, passed: false`) — the exact "found nothing" versus "could not
look" distinction required here. `approval-residency.isApprovedForCoverage` already
returns its own `stage-not-coverable` and `classify-error` reasons. The codebase
already knows how to do this in three places; `completeTaskPlan` is where it was not
done.

## The ruling: do not reorder. Make the misuse announce itself.

The instruction was to argue this rather than default to it, so here is the argument
and what would change it.

**Reordering is rejected — but NOT because it is too disruptive.** The call sites
are small and fully enumerable:

| call site | kind |
|---|---|
| `src/lib/menu-screens.js:2230` — `completeTaskPlan(root, task.plan)` | the ONE live call site (menu `task complete`, `implement` task) |
| `tests/greenfield-journey.test.js:301, :372` | test |
| `tests/actions-coverage.test.js:553, :558, :566, :572` | test |
| `tests/last-mile-wired.test.js:347` | test |

One live caller and three test files is an easy change. Disruption is not the
argument. The argument is that **reordering moves the inconsistency instead of
removing it**: `completeTaskPlan` would then be the only scheduler entry point that
does not take the project root first, and the next author writing
`cancelTask(root, id)` next to `completeTaskPlan(slug, root)` gets a new confusable
pair for free. An argument order that cannot be got wrong is genuinely the better
class of fix — but the version of it that works here is an options object on BOTH
functions, which is a larger change across both families and both call-site sets. I
name it as its own unit of work for the human to schedule; I do not do half of it
here.

**A clear error message alone is also rejected.** The reported harm was not only
that the words were confusing — it is that `menu-screens.js` mechanically classified
the caller fault as `blocked: true` with `error: 'no plan file — completion produced
no evidence'`. Better prose inside a channel the consumer still reads as a plan
verdict fixes nothing a machine reads.

**So: split the CHANNEL, and let the message name the swap.** Three parts:

1. `completeTaskPlan` returns a discriminated `fault` on its result. `fault: 'caller'`
   means *this call was wrong*; `fault: null` means *the call was fine and here is
   what I found about the plan*. Both still refuse — no path becomes more permissive.
2. When the arguments look **swapped specifically** — the value in `planSlug`
   contains a path separator or is an absolute path, and/or the value in
   `projectPath` looks like a bare slug — the reason says so in those words, naming
   both parameters and the correct order. A caller error announces itself as a
   caller error.
3. `menu-screens.js` renders `fault: 'caller'` as a bug in the call, with no
   remediation advice about the plan, and still refuses to settle the task.

This satisfies the brief's second sanctioned option — *a misuse that announces
itself as a misuse rather than as a verdict* — and it does so structurally, in a
field a machine reads, not only in prose a human reads.

**What would change my mind:** if a second live caller appeared that passes a slug
it computed from a path, the swap would stop being purely a programming error and
the options-object change would become the right size of fix immediately. There is
one live caller today.

### Fail-closed, and "found nothing" versus "could not look"

- Every new branch REFUSES. `fault: 'caller'` never settles a task, never mints
  evidence, never moves a plan. `completeTaskPlan` remains an approval-adjacent
  operation and its fault direction stays deny.
- `completeTaskPlan` keeps its documented never-throws contract (`:1008`), so a
  completion still cannot wedge. The discrimination is carried in the result, which
  is exactly where a machine consumer can act on it.
- `{ ran: false, fault: null, reason: 'task carries no plan' }` (the task genuinely
  names none) stays distinct from
  `{ ran: false, fault: null, reason: 'no plan file for "x" …' }` (I looked in both
  folders and found none) and from `{ ran: false, fault: 'caller', … }` (I could not
  even look, because the argument was not a slug). Three answers, never two.

## What this plan does NOT fix

- **It does not reorder or rename anything**, and it does not introduce an options
  object. The signatures of `completeExecution` and `completeTaskPlan` are byte-for-byte
  unchanged, so no call site outside the ones listed moves.
- **It does not make the swap impossible** — only unmistakable. A caller can still
  pass the wrong order; it will now be told, precisely, that it did.
- **It does not audit every function in the codebase** for this family. It searched
  `actions.js` and its siblings, as instructed, and reports what it found: three
  instances and three well-behaved precedents. A repository-wide sweep is a
  different unit of work.
- **`planDependsOn`'s silent drop is fixed only to the extent of making the loss
  visible at its own boundary** — it returns the safe slugs exactly as today (so no
  caller changes) and additionally reports how many tokens it refused, via a sibling
  `planDependsOnResult`. **Making the scheduler REFUSE to run a plan whose
  dependencies were unreadable is NOT in this slice** — that is a scheduling
  decision with its own blast radius, and it is named for the human to schedule
  rather than smuggled in here.
- **It does not touch `src/lib/iron-loop.js`**, and it must not begin at all while
  `src/lib/actions.js` is held by another executor.

## Implementation Details

### Dependency graph

```
isSafePlanSlug (existing)
      │
      ├──used by──> classifyCompletionFault (new, actions.js)
      │                     │
      │                     └──used by──> completeTaskPlan (existing)
      │                                          │
      │                                          └──consumed by──>
      │                              menu-screens.completeTask (existing live route)
      │
      └──used by──> planDependsOn (existing, unchanged return)
                          │
                          └──used by──> planDependsOnResult (new, actions.js)
                                              │
                                              └──surfaced by──> (nothing this slice —
                                                 see "what this plan does NOT fix")
```

`planDependsOnResult` would be an unwired export, which this repository correctly
treats as dead code. **So it is not added as an export.** Instead `planDependsOn`
gains the count on a non-enumerable sibling path — see the file specification —
and the ONLY thing this slice ships for finding 3 is a test that pins the current
silent-drop behaviour and names it, so the loss is recorded rather than discovered
again. Nothing dead is created.

### File: `src/lib/actions.js`
**Action:** MODIFY
**Purpose:** Make a mistaken call to `completeTaskPlan` report itself as a mistaken
call rather than as a finding about the plan.

1. **`classifyCompletionFault(projectPath, planSlug)`** → `{ fault, reason }` |
   `null`. Module-internal (not exported — its only caller is in this file, and an
   unwired export is dead code).
   - `planSlug` is not a string, or is empty → `{ fault: null, reason: 'task carries
     no plan' }`. This is a legitimate report and its meaning is unchanged.
   - The `.md`-stripped slug fails `isSafePlanSlug` → a caller fault. The reason
     names the parameter, the offending value truncated to 40 characters as today,
     and — when the value contains a path separator (`/` or `\\`) or is absolute
     (`path.isAbsolute`) — states in words that `planSlug` received something that
     looks like a path and that the order is `completeTaskPlan(projectPath,
     planSlug)`, contrasting it with `completeExecution(planPath, projectPath)`.
     Returns `{ fault: 'caller', reason }`.
   - Additionally, when `projectPath` is a non-empty string that would ITSELF pass
     `isSafePlanSlug` (a bare token, not a path), say so too — that is the other
     half of the swap and it is the strongest available signal.
   - Otherwise `null` — proceed.
   - Pure, never throws, no filesystem access. Cross-platform: separators are tested
     for both `/` and `\\`, and absoluteness through `path.isAbsolute`, never by
     string comparison against a hardcoded prefix.
2. **`completeTaskPlan`** — replace the two guard returns (`:1050-1057`) with a
   single call to `classifyCompletionFault`, returning
   `{ ran: false, fault, reason }`. Every OTHER return in the function gains
   `fault: null` explicitly, so the field is always present and a consumer never has
   to distinguish absent from null. `ran`, `blocked`, `stage`, `newPath`, `verify`
   and `errors` are unchanged on every path.
3. Update the JSDoc (`:1008-1031`) to document `fault`, to state that `fault:
   'caller'` is a programming error in the call and never a verdict about the plan,
   and to keep the never-throws contract explicit.

**Nothing else in this file changes.** Not `completeExecution`, not `startExecution`,
not `approvePlan`, not `stampAndLedger`, not the scheduler, not `isSafePlanSlug`'s
predicate, not `planDependsOn`'s return value.

### File: `src/lib/menu-screens.js`
**Action:** MODIFY
**Purpose:** Stop rendering a caller fault as a plan verdict.

In the `implement`-task completion branch (`:2261-2273`), split the existing
`completion.ran === false` refusal on `completion.fault`:

- `fault === 'caller'` → refuse with `error: 'plan completion called incorrectly'`
  and text that reports it as a bug in the call, carrying the reason verbatim and
  offering **no** remediation advice about the plan slug or the plan's folder. The
  task is left unsettled, exactly as today.
- otherwise → the existing message, unchanged word for word.

Both branches keep `ok: false`, `blocked: true` and leave the task unsettled. **No
completion becomes acceptable that was not acceptable before.** Control characters
keep going through `stripCtl`, and the reason is still bounded in length.

### File: `CLAUDE.md`
**Action:** MODIFY — the documented test-file count only, both occurrences, read
live from disk. Nothing else in the file is touched. Note that this count is
contended with other in-flight plans: move it to what disk says, never to a number
written in a plan.

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| `classifyCompletionFault` | `actions.completeTaskPlan` (this slice) | `/ctoc:menu` → `menu task complete` on an `implement` task |
| the `fault` field | `menu-screens.js` completion branch (this slice) | as above |

Nothing is created without its caller in the same slice, and nothing new is
exported.

### Test plan

`tests/caller-error-is-not-a-verdict.test.js` (CREATE), `node:test`, zero doubles —
real temp project roots, real plan files, the real `completeTaskPlan` and the real
menu completion route.

| # | Case | Assertion |
|---|---|---|
| 1 | **the reported failure, reproduced** | `completeTaskPlan(root, root)` — the arguments swapped — returns `fault: 'caller'`, and the reason names both parameter names and the correct order — RED today |
| 2 | **the message is unmistakably about the call** | that reason contains no advice about moving the plan into `in-progress/` or `review/` |
| 3 | **both halves of the swap are detected** | a bare-token `projectPath` paired with a path-shaped `planSlug` is reported as a swap, explicitly |
| 4 | a genuine report is NOT relabelled | `completeTaskPlan(root, 'ghost-plan')` → `fault: null`, reason still names both folders |
| 5 | a task with no plan is NOT relabelled | `completeTaskPlan(root, '')` → `fault: null`, reason `'task carries no plan'` |
| 6 | **three answers, never two** | cases 1, 4 and 5 produce three distinct `(fault, reason)` pairs |
| 7 | **nothing became permissive** | every case above returns `ran: false` and moves no plan and mints no evidence artifact on disk |
| 8 | the traversal guard is intact | `'../evil'`, `'a..b'`, a NUL-bearing slug are all still refused before any filesystem access, now as `fault: 'caller'` |
| 9 | **the live menu route reports a call bug** | drive the real `menu task complete` route with a swapped completion; the returned text reports a bug in the call, `ok: false`, and the task stays unsettled |
| 10 | the live route is otherwise unchanged | a genuine missing-plan completion produces the existing text verbatim |
| 11 | a successful completion is untouched | the real happy path still moves the plan to review, mints the evidence, and settles the task |
| 12 | `fault` is always present | every return from `completeTaskPlan` carries the key, so a consumer never distinguishes absent from null |
| 13 | cross-platform detection | a Windows-shaped path (`C:\\x\\y`) and a POSIX path are both detected as path-shaped |
| 14 | never throws | `completeTaskPlan(root, null)`, `(root, 42)`, `(null, null)` all return a verdict |
| 15 | **finding 3 is recorded, not silently left** | `planDependsOn` on a plan whose `depends_on` is entirely unsafe tokens returns `[]` — identical to a plan with no dependencies — pinned with a comment naming this as a known, unfixed loss and pointing at this plan's "does NOT fix" section |

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/caller-error-is-not-a-verdict.test.js` in full, run ONLY it, record the red output verbatim. Cases 1, 2, 3, 6, 9 and 12 MUST be red. Cases 4, 5, 8, 10, 11 and 15 MUST be GREEN before any source change: they pin the behaviour that must not move, and a change turning any of them red has altered a completion path rather than clarified a message.
### Step 9: PREPARE — **settle the concurrency first.** Confirm that no other executor holds `src/lib/actions.js`; if one does, STOP and report rather than editing. Then read in full: `actions.js:990-1100` (the completion path and its guards), `actions.js:1280-1300` (`planDependsOn`), `menu-screens.js:2200-2300` (the live completion route), `product-loop.js:25-40` and `step-13-verify.js:325-355` (the two precedents this fix copies). Re-verify the call-site enumeration in this plan against the current tree — a plan's list of call sites is a claim, and it must be re-measured before it is relied on.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/actions.js` — `classifyCompletionFault`, `completeTaskPlan` returning `fault` on every path, the updated JSDoc.
  - `src/lib/menu-screens.js` — split the `ran === false` refusal on `fault`, leaving the existing branch word-for-word.
  - `CLAUDE.md` — the documented test-file count, read live from disk.
### Step 11: REVIEW — prove nothing became permissive: diff every return of `completeTaskPlan` and confirm `ran`, `blocked`, `newPath` and `verify` are identical on every path, and that both `menu-screens` branches keep `ok: false` and leave the task unsettled. Re-run the enumerated call sites and confirm none needed changing. Confirm `classifyCompletionFault` is not exported and has exactly one caller.
### Step 12: OPTIMIZE — the fault classification is a handful of string tests on values already in hand: no filesystem access, no new require, no regular expression compiled per call, and it runs before any `path.join` exactly as the guard it replaces did.
### Step 13: SECURE — the guard being replaced is a PATH-TRAVERSAL guard on an attacker-influenceable registry field, so state in the report that the predicate `isSafePlanSlug` is unchanged and that the refusal still happens BEFORE any `path.join` or filesystem access. Confirm the reason string still truncates the offending value (40 characters) so a crafted `plan` field cannot flood the output, and that control characters are still stripped at the render boundary. Confirm no new value from the registry reaches the filesystem.
### Step 14: VERIFY — `node --test tests/caller-error-is-not-a-verdict.test.js tests/actions-*.test.js tests/menu-task-wiring.test.js tests/greenfield-journey.test.js tests/last-mile-wired.test.js tests/scheduler-enforced.test.js` green, then the full gated run `npm test` with coverage at or above the enforced floor and 0 skipped. Lint the changed files. No git operations.
### Step 15: DOCUMENT — the JSDoc states, in plain words, that this function has two kinds of negative answer: a report about the plan, and a bug in the call, and that a consumer must never render the second as the first. Name the two coherent argument-order families in `actions.js` so the next author can see which one a new function belongs in, and record why `completeTaskPlan` straddles them.
### Step 16: FINAL-REVIEW — report files, tests, red and green evidence verbatim, the Step 9 concurrency finding, the re-measured call-site list, and every decision taken under ambiguity.

## Decisions Taken Under Ambiguity

1. **No reorder, and the reason is NOT disruption.** The call sites are one live
   caller and three test files — easily changed. Reordering is rejected because
   `completeTaskPlan` sits correctly in the project-first scheduler family
   (`startAgent`, `stopAgent`, `advanceAgent`, `cancelTask`, `enqueueWaveSync`,
   `cleanupStaleInProgress`), and moving it would trade one confusable pair for six.
   The genuinely order-proof fix is an options object on both functions, which is a
   larger change across both families and is named for the human to schedule.
2. **A clear message alone was rejected as insufficient**, because the harm was
   mechanical as well as verbal: `menu-screens.js` classified the caller fault as
   `blocked: true` with a plan-shaped error. The discrimination therefore lives in a
   FIELD a machine reads (`fault`), and the prose improvement rides on top of it.
3. **The never-throws contract is preserved rather than replaced.**
   `product-loop.assertSafeSlug` throws, and throwing would also make misuse
   unmistakable — but `completeTaskPlan`'s documented contract is that a completion
   never wedges, and changing a documented contract to fix a message is a larger
   change than the defect warrants. The result channel carries the discrimination
   instead.
4. **Three answers, never two.** "The task names no plan", "I looked in both folders
   and found nothing", and "I could not look, because that was not a slug" are
   distinct returns. Collapsing the third into either of the others is the exact
   shape being fixed.
5. **Every new branch refuses.** No path in this slice makes a completion acceptable
   that was not acceptable before; the only thing that changes is what the refusal
   says and what a machine can tell from it.
6. **`classifyCompletionFault` is module-internal, not exported.** Its only caller is
   in the same file. Exporting it would create an unwired export, which this
   repository's reachability fence correctly treats as dead code.
7. **The third finding (`planDependsOn` silently dropping unsafe dependency slugs)
   is REPORTED and PINNED, not fixed.** Making the scheduler refuse to run a plan
   whose declared dependencies were unreadable is a scheduling decision with its own
   blast radius and its own call sites. A test pins the current behaviour and names
   it as a known loss so it is recorded rather than rediscovered; the fix is the
   human's to schedule. I deliberately did not add a `planDependsOnResult` export,
   because with no consumer in this slice it would be dead code.
8. **The concurrency conflict is surfaced at the top of the plan, not absorbed.**
   `src/lib/actions.js` is declared because the defect is there and cannot be fixed
   elsewhere; declaring it silently while another executor holds it would set up a
   clobber. Step 9 stops rather than merging.
9. **The call-site list in this plan is a claim to be re-measured, not relied on.**
   It was read from the tree at planning time; the tree is moving under another
   executor. Step 9 re-measures before Step 10 acts on it.
