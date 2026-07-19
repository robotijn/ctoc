---
approved_by: human
approved_at: 2026-07-18T20:44:41.829Z
gate_crossed: implementation → todo
kickback_counts:
  by_step:
    '8': 1
    '14': 1
  total: 2
---

---
title: "The concurrent-edit guard stops failing silently — a fault drops the candidates instead of promoting them"
type: implementation
parent_plan: ctoc-background-engine-rebuild
depends_on: none
priority: CRITICAL
program: ctoc-repair-loop
iron_loop: true
files:
  - "src/lib/task-reconcile.js"
  - "tests/task-reconcile-quarantine-fault.test.js"
---

# The concurrent-edit guard stops failing silently

`src/lib/task-reconcile.js:651-653`, verbatim on disk today:

```js
  } catch {
    /* the quarantine is defensive; a fault must never break the render (promote stands) */
  }
```

An empty catch whose entire body is a comment. The block it guards
(`:620-650`) is the **concurrent-edit guard**: it reserves the files of every task
orphaned on age alone — a task whose agent was never confirmed dead and may still
be editing those files — and removes any queued task that would collide with them
from the `promote` list.

If anything inside that block throws — the glob overlap test at `:639`
(`touchesOverlap`, the only regex-constructing path in the file), a malformed
`touches` array, an out-of-memory glob expansion — control lands in that catch,
nothing is recorded, and the comment's own promise is executed: *promote stands*.
The unfiltered promote list is returned. The menu driver then dispatches those
tasks. Two agents end up editing one file, which is the exact outcome the guard
exists to prevent, and the only trace anywhere is that a comment said it was fine.

The comment inverts the safety argument. "Defensive" code that fails **open**
defends nothing. And the loud contrast is already present in the same function:
`:599` records `report.saveFailed = msgOf(err)` when the persistence fails, so the
caller learns the write did not happen. The quarantine failure gets no such
courtesy.

This slice makes the guard fail **safe** and fail **loud**: the fault is recorded
on the report, and the candidates that could not be checked are dropped rather
than promoted.

## Implementation Details

### Dependency graph

```
src/lib/task-reconcile.js  --already-requires-->  ./plan-coverage (touchesOverlap)
src/lib/task-reconcile.js  --already-requires-->  ./task-registry, ./safe-fs, path
tests/task-reconcile-quarantine-fault.test.js  --drives-->  task-reconcile.reconcileState
tests/task-reconcile-quarantine-fault.test.js  --injects-->  a throwing touchesOverlap via the require cache
```

No new module and no new import.

---

### File: `src/lib/task-reconcile.js`
**Action:** MODIFY
**Purpose:** Make the concurrent-edit guard record its faults and drop what it could not check.
**Change type:** modify-existing — the `reconcileState` quarantine block (`:620-653`) and the `ReconcileReport` typedef

#### Change 1 — a new report field

Add to the `ReconcileReport` typedef (currently `:133-165`), beside the existing
`saveFailed` entry it deliberately mirrors:

```
 * @property {null|{phase:string, error:string, dropped:string[]}} [quarantineFaulted]
 *   set by reconcileState when the concurrent-edit guard THREW. `phase` is
 *   'collect' (building the reserved file set) or 'filter' (testing one candidate
 *   against it). `dropped` are the promote candidates removed BECAUSE the check
 *   could not be completed — a guard that cannot decide must not let the candidate
 *   through. Mirrors `saveFailed`: the caller learns the check did not happen.
```

#### Change 2 — the collect phase gets its own guard

Replace the single `try { … } catch {}` spanning `:621-653` with two guarded
phases. Phase one, building the reserved touch set:

```js
report.quarantined = [];
/** Files reserved by an age-only orphan — see the persistent-quarantine note below. */
const quarantinedTouches = [];
let collectFaulted = null;
try {
  for (const t of reconciled.tasks || []) {
    if (t && t.status === 'orphaned' && t.result &&
        t.result.orphanReason === 'staleness' && Array.isArray(t.touches)) {
      quarantinedTouches.push(...t.touches);
    }
  }
} catch (err) {
  collectFaulted = msgOf(err);
}
```

