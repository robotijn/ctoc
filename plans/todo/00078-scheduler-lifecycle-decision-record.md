---
approved_by: human
approved_at: 2026-07-19T07:40:42.663Z
gate_crossed: implementation → todo
---

---
title: "The scheduler lifecycle plan gets its decision record and its final report"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: 00075-wedge-reports-get-a-reader, 00077-quarantine-on-every-promote-path
priority: HIGH
program: ctoc-repair-loop
iron_loop: true
files:
  - "plans/review/00003-r2a-scheduler-lifecycle-honesty.md"
---

# The decision record and the final report get written

`plans/review/00003-r2a-scheduler-lifecycle-honesty.md` is sitting at Gate 3 with
two of its own commitments unmet.

1. **Line 93-94** — its `## Decisions Taken Under Ambiguity` section reads, in
   full:

   ```
   ## Decisions Taken Under Ambiguity
   (Executor fills in.)
   ```

   That is the unedited template placeholder. The executor made a series of
   load-bearing lifecycle decisions — several of which are now documented only as
   comments inside the source it changed — and recorded none of them where the
   reviewer reads them. Compare its sibling
   `plans/review/00013-r3b-scheduler-enforced-not-advisory.md`, which carries ten
   numbered decisions and a named list of bypasses it could not close.

2. **Line 91** — its own Step 16 says
   `### Step 16: FINAL-REVIEW — report files/tests/red-evidence/decisions.` No such
   report exists anywhere in the plan.

A gate decision made without the decision record is a decision made without the
evidence the gate exists to demand. This slice writes both sections from the
actual change on disk and from the in-code commentary the executor left behind.

**This slice edits one plan file. It writes no source, moves no plan, and stamps
no approval marker.**

## Ordering

It depends on `plans/implementation/00075-wedge-reports-get-a-reader.md`, which
corrects two false claims in the same plan file, and on
`plans/implementation/00077-quarantine-on-every-promote-path.md`, because decision
4 below records where the quarantine finally lives — a fact that is not settled
until that slice lands. Writing this record first would document an intention
rather than a diff.

## Implementation Details

### File: `plans/review/00003-r2a-scheduler-lifecycle-honesty.md`
**Action:** MODIFY
**Purpose:** Replace the placeholder decision record with the real one, and add the missing Step 16 report.
**Change type:** documentation — two sections

#### Change 1 — replace `(Executor fills in.)` with the real decision record

The source of truth is the code on disk plus the executor's own comments. Each
decision below names the lines it is derived from; the executor of THIS slice must
re-read those lines and write the decision from what is actually there, not from
this plan's paraphrase.

**Decision 1 — `cancelling` is a NON-terminal status, and `running → cancelled`
is forbidden.**
Derived from `src/lib/task-registry.js:140-146` (the `STATUSES` comment),
`:155-174` (the `VALID_TRANSITIONS` comment and table) and `:776-785`
(`OCCUPYING`). Record: a running task ordered to cancel enters `cancelling` and
keeps occupying its concurrency slot, its `touches`, its `gitOp` exclusion and the
sync barrier until the harness agent is **confirmed gone**. A direct
`running → cancelled` was rejected because the registry would free a live agent's
files while that agent is still editing them — the concurrency ladder's guarantees
are only as good as the moment the registry stops believing a task is running.
`queued → cancelled` stays immediate, because nothing is running and freeing is
safe. `cancelling → done` and `cancelling → failed` exist so a completion that
arrives during cancellation is recorded honestly rather than discarded.

**Decision 2 — `orphaned` is a SOFT terminal.**
Derived from `src/lib/task-registry.js:147-154` and the `orphaned: new Set(['done',
'failed'])` row at `:172`. Record: entering `orphaned` stamps `ts.done` and drops
the task off the concurrency count, but `orphaned → done` and `orphaned → failed`
remain legal, so a **falsely** orphaned agent that later finishes has its
completion **accepted, not dropped**. `done`, `failed` and `cancelled` are hard
terminals with no exit. The asymmetry is the whole point: orphaning is a guess
made from the absence of evidence, and a guess must be reversible by the arrival
of evidence. Record also that this contract was dead code until the stale terminal
mirror in `menu-screens.js` was replaced by the registry's own exported `TERMINAL`
— see decision 3 of `plans/review/00013-r3b-scheduler-enforced-not-advisory.md`.

**Decision 3 — the presumed-dead bound is the deadlock guard.**
Derived from `src/lib/task-reconcile.js:108-121` (the
`DEFAULT_PRESUMED_DEAD_MULTIPLE` comment) and `:389-410` (the across-passes
quarantine-release branch). Record the causal chain exactly as the code states it:
a staleness orphan's files stay reserved until its agent is **confirmed** dead;
confirmation requires a live agent-id list; **the default `/ctoc:menu` path passes
no `--live-agent-ids`**, so `liveAgentIds` is `null` on every pass and the
confirmed-dead signal can never fire. Without a second release path the
reservation would hold forever and any rival queued task touching those files
could never run — a permanent scheduler deadlock, strictly worse than the one-pass
bug it replaced, which at least made progress. The bound (twice the same
kind-aware staleness floor that produced the orphaning) keeps protecting a
plausibly-alive agent for one more full staleness window and then **always**
elapses. A task with an unparseable or absent `ts.started` is presumed dead at
once, which is also the only release path available to an orphan that never
recorded an agent id.

