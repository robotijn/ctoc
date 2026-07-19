---
approved_by: human
approved_at: 2026-07-19T18:15:13.919Z
gate_crossed: implementation → todo
---

---
title: "Git exclusivity is undefended on the one path that starts work — and the third instance of an oracle tested exhaustively while the projection beside it is tested thinly"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00099-the-most-safety-critical-file-becomes-searchable-again
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "tests/scheduler-guarantees-under-mutation.test.js"
---

# Git exclusivity is undefended where work actually starts

## The defect, verified by reading both sides

The scheduler has two entry points, and they are not the same thing:

| Function | Line | What it is |
|---|---|---|
| `canRun(candidate, registry)` | `task-registry.js:884-889` | the **oracle** — may this one candidate run right now? |
| `nextRunnable(registry)` | `:904-916` | the **promotion projection** — the set that actually gets started |

Both delegate to `evaluateConcurrency` (`:838-868`), whose ladder is
`1 max-concurrent → 2 sync-barrier → 3 git-exclusive → 4 file-conflict`. Rule 3, at
`:848-853`, has two clauses:

```js
if ((candidate.gitOp && running.some(t => isEditing(t) || t.gitOp)) ||
    (isEditing(candidate) && running.some(t => t.gitOp))) {
  return { run: false, reason: 'git-exclusive' };
}
```

An executor's systematic audit disabled each rule **on the promotion path only** and
ran 319 scheduler assertions. Every rule went red except this one: **deleting Rule 3
from the promotion path leaves all 319 green.**

Confirmed by reading the tests. Every `nextRunnable` call in the suite that involves
a git flag makes its candidate `kind: 'sync'`:

- `tests/scheduler-guarantees-under-mutation.test.js:209, :236, :262, :274` — every
  barrier is `kind: 'sync', gitOp: true`;
- `tests/actions-scheduler.test.js:379-381` — the candidate is a sync;
- `tests/promote-quarantine-parity.test.js:305-320, :361, :369` — no git candidate.

Rule 2 fires on a sync before Rule 3 is ever reached. **The one promotion-path case
that looks like a git test is a sync-barrier test wearing a git flag.** Every genuine
git candidate in the suite is tested through the oracle instead.

## What is actually unprotected

`nextRunnable` folds each accepted candidate into `projected` (`:912`) before
evaluating the next, so the returned set is meant to be **jointly startable**.
Without Rule 3 on that path, this set is returned as jointly startable:

- a queued editing task — `kind: 'implement'`, `touches: ['src/a.js']`;
- a queued non-sync git task — `kind: 'review'`, `gitOp: true`, `touches: []`.

Rule 4 cannot save it: the git task touches nothing, so there is no file overlap to
detect. Rule 1 cannot save it: two tasks is under the ceiling. Rule 2 cannot save
it: neither is a sync. **A commit would run concurrently with an edit**, which is
the exact hazard `isEditing` and `gitOp` exist to prevent — and it is the hazard the
human has already named as a standing rule about never running a git-operating agent
alongside an agent editing tracked files.

## The pattern matters more than the instance

**This is the third instance of one asymmetry today**: the oracle is tested
exhaustively while the projection that actually starts work is tested thinly. Two
gaps of this exact shape were closed earlier. So this slice has two jobs, and the
second is not optional:

1. defend the promotion path's git exclusivity;
2. **hunt for further instances of the same asymmetry, and report what is found —
   including finding none, stated as a result.**

A hunt that reports nothing because it never looked is worse than no hunt. The
method below is written down so the report can be checked rather than trusted.

## Implementation Details

### File: `tests/scheduler-guarantees-under-mutation.test.js`
**Action:** MODIFY — add Group C; change nothing existing
**Purpose:** The promotion path's git exclusivity gets its own defenders.

This file already carries the right rule in its header: *every case names the exact
source mutation it defends against — file, line, and the precise text to change*,
and *mutations are applied to a COPY of the module outside the working tree, never
to the tracked source in place, so no revert is ever self-attested*. Group C follows
both, unchanged.