When `collectFaulted` is set, the reserved set is unknown — which means **every**
editing candidate is potentially colliding with a live agent's files. Fail safe:
drop every candidate that declares at least one touched file, and keep only
candidates that touch nothing (a task with an empty `touches` set can never
conflict under Rule 4, so keeping it is not a guess — it is the same fast path
`evaluateConcurrency` already takes at `task-registry.js:858-859`).

```js
if (collectFaulted !== null) {
  const dropped = [];
  promote = promote.filter((cand) => {
    const touches = Array.isArray(cand.touches) ? cand.touches : [];
    if (touches.length === 0) return true;   // cannot conflict — Rule 4 fast path
    dropped.push(cand.id);
    report.quarantined.push({
      id: cand.id,
      reason: 'quarantine-fault',
      summary: 'held — the concurrent-edit guard could not determine which files are ' +
        'reserved by an age-only orphan, so promoting a file-editing task would risk ' +
        'two agents on one file'
    });
    return false;
  });
  report.quarantineFaulted = { phase: 'collect', error: collectFaulted, dropped };
}
```

#### Change 3 — the filter phase records per candidate and drops the affected one

When the collect phase succeeded and there is anything to reserve, the overlap
test runs per candidate, each inside its own guard, so one candidate's fault
drops **that** candidate and never silently voids the whole guard:

```js
else if (quarantinedTouches.length > 0) {
  const faults = [];
  const dropped = [];
  promote = promote.filter((cand) => {
    const touches = Array.isArray(cand.touches) ? cand.touches : [];
    if (touches.length === 0) return true;
    let overlaps;
    try {
      overlaps = touchesOverlap(touches, quarantinedTouches);
    } catch (err) {
      // FAIL SAFE. An overlap test that threw decided NOTHING; treating "no answer"
      // as "no conflict" is what let this guard fail open. Drop the candidate and
      // record why — one pass of delay costs a wave slot, two agents on one file
      // costs the file.
      faults.push(msgOf(err));
      dropped.push(cand.id);
      report.quarantined.push({
        id: cand.id,
        reason: 'quarantine-fault',
        summary: 'held — the file-overlap test threw, so this candidate could not be ' +
          'cleared against the files reserved by an age-only orphan'
      });
      return false;
    }
    if (overlaps) {
      report.quarantined.push({
        id: cand.id,
        reason: 'staleness-orphan-quarantine',
        summary: 'held one pass — its files were freed by an AGE-ONLY orphaning ' +
          '(the previous holder was never confirmed dead and may still be editing them)'
      });
      return false;
    }
    return true;
  });
  if (faults.length > 0) {
    report.quarantineFaulted = { phase: 'filter', error: faults[0], dropped };
  }
}
```

The existing `staleness-orphan-quarantine` entry text is preserved verbatim, so no
existing assertion on that string regresses.

#### Invariants this change must preserve

- `reconcileState` still never throws (the render must not brick).
- On the no-fault path, the returned `promote` and `report.quarantined` are
  byte-identical to today's — the fault handling is additive.
- `report.quarantineFaulted` is **absent** (not `null`) when no fault occurred, so
  a reader can use plain truthiness and a clean project's report shape is unchanged.
- `msgOf` (already defined at `:659`) is the single message extractor; no `String(err)`
  written inline.

---

### Wiring — the live call sites

| new code | live call site | root |
|---|---|---|
| collect-phase fault handling | `reconcileState`, same function, this slice | `/ctoc:menu` → `menu-screens.buildDashboardTable:232` |
| per-candidate filter fault handling | `reconcileState`, same function, this slice | `/ctoc:menu` → `menu-screens.buildDashboardTable:232` |
| `report.quarantineFaulted` | written here; its dashboard reader is `plans/implementation/00075-wedge-reports-get-a-reader.md`'s successor work and is NOT claimed by this slice | — |