**Decision 4 — where the quarantine was placed, and why not in the scheduler.**
Derived from `src/lib/task-registry.js:773-916` (the scheduler section, opening on
the word `pure`) and the promote projection in `src/lib/task-reconcile.js`. Record:
the file reservation is enforced in the **promote projection**, never in `canRun`
or `nextRunnable`. The scheduler reads only `status`, `kind`, `touches` and
`gitOp`; teaching it to read `result.orphanReason` would make the concurrency
ladder's answer depend on *why* a task reached a status rather than on the status
itself, and would couple the ladder to the reconcile pass's private marker
encoding. Record the consequence honestly as well: because the guard sits outside
the scheduler, it has to be applied at every promote path, and as shipped it was
applied at only one of four — repaired by
`plans/implementation/00077-quarantine-on-every-promote-path.md`, with the
fail-safe behaviour of the guard itself repaired by
`plans/implementation/00076-quarantine-fault-fails-safe.md`.

**Decision 5 — the sync-barrier hazard is RECORDED AS A PRECONDITION, not fixed.**
Derived from `src/lib/task-registry.js:804-825` (`depsSatisfied`) and `:841-847`
(Rule 2). Record the hazard precisely: for a `sync` candidate a dependency
satisfies when its status is TERMINAL, and `orphaned` is in that terminal set — so
a task orphaned on **age alone**, whose agent may still be alive and editing,
counts as SETTLED and can let a wave-integration barrier through. Record why it is
not fixed, as two facts that must both hold:

- `enqueueWaveSync` has **no JavaScript caller anywhere in `src/`** — nothing in
  the shipped product creates a `sync` task through it today;
- Rule 2 at `:845` refuses a `sync` candidate while **any** task occupies a slot,
  so a barrier cannot start alongside the very work it would be racing.

Record it as a **precondition with an expiry**: if either fact stops being true —
a caller for `enqueueWaveSync` appears, or Rule 2 is relaxed — the hazard becomes
live and `depsSatisfied` must distinguish a confirmed-dead orphan from an age-only
one for `sync` candidates. State plainly that this was a decision NOT to fix, made
with the hazard understood, and not an oversight.

**Decision 6 — this plan and the actions-layer sibling are ruled on together.**
Record that `plans/review/00003-r2a-scheduler-lifecycle-honesty.md` and
`plans/review/00004-r2b-actions-drain-and-shipgate.md` are to be ruled on as **one
gate decision**, and why: 00004 declares `depends_on: 00003-r2a-scheduler-lifecycle-honesty`
in its own frontmatter, its `cancelTask` two-phase behaviour is meaningless without
this plan's `cancelling` status, and its own decision 5 records that it rewrote a
test to match this plan's hand-off. Approving one without the other would put a
half-installed lifecycle in the product. **This slice records the coupling; it does
not act on it.**

#### Change 2 — add the missing Step 16 report

Append a new section, `## Step 16 FINAL-REVIEW report`, immediately after the
execution plan and before the decision record, with four subsections:

- **Files changed.** The four files this plan declared (`src/lib/task-registry.js`,
  `src/lib/task-reconcile.js`, `tests/task-registry.test.js`,
  `tests/task-reconcile.test.js`), each with what actually changed in it,
  reconstructed from the diff on disk (`git log --follow` / `git show` for the
  landing commit, or the working tree if it has not been committed).
- **Tests.** The test cases that exist for each of the five implementation items,
  named by their `it(...)` titles as they appear in the two test files today, plus
  an explicit list of any item from the plan's own Test Plan (lines 69-80) for
  which **no** test can be found. An item with no test is reported as missing, not
  quietly omitted.
- **Red evidence.** See decision 2 below — this is the one item that may have to
  be reported as unavailable, and if so it is reported as unavailable in those
  words.
- **Decisions.** A pointer to the decision record written by Change 1, not a
  duplicate of it.

---

### Wiring — the live call sites

This slice writes documentation into an existing plan file. There is no new code,
no new export, and therefore no call site. The written record is read by the human
at Gate 3 and by the gate critique that generates this plan's questions — both of
which read the plan body directly, which is why the record has to be IN the plan
and not in a report file beside it.

## Test Plan

There is no automated test, and this section says so plainly rather than inventing
one. The artifact is prose in a plan file; its correctness condition is that every
claim it makes matches the code on disk, which is verified by Step 11's line-by-line
re-read, not by an assertion. Fabricating a test that greps the plan for the string
`Decisions Taken Under Ambiguity` would assert the placeholder is gone while
proving nothing about whether what replaced it is true — a false green in the exact
shape this project already fences.