Registries are built with the file's existing `mkReg` and `task` helpers, which
bypass `addTask` — needed here, since `addTask` refuses an `implement` task with
empty touches.

| # | Case | Registry (all queued, in this order) | Assertion | Mutation it kills |
|---|---|---|---|---|
| C1 | **a non-sync git candidate queued behind a queued editing candidate is NOT promoted** | `t1` implement, `touches:['src/a.js']`, `gitOp:false`; `t2` review, `touches:[]`, `gitOp:true` | promoted set is exactly `['t1']` | deleting the first clause of Rule 3 (`:851`) |
| C2 | **an editing candidate queued behind a queued git candidate is NOT promoted** | `t1` review, `touches:[]`, `gitOp:true`; `t2` implement, `touches:['src/a.js']` | exactly `['t1']` | deleting the second clause (`:852`) |
| C3 | **git does not run beside git** | `t1` review `gitOp:true` `touches:[]`; `t2` quality `gitOp:true` `touches:[]` | exactly `['t1']` | deleting `|| t.gitOp` from the first clause |
| C4 | **control — a read-only non-git task DOES run beside a git task** | `t1` review `gitOp:true` `touches:[]`; `t2` review `gitOp:false` `touches:[]` | both promoted | over-tightening Rule 3 to block every candidate beside a git task |
| C5 | **against a RUNNING git task, not just a queued one** | `t1` review `gitOp:true` `touches:[]` `status:'running'`; `t2` implement queued `touches:['src/a.js']` | promoted set is empty | a mutation that consults only the projected set and not the real running set |
| C6 | **the reason is git-exclusive, through the oracle, for the same registry** | C1's registry, asked via `canRun` | `{ run:false, reason:'git-exclusive' }` | pins that C1's refusal is Rule 3 and not Rule 4 or Rule 1 firing by accident |

C4 and C6 are what keep this group honest. C4 stops the fix from being "block
everything", which would pass C1-C3 while destroying concurrency. C6 proves the
refusals in C1-C3 come from the rule this group is named after — a case that asserts
"not promoted" without pinning *why* would stay green under a mutation that broke a
different rule.

**No production file changes.** Rule 3 is implemented correctly; it is simply
undefended on the path that starts work. Nothing in `src/` is edited by this slice.

### Wiring — the live call site

| change | live call site | root |
|---|---|---|
| Group C | `nextRunnable` / `canRun`, the real exported scheduler functions, called by `src/lib/task-reconcile.js` on every dashboard render | `npm test`, and `node src/commands/menu.js` |

The cases drive the real module through its real exports. Nothing is mocked, nothing
is re-implemented in the test.

## The mutation protocol — on a copy, never on the tracked file

A self-attested revert of live source is how a mutated scheduler ships. So:

1. copy `src/lib/task-registry.js` to a file under `os.tmpdir()`;
2. rewrite its relative requires to absolute paths into the real repository, so the
   copy loads the real dependencies — build each replacement with `path.join` and
   embed it with `JSON.stringify` so a Windows backslash cannot break the literal;
3. apply the mutation **to the copy**;
4. `require` the copy and run Group C against it;
5. record the verbatim output;
6. delete the temporary directory.

The tracked file is never written, so there is nothing to revert and nothing to
attest.

## The asymmetry hunt — method, so the answer can be checked

For **every** predicate in the scheduler and reconciler that exists in both an
oracle form and a promotion/projection form, apply the mutation to a copy on the
**projection side only** and record whether the suite goes red.

Enumerate at minimum:

| Predicate | Oracle side | Projection side |
|---|---|---|
| Rule 0 dependency gate | `canRun` → `depsSatisfied` | `nextRunnable:908` (the done-only path) |
| Rule 1 max-concurrent | `canRun` | `nextRunnable` via the projected set |
| Rule 2 sync-barrier | `canRun` | `nextRunnable` (Group B already covers this) |
| Rule 3 git-exclusive | `canRun` | `nextRunnable` — **this slice** |
| Rule 4 file-conflict | `canRun` | `nextRunnable` via cumulative `projected` touches |
| slot occupancy | `isOccupying` at `canRun`'s `runningTasks` | `nextRunnable:905` |
| the concurrent-edit quarantine | `task-reconcile.applyQuarantine` | the promote set it filters |
| the terminal-retention sweep | `task-reconcile` | Group A already covers this |

For each row record: mutation applied, whether the suite went red, and which case
caught it. **Report the whole table**, including every row where the projection was
already defended. "Nothing further found" is a useful result **when it is stated as
one, with the table behind it**; unstated, it is indistinguishable from not having
looked.

If the hunt finds a further instance, **do not fix it in this slice** — record it
with its registry shape and its mutation, and surface it for the human to schedule.
Widening this slice would put two unrelated guarantees in one unit of work.

## What this slice does NOT fix

1. **It changes no scheduler behaviour.** Rule 3 is already correct. This adds
   defenders, not a fix; if any production behaviour changes, the slice is wrong.
2. **It does not fix any further asymmetry the hunt finds.** Those are reported with
   their reproduction and left for the human to schedule.
3. **It does not automate mutation testing.** No mutation harness, no new tooling.
   The file's existing convention — each case naming its mutation, applied by hand
   to a copy — is followed exactly.
4. **It does not touch `src/lib/task-registry.js` or `src/lib/task-reconcile.js`.**
5. **It does not defend the reconciler's promote path** beyond what the existing
   parity tests already cover; that path has its own slice history.
6. **It does not add a case for every kind in the vocabulary.** The cases pin the
   rule, not the enumeration — a case per kind would grow with the vocabulary and
   defend nothing extra.

## Execution Plan (Steps 8-16)

### Step 8: TEST
Add Group C and run ONLY this file against the **unmutated** module first: all six
cases must be **GREEN**, because the rule is already implemented correctly. Green
from birth is not evidence, so immediately prove each case bites, using the copy
protocol above: apply each named mutation to a copy, run the file against the copy,
and record which cases go red for which mutation. **A case that does not go red for
its own named mutation does not belong in this file and is rewritten until it
does.** Record every output verbatim, including the pre-mutation green.

### Step 9: PREPARE
Read from disk: `src/lib/task-registry.js:780-920` in full (`isOccupying`,
`isEditing`, `runningTasks`, `depsSatisfied`, `evaluateConcurrency`, `canRun`,
`nextRunnable`), the kind vocabulary at `:136-139`, the status vocabulary at `:146`,
and the shape guards at `:571-640`. Read the whole of
`tests/scheduler-guarantees-under-mutation.test.js` (its header rule and its `mkReg`
/ `task` helpers), plus `tests/task-registry.test.js`,
`tests/actions-scheduler.test.js` and `tests/promote-quarantine-parity.test.js` —
enough to confirm no existing case already covers a non-sync git candidate through
the promotion path. If one does, **say so and stop**: the premise of this slice
would be wrong and that is a finding, not an obstacle. Where the code disagrees with
this plan, the code wins — record the discrepancy.

### Step 10: IMPLEMENT
One step, one file.
- `tests/scheduler-guarantees-under-mutation.test.js` — Group C, six cases, each with
  a comment naming file, line and the exact text its mutation changes, matching the
  file's existing convention.

### Step 11: REVIEW
Confirm Groups A and B are untouched and still green. Confirm every Group C case
names a mutation and was **observed** red under it. Confirm the cases use the real
exported functions with no mock and no re-implementation of the ladder. Then run the
asymmetry hunt and fill in its table completely.

### Step 12: OPTIMIZE
Pure in-memory registry literals, no disk, no sleeps, no wall-clock dependence, no
platform branch — matching the file's stated discipline. Confirm the added runtime is
negligible.