`reconcileState` is called on every dashboard render, so the corrected guard is
live the moment it lands. See decision 5 below on the `quarantineFaulted` reader.

## Test Plan

### Tests: `tests/task-reconcile-quarantine-fault.test.js`
**Action:** CREATE
**Framework:** `node:test` (`describe` / `it` / `before` / `after` / `node:assert`)

This file exists separately from `tests/task-reconcile.test.js` because it performs
require-cache surgery to inject the fault, and the node test runner gives each test
file its own process — so the injection cannot leak into any other suite.

**The fault-injection seam.** `task-reconcile.js` destructures `touchesOverlap`
from `./plan-coverage` at module load (`:78`), so the stub must be installed
*before* `task-reconcile` is required:

```js
const path = require('path');
const pcPath = require.resolve('../src/lib/plan-coverage');
const trPath = require.resolve('../src/lib/task-reconcile');
require(pcPath);
const planCoverage = require.cache[pcPath].exports;
const realOverlap = planCoverage.touchesOverlap;
// installed in before(), restored in after(); task-reconcile is deleted from the
// cache and re-required so its destructured binding picks up the stub.
```

`touchesOverlap` is an external collaborator of this module, not its core logic —
stubbing it is a legitimate fault injection, and the real implementation is
restored in `after()` with `delete require.cache[trPath]` so nothing leaks.

| # | Case | Setup | Assertion |
|---|---|---|---|
| 1 | **the fault is recorded** | one `orphaned` task with `result.orphanReason:'staleness'` and `touches:['src/a.js']`; one queued task with `touches:['src/a.js']`; `touchesOverlap` stubbed to throw `Error('injected overlap fault')` | `report.quarantineFaulted` is an object; `.phase === 'filter'`; `.error` contains `injected overlap fault`; `.dropped` contains the queued task's id |
| 2 | **the candidate is dropped, not promoted** | same setup | `promote` does NOT contain the queued task id — this is the whole point: today it IS promoted |
| 3 | **the drop is surfaced, never silent** | same setup | `report.quarantined` contains an entry for that id with `reason === 'quarantine-fault'` and a `summary` naming the failed check |
| 4 | **a non-editing candidate survives a fault** | same orphan; a queued candidate with `touches: []` | that candidate IS still in `promote` (it cannot conflict), and is NOT in `report.quarantined` |
| 5 | **reconcileState still does not throw** | same setup | the call returns normally; `report` and `promote` are both present |
| 6 | **the collect phase fault drops every editing candidate** | force a collect-phase throw by making `reconciled.tasks` iteration fail — seed the registry so a task's `touches` is a getter that throws is impossible through disk, so this case is driven by stubbing `taskRegistry.nextRunnable` is NOT used; instead assert the collect branch through a registry whose orphan `touches` array is replaced post-load — see decision 3 | `report.quarantineFaulted.phase === 'collect'`; every candidate with a non-empty `touches` is absent from `promote`; each is in `report.quarantined` with `reason:'quarantine-fault'` |
| 7 | **no fault ⇒ byte-identical behaviour** | real `touchesOverlap` restored; same registry as case 1 | `report.quarantineFaulted` is `undefined`; `report.quarantined` has exactly one entry with `reason === 'staleness-orphan-quarantine'` and the original summary string; `promote` excludes the conflicting candidate |
| 8 | **a fault does not disturb the rest of the report** | case 1 setup | `report.orphaned`, `report.stalenessOrphaned`, `report.unsatisfiable`, `report.swept` all hold the same values as the no-fault run |

Seeding is on-disk and cross-platform: `fs.promises.mkdtemp` under `os.tmpdir()`,
`path.join(root, '.ctoc', 'state', 'tasks.json')`, torn down with
`fs.promises.rm(root, { recursive: true, force: true })`.

Coverage targets: both fault phases, the non-editing fast path in each, the
no-fault path, and the multi-candidate case where one candidate throws and another
does not.

## Execution Plan (Steps 8-16)