Verification is therefore: Step 11 re-reads each cited source range and confirms
the decision text against it, and Step 14 runs the plan validator plus the full
gated suite to prove nothing in the repository regressed.

## Execution Plan (Steps 8-16)

### Step 8: TEST — no automated test is written; the reason is recorded in the Test Plan above and must be repeated verbatim in the Step 16 report. Instead, record the RED state as evidence: capture the current text of lines 82-95 of `plans/review/00003-r2a-scheduler-lifecycle-honesty.md` (the execution plan, the placeholder, and the absence of any report section) so the before-state is on the record.
### Step 9: PREPARE — read from disk, in full: `src/lib/task-registry.js:120-200` and `:760-930`; `src/lib/task-reconcile.js:80-135` and `:280-510`; `plans/review/00003-r2a-scheduler-lifecycle-honesty.md`; `plans/review/00004-r2b-actions-drain-and-shipgate.md`; `plans/review/00013-r3b-scheduler-enforced-not-advisory.md` (its decision record is the format to match). Then run `git log --oneline -- src/lib/task-registry.js src/lib/task-reconcile.js` and identify the landing commit for this plan's five items. Do not write a single decision from this plan's paraphrase — write each from the file.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `plans/review/00003-r2a-scheduler-lifecycle-honesty.md` — Change 1 (six decisions replacing `(Executor fills in.)`) and Change 2 (the `## Step 16 FINAL-REVIEW report` section with its four subsections).
### Step 11: REVIEW — for every line-number citation written into the plan, open the file and confirm the cited lines say what the decision claims. Correct any citation that has drifted. Confirm the two facts in decision 5 by running them: `grep -rn "enqueueWaveSync" src/` must show no JavaScript call site, and `src/lib/task-registry.js:845` must still contain Rule 2's refusal. If either is false, the decision text must say so — a precondition that is already expired is the most important thing this record could contain.
### Step 12: OPTIMIZE — remove every sentence that restates another. The decision record is read at a gate by a human under time pressure; length is not thoroughness. No decision may be padded to match the length of another.
### Step 13: SECURE — this slice writes only inside `plans/`. It must not copy any secret, token, absolute home-directory path, or environment value into the plan text; source citations are repository-relative paths and line numbers only. It stamps no `approved_by` marker and moves no file — confirm both by diff.
### Step 14: VERIFY — `node src/hooks/validate-plan-steps.js` and the plan validator over the edited file, then the full gated run `npm test`. Both must be clean; this slice changes no source, so any failure is pre-existing and must be reported as such rather than absorbed. No git operations.
### Step 15: DOCUMENT — the artifact IS documentation; the work of this step is to confirm the two added sections use the heading text the rest of the repository uses (`## Decisions Taken Under Ambiguity`, numbered decisions) so the gate critique and any future reader find them where they expect them.
### Step 16: FINAL-REVIEW — report the one file changed, the absence of tests with its stated reason, the before-state captured at Step 8, the outcome of the two Step 11 fact checks, and every decision taken under ambiguity below.

## Decisions Taken Under Ambiguity

1. **The record is written INTO the plan, not into a separate report file.** The
   plan's own Step 16 says "report"; the reviewer, the Gate 3 critique and the
   question generator all read the plan body. A sibling report file would be a
   document with no reader — the same defect class this wave is fixing.
2. **Red evidence that was never recorded is reported as unavailable, never
   reconstructed.** The executor's Step 8 red output does not exist anywhere on
   disk; it lived in a session transcript. Re-running the tests today produces
   GREEN output against the landed implementation, which is not red evidence and
   must never be presented as it. The report will therefore say, in these words,
   that the red evidence was not recorded by the executor and cannot be
   reconstructed after the fact, and will offer the current green run as what it
   is — evidence the tests pass now, not evidence they failed first. Writing a
   plausible-looking red transcript would be fabrication, which is the one
   unforgivable failure in this repository's operating rules.
3. **Six decisions, not four.** The four named as load-bearing are decisions 1-4.
   Decision 5 (the recorded precondition) and decision 6 (the joint ruling) were
   both directed as content for this record and both change what a reviewer should
   do, so they are numbered decisions rather than footnotes.
4. **Decision 5 is written with an explicit expiry condition.** A precondition
   recorded as a flat statement ("this is safe because nothing calls it") rots the
   moment someone writes the caller. Naming the two facts that make it safe, and
   stating what must change if either fails, turns a note into a check a future
   reader can actually run — which Step 11 then runs.
5. **The plan's stage is not touched.** The file stays in `plans/review/`. Filling
   in a decision record does not cross Gate 3, and this slice explicitly stamps no
   approval marker. The gate ruling — including whether it is taken jointly with
   `plans/review/00004-r2b-actions-drain-and-shipgate.md` — is the human's, and
   decision 6 only records the coupling for that human to act on.
6. **Where a citation and the code disagree, the code wins and the disagreement is
   written down.** If Step 11 finds a cited range no longer says what this plan
   claims, the executor corrects the decision text and records the drift in the
   Step 16 report, rather than silently adjusting the line number to whatever now
   matches.