### Step 13: SECURE
The copy protocol writes only under `os.tmpdir()` and removes the directory on every
exit path, including a failed assertion. The rewritten requires resolve only into the
real repository under `path.join(__dirname, '..')`; no external input reaches a
`require`. Confirm the tracked source file's modification time is unchanged after
the whole procedure — that check is the evidence that nothing was edited in place.

### Step 14: VERIFY
Run `node --test` on `tests/scheduler-guarantees-under-mutation.test.js`,
`tests/task-registry.test.js`, `tests/task-registry-coverage.test.js`,
`tests/actions-scheduler.test.js`, `tests/promote-quarantine-parity.test.js`,
`tests/task-reconcile.test.js` and `tests/task-reconcile-coverage.test.js`. Then the
full gated run `npm test`; record `tests`, `suites`, `pass`, `fail`, the zero-skipped
counter and the coverage line verbatim. The coverage floor must not be lowered. Lint
the changed file at `--max-warnings 0`. No git operations. Confirm
`git status` is not consulted and no working-tree file other than the declared one
differs — by reading modification times, not by running git.

### Step 15: DOCUMENT
Extend the file header: Group C's subject, and the finding that the promotion path
had no git-exclusivity defender because every git-flavoured promotion case in the
suite made its candidate a sync and stopped at Rule 2. State the general lesson in
one sentence — an oracle and the projection beside it are different code paths and
each needs its own defenders — so the next author checks both.

### Step 16: FINAL-REVIEW
Report the path, the Step 8 verbatim pre-mutation green and every per-mutation red,
the completed asymmetry-hunt table with a row for every predicate examined and an
explicit statement of what was and was not found, the verbatim green from Step 14,
an explicit restatement of the six things this slice does NOT fix, and every decision
taken under ambiguity.

## Ordering and file conflicts

**`depends_on: 00099-the-most-safety-critical-file-becomes-searchable-again`.** The
asymmetry hunt is a codebase-wide survey whose headline result may be "nothing
further found". That result is only worth stating if the search tool was capable of
looking everywhere; until the unsearchable source file is repaired, it was not.

No sibling in this batch declares `tests/scheduler-guarantees-under-mutation.test.js`
or any scheduler source file. The concurrently-edited `src/lib/reachability.js` is
not involved.

## Decisions Taken Under Ambiguity

1. **No production file is edited.** The rule is correct; the gap is in the
   defenders. Touching `task-registry.js` would risk a real regression to close a
   test gap.
2. **The mutation is applied to a copy outside the working tree.** The file's own
   header already requires this. A self-attested revert of live source is how a
   mutated scheduler ships, and the modification-time check at Step 13 makes the
   claim checkable rather than trusted.
3. **The copy's relative requires are rewritten to absolute repository paths.** A
   naive copy into a temporary directory cannot resolve `./plan-coverage` and would
   fail for a reason unrelated to the mutation, which would read as "the mutation
   was caught". Paths are built with `path.join` and embedded with `JSON.stringify`
   so a Windows separator cannot break the literal.
4. **C4 exists to stop over-tightening.** Without a control, the cheapest way to
   pass C1-C3 is to refuse every candidate beside a git task, which would pass the
   group and destroy concurrency. The rule's own comment says a read-only non-git
   task may run alongside a git task, and C4 pins that.
5. **C6 pins the reason, not just the refusal.** A case asserting only "not
   promoted" stays green under a mutation that breaks a different rule, which is the
   failure mode this whole slice exists to correct.
6. **The candidate kinds are chosen from the real vocabulary, and `mkReg` is used to
   build them.** `addTask` refuses an `implement` task with empty touches; the
   registry literals sidestep that exactly as the file's existing groups do.
7. **The hunt reports rather than fixes.** Scheduling belongs to the human, and a
   slice that closes one gap and opens a second guarantee is no longer one unit of
   work.
8. **"Nothing further found" is an acceptable outcome, if the table is shown.** The
   value of a negative result is entirely in the method behind it, which is why the
   method is written into the plan rather than left to the executor.