### Step 8: TEST — write `tests/task-reconcile-quarantine-fault.test.js` in full, run ONLY that file, and record the red output verbatim. Cases 1, 2, 3 and 6 MUST be red before any source edit — in particular case 2 must fail with the candidate present in `promote`, which is the shipped defect.
- [x] COMPLETE — test file written and run BEFORE any source edit: tests 9 / pass 4 / fail 5 / skipped 0. Case 2 was red with the candidate still present in `promote` (actual: false, expected: true), reproducing the shipped defect.
### Step 9: PREPARE — re-read `src/lib/task-reconcile.js` in full from disk (the header at 1-69 states the invariants this change must not break) and `src/lib/plan-coverage.js`'s `touchesOverlap` signature and throw conditions from disk. Confirm `msgOf` is in scope at the edit site.
- [x] COMPLETE — `src/lib/task-reconcile.js` re-read in full from disk; `plan-coverage.touchesOverlap` read (total for string input, already conservative on a pathological glob); `msgOf` confirmed in scope as a hoisted declaration.
### Step 10: IMPLEMENT — one step, files as sub-items.
  - `src/lib/task-reconcile.js` — Changes 1, 2 and 3 (the `quarantineFaulted` typedef entry; the guarded collect phase with its drop-every-editing-candidate fallback; the per-candidate guarded overlap test).
  - `tests/task-reconcile-quarantine-fault.test.js` — created at Step 8; adjust only if a real contract detail differs from this plan, and record the difference below.
- [x] COMPLETE — Changes 1, 2 and 3 applied, plus decision 7 (a non-array `promote` normalized at the scheduler boundary).
### Step 11: REVIEW — diff against this plan. Confirm there is no remaining empty catch in the file (`grep -n "catch {" src/lib/task-reconcile.js` and justify each survivor in the Step 16 report — `sweepTempArtifacts`' per-file catch at `:540` is a legitimate best-effort survivor and must be named as such). Confirm the `staleness-orphan-quarantine` summary string is unchanged. Confirm the module header's quarantine paragraph (`:52-55`) now states the fail-safe behaviour.
- [x] COMPLETE — every surviving catch justified (see the Execution Record); no catch whose body is only a comment remains on a safety path; the `staleness-orphan-quarantine` summary string is unchanged.
### Step 12: OPTIMIZE — the per-candidate `try` adds no allocation on the success path; do not hoist it into a batched pre-check, which would reintroduce the all-or-nothing failure mode this slice removes. No caching of overlap results.
- [x] COMPLETE — no allocation added on the success path; the per-candidate guard was NOT hoisted into a batched pre-check; no overlap-result caching.
### Step 13: SECURE — no new regex literal in this file (the header at `:65-68` records that the only regex path is behind `plan-coverage.touchesOverlap`, and that stays true). Filesystem access stays exclusively through `safe-fs`. The recorded `error` string is a message only — never an error object, never a stack — so no internal path leaks into a rendered report.
- [x] COMPLETE — no new regex literal, no filesystem access, and the recorded error is a message string via `msgOf` only (never an object or stack).
### Step 14: VERIFY — `node --test tests/task-reconcile-quarantine-fault.test.js tests/task-reconcile.test.js tests/task-reconcile-coverage.test.js` green, then the full gated run `npm test` (suite + coverage floor + the zero-skip gate). Lint both changed files. No git operations.
- [x] COMPLETE — the three reconcile files ran green (tests 60 / pass 60 / fail 0), then the gated `npm test`: tests 9892 / pass 9892 / fail 0, coverage 99.03% against the 99% floor, gate PASS. Lint clean on both changed files.
### Step 15: DOCUMENT — JavaScript doc on the `quarantineFaulted` field; rewrite the two comment lines at `:651-653` so the surviving prose states what the code now does (record the fault, drop what could not be checked) instead of promising that promote stands. Update the header paragraph at `:52-55` to say the quarantine fails safe.
- [x] COMPLETE — `quarantineFaulted` documented beside `saveFailed`; the module header now states the fail-safe behaviour; the old "promote stands" comment replaced with prose describing what the code does. No CHANGELOG exists in this repository.
### Step 16: FINAL-REVIEW — report the files changed, the tests added, the verbatim red evidence from Step 8, the verbatim green evidence from Step 14, every remaining catch block in the file with its justification, and every decision taken under ambiguity.
- [x] COMPLETE — files changed, red evidence, gated-run numbers, catch justifications and decisions 7-10 are all recorded in this plan.

## Decisions Taken Under Ambiguity

1. **A candidate with an empty `touches` set survives a fault.** Dropping the
   entire promote list on any fault would be maximally safe but would stall
   read-only work for a reason unrelated to it. Rule 4 in
   `task-registry.js:858-859` already establishes that an empty touch set cannot
   conflict with anything, so keeping such a candidate is a proven fact about the
   scheduler, not a guess.
2. **Two fault phases, not one.** A throw while *building* the reserved set means
   the guard knows nothing and must drop every editing candidate. A throw while
   *testing one candidate* means the guard knows everything except that candidate,
   so dropping only it preserves the wave's throughput. Collapsing both into one
   handler would either over-drop or under-drop.
3. **The collect-phase test (case 6) is driven by mutating the loaded registry
   value, not by a second stub.** The loop at the collect phase reads plain
   properties off already-normalized task objects, so a disk seed alone cannot make
   it throw. The test therefore stubs `taskRegistry.load` through the same require
   cache seam to return a value whose `tasks` is an array containing one entry
   whose `touches` is defined with a throwing getter. If, at Step 9, that seam
   turns out to be unavailable because `reconcileState` reaches the registry
   through `withRegistry` rather than `load`, stub `withRegistry` instead and
   record the substitution here — do NOT delete the case, because an untested
   fallback branch is exactly the class of code this slice exists to remove.
4. **The recorded field is a structured object, not a bare string.** `saveFailed`
   is a bare message string, and this change could have mirrored it exactly. It
   does not, because the fault has to answer three questions — which phase, what
   error, which candidates paid for it — and a reader that must parse a sentence
   to find the dropped ids is the beginning of the next false-green defect.
5. **`report.quarantineFaulted` gets no dashboard reader in this slice.** The
   standing rule is that a computed field with no reader is a defect — that is the
   entire premise of `plans/implementation/00075-wedge-reports-get-a-reader.md`.
   The honest position is that this slice writes a field whose reader is not yet
   built, and it is recorded here as an open item rather than quietly shipped: the
   dropped candidates ARE already visible through `report.quarantined`, which
   00075's successor rendering covers, so the human is not blind — but the fault
   itself is not yet on screen. This is named for the reviewer to rule on, not
   scheduled by the executor.
6. **The scheduler is not touched.** The fix is entirely inside `reconcileState`'s
   promote projection. `canRun` and `nextRunnable` remain pure and unaware of
   orphan reasons, per the standing decision recorded in
   `plans/implementation/00078-scheduler-lifecycle-decision-record.md`.

Decisions 7–10 were taken by the executor DURING Steps 8–16 and are recorded here
as required:

7. **A non-array `promote` is normalized at the scheduler boundary, not inside the
   quarantine.** `tests/task-reconcile-coverage.test.js` pins that a `nextRunnable`
   returning a non-array (`{}`) must not break the render. Today that is covered
   only *accidentally*, by the empty catch this slice deletes — `promote.filter`
   throws inside it. Splitting the guard into per-phase handlers therefore made that
   existing test fail, correctly: the code was wrong, not the test. The fix is at the
   fault's own boundary — the existing `nextRunnable` catch already degrades to `[]`,
   so a non-array return now degrades the same way (`if (!Array.isArray(promote))
   promote = []`). Fail safe: a scheduler that decided nothing promotes nothing. This
   also makes `reconcileState` total below that line, which is what lets the phase
   guards be narrow instead of a blanket net. No existing assertion was weakened.
8. **No blanket last-resort catch around the two phases.** Adding one would restore
   a single all-or-nothing handler — the shape this slice exists to remove — and
   would guard only against a hostile candidate object, which `nextRunnable` cannot
   produce over a registry normalized by `load`/`addTask`. The two realistic throw
   sources named in the plan each have their own guard.
9. **Two ratchets outside the declared `files:` were updated, because this change
   moved them.** `.ctoc/false-green-baseline.json`: removing the empty catch removed
   the live false-green site `src/lib/task-reconcile.js:silent-catch:reconcileState`,
   so `maxFindings` went 220 → 219 and the key was deleted — the ratchet fails loudly
   on *unclaimed* progress and may only shrink. `CLAUDE.md`: the documented test-file
   count went 420 → 421 because this slice adds a test file, and `tests/doc-counts.test.js`
   verifies that count against disk. Both are bookkeeping the gate demands as a direct
   consequence of the change; neither is a threshold lowered to make a run pass.
10. **The collect-phase fault is injected at the `withRegistry` seam**, exactly as
   decision 3 permits: `reconcileState` reaches the registry through `withRegistry`,
   not `load`. The hostile value is a genuine `Array` (so `Array.isArray` passes)
   whose iterator throws — the precise shape the reserved-set spread cannot survive.
   `task-registry` is required *before* the `touchesOverlap` stub is installed, so the
   scheduler's own Rule 4 keeps the real overlap test and only the module under test
   sees the fault.

## Execution Record (Steps 8–16)

- [x] **Step 8 TEST (TDD red)** — `tests/task-reconcile-quarantine-fault.test.js`
  created and run BEFORE any source edit: `tests 9 / pass 4 / fail 5 / skipped 0`.
  The load-bearing red was case 2, failing with the candidate still in `promote`
  (`actual: false, expected: true` on "a candidate the guard could not clear must
  NOT be promoted") — the shipped defect, reproduced.
- [x] **Step 9 PREPARE** — `src/lib/task-reconcile.js` re-read in full from disk,
  `plan-coverage.touchesOverlap` read (it is total for string input and already
  fails CONSERVATIVELY to "overlap" on a pathological glob), `msgOf` confirmed in
  scope at the edit site as a hoisted function declaration.
- [x] **Step 10 IMPLEMENT** — Changes 1, 2 and 3 plus decision 7's boundary
  normalization.
- [x] **Step 11 REVIEW** — every surviving `catch` in the file justified: the two
  in `sweepTempArtifacts` (directory-absent → return, and the per-file best-effort
  the plan names as a legitimate survivor), the save-failure catch that records
  `report.saveFailed`, the `tempSwept` belt-and-suspenders that assigns `[]`, the
  `nextRunnable` catch that degrades to an empty promote set, and the two new
  handlers that RECORD their fault. No catch whose body is only a comment remains
  on a safety path. The `staleness-orphan-quarantine` summary string is unchanged.
- [x] **Step 12 OPTIMIZE** — the per-candidate `try` allocates nothing on the
  success path; not hoisted into a batched pre-check (that would reintroduce the
  all-or-nothing failure mode); no overlap-result caching.
- [x] **Step 13 SECURE** — no new regex literal, no filesystem access, and the
  recorded `error` is a message string via `msgOf` only — never an error object or
  a stack, so no internal path reaches a rendered report.
- [x] **Step 14 VERIFY** — `npm test` (the gated entry point): `tests 9892 /
  pass 9892 / fail 0 / skipped 0`, `coverage 99.03% (threshold 99%)`, `PASS`.
  Lint clean on both changed files. The floor was not touched.
- [x] **Step 15 DOCUMENT** — `quarantineFaulted` typedef added beside `saveFailed`;
  the module header's quarantine paragraph now states the fail-safe behaviour; the
  old "promote stands" comment is replaced by prose describing what the code does.
  No CHANGELOG exists in this repository.
- [x] **Step 16 FINAL-REVIEW** — complete; Gate 3 is the human's.
